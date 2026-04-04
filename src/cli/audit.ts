import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_ENV_FILE_BYTES = 1024 * 1024; // 1 MB

/**
 * `envshield audit` — scans a directory for common secrets-management security issues.
 *
 * Checks:
 * 1. `.env*` files that are not listed in `.gitignore` (leak risk)
 * 2. Variables in `.env` files whose names match secret patterns (`*_KEY`, `*_SECRET`, etc.)
 *    — reports them as candidates for `s.secret()` wrapping
 */

export interface AuditOptions {
  /** Directory to scan. Defaults to `process.cwd()`. */
  dir?: string;
}

export interface AuditResult {
  /** 0 = no critical issues, 1 = critical issues found (e.g. .env not in .gitignore). */
  code: 0 | 1;
  /** Human-readable output lines. */
  output: string[];
}

/** Regex patterns for variable names that look like secrets. */
const SECRET_PATTERNS = [
  /_KEY$/i,
  /_SECRET$/i,
  /_TOKEN$/i,
  /_PASSWORD$/i,
  /_PASS$/i,
  /_PWD$/i,
  /_CREDENTIAL$/i,
  /_CREDENTIALS$/i,
  /_CERT$/i,
];

function looksLikeSecret(varName: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(varName));
}

function readGitignore(dir: string): string[] {
  const gitignorePath = join(dir, '.gitignore');
  if (!existsSync(gitignorePath)) return [];
  const content = readFileSync(gitignorePath, 'utf-8');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

function isIgnored(fileName: string, gitignoreEntries: string[]): boolean {
  return gitignoreEntries.some((entry) => {
    // Negation entries (! prefix) mean "do not ignore this" — skip them conservatively.
    // We do not track negation state; an entry like `!.env` does NOT make `.env` "ignored".
    if (entry.startsWith('!')) return false;

    // Trailing `/` marks directory-only patterns — skip for file matching
    const trimmed = entry.endsWith('/') ? entry.slice(0, -1) : entry;

    // Escape regex metacharacters, then handle globs:
    // ** → .* (matches anything including slashes), * → [^/]* (matches within one segment)
    const pattern = trimmed
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');
    return new RegExp(`^${pattern}$`).test(fileName);
  });
}

function findEnvFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => f === '.env' || f.startsWith('.env.'));
  } catch {
    return [];
  }
}

function parseEnvKeys(filePath: string): string[] {
  try {
    const stat = statSync(filePath);
    if (stat.size > MAX_ENV_FILE_BYTES) return [];
    const content = readFileSync(filePath, 'utf-8');
    const keys: string[] = [];
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      if (key) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

export async function runAudit(options: AuditOptions = {}): Promise<AuditResult> {
  const dir = options.dir ?? process.cwd();
  const output: string[] = ['envshield audit\n'];
  let hasCritical = false;

  const gitignoreEntries = readGitignore(dir);
  const envFiles = findEnvFiles(dir);

  if (envFiles.length === 0) {
    output.push('  No .env files found.');
    return { code: 0, output };
  }

  for (const envFile of envFiles) {
    const isProtected = isIgnored(envFile, gitignoreEntries);

    if (!isProtected) {
      output.push(
        `  [ERROR] ${envFile} is not listed in .gitignore — this file may be accidentally committed and leak secrets`,
      );
      hasCritical = true;
    } else {
      output.push(`  [OK]    ${envFile} is listed in .gitignore`);
    }

    // Check for variables that look like secrets
    const keys = parseEnvKeys(join(dir, envFile));
    for (const key of keys) {
      if (looksLikeSecret(key)) {
        output.push(
          `  [WARN]  ${key} in ${envFile} looks like a secret — consider wrapping with s.secret()`,
        );
      }
    }
  }

  return { code: hasCritical ? 1 : 0, output };
}
