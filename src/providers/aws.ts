import { ProviderError } from '../errors/index.js';
import type { EnvProvider } from './types.js';

export interface AwsProviderOptions {
  /**
   * AWS region. Defaults to the `AWS_REGION` / `AWS_DEFAULT_REGION` environment
   * variable as resolved by the AWS SDK credential chain.
   */
  region?: string;

  /**
   * Prefix prepended to env var keys when looking up secrets in AWS, and stripped
   * when mapping secret names back to env var keys.
   *
   * Example: `secretsPrefix: '/myapp/prod/'`
   *   - env var key `DATABASE_URL` → AWS secret name `/myapp/prod/DATABASE_URL`
   *   - AWS secret name `/myapp/prod/DATABASE_URL` → env var key `DATABASE_URL`
   */
  secretsPrefix?: string;

  /**
   * TTL for the in-memory cache in milliseconds. Set to `0` to disable caching.
   * Default: `300_000` (5 minutes).
   *
   * Caching avoids AWS rate limiting when the config is re-evaluated at runtime.
   * The cache is per-provider-instance and is never persisted to disk.
   */
  cacheTtlMs?: number;
}

interface CacheEntry {
  value: string;
  expiresAt: number;
}

/**
 * Loads secrets from AWS Secrets Manager.
 *
 * **Credentials:** Always uses the AWS SDK default credential chain
 * (env vars → EC2/ECS IAM role → `~/.aws/credentials`).
 * Credentials are NEVER accepted as constructor arguments.
 *
 * **Required IAM permissions:**
 * - `secretsmanager:GetSecretValue`
 * - `secretsmanager:BatchGetSecretValue`
 *
 * **Lazy loading:** The `@aws-sdk/client-secrets-manager` package is imported
 * dynamically on first `load()` call — it is never loaded at module parse time.
 * Users who don't use the AWS provider pay zero bundle cost.
 *
 * @security Secret ARNs and values are NEVER included in thrown error messages.
 */
export class AwsSecretsManagerProvider implements EnvProvider {
  readonly name = 'aws';

  private readonly region: string | undefined;
  private readonly secretsPrefix: string;
  private readonly cacheTtlMs: number;
  // TTL-based in-memory cache — never persisted to disk
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: AwsProviderOptions = {}) {
    this.region = options.region;
    this.secretsPrefix = options.secretsPrefix ?? '';
    this.cacheTtlMs = options.cacheTtlMs ?? 300_000;
  }

  async load(keys: string[]): Promise<Record<string, string>> {
    if (keys.length === 0) return {};

    // Lazy import — AWS SDK is ONLY loaded when this method is actually called.
    // Never imported at the top of this module.
    const { SecretsManagerClient, BatchGetSecretValueCommand } = await import(
      '@aws-sdk/client-secrets-manager'
    );

    const now = Date.now();
    const result: Record<string, string> = {};
    const keysToFetch: string[] = [];

    // Serve from cache where available
    for (const key of keys) {
      const cached = this.cache.get(key);
      if (cached !== undefined && cached.expiresAt > now) {
        result[key] = cached.value;
      } else {
        keysToFetch.push(key);
      }
    }

    if (keysToFetch.length === 0) return result;

    // Map env var keys → AWS secret names via optional prefix
    const secretIds = keysToFetch.map((key) => `${this.secretsPrefix}${key}`);

    // BatchGetSecretValue supports a maximum of 100 secret IDs per call.
    // Chunk into batches to support callers with more than 100 secrets.
    const BATCH_SIZE = 100;
    const batches: string[][] = [];
    for (let i = 0; i < secretIds.length; i += BATCH_SIZE) {
      batches.push(secretIds.slice(i, i + BATCH_SIZE));
    }

    try {
      const clientConfig = this.region !== undefined ? { region: this.region } : {};
      const client = new SecretsManagerClient(clientConfig);

      for (const batch of batches) {
        const response = await client.send(new BatchGetSecretValueCommand({ SecretIdList: batch }));

        // Process successfully returned secrets
        for (const entry of response.SecretValues ?? []) {
          const rawName = entry.Name;
          const rawValue = entry.SecretString;

          if (rawName === undefined || rawValue === undefined) continue;

          // Strip prefix to recover env var key
          const key =
            this.secretsPrefix !== '' && rawName.startsWith(this.secretsPrefix)
              ? rawName.slice(this.secretsPrefix.length)
              : rawName;

          result[key] = rawValue;

          if (this.cacheTtlMs > 0) {
            this.cache.set(key, { value: rawValue, expiresAt: now + this.cacheTtlMs });
          }
        }

        // Process per-secret errors
        for (const errEntry of response.Errors ?? []) {
          if (errEntry.ErrorCode === 'ResourceNotFoundException') {
            // Secret simply doesn't exist — silently skip, caller handles missing keys
            continue;
          }
          // AccessDeniedException and other errors: throw without leaking the ARN/secret name
          throw new ProviderError(
            `AWS Secrets Manager denied access to a requested secret (${errEntry.ErrorCode ?? 'UnknownError'})`,
            'aws',
          );
        }
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      // Wrap SDK errors — do NOT include error.message if it might contain ARNs or secret values
      throw new ProviderError(
        'AWS Secrets Manager provider failed to load secrets. Check IAM permissions and network connectivity.',
        'aws',
        error,
      );
    }

    return result;
  }
}
