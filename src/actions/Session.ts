// Session: the one door through which the game changes the world and a player's items.
import { type Action, decodeAction } from './actions';
import { type ActionResult, type BlockChange, type PlayerPose, applyAction } from './apply';
import { type ProgressEvent, eventsOf } from '../progress/events';
import {
  EMPTY_PROGRESS,
  type ProgressOutcome,
  type WorldProgress,
  stepProgress,
} from '../progress/progress';
import type { BlockState, StateChange, StateReader } from '../world/blockState';
import type { GameMode, PlayerRecord } from './playerRecord';

/** The players who have one chest open (a room). */
export interface ChestViewers {
  x: number;
  y: number;
  z: number;
  ids: readonly number[];
}

export interface SessionListener {
  /** Blocks were set in the world (already applied when this is called). */
  onBlocks(changes: readonly BlockChange[]): void;
  /**
   * Block states were set (a chest's slots, Phase 8 part B3a), after the blocks of the
   * same action; already applied when this is called.
   */
  onStates?(changes: readonly StateChange[]): void;
  /**
   * Who has the chest open that this player has open (a room, Phase 8 part B3a): player
   * ids, this player too; `ids` empty when the chest was broken.
   */
  onViewers?(viewers: ChestViewers): void;
  /** The local player's confirmed record changed. */
  onPlayer(record: PlayerRecord): void;
  /** The answer to a submitted action. */
  onResult(action: Action, result: ActionResult): void;
  /**
   * The world's task book changed, or a step had outcomes (Adventure, Phase 8). Records
   * changed by XP were reported through `onPlayer` first.
   */
  onProgress?(progress: WorldProgress, outcomes: readonly ProgressOutcome[]): void;
}

/**
 * The game and the user interface hand every action to a session and change the screen
 * when the listener reports back. A session may answer later (a network session in
 * Phase 4): callers must not expect the listener to have run when `submit` returns.
 */
export interface Session {
  /** The local player's record as last confirmed. */
  readonly record: PlayerRecord;
  submit(action: Action): void;
}

/** What a local session works on. The world is the only thing it changes. */
export interface LocalHost {
  world: {
    getBlock(x: number, y: number, z: number): number;
    setBlock(x: number, y: number, z: number, id: number): boolean;
    /** Block states (Phase 8 part B3a); worlds of tests without chests may leave them out. */
    getState?(x: number, y: number, z: number): BlockState | null;
    setState?(x: number, y: number, z: number, state: BlockState | null): boolean;
  };
  mode: GameMode;
  /** Pose of the local player. */
  pose(): PlayerPose;
  /** Simulation time in milliseconds. */
  nowMs(): number;
}

/** The id of the single player in the progress step. */
export const LOCAL_PLAYER_ID = 'local';

/** Single-player session: validates and applies at once, on this device. */
export class LocalSession implements Session {
  private current: PlayerRecord;
  private book: WorldProgress;

  constructor(
    private readonly host: LocalHost,
    record: PlayerRecord,
    private readonly listener: SessionListener,
    progress: WorldProgress = EMPTY_PROGRESS,
  ) {
    this.current = record;
    this.book = progress;
  }

  get record(): PlayerRecord {
    return this.current;
  }

  /** The world's task book as last changed. */
  get progress(): WorldProgress {
    return this.book;
  }

  /**
   * Test tool: replaces the world's task book past the action layer (`setProgress`).
   * Game and UI code must not call this; `pipeline.test.ts` guards it.
   */
  replaceProgress(progress: WorldProgress): void {
    this.book = progress;
    this.listener.onProgress?.(progress, []);
  }

  /** The player's feet Y, once per simulation step: the reach tasks (Adventure only). */
  notePose(y: number): void {
    if (this.host.mode !== 'gathering') return;
    this.step({ kind: 'pose', y });
  }

  /** Runs one event through the progress step and reports what changed. */
  private step(event: ProgressEvent): void {
    const actor = { id: LOCAL_PLAYER_ID, record: this.current };
    const result = stepProgress(this.book, actor, event, [actor]);
    if (result.progress === this.book && result.records.length === 0) return;
    for (const { id, record } of result.records) {
      if (id !== LOCAL_PLAYER_ID) continue;
      this.current = record;
      this.listener.onPlayer(record);
    }
    this.book = result.progress;
    this.listener.onProgress?.(result.progress, result.outcomes);
  }

  /**
   * Test tool: replaces the record past the action layer (`give`, `clearInventory`).
   * Game and UI code must not call this; `pipeline.test.ts` guards it.
   */
  replaceRecord(record: PlayerRecord): void {
    this.current = record;
    this.listener.onPlayer(record);
  }

  private stateReader(): StateReader | undefined {
    const world = this.host.world;
    const getState = world.getState?.bind(world);
    return getState ? { getState } : undefined;
  }

  submit(action: Action): void {
    // Decoding again costs little and gives every source of actions the same checks.
    const decoded = decodeAction(action);
    if (!decoded.ok) {
      this.listener.onResult(action, { ok: false, reason: 'invalid' });
      return;
    }
    const pose = this.host.pose();
    const ctx = {
      world: this.host.world,
      mode: this.host.mode,
      pose,
      record: this.current,
      players: [pose],
      progress: this.book,
      states: this.stateReader(),
    };
    const result = applyAction(ctx, decoded.action, this.host.nowMs());
    // Events read the world before the action's blocks are set.
    const events = this.host.mode === 'gathering' ? eventsOf(decoded.action, result, ctx) : [];
    if (result.ok) {
      for (const change of result.blocks) {
        this.host.world.setBlock(change.x, change.y, change.z, change.id);
      }
      if (result.blocks.length > 0) this.listener.onBlocks(result.blocks);
      // States after the blocks: a placed chest's cell must be a chest by now.
      if (result.states) {
        for (const change of result.states) {
          this.host.world.setState?.(change.x, change.y, change.z, change.state);
        }
        this.listener.onStates?.(result.states);
      }
      if (result.player) {
        this.current = result.player;
        this.listener.onPlayer(result.player);
      }
    }
    for (const event of events) this.step(event);
    this.listener.onResult(decoded.action, result);
  }
}
