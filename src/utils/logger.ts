import pc from "picocolors";

/**
 * Diagnostic logging goes to stderr so that stdout stays reserved for the
 * actual command output (a report, JSON, etc.). This keeps `signalcut ... > file`
 * and piping clean.
 */

let verbose = false;

export function setVerbose(value: boolean): void {
  verbose = value;
}

export const logger = {
  /** Primary program output. Goes to stdout. */
  output(text: string): void {
    process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  },

  info(message: string): void {
    process.stderr.write(`${message}\n`);
  },

  step(message: string): void {
    process.stderr.write(`${pc.dim("›")} ${pc.dim(message)}\n`);
  },

  success(message: string): void {
    process.stderr.write(`${pc.green("✓")} ${message}\n`);
  },

  warn(message: string): void {
    process.stderr.write(`${pc.yellow("!")} ${pc.yellow(message)}\n`);
  },

  error(message: string): void {
    process.stderr.write(`${pc.red("✗")} ${message}\n`);
  },

  hint(message: string): void {
    process.stderr.write(`  ${pc.dim("hint:")} ${pc.dim(message)}\n`);
  },

  debug(message: string): void {
    if (verbose) {
      process.stderr.write(`${pc.dim(`[debug] ${message}`)}\n`);
    }
  },
};
