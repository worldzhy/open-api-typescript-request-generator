import { JSONSchema4 } from '../types';
import { ExtendedInterface } from '../types';
import * as changeCase from 'change-case';

export const jsonSchemeKey = function (path: string): string {
  const deeps = path.split('/');
  const names = deeps.splice(deeps.length - 4, deeps.length).join('_');
  return changeCase.camelCase(names);
};

export const genJsonSchemeConstContent = function (
  path: string,
  serverUrl: string,
  info: ExtendedInterface,
  JSONSchema: JSONSchema4
): string {
  const name = jsonSchemeKey(path);
  const escapedTitle = String(info.title).replace(/\//g, '\\/');
  const description = `[${escapedTitle}↗](${serverUrl}/project/${info.project_id}/interface/api/${info._id})`;
  return `
    /**
     * ${description}
     */
    export const ${name} = ${JSON.stringify(JSONSchema)}
  `;
};
