import dayjs from 'dayjs';
import {Category, Interface} from '../types';
import {each, find} from './vtilsLite';
import * as conso from './console';
import {OpenAPIV2 as SwaggerType} from 'openapi-types';

let SwaggerData: {parameters?: any};
let isOAS3;

function handlePath(path: string) {
  if (path === '/') return path;
  if (path.charAt(0) !== '/') {
    path = `/${path}`;
  }
  if (path.charAt(path.length - 1) === '/') {
    path = path.substr(0, path.length - 1);
  }
  return path;
}

function openapi3Format(data) {
  data.swagger = '2.0';
  each(data.paths, apis => {
    each(apis, api => {
      each(api.responses, res => {
        if (res.content && res.content['application/json'] && typeof res.content['application/json'] === 'object') {
          Object.assign(res, res.content['application/json']);
          delete res.content;
        }
        if (
          res.content &&
          res.content['application/hal+json'] &&
          typeof res.content['application/hal+json'] === 'object'
        ) {
          Object.assign(res, res.content['application/hal+json']);
          delete res.content;
        }
        if (res.content && res.content['*/*'] && typeof res.content['*/*'] === 'object') {
          Object.assign(res, res.content['*/*']);
          delete res.content;
        }
      });
      if (api.requestBody) {
        if (!api.parameters) api.parameters = [];
        const content = api.requestBody.content || {};
        // Prefer application/json: keep the swagger 2.0 single body-parameter
        // shape so the schema flows through handleBodyPamras as JSON schema.
        // The previous implementation only ever read `application/json` and
        // silently produced an empty schema for every other content type,
        // dropping form-encoded bodies entirely.
        const jsonContent = content['application/json'];
        if (jsonContent && jsonContent.schema) {
          api.parameters.push({
            type: 'object',
            name: 'body',
            in: 'body',
            schema: jsonContent.schema,
          });
        } else {
          // Form-encoded bodies: expand the schema into individual formData
          // parameters so binary fields render as `file` and the request body
          // type becomes `form`. handleSwagger maps `in: 'formData'` params
          // to req_body_form, and `type: 'file'` is preserved for uploads.
          const multipartContent = content['multipart/form-data'];
          const formContent = multipartContent || content['application/x-www-form-urlencoded'];
          if (formContent && formContent.schema) {
            const formSchema = formContent.schema;
            const required = formSchema.required || [];
            const props = formSchema.properties || {};
            Object.keys(props).forEach(function (name) {
              const prop = props[name] || {};
              // Binary arrays (`type: 'array', items: {format: 'binary'}`)
              // describe multi-file upload fields such as `files: File[]`.
              // Swagger 2.0 formData has no array-of-file concept, so the
              // parameter is emitted as `type: 'file'` with an isArray marker.
              const arrayItems = Array.isArray(prop.items) ? prop.items[0] : prop.items;
              const isFileArray = prop.type === 'array' && arrayItems && arrayItems.format === 'binary';
              const isFile = prop.format === 'binary' || isFileArray;
              const formParam: Record<string, any> = {
                name: name,
                in: 'formData',
                description: prop.description || '',
                // Non-file fields keep their declared type; Swagger 2.0
                // formData otherwise only supports primitives and 'file'.
                type: isFile ? 'file' : prop.type || 'text',
                // Keep OAS3 boolean semantics: the shared parameter loop
                // normalizes this to the yapi '1'/'0' string. A '0' string
                // here would be truthy and mark optional fields as required.
                required: required.indexOf(name) > -1,
              };
              if (isFileArray) formParam.isArray = true;
              if (Array.isArray(prop.enum) && prop.enum.length) formParam.enum = prop.enum;
              api.parameters.push(formParam);
            });
            // Carry dynamic upload fields (e.g. evidence_0, evidence_1, ...)
            // declared via additionalProperties; their names are derived at
            // runtime so they cannot be expanded into named formData params.
            if (formSchema.additionalProperties && typeof formSchema.additionalProperties === 'object') {
              api['x-form-additional-properties'] = formSchema.additionalProperties;
            }
            // OAS3 stores the media type in requestBody.content and has no
            // `consumes` keyword; synthesize it so handleSwagger sets
            // req_body_type = 'form' (and req_body_multipart accordingly).
            api.consumes = [multipartContent ? 'multipart/form-data' : 'application/x-www-form-urlencoded'];
          }
        }
      }
    });
  });

  return data;
}

async function parseOpenapi(
  res
): Promise<{apis: Interface[]; cats: Category[]; basePath: string; swaggerData: SwaggerType.Document}> {
  const interfaceData = {apis: [], cats: [], basePath: '', swaggerData: {}};
  if (typeof res === 'string' && res) {
    try {
      res = JSON.parse(res);
    } catch (e) {
      conso.error(`Failed to parse JSON: ${e.message}`);
    }
  }

  isOAS3 = res.openapi && String(res.openapi).startsWith('3.');
  if (isOAS3) {
    res = openapi3Format(res);
  }
  SwaggerData = res;
  interfaceData.swaggerData = SwaggerData;

  interfaceData.basePath = res.basePath || '';

  if (res.tags && Array.isArray(res.tags)) {
    res.tags.forEach(tag => {
      interfaceData.cats.push({
        name: tag.name,
        desc: tag.description,
      });
    });
  } else {
    res.tags = [];
  }

  each(res.paths, (apis, path) => {
    // parameters is common parameters, not a method
    delete apis.parameters;
    each(apis, (api, method) => {
      api.path = path;
      api.method = method;
      let data = null;
      try {
        data = handleSwagger(api, res.tags);
        if (data.catname) {
          if (!find(interfaceData.cats, item => item.name === data.catname)) {
            if (res.tags.length === 0) {
              interfaceData.cats.push({
                name: data.catname,
                desc: data.catname,
              });
            }
          }
        }
      } catch (err) {
        data = null;
      }
      if (data) {
        interfaceData.apis.push(data);
      }
    });
  });

  interfaceData.cats = interfaceData.cats.filter(catData => {
    const catName = catData.name;
    return find(interfaceData.apis, apiData => {
      return apiData.catname === catName;
    });
  });

  return interfaceData as {apis: Interface[]; cats: Category[]; basePath: string; swaggerData: SwaggerType.Document};
}

function handleSwagger(data, originTags = []) {
  const api: any = {};
  // Basic information.
  api.method = data.method.toUpperCase();
  api.title = data.summary || data.path;
  api.desc = data.description;
  api.catname = null;
  if (data.tags && Array.isArray(data.tags)) {
    api.tag = data.tags;
    for (let i = 0; i < data.tags.length; i++) {
      if (/v[0-9.]+/.test(data.tags[i])) {
        continue;
      }

      // If the root document has tags, use those as the category instead of
      // each individual interface's tag.
      if (
        originTags.length > 0 &&
        find(originTags, item => {
          return item.name === data.tags[i];
        })
      ) {
        api.catname = data.tags[i];
        break;
      }

      if (originTags.length === 0) {
        api.catname = data.tags[i];
        break;
      }
    }
  }

  api.path = handlePath(data.path);
  api.req_params = [];
  api.req_body_form = [];
  api.req_headers = [];
  api.req_query = [];
  api.req_body_type = 'raw';
  api.res_body_type = 'raw';

  if (data.produces && data.produces.indexOf('application/json') > -1) {
    api.res_body_type = 'json';
    api.res_body_is_json_schema = true;
  }

  if (data.consumes && Array.isArray(data.consumes)) {
    if (
      data.consumes.indexOf('application/x-www-form-urlencoded') > -1 ||
      data.consumes.indexOf('multipart/form-data') > -1
    ) {
      api.req_body_type = 'form';
      api.req_body_multipart = data.consumes.indexOf('multipart/form-data') > -1;
    } else if (data.consumes.indexOf('application/json') > -1) {
      api.req_body_type = 'json';
      api.req_body_is_json_schema = true;
    }
  }

  // Process the response body. Determine the type from whether a schema
  // was found, instead of probing the serialized string with JSON.parse
  // (which would misclassify a plain-text description that happens to be
  // valid JSON as a JSON schema).
  const {body: resBody, hasSchema} = handleResponse(data.responses);
  api.res_body = resBody;
  if (hasSchema) {
    api.res_body_type = 'json';
    api.res_body_is_json_schema = true;
  } else if (resBody) {
    api.res_body_type = 'raw';
  }
  // Process the request parameters.
  function simpleJsonPathParse(key, json) {
    if (!key || typeof key !== 'string' || key.indexOf('#/') !== 0 || key.length <= 2) {
      return null;
    }
    let keys = key.substr(2).split('/');
    keys = keys.filter(item => {
      return item;
    });
    for (let i = 0, l = keys.length; i < l; i++) {
      try {
        json = json[keys[i]];
      } catch (e) {
        json = '';
        break;
      }
    }
    return json;
  }

  if (data.parameters && Array.isArray(data.parameters)) {
    data.parameters.forEach(param => {
      if (param && typeof param === 'object' && param.$ref) {
        param = simpleJsonPathParse(param.$ref, {
          parameters: SwaggerData.parameters,
        });
      }
      const defaultParam: Record<string, any> = {
        name: param.name,
        desc: param.description,
        type: param.type || param.schema.type,
        required: param.required ? '1' : '0',
        example: '',
      };

      if (param.in) {
        switch (param.in) {
          case 'path':
            api.req_params.push(defaultParam);
            break;
          case 'query':
            api.req_query.push(defaultParam);
            break;
          case 'body':
            handleBodyPamras(param.schema, api);
            break;
          case 'formData':
            defaultParam.type = param.type === 'file' ? 'file' : 'text';
            // Preserve multi-file and enum markers produced by the OAS3
            // multipart schema expansion in openapi3Format.
            if (param.isArray === true) defaultParam.isArray = true;
            if (Array.isArray(param.enum) && param.enum.length) defaultParam.enum = param.enum;
            if (param.example) {
              defaultParam.example = param.example;
            }
            api.req_body_form.push(defaultParam);
            break;
          case 'header':
            api.req_headers.push(defaultParam);
            break;
          default:
            break;
        }
      } else {
        api.req_query.push(defaultParam);
      }
    });
  }

  // Dynamic multipart fields (schema `additionalProperties`), e.g.
  // evidence_0 / evidence_1 upload slots with runtime-derived names.
  if (data['x-form-additional-properties']) {
    api.req_body_additional = data['x-form-additional-properties'];
  }

  return api;
}

function handleBodyPamras(data, api) {
  api.req_body_other = JSON.stringify(data, null, 2);
  // `data` is a JSON Schema object, so the serialized string is always valid
  // JSON. The previous guard `isJson(api.req_body_other)` parsed a value that
  // had just been `JSON.stringify`'d from an object — it could never fail and
  // therefore never reported a real problem. Mark as JSON schema directly.
  api.req_body_type = 'json';
  api.req_body_is_json_schema = true;
}

function handleResponse(api): {body: string; hasSchema: boolean} {
  let res_body = '';
  let hasSchema = false;
  if (!api || typeof api !== 'object') {
    return {body: res_body, hasSchema};
  }
  const codes = Object.keys(api);
  let curCode;
  if (codes.length > 0) {
    if (codes.indexOf('200') > -1) {
      curCode = '200';
    } else curCode = codes[0];

    const res = api[curCode];
    if (res && typeof res === 'object') {
      if (res.schema) {
        res_body = JSON.stringify(res.schema, null, 2);
        hasSchema = true;
      } else if (res.description) {
        res_body = res.description;
      }
    } else if (typeof res === 'string') {
      res_body = res;
    } else {
      res_body = '';
    }
  } else {
    res_body = '';
  }
  return {body: res_body, hasSchema};
}

/**
 *
 * @param data
 * @description data is openapiV3 json
 * @returns
 */
export async function swaggerJsonToYApiData(data: any): Promise<{
  interfaces: Interface[];
}> {
  const yapiData = await parseOpenapi(data);

  // Fall back to a default category when the document has no categories.
  if (!yapiData.cats.length) {
    yapiData.cats = [
      {
        name: 'default',
        desc: 'default',
      },
    ] as Category[];
    yapiData.apis.forEach(api => {
      api.catname = 'default';
    });
  }

  const currentTime = dayjs().unix();

  const cats = yapiData.cats.map<Category>((cat, index) => {
    return {
      _id: index + 1,
      name: cat.name,
      desc: cat.desc,
      add_time: currentTime,
      up_time: currentTime,
    } as Category;
  });
  const interfaces = yapiData.apis.map<Interface>((api, index) => ({
    ...api,
    _id: index + 1,
    project_id: 0,
    catid: cats.find(cat => cat.name === api.catname)?._id || -1,
    tag: api.tag || [],
    add_time: currentTime,
    up_time: currentTime,
  }));

  return {interfaces};
}
