import type { StandardSchemaV1 } from '@standard-schema/spec';
import { EnvValidationError } from '../errors/index.js';
import { Secret } from './secret.js';

// Infer the output type from a schema map
type SchemaMap = Record<string, StandardSchemaV1<unknown, unknown>>;

type InferSchemaOutput<S extends SchemaMap> = {
  [K in keyof S]: S[K] extends StandardSchemaV1<unknown, infer O> ? O : never;
};

export async function validateEnv<S extends SchemaMap>(
  schema: S,
  values: Record<string, string | undefined>,
): Promise<InferSchemaOutput<S>> {
  const fieldErrors: Record<string, string[]> = {};
  const config: Record<string, unknown> = {};

  const entries = Object.entries(schema) as [string, StandardSchemaV1<unknown, unknown>][];

  await Promise.all(
    entries.map(async ([key, fieldSchema]) => {
      const rawValue = values[key];
      const result = await fieldSchema['~standard'].validate(rawValue);

      if (result.issues && result.issues.length > 0) {
        fieldErrors[key] = result.issues.map((issue) =>
          typeof issue.message === 'string' ? issue.message : String(issue.message),
        );
      } else {
        // issues is either undefined (SuccessResult) or an empty array — both mean success
        config[key] = (result as StandardSchemaV1.SuccessResult<unknown>).value;
      }
    }),
  );

  if (Object.keys(fieldErrors).length > 0) {
    const errorLines = Object.entries(fieldErrors)
      .map(([k, msgs]) => `  ${k}: ${msgs.join(', ')}`)
      .join('\n');
    throw new EnvValidationError(`Environment validation failed:\n${errorLines}`, fieldErrors);
  }

  return config as InferSchemaOutput<S>;
}

// Re-export Secret so callers can do instanceof checks without importing from secret.ts directly
export { Secret };
