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
import { asyncFnArrayOrderRun, defineConfig } from '../utils/helpers';

// Register the tsx loader so apits.config.ts / apits.config.local.ts can be
// required at runtime. tsx transpiles via esbuild (no type-checking) and
// reads tsconfig.json automatically, so no compilerOptions are needed here.
register();

/** Flags accepted by the `gen` command. */
interface GenFlags {
  /** OpenAPI document URL or local file path. */
  input?: string;
  /** Output directory. */
  output?: string;
  /** File base name (CLI mode) or name filter (config-file mode). */
  name?: string;
  /** Runtime baseURL (string; `[code]:` prefix supported). */
  baseUrl?: string;
  /** Whether to scaffold the default request.ts client. */
  client?: boolean;
  /** Watch local input files and regenerate on change. */
  watch?: boolean;
}

// Config file candidates in priority order; the first match wins.
const CONFIG_FILE_CANDIDATES = [
  'apits.config.local.ts',
  'apits.config.ts',
  'apits.config.local.json',
  'apits.config.json'
];

interface DiscoveredConfig {
  filePath: string;
  kind: 'ts' | 'json' | 'package';
}

/** Raised when neither a CLI input nor a config file can be found. */
class NoInputError extends Error { }

function isHttpInput(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

/** Normalize a single config or an array into a config array. */
function normalizeConfig(raw: Config | Config[]): Config[] {
  return defineConfig(Array.isArray(raw) ? raw : [raw]);
}

/**
 * Discover the optional config file. Supports TS/JSON config files and the
 * `apits` field inside package.json. Returns undefined when nothing exists.
 */
async function discoverConfigFile(cwd: string = process.cwd()): Promise<DiscoveredConfig | undefined> {
  for (const fileName of CONFIG_FILE_CANDIDATES) {
    const filePath = path.join(cwd, fileName);
    if (await fs.pathExists(filePath)) {
      return { filePath, kind: fileName.endsWith('.json') ? 'json' : 'ts' };
    }
  }

  const packageJsonPath = path.join(cwd, 'package.json');
  if (await fs.pathExists(packageJsonPath)) {
    try {
      const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      if (pkg.apits) {
        return { filePath: packageJsonPath, kind: 'package' };
      }
    } catch {
      // A malformed package.json should not crash config discovery.
    }
  }

  return undefined;
}

/** Load configs from a discovered file. */
function loadConfigFile(discovered: DiscoveredConfig): Config[] {
  const { filePath, kind } = discovered;

  if (kind === 'ts') {
    // tsx is registered at module load time.
    const mod = require(filePath);
    return normalizeConfig(mod.default ?? mod);
  }

  if (kind === 'json') {
    return normalizeConfig(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
  }

  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return normalizeConfig(pkg.apits);
}

/** Build a single ad-hoc config from CLI flags (no config file needed). */
function buildCliConfig(flags: GenFlags): Config {
  const config: Config = {
    input: flags.input!,
    output: flags.output || 'src/api'
  };
  if (flags.name) {
    config.name = flags.name;
  }
  if (flags.baseUrl !== undefined) {
    config.baseURL = flags.baseUrl;
  }
  // CLI mode has no custom import template, so the scaffolded client is on
  // unless `--no-client` was passed.
  config.client = flags.client !== false;
  return defineConfig(config)[0];
}

/**
 * Ensure every config has a name. Explicit names win; missing names are
 * derived from the input. A duplicated derived name gets an index suffix
 * so generated files never overwrite each other.
 */
function assignUniqueNames(configs: Config[]) {
  const counts = new Map<string, number>();
  configs.forEach(item => {
    const base = item.name || Generator.deriveName(item.input);
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    if (!item.name) {
      item.name = seen === 0 ? base : `${base}_${seen + 1}`;
    }
  });
}

/**
 * Resolve the effective config list.
 * Precedence: CLI flags > config file > built-in defaults.
 */
async function resolveConfigs(
  flags: GenFlags
): Promise<{ configs: Config[]; source: 'cli' | 'file'; configFile?: string }> {
  // 1. Positional input — the zero-config path.
  if (flags.input) {
    const configs = [buildCliConfig(flags)];
    assignUniqueNames(configs);
    return { configs, source: 'cli' };
  }

  // 2. Optional config file.
  const discovered = await discoverConfigFile();
  if (discovered) {
    let configs = loadConfigFile(discovered);

    // In config-file mode `--name` filters which source(s) to run.
    if (flags.name) {
      configs = configs.filter(item => item.name === flags.name);
      if (configs.length === 0) {
        throw new Error(`未找到 name 为 ${flags.name} 的配置`);
      }
    }

    // CLI flags override config-file values.
    configs = configs.map(item => ({
      ...item,
      ...(flags.output ? { output: flags.output } : {}),
      ...(flags.baseUrl !== undefined ? { baseURL: flags.baseUrl } : {}),
      ...(flags.client === false ? { client: false } : {})
    }));

    assignUniqueNames(configs);
    return { configs, source: 'file', configFile: discovered.filePath };
  }

  // 3. Nothing to generate from.
  throw new NoInputError();
}

/** Print an actionable hint when no input is available. */
function printNoInputHint() {
  conso.error(
    [
      '未找到 OpenAPI 输入。两种方式任选其一：',
      '',
      '  1. 直接传入文档地址，无需配置文件：',
      '     apits gen http://localhost:3041/api-json -o src/api',
      '     apits gen ./openapi.yaml',
      '',
      '  2. 生成配置文件（支持多服务 / 函数式定制）：',
      '     apits init'
    ].join('\n')
  );
}

/** Scaffold an optional apits.config.ts template. */
export async function genConfig(prefill?: { input?: string }) {
  const cwd = process.cwd();
  const configTSFile = path.join(cwd, 'apits.config.ts');

  if (await fs.pathExists(configTSFile)) {
    conso.tips(`检测到配置文件: ${configTSFile}`);
    const answers = await prompt({
      message: '是否覆盖已有配置文件?',
      name: 'override',
      type: 'confirm'
    });
    if (!answers.override) return;
  }

  const configAnswers = await prompt([
    {
      message: '接口文档地址（URL 或本地 JSON/YAML 文件）',
      name: 'input',
      type: 'text',
      initial: prefill?.input || ''
    },
    {
      message: '生成文件名称（可留空，默认由地址推导）',
      name: 'name',
      type: 'text',
      initial: ''
    }
  ]);

  // User cancelled the questionnaire (Ctrl+C / empty input).
  if (!configAnswers || !configAnswers.input) {
    return conso.tips('已取消，未写入配置文件');
  }

  const nameLine = configAnswers?.name ? `  name: '${configAnswers.name}',\n` : '';

  await fs.outputFile(
    configTSFile,
    await formatContent(dedent`
      import { defineConfig } from 'open-api-typescript-request-generator'

      export default defineConfig([{
        input: '${configAnswers?.input || ''}',
        output: 'src/api',
      ${nameLine}  baseURL: '[code]:process.env.BASE_API_URL',
        clientImportTemplate: () => "${`import request from './request'`}",
        // Keep the scaffolded request.ts because the import above points at it.
        client: true,
      }])
    `)
  );
  conso.success('写入配置文件完毕');
}

async function startGenerate(config: Config, index = 0) {
  const { output: outputDir } = config;

  const label = chalk.green(`${config.input} 耗时`);
  console.time(label);
  spinnerInstance.start();
  const generator = new Generator(config);
  const output = await generator.generate();
  await generator.write(output);
  spinnerInstance.clear();
  conso.log(chalk.yellowBright(`\n${index + 1}.-------------------------`));
  conso.success(`代码生成成功，文件路径：${outputDir}`);
  console.timeEnd(label);
  conso.log(chalk.yellowBright('---------------------------\n'));
  await generator.destroy();

  return true;
}

/** Run generation once for every resolved config. */
async function runAll(configs: Config[]) {
  await asyncFnArrayOrderRun(
    configs.map((configItem, index) => {
      return async () => {
        await startGenerate(configItem, index);
      };
    })
  );
}

/**
 * Watch local input files and regenerate the affected config on change.
 * Remote inputs are not watchable; a hint is printed instead.
 */
function watchConfigs(configs: Config[]) {
  const localConfigs = configs.filter(item => !isHttpInput(item.input));

  if (localConfigs.length === 0) {
    conso.tips('--watch 仅支持本地文件，远程地址已忽略监听');
    return;
  }

  // Simple debounce so editors that save twice only trigger one rebuild.
  const timers = new Map<string, NodeJS.Timeout>();

  localConfigs.forEach((configItem, index) => {
    const filePath = path.resolve(configItem.input);
    fs.watch(filePath, async eventType => {
      if (eventType !== 'change') return;
      const oldTimer = timers.get(filePath);
      if (oldTimer) clearTimeout(oldTimer);
      timers.set(
        filePath,
        setTimeout(async () => {
          conso.tips(`检测到文档变化，重新生成：${filePath}`);
          try {
            await startGenerate(configItem, index);
          } catch (err) {
            conso.error(`重新生成失败: ${(err as Error).message || err}`);
          }
        }, 200)
      );
    });
  });

  conso.tips(`已监听 ${localConfigs.length} 个本地文档，Ctrl+C 退出`);
}

export async function start(flags: GenFlags = {}) {
  const timeLabel = chalk.green('总耗时');
  console.time(timeLabel);

  let resolved: { configs: Config[]; source: 'cli' | 'file'; configFile?: string };
  try {
    resolved = await resolveConfigs(flags);
  } catch (err) {
    if (err instanceof NoInputError) {
      printNoInputHint();
      return;
    }
    spinnerInstance.stop();
    conso.error(`配置解析失败: ${(err as Error).message || err}`);
    return;
  }

  conso.tips(
    resolved.source === 'cli'
      ? `使用命令行输入: ${flags.input}`
      : `发现配置文件: ${resolved.configFile}`
  );

  try {
    spinnerInstance.start('正在获取数据并生成代码... \n');
    await runAll(resolved.configs);
    spinnerInstance.stop();
  } catch (err) {
    spinnerInstance.stop();
    console.error('\n❌ 执行过程中发生错误:');
    console.error('错误信息:', (err as Error).message || err);
    if ((err as Error).stack) {
      console.error('错误堆栈:');
      console.error((err as Error).stack);
    }
    if ((err as any).cause) {
      console.error('错误原因:', (err as any).cause);
    }
    return conso.error('代码生成失败，请查看上方错误信息');
  }

  console.timeEnd(timeLabel);

  if (flags.watch) {
    watchConfigs(resolved.configs);
  }

  return null;
}

/** Map parsed yargs argv into GenFlags. */
function toFlags(argv: any): GenFlags {
  return {
    input: typeof argv.input === 'string' && argv.input ? argv.input : undefined,
    output: typeof argv.output === 'string' ? argv.output : undefined,
    name: typeof argv.name === 'string' ? argv.name : undefined,
    baseUrl: typeof argv.baseUrl === 'string' ? argv.baseUrl : undefined,
    client: argv.client !== false,
    watch: Boolean(argv.watch)
  };
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

  private genBuilder(y: yargs.Argv) {
    return y
      .positional('input', {
        type: 'string',
        describe: 'OpenAPI 文档地址（http(s) URL 或本地 JSON/YAML 文件）'
      })
      .option('output', {
        alias: 'o',
        type: 'string',
        describe: '输出目录（默认 src/api）'
      })
      .option('name', {
        alias: 'n',
        type: 'string',
        describe: '生成文件名称；使用配置文件时按 name 过滤'
      })
      .option('base-url', {
        type: 'string',
        describe: '运行时 baseURL（支持 [code]: 前缀）'
      })
      .option('client', {
        type: 'boolean',
        default: true,
        describe: '是否生成默认 request.ts（使用 --no-client 关闭）'
      })
      .option('watch', {
        alias: 'w',
        type: 'boolean',
        default: false,
        describe: '监听本地文档变化并自动重新生成'
      });
  }

  init() {
    return (
      yargs
        .scriptName('apits')
        .usage('Usage: $0 [gen] [input] [options]')
        // `init` must be declared before the default command so it is not
        // captured as the `input` positional.
        .command<any>(
          'init [input]',
          '生成 apits.config.ts 配置模板（可选）',
          y => {
            y.positional('input', {
              type: 'string',
              describe: '预填的接口文档地址（URL 或本地文件）'
            });
          },
          async (argv: any) => {
            await genConfig({ input: typeof argv.input === 'string' ? argv.input : undefined });
          }
        )
        // `gen` is also the default command: `apits <input>` works.
        // The default-command alias is hidden from help to keep it clean.
        .command<any>(
          'gen [input]',
          '根据 OpenAPI 文档生成接口类型声明和请求方法',
          (y: any) => this.genBuilder(y),
          (argv: any) => {
            start(toFlags(argv));
          }
        )
        .command<any>(
          '$0 [input]',
          false,
          (y: any) => this.genBuilder(y),
          (argv: any) => {
            start(toFlags(argv));
          }
        )
        .help()
    );
  }
}
