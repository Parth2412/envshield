import { inspect } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { Secret } from '../../src/core/secret.js';

describe('Secret<T>', () => {
  describe('redaction', () => {
    it('toJSON() returns "[REDACTED]"', () => {
      const s = new Secret('my-api-key');
      expect(s.toJSON()).toBe('[REDACTED]');
    });

    it('toString() returns "[REDACTED]"', () => {
      const s = new Secret('my-api-key');
      expect(s.toString()).toBe('[REDACTED]');
    });

    it('util.inspect() returns "Secret([REDACTED])"', () => {
      const s = new Secret('my-api-key');
      expect(inspect(s)).toBe('Secret([REDACTED])');
    });

    it('JSON.stringify() produces "[REDACTED]"', () => {
      const obj = { apiKey: new Secret('my-api-key'), port: 3000 };
      const result = JSON.parse(JSON.stringify(obj));
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.port).toBe(3000);
    });

    it('template literal returns "[REDACTED]"', () => {
      const s = new Secret('my-api-key');
      expect(`Error: ${s}`).toBe('Error: [REDACTED]');
    });

    it('console.log does not reveal secret value', () => {
      const s = new Secret('super-secret-value');
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      console.log(s);
      const callArgs = logSpy.mock.calls[0];
      expect(JSON.stringify(callArgs)).not.toContain('super-secret-value');
      logSpy.mockRestore();
    });
  });

  describe('value access', () => {
    it('.reveal() returns the actual value', () => {
      const s = new Secret('my-api-key');
      expect(s.reveal()).toBe('my-api-key');
    });

    it('Object.keys() cannot access the value field', () => {
      const s = new Secret('my-api-key');
      expect(Object.keys(s)).not.toContain('value');
      expect(Object.keys(s)).not.toContain('#value');
    });

    it('spreading does not reveal secret', () => {
      const s = new Secret('my-api-key');
      const spread = { ...s };
      expect(JSON.stringify(spread)).not.toContain('my-api-key');
    });

    it('util.inspect with depth: null does not reveal secret', () => {
      const s = new Secret('my-api-key');
      const result = inspect(s, { depth: null });
      expect(result).not.toContain('my-api-key');
      expect(result).toContain('[REDACTED]');
    });
  });

  describe('type safety', () => {
    it('works with string values', () => {
      const s = new Secret('value');
      expect(s.reveal()).toBe('value');
    });

    it('works with number values', () => {
      const s = new Secret(42);
      expect(s.reveal()).toBe(42);
    });

    it('works with object values', () => {
      const s = new Secret({ token: 'abc', expiry: 12345 });
      expect(s.reveal()).toEqual({ token: 'abc', expiry: 12345 });
    });
  });
});
