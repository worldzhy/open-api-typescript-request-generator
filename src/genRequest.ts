/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import fs from 'fs-extra';
import { dedent } from 'vtils';
import { Config } from './types';
import { getOutputFilePath } from './getOutputPath';
import { formatContent, topNotesContent } from './utils';

export default async (config: Config) => {
  const { defaultRequestLib } = config;
  if (defaultRequestLib === false) return;
  const rawRequestFunctionFilePath = getOutputFilePath(config, 'request.ts');
  if (await fs.pathExists(rawRequestFunctionFilePath)) {
    return;
  }

  const content = `
  ${topNotesContent()}

  import request,{ AxiosRequestConfig } from 'axios';  // axios version >= 0.18.1

  const instance = request.create({
    withCredentials: true,
    baseURL: process.env.BASE_URL,
  });

  // Custom request interceptor.
  instance.interceptors.request.use((config) => {
    return  {
      ...config
    }
  });

  // Custom response interceptor.
  // Note: if you change the normal response structure, update the
  // corresponding response type declarations accordingly.
  instance.interceptors.response.use((res) => {
    const { status } = res;
    if (status >= 200 && status < 300) {
      return res;
    }
    return Promise.reject(res);
  });

  export default {
    get: <RQ, RP>(url: string, config?: AxiosRequestConfig) => {
      return instance.get<RP>(url, config);
    },
    post: <RQ, RP>(url: string, config?: AxiosRequestConfig) => {
      return instance.post<RP>(url, config);
    },
    head: <RQ, RP>(url: string, config?: AxiosRequestConfig) => {
      return instance.head<RP>(url, config);
    },
    put: <RQ, RP>(url: string, config?: AxiosRequestConfig) => {
      return instance.put<RP>(url, config);
    },
    patch: <RQ, RP>(url: string, config?: AxiosRequestConfig) => {
      return instance.patch<RP>(url, config);
    },
    delete: <RQ, RP>(url: string, config?: AxiosRequestConfig) => {
      return instance.delete<RP>(url, config);
    },
  };
`;

  await fs.outputFile(rawRequestFunctionFilePath, await formatContent(dedent`${content}`));
};
