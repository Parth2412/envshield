import type { StandardSchemaV1 } from '@standard-schema/spec';
import { Secret } from './secret.js';

export type SecretSchema<T> = StandardSchemaV1<unknown, Secret<T>> & {
  readonly isSecret: true;
};

export const s = {
  secret<T>(schema: StandardSchemaV1<unknown, T>): SecretSchema<T> {
    const wrappedSchema: SecretSchema<T> = {
      isSecret: true as const,
      '~standard': {
        version: 1,
        vendor: 'envshield',
        async validate(value: unknown) {
          const result = await schema['~standard'].validate(value);
          if (result.issues) {
            return { issues: result.issues };
          }
          return { value: new Secret(result.value) };
        },
      },
    };
    return wrappedSchema;
  },
};
