const REDACTED = '[REDACTED]';

export class Secret<T> {
  readonly #value: T;

  constructor(value: T) {
    this.#value = value;
  }

  reveal(): T {
    return this.#value;
  }

  toJSON(): string {
    return REDACTED;
  }

  toString(): string {
    return REDACTED;
  }

  /**
   * Prevents secret values from leaking through JavaScript's type coercion.
   * Without this override, `Number(secret)` or `+secret` could call `valueOf()`
   * which falls back to the default object-to-primitive conversion.
   */
  [Symbol.toPrimitive](_hint: string): string {
    return REDACTED;
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `Secret(${REDACTED})`;
  }
}
