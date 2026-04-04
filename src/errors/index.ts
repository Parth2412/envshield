export class EnvValidationError extends Error {
  constructor(
    message: string,
    public readonly fields: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'EnvValidationError';
  }
}

export class SecretAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretAccessError';
  }
}

export class ProviderError extends Error {
  readonly providerName: string;

  constructor(message: string, providerName: string, cause?: unknown) {
    // Pass cause via super() so it is stored as a non-enumerable native Error.cause.
    // Do NOT store cause as a public field — SDK errors can contain ARNs, account IDs,
    // and secret names that would be exposed by JSON.stringify or loggers.
    super(message, { cause });
    this.name = 'ProviderError';
    this.providerName = providerName;
  }
}
