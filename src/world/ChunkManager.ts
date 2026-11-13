// Chunk manager: decides which chunks to generate, mesh and unload around a centre,
// spending a limited time budget per frame. Pure: the renderer listens via callbacks.
import { type ChunkMeshData, meshChunk } from './meshing/mesher';
import type { World } from './World';

export interface ChunkListener {
  /** A (new or updated) mesh for a chunk is ready. */
  onMesh(cx: number, cz: number, data: ChunkMeshData): void;
  /** The chunk's mesh is no longer valid and its GPU resources must be released. */
  onUnload(cx: number, cz: number): void;
}

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

  constructor(
    private readonly world: World,
    private readonly listener: ChunkListener,
    radius: number,
  ) {
    this.radius = radius;
    this.buildOffsets();
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

  get loadRadius(): number {
    return this.radius;
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
   * Runs generation and meshing jobs, nearest chunk first, until the budget is used up.
   * At least one job runs per call so progress is guaranteed. Returns the job count.
   */
  update(now: () => number, budgetMs: number): number {
    if (!this.started) return 0;
    const start = now();
    let jobs = 0;
    while (this.runNextJob()) {
      jobs++;
      if (now() - start >= budgetMs) break;
    }
    return jobs;
  }

  /**
   * Rebuilds the mesh of a chunk right now (after an edit). If the chunk cannot be meshed
   * correctly because a neighbour is missing, its mesh is dropped and queued again.
   */
  remesh(cx: number, cz: number): void {
    const chunk = this.world.getChunk(cx, cz);
    if (!chunk || !chunk.meshed) return;
    if (this.missingNeighbour(cx, cz) === null) {
      this.listener.onMesh(cx, cz, this.buildMesh(cx, cz));
      return;
    }
    chunk.meshed = false;
    this.meshedTotal--;
    if (this.inRange(cx, cz)) this.meshedInRange--;
    this.next = 0;
    this.listener.onUnload(cx, cz);
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

  /** After the centre or radius changed: unload far chunks and recount. */
  private refresh(): void {
    if (!this.started) return;
    const keep = this.radius + 1;
    const far: { cx: number; cz: number; meshed: boolean }[] = [];
    for (const chunk of this.world.allChunks()) {
      if (ringDistance(chunk.cx - this.centerCx, chunk.cz - this.centerCz) > keep) {
        far.push({ cx: chunk.cx, cz: chunk.cz, meshed: chunk.meshed });
      }
    }
    for (const { cx, cz, meshed } of far) {
      this.world.removeChunk(cx, cz);
      if (meshed) {
        this.meshedTotal--;
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

  /** The first chunk of the 3×3 block around (cx, cz) that is not generated, or null. */
  private missingNeighbour(cx: number, cz: number): { cx: number; cz: number } | null {
    // The chunk itself first, then direct neighbours, then diagonals (AO reads them).
    if (!this.world.hasChunk(cx, cz)) return { cx, cz };
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!this.world.hasChunk(cx + dx, cz + dz)) return { cx: cx + dx, cz: cz + dz };
      }
    }
    return null;
  }

  private buildMesh(cx: number, cz: number): ChunkMeshData {
    const world = this.world;
    const center = world.getChunk(cx, cz);
    if (!center) throw new Error(`Chunk ${cx},${cz} is not generated`);
    return meshChunk(center.blocks, (dx, dz) => world.getChunk(cx + dx, cz + dz)?.blocks ?? null);
  }

  /** Runs one generation or meshing job. Returns false when nothing is left to do. */
  private runNextJob(): boolean {
    const count = this.targetCount;
    while (this.next < count) {
      const cx = this.centerCx + this.offsets[this.next * 2];
      const cz = this.centerCz + this.offsets[this.next * 2 + 1];
      const chunk = this.world.getChunk(cx, cz);
      if (chunk?.meshed) {
        this.next++;
        continue;
      }
      const missing = this.missingNeighbour(cx, cz);
      if (missing) {
        this.world.generate(missing.cx, missing.cz);
        return true;
      }
      const data = this.buildMesh(cx, cz);
      // `chunk` is defined here: missingNeighbour checks the centre chunk first.
      if (chunk) chunk.meshed = true;
      this.meshedInRange++;
      this.meshedTotal++;
      this.next++;
      this.listener.onMesh(cx, cz, data);
      return true;
    }
    return false;
  }
}
