// Unit tests of the `CI result` verdict: never green by mistake, never pending.
import { describe, expect, it } from 'vitest';
import { ciVerdict, jobsAtFault } from './ciResult.mjs';

type Needs = Parameters<typeof ciVerdict>[0];

/** A `needs` context with every job at `result` and the given `full` flag. */
function needs(full: string, result: string, overrides: Record<string, string> = {}): Needs {
  const out: Needs = { changes: { result: 'success', outputs: { full } } };
  for (const job of ['checks', 'build', 'e2e-game', 'e2e-mp', 'report']) {
    out[job] = { result: overrides[job] ?? result, outputs: {} };
  }
  if (overrides.changes) out.changes = { result: overrides.changes, outputs: { full } };
  return out;
}

describe('ciVerdict', () => {
  it('passes a full run in which every job succeeded', () => {
    expect(ciVerdict(needs('true', 'success'))).toEqual({ ok: true, full: true, problems: [] });
  });

  it('passes a run of the fast checks whose browser jobs were skipped', () => {
    const verdict = ciVerdict(needs('false', 'skipped', { checks: 'success' }));
    expect(verdict).toEqual({ ok: true, full: false, problems: [] });
  });

  it('fails a full run with a cancelled shard and names the job', () => {
    const verdict = ciVerdict(needs('true', 'success', { 'e2e-mp': 'cancelled' }));
    expect(verdict.ok).toBe(false);
    expect(verdict.problems).toEqual(['e2e-mp: cancelled']);
  });

  it('fails a full run whose shard was skipped', () => {
    const verdict = ciVerdict(needs('true', 'success', { 'e2e-game': 'skipped' }));
    expect(verdict.ok).toBe(false);
    expect(verdict.problems).toEqual(['e2e-game: skipped although the full suite was due']);
  });

  it('fails when checks failed, even with every browser job green', () => {
    const verdict = ciVerdict(needs('true', 'success', { checks: 'failure' }));
    expect(verdict.problems).toEqual(['checks: failure']);
  });

  it('fails when a browser job ran although the run was not full', () => {
    const verdict = ciVerdict(needs('false', 'skipped', { checks: 'success', build: 'success' }));
    expect(verdict.problems).toEqual(['build: success although only the fast checks were due']);
  });

  it('fails when changes failed and gave no decision', () => {
    const verdict = ciVerdict({ changes: { result: 'failure', outputs: {} }, checks: {} });
    expect(verdict.ok).toBe(false);
    expect(verdict.full).toBeNull();
    expect(verdict.problems).toEqual([
      'changes: failure',
      'checks: missing',
      'changes: no decision (full = missing)',
    ]);
  });

  it('fails when a needed job is missing from the context', () => {
    const context = needs('true', 'success');
    delete context.report;
    expect(ciVerdict(context).problems).toEqual(['report: missing']);
  });

  it('fails an empty context', () => {
    expect(ciVerdict({}).ok).toBe(false);
  });
});

describe('jobsAtFault', () => {
  it('names failed, cancelled and timed-out jobs with their shard, leaving itself out', () => {
    const jobs = [
      { name: 'checks', conclusion: 'success' },
      { name: 'e2e-game (2/4)', conclusion: 'failure' },
      { name: 'e2e-mp (1/3)', conclusion: 'cancelled' },
      { name: 'e2e-mp (2/3)', conclusion: 'timed_out' },
      { name: 'build', conclusion: 'skipped' },
      { name: 'CI result', conclusion: null },
      { name: 'report', conclusion: null },
    ];
    expect(jobsAtFault(jobs, 'CI result')).toEqual([
      'e2e-game (2/4): failure',
      'e2e-mp (1/3): cancelled',
      'e2e-mp (2/3): timed_out',
    ]);
  });
});
