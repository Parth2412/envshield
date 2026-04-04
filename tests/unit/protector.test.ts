import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { freezeSecrets } from '../../src/core/protector.js';
import { s } from '../../src/core/schema.js';
import { Secret } from '../../src/core/secret.js';

describe('freezeSecrets', () => {
  // Snapshot and restore process.env around each test
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    // Remove keys that weren't there before
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) {
        delete process.env[key];
      }
    }
    // Restore keys that were removed or changed
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('deletes a secret-marked key from process.env', () => {
    process.env.API_KEY = 'super-secret-value';

    const schema = { API_KEY: s.secret(z.string()) };
    const config = { API_KEY: new Secret('super-secret-value') };

    freezeSecrets(schema, config);

    expect(process.env.API_KEY).toBeUndefined();
  });

  it('preserves non-secret keys in process.env', () => {
    process.env.API_KEY = 'secret';
    process.env.PORT = '3000';

    const schema = {
      API_KEY: s.secret(z.string()),
      PORT: z.coerce.number(),
    };
    const config = {
      API_KEY: new Secret('secret'),
      PORT: 3000,
    };

    freezeSecrets(schema, config);

    expect(process.env.PORT).toBe('3000');
  });

  it('removes multiple secret keys while leaving non-secrets intact', () => {
    process.env.API_KEY = 'key';
    process.env.DB_PASSWORD = 'pass';
    process.env.NODE_ENV = 'test';

    const schema = {
      API_KEY: s.secret(z.string()),
      DB_PASSWORD: s.secret(z.string()),
      NODE_ENV: z.string(),
    };
    const config = {
      API_KEY: new Secret('key'),
      DB_PASSWORD: new Secret('pass'),
      NODE_ENV: 'test',
    };

    freezeSecrets(schema, config);

    expect(process.env.API_KEY).toBeUndefined();
    expect(process.env.DB_PASSWORD).toBeUndefined();
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('is idempotent — calling twice does not throw and key stays removed', () => {
    process.env.API_KEY = 'secret';

    const schema = { API_KEY: s.secret(z.string()) };
    const config = { API_KEY: new Secret('secret') };

    expect(() => {
      freezeSecrets(schema, config);
      freezeSecrets(schema, config);
    }).not.toThrow();

    expect(process.env.API_KEY).toBeUndefined();
  });

  it('returns undefined (void)', () => {
    const schema = { API_KEY: s.secret(z.string()) };
    const config = { API_KEY: new Secret('secret') };

    const result = freezeSecrets(schema, config);

    expect(result).toBeUndefined();
  });

  it('does not modify the config object', () => {
    process.env.API_KEY = 'secret';

    const secret = new Secret('secret');
    const schema = { API_KEY: s.secret(z.string()) };
    const config = { API_KEY: secret };

    freezeSecrets(schema, config);

    expect(config.API_KEY).toBe(secret);
    expect(config.API_KEY.reveal()).toBe('secret');
  });

  it('handles schema with no secret fields without error', () => {
    process.env.PORT = '3000';

    const schema = { PORT: z.coerce.number() };
    const config = { PORT: 3000 };

    expect(() => freezeSecrets(schema, config)).not.toThrow();
    expect(process.env.PORT).toBe('3000');
  });

  it('handles empty schema without error', () => {
    expect(() => freezeSecrets({}, {})).not.toThrow();
  });

  it('does not error when secret key was already absent from process.env', () => {
    // API_KEY not set at all
    const schema = { API_KEY: s.secret(z.string()) };
    const config = { API_KEY: new Secret('value') };

    expect(() => freezeSecrets(schema, config)).not.toThrow();
    expect(process.env.API_KEY).toBeUndefined();
  });

  it('emits debug output to stderr when DEBUG includes "envshield"', () => {
    process.env.API_KEY = 'secret';
    process.env.DEBUG = 'envshield';

    const stderrWrites: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: unknown, ...args: unknown[]) => {
      stderrWrites.push(String(chunk));
      return originalWrite(chunk, ...(args as Parameters<typeof originalWrite>));
    };

    try {
      const schema = { API_KEY: s.secret(z.string()) };
      const config = { API_KEY: new Secret('secret') };
      freezeSecrets(schema, config);
    } finally {
      process.stderr.write = originalWrite;
    }

    expect(stderrWrites.some((msg) => msg.includes('envshield:debug'))).toBe(true);
    expect(stderrWrites.some((msg) => msg.includes('API_KEY'))).toBe(true);
  });

  it('does not emit debug output when DEBUG does not include "envshield"', () => {
    process.env.API_KEY = 'secret';
    process.env.DEBUG = 'other-module';

    const stderrWrites: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: unknown, ...args: unknown[]) => {
      stderrWrites.push(String(chunk));
      return originalWrite(chunk, ...(args as Parameters<typeof originalWrite>));
    };

    try {
      const schema = { API_KEY: s.secret(z.string()) };
      const config = { API_KEY: new Secret('secret') };
      freezeSecrets(schema, config);
    } finally {
      process.stderr.write = originalWrite;
    }

    expect(stderrWrites.some((msg) => msg.includes('envshield:debug'))).toBe(false);
  });
});
