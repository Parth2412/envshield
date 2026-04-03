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
  constructor(
    message: string,
    public readonly providerName: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
