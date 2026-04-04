import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEnvFiles } from '../../src/core/loader.js';

describe('loadEnvFiles', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `envshield-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('basic loading', () => {
    it('loads a simple .env file', async () => {
      writeFileSync(join(testDir, '.env'), 'PORT=3000\nAPP_NAME=myapp\n');
      const result = await loadEnvFiles(testDir, 'development');
      expect(result.PORT).toBe('3000');
      expect(result.APP_NAME).toBe('myapp');
    });

    it('returns empty object when no .env files exist', async () => {
      const result = await loadEnvFiles(testDir, 'development');
      expect(result).toEqual({});
    });

    it('silently skips missing files', async () => {
      writeFileSync(join(testDir, '.env'), 'BASE=1\n');
      // .env.local and .env.development don't exist — should not throw
      const result = await loadEnvFiles(testDir, 'development');
      expect(result.BASE).toBe('1');
    });
  });

  describe('inheritance chain', () => {
    it('applies inheritance: .env → .env.local → .env.{env} → .env.{env}.local', async () => {
      writeFileSync(join(testDir, '.env'), 'A=base\nB=base\nC=base\nD=base\n');
      writeFileSync(join(testDir, '.env.local'), 'B=local\nC=local\nD=local\n');
      writeFileSync(join(testDir, '.env.development'), 'C=env\nD=env\n');
      writeFileSync(join(testDir, '.env.development.local'), 'D=env-local\n');

      const result = await loadEnvFiles(testDir, 'development');
      expect(result.A).toBe('base'); // only in .env
      expect(result.B).toBe('local'); // .env.local overrides .env
      expect(result.C).toBe('env'); // .env.development overrides .env.local
      expect(result.D).toBe('env-local'); // .env.development.local is highest priority
    });

    it('last-wins semantics: later files override earlier ones', async () => {
      writeFileSync(join(testDir, '.env'), 'KEY=from-base\n');
      writeFileSync(join(testDir, '.env.production'), 'KEY=from-production\n');

      const result = await loadEnvFiles(testDir, 'production');
      expect(result.KEY).toBe('from-production');
    });
  });

  describe('.env file parsing', () => {
    it('handles quoted string values', async () => {
      writeFileSync(join(testDir, '.env'), 'GREETING="hello world"\nNAME=\'alice\'\n');
      const result = await loadEnvFiles(testDir, 'development');
      expect(result.GREETING).toBe('hello world');
      expect(result.NAME).toBe('alice');
    });

    it('ignores comment lines', async () => {
      writeFileSync(join(testDir, '.env'), '# This is a comment\nPORT=3000\n# Another comment\n');
      const result = await loadEnvFiles(testDir, 'development');
      expect(result.PORT).toBe('3000');
      expect(Object.keys(result)).toHaveLength(1);
    });

    it('ignores blank lines', async () => {
      writeFileSync(join(testDir, '.env'), '\nPORT=3000\n\nAPP=myapp\n\n');
      const result = await loadEnvFiles(testDir, 'development');
      expect(result.PORT).toBe('3000');
      expect(result.APP).toBe('myapp');
    });

    it('trims whitespace from values without quotes', async () => {
      writeFileSync(join(testDir, '.env'), 'PORT=  3000  \n');
      const result = await loadEnvFiles(testDir, 'development');
      expect(result.PORT).toBe('3000');
    });

    it('handles empty values', async () => {
      writeFileSync(join(testDir, '.env'), 'EMPTY=\nEMPTY2=""\n');
      const result = await loadEnvFiles(testDir, 'development');
      expect(result.EMPTY).toBe('');
      expect(result.EMPTY2).toBe('');
    });

    it('handles values with = signs', async () => {
      writeFileSync(join(testDir, '.env'), 'DATABASE_URL=postgres://user:pass@host/db?ssl=true\n');
      const result = await loadEnvFiles(testDir, 'development');
      expect(result.DATABASE_URL).toBe('postgres://user:pass@host/db?ssl=true');
    });

    it('throws on malformed lines (missing = sign)', async () => {
      writeFileSync(join(testDir, '.env'), 'BADLINE\n');
      await expect(loadEnvFiles(testDir, 'development')).rejects.toThrow();
    });
  });

  describe('security', () => {
    it('rejects path traversal attempts in directory argument', async () => {
      await expect(loadEnvFiles('/tmp/../etc', 'development')).rejects.toThrow(/path traversal/i);
    });

    it('rejects path traversal attempts in env argument', async () => {
      await expect(loadEnvFiles(testDir, '../../../etc/passwd')).rejects.toThrow(/invalid env/i);
    });

    it('rejects env with special characters', async () => {
      await expect(loadEnvFiles(testDir, 'prod; rm -rf /')).rejects.toThrow(/invalid env/i);
    });

    it('limits file size to prevent DoS (files over 1MB rejected)', async () => {
      const bigContent = 'A='.padEnd(1024 * 1024 + 1, 'x');
      writeFileSync(join(testDir, '.env'), bigContent);
      await expect(loadEnvFiles(testDir, 'development')).rejects.toThrow(/too large/i);
    });
  });
});
