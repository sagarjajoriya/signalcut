/**
 * A user-facing error. Anything thrown as a SignalCutError is treated as an
 * expected, explainable failure: the CLI prints its message (and optional hint)
 * cleanly and exits non-zero, without a scary stack trace.
 *
 * Unexpected errors (bugs) are anything else and are surfaced with more detail.
 */
export class SignalCutError extends Error {
  readonly hint: string | undefined;
  readonly exitCode: number;

  constructor(
    message: string,
    options: { hint?: string; cause?: unknown; exitCode?: number } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "SignalCutError";
    this.hint = options.hint;
    this.exitCode = options.exitCode ?? 1;
  }
}

export function isSignalCutError(value: unknown): value is SignalCutError {
  return value instanceof SignalCutError;
}
