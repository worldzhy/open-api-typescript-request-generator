/**
 * Detect dependencies and install missing ones automatically.
 */

import execa from 'execa';
import fs from 'fs-extra';
import path from 'path';
import consola from 'consola';
import prompt from 'prompts';

/**
 * Install a dependency package.
 * @param packageName package to install
 * @returns execa result
 */
export async function installPackage(packageName: string): Promise<any> {
  const hasLocalYarn = fs.existsSync(path.resolve(process.cwd(), 'yarn.lock'));
  const command = hasLocalYarn ? `yarn add ${packageName}@latest -D` : `npm install ${packageName}@latest -D`;
  consola.info(`Install ${packageName}@lastest with ${hasLocalYarn ? 'yarn' : 'npm'} \n`);
  const result = await execa(command, [], {
    stdio: 'inherit',
    shell: true
  });
  return result;
}

/**
 * Check whether a dependency package is installed, prompting to install if not.
 * @param packageName package to check
 * @returns execa result if installed, otherwise undefined
 */
export async function packageCheck(packageName: string): Promise<any> {
  const targetPackageJson = path.resolve(process.cwd(), 'package.json');
  try {
    const packJson: Record<string, any> = JSON.parse(fs.readFileSync(targetPackageJson, 'utf-8'));
    if (
      (!packJson.dependencies || !packJson.dependencies[packageName]) &&
      (!packJson.devDependencies || !packJson.devDependencies[packageName])
    ) {
      const answers = await prompt({
        message: `package.json中未检测到：${packageName}，是否安装?`,
        name: 'install',
        type: 'confirm',
        initial: 'y'
      });
      if (!answers.install) return;
      await installPackage(packageName);
    }
  } catch (e) {
    consola.error(e);
  }
}
