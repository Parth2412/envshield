import { loadEnvFiles } from '../core/loader.js';
import type { EnvProvider } from './types.js';

export interface FileProviderOptions {
  /** Directory to look for .env files in. Defaults to `process.cwd()`. */
  dir?: string;
  /** Environment name (e.g. 'development', 'production'). Drives file selection. */
  env: string;
}

/**
 * Loads environment variables from .env files using the multi-env inheritance chain:
 * `.env` → `.env.local` → `.env.{env}` → `.env.{env}.local`
 *
 * Missing files are silently skipped. Later files win (last-wins semantics).
 */
export class FileProvider implements EnvProvider {
  readonly name = 'file';

  private readonly dir: string;
  private readonly env: string;

  constructor(options: FileProviderOptions) {
    this.dir = options.dir ?? process.cwd();
    this.env = options.env;
  }

  async load(keys: string[]): Promise<Record<string, string>> {
    const all = await loadEnvFiles(this.dir, this.env);

    // Return only the requested keys that are present in the loaded values
    const result: Record<string, string> = {};
    for (const key of keys) {
      const value = all[key];
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }
}
