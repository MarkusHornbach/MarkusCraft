// The state machine of a performance test run. It plays the scenarios of a suite through
// a small interface to the game and collects the numbers; time and the game come in as
// parameters, so it runs in Node against a fake host. Pure.
import type { Action } from '../actions/actions';
import {
  BENCH_CHUNK_EDGES,
  BENCH_CUT_FACTOR,
  BENCH_FORMAT_VERSION,
  BENCH_FRAME_EDGES,
  BENCH_IDLE_TIMEOUT_MS,
  BENCH_SUITE_VERSION,
  BENCH_TIME,
  SIM_HZ,
} from '../game/config';
import type { MoveInput } from '../player/physics';
import { NO_INPUT } from '../player/physics';
import {
  type BenchEnv,
  type BenchResult,
  type ScenarioResult,
  scenarioResult,
} from './benchReport';
import { BenchStats } from './benchStats';
import { type ScenarioPose, type SuiteEntry, type SuiteKind, buildSuite } from './scenarios';
import { isThrottled, workersVerdict } from './verdict';

/** What the runner needs from the game. `Game` implements it; tests pass a fake. */
export interface BenchHost {
  /** Opens a fresh test world at this render distance, replacing the one before. */
  loadWorld(renderDistance: number): void;
  setPlayer(pose: ScenarioPose): void;
  /** Sets the time of day (0..1); the clock stands still during a run. */
  setTime(time: number): void;
  /** The scripted input of the next simulation steps. */
  setInput(input: MoveInput): void;
  submit(action: Action): void;
  /** Nothing left to load and no mesh waiting for changed light. */
  chunksIdle(): boolean;
  pendingChunks(): number;
  /** Chebyshev distance in chunks to the nearest chunk in range without a mesh. */
  missingMeshDistance(): number;
  /** JavaScript heap in MB, or null where the browser does not tell. */
  heapMb(): number | null;
}

/** What a finished run adds to its numbers. */
export interface RunInfo {
  commit: string;
  /** UTC, ISO 8601. */
  date: string;
  /** The environment; the refresh rate is filled in by the runner. */
  env: Omit<BenchEnv, 'hz'>;
}

export interface BenchProgress {
  /** Scenario being prepared or measured, counted from 1. */
  index: number;
  total: number;
  scenario: string;
  label: string;
}

export interface RunnerOptions {
  suite: SuiteKind;
  host: BenchHost;
  /** Called when the next scenario begins. */
  onProgress: (progress: BenchProgress) => void;
  /** Asked for once, when the last scenario is measured. */
  info: () => RunInfo;
  onDone: (result: BenchResult) => void;
}

/**
 * - `prepare`: load the world (first scenario of a block) and put the player in place
 * - `settle`: wait for idle chunks
 * - `warmup`, `window`: the scenario's steps; only the window is measured
 * - `catchUp`: after `fly`, wait for idle chunks again
 */
type Phase = 'prepare' | 'settle' | 'warmup' | 'window' | 'catchUp' | 'done' | 'stopped';

export class BenchRunner {
  private readonly entries: SuiteEntry[];
  private readonly host: BenchHost;
  private readonly options: RunnerOptions;
  private readonly stats = new BenchStats();
  private readonly results: ScenarioResult[] = [];
  private readonly ready: { rd: number; ms: number }[] = [];
  private phase: Phase = 'prepare';
  private index = 0;
  /** The step the next call of `step` plays: negative in the warm-up. */
  private stepIndex = 0;
  /** Time of the frame the current wait or window began with; null until that frame. */
  private sinceMs: number | null = null;
  /** Time the fresh world of this block was loaded, until its ready time is taken. */
  private loadedMs: number | null = null;
  /** The window's last step was played; the frame that follows closes it. */
  private windowDone = false;
  private cut = false;
  /** The scenario waiting for its catch-up time. */
  private pending: { stats: ReturnType<BenchStats['summary']>; heap: number | null } | null = null;
  /** Median frame time of the first scenario: the display's refresh interval. */
  private refreshMs = 0;

  constructor(options: RunnerOptions) {
    this.options = options;
    this.host = options.host;
    this.entries = buildSuite(options.suite);
  }

  get total(): number {
    return this.entries.length;
  }

  /** True while the run is going on. */
  get running(): boolean {
    return this.phase !== 'done' && this.phase !== 'stopped';
  }

  get progress(): BenchProgress {
    const entry = this.entries[Math.min(this.index, this.entries.length - 1)];
    return {
      index: Math.min(this.index + 1, this.entries.length),
      total: this.entries.length,
      scenario: entry.scenario.id,
      label: entry.scenario.label,
    };
  }

  /** Ends the run without a result. Frames and steps are ignored from now on. */
  interrupt(): void {
    if (!this.running) return;
    this.phase = 'stopped';
    this.host.setInput(NO_INPUT);
  }

  /**
   * Called before every simulation step: sets the input of that step and submits its
   * action. Counting steps here, not time, gives every device the same route.
   */
  step(): void {
    if (this.phase !== 'warmup' && this.phase !== 'window') return;
    const entry = this.entries[this.index];
    if (this.windowDone) {
      // Steps of the same frame after the window's last one.
      this.host.setInput(NO_INPUT);
      return;
    }
    const step = this.stepIndex;
    this.host.setInput(entry.scenario.input(step, entry.steps));
    if (step >= 0) {
      const action = entry.scenario.action(step, entry.steps);
      if (action) this.host.submit(action);
    }
    this.stepIndex++;
    if (this.stepIndex === 0) {
      // The window opens with the frame that follows.
      this.phase = 'window';
      this.sinceMs = null;
      this.stats.reset();
    }
    if (this.stepIndex === entry.steps) this.windowDone = true;
  }

  /**
   * Called once per rendered frame with the time of the frame, the time since the frame
   * before and the chunk work done in between.
   */
  frame(nowMs: number, frameMs: number, chunkWorkMs: number): void {
    switch (this.phase) {
      case 'prepare':
        this.prepare(nowMs);
        break;
      case 'settle':
        this.settle(nowMs);
        break;
      case 'window':
        this.measure(nowMs, frameMs, chunkWorkMs);
        break;
      case 'catchUp':
        this.catchUp(nowMs);
        break;
      default:
        break;
    }
  }

  private prepare(nowMs: number): void {
    const entry = this.entries[this.index];
    this.options.onProgress(this.progress);
    this.host.setInput(NO_INPUT);
    if (entry.fresh) {
      this.host.loadWorld(entry.renderDistance);
      this.loadedMs = nowMs;
    }
    this.host.setPlayer(entry.scenario.start);
    this.host.setTime(entry.scenario.time ?? BENCH_TIME);
    this.cut = false;
    this.windowDone = false;
    this.sinceMs = nowMs;
    this.phase = 'settle';
  }

  private settle(nowMs: number): void {
    const entry = this.entries[this.index];
    const waited = nowMs - (this.sinceMs ?? nowMs);
    const idle = this.host.chunksIdle();
    if (!idle && waited <= BENCH_IDLE_TIMEOUT_MS) return;
    // Chunks that never came to rest: go on, and say so in the result.
    if (!idle) this.cut = true;
    if (this.loadedMs !== null) {
      this.ready.push({ rd: entry.renderDistance, ms: Math.round(nowMs - this.loadedMs) });
      this.loadedMs = null;
    }
    this.stepIndex = -entry.warmup;
    this.phase = 'warmup';
  }

  private measure(nowMs: number, frameMs: number, chunkWorkMs: number): void {
    const entry = this.entries[this.index];
    if (this.sinceMs === null) {
      // The first frame of the window: the time before it was warm-up.
      this.sinceMs = nowMs;
      return;
    }
    this.stats.record(
      frameMs,
      chunkWorkMs,
      this.host.pendingChunks(),
      this.host.missingMeshDistance(),
    );
    const limit = (entry.steps / SIM_HZ) * 1000 * BENCH_CUT_FACTOR;
    if (!this.windowDone && nowMs - this.sinceMs > limit) {
      this.cut = true;
      this.windowDone = true;
    }
    if (!this.windowDone) return;
    this.host.setInput(NO_INPUT);
    if (this.index === 0) this.refreshMs = this.stats.median();
    this.pending = { stats: this.stats.summary(), heap: this.host.heapMb() };
    if (entry.scenario.id === 'fly') {
      this.sinceMs = nowMs;
      this.phase = 'catchUp';
      this.catchUp(nowMs);
    } else {
      this.finishScenario(null);
    }
  }

  private catchUp(nowMs: number): void {
    const waited = nowMs - (this.sinceMs ?? nowMs);
    const idle = this.host.chunksIdle();
    if (!idle && waited <= BENCH_IDLE_TIMEOUT_MS) return;
    if (!idle) this.cut = true;
    this.finishScenario(waited);
  }

  private finishScenario(catchUpMs: number | null): void {
    const entry = this.entries[this.index];
    const pending = this.pending;
    if (pending) {
      this.results.push(
        scenarioResult(pending.stats, {
          id: entry.scenario.id,
          v: entry.scenario.version,
          rd: entry.renderDistance,
          catchUpMs,
          heap: pending.heap,
          cut: this.cut,
        }),
      );
    }
    this.pending = null;
    this.index++;
    if (this.index < this.entries.length) {
      this.phase = 'prepare';
      return;
    }
    this.phase = 'done';
    this.options.onDone(this.result());
  }

  private result(): BenchResult {
    const info = this.options.info();
    const quick = this.options.suite === 'quick';
    return {
      format: BENCH_FORMAT_VERSION,
      suite: BENCH_SUITE_VERSION,
      quick,
      commit: info.commit,
      date: info.date,
      ready: this.ready,
      throttled: isThrottled(this.results),
      workers: workersVerdict(this.results, info.env.input, quick),
      env: { ...info.env, hz: this.refreshMs > 0 ? Math.round(1000 / this.refreshMs) : 0 },
      frameEdges: [...BENCH_FRAME_EDGES],
      chunkEdges: [...BENCH_CHUNK_EDGES],
      scenarios: this.results,
    };
  }
}
