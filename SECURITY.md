# Security Policy

## Supported Versions

| Version | Supported            |
| ------- | ------------------   |
| 0.x     | ✓ Active development |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

To report a security vulnerability, email: **<kaloliya@gmail.com>**

Include in your report:

- Description of the vulnerability
- Steps to reproduce
- Affected version(s)
- Potential impact

You will receive an acknowledgement within 48 hours. We aim to release a fix within 7 days for critical issues.

## Security Design Principles

envshield is designed with security as a first-class concern:

1. **Secret redaction** — `Secret<T>` values never appear in `JSON.stringify()`, `console.log()`, `util.inspect()`, or error messages. They are stored in native private class fields.

2. **process.env isolation** — After `envshield.freeze(config)`, secret keys are deleted from `process.env` so child processes cannot inherit them.

3. **Zero production dependencies** — The core library has no runtime dependencies beyond optional peer deps. This minimizes supply chain attack surface.

4. **No shell evaluation** — The `.env` file parser never executes shell commands or interpolates variables. `KEY=$(cmd)` is stored as a literal string.

5. **Path traversal prevention** — All file paths are validated before use. The `env` parameter is constrained to `[a-zA-Z0-9_-]+` only.

6. **AWS credential security** — The AWS provider never accepts credentials as constructor arguments. It always uses the AWS SDK default credential chain (env vars, IAM roles, `~/.aws/credentials`).
