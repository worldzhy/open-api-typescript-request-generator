import consola, {ConsolaLogObject} from 'consola';
import chalk from 'chalk';

/**
 * Log a plain message.
 * @param message message to log
 * @param args extra arguments
 */
export function log(message: ConsolaLogObject | any, ...args: any[]): void {
  consola.log(message, ...args);
}

/**
 * Log an error message.
 * @param message message to log
 * @param args extra arguments
 */
export function error(message: ConsolaLogObject | any, ...args: any[]): void {
  consola.error(chalk.magenta(message), ...args);
}

/**
 * Log an info message.
 * @param message message to log
 * @param args extra arguments
 */
export function info(message: ConsolaLogObject | any, ...args: any[]): void {
  consola.info(chalk.yellowBright(message), ...args);
}

/**
 * Log a warning message.
 * @param message message to log
 * @param args extra arguments
 */
export function warn(message: ConsolaLogObject | any, ...args: any[]): void {
  consola.warn(chalk.blue(message), ...args);
}

/**
 * Log a soft tip message.
 * @param message message to log
 * @param args extra arguments
 */
export function tips(message: ConsolaLogObject | any, ...args: any[]): void {
  consola.log(chalk.yellow(`🔈 ${message}\n`), ...args);
}

/**
 * Log a success message.
 * @param message message to log
 * @param args extra arguments
 */
export function success(message: ConsolaLogObject | any, ...args: any[]): void {
  consola.success(chalk.cyan(message), ...args);
}

/**
 * Print tabular data as a table.
 * @param tabularData data to display
 * @param properties properties to show
 */
export function table(tabularData: any, properties?: ReadonlyArray<string>): void {
  // eslint-disable-next-line no-console
  console.table(tabularData, properties);
}

/**
 * Print a separator line (or a blank line).
 * @param blank whether to print a blank line
 */
export function line(blank?: boolean) {
  consola.log(`\n${!blank ? '-----------------------' : ''}`);
}
