import type { EnvProvider } from './types.js';

/**
 * Reads environment variables directly from `process.env`.
 *
 * Use this as the final provider in a chain so that values set in the shell
 * environment (e.g. CI secrets, Docker env vars) can override .env file values.
 */
export class ProcessEnvProvider implements EnvProvider {
  readonly name = 'env';

  async load(keys: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const key of keys) {
      const value = process.env[key];
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }
}
