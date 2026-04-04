/**
 * `envshield check` — validates that required environment variables are present.
 *
 * Returns an exit code (0 = all present, 1 = any missing) and captured output lines.
 * The caller (CLI entry point) is responsible for writing output and calling process.exit().
 * This design makes the function unit-testable without subprocess spawning.
 */

export interface CheckOptions {
  /** List of env var names to verify are present in process.env. */
  vars: string[];
}

export interface CheckResult {
  /** 0 = all vars present, 1 = one or more missing. */
  code: 0 | 1;
  /** Human-readable output lines (one per variable). */
  output: string[];
}

const PRESENT = '✓';
const MISSING = '✗';

export async function runCheck(options: CheckOptions): Promise<CheckResult> {
  const { vars } = options;

  if (vars.length === 0) {
    return { code: 0, output: ['No variables to check.'] };
  }

  const output: string[] = [];
  let hasErrors = false;

  for (const varName of vars) {
    const value = process.env[varName];
    if (value !== undefined) {
      output.push(`  ${PRESENT}  ${varName}`);
    } else {
      output.push(`  ${MISSING}  ${varName}  (missing)`);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    output.unshift('envshield check — some required variables are missing:\n');
  } else {
    output.unshift('envshield check — all variables are present:\n');
  }

  return { code: hasErrors ? 1 : 0, output };
}
