#!/usr/bin/env node
/**
 * envshield CLI
 *
 * Commands:
 *   envshield check VAR1 VAR2 ...         — validate required env vars are present
 *   envshield audit [--dir <path>]         — scan for security issues
 *   envshield generate-types VAR1 VAR2 ... — generate TypeScript process.env declarations
 */
import { runAudit } from './audit.js';
import { runCheck } from './check.js';
import { runGenerateTypes } from './generate-types.js';

const [, , command, ...args] = process.argv;

async function main(): Promise<void> {
  switch (command) {
    case 'check': {
      const { code, output } = await runCheck({ vars: args });
      for (const line of output) process.stdout.write(`${line}\n`);
      process.exit(code);
      break;
    }

    case 'audit': {
      // Parse --dir option
      const dirIdx = args.indexOf('--dir');
      const dir = dirIdx !== -1 ? args[dirIdx + 1] : undefined;
      const auditOpts = dir !== undefined ? { dir } : {};
      const { code, output } = await runAudit(auditOpts);
      for (const line of output) process.stdout.write(`${line}\n`);
      process.exit(code);
      break;
    }

    case 'generate-types': {
      // Parse --secret flag: envshield generate-types --secret API_KEY,DB_PASS VAR1 VAR2
      const secretIdx = args.indexOf('--secret');
      let secretVars: string[] = [];
      let vars = args;

      if (secretIdx !== -1) {
        const secretArg = args[secretIdx + 1];
        if (secretArg !== undefined) {
          secretVars = secretArg.split(',').map((s) => s.trim());
        }
        vars = args.filter((_, i) => i !== secretIdx && i !== secretIdx + 1);
      }

      const { code, content } = runGenerateTypes({ vars, secretVars });
      if (content) process.stdout.write(content);
      process.exit(code);
      break;
    }

    default: {
      const msg = command ? `Unknown command: ${command}\n` : 'No command specified.\n';
      process.stderr.write(
        `${msg}Usage: envshield <command> [options]\n\nCommands:\n  check VAR1 VAR2 ...         Verify env vars are set\n  audit [--dir <path>]         Scan for security issues\n  generate-types VAR1 VAR2 ... Generate TypeScript declarations\n`,
      );
      process.exit(1);
    }
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`envshield error: ${String(err)}\n`);
  process.exit(1);
});
