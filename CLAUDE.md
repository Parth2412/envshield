# envshield — Agent Instructions

## Security Mandates (NON-NEGOTIABLE)

1. **All secret values MUST use `Secret<T>` class** — never store raw secret strings in config objects. A raw string in a config object is a security bug, not a style issue.

2. **Every provider MUST implement the `EnvProvider` interface** — no exceptions. Duck-typed objects are not acceptable.

3. **`@aws-sdk/*` imports MUST be dynamic (lazy)** — top-level AWS SDK imports are a security/bundle-size bug. The import must be inside the `load()` method body.

4. **Security tests are MANDATORY** for every feature touching `Secret<T>` or `process.env`. Treat security tests as unit tests — they are not optional.

5. **Do NOT weaken TypeScript strictness settings** — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` must remain enabled.

6. **Do NOT add production dependencies without explicit user approval** — the zero-dependency core is a security feature.

7. **Run `npm run test:coverage` before every code review** — fail if coverage drops below thresholds.

## Before Making Decisions

- Consult `lessons.md` before making decisions about `Secret<T>` or `process.env`
- The `process.env` freeze mechanism uses **deletion**, not `Object.freeze()` — see lessons.md
- Private class fields (`#value`) were chosen for `Secret<T>` — not closures, not WeakMap

## Code Organization

- Follow the file structure in the plan/architecture
- Each file has one clear responsibility
- Tests live in `tests/unit/`, `tests/integration/`, `tests/security/`

## Commands

```bash
npm run test          # run tests
npm run test:coverage # run tests with coverage
npm run lint          # biome check
npm run type-check    # tsc --noEmit
npm run build         # tsup build
```
