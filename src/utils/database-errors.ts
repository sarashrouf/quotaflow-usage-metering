// Inspect an error and its nested cause for a PostgreSQL error code.
export function hasDatabaseErrorCode(
  error: unknown,
  expectedCode: string
): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 5; depth++) {
    if (typeof current !== "object" || current === null) {
      return false;
    }

    if (
      "code" in current &&
      current.code === expectedCode
    ) {
      return true;
    }

    if (!("cause" in current)) {
      return false;
    }

    current = current.cause;
  }

  return false;
}