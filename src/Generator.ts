import * as changeCase from 'change-case';
import dayjs from 'dayjs';
import fs from 'fs-extra';
import path, { dirname } from 'path';
import * as conso from './console';
import got from 'got';
import { OpenAPIV2, OpenAPIV3 } from 'openapi-types';
import { swaggerJsonToYApiData } from './server/swaggerJsonToYApiData';
import { dedent, isFunction } from 'vtils';
import {
  CommentConfig,
  Config,
  ExtendedInterface,
  Interface,
  ApiConfig,
  SyntheticalConfig,
  GeneratorOptions,
  RequestFunctionTemplateProps
} from './types';
import {
  getRequestDataJsonSchema,
  getResponseDataJsonSchema,
  jsonSchemaToTsCode,
  formatContent,
  topNotesContent
} from './utils';
import { genJsonSchemeConstContent } from './responseDataJsonSchemaHandler';
import { getOutputFilePath } from './getOutputPath';
import GenRequest from './genRequest';

interface OutputFileList {
  [outputFilePath: string]: {
    projectId: string;
    categoryId: string;
    syntheticalConfig: SyntheticalConfig;
    content: string[];
    outputResponseDataJsonSchemaFilePath: string;
    responseDataJsonSchemaContent: string[];
    requestFunctionFilePath: string;
    requestHookMakerFilePath: string;
  };
}

// 默认顶部依赖生成模板
function defaultTopImportTemplate(config?: Config) {
  return `import request from './request'`;
}

const getDataKeySetStr = (method: string) => {
  if (['head', 'option', 'get'].includes(method.toLowerCase())) {
    return 'params: data';
  }
  return 'data';
};

// 处理路径参数
function handlePathParam(path: string) {
  if (path.match(/\{(\w+)\}/)) {
    // eslint-disable-next-line no-template-curly-in-string
    return `\`${path.replace(/\{(\w+)\}/g, '${data.$1}')}\``;
  }

  return JSON.stringify(path);
}

/**
 * Detect whether a generated request type has degraded to a primitive or
 * empty shape. A well-formed request DTO is an object literal or interface
 * reference; these signatures mean the backend did not expose a usable
 * request body schema (missing `@ApiBody({type})`, inline `@Body()` type,
 * or a Prisma type bound to `@Body()`), so the generator fell back to a
 * primitive/empty type. Used to emit a warning so the author can fix the
 * decorator rather than silently shipping `string`/`{}` to the frontend.
 * See defect G-5.
 */
function isDegradedRequestType(typeCode: string): boolean {
  // Collapse whitespace so shape-matching regexes are stable regardless of
  // prettier's spacing choices.
  const code = typeCode.replace(/\s+/g, ' ').trim();
  // Pull the right-hand side of `export type Name = <body>;`.
  const match = code.match(/^export type \w+ = (.*?);?$/);
  if (!match) return false;
  const body = match[1].trim();
  // Bare primitive / unknown (no body schema inferred at all).
  if (/^(string|unknown|number|boolean|null)$/.test(body)) return true;
  // Empty object literal (schema stripped to nothing).
  if (/^\{\s*\}$/.test(body)) return true;
  // Index signature only — no named fields, just `[k: string]: unknown`.
  if (/^\{\s*\[\s*\w+\s*:\s*string\s*\]\s*:\s*unknown\s*\}$/.test(body)) return true;
  // Path-param merge with a primitive fallback (`{ id: string } & string`).
  if (/&\s*(string|unknown)\b/.test(body)) return true;
  return false;
}
// 默认请求函数体生成模板
function defaultRequestFunctionTemplate(props: RequestFunctionTemplateProps, config?: SyntheticalConfig): string {
  const { baseURL, requestFunctionName, requestDataTypeName, responseDataTypeName, extendedInterfaceInfo } = props;
  const { req_params, req_query } = extendedInterfaceInfo;
  const hasData = req_params.length || req_query.length;
  const method = extendedInterfaceInfo.method.toLowerCase();
  let finalBaseUrl = '';
  if (baseURL?.match(/^\[code\]:/)) {
    // 如果使用[code]开头则表示，作为代码段执行，否则仅作为字符串
    finalBaseUrl = baseURL.replace(/^\[code\]:/, '');
  } else {
    finalBaseUrl = `"${baseURL}"`;
  }
  return `export const ${requestFunctionName} = (data${
    hasData ? '' : '?'
  }: ${requestDataTypeName}${`,extra?:Record<string,any>`}) => {
    return request.${method}<${requestDataTypeName},${responseDataTypeName}>(${handlePathParam(
      extendedInterfaceInfo.path
    )}, {
      ${getDataKeySetStr(method)},
      ${baseURL ? `baseURL: ${finalBaseUrl},` : ''}
      ${`...extra`}
    })
  }`;
}

export class Generator {
  /** 配置 */
  private config: ApiConfig;

  private disposes: Array<() => any> = [];

  constructor(
    config: Config,
    private options: GeneratorOptions = { cwd: process.cwd() }
  ) {
    // config 可能是对象或数组，统一为数组
    this.config = config;
  }

  async getOpenApiV3Json(url: string): Promise<OpenAPIV3.Document> {
    const res = await got.get<OpenAPIV3.Document>(url, {
      responseType: 'json'
    });
    return res.body;
  }

  /**
   * 生成代码
   * @returns
   */
  async generate(): Promise<OutputFileList> {
    const outputFileList: OutputFileList = Object.create(null);

    const { serverUrl, configIndex, name } = this.config;
    const typesName = name || '_types_' + (configIndex + 1);
    const openApiV3Json = await this.getOpenApiV3Json(serverUrl);

    // components tstype interface
    // Use optional chaining: a valid OpenAPI document may omit `components`
    // entirely (e.g. APIs with only path parameters and no schemas). Without
    // this guard, `Object.keys(openApiV3Json.components.schemas)` throws and
    // aborts generation (see defect G-10).
    const componentsSchemas = openApiV3Json.components?.schemas ?? {};
    const componentsCode: string[] = [];
    await Promise.all(
      Object.keys(componentsSchemas).map(async key => {
        const code = await jsonSchemaToTsCode({ ...componentsSchemas[key], components: openApiV3Json.components }, key);
        componentsCode.push(code);
      })
    );

    // 接口列表
    const allApi = await swaggerJsonToYApiData(openApiV3Json);

    let interfaceList = allApi.interfaces;

    const categoryCode: string[] = [...componentsCode];

    const categoryResponseDataJsonSchemaContent: string[] = [];

    for (let interfaceInfo of interfaceList) {
      const { code, responseDataJsonSchema } = await this.generateInterfaceCode(
        {
          ...this.config,
          components: openApiV3Json.components
        },
        interfaceInfo
      );
      categoryCode.push(code);
      categoryResponseDataJsonSchemaContent.push(responseDataJsonSchema);
    }

    const catOutputFilePath = getOutputFilePath(this.config, `/${typesName}.ts`);

    if (categoryCode.length > 0) {
      outputFileList[catOutputFilePath] = {
        projectId: typesName,
        categoryId: typesName,
        syntheticalConfig: this.config,
        content: categoryCode,
        outputResponseDataJsonSchemaFilePath: getOutputFilePath(this.config, `/${typesName}/responseDataJsonSchema.ts`),
        responseDataJsonSchemaContent: categoryResponseDataJsonSchemaContent,
        requestFunctionFilePath: path.join(path.dirname(catOutputFilePath), 'request.ts'),
        requestHookMakerFilePath: ''
      };
    }

    return outputFileList;
  }

  /**
   * 写入文件
   * @param outputFileList
   * @returns
   */
  async write(outputFileList: OutputFileList) {
    const JsonSchemaContentList: string[] = [];
    const projects: { projectId: string }[] = [];
    Object.keys(outputFileList).forEach(filePath => {
      const item = outputFileList[filePath];
      JsonSchemaContentList.push(item.responseDataJsonSchemaContent.join('\n'));
      projects.push({ projectId: item.projectId });
    });
    const config = this.config || ({} as Config);
    // config.getRequestFunctionName;
    // this.requestFunctionNameGen;

    // 生成 request.ts
    await GenRequest(config);
    let outputContent = '';

    return Promise.all(
      Object.keys(outputFileList).map(async (outputFilePath, index) => {
        let {
          content,
          requestFunctionFilePath,
          requestHookMakerFilePath,
          syntheticalConfig,
          outputResponseDataJsonSchemaFilePath,
          responseDataJsonSchemaContent
        } = outputFileList[outputFilePath];

        // 支持 .jsx? 后缀
        outputFilePath = outputFilePath.replace(/\.js(x)?$/, '.ts$1');
        requestFunctionFilePath = requestFunctionFilePath.replace(/\.js(x)?$/, '.ts$1');
        requestHookMakerFilePath = requestHookMakerFilePath.replace(/\.js(x)?$/, '.ts$1');

        const topImportTemplate = syntheticalConfig.topImportTemplate || defaultTopImportTemplate;

        // 始终写入主文件
        const rawOutputContent = dedent`
          ${topNotesContent()}
          ${topImportTemplate(config)}

          ${content.join('\n\n').trim()}
        `;

        outputContent += await formatContent(dedent`${rawOutputContent}`);
        if (Object.keys(outputFileList).length - 1 === index) {
          await fs.outputFile(outputFilePath, outputContent);
        }
      })
    );
  }

  /** 请求函数名生成 */
  requestFunctionNameGen(extendedInterfaceInfo: ExtendedInterface): string {
    const path = extendedInterfaceInfo.parsedPath.dir;
    const method = extendedInterfaceInfo.method; // 可能存在同path，不同method的用法
    const words = [method, ...path.split('/'), extendedInterfaceInfo.parsedPath.name].join('_');
    return changeCase.camelCase(words);
  }

  /** 生成接口代码 */
  async generateInterfaceCode(syntheticalConfig: SyntheticalConfig, interfaceInfo: Interface) {
    const extendedInterfaceInfo: ExtendedInterface = {
      ...interfaceInfo,
      parsedPath: path.parse(interfaceInfo.path)
    };
    const requestFunctionName = this.requestFunctionNameGen(extendedInterfaceInfo);
    const requestConfigName = changeCase.camelCase(`${requestFunctionName}RequestConfig`);
    const requestConfigTypeName = changeCase.pascalCase(requestConfigName);
    const requestDataTypeName = changeCase.pascalCase(`${requestFunctionName}Request`);
    const responseDataTypeName = changeCase.pascalCase(`${requestFunctionName}Response`);
    const requestDataJsonSchema = getRequestDataJsonSchema(extendedInterfaceInfo);
    // 入参

    const requestDataType = await jsonSchemaToTsCode(
      { ...requestDataJsonSchema, components: syntheticalConfig.components },
      requestDataTypeName
    );
    // Surface request-body type degradation instead of silently shipping a
    // primitive/empty type to the frontend. Common root causes: missing
    // `@ApiBody({type: XxxDto})`, inline `@Body() body: {...}` literal, or a
    // Prisma type bound to `@Body()`. See defect G-5.
    if (isDegradedRequestType(requestDataType)) {
      console.warn(
        `[apits-gener] Request type degraded for ` +
          `${extendedInterfaceInfo.method.toUpperCase()} ${extendedInterfaceInfo.path} — ` +
          `check backend @Body()/@ApiBody decorator. Generated:\n${requestDataType}`
      );
    }
    const responseDataJsonSchema = getResponseDataJsonSchema(extendedInterfaceInfo);
    // console.log(JSON.stringify(responseDataJsonSchema));
    const responseDataType = await jsonSchemaToTsCode(
      { ...responseDataJsonSchema, components: syntheticalConfig.components },
      responseDataTypeName
    );

    // 接口注释
    const genComment = (genTitle: (title: string) => string) => {
      const {
        enabled: isEnabled = true,
        title: hasTitle = true,
        category: hasCategory = true,
        tag: hasTag = true,
        requestHeader: hasRequestHeader = true,
        updateTime: hasUpdateTime = true,
        link: hasLink = true
      } = {
        // Swagger 时总是禁用标签、更新时间、链接
        tag: false,
        updateTime: false,
        link: false
      } as CommentConfig;
      if (!isEnabled) {
        return '';
      }
      // 转义标题中的 /
      const escapedTitle = String(extendedInterfaceInfo.title).replace(/\//g, '\\/');
      const description = hasLink
        ? `[${escapedTitle}↗](${syntheticalConfig.serverUrl}/project/${extendedInterfaceInfo.project_id}/interface/api/${extendedInterfaceInfo._id})`
        : escapedTitle;
      const summary: Array<
        | false
        | {
            label: string;
            value: string | string[];
          }
      > = [
        // hasCategory && {
        //   label: '分类',
        //   value: hasLink
        //     ? `[${extendedInterfaceInfo._category.name}↗](${syntheticalConfig.serverUrl}/project/${extendedInterfaceInfo.project_id}/interface/api/cat_${extendedInterfaceInfo.catid})`
        //     : extendedInterfaceInfo._category.name
        // },
        hasTag && {
          label: '标签',
          value: extendedInterfaceInfo.tag.map(tag => `\`${tag}\``)
        },
        hasRequestHeader && {
          label: '请求头',
          value: `\`${extendedInterfaceInfo.method.toUpperCase()} ${extendedInterfaceInfo.path}\``
        },
        hasUpdateTime && {
          label: '更新时间',
          value: process.env.JEST_WORKER_ID // 测试时使用 unix 时间戳
            ? String(extendedInterfaceInfo.up_time)
            : /* istanbul ignore next */
              `\`${dayjs(extendedInterfaceInfo.up_time * 1000).format('YYYY-MM-DD HH:mm:ss')}\``
        }
      ];
      const titleComment = hasTitle
        ? dedent`
            * ${genTitle(description)}
            *
          `
        : '';

      return dedent`
        /**
         ${[titleComment].filter(Boolean).join('\n')}
         */
      `;
    };
    const requestFunctionTemplate = defaultRequestFunctionTemplate;
    const baseURL = syntheticalConfig.baseURL;
    let baseUrl;
    try {
      baseUrl =
        typeof baseURL === 'string'
          ? baseURL
          : typeof baseURL === 'function'
            ? baseURL(extendedInterfaceInfo.path)
            : '';
    } catch (e) {
      conso.error(e);
    }

    const code = dedent`
      ${genComment(title => `${title} request parameters`)}
      ${requestDataType.trim()}

      ${genComment(title => `${title} response data`)}
      ${responseDataType.trim()}

      ${dedent`
          ${genComment(title => `${title}`)}
          ${requestFunctionTemplate(
            {
              baseURL: baseUrl,
              requestFunctionName,
              requestDataTypeName,
              responseDataTypeName,
              extendedInterfaceInfo
            },
            syntheticalConfig
          )}
        `}
    `;

    return {
      code,
      responseDataJsonSchema: genJsonSchemeConstContent(
        extendedInterfaceInfo.path,
        syntheticalConfig.serverUrl || '',
        extendedInterfaceInfo,
        responseDataJsonSchema
      )
    };
  }

  async destroy() {
    return Promise.all(this.disposes.map(async dispose => dispose()));
  }
}
