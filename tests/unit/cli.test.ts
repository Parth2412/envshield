/**
 * CLI command tests.
 * The core logic functions return exit codes (not call process.exit directly),
 * making them directly testable without spawning subprocesses.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAudit } from '../../src/cli/audit.js';
import { runCheck } from '../../src/cli/check.js';

// ── check command ─────────────────────────────────────────────────────────────

describe('runCheck()', () => {
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

  it('returns exit code 0 when all required vars are present', async () => {
    process.env.ENVSHIELD_CLI_A = 'value-a';
    process.env.ENVSHIELD_CLI_B = 'value-b';

    const { code } = await runCheck({ vars: ['ENVSHIELD_CLI_A', 'ENVSHIELD_CLI_B'] });

    expect(code).toBe(0);
  });

  it('returns exit code 1 when a required var is missing', async () => {
    const { code } = await runCheck({ vars: ['ENVSHIELD_CLI_MISSING_XYZ'] });

    expect(code).toBe(1);
  });

  it('returns exit code 1 when some vars are present and some are missing', async () => {
    process.env.ENVSHIELD_CLI_PRESENT = 'yes';

    const { code } = await runCheck({
      vars: ['ENVSHIELD_CLI_PRESENT', 'ENVSHIELD_CLI_ABSENT'],
    });

    expect(code).toBe(1);
  });

  it('includes missing variable names in the output', async () => {
    const { output } = await runCheck({ vars: ['ENVSHIELD_CLI_DEFINITELY_MISSING'] });

    const combined = output.join('\n');
    expect(combined).toContain('ENVSHIELD_CLI_DEFINITELY_MISSING');
  });

  it('includes present variable names as passing in the output', async () => {
    process.env.ENVSHIELD_CLI_PRESENT_VAR = 'exists';

    const { output } = await runCheck({ vars: ['ENVSHIELD_CLI_PRESENT_VAR'] });

    const combined = output.join('\n');
    expect(combined).toContain('ENVSHIELD_CLI_PRESENT_VAR');
  });

  it('returns exit code 0 for empty vars list', async () => {
    const { code } = await runCheck({ vars: [] });

    expect(code).toBe(0);
  });
});

// ── audit command ─────────────────────────────────────────────────────────────

describe('runAudit()', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `envshield-audit-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('warns when .env exists but is not listed in .gitignore', async () => {
    writeFileSync(join(testDir, '.env'), 'KEY=value\n');
    // No .gitignore — warning expected

    const { output, code } = await runAudit({ dir: testDir });

    const combined = output.join('\n').toLowerCase();
    expect(combined).toContain('.env');
    expect(combined).toContain('gitignore');
  });

  it('does not warn about .env when it is listed in .gitignore', async () => {
    writeFileSync(join(testDir, '.env'), 'KEY=value\n');
    writeFileSync(join(testDir, '.gitignore'), '.env\n.env.*\n');

    const { output } = await runAudit({ dir: testDir });

    const combined = output.join('\n').toLowerCase();
    // Should NOT contain a warning that .env is missing from gitignore
    expect(combined).not.toMatch(/\.env.*not.*gitignore|gitignore.*\.env.*missing/i);
  });

  it('warns when no .gitignore exists but .env files are present', async () => {
    writeFileSync(join(testDir, '.env'), 'SECRET=value\n');

    const { output } = await runAudit({ dir: testDir });

    const combined = output.join('\n').toLowerCase();
    expect(combined).toContain('.env');
  });

  it('returns exit code 0 when directory has no .env files', async () => {
    const { code } = await runAudit({ dir: testDir });

    expect(code).toBe(0);
  });

  it('warns about env vars that look like secrets but may be exposed', async () => {
    // Write an env file with a secret-looking key
    writeFileSync(join(testDir, '.env'), 'API_KEY=exposed-value\n');
    writeFileSync(join(testDir, '.gitignore'), '.env\n');

    const { output } = await runAudit({ dir: testDir });

    const combined = output.join('\n');
    expect(combined).toContain('API_KEY');
  });

  it('treats negation entries in .gitignore (! prefix) conservatively — does not treat as ignored', async () => {
    // A .gitignore with only a negation entry should NOT hide the .env file
    writeFileSync(join(testDir, '.env'), 'KEY=value\n');
    writeFileSync(join(testDir, '.gitignore'), '!.env\n');

    const { code, output } = await runAudit({ dir: testDir });

    // .env should be flagged as NOT protected (negation entries do not protect it)
    expect(code).toBe(1);
    const combined = output.join('\n').toLowerCase();
    expect(combined).toMatch(/error|not.*gitignore/i);
  });

  it('handles ** glob in .gitignore correctly — matches .env files', async () => {
    writeFileSync(join(testDir, '.env.production'), 'KEY=value\n');
    writeFileSync(join(testDir, '.gitignore'), '.env.*\n');

    const { output } = await runAudit({ dir: testDir });

    const combined = output.join('\n');
    // .env.production matches .env.* — should be listed as OK
    expect(combined).not.toMatch(/\[ERROR\].*\.env\.production/);
  });

  it('detects *_CREDENTIAL as a secret pattern', async () => {
    writeFileSync(join(testDir, '.env'), 'DB_CREDENTIAL=sensitive-value\n');
    writeFileSync(join(testDir, '.gitignore'), '.env\n');

    const { output } = await runAudit({ dir: testDir });

    expect(output.join('\n')).toContain('DB_CREDENTIAL');
  });

  it('detects *_CREDENTIALS as a secret pattern', async () => {
    writeFileSync(join(testDir, '.env'), 'AWS_CREDENTIALS=sensitive-value\n');
    writeFileSync(join(testDir, '.gitignore'), '.env\n');

    const { output } = await runAudit({ dir: testDir });

    expect(output.join('\n')).toContain('AWS_CREDENTIALS');
  });

  it('detects *_CERT as a secret pattern', async () => {
    writeFileSync(join(testDir, '.env'), 'TLS_CERT=sensitive-value\n');
    writeFileSync(join(testDir, '.gitignore'), '.env\n');

    const { output } = await runAudit({ dir: testDir });

    expect(output.join('\n')).toContain('TLS_CERT');
  });

  it('detects *_PRIVATE_KEY as a secret pattern', async () => {
    writeFileSync(join(testDir, '.env'), 'RSA_PRIVATE_KEY=sensitive-value\n');
    writeFileSync(join(testDir, '.gitignore'), '.env\n');

    const { output } = await runAudit({ dir: testDir });

    expect(output.join('\n')).toContain('RSA_PRIVATE_KEY');
  });

  it('detects *_SIGNING_KEY as a secret pattern', async () => {
    writeFileSync(join(testDir, '.env'), 'JWT_SIGNING_KEY=sensitive-value\n');
    writeFileSync(join(testDir, '.gitignore'), '.env\n');

    const { output } = await runAudit({ dir: testDir });

    expect(output.join('\n')).toContain('JWT_SIGNING_KEY');
  });

  it('does not crash or exhaust memory on a very large .env file in audit scan (DoS prevention)', async () => {
    // 2MB file — above the 1MB limit the audit should enforce
    const oversized = `KEY=${'x'.repeat(2 * 1024 * 1024)}\n`;
    writeFileSync(join(testDir, '.env'), oversized);
    writeFileSync(join(testDir, '.gitignore'), '.env\n');

    // Should not throw, should return gracefully
    const result = await runAudit({ dir: testDir });
    expect(result).toBeDefined();
    expect(result.code).toBeDefined();
  });
});
