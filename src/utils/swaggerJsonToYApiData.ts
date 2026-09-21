import dayjs from 'dayjs';
import { Category, Interface } from '../types';
import { each, find } from './vtilsLite';
import { OpenAPIV2 as SwaggerType } from 'openapi-types';

let SwaggerData: { parameters?: any };
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
            schema: jsonContent.schema
          });
        } else {
          // Form-encoded bodies: expand the schema into individual formData
          // parameters so binary fields render as `file` and the request body
          // type becomes `form`. handleSwagger maps `in: 'formData'` params
          // to req_body_form, and `type: 'file'` is preserved for uploads.
          const formContent = content['multipart/form-data'] || content['x-www-form-urlencoded'];
          if (formContent && formContent.schema) {
            const formSchema = formContent.schema;
            const required = formSchema.required || [];
            const props = formSchema.properties || {};
            Object.keys(props).forEach(function (name) {
              const prop = props[name] || {};
              api.parameters.push({
                name: name,
                in: 'formData',
                description: prop.description || '',
                type: prop.format === 'binary' ? 'file' : prop.type || 'text',
                required: required.indexOf(name) > -1 ? '1' : '0'
              });
            });
          }
        }
      }
    });
  });

  return data;
}

async function parseOpenapi(
  res
): Promise<{ apis: Interface[]; cats: Category[]; basePath: string; swaggerData: SwaggerType.Document }> {
  const interfaceData = { apis: [], cats: [], basePath: '', swaggerData: {} };
  if (typeof res === 'string' && res) {
    try {
      res = JSON.parse(res);
    } catch (e) {
      console.error('json 解析出错', e.message);
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
        desc: tag.description
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
                desc: data.catname
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

  return interfaceData as { apis: Interface[]; cats: Category[]; basePath: string; swaggerData: SwaggerType.Document };
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
    } else if (data.consumes.indexOf('application/json') > -1) {
      api.req_body_type = 'json';
      api.req_body_is_json_schema = true;
    }
  }

  // Process the response body.
  api.res_body = handleResponse(data.responses);
  try {
    JSON.parse(api.res_body);
    api.res_body_type = 'json';
    api.res_body_is_json_schema = true;
  } catch (e) {
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
          parameters: SwaggerData.parameters
        });
      }
      const defaultParam = {
        name: param.name,
        desc: param.description,
        type: param.type || param.schema.type,
        required: param.required ? '1' : '0',
        example: ''
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

function handleResponse(api) {
  let res_body = '';
  if (!api || typeof api !== 'object') {
    return res_body;
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
  return res_body;
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
        desc: 'default'
      }
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
      up_time: currentTime
    } as Category;
  });
  const interfaces = yapiData.apis.map<Interface>((api, index) => ({
    ...api,
    _id: index + 1,
    project_id: 0,
    catid: cats.find(cat => cat.name === api.catname)?._id || -1,
    tag: api.tag || [],
    add_time: currentTime,
    up_time: currentTime
  }));

  return { interfaces };
}
