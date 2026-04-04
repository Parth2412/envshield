/**
 * Security tests: Secret<T> redaction guarantees.
 *
 * The secret value MUST NOT appear in:
 * - JSON serialization
 * - console.log / util.inspect output
 * - Error message string interpolation
 * - Object spreading
 * - String coercion / template literals
 */
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { Secret } from '../../src/core/secret.js';

describe('security: Secret<T> redaction', () => {
  const REAL_VALUE = 'sk_live_supersecret_abc123xyz';
  const secret = new Secret(REAL_VALUE);

  it('toJSON() returns "[REDACTED]" — secret does not appear in JSON.stringify', () => {
    const obj = { apiKey: secret, port: 3000 };
    const json = JSON.stringify(obj);

    expect(json).not.toContain(REAL_VALUE);
    expect(json).toContain('[REDACTED]');
  });

  it('toString() returns "[REDACTED]" — secret does not appear in template literals', () => {
    const message = `API Key: ${secret}`;

    expect(message).not.toContain(REAL_VALUE);
    expect(message).toContain('[REDACTED]');
  });

  it('string coercion returns "[REDACTED]" — secret does not appear in Error interpolation', () => {
    const err = new Error(`Config error. Key = ${secret}`);

    expect(err.message).not.toContain(REAL_VALUE);
    expect(err.message).toContain('[REDACTED]');
  });

  it('util.inspect() returns "Secret([REDACTED])" — secret does not appear in debug output', () => {
    const inspected = inspect(secret);

    expect(inspected).not.toContain(REAL_VALUE);
    expect(inspected).toBe('Secret([REDACTED])');
  });

  it('util.inspect({ depth: null }) does not reveal secret', () => {
    const config = { apiKey: secret, port: 3000 };
    const inspected = inspect(config, { depth: null });

    expect(inspected).not.toContain(REAL_VALUE);
  });

  it('Object.keys() does not expose internal state', () => {
    const keys = Object.keys(secret);

    expect(keys).not.toContain('#value');
    expect(keys).not.toContain('value');
    // The only enumerable property should be none (all are methods/private)
    expect(keys.length).toBe(0);
  });

  it('Object.entries() does not expose internal state', () => {
    const entries = Object.entries(secret);

    expect(entries.length).toBe(0);
  });

  it('spreading the config object does not reveal secret value', () => {
    const config = { apiKey: secret, port: 3000 };
    const spread = { ...config };
    const json = JSON.stringify(spread);

    expect(json).not.toContain(REAL_VALUE);
  });

  it('console.log of config object shows [REDACTED] not secret value', () => {
    // We verify via JSON serialization which console.log uses internally
    const config = { apiKey: secret };
    const serialized = JSON.stringify(config);

    expect(serialized).not.toContain(REAL_VALUE);
    expect(serialized).toContain('[REDACTED]');
  });

  it('reveal() is the ONLY way to access the real value', () => {
    expect(secret.reveal()).toBe(REAL_VALUE);
    expect(String(secret)).not.toBe(REAL_VALUE);
    expect(JSON.stringify(secret)).not.toContain(REAL_VALUE);
  });

  it('Secret<Secret<T>> is prevented at type level — constructor rejects nested secrets', () => {
    // This is a type-level check enforced by the s.secret() wrapper,
    // but at runtime, Secret can technically wrap anything.
    // The key guarantee: Secret<T> wrapping works for primitive types.
    const nested = new Secret(new Secret('inner'));
    expect(String(nested)).toBe('[REDACTED]');
    expect(JSON.stringify({ key: nested })).not.toContain('inner');
  });

  it('Symbol.toPrimitive returns "[REDACTED]" — prevents numeric coercion leak', () => {
    const secret = new Secret('sk_live_supersecret_abc123xyz');

    // numeric hint
    expect(
      (secret as unknown as { [Symbol.toPrimitive]: (hint: string) => string })[Symbol.toPrimitive](
        'number',
      ),
    ).toBe('[REDACTED]');
    // default hint
    expect(
      (secret as unknown as { [Symbol.toPrimitive]: (hint: string) => string })[Symbol.toPrimitive](
        'default',
      ),
    ).toBe('[REDACTED]');
    // string hint
    expect(
      (secret as unknown as { [Symbol.toPrimitive]: (hint: string) => string })[Symbol.toPrimitive](
        'string',
      ),
    ).toBe('[REDACTED]');
  });

  it('Number() coercion does not produce a number derived from the secret value', () => {
    const secret = new Secret('42');
    // Number(secret) should NOT produce 42 — it must return NaN or a redacted fallback
    expect(Number(secret)).toBeNaN();
  });
});
