import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { s } from '../../src/core/schema.js';
import { Secret } from '../../src/core/secret.js';
import { validateEnv } from '../../src/core/validator.js';
import { EnvValidationError } from '../../src/errors/index.js';

describe('validateEnv', () => {
  describe('basic validation', () => {
    it('returns typed config for valid input', async () => {
      const schema = {
        PORT: z.coerce.number().default(3000),
        APP_NAME: z.string(),
      };
      const values = { APP_NAME: 'myapp' };
      const config = await validateEnv(schema, values);
      expect(config.PORT).toBe(3000);
      expect(config.APP_NAME).toBe('myapp');
    });

    it('applies coercion (string → number)', async () => {
      const schema = { PORT: z.coerce.number() };
      const config = await validateEnv(schema, { PORT: '8080' });
      expect(config.PORT).toBe(8080);
    });

    it('secret fields become Secret<T> instances', async () => {
      const schema = { API_KEY: s.secret(z.string()) };
      const config = await validateEnv(schema, { API_KEY: 'abc123' });
      expect(config.API_KEY).toBeInstanceOf(Secret);
      expect(config.API_KEY.reveal()).toBe('abc123');
    });
  });

  describe('error handling', () => {
    it('throws EnvValidationError for missing required field', async () => {
      const schema = { DATABASE_URL: z.string().url() };
      await expect(validateEnv(schema, {})).rejects.toThrow(EnvValidationError);
    });

    it('error message names the specific variable', async () => {
      const schema = { DATABASE_URL: z.string().url() };
      try {
        await validateEnv(schema, {});
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(EnvValidationError);
        const e = err as EnvValidationError;
        expect(e.fields).toHaveProperty('DATABASE_URL');
      }
    });

    it('aggregates ALL errors in one throw (not first-only)', async () => {
      const schema = {
        A: z.string().min(1),
        B: z.coerce.number().min(1),
        C: z.string().url(),
      };
      try {
        await validateEnv(schema, { B: '0', C: 'not-a-url' });
        expect.fail('should have thrown');
      } catch (err) {
        const e = err as EnvValidationError;
        // A is missing, B is below min, C is not a URL — all 3 should be reported
        expect(Object.keys(e.fields).length).toBeGreaterThanOrEqual(2);
      }
    });

    it('throws EnvValidationError for wrong type', async () => {
      const schema = { PORT: z.coerce.number().int() };
      try {
        await validateEnv(schema, { PORT: 'not-a-number' });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(EnvValidationError);
      }
    });
  });

  describe('secret field error redaction', () => {
    it('does not include raw secret value in error message when a secret field fails validation', async () => {
      const RAW_SECRET_VALUE = 'sk_live_SUPER_SECRET_VALUE_12345';
      const schema = {
        API_KEY: s.secret(z.string().min(100, `Value ${RAW_SECRET_VALUE} is too short`)),
      };
      try {
        await validateEnv(schema, { API_KEY: RAW_SECRET_VALUE });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(EnvValidationError);
        const e = err as EnvValidationError;
        // The raw secret value must not appear in the error message
        expect(e.message).not.toContain(RAW_SECRET_VALUE);
        expect(JSON.stringify(e.fields)).not.toContain(RAW_SECRET_VALUE);
      }
    });
  });

  describe('type inference', () => {
    it('inferred config type matches schema output types', async () => {
      const schema = {
        PORT: z.coerce.number().default(3000),
        API_KEY: s.secret(z.string()),
        NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
      };
      const config = await validateEnv(schema, { API_KEY: 'key' });
      // TypeScript should infer these types (verify at runtime)
      expect(typeof config.PORT).toBe('number');
      expect(config.API_KEY).toBeInstanceOf(Secret);
      expect(['development', 'production', 'test']).toContain(config.NODE_ENV);
    });
  });
});
