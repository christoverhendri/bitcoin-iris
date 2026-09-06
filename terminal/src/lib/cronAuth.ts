import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Bearer check for the ingestion route.
 *
 * It lives here rather than inside `route.ts` because Next validates the exports
 * of a route module and rejects anything that is not a handler — so a guard
 * defined there cannot be unit-tested, and this one is worth testing: it is the
 * only thing standing between the open internet and a service-role writer.
 *
 * Constant time. `timingSafeEqual` throws on a length mismatch, which would
 * itself leak the secret's length, so both sides are hashed to a fixed 32 bytes
 * before the comparison.
 */
export function isAuthorizedCron(authorizationHeader: string | null, secret: string): boolean {
  // An empty secret would make any request with an empty bearer token pass.
  if (!secret) return false;

  const header = authorizationHeader ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';

  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}
