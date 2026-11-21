// Phase 6 part D: the stored identity with its look.
import { describe, expect, it } from 'vitest';
import { parseIdentity } from './playerIdentity';

const KEY = '0123456789abcdef0123456789abcdef';
const fresh = (): string => 'f'.repeat(32);

describe('parseIdentity', () => {
  it('Phase 6 AC11.7: a record of Part B parses with the choice 0', () => {
    expect(parseIdentity(JSON.stringify({ key: KEY, name: 'Ada' }), fresh)).toEqual({
      key: KEY,
      name: 'Ada',
      look: 0,
    });
  });

  it('Phase 6 AC11.7: an invalid look parses as 0', () => {
    for (const look of [9, -1, '3', 2.5, null, true]) {
      expect(parseIdentity(JSON.stringify({ key: KEY, name: 'Ada', look }), fresh).look).toBe(0);
    }
  });

  it('Phase 6 AC11.7: a record with a look survives a round trip', () => {
    const identity = { key: KEY, name: 'Bo', look: 5 };
    expect(parseIdentity(JSON.stringify(identity), fresh)).toEqual(identity);
  });

  it('nothing stored or something unreadable gives a new key', () => {
    expect(parseIdentity(null, fresh)).toEqual({ key: fresh(), name: '', look: 0 });
    expect(parseIdentity('{nope', fresh).key).toBe(fresh());
    expect(parseIdentity(JSON.stringify({ key: 'short' }), fresh).key).toBe(fresh());
  });
});
