import { Command } from "commander";
import pc from "picocolors";
import {
  listProviders,
  getProviderInfo,
  isKnownProvider,
} from "../../providers/registry.js";
import {
  setActiveProvider,
  getActiveProvider,
  setProviderModel,
  getProviderModel,
  setKey,
  deleteKey,
  hasKey,
  getStoredKey,
  resetAll,
  setGithubToken,
  getGithubToken,
  deleteGithubToken,
} from "../../storage/credentials.js";
import { homeDir } from "../../storage/paths.js";
import { maskSecret } from "../../utils/mask.js";
import { logger } from "../../utils/logger.js";
import { SignalCutError } from "../../utils/errors.js";
import { promptSecret, promptConfirm } from "../../utils/prompt-input.js";
import { showPrivacyNoticeOnce } from "../privacy.js";

export function buildConfigCommand(): Command {
  const config = new Command("config").description(
    "Manage providers, API keys, and settings",
  );

  config
    .command("provider <id>")
    .description("Set the active LLM provider (openai, anthropic, gemini)")
    .action((id: string) => {
      requireKnownProvider(id);
      setActiveProvider(id);
      const info = getProviderInfo(id)!;
      logger.success(`Active provider set to ${info.label}.`);
      if (!info.implemented) {
        logger.warn(`${info.label} isn't implemented yet — Phase 1 supports OpenAI.`);
      }
      if (!hasKey(id)) {
        logger.hint(`Add a key with "signalcut config set ${id}".`);
      }
    });

  config
    .command("set [id]")
    .description("Store an API key for a provider (prompts securely)")
    .action(async (id?: string) => {
      const providerId = id ?? getActiveProvider();
      if (!providerId) {
        throw new SignalCutError("No provider specified and none is active.", {
          hint: 'Run "signalcut config provider openai" first, or pass an id: "signalcut config set openai".',
        });
      }
      requireKnownProvider(providerId);
      await storeKeyInteractive(providerId);
    });

  // `signalcut config key` — set the key for the active provider (spec alias).
  config
    .command("key")
    .description("Store an API key for the active provider")
    .action(async () => {
      const providerId = getActiveProvider();
      if (!providerId) {
        throw new SignalCutError("No active provider.", {
          hint: 'Run "signalcut config provider openai" first.',
        });
      }
      await storeKeyInteractive(providerId);
    });

  config
    .command("list")
    .alias("ls")
    .description("List providers, active selection, and key status")
    .action(() => {
      printProviderList();
    });

  config
    .command("model <id> <model>")
    .description("Set the model to use for a provider")
    .action((id: string, model: string) => {
      requireKnownProvider(id);
      setProviderModel(id, model);
      logger.success(`Model for ${getProviderInfo(id)!.label} set to ${model}.`);
    });

  config
    .command("remove <id>")
    .alias("unset")
    .description("Delete the stored API key for a provider")
    .action((id: string) => {
      requireKnownProvider(id);
      const removed = deleteKey(id);
      if (removed) {
        logger.success(`Removed stored key for ${getProviderInfo(id)!.label}.`);
      } else {
        logger.info(`No stored key for ${getProviderInfo(id)!.label}.`);
      }
    });

  config
    .command("github-token")
    .description("Store a GitHub token to raise API rate limits (prompts securely)")
    .option("--remove", "remove the stored GitHub token")
    .action(async (opts: { remove?: boolean }) => {
      if (opts.remove) {
        logger.info(
          deleteGithubToken()
            ? "Removed stored GitHub token."
            : "No GitHub token was stored.",
        );
        return;
      }
      showPrivacyNoticeOnce();
      logger.info(
        `Create a token at: ${pc.underline("https://github.com/settings/tokens")} (no scopes needed for public repos)`,
      );
      const token = await promptSecret("Paste your GitHub token: ");
      if (!token) throw new SignalCutError("No token entered.");
      setGithubToken(token);
      logger.success(`Stored GitHub token (${maskSecret(token)}).`);
    });

  config
    .command("path")
    .description("Print the config directory location")
    .action(() => {
      logger.output(homeDir());
    });

  config
    .command("reset")
    .description("Delete ALL local SignalCut data (keys, config, master key)")
    .action(async () => {
      const confirmed = await promptConfirm(
        pc.yellow("This deletes all stored keys and settings. Continue?"),
      );
      if (!confirmed) {
        logger.info("Aborted.");
        return;
      }
      resetAll();
      logger.success("All local SignalCut data removed.");
    });

  return config;
}

async function storeKeyInteractive(providerId: string): Promise<void> {
  const info = getProviderInfo(providerId)!;
  showPrivacyNoticeOnce();

  logger.info(`Get a key at: ${pc.underline(info.keysUrl)}`);
  const key = await promptSecret(`Paste your ${info.label} API key: `);
  if (!key) {
    throw new SignalCutError("No key entered.");
  }

  setKey(providerId, key);
  // Confirm using the masked form only — never echo the raw key.
  logger.success(`Stored ${info.label} key (${maskSecret(key)}).`);

  if (getActiveProvider() !== providerId) {
    logger.hint(`Make it active with "signalcut config provider ${providerId}".`);
  }
}

function printProviderList(): void {
  const active = getActiveProvider();
  logger.output(pc.bold("Providers"));
  logger.output("");

  for (const info of listProviders()) {
    const isActive = info.id === active;
    const marker = isActive ? pc.green("●") : pc.dim("○");
    const stored = hasKey(info.id);
    const keyState = stored
      ? pc.green(`key ${maskSecret(getStoredKey(info.id)!)}`)
      : process.env[info.envVar]
        ? pc.cyan(`env ${info.envVar}`)
        : pc.dim("no key");
    const model = getProviderModel(info.id) ?? info.defaultModel;
    const status = info.implemented ? "" : pc.dim(" (coming soon)");

    logger.output(
      `${marker} ${pc.bold(info.label.padEnd(16))} ${keyState.padEnd(28)} ${pc.dim(`model: ${model}`)}${status}`,
    );
  }

  logger.output("");
  const token = getGithubToken();
  const ghState = token
    ? pc.green(`stored ${maskSecret(token)}`)
    : process.env.GITHUB_TOKEN
      ? pc.cyan("env GITHUB_TOKEN")
      : pc.dim("not set (optional)");
  logger.output(`${pc.dim("GitHub token:")} ${ghState}`);

  logger.output(
    active
      ? pc.dim(`Active provider: ${active}`)
      : pc.dim('No active provider. Run "signalcut config provider openai".'),
  );
}

function requireKnownProvider(id: string): void {
  if (!isKnownProvider(id)) {
    const known = listProviders()
      .map((p) => p.id)
      .join(", ");
    throw new SignalCutError(`Unknown provider "${id}".`, {
      hint: `Known providers: ${known}.`,
    });
  }
}
