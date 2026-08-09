export class CliError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly showUsage: boolean;

  constructor(code: string, message: string, options?: { exitCode?: number; showUsage?: boolean }) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = options?.exitCode ?? 1;
    this.showUsage = options?.showUsage ?? false;
  }
}

export function invalidArgument(message: string): CliError {
  return new CliError("INVALID_ARGUMENT", message, { exitCode: 2, showUsage: true });
}

export function normalizeCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  return new CliError("UNEXPECTED", "Unexpected CLI failure. Check configuration and try again.");
}
