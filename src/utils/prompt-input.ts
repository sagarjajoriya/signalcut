import readline from "node:readline";
import { SignalCutError } from "./errors.js";

/**
 * Prompt for a secret on a TTY without echoing keystrokes. If stdin is not a
 * TTY (piped / CI), read the whole stream instead — this lets users do
 * `echo $KEY | signalcut config set openai` without exposing the key in argv
 * or shell history.
 */
export async function promptSecret(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return readAllStdin();
  }

  return new Promise<string>((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });

    // Suppress echo: readline still needs the prompt itself printed once.
    let promptShown = false;
    const rlInternal = rl as unknown as {
      _writeToOutput: (chunk: string) => void;
    };
    rlInternal._writeToOutput = (chunk: string) => {
      if (!promptShown) {
        process.stderr.write(chunk);
        promptShown = true;
      }
      // Swallow everything after the prompt (the typed characters).
    };

    rl.question(question, (answer) => {
      rl.close();
      process.stderr.write("\n");
      resolve(answer.trim());
    });

    rl.on("SIGINT", () => {
      rl.close();
      process.stderr.write("\n");
      reject(new SignalCutError("Cancelled.", { exitCode: 130 }));
    });
  });
}

/** Prompt for a plain yes/no confirmation on a TTY. Defaults to no. */
export async function promptConfirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return false;
  }
  return new Promise<boolean>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

function readAllStdin(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim()));
    process.stdin.on("error", (err) =>
      reject(new SignalCutError("Failed to read from stdin.", { cause: err })),
    );
  });
}
