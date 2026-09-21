import JSON5 from 'json5';
import Mock from 'mockjs';
import path from 'path';
import toJsonSchema from 'to-json-schema';
import { castArray, forOwn, isArray, isEmpty, isObject } from 'vtils';
import { compile, Options } from 'json-schema-to-typescript';
import { Defined } from 'vtils/types';
import { FileData } from './helpers';
import { format as prettierFormat, type Options as PrettierOptions } from 'prettier';
import {
  Interface,
  PropDefinition,
  PropDefinitions,
  RequestBodyType,
  RequestFormItemType,
  Required,
  ResponseBodyType,
  Config
} from './types';
import { JSONSchema4, JSONSchema4TypeName } from 'json-schema';

/**
 * Uppercase the first character of a string, leaving the rest untouched.
 * Local replacement for lodash's `upperFirst`: lodash is not declared in
 * package.json dependencies (it was only available via dependency
 * hoisting), and the hoisted @types/lodash is incomplete, which broke
 * declaration generation on the TypeScript 5 toolchain.
 *
 * @param value input string
 * @returns string with its first character uppercased
 */
function upperFirst(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * 抛出错误。
 *
 * @param msg 错误信息
 */
export function throwError(...msg: string[]): never {
  /* istanbul ignore next */
  throw new Error(msg.join(''));
}

/**
 * 将路径统一为 unix 风格的路径。
 *
 * @param path 路径
 * @returns unix 风格的路径
 */
export function toUnixPath(path: string) {
  return path.replace(/[/\\]+/g, '/');
}

/**
 * 获得规范化的相对路径。
 *
 * @param from 来源路径
 * @param to 去向路径
 * @returns 相对路径
 */
export function getNormalizedRelativePath(from: string, to: string) {
  return toUnixPath(path.relative(path.dirname(from), to))
    .replace(/^(?=[^.])/, './')
    .replace(/\.(ts|js)x?$/i, '');
}

/**
 * 原地处理 JSONSchema。
 *
 * @param jsonSchema 待处理的 JSONSchema
 * @returns 处理后的 JSONSchema
 */
export function processJsonSchema<T extends JSONSchema4>(jsonSchema: T): T {
  if (!isObject(jsonSchema)) return jsonSchema;

  // 去除 title 和 id，防止 json-schema-to-typescript 提取它们作为接口名
  delete jsonSchema.title;
  delete jsonSchema.id;

  // 忽略数组长度限制
  delete jsonSchema.minItems;
  delete jsonSchema.maxItems;

  // 将 additionalProperties 设为 false
  // jsonSchema.additionalProperties = false;

  // 删除通过 swagger 导入时未剔除的 ref
  // delete jsonSchema.$ref;
  // delete jsonSchema.$$ref;

  // 删除 default，防止 json-schema-to-typescript 根据它推测类型
  delete jsonSchema.default;

  // Normalize OpenAPI 3.x `nullable: true` into JSON Schema `type: [..., 'null']`.
  // json-schema-to-typescript only understands the JSON Schema union-null form
  // (a `type` array containing 'null'); OpenAPI's `nullable` keyword is
  // silently ignored, which drops `| null` from generated request/response
  // types. This walker bridges that gap so nullable fields render as `T | null`.
  if (jsonSchema.nullable === true) {
    if (jsonSchema.type) {
      // Merge 'null' into the existing type(s) without duplicates.
      const types = castArray(jsonSchema.type).filter(t => t !== 'null') as JSONSchema4TypeName[];
      if (!types.includes('null')) types.push('null');
      jsonSchema.type = types.length === 1 ? types[0] : types;
    } else if (jsonSchema.enum && Array.isArray(jsonSchema.enum)) {
      // For enum schemas without a type, append a null literal so the
      // generated union includes `null`.
      if (!jsonSchema.enum.includes(null)) {
        jsonSchema.enum = [...jsonSchema.enum, null] as any;
      }
    }
    // Note: `$ref`/`allOf`/`oneOf`/`anyOf` + nullable combinations are not
    // normalized here because they would require restructuring the schema
    // (e.g. wrapping in anyOf). This is rare in practice; nullable scalars
    // cover the common case and are the root cause of the missing `| null`.
    delete jsonSchema.nullable;
  }

  // 处理类型名称为标准的 JSONSchema 类型名称
  if (jsonSchema.type) {
    const isMultiple = Array.isArray(jsonSchema.type);
    const types = castArray(jsonSchema.type).map(type => {
      // 所有类型转成小写，如：String -> string
      type = type.toLowerCase() as any;
      // 映射为标准的 JSONSchema 类型
      type =
        (
          {
            int: 'integer'
          } as Record<string, JSONSchema4TypeName>
        )[type] || type;
      return type;
    });
    jsonSchema.type = isMultiple ? types : types[0];
  }

  // Mock.toJSONSchema 产生的 properties 为数组，然而 JSONSchema4 的 properties 为对象
  if (isArray(jsonSchema.properties)) {
    // @ts-ignore
    jsonSchema.properties = (jsonSchema.properties as JSONSchema4[]).reduce<Defined<JSONSchema4['properties']>>(
      (props, js) => {
        props[js.name] = js;
        return props;
      },
      {}
    );
  }

  // 移除字段名称首尾空格
  if (jsonSchema.properties) {
    forOwn(jsonSchema.properties, (_, prop) => {
      const propDef = jsonSchema.properties![prop];
      delete jsonSchema.properties![prop];
      jsonSchema.properties![(prop as string).trim()] = propDef;
    });
    jsonSchema.required = jsonSchema.required && (jsonSchema.required as string[]).map(prop => prop.trim());
  }

  // 继续处理对象的子元素
  if (jsonSchema.properties) {
    forOwn(jsonSchema.properties, processJsonSchema);
  }

  // 继续处理数组的子元素
  if (jsonSchema.items) {
    castArray(jsonSchema.items).forEach(processJsonSchema);
  }

  // 处理 oneOf
  if (jsonSchema.oneOf) {
    jsonSchema.oneOf.forEach(processJsonSchema);
  }

  // 处理 anyOf
  if (jsonSchema.anyOf) {
    jsonSchema.anyOf.forEach(processJsonSchema);
  }

  // 处理 allOf
  if (jsonSchema.allOf) {
    jsonSchema.allOf.forEach(processJsonSchema);
  }

  return jsonSchema;
}

/**
 * 将 JSONSchema 字符串转为 JSONSchema 对象。
 *
 * @param str 要转换的 JSONSchema 字符串
 * @returns 转换后的 JSONSchema 对象
 */
export function jsonSchemaStringToJsonSchema(str: string): JSONSchema4 {
  return processJsonSchema(JSON.parse(str));
}

/**
 * 获得 JSON 数据的 JSONSchema 对象。
 *
 * @param json JSON 数据
 * @returns JSONSchema 对象
 */
export function jsonToJsonSchema(json: object): JSONSchema4 {
  const schema = toJsonSchema(json, {
    required: false,
    arrays: {
      mode: 'first'
    },
    objects: {
      additionalProperties: false
    },
    strings: {
      detectFormat: false
    },
    postProcessFnc: (type, schema, value) => {
      if (!schema.description && !!value && type !== 'object') {
        schema.description = JSON.stringify(value);
      }
      return schema;
    }
  });
  delete schema.description;
  return processJsonSchema(schema as any);
}

/**
 * 获得 mockjs 模板的 JSONSchema 对象。
 *
 * @param template mockjs 模板
 * @returns JSONSchema 对象
 */
export function mockjsTemplateToJsonSchema(template: object): JSONSchema4 {
  return processJsonSchema(Mock.toJSONSchema(template) as any);
}

/**
 * 获得属性定义列表的 JSONSchema 对象。
 *
 * @param propDefinitions 属性定义列表
 * @returns JSONSchema 对象
 */
export function propDefinitionsToJsonSchema(propDefinitions: PropDefinitions): JSONSchema4 {
  return processJsonSchema({
    type: 'object',
    required: propDefinitions.reduce<string[]>((res, prop) => {
      if (prop.required) {
        res.push(prop.name);
      }
      return res;
    }, []),
    properties: propDefinitions.reduce<Exclude<JSONSchema4['properties'], undefined>>((res, prop) => {
      res[prop.name] = {
        type: prop.type,
        description: prop.comment,
        ...(prop.type === ('file' as any) ? { tsType: FileData.name } : {})
      };
      return res;
    }, {})
  });
}

/**
 * 获取prettier配置
 * @returns
 */
export function getPrettier(): PrettierOptions {
  return {
    printWidth: 120,
    tabWidth: 2,
    singleQuote: true,
    semi: true,
    trailingComma: 'all',
    bracketSpacing: false,
    endOfLine: 'lf',
    parser: 'babel-ts'
  };
}

// 预处理函数，处理空enum和其他边界情况
export function preprocessSchema(schema: JSONSchema4): JSONSchema4 {
  if (!isObject(schema)) {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(preprocessSchema);
  }

  const processed = { ...schema };

  // 处理空enum
  if (processed.enum && Array.isArray(processed.enum) && processed.enum.length === 0) {
    delete processed.enum;
    // console.warn('Removed empty enum array from schema');
  }

  // Normalize OpenAPI 3.x `nullable: true` into the JSON Schema union-null
  // form (`type: [T, 'null']`) so json-schema-to-typescript emits `T | null`.
  // This is required because component schemas reach the compiler through
  // this preprocessor instead of `processJsonSchema`, and jstt silently
  // ignores the OpenAPI `nullable` keyword. Every node here is a fresh copy,
  // so the source document is never mutated.
  if (processed.nullable === true) {
    if (processed.type) {
      // Merge 'null' into the existing type(s) without duplicates.
      const typeList: string[] = castArray(processed.type).filter(typeName => typeName !== 'null');
      typeList.push('null');
      processed.type = (typeList.length === 1 ? typeList[0] : typeList) as any;
    } else if (Array.isArray(processed.enum)) {
      // For enum schemas without a type, append a null literal.
      if (!processed.enum.includes(null)) processed.enum = [...processed.enum, null];
    }
    delete processed.nullable;
  }

  // 递归处理所有属性
  for (const key in processed) {
    if (processed.hasOwnProperty(key)) {
      processed[key] = preprocessSchema(processed[key]);
    }
  }

  return processed;
}

/**
 * Map a JSON Schema property descriptor to a TypeScript type expression.
 * Used when constructing inline object types for merged path/query params
 * (see `rewriteRefs`), where `JSON.stringify` would incorrectly serialize
 * type names as string literals.
 */
function jsonSchemaTypeToTs(propSchema: any): string {
  if (!propSchema || typeof propSchema !== 'object') {
    return 'unknown';
  }
  // Prefer an explicit tsType marker (set for $ref resolutions) over the
  // raw JSON Schema type name.
  if (propSchema.tsType) {
    return propSchema.tsType;
  }
  // Enum schemas render as a union of string-literal types.
  if (propSchema.enum && Array.isArray(propSchema.enum) && propSchema.enum.length) {
    return propSchema.enum.map((v: any) => (v === null ? 'null' : `'${String(v).replace(/'/g, "\\'")}'`)).join(' | ');
  }
  switch (propSchema.type) {
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'string':
      return 'string';
    case 'null':
      return 'null';
    case 'array': {
      // Best-effort: derive the element type from items, fall back to any.
      const itemSchema = Array.isArray(propSchema.items) ? propSchema.items[0] : propSchema.items;
      const itemTs = itemSchema && (itemSchema.tsType || jsonSchemaTypeToTs(itemSchema));
      return itemTs ? `${itemTs}[]` : 'any[]';
    }
    case 'object':
    case undefined:
    default:
      return 'unknown';
  }
}

/**
 * 根据 JSONSchema 对象生产 TypeScript 类型定义。
 *
 * @param jsonSchema JSONSchema 对象
 * @param typeName 类型名称
 * @returns TypeScript 类型定义
 */
export async function jsonSchemaToTsCode(jsonSchema: JSONSchema4, typeName: string): Promise<string> {
  jsonSchema = preprocessSchema(jsonSchema);
  // 那么统一命名为大写开头，那么就可以避免compile导致的名称不一致
  typeName = upperFirst(typeName);
  if (isEmpty(jsonSchema)) {
    return `export interface ${typeName} {}`;
  }
  if (jsonSchema.__is_any__) {
    delete jsonSchema.__is_any__;
    return `export type ${typeName} = any`;
  }

  function rewriteRefs(obj: any) {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (key === '$ref' && typeof obj[key] === 'string') {
          let refValue = obj[key];
          // '#/components'是标准路径，但是仍然有些不标准的数据源为'#components'
          if (refValue.startsWith('#components')) {
            refValue = refValue.replace('#components', '#/components');
          }
          // 匹配指向 components.schemas 的引用
          if (refValue.startsWith('#/components/schemas/')) {
            const interfaceName = refValue.replace('#/components/schemas/', '');
            /**
             * /components/schemas下的文件会被我们生成 文件名 命名的 ts interface，
             * 这里使用tsType标记后，compiler会根据这个标记来生成对应的ts interface引用
             * 但是有个问题compile会把tsType，第一个字母变成大写，如果schemas下的文件名为小写开头，那么最终
             * 生成出来的引用interface的名称对不上，例如
             * interface user {}
             * interface ABC {
             *   user: User;
             * }
             * 那么统一命名为大写开头，那么就可以避免compile导致的名称不一致
             */
            obj['tsType'] = upperFirst(interfaceName);
            /**
             * 如果输入的对象除了$ref存在，并且还存在其他属性，那么需要用这些属性创建一个ts对象。常见的用例是，url中的/{id}路径参数
             * 输出：UpdateVideoCollectionDto & { id: 'string' }
             */
            if (obj.properties) {
              // Build an inline object type string manually instead of
              // JSON.stringify, which would serialize type names as string
              // literals (e.g. `{userId: "string"}` instead of `{userId: string}`).
              // Guard `obj.required` because it may be undefined for schemas
              // without a required array.
              const requiredArr: string[] = Array.isArray(obj.required) ? obj.required : [];
              const propParts: string[] = [];
              Object.keys(obj.properties).forEach(key => {
                const propSchema = obj.properties[key];
                const tsType = propSchema.tsType || jsonSchemaTypeToTs(propSchema);
                const optional = requiredArr.includes(key) ? '' : '?';
                propParts.push(`${key}${optional}: ${tsType}`);
              });
              obj['tsType'] += ` & { ${propParts.join('; ')} }`;
            }
            delete obj['$ref'];
          }
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          // 递归遍历对象
          rewriteRefs(obj[key]);
        }
      }
    }
  }

  rewriteRefs(jsonSchema);

  // 检测是否为数组类型，如果是，为数组元素类型添加Item后缀
  // if (jsonSchema.type === 'array' && jsonSchema.items) {
  //   // 为数组元素类型添加Item后缀
  //   const itemTypeName = `${typeName}Item`;
  //   // 如果items是对象，为其添加tsType属性
  //   if (typeof jsonSchema.items === 'object') {
  //     // (jsonSchema.items as any).tsType = itemTypeName;
  //     delete jsonSchema.items.$ref;
  //   }
  // }
  /**
   * json-schema-to-typescript 会转换 typeName，因此传入一个全大写的假 typeName，生成代码后再替换回真正的 typeName
   * 这样还能避免如下的问题，如果下面compile传入typeName，那么replies会被json-schema-to-typescript的generateName判断重复，从而被+1的修改名称
   * export interface WorkComment {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  work: Work;
  workId: string;
  userId: string;
  parent?: Email;
  parentId?: string;
  replies: WorkComment1[];
  user: User;
} */
  const fakeTypeName = 'THISISAFAKETYPENAME';

  const code = await compile(jsonSchema, fakeTypeName, {
    bannerComment: '',
    additionalProperties: false,
    declareExternallyReferenced: false
    // style: getPrettier(),
    // customName:(...rest) => {
    //   console.log(rest)
    //   if(rest[0].tsType==='WorkComment'){
    //     return 'WorkComment'+Math.random().toString()
    //   }
    //   return undefined
    // },
  });
  // Removed four hardcoded debug-if blocks (G-6): empty `if (typeName === ...)`
  // guards for ListFilePathsResDto / GetAwsS3FilesFileIdPathResponse /
  // PatchVideoCollectionsIdRequest / PatchPermissionsPermissionIdRequest.
  // They leaked upstream business type names into the published package and
  // only contained commented-out console.log calls. The `& string` TODO on
  // the last one is now resolved by the G-3 degenerate-body normalization.

  delete jsonSchema.id;
  return code.replace(fakeTypeName, typeName).trim();
}

export function getRequestDataJsonSchema(interfaceInfo: Interface): JSONSchema4 {
  let jsonSchema!: JSONSchema4;

  switch (interfaceInfo.req_body_type) {
    case RequestBodyType.form:
      jsonSchema = propDefinitionsToJsonSchema(
        interfaceInfo.req_body_form.map<PropDefinition>(item => ({
          name: item.name,
          required: item.required === Required.true,
          type: (item.type === RequestFormItemType.file ? 'file' : 'string') as any,
          comment: item.desc
        }))
      );
      break;
    case RequestBodyType.json:
      if (interfaceInfo.req_body_other) {
        jsonSchema = interfaceInfo.req_body_is_json_schema
          ? jsonSchemaStringToJsonSchema(interfaceInfo.req_body_other)
          : jsonToJsonSchema(JSON5.parse(interfaceInfo.req_body_other));
      }
      break;
    default:
      /* istanbul ignore next */
      break;
  }

  // Normalize a degenerate body schema (G-3): when Nest fails to reflect a
  // proper DTO schema (inline type / Prisma type / missing @ApiBody type),
  // the request body may resolve to a bare primitive such as `{type:'string'}`
  // or a non-object schema. Merging path/query params onto such a root
  // produces `{id: number} & string`. Coerce it to an object-less schema so
  // params attach cleanly; the upstream cause is surfaced as a warning (G-5).
  if (
    jsonSchema &&
    jsonSchema.type &&
    jsonSchema.type !== 'object' &&
    !jsonSchema.properties &&
    !jsonSchema.$ref &&
    !jsonSchema.oneOf &&
    !jsonSchema.anyOf &&
    !jsonSchema.allOf
  ) {
    delete jsonSchema.type;
    delete (jsonSchema as any).tsType;
  }

  if (isArray(interfaceInfo.req_query) && interfaceInfo.req_query.length) {
    const queryJsonSchema = propDefinitionsToJsonSchema(
      interfaceInfo.req_query.map<PropDefinition>(item => ({
        name: item.name,
        required: item.required === Required.true,
        type: item.type || 'any', // object最终解析出来为“{}”，导致声明问题，暂时去除
        comment: item.desc
      }))
    );
    /* istanbul ignore else */
    if (jsonSchema) {
      jsonSchema.properties = {
        ...jsonSchema.properties,
        ...queryJsonSchema.properties
      };
      jsonSchema.required = [
        ...((jsonSchema.required as string[]) || []),
        ...((queryJsonSchema.required as string[]) || [])
      ];
    } else {
      jsonSchema = queryJsonSchema;
    }
  }

  if (isArray(interfaceInfo.req_params) && interfaceInfo.req_params.length) {
    const paramsJsonSchema = propDefinitionsToJsonSchema(
      interfaceInfo.req_params.map<PropDefinition>(item => ({
        name: item.name,
        required: true,
        type: item.type || 'string',
        comment: item.desc
      }))
    );
    /* istanbul ignore else */
    if (jsonSchema) {
      jsonSchema.properties = {
        ...jsonSchema.properties,
        ...paramsJsonSchema.properties
      };
      jsonSchema.required = [
        ...((jsonSchema.required as string[]) || []),
        ...((paramsJsonSchema.required as string[]) || [])
      ];
    } else {
      jsonSchema = paramsJsonSchema;
    }
  }

  return jsonSchema;
}

export function getResponseDataJsonSchema(interfaceInfo: Interface): JSONSchema4 {
  let jsonSchema: JSONSchema4 = {};

  switch (interfaceInfo.res_body_type) {
    case ResponseBodyType.json:
      if (interfaceInfo.res_body) {
        jsonSchema = interfaceInfo.res_body_is_json_schema
          ? jsonSchemaStringToJsonSchema(interfaceInfo.res_body)
          : mockjsTemplateToJsonSchema(JSON5.parse(interfaceInfo.res_body));
      }
      break;
    default:
      jsonSchema = { __is_any__: true };
      break;
  }

  return jsonSchema;
}

export function sortByWeights<T extends { weights: number[] }>(list: T[]): T[] {
  list.sort((a, b) => {
    const x = a.weights.length > b.weights.length ? b : a;
    const minLen = Math.min(a.weights.length, b.weights.length);
    const maxLen = Math.max(a.weights.length, b.weights.length);
    x.weights.push(...new Array(maxLen - minLen).fill(0));
    const w = a.weights.reduce((w, _, i) => {
      if (w === 0) {
        w = a.weights[i] - b.weights[i];
      }
      return w;
    }, 0);
    return w;
  });
  return list;
}

/**
 * 格式化代码字符串
 * @param content
 * @param config
 * @returns
 * https://prettier.io/docs/en/options.html
 */
export async function formatContent(content: string): Promise<string> {
  // 从项目中获取prettier配置文件
  const config = getPrettier();
  // prettier 3 made `format` asynchronous; callers must await the result.
  const prettyOutputContent = await prettierFormat(content, config);

  return prettyOutputContent;
}

/**
 * 通用生成文件顶部注释
 * @returns
 */
export function topNotesContent(): string {
  return `
  /**
   * Created By open-api-typescript-request-generator
   */

  `;
}
