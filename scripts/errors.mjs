/** A stable, machine-readable failure without serializing stacks or input text. */
export class Md2CardError extends Error {
  constructor(code, message, details = {}, exitCode = 1, options = {}) {
    super(message, options);
    this.name = 'Md2CardError';
    this.code = code;
    this.details = details;
    this.exitCode = exitCode;
  }
}

function safeDetails(value) {
  const seen = new WeakSet();
  try {
    return JSON.parse(JSON.stringify(value ?? {}, (_key, item) => {
      if (typeof item === 'bigint') return String(item);
      if (typeof item === 'object' && item !== null) {
        if (seen.has(item)) return '[Circular]';
        seen.add(item);
      }
      return item;
    }));
  } catch { return {}; }
}

/** Keep explicitly supplied diagnostics, never copy a stack, cause, or source. */
export function normalizeError(error) {
  const exitCode = Number.isInteger(error?.exitCode) && error.exitCode > 0 && error.exitCode <= 255 ? error.exitCode : 1;
  return {
    schemaVersion: 1,
    status: 'error',
    name: typeof error?.name === 'string' ? error.name : 'Error',
    code: typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR',
    message: typeof error?.message === 'string' ? error.message : String(error ?? 'Unknown error'),
    details: safeDetails(error?.details),
    exitCode
  };
}
