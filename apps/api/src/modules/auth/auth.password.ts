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
