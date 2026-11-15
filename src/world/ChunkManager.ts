// Chunk manager: decides which chunks to generate, light, mesh and unload around a centre,
// spending a limited time budget per frame. Pure: the renderer listens via callbacks.
import { chunkKey } from './chunk';
import { type ChunkMeshData, meshChunk } from './meshing/mesher';
import type { World } from './World';

export interface ChunkListener {
  /** A (new or updated) mesh for a chunk is ready. */
  onMesh(cx: number, cz: number, data: ChunkMeshData): void;
  /** The chunk's mesh is no longer valid and its GPU resources must be released. */
  onUnload(cx: number, cz: number): void;
}

/** The chunk itself first, then its eight neighbours. */
const NEIGHBOURHOOD: readonly (readonly [number, number])[] = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/** Chebyshev distance: load areas are squares of chunks. */
function ringDistance(dx: number, dz: number): number {
  return Math.max(Math.abs(dx), Math.abs(dz));
}

export class ChunkManager {
  private radius: number;
  private centerCx = 0;
  private centerCz = 0;
  /** Offsets of all chunks within the radius, nearest first. */
  private offsets: Int16Array = new Int16Array(0);
  /** Index into `offsets` of the first chunk that may still need work. */
  private next = 0;
  private meshedInRange = 0;
  private meshedTotal = 0;
  private started = false;
  /** Meshed chunks whose light changed through an edit elsewhere: remeshed before loading. */
  private readonly urgent = new Map<string, { cx: number; cz: number }>();
  /** Jobs done since the manager was created, by kind. */
  readonly jobs = { generate: 0, light: 0, mesh: 0 };

  constructor(
    private readonly world: World,
    private readonly listener: ChunkListener,
    radius: number,
  ) {
    this.radius = radius;
    this.buildOffsets();
    world.onLightChange = (cx, cz, lit) => this.lightChanged(cx, cz, lit);
  }

  /** Number of chunks inside the load radius: (2R+1)². */
  get targetCount(): number {
    return this.offsets.length / 2;
  }

  /** Meshed chunks inside the load radius. */
  get loaded(): number {
    return this.meshedInRange;
  }

  /** Chunks inside the load radius that still wait for their mesh. */
  get pending(): number {
    return this.started ? this.targetCount - this.meshedInRange : this.targetCount;
  }

  /** All chunks that currently own a mesh, including the unload-hysteresis ring. */
  get meshed(): number {
    return this.meshedTotal;
  }

  /** Meshed chunks that wait for a new mesh because their light changed. */
  get relight(): number {
    return this.urgent.size;
  }

  get loadRadius(): number {
    return this.radius;
  }

  /**
   * How far the world is complete around the centre: the Chebyshev distance in chunks to
   * the nearest chunk inside the load radius that has no mesh, or the radius + 1 if all
   * have one. Read-only; the performance test calls it once per frame.
   */
  missingMeshDistance(): number {
    if (this.pending === 0) return this.radius + 1;
    for (let d = 0; d <= this.radius; d++) {
      // The ring of chunks at distance d: its two rows, then the rest of its two columns.
      for (let i = -d; i <= d; i++) {
        if (!this.hasMesh(i, -d) || !this.hasMesh(i, d)) return d;
        if (!this.hasMesh(-d, i) || !this.hasMesh(d, i)) return d;
      }
    }
    return this.radius + 1;
  }

  private hasMesh(dx: number, dz: number): boolean {
    return this.world.getChunk(this.centerCx + dx, this.centerCz + dz)?.meshed === true;
  }

  setRadius(radius: number): void {
    if (radius === this.radius) return;
    this.radius = radius;
    this.buildOffsets();
    this.refresh();
  }

  /** Moves the centre of the loaded area to a chunk coordinate. */
  setCenter(cx: number, cz: number): void {
    if (this.started && cx === this.centerCx && cz === this.centerCz) return;
    this.centerCx = cx;
    this.centerCz = cz;
    this.started = true;
    this.refresh();
  }

  /**
   * Runs jobs until the budget is used up: first the remeshes that a light change asked
   * for, then generating, lighting and meshing, nearest chunk first. One job handles one
   * chunk. At least one job runs per call so progress is guaranteed. Returns the job count.
   */
  update(now: () => number, budgetMs: number): number {
    if (!this.started) return 0;
    const start = now();
    let jobs = 0;
    while (this.urgent.size > 0) {
      this.remeshNearestUrgent();
      jobs++;
      if (now() - start >= budgetMs) return jobs;
    }
    while (this.runNextJob()) {
      jobs++;
      if (now() - start >= budgetMs) break;
    }
    return jobs;
  }

  /**
   * Rebuilds the mesh of a chunk right now (after an edit). If the chunk cannot be meshed
   * correctly because a neighbour is missing or not lit, its mesh is dropped and queued
   * again.
   */
  remesh(cx: number, cz: number): void {
    const chunk = this.world.getChunk(cx, cz);
    if (!chunk || !chunk.meshed) return;
    this.urgent.delete(chunkKey(cx, cz));
    if (this.world.allLit(cx, cz)) {
      this.jobs.mesh++;
      this.listener.onMesh(cx, cz, this.buildMesh(cx, cz));
      return;
    }
    this.dropMesh(cx, cz);
  }

  /** The world reports a chunk whose mesh no longer shows its light. */
  private lightChanged(cx: number, cz: number, lit: boolean): void {
    if (lit) {
      if (this.world.getChunk(cx, cz)?.meshed) this.urgent.set(chunkKey(cx, cz), { cx, cz });
      return;
    }
    // The chunk has no light any more: no mesh that reads it can stay.
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) this.dropMesh(cx + dx, cz + dz);
    }
  }

  /** Takes a chunk's mesh away; inside the radius it is built again by the loading jobs. */
  private dropMesh(cx: number, cz: number): void {
    const chunk = this.world.getChunk(cx, cz);
    if (!chunk || !chunk.meshed) return;
    chunk.meshed = false;
    this.meshedTotal--;
    if (this.inRange(cx, cz)) this.meshedInRange--;
    this.next = 0;
    this.urgent.delete(chunkKey(cx, cz));
    this.listener.onUnload(cx, cz);
  }

  private remeshNearestUrgent(): void {
    let nearest: { cx: number; cz: number } | null = null;
    let best = Infinity;
    for (const entry of this.urgent.values()) {
      const dx = entry.cx - this.centerCx;
      const dz = entry.cz - this.centerCz;
      if (dx * dx + dz * dz < best) {
        best = dx * dx + dz * dz;
        nearest = entry;
      }
    }
    if (nearest) this.remesh(nearest.cx, nearest.cz);
  }

  private inRange(cx: number, cz: number): boolean {
    return ringDistance(cx - this.centerCx, cz - this.centerCz) <= this.radius;
  }

  private buildOffsets(): void {
    const r = this.radius;
    const list: [number, number][] = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) list.push([dx, dz]);
    // Euclidean order inside the square: the area fills in as a growing disc.
    list.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
    this.offsets = new Int16Array(list.length * 2);
    list.forEach(([dx, dz], i) => {
      this.offsets[i * 2] = dx;
      this.offsets[i * 2 + 1] = dz;
    });
  }

  /**
   * After the centre or radius changed: unload far chunks and recount. Meshes live one
   * ring beyond the radius (so walking back and forth over a border rebuilds nothing),
   * block data and light two rings: that is what lighting the ring of meshes needs.
   */
  private refresh(): void {
    if (!this.started) return;
    const far: { cx: number; cz: number; meshed: boolean; remove: boolean }[] = [];
    for (const chunk of this.world.allChunks()) {
      const distance = ringDistance(chunk.cx - this.centerCx, chunk.cz - this.centerCz);
      if (distance > this.radius + 2) {
        far.push({ cx: chunk.cx, cz: chunk.cz, meshed: chunk.meshed, remove: true });
      } else if (distance > this.radius + 1 && chunk.meshed) {
        far.push({ cx: chunk.cx, cz: chunk.cz, meshed: true, remove: false });
        chunk.meshed = false;
      }
    }
    for (const { cx, cz, meshed, remove } of far) {
      if (remove) this.world.removeChunk(cx, cz);
      if (meshed) {
        this.meshedTotal--;
        this.urgent.delete(chunkKey(cx, cz));
        this.listener.onUnload(cx, cz);
      }
    }
    let inRange = 0;
    for (const chunk of this.world.allChunks()) {
      if (chunk.meshed && this.inRange(chunk.cx, chunk.cz)) inRange++;
    }
    this.meshedInRange = inRange;
    this.next = 0;
  }

  /**
   * Does one job towards meshing chunk (cx, cz), whose 3 × 3 chunks must be lit: lights
   * one of them, or generates a chunk that lighting needs. Returns false if nothing is
   * missing.
   */
  private prepare(cx: number, cz: number): boolean {
    const world = this.world;
    for (const [dx, dz] of NEIGHBOURHOOD) {
      const lx = cx + dx;
      const lz = cz + dz;
      if (world.getChunk(lx, lz)?.light) continue;
      for (const [ex, ez] of NEIGHBOURHOOD) {
        if (world.hasChunk(lx + ex, lz + ez)) continue;
        world.generate(lx + ex, lz + ez);
        this.jobs.generate++;
        return true;
      }
      world.light(lx, lz);
      this.jobs.light++;
      return true;
    }
    return false;
  }

  private buildMesh(cx: number, cz: number): ChunkMeshData {
    const world = this.world;
    const center = world.getChunk(cx, cz);
    if (!center) throw new Error(`Chunk ${cx},${cz} is not generated`);
    return meshChunk(
      center.blocks,
      (dx, dz) => world.getChunk(cx + dx, cz + dz)?.blocks ?? null,
      (dx, dz) => world.getChunk(cx + dx, cz + dz)?.light ?? null,
    );
  }

  /** Runs one generation, lighting or meshing job. Returns false when nothing is left. */
  private runNextJob(): boolean {
    const count = this.targetCount;
    while (this.next < count) {
      const cx = this.centerCx + this.offsets[this.next * 2];
      const cz = this.centerCz + this.offsets[this.next * 2 + 1];
      if (this.world.getChunk(cx, cz)?.meshed) {
        this.next++;
        continue;
      }
      if (this.prepare(cx, cz)) return true;
      const data = this.buildMesh(cx, cz);
      const chunk = this.world.getChunk(cx, cz);
      // `prepare` generated and lit the chunk itself first.
      if (chunk) chunk.meshed = true;
      this.meshedInRange++;
      this.meshedTotal++;
      this.jobs.mesh++;
      this.next++;
      this.listener.onMesh(cx, cz, data);
      return true;
    }
    return false;
  }
}
