/**
 * Security tests: .env file injection attack prevention.
 *
 * The .env parser MUST NOT execute shell commands or evaluate expressions.
 * It is a pure text parser that reads key=value pairs — nothing more.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEnvFiles } from '../../src/core/loader.js';

describe('security: .env injection attacks', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `envshield-inject-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('treats shell command substitution as a literal string, does not execute it', async () => {
    // If the parser were to evaluate this, it would run a shell command
    writeFileSync(join(testDir, '.env'), 'KEY=$(echo injected)\n');

    const result = await loadEnvFiles(testDir, 'development');

    // Must be stored as literal text, not evaluated
    expect(result.KEY).toBe('$(echo injected)');
  });

  it('treats backtick command substitution as literal text', async () => {
    writeFileSync(join(testDir, '.env'), 'KEY=`echo injected`\n');

    const result = await loadEnvFiles(testDir, 'development');

    expect(result.KEY).toBe('`echo injected`');
  });

  it('treats variable expansion syntax as literal text (no interpolation)', async () => {
    writeFileSync(join(testDir, '.env'), 'KEY=${OTHER_VAR}\n');

    const result = await loadEnvFiles(testDir, 'development');

    expect(result.KEY).toBe('${OTHER_VAR}');
  });

  it('stores shell injection attempt as literal value without executing', async () => {
    const injectionPayload = 'valid; rm -rf /tmp/test_$(date +%s)';
    writeFileSync(join(testDir, '.env'), `KEY=${injectionPayload}\n`);

    const result = await loadEnvFiles(testDir, 'development');

    expect(result.KEY).toBe(injectionPayload);
  });

  it('rejects env parameter with path traversal characters', async () => {
    await expect(loadEnvFiles(testDir, '../../../etc/passwd')).rejects.toThrow(/invalid env/i);
    await expect(loadEnvFiles(testDir, 'prod/../../../secret')).rejects.toThrow(/invalid env/i);
  });

  it('rejects env parameter with shell metacharacters', async () => {
    await expect(loadEnvFiles(testDir, 'prod; echo')).rejects.toThrow(/invalid env/i);
    await expect(loadEnvFiles(testDir, 'prod$(id)')).rejects.toThrow(/invalid env/i);
    await expect(loadEnvFiles(testDir, 'prod`id`')).rejects.toThrow(/invalid env/i);
  });

  it('rejects directory argument with path traversal (..) segments', async () => {
    await expect(loadEnvFiles('/tmp/../etc', 'development')).rejects.toThrow(/path traversal/i);
  });

  it('handles extremely long values without crashing (DoS prevention)', async () => {
    // 100KB value — well under the 1MB limit, should parse fine
    const longValue = 'x'.repeat(100 * 1024);
    writeFileSync(join(testDir, '.env'), `KEY=${longValue}\n`);

    const result = await loadEnvFiles(testDir, 'development');

    expect(result.KEY).toBe(longValue);
    expect(result.KEY?.length).toBe(100 * 1024);
  });

  it('rejects files over 1MB (DoS prevention)', async () => {
    const oversizedContent = `KEY=${'x'.repeat(1024 * 1024 + 1)}\n`;
    writeFileSync(join(testDir, '.env'), oversizedContent);

    await expect(loadEnvFiles(testDir, 'development')).rejects.toThrow(/too large/i);
  });

  it('handles values with special regex characters safely', async () => {
    // These chars should not be misinterpreted during any regex processing
    const specialValue = '.*+?^${}()|[\\]';
    writeFileSync(join(testDir, '.env'), `KEY=${specialValue}\n`);

    const result = await loadEnvFiles(testDir, 'development');

    expect(result.KEY).toBe(specialValue);
  });

  it('handles values with null-like byte sequences as literal text', async () => {
    // Actual null bytes cannot be in .env files, but \\0 literal should be stored as-is
    writeFileSync(join(testDir, '.env'), 'KEY=value\\0end\n');

    const result = await loadEnvFiles(testDir, 'development');

    expect(result.KEY).toBe('value\\0end');
  });
});
