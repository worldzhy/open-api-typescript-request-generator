export * from 'json-schema';
import { JSONSchema4 } from 'json-schema';
import { OpenAPIV3 } from 'openapi-types';
import type { LiteralUnion, OmitStrict } from './utils/vtilsLite';
import { ParsedPath } from 'path';

export type requestFunctionTemplateType = (props: RequestFunctionTemplateProps, config?: SyntheticalConfig) => string;

/** Top dependency generation template function */
/** Generator parameters */
export type topImportTemplateType = () => string;

/** Project information */
export interface Project {
  /** ID */
  _id: number;
  /** Name */
  name: string;
  /** Description */
  desc: string;
  /** Base path */
  basepath: string;
  /** Tags */
  tag: string[];
  /** Environment configuration */
  env: Array<{
    /** Environment name */
    name: string;
    /** Environment domain */
    domain: string;
  }>;
  /** Project token */
  token?: string;
  /** Category list under the project */
  cat: Category[];
  components?: object[];
}

/** Interface definition */
export interface Interface {
  /** Interface ID */
  _id: number;
  /** Category information (implemented by YTT) */
  _category: OmitStrict<Category, 'list'>;
  /** Project information (implemented by YTT) */
  _project: Project;
  /** Interface name */
  title: string;
  /** Status */
  status: LiteralUnion<'done' | 'undone', string>;
  /** Interface remarks */
  markdown: string;
  /** Request path */
  path: string;
  /** Request method, HEAD and OPTIONS are handled like GET, others like POST */
  method: Method;
  /** Project ID */
  project_id: number;
  /** Category ID */
  catid: number;
  /** Tag list */
  tag: string[];
  /** Request headers */
  req_headers: Array<{
    /** Name */
    name: string;
    /** Value */
    value: string;
    /** Description */
    desc: string;
    /** Example */
    example: string;
    /** Required */
    required: Required;
  }>;
  /** Path parameters */
  req_params: Array<{
    /** Name */
    name: string;
    /** Description */
    desc: string;
    /** Example */
    example: string;
    /** Type (YApi-X) */
    type?: RequestParamType;
  }>;
  /** GET only: query string */
  req_query: Array<{
    /** Name */
    name: string;
    /** Description */
    desc: string;
    /** Example */
    example: string;
    /** Required */
    required: Required;
    /** Type (YApi-X) */
    type?: RequestQueryType;
  }>;
  /** POST only: request content type. No special handling needed for text, file, raw. */
  req_body_type: RequestBodyType;
  /** Whether it is json schema when `req_body_type = json` */
  req_body_is_json_schema: boolean;
  /** Request content when `req_body_type = form` */
  req_body_form: Array<{
    /** Name */
    name: string;
    /** Type */
    type: RequestFormItemType;
    /** Description */
    desc: string;
    /** Example */
    example: string;
    /** Required */
    required: Required;
  }>;
  /** Request content when `req_body_type = json` */
  req_body_other: string;
  /** Response data type */
  res_body_type: ResponseBodyType;
  /** Whether it is json schema when `res_body_type = json` */
  res_body_is_json_schema: boolean;
  /** Response data */
  res_body: string;
  /** Creation time (unix timestamp) */
  add_time: number;
  /** Update time (unix timestamp) */
  up_time: number;
  [key: string]: any;
}

/** Interface basic information */
export interface BaseInterfaceInfo {
  edit_uid: number;
  status: string;
  api_opened: boolean;
  tag: string[];
  _id: number;
  method: string;
  title: string;
  path: string;
  project_id: number;
  catid: number;
  uid: number;
  add_time: number;
}

/** Interface list */
export type InterfaceList = Interface[];

/** Category information */
export interface Category {
  /** ID */
  _id: number;
  /** Category name */
  name: string;
  /** Category description */
  desc: string;
  /** Interface list in this category */
  list: InterfaceList;
  /** Creation time (unix timestamp) */
  add_time: number;
  /** Update time (unix timestamp) */
  up_time: number;
}

export interface ChangeCase {
  /**
   * @example
   * changeCase.camelCase('test string') // => 'testString'
   */
  camelCase: (value: string) => string;
  /**
   * @example
   * changeCase.constantCase('test string') // => 'TEST_STRING'
   */
  constantCase: (value: string) => string;
  /**
   * @example
   * changeCase.dotCase('test string') // => 'test.string'
   */
  dotCase: (value: string) => string;
  /**
   * @example
   * changeCase.headerCase('test string') // => 'Test-String'
   */
  headerCase: (value: string) => string;
  /**
   * @example
   * changeCase.lowerCase('TEST STRING') // => 'test string'
   */
  lowerCase: (value: string) => string;
  /**
   * @example
   * changeCase.lowerCaseFirst('TEST') // => 'tEST'
   */
  lowerCaseFirst: (value: string) => string;
  /**
   * @example
   * changeCase.paramCase('test string') // => 'test-string'
   */
  paramCase: (value: string) => string;
  /**
   * @example
   * changeCase.pascalCase('test string') // => 'TestString'
   */
  pascalCase: (value: string) => string;
  /**
   * @example
   * changeCase.pathCase('test string') // => 'test/string'
   */
  pathCase: (value: string) => string;
  /**
   * @example
   * changeCase.sentenceCase('testString') // => 'Test string'
   */
  sentenceCase: (value: string) => string;
  /**
   * @example
   * changeCase.snakeCase('test string') // => 'test_string'
   */
  snakeCase: (value: string) => string;
  /**
   * @example
   * changeCase.swapCase('Test String') // => 'tEST sTRING'
   */
  swapCase: (value: string) => string;
  /**
   * @example
   * changeCase.titleCase('a simple test') // => 'A Simple Test'
   */
  titleCase: (value: string) => string;
  /**
   * @example
   * changeCase.upperCase('test string') // => 'TEST STRING'
   */
  upperCase: (value: string) => string;
  /**
   * @example
   * changeCase.upperCaseFirst('test') // => 'Test'
   */
  upperCaseFirst: (value: string) => string;
}

/** Request method */
export enum Method {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
  PATCH = 'PATCH'
}

/** Required */
export enum Required {
  /** Not required */
  false = '0',
  /** Required */
  true = '1'
}

/** Request body type */
export enum RequestBodyType {
  /** Query string */
  query = 'query',
  /** Form */
  form = 'form',
  /** JSON */
  json = 'json',
  /** Plain text */
  text = 'text',
  /** File */
  file = 'file',
  /** Raw data */
  raw = 'raw',
  /** No request data */
  none = 'none'
}

/** Request path parameter type */
export enum RequestParamType {
  /** String */
  string = 'string',
  /** Number */
  number = 'number'
}

/** Request query parameter type */
export enum RequestQueryType {
  /** String */
  string = 'string',
  /** Number */
  number = 'number'
}

/** Request form item type */
export enum RequestFormItemType {
  /** Plain text */
  text = 'text',
  /** File */
  file = 'file'
}

/** Response body type */
export enum ResponseBodyType {
  /** JSON */
  json = 'json',
  /** Plain text */
  text = 'text',
  /** XML */
  xml = 'xml',
  /** Raw data */
  raw = 'raw'
}

/** Extended interface definition */
export interface ExtendedInterface extends Interface {
  parsedPath: ParsedPath;
}

/** Category list, corresponding to exported json content */
export type CategoryList = Category[];

/** Configuration for generating comments */
export interface CommentConfig {
  /**
   * Whether to enable this feature.
   *
   * @default true
   */
  enabled?: boolean;

  /**
   * Whether to include title.
   *
   * @default true
   */
  title?: boolean;
}

/**
 * Shared configuration.
 */
export interface SharedConfig {
  /**
   * Output file path.
   *
   * Can be `relative path` or `absolute path`.
   *
   * @example 'src/api/index.ts'
   */
  outputFilePath?: string;

  /**
   * Request function file path.
   *
   * @default `request.ts` file in the same directory as `outputFilePath`
   * @example 'src/api/request.ts'
   */
  requestFunctionFilePath?: string;

  /**
   * Configuration for generating comments.
   */
  comment?: CommentConfig;

  /**
   * Get the name of the request function.
   *
   * @default changeCase.camelCase(interfaceInfo.parsedPath.name)
   * @param interfaceInfo Interface information
   * @param changeCase Collection of common case conversion functions
   * @returns Name of the request function
   */
  getRequestFunctionName?(interfaceInfo: ExtendedInterface, changeCase: ChangeCase): string;

  /**
   * Get the name of the request data type.
   *
   * @default changeCase.pascalCase(`${requestFunctionName}Request`)
   * @param interfaceInfo Interface information
   * @param changeCase Collection of common case conversion functions
   * @returns Name of the request data type
   */
  getRequestDataTypeName?(interfaceInfo: ExtendedInterface, changeCase: ChangeCase): string;

  /**
   * Get the name of the response data type.
   *
   * @default changeCase.pascalCase(`${requestFunctionName}Response`)
   * @param interfaceInfo Interface information
   * @param changeCase Collection of common case conversion functions
   * @returns Name of the response data type
   */
  getResponseDataTypeName?(interfaceInfo: ExtendedInterface, changeCase: ChangeCase): string;
}

/**
 * Server configuration.
 */
export interface ApiConfig {
  name: string;
  configIndex?: number;
  /**
   * Server URL. Enter the swagger json address here.
   * For example, nestjs projects usually use http://localhost:3041/api-json
   *
   */
  serverUrl: string;
  /**
   * Output file path.
   *
   * Can be `relative path` or `absolute path`.
   *
   * @example 'src/api/index.ts'
   */
  outputFilePath?: string;
  /**
   * Set the baseURL for the interface
   *
   * @description To configure runtime code, add the `[code]:` prefix
   ```
   Example:
    baseURL: "[code]:process.env.BASE_URL"  => baseURL:process.env.BASE_URL

    baseURL: "http://localhost:3000" => baseURL:"http://localhost:3000"
   ```
   */
  baseURL?: ((path: string) => string | undefined) | string;
  /**
   * Define a code snippet at the top of each generated api file
   * For example: import custom request function
   * default: import request from './request'
   */
  topImportTemplate?: topImportTemplateType;
  /**
   * Whether to use the default request library, request.ts will not be generated after disabling, default: true
   */
  defaultRequestLib?: boolean;
}

/** Combined configuration. */
export type SyntheticalConfig = Partial<
  ApiConfig & {
    components: OpenAPIV3.Document['components'];
  }
>;

/** Configuration. */
export type Config = ApiConfig;

/**
 * Request configuration.
 */
export interface RequestConfig<
  Path extends string = string,
  ParamName extends string = string,
  QueryName extends string = string,
  RequestDataOptional extends boolean = boolean
> {
  /** Interface path, starting with `/` */
  path: Path;
  /** Request method */
  method: Method;
  /** Request headers, all headers except Content-Type */
  requestHeaders: Record<string, string>;
  /** Request body type */
  requestBodyType: RequestBodyType;
  /** Response body type */
  responseBodyType: ResponseBodyType;
  /** List of path parameter names */
  paramNames: ParamName[];
  /** List of query parameter names */
  queryNames: QueryName[];
  /** Whether request data is optional */
  requestDataOptional: RequestDataOptional;
  /** JSON Schema for request data (only effective when JSON Schema generation is enabled) */
  requestDataJsonSchema: JSONSchema4;
  /** JSON Schema for response data (only effective when JSON Schema generation is enabled) */
  responseDataJsonSchema: JSONSchema4;
  /** Request function name */
  requestFunctionName: string;
}

/**
 * Request parameters.
 */
export interface RequestFunctionParams extends RequestConfig {
  /** Raw data */
  rawData: Record<string, any>;
  /** Request data, excluding file data */
  data: Record<string, any>;
  /** Whether there is file data */
  hasFileData: boolean;
  /** Request file data */
  fileData: Record<string, any>;
  /** All request data, including data and fileData */
  allData: Record<string, any>;
  /** Get FormData instance for all request data (including files) */
  getFormData: () => FormData;
}

/** Additional parameters of the request function */
export type RequestFunctionRestArgs<T extends Function> = T extends (payload: any, ...args: infer R) => any ? R : never;

/** Property definition */
export interface PropDefinition {
  /** Property name */
  name: string;
  /** Required */
  required: boolean;
  /** Type */
  type: JSONSchema4['type'];
  /** Comment */
  comment: string;
}

/** Property definition list */
export type PropDefinitions = PropDefinition[];

/** Request function body generation template function */
export interface RequestFunctionTemplateProps {
  baseURL?: string;
  requestFunctionName: string;
  requestDataTypeName: string;
  extendedInterfaceInfo: ExtendedInterface;
  responseDataTypeName: string;
}
