import * as argon2 from 'argon2';

/**
 * Verifies a plaintext password against an Argon2id password hash.
 * Compatible with the Argon2id parameters used in the database seed script.
 */
export async function verifyPassword(hash: string, plainText: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainText);
  } catch {
    return false;
  }
}

/**
 * Hashes a plaintext password using Argon2id with standard project parameters:
 * memoryCost: 64MB (2**16), timeCost: 3, parallelism: 1 thread.
 */
export async function hashPassword(plainText: string): Promise<string> {
  return argon2.hash(plainText, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });
}
