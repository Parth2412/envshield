import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

function isSafeDir(dir: string): boolean {
  // Split on both Unix and Windows separators and check for '..' segments
  const segments = dir.split(/[/\\]/);
  return !segments.includes('..');
}

function parseEnvFile(content: string, filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const trimmed = line.trim();

    // Skip blank lines and comments
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Must have an = sign
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      throw new Error(`Invalid .env syntax at ${filePath}:${i + 1} — missing '=' in: "${trimmed}"`);
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes (single or double)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function loadSingleFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};

  const stat = statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`Env file too large: ${filePath} (${stat.size} bytes, max ${MAX_FILE_SIZE})`);
  }

  const content = readFileSync(filePath, 'utf-8');
  return parseEnvFile(content, filePath);
}

export async function loadEnvFiles(dir: string, env: string): Promise<Record<string, string>> {
  // Validate env value to prevent path traversal via .env.{env} filename
  if (!/^[a-zA-Z0-9_-]+$/.test(env)) {
    throw new Error(
      `Invalid env value: "${env}" — must contain only alphanumeric characters, hyphens, and underscores`,
    );
  }

  if (!isSafeDir(dir)) {
    throw new Error(`Path traversal detected in directory argument: "${dir}"`);
  }

  const resolved = resolve(dir);

  const filePaths = [
    join(resolved, '.env'),
    join(resolved, '.env.local'),
    join(resolved, `.env.${env}`),
    join(resolved, `.env.${env}.local`),
  ];

  const merged: Record<string, string> = {};

  for (const filePath of filePaths) {
    const fileValues = loadSingleFile(filePath);
    Object.assign(merged, fileValues);
  }

  return merged;
}
