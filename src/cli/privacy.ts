import pc from "picocolors";
import { hasAcknowledgedPrivacy, acknowledgePrivacy } from "../storage/credentials.js";

const NOTICE = `
${pc.bold("SignalCut privacy model")}
  • Your API key is stored ${pc.bold("only on this machine")}, encrypted at rest
    (AES-256-GCM) under ~/.signalcut/.
  • SignalCut is BYOK: your key is sent ${pc.bold("only")} to the provider you choose
    (e.g. OpenAI) to run your requests. It goes nowhere else.
  • Your key is never logged and never printed — it is masked in all output.
  • You pay the provider directly for your own token usage.
`;

/**
 * Show the privacy notice once, the first time a user stores a key. Non-blocking:
 * it informs, records acknowledgement, and continues.
 */
export function showPrivacyNoticeOnce(): void {
  if (hasAcknowledgedPrivacy()) return;
  process.stderr.write(NOTICE + "\n");
  acknowledgePrivacy();
}
