import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { freezeSecrets } from '../../src/core/protector.js';
import { s } from '../../src/core/schema.js';
import { validateEnv } from '../../src/core/validator.js';
import { ProcessEnvProvider } from '../../src/providers/env.js';
import { FileProvider } from '../../src/providers/file.js';
import type { EnvProvider } from '../../src/providers/types.js';

// ── FileProvider ──────────────────────────────────────────────────────────────

describe('FileProvider', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `envshield-file-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('implements the EnvProvider interface', () => {
    const provider: EnvProvider = new FileProvider({ dir: testDir, env: 'development' });
    expect(provider.name).toBeDefined();
    expect(typeof provider.load).toBe('function');
  });

  it('has name "file"', () => {
    const provider = new FileProvider({ dir: testDir, env: 'development' });
    expect(provider.name).toBe('file');
  });

  it('loads requested keys from a .env file', async () => {
    writeFileSync(join(testDir, '.env'), 'PORT=3000\nAPI_KEY=secret\nUNUSED=ignored\n');

    const provider = new FileProvider({ dir: testDir, env: 'development' });
    const result = await provider.load(['PORT', 'API_KEY']);

    expect(result.PORT).toBe('3000');
    expect(result.API_KEY).toBe('secret');
  });

  it('does not return keys that were not requested', async () => {
    writeFileSync(join(testDir, '.env'), 'PORT=3000\nUNUSED=ignored\n');

    const provider = new FileProvider({ dir: testDir, env: 'development' });
    const result = await provider.load(['PORT']);

    expect('UNUSED' in result).toBe(false);
  });

  it('returns empty object when requested key is absent from all .env files', async () => {
    writeFileSync(join(testDir, '.env'), 'OTHER=value\n');

    const provider = new FileProvider({ dir: testDir, env: 'development' });
    const result = await provider.load(['NOT_PRESENT']);

    expect(result).toEqual({});
  });

  it('returns empty object when no .env files exist', async () => {
    const provider = new FileProvider({ dir: testDir, env: 'development' });
    const result = await provider.load(['PORT']);

    expect(result).toEqual({});
  });

  it('respects the inheritance chain (last-wins)', async () => {
    writeFileSync(join(testDir, '.env'), 'KEY=base\n');
    writeFileSync(join(testDir, '.env.local'), 'KEY=local\n');
    writeFileSync(join(testDir, '.env.staging'), 'KEY=staging\n');

    const provider = new FileProvider({ dir: testDir, env: 'staging' });
    const result = await provider.load(['KEY']);

    // .env.staging overrides .env.local which overrides .env
    expect(result.KEY).toBe('staging');
  });

  it('loads all requested keys present across the inheritance chain', async () => {
    writeFileSync(join(testDir, '.env'), 'BASE_KEY=from-base\n');
    writeFileSync(join(testDir, '.env.production'), 'PROD_KEY=from-prod\n');

    const provider = new FileProvider({ dir: testDir, env: 'production' });
    const result = await provider.load(['BASE_KEY', 'PROD_KEY']);

    expect(result.BASE_KEY).toBe('from-base');
    expect(result.PROD_KEY).toBe('from-prod');
  });
});

// ── ProcessEnvProvider ────────────────────────────────────────────────────────

describe('ProcessEnvProvider', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('implements the EnvProvider interface', () => {
    const provider: EnvProvider = new ProcessEnvProvider();
    expect(provider.name).toBeDefined();
    expect(typeof provider.load).toBe('function');
  });

  it('has name "env"', () => {
    expect(new ProcessEnvProvider().name).toBe('env');
  });

  it('reads requested keys from process.env', async () => {
    process.env.ENVSHIELD_INT_PORT = '9000';
    process.env.ENVSHIELD_INT_DB = 'postgres://localhost/test';

    const provider = new ProcessEnvProvider();
    const result = await provider.load(['ENVSHIELD_INT_PORT', 'ENVSHIELD_INT_DB']);

    expect(result.ENVSHIELD_INT_PORT).toBe('9000');
    expect(result.ENVSHIELD_INT_DB).toBe('postgres://localhost/test');
  });

  it('omits keys that are undefined in process.env', async () => {
    const provider = new ProcessEnvProvider();
    const result = await provider.load(['DEFINITELY_NOT_SET_XYZ_12345']);

    expect(result).toEqual({});
    expect('DEFINITELY_NOT_SET_XYZ_12345' in result).toBe(false);
  });

  it('does not return keys that were not requested', async () => {
    process.env.ENVSHIELD_INT_REQUESTED = 'yes';
    process.env.ENVSHIELD_INT_OTHER = 'no';

    const provider = new ProcessEnvProvider();
    const result = await provider.load(['ENVSHIELD_INT_REQUESTED']);

    expect('ENVSHIELD_INT_OTHER' in result).toBe(false);
  });
});

// ── End-to-end: file provider → validate → freeze ────────────────────────────

describe('end-to-end: file provider → validate → freeze', () => {
  let testDir: string;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    testDir = join(tmpdir(), `envshield-e2e-${Date.now()}`);
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

  it('full flow: load → validate → typed config with Secret<T> and primitives', async () => {
    writeFileSync(
      join(testDir, '.env'),
      'DATABASE_URL=postgres://localhost/app\nPORT=4000\nAPI_SECRET=tok_live_abc123\n',
    );

    const schema = {
      DATABASE_URL: z.string().url(),
      PORT: z.coerce.number(),
      API_SECRET: s.secret(z.string()),
    };

    const provider = new FileProvider({ dir: testDir, env: 'development' });
    const values = await provider.load(Object.keys(schema));
    const config = await validateEnv(schema, values);

    expect(config.DATABASE_URL).toBe('postgres://localhost/app');
    expect(config.PORT).toBe(4000);
    expect(config.API_SECRET.reveal()).toBe('tok_live_abc123');
    expect(String(config.API_SECRET)).toBe('[REDACTED]');
  });

  it('full flow: freeze removes secret from process.env but non-secrets remain', async () => {
    writeFileSync(join(testDir, '.env'), 'PORT=5000\nSECRET_TOKEN=my-secret\n');

    // Simulate loading into process.env (as a user might do before calling freeze)
    process.env.PORT = '5000';
    process.env.SECRET_TOKEN = 'my-secret';

    const schema = {
      PORT: z.coerce.number(),
      SECRET_TOKEN: s.secret(z.string()),
    };

    const provider = new FileProvider({ dir: testDir, env: 'development' });
    const values = await provider.load(Object.keys(schema));
    const config = await validateEnv(schema, values);

    // Freeze: removes SECRET_TOKEN from process.env, keeps PORT
    freezeSecrets(schema, config);

    expect(process.env.PORT).toBe('5000');
    expect(process.env.SECRET_TOKEN).toBeUndefined();
    // Config object is unaffected
    expect(config.SECRET_TOKEN.reveal()).toBe('my-secret');
  });

  it('later provider wins when merging (env overrides file)', async () => {
    writeFileSync(join(testDir, '.env'), 'PORT=3000\n');
    process.env.PORT = '9999'; // process.env should win over file

    const schema = { PORT: z.coerce.number() };
    const fileProvider = new FileProvider({ dir: testDir, env: 'development' });
    const envProvider = new ProcessEnvProvider();

    // Merge: file first, env second — last wins
    const fileValues = await fileProvider.load(Object.keys(schema));
    const envValues = await envProvider.load(Object.keys(schema));
    const merged = { ...fileValues, ...envValues };

    const config = await validateEnv(schema, merged);
    expect(config.PORT).toBe(9999); // env wins
  });
});
