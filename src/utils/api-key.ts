import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// Generate a cryptographically secure account API key.
export function generateApiKey(): string {
  const randomPart = randomBytes(32).toString("hex");

  return `um_${randomPart}`;
}

// Store only the fingerprint of a key in the database.
export function hashApiKey(apiKey: string): string {
  return createHash("sha256")
    .update(apiKey)
    .digest("hex");
}

// Compare secrets using a fixed-length representation.
export function secureCompare(
  supplied: string,
  expected: string
): boolean {
  const suppliedHash = createHash("sha256")
    .update(supplied)
    .digest();

  const expectedHash = createHash("sha256")
    .update(expected)
    .digest();

  return timingSafeEqual(suppliedHash, expectedHash);
}