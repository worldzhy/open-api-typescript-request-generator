import { register } from 'tsx/cjs/api';
import fs from 'fs-extra';
import path from 'path';
import prompt from 'prompts';
import yargs from 'yargs';
import { Config } from '../types';
import { dedent } from '../utils/vtilsLite';
import { Generator } from './generator';
import yargsParser from 'yargs-parser';
import chalk from 'chalk';
import * as conso from '../utils/console';
import { formatContent } from '../utils/utils';
import { spinnerInstance } from '../utils/spinner';
import { asyncFnArrayOrderRun } from '../utils/helpers';

// Register the tsx loader so apits.config.ts / apits.config.local.ts can be
// required at runtime. tsx transpiles via esbuild (no type-checking) and
// reads tsconfig.json automatically, so no compilerOptions are needed here.
register();

export async function getConfig() {
  const cwd = process.cwd();
  const configTSFile = path.join(cwd, 'apits.config.ts');
  const configTSLocalFile = path.join(cwd, 'apits.config.local.ts');
  const configTSLocalFileExist = await fs.pathExists(configTSLocalFile);
  const configTSFileExist = await fs.pathExists(configTSFile);
  const configFileExist = configTSLocalFileExist || configTSFileExist;
  const configFile = configTSLocalFileExist ? configTSLocalFile : configTSFile || '';

  return {
    cwd,
    configFileExist,
    configFile,
    configTSFile,
    configTSLocalFile,
    configTSFileExist
  };
}

export async function genConfig() {
  const { configTSFile, configTSFileExist } = await getConfig();
  if (configTSFileExist) {
    conso.tips(`检测到配置文件: ${configTSFile}`);
    const answers = await prompt({
      message: '是否覆盖已有配置文件?',
      name: 'override',
      type: 'confirm'
    });
    if (!answers.override) return;
  }

  let configAnswers;
  configAnswers = await prompt([
    {
      message: '接口文件路径名称',
      name: 'name',
      type: 'text',
      initial: ''
    },
    {
      message: '接口信息服务地址',
      name: 'url',
      type: 'text',
      initial: ''
    }
  ]);

  await fs.outputFile(
    configTSFile,
    await formatContent(dedent`
      import { defineConfig } from 'open-api-typescript-request-generator'

      export default defineConfig([{
        name: '${configAnswers?.name || ''}',
        serverUrl: '${configAnswers?.url || ''}',
        outputFilePath: 'src/api',
        baseURL: '[code]:process.env.BASE_API_URL',
        topImportTemplate: () => "${`import request from './request'`}",
        defaultRequestLib: true,
      }])
    `)
  );
  conso.success('写入配置文件完毕');
}

async function startGenerate(config: Config, index = 0) {
  const { outputFilePath } = config;

  const label = chalk.green(`${config.serverUrl}耗时`);
  console.time(label);
  spinnerInstance.start();
  const generator = new Generator(config);
  const output = await generator.generate();
  await generator.write(output);
  spinnerInstance.clear();
  conso.log(chalk.yellowBright(`\n${index + 1}.-------------------------`));
  conso.success(`代码生成成功，文件路径：${outputFilePath}`);
  console.timeEnd(label);
  conso.log(chalk.yellowBright('---------------------------\n'));
  await generator.destroy();

  return true;
}

export async function start(options: { name?: string } = {}) {
  const timeLabel = chalk.green('总耗时');
  console.time(timeLabel);
  const { configFileExist, configFile } = await getConfig();

  if (!configFileExist) {
    return conso.error(`未发现配置文件: ${configFile}`);
  }
  conso.tips(`发现配置文件: ${configFile}`);
  try {
    const config: Config[] = require(configFile).default;

    let configToRun = config;
    if (options.name) {
      configToRun = config.filter(c => c.name === options.name);
      if (configToRun.length === 0) {
        return conso.error(`未找到 name 为 ${options.name} 的配置`);
      }
    }

    spinnerInstance.start('正在获取数据并生成代码... \n');
    await asyncFnArrayOrderRun(
      configToRun.map((configItem, index) => {
        return async () => {
          configItem.configIndex = index;
          await startGenerate(configItem, index);
        };
      })
    );
    spinnerInstance.stop();
  } catch (err) {
    spinnerInstance.stop();
    console.error('\n❌ 执行过程中发生错误:');
    console.error('错误信息:', err.message || err);
    if (err.stack) {
      console.error('错误堆栈:');
      console.error(err.stack);
    }
    if (err.cause) {
      console.error('错误原因:', err.cause);
    }
    return conso.error('代码生成失败，请查看上方错误信息');
  }

  console.timeEnd(timeLabel);
  return null;
}

export default class CLI {
  argvs: any;

  run(args: any, callback?: yargs.ParseCallback) {
    this.argvs = yargsParser(args);

    const cli = this.init();

    if (args.length === 0) {
      cli.showHelp();
    }
    return cli.parse(args);
  }

  init() {
    return yargs
      .scriptName('apits-gener')
      .usage('Usage: $0 <command> [options]')
      .command<any>(
        'gen',
        '生成接口类型声明和方法',
        y => {
          y.option('name', {
            alias: 'n',
            type: 'string',
            description: '只生成指定 name 的配置'
          });
        },
        (argv: any) => {
          const { name } = argv;
          start({ name });
        }
      )
      .command<any>(
        'init',
        '生成配置文件',
        y => { },
        async (argv: any) => {
          const { } = argv;
          await genConfig();
        }
      )
      .help();
  }
}
