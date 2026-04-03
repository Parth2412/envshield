import type { StandardSchemaV1 } from '@standard-schema/spec';
import { Secret } from './secret.js';

// Prevent Secret<Secret<T>> footgun at the type level
type NotSecret<T> = T extends Secret<unknown> ? never : T;

export type SecretSchema<T> = StandardSchemaV1<unknown, Secret<T>> & {
  readonly isSecret: true;
};

export const s = {
  secret<T>(schema: StandardSchemaV1<unknown, NotSecret<T>>): SecretSchema<NotSecret<T>> {
    const wrappedSchema: SecretSchema<NotSecret<T>> = {
      isSecret: true as const,
      '~standard': {
        version: 1,
        vendor: 'envshield',
        // Forward types so StandardSchemaV1.InferInput/InferOutput work correctly
        types: schema['~standard'].types as StandardSchemaV1<
          unknown,
          Secret<NotSecret<T>>
        >['~standard']['types'],
        validate(value: unknown) {
          const resultOrPromise = schema['~standard'].validate(value);
          if (resultOrPromise instanceof Promise) {
            return resultOrPromise.then((result) =>
              result.issues ? result : { value: new Secret(result.value) },
            );
          }
          const result = resultOrPromise;
          return result.issues ? result : { value: new Secret(result.value) };
        },
      },
    };
    return wrappedSchema;
  },
};
