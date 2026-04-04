import type { StandardSchemaV1 } from '@standard-schema/spec';
import { s } from './core/schema.js';
import { Secret } from './core/secret.js';
import { validateEnv } from './core/validator.js';
import { EnvValidationError, ProviderError, SecretAccessError } from './errors/index.js';
import { ProcessEnvProvider } from './providers/env.js';
import { FileProvider } from './providers/file.js';
import type { EnvProvider } from './providers/types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type SchemaMap = Record<string, StandardSchemaV1<unknown, unknown>>;

type InferSchemaOutput<S extends SchemaMap> = {
  [K in keyof S]: S[K] extends StandardSchemaV1<unknown, infer O> ? O : never;
};

/** A string shorthand for a built-in provider, or a custom provider instance. */
type ProviderSpec = 'file' | 'env' | 'aws' | EnvProvider;

export interface EnvshieldOptions<S extends SchemaMap> {
  /** Schema map defining the expected env vars and their types. */
  schema: S;
  /**
   * Environment name (e.g. 'development', 'production').
   * Used to select `.env.{env}` files.
   * Defaults to `process.env.NODE_ENV ?? 'development'`.
   */
  env?: string;
  /**
   * Ordered list of providers. Values from later providers override earlier ones.
   * Accepts built-in string names ('file', 'env', 'aws') or custom `EnvProvider` instances.
   * Defaults to `['file', 'env']`.
   */
  providers?: ProviderSpec | ProviderSpec[];
  /**
   * Base directory for the 'file' provider.
   * Defaults to `process.cwd()`.
   */
  dir?: string;
}

// ── Provider resolution ───────────────────────────────────────────────────────

async function resolveProvider(spec: ProviderSpec, env: string, dir: string): Promise<EnvProvider> {
  if (spec === 'file') return new FileProvider({ dir, env });
  if (spec === 'env') return new ProcessEnvProvider();
  if (spec === 'aws') {
    // Lazy import to avoid loading the AWS provider module unconditionally
    const { AwsSecretsManagerProvider } = await import('./providers/aws.js');
    return new AwsSecretsManagerProvider();
  }
  return spec; // custom EnvProvider instance
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load, validate, and return typed environment configuration.
 *
 * @example
 * ```ts
 * const config = await envshield({
 *   schema: {
 *     DATABASE_URL: z.string().url(),
 *     PORT:         z.coerce.number().default(3000),
 *     API_KEY:      s.secret(z.string()),
 *     NODE_ENV:     z.enum(['development', 'production', 'test']).default('development'),
 *   },
 *   env: process.env.NODE_ENV ?? 'development',
 *   providers: ['file', 'env'],
 * });
 *
 * config.PORT;             // number
 * config.API_KEY.reveal(); // string — explicit secret access
 * envshield.freeze(config); // removes API_KEY from process.env
 * ```
 */
async function envshield<S extends SchemaMap>(
  options: EnvshieldOptions<S>,
): Promise<InferSchemaOutput<S>> {
  const {
    schema,
    env = process.env.NODE_ENV ?? 'development',
    providers: providerSpecs = ['file', 'env'],
    dir = process.cwd(),
  } = options;

  const specs: ProviderSpec[] = Array.isArray(providerSpecs) ? providerSpecs : [providerSpecs];
  const keys = Object.keys(schema);

  // Run providers in sequence — later providers win (last-wins semantics)
  const merged: Record<string, string> = {};
  for (const spec of specs) {
    const provider = await resolveProvider(spec, env, dir);
    const values = await provider.load(keys);
    Object.assign(merged, values);
  }

  return validateEnv(schema, merged);
}

/**
 * Remove all secret-valued keys from `process.env`.
 *
 * After calling this, child processes spawned by this process cannot inherit
 * the secret values. Non-secret config values remain in `process.env`.
 *
 * @param config - The config object returned by `envshield()`.
 */
envshield.freeze = function freeze(config: Record<string, unknown>): void {
  for (const key of Object.keys(config)) {
    if (config[key] instanceof Secret) {
      delete process.env[key];
    }
  }
};

// ── Exports ───────────────────────────────────────────────────────────────────

export { envshield, s, Secret };
export type { EnvProvider };
export { EnvValidationError, SecretAccessError, ProviderError };
