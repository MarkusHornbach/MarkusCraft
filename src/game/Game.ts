// Game: wires world, player, renderer and UI together and runs the fixed-step loop.
import { Input, type PressAction } from '../input/Input';
import { breakResult, canPlace } from '../player/interaction';
import { type MoveInput, respawnIfFallen, stepPlayer } from '../player/physics';
import { applyLook, createPlayer, eyeY, type PlayerState, viewDirection } from '../player/player';
import { Renderer } from '../render/Renderer';
import { Hud } from '../ui/Hud';
import { Block, HOTBAR_BLOCKS } from '../world/blocks';
import { ChunkManager } from '../world/ChunkManager';
import { toChunkCoord } from '../world/chunk';
import { advanceTime, wrapTime } from '../world/dayNight';
import { findSpawn, type SpawnPoint } from '../world/generation/spawn';
import { getTerrain } from '../world/generation/terrain';
import { type RayHit, raycast } from '../world/raycast';
import { World, chunksAffectedByEdit } from '../world/World';
import {
  ACTION_REPEAT_MS,
  CHUNK_BUDGET_MS,
  FOV_DEFAULT,
  HOTBAR_SLOTS,
  LOOK_RADIANS_PER_PIXEL,
  MAX_STEPS_PER_FRAME,
  PLAYER_EYE_HEIGHT,
  REACH,
  RENDER_DISTANCE_DEFAULT,
  SIM_DT,
  TEST_RENDER_DISTANCE,
  TEST_VIEW_HEIGHT,
  TEST_VIEW_WIDTH,
  WATER_SURFACE_DROP,
} from './config';
import { type GameState, type PlayerPatch, type TestApi, installTestApi } from './testApi';
import type { GameParams } from './urlParams';

export class Game {
  readonly params: GameParams;
  private readonly world: World;
  private readonly renderer: Renderer;
  private readonly chunkManager: ChunkManager;
  private readonly player: PlayerState;
  private readonly spawn: SpawnPoint;
  private readonly input: Input;
  private readonly hud: Hud;
  private readonly root: HTMLElement;
  private selectedSlot = 1;
  private target: RayHit | null = null;
  /** Seconds a mouse button has been held since the last break/place action. */
  private repeatTimer = 0;
  /** Player position before the latest simulation step, for render interpolation. */
  private readonly previous = { x: 0, y: 0, z: 0 };
  private time: number;
  private paused = false;
  private lastFrameMs = 0;
  private accumulator = 0;
  private framesSinceIdle = 0;
  private idleWaiters: (() => void)[] = [];
  private mouseSensitivity = 1;

  constructor(container: HTMLElement, params: GameParams) {
    this.params = params;
    this.time = params.time;
    this.world = new World(params.seed);

    this.root = document.createElement('div');
    this.root.className = 'game-root';
    container.appendChild(this.root);
    const canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    this.root.appendChild(canvas);
    this.renderer = new Renderer(canvas, {
      preserveDrawingBuffer: params.test,
      pixelRatio: params.test ? 1 : null,
    });
    this.renderer.setFov(FOV_DEFAULT);
    const radius = params.test ? TEST_RENDER_DISTANCE : RENDER_DISTANCE_DEFAULT;
    this.renderer.setRenderDistance(radius);

    this.chunkManager = new ChunkManager(
      this.world,
      {
        onMesh: (cx, cz, data) => this.renderer.setChunkMesh(cx, cz, data),
        onUnload: (cx, cz) => this.renderer.removeChunkMesh(cx, cz),
      },
      radius,
    );

    this.spawn = findSpawn(getTerrain(params.seed));
    this.player = createPlayer(this.spawn.x + 0.5, this.spawn.y, this.spawn.z + 0.5);
    this.rememberPosition();

    this.input = new Input({
      element: canvas,
      isActive: () => !this.paused,
      onPress: (action) => this.handlePress(action),
    });

    this.hud = new Hud(this.root, this.renderer.atlas.tiles);
    this.hud.setSelected(this.selectedSlot, false);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    installTestApi(this.createTestApi());
  }

  start(): void {
    this.lastFrameMs = performance.now();
    requestAnimationFrame((ms) => this.frame(ms));
  }

  private resize(): void {
    if (this.params.test) {
      // Fixed logical resolution so screenshots do not depend on the window.
      this.root.style.width = `${TEST_VIEW_WIDTH}px`;
      this.root.style.height = `${TEST_VIEW_HEIGHT}px`;
      this.renderer.setSize(TEST_VIEW_WIDTH, TEST_VIEW_HEIGHT);
    } else {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  private frame(ms: number): void {
    requestAnimationFrame((next) => this.frame(next));
    const elapsed = Math.min((ms - this.lastFrameMs) / 1000, 0.25);
    this.lastFrameMs = ms;

    // In test mode the simulation only advances through `__mc.step()`.
    if (!this.params.test && !this.paused) {
      this.accumulator += elapsed;
      let steps = 0;
      while (this.accumulator >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
        this.simulate();
        this.accumulator -= SIM_DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    }

    if (!this.paused) {
      const look = this.input.consumeLook();
      this.applyLookPixels(look.dx, look.dy);
    }

    this.updateChunks();
    this.draw(this.params.test ? 1 : this.accumulator / SIM_DT);

    if (this.chunkManager.pending === 0) {
      this.framesSinceIdle++;
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      for (const resolve of waiters) resolve();
    } else {
      this.framesSinceIdle = 0;
    }
  }

  /** One fixed simulation step. */
  private simulate(): void {
    this.rememberPosition();
    stepPlayer(this.player, this.readMoveInput(), this.world, SIM_DT);
    if (respawnIfFallen(this.player, this.spawnPosition())) this.rememberPosition();
    this.repeatHeldAction();
    this.time = advanceTime(this.time, SIM_DT, this.params.freeze);
  }

  /** Holding a mouse button repeats its action at a fixed interval. */
  private repeatHeldAction(): void {
    const breaking = this.input.isHeld('break');
    const placing = this.input.isHeld('place');
    if (!breaking && !placing) {
      this.repeatTimer = 0;
      return;
    }
    this.repeatTimer += SIM_DT;
    // The small tolerance keeps 15 steps of 1/60 s from falling just short of 250 ms.
    if (this.repeatTimer < ACTION_REPEAT_MS / 1000 - 1e-9) return;
    this.repeatTimer = 0;
    if (breaking) this.breakTarget();
    else this.placeAtTarget();
  }

  /** Finds the block the player is looking at, within reach. */
  private updateTarget(): void {
    const p = this.player;
    const [dx, dy, dz] = viewDirection(p.yaw, p.pitch);
    this.target = raycast(
      (x, y, z) => this.world.getBlock(x, y, z),
      p.x,
      eyeY(p),
      p.z,
      dx,
      dy,
      dz,
      REACH,
    );
  }

  private breakTarget(): void {
    this.updateTarget();
    const t = this.target;
    if (!t) return;
    const replacement = breakResult(this.world, t.x, t.y, t.z);
    if (replacement === null) return;
    this.setBlock(t.x, t.y, t.z, replacement);
    this.updateTarget();
  }

  private placeAtTarget(): void {
    this.updateTarget();
    const t = this.target;
    if (!t) return;
    const x = t.x + t.face[0];
    const y = t.y + t.face[1];
    const z = t.z + t.face[2];
    if (!canPlace(this.world, this.player, x, y, z)) return;
    this.setBlock(x, y, z, HOTBAR_BLOCKS[this.selectedSlot - 1]);
    this.updateTarget();
  }

  private selectSlot(slot: number): void {
    // Wrap around in both directions (mouse wheel).
    this.selectedSlot = ((((slot - 1) % HOTBAR_SLOTS) + HOTBAR_SLOTS) % HOTBAR_SLOTS) + 1;
    this.hud.setSelected(this.selectedSlot, true);
  }

  private rememberPosition(): void {
    this.previous.x = this.player.x;
    this.previous.y = this.player.y;
    this.previous.z = this.player.z;
  }

  private spawnPosition(): { x: number; y: number; z: number } {
    return { x: this.spawn.x + 0.5, y: this.spawn.y, z: this.spawn.z + 0.5 };
  }

  private readMoveInput(): MoveInput {
    const input = this.input;
    return {
      forward: (input.isHeld('forward') ? 1 : 0) - (input.isHeld('back') ? 1 : 0),
      strafe: (input.isHeld('right') ? 1 : 0) - (input.isHeld('left') ? 1 : 0),
      jump: input.isHeld('jump'),
      sprint: input.isHeld('sprint'),
      descend: input.isHeld('descend'),
    };
  }

  private handlePress(action: PressAction): void {
    switch (action.type) {
      case 'toggleFly':
        this.player.mode = this.player.mode === 'fly' ? 'walk' : 'fly';
        this.player.vy = 0;
        break;
      case 'break':
        this.repeatTimer = 0;
        this.breakTarget();
        break;
      case 'place':
        this.repeatTimer = 0;
        this.placeAtTarget();
        break;
      case 'selectSlot':
        this.selectSlot(action.slot);
        break;
      case 'cycleSlot':
        this.selectSlot(this.selectedSlot + action.direction);
        break;
      case 'toggleDebug':
        break;
    }
  }

  /** Mouse movement in pixels → rotation. Moving right turns right, moving up looks up. */
  private applyLookPixels(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    const scale = LOOK_RADIANS_PER_PIXEL * this.mouseSensitivity;
    applyLook(this.player, -dx * scale, -dy * scale);
  }

  private updateChunks(): void {
    this.chunkManager.setCenter(toChunkCoord(this.player.x), toChunkCoord(this.player.z));
    this.chunkManager.update(() => performance.now(), CHUNK_BUDGET_MS);
  }

  /** Renders one frame; `alpha` blends from the previous to the current simulation state. */
  private draw(alpha: number): void {
    const p = this.player;
    const prev = this.previous;
    this.updateTarget();
    this.renderer.setHighlight(this.target);
    const x = prev.x + (p.x - prev.x) * alpha;
    const y = prev.y + (p.y - prev.y) * alpha;
    const z = prev.z + (p.z - prev.z) * alpha;
    this.renderer.setCamera({ x, y, z, yaw: p.yaw, pitch: p.pitch });
    const underwater = this.isUnderWater(x, y + PLAYER_EYE_HEIGHT, z);
    this.hud.setUnderwater(underwater);
    this.renderer.setEnvironment(this.time, underwater);
    this.renderer.render();
  }

  /** Whether a point (the camera) is inside water, below the lowered water surface. */
  private isUnderWater(x: number, y: number, z: number): boolean {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (this.world.getBlock(bx, by, bz) !== Block.WATER) return false;
    return y - by < 1 - WATER_SURFACE_DROP || this.world.getBlock(bx, by + 1, bz) === Block.WATER;
  }

  private setBlock(x: number, y: number, z: number, id: number): void {
    if (!this.world.setBlock(x, y, z, id)) return;
    // Edits remesh immediately, outside the per-frame budget.
    for (const { cx, cz } of chunksAffectedByEdit(x, z)) this.chunkManager.remesh(cx, cz);
  }

  private getState(): GameState {
    const p = this.player;
    const stats = this.renderer.getStats();
    return {
      seed: this.params.seed,
      time: this.time,
      paused: this.paused,
      player: {
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
        pitch: p.pitch,
        mode: p.mode,
        onGround: p.onGround,
        inWater: p.inWater,
      },
      chunks: {
        loaded: this.chunkManager.loaded,
        pending: this.chunkManager.pending,
        meshed: this.chunkManager.meshed,
        generated: this.world.chunkCount,
      },
      render: {
        drawCalls: stats.drawCalls,
        triangles: stats.triangles,
        geometries: stats.geometries,
        fov: this.renderer.fov,
      },
      selectedSlot: this.selectedSlot,
      target: this.target
        ? {
            x: this.target.x,
            y: this.target.y,
            z: this.target.z,
            id: this.target.id,
            face: this.target.face,
          }
        : null,
    };
  }

  private setPlayer(patch: PlayerPatch): void {
    const p = this.player;
    if (patch.x !== undefined) p.x = patch.x;
    if (patch.y !== undefined) p.y = patch.y;
    if (patch.z !== undefined) p.z = patch.z;
    if (patch.mode !== undefined) p.mode = patch.mode;
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    // Route angles through applyLook so they are wrapped and clamped like mouse input.
    const yaw = patch.yaw ?? p.yaw;
    const pitch = patch.pitch ?? p.pitch;
    p.yaw = 0;
    p.pitch = 0;
    applyLook(p, yaw, pitch);
    this.rememberPosition();
    // A teleport changes which chunks are needed: not idle until the next frame says so.
    this.updateChunkCenter();
  }

  private updateChunkCenter(): void {
    this.chunkManager.setCenter(toChunkCoord(this.player.x), toChunkCoord(this.player.z));
    if (this.chunkManager.pending > 0) this.framesSinceIdle = 0;
  }

  private createTestApi(): TestApi {
    return {
      isReady: () => this.chunkManager.pending === 0 && this.framesSinceIdle > 0,
      whenIdle: () =>
        new Promise<void>((resolve) => {
          this.idleWaiters.push(resolve);
        }),
      getState: () => {
        this.updateTarget();
        return this.getState();
      },
      setPlayer: (patch) => this.setPlayer(patch),
      look: (dx, dy) => this.applyLookPixels(dx, dy),
      getBlock: (x, y, z) => this.world.getBlock(x, y, z),
      setBlock: (x, y, z, id) => this.setBlock(x, y, z, id),
      surfaceY: (x, z) => this.world.surfaceY(x, z),
      setTime: (t) => {
        this.time = wrapTime(t);
      },
      step: (n) => {
        for (let i = 0; i < n; i++) this.simulate();
        this.updateChunkCenter();
        this.draw(1);
      },
    };
  }
}
