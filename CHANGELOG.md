# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] — 2026-04-04

Initial release.

### Added

***Core***

- `Secret<T>` class with native private class fields — values never appear in `JSON.stringify()`, `console.log()`, `util.inspect()`, template literals, or error messages
- `s.secret(schema)` — Standard Schema wrapper that produces `Secret<T>` output from any Standard Schema v1-compliant validator
- Multi-environment `.env` file loader with inheritance chain: `.env` → `.env.local` → `.env.{env}` → `.env.{env}.local`
- Startup validator with aggregated, actionable error messages naming the exact failing fields
- `envshield.freeze(config)` — deletes all `Secret<T>` keys from `process.env` to prevent child process inheritance

***Providers***

- `FileProvider` — reads `.env` files; zero external dependencies
- `ProcessEnvProvider` — reads from `process.env`
- `AwsSecretsManagerProvider` — reads from AWS Secrets Manager with lazy `@aws-sdk/client-secrets-manager` import, TTL-based in-memory cache, prefix mapping, and `BatchGetSecretValue` batching

***CLI***

- `envshield check <VAR...>` — validates named variables are present in the current environment; exits with code 1 if any are missing
- `envshield audit [--dir <path>]` — scans for `.env` files not in `.gitignore` and variables that look like secrets but are not wrapped with `s.secret()`
- `envshield generate-types <VAR...> [--secret <VAR...>]` — generates a `ProcessEnv` TypeScript declaration with typed entries

***Errors***

- `EnvValidationError` — thrown on startup with per-field error details
- `ProviderError` — thrown when a provider fails to load; never includes secret ARNs or values
- `SecretAccessError` — reserved for future secret-access violations

***Security hardening***

- Path traversal prevention: `env` parameter validated against `[a-zA-Z0-9_-]+`; `dir` parameter checked for `..` segments
- File size limit: `.env` files over 1 MB are rejected (DoS prevention)
- No shell evaluation: `KEY=$(cmd)`, `` KEY=`cmd` ``, and `KEY=${VAR}` are stored as literal strings — never executed
- AWS error messages never include secret ARNs or values
- `npm audit` — zero vulnerabilities; no `postinstall` scripts; `"sideEffects": false` for tree-shaking
- Published package contains only `dist/`, `README.md`, `SECURITY.md`, `CHANGELOG.md` — no source, no tests

***Compatibility***

- Node.js ≥ 20.0.0
- Zod v3 and v4 via the Standard Schema spec (`@standard-schema/spec`)
- ESM and CommonJS dual output (`dist/index.js` + `dist/index.cjs`)
- Zero production dependencies (Zod and AWS SDK are optional peer dependencies)

---

[0.1.0]: https://github.com/Parth2412/envshield/releases/tag/v0.1.0
