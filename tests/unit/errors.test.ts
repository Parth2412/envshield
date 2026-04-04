import { describe, expect, it } from 'vitest';
import { EnvValidationError, ProviderError, SecretAccessError } from '../../src/errors/index.js';

describe('Error classes', () => {
  describe('EnvValidationError', () => {
    it('has correct name and message', () => {
      const err = new EnvValidationError('Validation failed', { PORT: ['must be a number'] });
      expect(err.name).toBe('EnvValidationError');
      expect(err.message).toBe('Validation failed');
      expect(err.fields).toEqual({ PORT: ['must be a number'] });
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('SecretAccessError', () => {
    it('has correct name and message', () => {
      const err = new SecretAccessError('Access denied');
      expect(err.name).toBe('SecretAccessError');
      expect(err.message).toBe('Access denied');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('ProviderError', () => {
    it('has correct name, message, providerName', () => {
      const err = new ProviderError('Load failed', 'file-provider');
      expect(err.name).toBe('ProviderError');
      expect(err.message).toBe('Load failed');
      expect(err.providerName).toBe('file-provider');
      expect(err).toBeInstanceOf(Error);
    });

    it('forwards cause to Error base', () => {
      const cause = new Error('original');
      const err = new ProviderError('Load failed', 'file-provider', cause);
      expect(err.cause).toBe(cause);
      // Also check that the standard Error.cause mechanism works
      expect((err as NodeJS.ErrnoException).cause).toBe(cause);
    });
  });
});
