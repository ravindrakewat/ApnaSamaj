/**
 * Apna Samaj — Production CORS Policy & Origin Hardening
 * 
 * Invariants:
 * 1. Only explicitly approved Apna Samaj production origins are permitted.
 * 2. Broad `*.vercel.app` wildcards are strictly prohibited in production.
 * 3. Legitimate community subdomains under `*.samaz.in` are permitted over HTTPS.
 * 4. Localhost and loopback origins are permitted only in non-production environments.
 */

export const APPROVED_APNA_SAMAJ_ORIGINS = [
  'https://samaz.in',
  'https://www.samaz.in',
  'https://admin.samaz.in',
  'https://kewat.samaz.in',
  'https://gupta.samaz.in',
  'https://apna-samaj.vercel.app',
  'https://apna-samaj-admin.vercel.app',
] as const;

export interface CorsOriginValidationOptions {
  isProduction?: boolean;
  extraAllowed?: string[];
}

/**
 * Validates whether an incoming Origin header is permitted.
 */
export function isCorsOriginAllowed(
  origin: string | undefined,
  options?: CorsOriginValidationOptions
): boolean {
  // Allow requests with no origin header (e.g. mobile applications, curl, server-to-server)
  if (!origin) return true;

  const cleanOrigin = origin.trim().replace(/\/+$/, '');
  const isProduction = options?.isProduction ?? (process.env.NODE_ENV === 'production');
  const extraAllowed = options?.extraAllowed || [];

  // 1. Explicit static allowlist check
  if ((APPROVED_APNA_SAMAJ_ORIGINS as readonly string[]).includes(cleanOrigin)) {
    return true;
  }

  // 2. Explicit environment-configured allowlist (e.g. CLIENT_URL, ADMIN_URL)
  if (extraAllowed.includes(cleanOrigin)) {
    return true;
  }

  // 3. Verified apex or subdomain under .samaz.in
  try {
    const parsed = new URL(cleanOrigin);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === 'samaz.in' || hostname.endsWith('.samaz.in')) {
      // In production, require HTTPS
      if (isProduction && parsed.protocol !== 'https:') {
        return false;
      }
      return true;
    }
  } catch {
    return false;
  }

  // 4. Localhost development origins (strictly disabled in production)
  if (!isProduction) {
    try {
      const parsed = new URL(cleanOrigin);
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.endsWith('.localhost')
      ) {
        return true;
      }
    } catch {
      // Fall through to false if URL is malformed
    }
  }

  // Reject all other origins (including arbitrary *.vercel.app attacker origins)
  return false;
}
