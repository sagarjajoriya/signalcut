import { Command } from "commander";
import { getVersion } from "../utils/version.js";
import { setVerbose } from "../utils/logger.js";
import { buildConfigCommand } from "./commands/config.js";
import { buildSummarizeCommand } from "./commands/summarize.js";
import { buildGithubCommand } from "./commands/github.js";
import { buildCompareCommand } from "./commands/compare.js";
import { buildCacheCommand } from "./commands/cache.js";
import { buildVersionCommand } from "./commands/version.js";

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("signalcut")
    .description(
      "Noise-free technical documentation and API research for developers (BYOK).",
    )
    .version(getVersion(), "-v, --version", "print the version")
    .option("--verbose", "print debug diagnostics to stderr", false)
    .configureHelp({ sortSubcommands: true })
    .showHelpAfterError('(run "signalcut --help" for usage)');

  // Apply global flags before any subcommand action runs.
  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts<{ verbose?: boolean }>();
    if (opts.verbose) setVerbose(true);
  });

  program.addCommand(buildConfigCommand());
  program.addCommand(buildSummarizeCommand());
  program.addCommand(buildGithubCommand());
  program.addCommand(buildCompareCommand());
  program.addCommand(buildCacheCommand());
  program.addCommand(buildVersionCommand());

  program.addHelpText(
    "after",
    `
Examples:
  $ signalcut config provider openai
  $ signalcut config set openai
  $ signalcut summarize https://docs.example.com
  $ signalcut github facebook/react
  $ signalcut compare express fastify
  $ signalcut config list

Privacy: your API key stays on this machine, encrypted at rest, and is sent
only to the provider you choose. See the README for the full privacy model.`,
  );

  return program;
}
