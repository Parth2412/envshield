/**
 * Minimal ambient type stubs for optional peer dependencies.
 *
 * These stubs allow TypeScript to type-check the dynamic imports in
 * src/providers/aws.ts without requiring the full peer packages to be installed.
 *
 * When a user installs the real peer package (e.g. @aws-sdk/client-secrets-manager),
 * their node_modules resolution takes precedence over these stubs — so the real
 * types are used for consumers who have the package installed.
 *
 * This file is NOT included in the published `dist/` output.
 */

declare module '@aws-sdk/client-secrets-manager' {
  export interface SecretsManagerClientConfig {
    region?: string;
  }

  export interface SecretValueEntry {
    Name?: string;
    SecretString?: string;
    SecretBinary?: Uint8Array;
    ARN?: string;
  }

  export interface SecretValueErrorEntry {
    SecretId?: string;
    ErrorCode?: string;
    Message?: string;
  }

  export interface BatchGetSecretValueResponse {
    SecretValues?: SecretValueEntry[];
    Errors?: SecretValueErrorEntry[];
    NextToken?: string;
  }

  export class SecretsManagerClient {
    constructor(config?: SecretsManagerClientConfig);
    send(command: object): Promise<BatchGetSecretValueResponse>;
  }

  export class BatchGetSecretValueCommand {
    constructor(input: { SecretIdList: string[] });
  }
}
