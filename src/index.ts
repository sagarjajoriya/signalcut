import { buildProgram } from "./cli/program.js";
import { isSignalCutError } from "./utils/errors.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  if (isSignalCutError(error)) {
    logger.error(error.message);
    if (error.hint) logger.hint(error.hint);
    process.exitCode = error.exitCode;
    return;
  }

  // Unexpected: show the message and, when --verbose, the stack for debugging.
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Unexpected error: ${message}`);
  if (process.argv.includes("--verbose") && error instanceof Error && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  } else {
    logger.hint("Re-run with --verbose for a full stack trace.");
  }
  process.exitCode = 1;
});
