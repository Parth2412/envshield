/**
 * Tests for the public `envshield()` API and `envshield.freeze()`.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Mock AWS SDK for 'aws' provider shorthand test
const mockSend = vi.fn();
vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn(() => ({ send: mockSend })),
  BatchGetSecretValueCommand: vi.fn((input: unknown) => ({ _input: input })),
}));
import { Secret } from '../../src/core/secret.js';
import { EnvValidationError } from '../../src/errors/index.js';
import { envshield, s } from '../../src/index.js';
import { ProcessEnvProvider } from '../../src/providers/env.js';

describe('envshield()', () => {
  let testDir: string;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    testDir = join(tmpdir(), `envshield-api-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  describe('basic loading', () => {
    it('loads and validates env vars from .env file', async () => {
      writeFileSync(join(testDir, '.env'), 'PORT=4000\nAPP_NAME=myapp\n');

      const config = await envshield({
        schema: {
          PORT: z.coerce.number(),
          APP_NAME: z.string(),
        },
        env: 'development',
        providers: ['file'],
        dir: testDir,
      });

      expect(config.PORT).toBe(4000);
      expect(config.APP_NAME).toBe('myapp');
    });

    it('returns typed Secret<T> for s.secret() fields', async () => {
      writeFileSync(join(testDir, '.env'), 'API_KEY=tok_live_xyz\nPORT=3000\n');

      const config = await envshield({
        schema: {
          API_KEY: s.secret(z.string()),
          PORT: z.coerce.number(),
        },
        env: 'development',
        providers: ['file'],
        dir: testDir,
      });

      expect(config.API_KEY).toBeInstanceOf(Secret);
      expect(config.API_KEY.reveal()).toBe('tok_live_xyz');
      expect(String(config.API_KEY)).toBe('[REDACTED]');
      expect(config.PORT).toBe(3000);
    });

    it('reads from process.env when providers includes "env"', async () => {
      process.env.ENVSHIELD_TEST_VAR = 'from-process-env';

      const config = await envshield({
        schema: { ENVSHIELD_TEST_VAR: z.string() },
        providers: ['env'],
      });

      expect(config.ENVSHIELD_TEST_VAR).toBe('from-process-env');
    });

    it('later provider wins (env overrides file)', async () => {
      writeFileSync(join(testDir, '.env'), 'PORT=3000\n');
      process.env.PORT = '9999';

      const config = await envshield({
        schema: { PORT: z.coerce.number() },
        env: 'development',
        providers: ['file', 'env'], // env wins
        dir: testDir,
      });

      expect(config.PORT).toBe(9999);
    });

    it('accepts a custom EnvProvider instance', async () => {
      process.env.CUSTOM_KEY = 'custom-value';

      const config = await envshield({
        schema: { CUSTOM_KEY: z.string() },
        providers: [new ProcessEnvProvider()],
      });

      expect(config.CUSTOM_KEY).toBe('custom-value');
    });
  });

  describe('defaults', () => {
    it('uses ["file", "env"] providers by default', async () => {
      // When no providers option is given, env vars should be readable
      process.env.ENVSHIELD_DEFAULT_TEST = 'default-provider-works';

      const config = await envshield({
        schema: { ENVSHIELD_DEFAULT_TEST: z.string() },
        // no providers specified — defaults to ['file', 'env']
      });

      expect(config.ENVSHIELD_DEFAULT_TEST).toBe('default-provider-works');
    });

    it('accepts a single provider (not an array)', async () => {
      process.env.SINGLE_PROVIDER_TEST = 'works';

      const config = await envshield({
        schema: { SINGLE_PROVIDER_TEST: z.string() },
        providers: 'env',
      });

      expect(config.SINGLE_PROVIDER_TEST).toBe('works');
    });
  });

  describe('validation errors', () => {
    it('throws EnvValidationError when a required var is missing', async () => {
      await expect(
        envshield({
          schema: { MISSING_VAR: z.string() },
          providers: ['env'],
        }),
      ).rejects.toThrow(EnvValidationError);
    });

    it('throws EnvValidationError with field-level details', async () => {
      await expect(
        envshield({
          schema: { MISSING_VAR: z.string() },
          providers: ['env'],
        }),
      ).rejects.toSatisfy((err: unknown) => {
        if (!(err instanceof EnvValidationError)) return false;
        return 'MISSING_VAR' in err.fields;
      });
    });

    it('aggregates multiple validation errors in one throw', async () => {
      await expect(
        envshield({
          schema: {
            MISSING_A: z.string(),
            MISSING_B: z.string(),
          },
          providers: ['env'],
        }),
      ).rejects.toSatisfy((err: unknown) => {
        if (!(err instanceof EnvValidationError)) return false;
        return 'MISSING_A' in err.fields && 'MISSING_B' in err.fields;
      });
    });
  });

  describe('envshield.freeze()', () => {
    it('removes Secret-valued keys from process.env', async () => {
      writeFileSync(join(testDir, '.env'), 'SECRET_TOKEN=tok_live\nPORT=5000\n');
      process.env.SECRET_TOKEN = 'tok_live';
      process.env.PORT = '5000';

      const config = await envshield({
        schema: {
          SECRET_TOKEN: s.secret(z.string()),
          PORT: z.coerce.number(),
        },
        env: 'development',
        providers: ['file'],
        dir: testDir,
      });

      envshield.freeze(config);

      expect(process.env.SECRET_TOKEN).toBeUndefined();
      expect(process.env.PORT).toBe('5000'); // non-secret preserved
    });

    it('does not affect the config object after freeze', async () => {
      process.env.API_SECRET = 'my-secret';

      const config = await envshield({
        schema: { API_SECRET: s.secret(z.string()) },
        providers: ['env'],
      });

      envshield.freeze(config);

      expect(config.API_SECRET.reveal()).toBe('my-secret');
    });

    it('is idempotent — freeze twice does not throw', async () => {
      process.env.API_SECRET = 'secret';

      const config = await envshield({
        schema: { API_SECRET: s.secret(z.string()) },
        providers: ['env'],
      });

      expect(() => {
        envshield.freeze(config);
        envshield.freeze(config);
      }).not.toThrow();
    });
  });

  describe('multi-env inheritance', () => {
    it('applies env-specific overrides', async () => {
      writeFileSync(join(testDir, '.env'), 'DB_URL=postgres://localhost/base\n');
      writeFileSync(join(testDir, '.env.production'), 'DB_URL=postgres://prod-host/app\n');

      const config = await envshield({
        schema: { DB_URL: z.string() },
        env: 'production',
        providers: ['file'],
        dir: testDir,
      });

      expect(config.DB_URL).toBe('postgres://prod-host/app');
    });
  });

  describe('"aws" provider shorthand', () => {
    it('resolves "aws" string to AwsSecretsManagerProvider and loads secrets', async () => {
      mockSend.mockResolvedValueOnce({
        SecretValues: [{ Name: 'MY_AWS_SECRET', SecretString: 'aws-value' }],
        Errors: [],
      });

      const config = await envshield({
        schema: { MY_AWS_SECRET: z.string() },
        providers: ['aws'],
      });

      expect(config.MY_AWS_SECRET).toBe('aws-value');
    });
  });
});
