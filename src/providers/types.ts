/**
 * Every data source that can provide environment variable values must implement
 * this interface. Built-in providers: FileProvider ('file'), ProcessEnvProvider ('env'),
 * AwsSecretsManagerProvider ('aws'). Custom providers are supported as first-class citizens.
 */
export interface EnvProvider {
  /**
   * Human-readable name used in error messages and debug output.
   */
  readonly name: string;

  /**
   * Load values for the requested keys from this provider's source.
   *
   * @param keys - The env var keys the caller wants. Providers SHOULD filter
   *   to these keys where feasible (e.g. for AWS batch fetching), but are not
   *   required to — extra keys are silently ignored by the caller.
   * @returns A record containing only the keys that were found. Missing keys
   *   must be omitted (not set to `undefined`).
   */
  load(keys: string[]): Promise<Record<string, string>>;
}
