import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { s } from '../../src/core/schema.js';
import { Secret } from '../../src/core/secret.js';

describe('s.secret()', () => {
  describe('basic wrapping', () => {
    it('wraps a Zod string schema to produce Secret<string>', () => {
      const schema = s.secret(z.string());
      // Schema should have standard schema interface
      expect(schema['~standard']).toBeDefined();
    });

    it('parsed value is a Secret<string> instance', async () => {
      const schema = s.secret(z.string());
      const result = await schema['~standard'].validate('my-secret');
      expect(result.issues).toBeUndefined();
      if (!result.issues) {
        expect(result.value).toBeInstanceOf(Secret);
        expect(result.value.reveal()).toBe('my-secret');
      }
    });

    it('parsed value is Secret<number> for number schema', async () => {
      const schema = s.secret(z.coerce.number());
      const result = await schema['~standard'].validate('42');
      expect(result.issues).toBeUndefined();
      if (!result.issues) {
        expect(result.value).toBeInstanceOf(Secret);
        expect(result.value.reveal()).toBe(42);
      }
    });

    it('validation errors propagate correctly', async () => {
      const schema = s.secret(z.string().url());
      const result = await schema['~standard'].validate('not-a-url');
      expect(result.issues).toBeDefined();
      expect(result.issues?.length).toBeGreaterThan(0);
    });
  });

  describe('secret marking', () => {
    it('schema is marked as a secret schema via isSecret property', () => {
      const schema = s.secret(z.string());
      expect((schema as { isSecret?: boolean }).isSecret).toBe(true);
    });

    it('regular schema is NOT marked as secret', () => {
      const schema = z.string();
      expect((schema as { isSecret?: boolean }).isSecret).toBeUndefined();
    });
  });

  describe('redaction of parsed secrets', () => {
    it('parsed Secret value is redacted in JSON', async () => {
      const schema = s.secret(z.string());
      const result = await schema['~standard'].validate('my-secret-value');
      if (!result.issues) {
        expect(JSON.stringify({ key: result.value })).toBe('{"key":"[REDACTED]"}');
      }
    });
  });
});
