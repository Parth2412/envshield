# Security Lessons & Decisions Log

## Why `Object.freeze(process.env)` Was Not Used

`Object.freeze(process.env)` throws `TypeError` in Node.js — the object is exotic and cannot be frozen (see nodejs/node#30806).

**Decision:** After validation, delete `.secret()` fields from `process.env` so they cannot be accessed by downstream dependencies. Non-secret validated fields remain in `process.env` for framework compatibility (e.g., `PORT`, `NODE_ENV`). This opt-in is triggered by calling `envshield.freeze(config)`.

## Why Private Class Fields (`#value`) for `Secret<T>`

Options considered:
- **Closures:** Work but require factory functions, not class-based, harder to type
- **WeakMap:** External map keyed by instance — possible but adds complexity, GC pressure
- **Private fields (`#value`):** Inaccessible to `Object.keys()`, `Object.entries()`, `JSON.stringify()`, and reflection. Not serializable by accident. Native in Node.js v20+.

**Decision:** Private class fields. Clean, native, zero overhead.

## Why Standard Schema Was Chosen Over Direct Zod Integration

Zod v3 and v4 have different internal APIs. Supporting both with `if (zod.version === 3)` hacks is fragile.

The Standard Schema spec (`@standard-schema/spec`) is implemented by both Zod v3 and v4. By programming to the `~standard` interface, envshield remains validator-agnostic without version detection.

**Decision:** Standard Schema spec as the internal interface. Works with Zod v3, Zod v4, and any future Standard Schema-compliant validator.

## Why AWS SDK Is a Lazy Import

- Tree-shaking: importing at module top-level bundles AWS SDK even if the user never uses the AWS provider
- Security: lazy loading means the module doesn't appear in the import graph for audit tools unless actually used
- Size: `@aws-sdk/client-secrets-manager` is ~1MB; no reason to load it for users who only use file providers

**Decision:** Dynamic `import()` inside the `load()` method body. Never at module top-level.
