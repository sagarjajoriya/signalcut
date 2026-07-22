import { Command } from "commander";
import { getVersion } from "../../utils/version.js";
import { logger } from "../../utils/logger.js";

export function buildVersionCommand(): Command {
  return new Command("version")
    .description("Print the SignalCut version")
    .action(() => {
      logger.output(getVersion());
    });
}
