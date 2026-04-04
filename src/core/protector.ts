import type { StandardSchemaV1 } from '@standard-schema/spec';

type SchemaMap = Record<string, StandardSchemaV1<unknown, unknown>>;

function isSecretField(schema: StandardSchemaV1<unknown, unknown>): boolean {
  return 'isSecret' in schema && (schema as unknown as { isSecret: boolean }).isSecret === true;
}

/**
 * Deletes all secret-marked fields from `process.env` after validation.
 *
 * Non-secret fields remain in `process.env` for framework compatibility
 * (e.g. PORT, NODE_ENV). Secret values are only accessible through the
 * typed config object returned by the validator.
 *
 * This function is idempotent — calling it multiple times is safe.
 *
 * @param schema - The schema map used for validation (identifies secret keys via `isSecret: true`)
 * @param _config - The validated config object (passed for API symmetry; not mutated)
 */
export function freezeSecrets(schema: SchemaMap, _config: Record<string, unknown>): void {
  const secretKeys: string[] = [];

  for (const key of Object.keys(schema)) {
    const fieldSchema = schema[key];
    if (fieldSchema !== undefined && isSecretField(fieldSchema)) {
      secretKeys.push(key);
    }
  }

  for (const key of secretKeys) {
    // Intentional deletion — this is the security mechanism described in lessons.md.
    // Object.freeze(process.env) throws in Node.js, so deletion is used instead.
    delete process.env[key];
  }

  // Debug logging — only emitted when DEBUG env var includes 'envshield'
  if (secretKeys.length > 0 && process.env.DEBUG?.includes('envshield')) {
    process.stderr.write(
      `[envshield:debug] Removed ${secretKeys.length} secret key(s) from process.env: ${secretKeys.join(', ')}\n`,
    );
  }
}
