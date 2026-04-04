/**
 * Integration tests for AwsSecretsManagerProvider.
 * The AWS SDK is mocked — no real AWS calls are made.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../../src/errors/index.js';
import { AwsSecretsManagerProvider } from '../../src/providers/aws.js';

// ── Mock the AWS SDK (lazy dynamic import inside load()) ──────────────────────
const mockSend = vi.fn();
const MockSecretsManagerClient = vi.fn(() => ({ send: mockSend }));
const MockBatchGetSecretValueCommand = vi.fn((input: unknown) => ({ _input: input }));

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: MockSecretsManagerClient,
  BatchGetSecretValueCommand: MockBatchGetSecretValueCommand,
}));

// Helper: build a successful BatchGetSecretValue-style response
function mockAwsResponse(
  secrets: Array<{ Name: string; SecretString: string }>,
  errors: Array<{ SecretId: string; ErrorCode: string; Message: string }> = [],
) {
  return {
    SecretValues: secrets.map((s) => ({ Name: s.Name, SecretString: s.SecretString })),
    Errors: errors,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AwsSecretsManagerProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('does not import the AWS SDK on construction (lazy import)', () => {
      // Just constructing the provider must NOT call the mock SDK constructor
      const _provider = new AwsSecretsManagerProvider({ region: 'us-east-1' });
      expect(MockSecretsManagerClient).not.toHaveBeenCalled();
    });

    it('has name "aws"', () => {
      const provider = new AwsSecretsManagerProvider();
      expect(provider.name).toBe('aws');
    });
  });

  describe('load()', () => {
    it('fetches requested secrets from AWS', async () => {
      mockSend.mockResolvedValueOnce(
        mockAwsResponse([
          { Name: 'DATABASE_URL', SecretString: 'postgres://localhost/app' },
          { Name: 'API_KEY', SecretString: 'sk-secret-token' },
        ]),
      );

      const provider = new AwsSecretsManagerProvider({ region: 'us-east-1' });
      const result = await provider.load(['DATABASE_URL', 'API_KEY']);

      expect(result.DATABASE_URL).toBe('postgres://localhost/app');
      expect(result.API_KEY).toBe('sk-secret-token');
      expect(MockSecretsManagerClient).toHaveBeenCalledWith({ region: 'us-east-1' });
    });

    it('returns empty object for empty keys array without calling AWS', async () => {
      const provider = new AwsSecretsManagerProvider();
      const result = await provider.load([]);

      expect(result).toEqual({});
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('passes secret IDs to BatchGetSecretValueCommand', async () => {
      mockSend.mockResolvedValueOnce(mockAwsResponse([]));

      const provider = new AwsSecretsManagerProvider();
      await provider.load(['MY_SECRET', 'OTHER_SECRET']);

      expect(MockBatchGetSecretValueCommand).toHaveBeenCalledWith({
        SecretIdList: ['MY_SECRET', 'OTHER_SECRET'],
      });
    });

    it('prepends secretsPrefix to secret names sent to AWS', async () => {
      mockSend.mockResolvedValueOnce(mockAwsResponse([]));

      const provider = new AwsSecretsManagerProvider({ secretsPrefix: '/myapp/prod/' });
      await provider.load(['DB_PASS']);

      expect(MockBatchGetSecretValueCommand).toHaveBeenCalledWith({
        SecretIdList: ['/myapp/prod/DB_PASS'],
      });
    });

    it('strips secretsPrefix from secret names when mapping to result keys', async () => {
      mockSend.mockResolvedValueOnce(
        mockAwsResponse([{ Name: '/myapp/prod/DB_PASS', SecretString: 's3cr3t' }]),
      );

      const provider = new AwsSecretsManagerProvider({ secretsPrefix: '/myapp/prod/' });
      const result = await provider.load(['DB_PASS']);

      expect(result.DB_PASS).toBe('s3cr3t');
    });

    it('silently skips secrets not returned by AWS (ResourceNotFoundException)', async () => {
      mockSend.mockResolvedValueOnce(
        mockAwsResponse(
          [{ Name: 'FOUND_SECRET', SecretString: 'found' }],
          [
            {
              SecretId: 'MISSING_SECRET',
              ErrorCode: 'ResourceNotFoundException',
              Message: 'Not found',
            },
          ],
        ),
      );

      const provider = new AwsSecretsManagerProvider();
      const result = await provider.load(['FOUND_SECRET', 'MISSING_SECRET']);

      expect(result.FOUND_SECRET).toBe('found');
      expect('MISSING_SECRET' in result).toBe(false);
    });

    it('throws ProviderError on AccessDeniedException without leaking secret identifiers', async () => {
      mockSend.mockResolvedValueOnce(
        mockAwsResponse(
          [],
          [
            {
              SecretId: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:MY_SECRET',
              ErrorCode: 'AccessDeniedException',
              Message: 'User is not authorized',
            },
          ],
        ),
      );

      const provider = new AwsSecretsManagerProvider();
      await expect(provider.load(['MY_SECRET'])).rejects.toThrow(ProviderError);

      // Error message must NOT contain the ARN or secret name
      await expect(provider.load(['MY_SECRET'])).rejects.toSatisfy((err: unknown) => {
        if (!(err instanceof ProviderError)) return false;
        return (
          !err.message.includes('arn:') &&
          !err.message.includes('MY_SECRET') &&
          err.providerName === 'aws'
        );
      });
    });

    it('throws ProviderError on SDK/network errors without leaking secret names', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network timeout connecting to secretsmanager'));

      const provider = new AwsSecretsManagerProvider();
      await expect(provider.load(['MY_SECRET'])).rejects.toThrow(ProviderError);

      mockSend.mockRejectedValueOnce(new Error('Network timeout connecting to secretsmanager'));
      await expect(provider.load(['MY_SECRET'])).rejects.toSatisfy((err: unknown) => {
        if (!(err instanceof ProviderError)) return false;
        return !err.message.includes('MY_SECRET') && err.providerName === 'aws';
      });
    });

    it('skips secrets with no SecretString (binary secrets)', async () => {
      mockSend.mockResolvedValueOnce({
        SecretValues: [
          { Name: 'BINARY_SECRET', SecretString: undefined },
          { Name: 'STRING_SECRET', SecretString: 'value' },
        ],
        Errors: [],
      });

      const provider = new AwsSecretsManagerProvider();
      const result = await provider.load(['BINARY_SECRET', 'STRING_SECRET']);

      expect('BINARY_SECRET' in result).toBe(false);
      expect(result.STRING_SECRET).toBe('value');
    });

    it('handles response with no SecretValues field (returns empty)', async () => {
      mockSend.mockResolvedValueOnce({ Errors: [] }); // no SecretValues key

      const provider = new AwsSecretsManagerProvider();
      const result = await provider.load(['ANY_KEY']);

      expect(result).toEqual({});
    });

    it('handles response with no Errors field without throwing', async () => {
      mockSend.mockResolvedValueOnce({
        SecretValues: [{ Name: 'MY_KEY', SecretString: 'value' }],
        // no Errors key
      });

      const provider = new AwsSecretsManagerProvider();
      const result = await provider.load(['MY_KEY']);

      expect(result.MY_KEY).toBe('value');
    });

    it('uses "UnknownError" when ErrorCode is missing in error entry', async () => {
      mockSend.mockResolvedValueOnce(
        mockAwsResponse(
          [],
          [{ SecretId: 'SECRET', ErrorCode: undefined as unknown as string, Message: 'oops' }],
        ),
      );

      const provider = new AwsSecretsManagerProvider();
      await expect(provider.load(['SECRET'])).rejects.toSatisfy((err: unknown) => {
        if (!(err instanceof ProviderError)) return false;
        return err.message.includes('UnknownError');
      });
    });

    it('falls back to raw secret name when name does not start with secretsPrefix', async () => {
      mockSend.mockResolvedValueOnce(
        mockAwsResponse([{ Name: 'NO_PREFIX_KEY', SecretString: 'val' }]),
      );

      // Prefix is set but the returned secret name doesn't start with it
      const provider = new AwsSecretsManagerProvider({ secretsPrefix: '/prod/' });
      const result = await provider.load(['NO_PREFIX_KEY']);

      expect(result.NO_PREFIX_KEY).toBe('val');
    });
  });

  describe('pagination', () => {
    it('makes multiple BatchGetSecretValue calls when more than 100 keys are requested', async () => {
      const keys = Array.from({ length: 101 }, (_, i) => `KEY_${i}`);

      mockSend
        .mockResolvedValueOnce(
          mockAwsResponse(keys.slice(0, 100).map((k) => ({ Name: k, SecretString: `val-${k}` }))),
        )
        .mockResolvedValueOnce(
          mockAwsResponse(keys.slice(100).map((k) => ({ Name: k, SecretString: `val-${k}` }))),
        );

      const provider = new AwsSecretsManagerProvider();
      const result = await provider.load(keys);

      expect(MockBatchGetSecretValueCommand).toHaveBeenCalledTimes(2);
      expect(MockBatchGetSecretValueCommand).toHaveBeenNthCalledWith(1, {
        SecretIdList: keys.slice(0, 100),
      });
      expect(MockBatchGetSecretValueCommand).toHaveBeenNthCalledWith(2, {
        SecretIdList: keys.slice(100),
      });
      expect(Object.keys(result)).toHaveLength(101);
    });

    it('makes a single call when exactly 100 keys are requested', async () => {
      const keys = Array.from({ length: 100 }, (_, i) => `KEY_${i}`);

      mockSend.mockResolvedValueOnce(
        mockAwsResponse(keys.map((k) => ({ Name: k, SecretString: `val-${k}` }))),
      );

      const provider = new AwsSecretsManagerProvider();
      await provider.load(keys);

      expect(MockBatchGetSecretValueCommand).toHaveBeenCalledTimes(1);
    });

    it('throws ProviderError when a later batch returns AccessDeniedException', async () => {
      const keys = Array.from({ length: 101 }, (_, i) => `KEY_${i}`);

      mockSend
        .mockResolvedValueOnce(
          mockAwsResponse(keys.slice(0, 100).map((k) => ({ Name: k, SecretString: `val-${k}` }))),
        )
        .mockResolvedValueOnce(
          mockAwsResponse(
            [],
            [{ SecretId: 'KEY_100', ErrorCode: 'AccessDeniedException', Message: 'Denied' }],
          ),
        );

      const provider = new AwsSecretsManagerProvider();
      await expect(provider.load(keys)).rejects.toThrow(ProviderError);
    });

    it('merges results from all batches correctly', async () => {
      const keys = Array.from({ length: 101 }, (_, i) => `KEY_${i}`);

      mockSend
        .mockResolvedValueOnce(
          mockAwsResponse(keys.slice(0, 100).map((k) => ({ Name: k, SecretString: `val-${k}` }))),
        )
        .mockResolvedValueOnce(
          mockAwsResponse(keys.slice(100).map((k) => ({ Name: k, SecretString: `val-${k}` }))),
        );

      const provider = new AwsSecretsManagerProvider();
      const result = await provider.load(keys);

      expect(result.KEY_0).toBe('val-KEY_0');
      expect(result.KEY_100).toBe('val-KEY_100');
    });
  });

  describe('caching', () => {
    it('returns cached value on second load within TTL without calling AWS again', async () => {
      mockSend.mockResolvedValueOnce(
        mockAwsResponse([{ Name: 'API_KEY', SecretString: 'cached-value' }]),
      );

      const provider = new AwsSecretsManagerProvider({ cacheTtlMs: 60_000 });
      await provider.load(['API_KEY']);
      const result = await provider.load(['API_KEY']); // second call — should use cache

      expect(mockSend).toHaveBeenCalledTimes(1); // only one real AWS call
      expect(result.API_KEY).toBe('cached-value');
    });

    it('re-fetches after TTL expires', async () => {
      mockSend
        .mockResolvedValueOnce(mockAwsResponse([{ Name: 'API_KEY', SecretString: 'first-value' }]))
        .mockResolvedValueOnce(
          mockAwsResponse([{ Name: 'API_KEY', SecretString: 'second-value' }]),
        );

      const provider = new AwsSecretsManagerProvider({ cacheTtlMs: 1 }); // 1ms TTL
      await provider.load(['API_KEY']);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 5));

      const result = await provider.load(['API_KEY']);
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(result.API_KEY).toBe('second-value');
    });

    it('does not cache when cacheTtlMs is 0', async () => {
      mockSend
        .mockResolvedValueOnce(mockAwsResponse([{ Name: 'API_KEY', SecretString: 'v1' }]))
        .mockResolvedValueOnce(mockAwsResponse([{ Name: 'API_KEY', SecretString: 'v2' }]));

      const provider = new AwsSecretsManagerProvider({ cacheTtlMs: 0 });
      await provider.load(['API_KEY']);
      await provider.load(['API_KEY']);

      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });
});
