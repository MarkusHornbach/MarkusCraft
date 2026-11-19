import { describe, expect, it } from 'vitest';
import { buildCommit } from './buildCommit';

describe('buildCommit', () => {
  it('Phase 6 AC1.8: BUILD_COMMIT wins over GITHUB_SHA and git', () => {
    const git = () => 'fedcba9876543210';
    expect(buildCommit({ BUILD_COMMIT: 'abc1234', GITHUB_SHA: '0123456789' }, git)).toBe('abc1234');
    expect(buildCommit({ BUILD_COMMIT: 'abc1234567890' }, git)).toBe('abc1234');
    expect(buildCommit({ GITHUB_SHA: '0123456789abcdef' }, git)).toBe('0123456');
    expect(buildCommit({}, git)).toBe('fedcba9');
    expect(buildCommit({}, () => 'fedcba9876\n')).toBe('fedcba9');
  });

  it('falls back to dev; ignores empty and malformed values', () => {
    expect(buildCommit({}, () => null)).toBe('dev');
    expect(buildCommit({ BUILD_COMMIT: '' }, () => null)).toBe('dev');
    expect(buildCommit({ BUILD_COMMIT: 'a b;c' }, () => 'abcdef1')).toBe('abcdef1');
  });
});
