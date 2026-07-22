import { Command } from "commander";
import { clearCache, cacheStats } from "../../storage/cache.js";
import { logger } from "../../utils/logger.js";

export function buildCacheCommand(): Command {
  const cache = new Command("cache").description("Manage the local analysis cache");

  cache
    .command("status")
    .description("Show cache location, entry count, and size")
    .action(() => {
      const { entries, bytes, dir } = cacheStats();
      logger.output(`Location: ${dir}`);
      logger.output(`Entries:  ${entries}`);
      logger.output(`Size:     ${formatBytes(bytes)}`);
    });

  cache
    .command("clear")
    .description("Delete all cached analyses")
    .action(() => {
      const removed = clearCache();
      logger.success(`Cleared ${removed} cache ${removed === 1 ? "entry" : "entries"}.`);
    });

  return cache;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
