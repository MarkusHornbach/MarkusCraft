// Session: the one door through which the game changes the world and a player's items.
import { type Action, decodeAction } from './actions';
import { type ActionResult, type BlockChange, type PlayerPose, applyAction } from './apply';
import type { GameMode, PlayerRecord } from './playerRecord';

export interface SessionListener {
  /** Blocks were set in the world (already applied when this is called). */
  onBlocks(changes: readonly BlockChange[]): void;
  /** The local player's confirmed record changed. */
  onPlayer(record: PlayerRecord): void;
  /** The answer to a submitted action. */
  onResult(action: Action, result: ActionResult): void;
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
  };
  mode: GameMode;
  /** Pose of the local player. */
  pose(): PlayerPose;
  /** Simulation time in milliseconds. */
  nowMs(): number;
}

/** Single-player session: validates and applies at once, on this device. */
export class LocalSession implements Session {
  private current: PlayerRecord;

  constructor(
    private readonly host: LocalHost,
    record: PlayerRecord,
    private readonly listener: SessionListener,
  ) {
    this.current = record;
  }

  get record(): PlayerRecord {
    return this.current;
  }

  submit(action: Action): void {
    // Decoding again costs little and gives every source of actions the same checks.
    const decoded = decodeAction(action);
    if (!decoded.ok) {
      this.listener.onResult(action, { ok: false, reason: 'invalid' });
      return;
    }
    const pose = this.host.pose();
    const result = applyAction(
      { world: this.host.world, mode: this.host.mode, pose, record: this.current, players: [pose] },
      decoded.action,
      this.host.nowMs(),
    );
    if (result.ok) {
      for (const change of result.blocks) {
        this.host.world.setBlock(change.x, change.y, change.z, change.id);
      }
      if (result.blocks.length > 0) this.listener.onBlocks(result.blocks);
      if (result.player) {
        this.current = result.player;
        this.listener.onPlayer(result.player);
      }
    }
    this.listener.onResult(decoded.action, result);
  }
}
