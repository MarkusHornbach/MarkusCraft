import { describe, expect, it } from 'vitest';
import type { Action } from '../actions/actions';
import { BENCH_SUITE_VERSION } from '../game/config';
import type { MoveInput } from '../player/physics';
import { type BenchResult, issueText, parseIssueBody } from './benchReport';
import { type BenchHost, type BenchProgress, BenchRunner } from './BenchRunner';
import { SAMPLE_RESULT } from './sampleResult';
import { type ScenarioPose, type SuiteKind, buildSuite } from './scenarios';
import type { WorldGen } from '../world/generation/worldOptions';

/** A game that only writes down what the runner asks for. */
class FakeHost implements BenchHost {
  readonly log: string[] = [];
  /** Frames until the chunks are idle after a load or a move; Infinity: never. */
  settleFrames = 3;
  /** Frames the chunks stay busy after a stop of the flying scenario. */
  busy = 0;
  input: MoveInput | null = null;
  actions: Action[] = [];
  loads: number[] = [];
  poses: ScenarioPose[] = [];
  /** Generator version of every loaded world. */
  gens: number[] = [];
  /** Steps played with a forward input. */
  movingSteps = 0;
  steps = 0;
  /** Calls of `setInput`: one per scenario when it is prepared, then one per scripted step. */
  inputCalls = 0;
  times: number[] = [];

  loadWorld(renderDistance: number, gen: WorldGen): void {
    this.loads.push(renderDistance);
    this.gens.push(gen.version);
    this.log.push(`load ${renderDistance}`);
    this.busy = this.settleFrames;
  }
  setPlayer(pose: ScenarioPose): void {
    this.poses.push(pose);
    this.log.push(`player ${pose.mode}`);
    this.busy = Math.max(this.busy, this.settleFrames);
  }
  setTime(time: number): void {
    this.times.push(time);
  }
  setInput(input: MoveInput): void {
    this.input = input;
    this.inputCalls++;
  }
  submit(action: Action): void {
    this.actions.push(action);
  }
  yaws: number[] = [];
  setYaw(yaw: number): void {
    this.yaws.push(yaw);
  }
  chunksIdle(): boolean {
    return this.busy <= 0;
  }
  pendingChunks(): number {
    return Math.max(0, this.busy);
  }
  missingMeshDistance(): number {
    return this.busy > 0 ? 1 : 4;
  }
  heapMb(): number | null {
    return 42.4;
  }
  /** Frames until the simulated guests are in the room after `openGuests`. */
  guestFrames = 0;
  guestSteps: number[] = [];
  guestsOpen = false;
  openGuests(): void {
    this.log.push('guests open');
    this.guestsOpen = true;
    this.guestFrames = 2;
  }
  guestsReady(): boolean {
    return !this.guestsOpen || this.guestFrames <= 0;
  }
  stepGuests(step: number): void {
    this.guestSteps.push(step);
  }
  closeGuests(): void {
    if (this.guestsOpen) this.log.push('guests close');
    this.guestsOpen = false;
  }
}

interface Run {
  host: FakeHost;
  runner: BenchRunner;
  progress: BenchProgress[];
  result: BenchResult | null;
  /** Plays frames until the run is over or `until` says stop. Returns the frames played. */
  play: (until?: () => boolean, maxFrames?: number) => number;
  now: () => number;
}

/**
 * A run against the fake host. A frame takes `frameMs` and plays `stepsPerFrame`
 * simulation steps, as the game loop does: the frame is reported first, then the steps.
 */
function start(suite: SuiteKind, frameMs = 16, stepsPerFrame = 1): Run {
  const host = new FakeHost();
  const run: Run = {
    host,
    progress: [],
    result: null,
    runner: null as unknown as BenchRunner,
    play: () => 0,
    now: () => now,
  };
  let now = 1000;
  run.runner = new BenchRunner({
    suite,
    host,
    onProgress: (progress) => run.progress.push(progress),
    info: () => ({
      commit: 'abc1234',
      date: '2026-11-15T10:00:00.000Z',
      env: { ...SAMPLE_RESULT.env, input: 'mouse' },
    }),
    onDone: (result) => {
      run.result = result;
    },
  });
  run.play = (until = () => false, maxFrames = 1_000_000) => {
    let frames = 0;
    while (run.runner.running && !until() && frames < maxFrames) {
      now += frameMs;
      frames++;
      run.runner.frame(now, frameMs, host.busy > 0 ? 6 : 0.5);
      for (let i = 0; i < stepsPerFrame; i++) {
        run.runner.step();
        host.steps++;
        if (host.input && host.input.forward > 0) host.movingSteps++;
      }
      host.busy--;
      host.guestFrames--;
    }
    return frames;
  };
  return run;
}

describe('BenchRunner (Phase 4P AC2.1)', () => {
  it('plays every scenario of the quick suite in order and ends with a complete record', () => {
    const run = start('quick');
    run.play();
    const result = run.result;
    if (!result) throw new Error('no result');
    const suite = buildSuite('quick');
    expect(result.scenarios.map((s) => [s.id, s.rd, s.v])).toEqual(
      suite.map((e) => [e.scenario.id, e.renderDistance, e.scenario.version]),
    );
    expect(run.progress.map((p) => [p.index, p.total, p.scenario])).toEqual(
      suite.map((e, i) => [i + 1, 17, e.scenario.id]),
    );
    expect(run.progress[2].label).toBe('flying');
    // A fresh world per block, and the player put in place for every scenario.
    // A fresh world per block, and `caves` (Phase 8 part B2a) in a generator 3 world of its own.
    expect(run.host.loads).toEqual([2, 2, 3, 3, 2]);
    expect(run.host.gens).toEqual([1, 3, 1, 3, 1]);
    expect(run.host.poses).toEqual(suite.map((e) => e.scenario.start));
    // Every scenario sets its time of day: noon, and midnight for the torches.
    expect(run.host.times).toEqual(suite.map((e) => (e.scenario.id === 'torches' ? 0.75 : 0.25)));
    expect(run.host.log.slice(0, 3)).toEqual(['load 2', 'player walk', 'player walk']);
    // One frame per step: a window of n steps is n frames of 16 ms.
    expect(result.scenarios.map((s) => s.frames)).toEqual(suite.map((e) => e.steps));
    expect(result.scenarios.map((s) => s.ms)).toEqual(suite.map((e) => e.steps * 16));
    expect(result.scenarios.every((s) => s.fps === 62.5 && s.p99 === 16 && !s.cut)).toBe(true);
    expect(result.scenarios.every((s) => s.heap === 42)).toBe(true);
    expect(result).toMatchObject({
      format: 1,
      suite: BENCH_SUITE_VERSION,
      quick: true,
      commit: 'abc1234',
      date: '2026-11-15T10:00:00.000Z',
      throttled: false,
      workers: 'quick',
    });
    expect(result.env).toEqual({ ...SAMPLE_RESULT.env, input: 'mouse', hz: 63 });
    expect(run.runner.running).toBe(false);
    expect(run.runner.total).toBe(17);
    // The simulated guests of `players`: opened when it is prepared, ready before its
    // warm-up, stepped with every step of it and closed when it ends.
    expect(run.host.log.filter((line) => line.startsWith('guests'))).toEqual([
      'guests open',
      'guests close',
      'guests open',
      'guests close',
    ]);
    expect(run.host.guestSteps.length).toBe(2 * (6 + 60));
    expect(run.host.guestSteps.slice(0, 7)).toEqual([-6, -5, -4, -3, -2, -1, 0]);
    // The record is one the issue format carries.
    expect(parseIssueBody(issueText(result))).toEqual(result);
  });

  it('measures only the steps of the window', () => {
    const run = start('quick');
    run.play();
    const suite = buildSuite('quick');
    // Walking: 6 warm-up steps and 60 measured ones per block; flying lets go 20 steps
    // before its window closes. Nothing moves outside warm-up and window.
    const walking = 6 + 60;
    const flying = 6 + 60 - 20;
    // The torches move past their line in the last 24 of their 60 steps.
    const passing = 24;
    // `radar` (Phase 8 part B1) and `caves` (B2a) walk like `walk`.
    expect(run.host.movingSteps).toBe(2 * (walking + flying + passing + walking + walking));
    // The edit scenario: three cells placed and broken per block, none in the warm-up;
    // the torches: the torch into the bar, then five placed.
    expect(run.host.actions.map((a) => a.kind)).toEqual(
      [0, 1].flatMap(() => [
        'place',
        'place',
        'place',
        'break',
        'break',
        'break',
        'setBarSlot',
        'place',
        'place',
        'place',
        'place',
        'place',
      ]),
    );
    expect(run.host.input).toMatchObject({ forward: 0, jump: false, sprint: false });
    // With three steps per frame a window is a third of the frames.
    const fast = start('quick', 16, 3);
    fast.play();
    expect(fast.result?.scenarios.map((s) => s.frames)).toEqual(suite.map((e) => e.steps / 3));
    expect(fast.host.movingSteps).toBe(run.host.movingSteps);
    expect(fast.host.actions).toEqual(run.host.actions);
  });

  it('takes the time until ready once per block and the catch-up time after flying', () => {
    const run = start('quick');
    run.host.settleFrames = 10;
    run.play();
    const result = run.result;
    if (!result) throw new Error('no result');
    // Loaded in one frame, idle ten frames later.
    expect(result.ready).toEqual([
      { rd: 2, ms: 160 },
      { rd: 3, ms: 160 },
      { rd: 2, ms: 160 },
    ]);
    // Only after flying (the second scenario after the start of a block).
    expect(result.scenarios.map((s) => s.catchUpMs)).toEqual(
      buildSuite('quick').map((e) => (e.scenario.id === 'fly' ? 0 : null)),
    );
  });

  it('waits after flying until the chunks are idle again', () => {
    const run = start('quick');
    let piled = false;
    run.play(() => {
      // Chunks pile up while the player flies.
      if (!piled && run.runner.progress.scenario === 'fly' && run.host.movingSteps > 70) {
        run.host.busy = 80;
        piled = true;
      }
      return false;
    });
    const fly = run.result?.scenarios[2];
    expect(fly?.catchUpMs).toBeGreaterThan(0);
    expect(fly?.catchUpMs).toBeLessThanOrEqual(80 * 16);
    expect(fly?.pendMax).toBeGreaterThan(0);
    expect(fly?.lagMin).toBe(1);
    expect(fly?.cut).toBe(false);
  });

  it('a slower last scenario sets the throttling flag', () => {
    const run = start('quick');
    run.play(() => run.runner.progress.index === 17);
    const slow = start('quick');
    slow.play(() => slow.runner.progress.index === 15);
    // The same run, but the last scenario with frames of 20 ms instead of 16.
    let now = slow.now();
    while (slow.runner.running) {
      now += 20;
      slow.runner.frame(now, 20, 0);
      slow.runner.step();
      slow.host.busy--;
    }
    run.play();
    expect(run.result?.throttled).toBe(false);
    expect(slow.result?.throttled).toBe(true);
  });
});

describe('BenchRunner cut-offs (Phase 4P AC2.2)', () => {
  it('cuts a window that takes more than three times its nominal duration and goes on', () => {
    // 30 steps are half a second; at one step per 60 ms the window would take 1.8 s.
    const run = start('quick', 60);
    run.play();
    const result = run.result;
    if (!result) throw new Error('no result');
    expect(result.scenarios.length).toBe(17);
    expect(result.scenarios.every((s) => s.cut)).toBe(true);
    const stand = result.scenarios[0];
    expect(stand.ms).toBeGreaterThan(1500);
    expect(stand.ms).toBeLessThanOrEqual(1500 + 60);
    // Exactly three times is not cut.
    const edge = start('quick', 50);
    edge.play();
    expect(edge.result?.scenarios.map((s) => s.cut)).toEqual(new Array(17).fill(false));
  });

  it('gives up waiting for idle chunks after 120 s and marks the scenario', () => {
    const run = start('quick', 1000);
    run.host.settleFrames = Infinity;
    // The first wait never ends by itself.
    const frames = run.play(() => run.host.inputCalls > 1, 200);
    expect(frames).toBeGreaterThan(120);
    expect(frames).toBeLessThan(130);
    run.host.settleFrames = 2;
    run.host.busy = 0;
    run.play(() => run.runner.progress.index === 3);
    // The flying scenario stops; its chunks never come to rest either.
    run.play(() => {
      if (run.runner.progress.scenario === 'fly') run.host.busy = Infinity;
      return run.runner.progress.index === 4;
    });
    run.host.busy = 0;
    run.play();
    const result = run.result;
    if (!result) throw new Error('no result');
    expect(result.scenarios[0].cut).toBe(true);
    expect(result.ready[0].ms).toBeGreaterThan(120_000);
    expect(result.scenarios[2].cut).toBe(true);
    expect(result.scenarios[2].catchUpMs).toBeGreaterThan(120_000);
  });
});

describe('BenchRunner interrupts (Phase 4P AC2.3)', () => {
  it('ends without a record in every phase and ignores what follows', () => {
    const phases: ((run: Run) => boolean)[] = [
      // Before the first frame, while waiting for chunks, in the warm-up, in a window,
      // while catching up after flying, and in a later scenario.
      () => true,
      (run) => run.host.loads.length === 1,
      (run) => run.host.inputCalls === 4,
      (run) => run.host.inputCalls === 21,
      (run) => {
        if (run.runner.progress.scenario === 'fly' && run.host.movingSteps > 70) {
          run.host.busy = 1000;
        }
        return run.host.busy > 900 && run.host.input?.forward === 0;
      },
      (run) => run.runner.progress.index === 6,
    ];
    for (const [i, reached] of phases.entries()) {
      const run = start('quick');
      run.play(() => reached(run));
      expect(run.runner.running, `phase ${i}`).toBe(true);
      run.runner.interrupt();
      expect(run.runner.running).toBe(false);
      expect(run.host.input?.forward ?? 0).toBe(0);
      const calls = run.host.log.length;
      const actions = run.host.actions.length;
      const shown = run.progress.length;
      for (let frame = 0; frame < 500; frame++) {
        run.runner.frame(run.now() + frame * 16, 16, 0);
        run.runner.step();
      }
      run.runner.interrupt();
      expect(run.result, `phase ${i}`).toBeNull();
      expect(run.host.log.length).toBe(calls);
      expect(run.host.actions.length).toBe(actions);
      expect(run.progress.length).toBe(shown);
      expect(run.host.input?.forward ?? 0).toBe(0);
    }
  });
});
