import { spawnSync } from 'node:child_process';
/**
 * Security tests: verify that frozen secrets cannot be inherited by child processes.
 *
 * After `freezeSecrets()` is called, the secret key is deleted from `process.env`.
 * Any child process spawned after that point inherits the parent's process.env,
 * which no longer contains the secret — making it inaccessible to subprocesses.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { freezeSecrets } from '../../src/core/protector.js';
import { s } from '../../src/core/schema.js';
import { Secret } from '../../src/core/secret.js';

describe('security: child process cannot inherit frozen secrets', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('child process cannot read a secret that was frozen before spawn', () => {
    const secretValue = 'envshield-test-secret-xyz-12345';
    const secretKey = 'ENVSHIELD_TEST_SECRET';

    // Simulate the secret existing in process.env (as if loaded from a .env file)
    process.env[secretKey] = secretValue;

    const schema = { [secretKey]: s.secret(z.string()) };
    const config = { [secretKey]: new Secret(secretValue) };

    // Freeze removes the key from process.env before spawning
    freezeSecrets(schema, config);

    expect(process.env[secretKey]).toBeUndefined();

    // Spawn a child process — it inherits our (now frozen) process.env
    const result = spawnSync(
      process.execPath,
      ['-e', `process.stdout.write(process.env.${secretKey} ?? 'NOT_FOUND')`],
      { encoding: 'utf-8', env: process.env },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('NOT_FOUND');
    expect(result.stdout).not.toContain(secretValue);
  });

  it('child process can still read non-secret env vars after freeze', () => {
    process.env.ENVSHIELD_TEST_SECRET = 'secret';
    process.env.ENVSHIELD_TEST_PORT = '4321';

    const schema = {
      ENVSHIELD_TEST_SECRET: s.secret(z.string()),
      ENVSHIELD_TEST_PORT: z.string(),
    };
    const config = {
      ENVSHIELD_TEST_SECRET: new Secret('secret'),
      ENVSHIELD_TEST_PORT: '4321',
    };

    freezeSecrets(schema, config);

    const result = spawnSync(
      process.execPath,
      ['-e', "process.stdout.write(process.env.ENVSHIELD_TEST_PORT ?? 'MISSING')"],
      { encoding: 'utf-8', env: process.env },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('4321');
  });

  it('multiple frozen secrets are all absent in child process', () => {
    process.env.ENVSHIELD_SEC_A = 'alpha';
    process.env.ENVSHIELD_SEC_B = 'beta';
    process.env.ENVSHIELD_PUBLIC = 'visible';

    const schema = {
      ENVSHIELD_SEC_A: s.secret(z.string()),
      ENVSHIELD_SEC_B: s.secret(z.string()),
      ENVSHIELD_PUBLIC: z.string(),
    };
    const config = {
      ENVSHIELD_SEC_A: new Secret('alpha'),
      ENVSHIELD_SEC_B: new Secret('beta'),
      ENVSHIELD_PUBLIC: 'visible',
    };

    freezeSecrets(schema, config);

    // Read all three keys in one child process invocation
    const script = [
      "const a = process.env.ENVSHIELD_SEC_A ?? 'FROZEN';",
      "const b = process.env.ENVSHIELD_SEC_B ?? 'FROZEN';",
      "const p = process.env.ENVSHIELD_PUBLIC ?? 'MISSING';",
      'process.stdout.write(JSON.stringify({ a, b, p }));',
    ].join('\n');

    const result = spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf-8',
      env: process.env,
    });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as { a: string; b: string; p: string };
    expect(output.a).toBe('FROZEN');
    expect(output.b).toBe('FROZEN');
    expect(output.p).toBe('visible');
  });
});
