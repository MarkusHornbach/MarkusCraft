// Autosave: decides when to write what. Pure logic; the time comes in as a parameter.
import { AUTOSAVE_INTERVAL_MS } from './config';

/** What one write covers. The writer must take its snapshot before it first awaits. */
export interface SaveBatch {
  /** Chunk keys whose edits changed. */
  chunks: string[];
  meta: boolean;
}

export type SaveWriter = (batch: SaveBatch) => Promise<void>;

export class Autosave {
  private readonly dirtyChunks = new Set<string>();
  private dirtyMeta = false;
  /** Time of the first change that is not written yet, or null if nothing is dirty. */
  private firstDirtyMs: number | null = null;
  private writing: Promise<void> | null = null;
  private error: string | null = null;

  constructor(
    private readonly writer: SaveWriter,
    private readonly intervalMs: number = AUTOSAVE_INTERVAL_MS,
  ) {}

  /** True while a change is not written yet, also while its write is under way. */
  get dirty(): boolean {
    return this.firstDirtyMs !== null || this.writing !== null;
  }

  /** Message of the last failed write; null again after a write succeeded. */
  get lastError(): string | null {
    return this.error;
  }

  markChunk(key: string, nowMs: number): void {
    this.dirtyChunks.add(key);
    this.firstDirtyMs ??= nowMs;
  }

  markMeta(nowMs: number): void {
    this.dirtyMeta = true;
    this.firstDirtyMs ??= nowMs;
  }

  /** Called regularly: writes once the oldest unsaved change is an interval old. */
  tick(nowMs: number): void {
    if (this.firstDirtyMs === null || this.writing) return;
    if (nowMs - this.firstDirtyMs < this.intervalMs) return;
    void this.write(nowMs);
  }

  /**
   * Writes everything dirty now (pause, page hidden, leaving the world). Resolves when
   * nothing is left to write or a write failed; it never rejects.
   */
  async flush(nowMs: number): Promise<void> {
    // A write under way took its snapshot earlier: wait, then write what came after.
    while (this.writing) await this.writing;
    if (this.firstDirtyMs === null) return;
    await this.write(nowMs);
  }

  private write(nowMs: number): Promise<void> {
    const batch: SaveBatch = { chunks: [...this.dirtyChunks], meta: this.dirtyMeta };
    this.dirtyChunks.clear();
    this.dirtyMeta = false;
    this.firstDirtyMs = null;
    let result: Promise<void>;
    try {
      result = this.writer(batch);
    } catch (error) {
      result = Promise.reject(error);
    }
    const writing = result.then(
      () => {
        this.error = null;
      },
      (error: unknown) => {
        // Everything stays dirty and is tried again one interval after the failure.
        for (const key of batch.chunks) this.dirtyChunks.add(key);
        this.dirtyMeta ||= batch.meta;
        this.firstDirtyMs = nowMs;
        this.error = error instanceof Error ? error.message : String(error);
      },
    );
    this.writing = writing;
    void writing.then(() => {
      if (this.writing === writing) this.writing = null;
    });
    return writing;
  }
}
