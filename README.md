# envshield

> Type-safe configuration & secrets management for Node.js. The dotenv replacement that actually protects your secrets.

[![npm version](https://img.shields.io/npm/v/@thekaloliya/envshield)](https://www.npmjs.com/package/@thekaloliya/envshield)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm audit: 0 vulnerabilities](https://img.shields.io/badge/npm%20audit-0%20vulnerabilities-brightgreen)](https://docs.npmjs.com/cli/v10/commands/npm-audit)

---

## Why Not Just dotenv?

`dotenv` loads `.env` files. That's it. It puts every key into `process.env` — a globally shared, untyped object readable by **every dependency your app loads**. If a single package in your `node_modules` tree is malicious or compromised, it can harvest all your secrets by reading `process.env`.

The real problems dotenv leaves unsolved:

| Problem | dotenv | envshield |
| --------- | -------- | ----------- |
| Type safety | ❌ Everything is `string \| undefined` | ✅ Validated, typed config object |
| Secret redaction | ❌ Secrets appear in logs/errors | ✅ `Secret<T>` — `[REDACTED]` everywhere |
| Child process isolation | ❌ All vars inherited by default | ✅ `freeze()` deletes secrets from process.env |
| Schema validation | ❌ Runtime surprises | ✅ Fail fast at startup with actionable errors |
| Multi-environment | ❌ Manual file juggling | ✅ `.env` → `.env.local` → `.env.{NODE_ENV}` chain |
| AWS Secrets Manager | ❌ Not supported | ✅ First-class provider with caching |
| Zero dependencies | ✅ | ✅ Core has no runtime deps |

---

## Quick Start

```bash
npm install @thekaloliya/envshield zod
```

```typescript
import { envshield, s } from '@thekaloliya/envshield';
import { z } from 'zod';

const config = await envshield({
  schema: {
    DATABASE_URL: z.string().url(),
    PORT:         z.coerce.number().default(3000),
    API_KEY:      s.secret(z.string()),
    NODE_ENV:     z.enum(['development', 'production', 'test']).default('development'),
  },
});

// Fully typed
config.PORT             // number
config.NODE_ENV         // 'development' | 'production' | 'test'
config.API_KEY          // Secret<string> — NOT a plain string

// Access secret value explicitly
config.API_KEY.reveal() // string

// Protect child processes
envshield.freeze(config); // deletes API_KEY from process.env; non-secrets stay
```

Validation fails at startup — with a clear, actionable error:

```
EnvValidationError: Environment validation failed (2 errors):
  DATABASE_URL: Invalid url
  PORT: Expected number, received string
```

---

## How Secret\<T\> Protects You

Wrap any schema field with `s.secret()` and the value becomes a `Secret<T>` instance. It **cannot leak** through normal JavaScript operations:

```typescript
const key = new Secret('sk_live_abc123');

JSON.stringify({ key })      // '{"key":"[REDACTED]"}'
`API Key: ${key}`            // 'API Key: [REDACTED]'
console.log(key)             // Secret([REDACTED])
Object.keys(key)             // []
new Error(`Config: ${key}`)  // message: 'Config: [REDACTED]'

key.reveal()                 // 'sk_live_abc123' — the only way out
```

The value is stored in a native **private class field** (`#value`), inaccessible to `Object.keys()`, reflection, or accidental serialization.

---

## Installation

```bash
# With Zod (recommended)
npm install @thekaloliya/envshield zod

# With AWS Secrets Manager support
npm install @thekaloliya/envshield zod @aws-sdk/client-secrets-manager

# Zod is optional — any Standard Schema-compliant validator works
```

**Requirements:** Node.js ≥ 20.0.0

---

## Multi-Environment File Loading

envshield loads `.env` files in order, with later files overriding earlier ones:

```
.env                 # shared base (checked in, no secrets)
.env.local           # local overrides, gitignored
.env.{NODE_ENV}      # environment-specific (e.g. .env.production)
.env.{NODE_ENV}.local  # local env-specific overrides, gitignored
process.env          # highest priority — CI/CD env vars win
```

```typescript
const config = await envshield({
  schema: { ... },
  env: 'production',    // which .env.{env} files to load
  dir: process.cwd(),   // where to look for .env files (default: cwd)
});
```

**No file is required.** Missing files are silently skipped. Validation only fails if required schema fields are absent from all sources combined.

---

## Providers

Providers are the sources envshield reads from. They run in order — later providers override earlier ones.

```typescript
const config = await envshield({
  schema: { ... },
  providers: ['file', 'env'],  // default: files first, then process.env
});
```

### Built-in providers

| Name | Description |
|------|-------------|
| `'file'` | Reads `.env` files from disk (multi-env inheritance chain) |
| `'env'`  | Reads from the current `process.env` |
| `'aws'`  | Reads from AWS Secrets Manager (requires `@aws-sdk/client-secrets-manager`) |

### Custom providers

Implement the `EnvProvider` interface for any source:

```typescript
import type { EnvProvider } from '@thekaloliya/envshield';

class VaultProvider implements EnvProvider {
  readonly name = 'vault';

  async load(keys: string[]): Promise<Record<string, string>> {
    // fetch from HashiCorp Vault, return only the requested keys
    return { DATABASE_URL: 'postgres://...' };
  }
}

const config = await envshield({
  schema: { ... },
  providers: [new VaultProvider(), 'env'],
});
```

---

## AWS Secrets Manager

```typescript
import { envshield, s } from '@thekaloliya/envshield';
import { AwsSecretsManagerProvider } from 'envshield/providers/aws'; // if needed directly
import { z } from 'zod';

const config = await envshield({
  schema: {
    DATABASE_URL: s.secret(z.string().url()),
    JWT_SECRET:   s.secret(z.string().min(32)),
  },
  providers: [
    'aws',   // uses default AWS credential chain
    'env',   // process.env overrides (useful for local dev)
  ],
});
```

Or with explicit options via a custom provider instance:

```typescript
import { AwsSecretsManagerProvider } from '@thekaloliya/envshield';

const config = await envshield({
  schema: { ... },
  providers: [
    new AwsSecretsManagerProvider({
      region: 'us-east-1',
      secretsPrefix: '/myapp/production/',  // maps DATABASE_URL → /myapp/production/DATABASE_URL
      cacheTtlMs: 300_000,                  // 5-minute cache (default)
    }),
    'env',
  ],
});
```

**Security design:**
- Credentials use the AWS SDK default chain only — never accepted as constructor arguments
- All SDK errors are wrapped without leaking ARNs or secret names in messages
- Results are cached in-memory (never to disk) with configurable TTL

**Required IAM permissions:**
```json
{
  "Effect": "Allow",
  "Action": [
    "secretsmanager:GetSecretValue",
    "secretsmanager:BatchGetSecretValue"
  ],
  "Resource": "arn:aws:secretsmanager:*:*:secret:/myapp/production/*"
}
```

---

## `envshield.freeze(config)`

After calling `freeze()`, secret keys are **deleted from `process.env`**. Child processes spawned after this call cannot inherit the secrets.

```typescript
const config = await envshield({
  schema: {
    PORT:    z.coerce.number(),
    API_KEY: s.secret(z.string()),
  },
});

envshield.freeze(config);

process.env.PORT    // '3000'  — non-secrets preserved (framework compatibility)
process.env.API_KEY // undefined — deleted
config.API_KEY.reveal() // still works — the config object is unaffected
```

Call `freeze()` as early as possible in your app's startup, before spawning any workers or child processes.

> **Why not `Object.freeze(process.env)`?** It throws `TypeError` in Node.js — `process.env` is an exotic object that cannot be frozen. See `lessons.md` for the full explanation.

---

## CLI Tools

envshield ships a `envshield` binary for CI and developer workflows.

### `envshield check`

Validate the current environment against a list of required variables:

```bash
envshield check DATABASE_URL PORT API_KEY
# ✓ DATABASE_URL  present
# ✓ PORT          present
# ✗ API_KEY       missing
# Exit code: 1 (missing variables)
```

### `envshield audit`

Scan for security issues:

```bash
envshield audit
# WARN  .env file found but not in .gitignore (potential secret leak)
# WARN  API_KEY looks like a secret but is not wrapped with s.secret()
```

### `envshield generate-types`

Generate a TypeScript declaration file for typed `process.env` access:

```bash
envshield generate-types DATABASE_URL PORT NODE_ENV --secret API_KEY JWT_SECRET
```

Outputs `env.d.ts`:
```typescript
declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL: string;
    PORT: string;
    NODE_ENV: string;
    /** secret — use config.API_KEY.reveal() after envshield.freeze() */
    API_KEY: never;
    JWT_SECRET: never;
  }
}
```

---

## API Reference

### `envshield(options)`

```typescript
async function envshield<S extends SchemaMap>(
  options: EnvshieldOptions<S>
): Promise<InferSchemaOutput<S>>
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `schema` | `Record<string, StandardSchemaV1>` | required | Schema map. Each key is an env var name. |
| `env` | `string` | `process.env.NODE_ENV ?? 'development'` | Environment name for file selection |
| `providers` | `ProviderSpec \| ProviderSpec[]` | `['file', 'env']` | Ordered provider list (later wins) |
| `dir` | `string` | `process.cwd()` | Base directory for file provider |

Throws `EnvValidationError` if any required schema field is missing or invalid.

---

### `envshield.freeze(config)`

```typescript
envshield.freeze(config: Record<string, unknown>): void
```

Deletes all `Secret<T>` keys from `process.env`. Non-secret keys are preserved. Idempotent.

---

### `s.secret(schema)`

```typescript
s.secret<T>(schema: StandardSchemaV1<unknown, T>): SecretSchema<T>
```

Wraps any Standard Schema validator. The parsed output becomes `Secret<T>` instead of `T`.

```typescript
s.secret(z.string())        // produces Secret<string>
s.secret(z.string().url())  // produces Secret<string> (validated as URL first)
```

---

### `Secret<T>`

```typescript
class Secret<T> {
  reveal(): T                    // returns the actual value
  toJSON(): '[REDACTED]'         // called by JSON.stringify
  toString(): '[REDACTED]'       // called by template literals, string coercion
  [inspect.custom](): string     // returns 'Secret([REDACTED])' for console.log / util.inspect
}
```

---

### Errors

```typescript
// Thrown when schema validation fails at startup
class EnvValidationError extends Error {
  fields: Record<string, string[]>  // per-field error messages
}

// Thrown when a provider fails to load secrets
class ProviderError extends Error {
  providerName: string
  cause?: unknown
}

// Reserved for future use
class SecretAccessError extends Error {}
```

---

## Migration from dotenv

envshield is not a drop-in replacement — it is intentionally incompatible with dotenv's loose, untyped model. Migration takes ~10 minutes.

### Before (dotenv)

```typescript
import 'dotenv/config';

const port = Number(process.env.PORT ?? '3000');
const apiKey = process.env.API_KEY!; // could be undefined at runtime
```

### After (envshield)

```typescript
import { envshield, s } from '@thekaloliya/envshield';
import { z } from 'zod';

const config = await envshield({
  schema: {
    PORT:    z.coerce.number().default(3000),
    API_KEY: s.secret(z.string()),
  },
});

const port   = config.PORT;             // number — typed, validated
const apiKey = config.API_KEY.reveal(); // string — explicit access
```

**Key differences:**
- `envshield()` is `async` — call it once at startup, before your server listens
- Secrets become `Secret<T>` — call `.reveal()` at the point of use
- Missing required vars fail at startup with a clear error, not at runtime

### .env file format

No changes needed. envshield reads the same `.env` format as dotenv:

```bash
DATABASE_URL=postgres://localhost/mydb
PORT=3000
API_KEY=sk_live_abc123
NODE_ENV=development
# Comments work
QUOTED="values with spaces"
```

**What's not supported (intentionally):**
- Variable interpolation (`KEY=${OTHER}`) — stored as literal text (no shell expansion = no injection)
- `export KEY=value` — the `export` prefix is not stripped (use `KEY=value`)

---

## Security FAQ

**Q: What happens if I log the entire config object?**

All `Secret<T>` fields output `[REDACTED]`. Non-secret fields output their actual values.

```typescript
console.log(config) // { PORT: 3000, API_KEY: Secret([REDACTED]), NODE_ENV: 'production' }
JSON.stringify(config) // '{"PORT":3000,"API_KEY":"[REDACTED]","NODE_ENV":"production"}'
```

**Q: Can I accidentally serialize a secret to a database or HTTP response?**

No. `JSON.stringify()` calls `toJSON()` which returns `"[REDACTED]"`. The actual value never appears unless you call `.reveal()` explicitly.

**Q: What does `freeze()` protect against?**

After `freeze()`, any code that reads `process.env.MY_SECRET` — including third-party dependencies loaded after your app starts — will see `undefined`. Combined with `Secret<T>` redaction, secrets are only accessible through the typed `config` object you control.

**Q: Does envshield protect against secrets in `.env` files being committed to git?**

No — that's a git hygiene problem. Use `envshield audit` to detect `.env` files not in `.gitignore`, and consider tools like `gitleaks` or GitHub's secret scanning for push-time protection.

**Q: Does the AWS provider ever log my secret values?**

No. AWS SDK errors are wrapped in `ProviderError` with a generic message. Secret ARNs and values are never included in thrown error messages.

**Q: What about memory security — can I zero out a secret after use?**

JavaScript's GC is non-deterministic, so there is no reliable way to guarantee a string is zeroed from heap memory. This is a V8 limitation, not an envshield limitation. `Buffer`-based zeroing is planned as an opt-in feature in v2.

---

## Contributing

See [SECURITY.md](SECURITY.md) for the vulnerability disclosure policy.

Bug reports and pull requests are welcome at [github.com/Parth2412/envshield](https://github.com/Parth2412/envshield).

---

## License

MIT © Parth2412
