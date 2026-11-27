// The radar in the shell (Phase 8 part B1): scans the world as the pacers allow and draws the
// circle and the Map tab from one scan. The rules: `src/radar/CLAUDE.md`.
import type { BlockChange } from '../actions/apply';
import {
  CHUNK_SIZE,
  RADAR_FAR_RADIUS,
  RADAR_MAP_PER_KIND,
  RADAR_MAP_PLACES,
  RADAR_PLACE_FAR_RADIUS,
  RADAR_RADIUS,
} from './config';
import { circleKinds, circleScan, mapKinds } from '../radar/focus';
import type { RadarKind } from '../radar/kinds';
import { PlaceIndex } from '../radar/places';
import {
  scanRadar,
  worldProbe,
  type RadarBeyond,
  type RadarEntry,
  type RadarScan,
} from '../radar/scan';
import { DrawPacer, ScanPacer, radarDebugText, sameScan } from '../radar/schedule';
import { VeinIndex } from '../radar/veins';
import { RadarCircle, type ScreenSpot } from '../ui/RadarCircle';
import type { World } from '../world/World';

/** What the radar needs to know in one simulation step. */
export interface RadarStep {
  world: World;
  x: number;
  y: number;
  z: number;
  yaw: number;
  step: number;
  /** The circle should show (Adventure, unlocked, the setting, playing; or the bench). */
  circle: boolean;
  /** The circle's task focus, or null (all kinds). */
  focus: RadarKind | null;
}

/** A surface that shows the scan besides the circle (the Map tab). */
export interface RadarSurface {
  /** Draws the whole scan of `kinds` for the view direction `yaw`. */
  draw(
    scan: RadarScan,
    yaw: number,
    feet: { x: number; y: number; z: number },
    kinds: readonly RadarKind[],
  ): void;
}

export interface RadarCircleEntry extends RadarEntry {
  /** Where it was drawn, relative to the circle's centre in CSS pixels (y down). */
  screen: ScreenSpot | null;
}

/** Loaded chunks within this many chunks of the feet make the scan stale when they change. */
const WATCH_CHUNKS = Math.ceil((RADAR_FAR_RADIUS + 2) / CHUNK_SIZE);

export class Radar {
  readonly circle: RadarCircle;
  private index: VeinIndex | null = null;
  private places: PlaceIndex | null = null;
  private readonly scans = new ScanPacer();
  private readonly circleDraws = new DrawPacer();
  private readonly mapDraws = new DrawPacer();
  private scan: RadarScan | null = null;
  private circleEntries: RadarCircleEntry[] = [];
  private circleBeyond: RadarBeyond[] = [];
  private feet = { x: NaN, y: NaN, z: NaN };
  private focusKey: string | null = null;
  private chunkCount = -1;
  private chunkSignature = -1;
  private world: World | null = null;
  private map: RadarSurface | null = null;
  scanMs = 0;
  drawMs = 0;

  constructor(hud: HTMLElement) {
    this.circle = new RadarCircle(hud);
  }

  /** A new world (or a guest's world): start from nothing. */
  reset(): void {
    this.scans.reset();
    this.circleDraws.reset();
    this.mapDraws.reset();
    this.scan = null;
    this.circleEntries = [];
    this.circleBeyond = [];
    this.feet = { x: NaN, y: NaN, z: NaN };
    this.chunkCount = -1;
    this.world = null;
    this.circle.setShown(false);
  }

  /** The Map tab opens (a surface) or closes (null). */
  setMap(map: RadarSurface | null): void {
    this.map = map;
    this.mapDraws.invalidate();
    if (map) this.scans.invalidate();
  }

  /** Blocks changed: a scan is due if one lies within the far radius of the feet. */
  noteBlocks(changes: readonly BlockChange[]): void {
    const reach = RADAR_FAR_RADIUS + 2;
    for (const { x, z } of changes) {
      if (Math.abs(x - this.feet.x) <= reach && Math.abs(z - this.feet.z) <= reach) {
        this.scans.invalidate();
        return;
      }
    }
  }

  /** Something the scan depends on outside the world changed (the unlock, the setting). */
  invalidate(): void {
    this.scans.invalidate();
    this.circleDraws.invalidate();
  }

  step(s: RadarStep): void {
    if (this.circle.shown !== s.circle) {
      this.circle.setShown(s.circle);
      if (s.circle) this.circleDraws.invalidate();
    }
    if (!s.circle && !this.map) return;
    this.watch(s);
    if (this.scans.due(s.step)) this.runScan(s);
    const scan = this.scan;
    if (!scan) return;
    if (s.circle && this.circleDraws.due(s.step, s.yaw)) {
      const start = performance.now();
      this.drawCircle(scan, s);
      this.drawMs = performance.now() - start;
      this.circleDraws.done(s.step, s.yaw);
    }
    if (this.map && this.mapDraws.due(s.step, s.yaw)) {
      this.map.draw(scan, s.yaw, this.feet, this.kinds());
      this.mapDraws.done(s.step, s.yaw);
    }
  }

  /** Marks the scan stale when the feet cell, the focus or the loaded chunks around changed. */
  private watch(s: RadarStep): void {
    const fx = Math.floor(s.x);
    const fy = Math.floor(s.y);
    const fz = Math.floor(s.z);
    if (fx !== this.feet.x || fy !== this.feet.y || fz !== this.feet.z) {
      this.feet = { x: fx, y: fy, z: fz };
      this.scans.invalidate();
    }
    const focus = s.focus?.key ?? null;
    if (focus !== this.focusKey) {
      this.focusKey = focus;
      this.scans.invalidate();
      this.circleDraws.invalidate();
    }
    if (s.world !== this.world) {
      this.world = s.world;
      if (
        !this.index ||
        this.index.seed !== s.world.seed ||
        JSON.stringify(this.index.gen) !== JSON.stringify(s.world.gen)
      ) {
        this.index = new VeinIndex(s.world.seed, s.world.gen);
        this.places = new PlaceIndex(s.world.seed, s.world.gen);
      }
      this.chunkCount = -1;
      this.scans.invalidate();
    }
    // Chunks load and drop in frames: only a change of the count is looked at closer.
    if (s.world.chunkCount !== this.chunkCount) {
      this.chunkCount = s.world.chunkCount;
      const signature = this.signatureAround(s.world, fx, fz);
      if (signature !== this.chunkSignature) {
        this.chunkSignature = signature;
        this.scans.invalidate();
      }
    }
  }

  private signatureAround(world: World, x: number, z: number): number {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    let signature = 0;
    for (let dz = -WATCH_CHUNKS; dz <= WATCH_CHUNKS; dz++) {
      for (let dx = -WATCH_CHUNKS; dx <= WATCH_CHUNKS; dx++) {
        if (world.hasChunk(cx + dx, cz + dz))
          signature = (signature * 31 + (dx + 64) * 131 + dz + 64) | 0;
      }
    }
    return signature;
  }

  private runScan(s: RadarStep): void {
    const index = this.index;
    if (!index) return;
    const start = performance.now();
    const scan = scanRadar({
      index,
      x: this.feet.x,
      y: this.feet.y,
      z: this.feet.z,
      probe: worldProbe(s.world),
      kinds: this.kinds(),
      perKind: RADAR_MAP_PER_KIND,
      radius: RADAR_RADIUS,
      farRadius: RADAR_FAR_RADIUS,
      places: this.places,
      placesPerKind: RADAR_MAP_PLACES,
      placeFarRadius: RADAR_PLACE_FAR_RADIUS,
    });
    this.scanMs = performance.now() - start;
    this.scans.done(s.step);
    if (sameScan(scan, this.scan)) return;
    this.scan = scan;
    this.circleDraws.invalidate();
    this.mapDraws.invalidate();
  }

  private drawCircle(scan: RadarScan, s: RadarStep): void {
    const kinds = circleKinds(s.focus, this.hasPlaces);
    const shown = circleScan(scan, kinds);
    const spots = this.circle.draw(shown, s.yaw, kinds);
    this.circleEntries = shown.entries.map((e, i) => ({ ...e, screen: spots[i] }));
    this.circleBeyond = shown.beyond;
  }

  /** The world's generator has places (version 3). */
  get hasPlaces(): boolean {
    return this.places?.hasPlaces ?? false;
  }

  /** The kinds of the scan, the Map tab and the F3 row. */
  kinds(): readonly RadarKind[] {
    return mapKinds(this.hasPlaces);
  }

  /** The last full scan (the Map tab's), or null. */
  get lastScan(): RadarScan | null {
    return this.scan;
  }

  get scanCount(): number {
    return this.scans.count;
  }

  get drawCount(): number {
    return this.circleDraws.count;
  }

  get mapDrawCount(): number {
    return this.mapDraws.count;
  }

  /** The circle's last drawing: its entries (with screen spots) and rim arrows. */
  circleState(): { entries: RadarCircleEntry[]; beyond: RadarBeyond[] } {
    return { entries: this.circleEntries, beyond: this.circleBeyond };
  }

  /** The F3 row. */
  debugText(): string {
    const circle = { entries: this.circleEntries, beyond: this.circleBeyond };
    return radarDebugText(
      circle,
      this.kinds().map((k) => k.key),
      this.scanMs,
      this.drawMs,
    );
  }
}
