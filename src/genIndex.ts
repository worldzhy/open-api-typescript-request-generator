/**
 * Generate the index entry file.
 */

/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import fs from 'fs-extra';
import path from 'path';
import { dedent } from './vtilsLite';
import { Config } from './types';
import { getOutputFilePath } from './getOutputPath';
import { formatContent, topNotesContent } from './utils';
import * as conso from './console';

/** Create the `src/api/index.ts` file if it does not already exist. */
export async function prepareIndexFile(config: Config) {
  const indexFilePath = getOutputFilePath(config, 'index.ts');
  if (!(await fs.pathExists(indexFilePath))) {
    fs.outputFileSync(indexFilePath, dedent`${topNotesContent()}` + '\n');
  }
}

export default async (config: Config, categoryList: { projectId: string }[]) => {
  const indexFilePath = getOutputFilePath(config, 'index.ts');
  let originFileContent = '';

  if (await fs.pathExists(indexFilePath)) {
    originFileContent = fs.readFileSync(indexFilePath, { encoding: 'utf-8' });
  }

  const exportAllInterface = categoryList.reduce((list, { projectId }, index) => {
    if (originFileContent.indexOf(`${projectId}`) === -1) {
      list.push(`export * from  "./${projectId}"`);
    }
    return list;
  }, [] as string[]);

  const content = `
    ${exportAllInterface.join(';')}
  `;

  // Append the new exports to the index file.
  await fs.appendFile(
    indexFilePath,

    await formatContent(dedent`${content}`)
  );
};

/**
 * Read the git information (repo, branch, commit) stored in the index file
 * banner from the previous generation run.
 * @param config generator config
 */

export type GetIndexGitInfoResultName = 'repo' | 'branch' | 'commitId';
export interface GetIndexGitInfoResult {
  repo: string;
  branch: string;
  commitId: string;
}
export const getIndexGitInfo = (config: Config): GetIndexGitInfoResult => {
  const indexFilePath = getOutputFilePath(config, 'index.ts');
  const result: GetIndexGitInfoResult = {} as GetIndexGitInfoResult;

  try {
    const fileContent = fs.readFileSync(indexFilePath, { encoding: 'utf-8' });
    (['repo', 'branch', 'commitId'] as GetIndexGitInfoResultName[]).forEach((k: GetIndexGitInfoResultName) => {
      const reg = new RegExp(`${k}:\\s?([A-Za-z0-9_\\-/://]+)\\s`);
      const matchRes = fileContent.match(reg) || [];
      result[k] = matchRes[1] || '';
    });
  } catch (e) {
    conso.tips(`${indexFilePath} not found, will regenerate`);
  }
  return result;
};
export const genGitRepoIndex = async (config: Config, filePathList: string[], notes?: string) => {
  const indexFilePath = getOutputFilePath(config, 'index.ts');
  let originFileContent = '';

  if (await fs.pathExists(indexFilePath)) {
    originFileContent = fs.readFileSync(indexFilePath, { encoding: 'utf-8' });
  }

  const exportAllInterface = filePathList.reduce((list, filePath, index) => {
    if (originFileContent.indexOf(filePath) === -1) {
      list.push(`export * from  "./${path.join('./', filePath)}"`);
    }
    return list;
  }, [] as string[]);
  const content = `
    ${exportAllInterface.join(';')}
  `;

  // Append the new exports to the index file.
  await fs.appendFile(
    indexFilePath,

    await formatContent(dedent`${content}`)
  );
};
