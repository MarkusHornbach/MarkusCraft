// Unit tests of the timing summary and the shard assignment of the `report` job.
import { describe, expect, it } from 'vitest';
import { assignShards, collectTests, summarize } from './timings.mjs';

type Report = Parameters<typeof collectTests>[0];

/** A small merged report: two game specs (one with a describe group) and one mp spec. */
const REPORT: Report = {
  suites: [
    {
      title: 'light.spec.ts',
      file: 'light.spec.ts',
      specs: [
        {
          title: 'a tunnel is dark',
          file: 'light.spec.ts',
          tests: [
            {
              projectName: 'game',
              status: 'expected',
              results: [{ duration: 30_000, shardIndex: 1 }],
            },
          ],
        },
      ],
      suites: [
        {
          title: 'torches',
          file: 'light.spec.ts',
          specs: [
            {
              title: 'a torch lights the room',
              file: 'light.spec.ts',
              tests: [
                {
                  projectName: 'game',
                  status: 'unexpected',
                  results: [{ duration: 60_000, shardIndex: 2 }],
                },
              ],
            },
            {
              title: 'skipped here',
              file: 'light.spec.ts',
              tests: [
                {
                  projectName: 'game',
                  status: 'skipped',
                  results: [{ duration: 0, shardIndex: 2 }],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: 'smoke.spec.ts',
      file: 'smoke.spec.ts',
      specs: [
        {
          title: 'the game starts',
          file: 'smoke.spec.ts',
          tests: [
            {
              projectName: 'game',
              status: 'expected',
              results: [{ duration: 5_000, shardIndex: 1 }],
            },
          ],
        },
      ],
    },
    {
      title: 'mpRooms.spec.ts',
      file: 'mpRooms.spec.ts',
      specs: [
        {
          title: 'two players meet',
          file: 'mpRooms.spec.ts',
          tests: [
            {
              projectName: 'multiplayer',
              status: 'expected',
              results: [{ duration: 90_000, shardIndex: 1 }],
            },
          ],
        },
      ],
    },
  ],
};

describe('collectTests', () => {
  it('lists every test with its project, spec, describe path, time, status and shard', () => {
    expect(collectTests(REPORT)).toEqual([
      {
        project: 'game',
        file: 'light.spec.ts',
        title: 'a tunnel is dark',
        durationMs: 30_000,
        status: 'expected',
        shard: 1,
      },
      {
        project: 'game',
        file: 'light.spec.ts',
        title: 'torches › a torch lights the room',
        durationMs: 60_000,
        status: 'unexpected',
        shard: 2,
      },
      {
        project: 'game',
        file: 'light.spec.ts',
        title: 'torches › skipped here',
        durationMs: 0,
        status: 'skipped',
        shard: 2,
      },
      {
        project: 'game',
        file: 'smoke.spec.ts',
        title: 'the game starts',
        durationMs: 5_000,
        status: 'expected',
        shard: 1,
      },
      {
        project: 'multiplayer',
        file: 'mpRooms.spec.ts',
        title: 'two players meet',
        durationMs: 90_000,
        status: 'expected',
        shard: 1,
      },
    ]);
  });

  it('sums the attempts of a test and leaves the shard out where the JSON has none', () => {
    const report: Report = {
      suites: [
        {
          title: 'a.spec.ts',
          specs: [
            {
              title: 't',
              file: 'a.spec.ts',
              tests: [
                {
                  projectName: 'game',
                  status: 'flaky',
                  results: [{ duration: 1_000 }, { duration: 2_000 }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(collectTests(report)).toEqual([
      {
        project: 'game',
        file: 'a.spec.ts',
        title: 't',
        durationMs: 3_000,
        status: 'flaky',
        shard: null,
      },
    ]);
  });

  it('copes with an empty report', () => {
    expect(collectTests({})).toEqual([]);
  });
});

describe('summarize', () => {
  const text = summarize(collectTests(REPORT));

  it('has totals per project with failed and skipped counts', () => {
    expect(text).toContain('| game | 4 | 2 | 1 | 0 | 1 | 1.6 min |');
    expect(text).toContain('| multiplayer | 1 | 1 | 0 | 0 | 0 | 1.5 min |');
  });

  it('has the test time per shard, separately per project', () => {
    expect(text).toContain('| game | 1 | 2 | 0.6 min |');
    expect(text).toContain('| game | 2 | 2 | 1.0 min |');
    expect(text).toContain('| multiplayer | 1 | 1 | 1.5 min |');
  });

  it('lists the specs longest first', () => {
    const rows = text
      .split('\n')
      .filter((line) => line.includes('.spec.ts | ') && /\| \d+ \|$/.test(line));
    expect(rows).toEqual([
      '| game | light.spec.ts | 3 | 90 |',
      '| multiplayer | mpRooms.spec.ts | 1 | 90 |',
      '| game | smoke.spec.ts | 1 | 5 |',
    ]);
  });

  it('lists the slowest tests and names the failed one with its shard', () => {
    expect(text).toContain('| 90 | multiplayer | mpRooms.spec.ts | two players meet |');
    expect(text).toContain('### Failed or flaky tests');
    expect(text).toContain(
      '| game | 2 | light.spec.ts | torches › a torch lights the room | unexpected |',
    );
  });

  it('has no shard table and no failure table when the JSON gives neither', () => {
    const plain = summarize([
      {
        project: 'game',
        file: 'a.spec.ts',
        title: 't',
        durationMs: 1_000,
        status: 'expected',
        shard: null,
      },
    ]);
    expect(plain).not.toContain('per shard');
    expect(plain).not.toContain('Failed or flaky');
  });
});

describe('assignShards', () => {
  it('puts the longest spec first onto the shard with the least time', () => {
    const tests = [
      ['a.spec.ts', 50],
      ['b.spec.ts', 40],
      ['c.spec.ts', 30],
      ['d.spec.ts', 20],
      ['e.spec.ts', 10],
    ].map(([file, s]) => ({
      project: 'game',
      file: file as string,
      title: 't',
      durationMs: (s as number) * 1000,
      status: 'expected',
      shard: null,
    }));
    // Loads: a 50 | b 40, c 70 | d 70, then e ties at 70 and takes the lower index.
    expect(assignShards(tests, 'game', 2)).toEqual([
      ['a.spec.ts', 'd.spec.ts', 'e.spec.ts'],
      ['b.spec.ts', 'c.spec.ts'],
    ]);
  });

  it('looks only at the given project and leaves shards empty when specs run out', () => {
    const tests = collectTests(REPORT);
    expect(assignShards(tests, 'multiplayer', 3)).toEqual([['mpRooms.spec.ts'], [], []]);
  });
});
