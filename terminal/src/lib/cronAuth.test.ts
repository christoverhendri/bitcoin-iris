import { describe, expect, it } from 'vitest';
import { isAuthorizedCron } from './cronAuth';

const SECRET = 'test-secret-abc';

describe('isAuthorizedCron', () => {
  it('accepts the exact bearer token', () => {
    expect(isAuthorizedCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it('rejects a missing, empty, malformed or wrong header', () => {
    expect(isAuthorizedCron(null, SECRET)).toBe(false);
    expect(isAuthorizedCron('', SECRET)).toBe(false);
    expect(isAuthorizedCron('Bearer wrong', SECRET)).toBe(false);
    expect(isAuthorizedCron(SECRET, SECRET)).toBe(false); // no scheme
    expect(isAuthorizedCron(`bearer ${SECRET}`, SECRET)).toBe(false); // case-sensitive
    expect(isAuthorizedCron(`Bearer ${SECRET} `, SECRET)).toBe(false); // trailing space
  });

  it('rejects everything when the secret is empty', () => {
    // Otherwise an unset CRON_SECRET would let `Bearer ` through.
    expect(isAuthorizedCron('Bearer ', '')).toBe(false);
    expect(isAuthorizedCron(null, '')).toBe(false);
  });

  it('does not throw on a length mismatch', () => {
    expect(() => isAuthorizedCron('Bearer x', 'a-much-longer-secret')).not.toThrow();
  });
});
