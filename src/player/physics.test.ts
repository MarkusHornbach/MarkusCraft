import { describe, expect, it } from 'vitest';
import { MAX_FALL_SPEED, SIM_DT, SPRINT_SPEED, VOID_Y, WALK_SPEED } from '../game/config';
import {
  type MoveInput,
  NO_INPUT,
  type PhysicsWorld,
  playerIntersectsBlock,
  respawnIfFallen,
  stepPlayer,
} from './physics';
import { type PlayerState, applyLook, createPlayer, eyeY, viewDirection } from './player';

/** A tiny world: flat solid ground below `groundY`, plus individual solid and water cells. */
class TestWorld implements PhysicsWorld {
  private readonly solid = new Set<string>();
  private readonly water = new Set<string>();
  constructor(private readonly groundTop = 0) {}

  addSolid(x: number, y: number, z: number): this {
    this.solid.add(`${x},${y},${z}`);
    return this;
  }
  fillSolid(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): this {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.addSolid(x, y, z);
    return this;
  }
  fillWater(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): this {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) this.water.add(`${x},${y},${z}`);
    return this;
  }
  isSolidAt(x: number, y: number, z: number): boolean {
    // Blocks with y < groundTop are solid: the ground surface is at y = groundTop.
    return y < this.groundTop || this.solid.has(`${x},${y},${z}`);
  }
  isWaterAt(x: number, y: number, z: number): boolean {
    return this.water.has(`${x},${y},${z}`) && !this.isSolidAt(x, y, z);
  }
}

const FORWARD: MoveInput = { ...NO_INPUT, forward: 1 };

function run(p: PlayerState, world: PhysicsWorld, steps: number, input: MoveInput = NO_INPUT) {
  for (let i = 0; i < steps; i++) stepPlayer(p, input, world, SIM_DT);
}

/** A player standing still on the flat ground at (x, z). */
function standing(world: PhysicsWorld, x = 0.5, z = 0.5, y = 0): PlayerState {
  const p = createPlayer(x, y, z);
  run(p, world, 5);
  expect(p.onGround).toBe(true);
  return p;
}

describe('falling and landing (AC8.1, AC8.5)', () => {
  it('lands exactly on the surface and does not sink', () => {
    const world = new TestWorld(10);
    const p = createPlayer(0.5, 15, 0.5);
    run(p, world, 120);
    expect(Math.abs(p.y - 10)).toBeLessThan(0.001);
    expect(p.onGround).toBe(true);
    expect(p.vy).toBe(0);
    run(p, world, 600);
    expect(Math.abs(p.y - 10)).toBeLessThan(0.001);
    expect(p.onGround).toBe(true);
  });

  it('clamps the fall speed and never tunnels through a 1-block floor', () => {
    // A single layer of blocks at y = 0 over a void.
    const world = new TestWorld(-1000).fillSolid(-2, 2, 0, 0, -2, 2);
    for (const offset of [0, 0.13, 0.37, 0.5, 0.71, 0.99]) {
      const p = createPlayer(0.5, 400 + offset, 0.5);
      let maxSpeed = 0;
      for (let i = 0; i < 1200 && !p.onGround; i++) {
        stepPlayer(p, NO_INPUT, world, SIM_DT);
        maxSpeed = Math.max(maxSpeed, -p.vy);
      }
      expect(maxSpeed).toBeCloseTo(MAX_FALL_SPEED, 5);
      expect(p.onGround).toBe(true);
      expect(p.y).toBe(1);
    }
  });

  it('respawns a player who fell out of the world', () => {
    const p = createPlayer(5, VOID_Y - 1, 5);
    p.vy = -30;
    expect(respawnIfFallen(p, { x: 0.5, y: 60, z: 0.5 })).toBe(true);
    expect([p.x, p.y, p.z, p.vy]).toEqual([0.5, 60, 0.5, 0]);
    expect(respawnIfFallen(p, { x: 9, y: 9, z: 9 })).toBe(false);
  });
});

describe('walking (AC8.2, AC8.4, AC8.8)', () => {
  it('reaches walking and sprinting speed', () => {
    const world = new TestWorld(0);
    for (const [input, speed] of [
      [FORWARD, WALK_SPEED],
      [{ ...FORWARD, sprint: true }, SPRINT_SPEED],
    ] as const) {
      const p = standing(world);
      run(p, world, 60, input);
      const z0 = p.z;
      run(p, world, 60, input);
      // Facing -Z at yaw 0.
      const measured = (z0 - p.z) / (60 * SIM_DT);
      expect(Math.abs(measured - speed)).toBeLessThan(0.2);
      expect(p.x).toBeCloseTo(0.5, 6);
    }
  });

  it('is not faster diagonally, and stops quickly without input', () => {
    const world = new TestWorld(0);
    const p = standing(world);
    run(p, world, 60, { ...FORWARD, strafe: 1 });
    expect(Math.hypot(p.vx, p.vz)).toBeCloseTo(WALK_SPEED, 5);
    expect(p.vx).toBeGreaterThan(0);
    run(p, world, 10);
    expect(Math.hypot(p.vx, p.vz)).toBe(0);
  });

  it('moves along the facing direction', () => {
    const world = new TestWorld(0);
    const p = standing(world);
    applyLook(p, -Math.PI / 2, 0); // turn right: now facing +X (east)
    run(p, world, 60, FORWARD);
    expect(p.x).toBeGreaterThan(3);
    expect(p.z).toBeCloseTo(0.5, 6);
    const [dx, dy, dz] = viewDirection(p.yaw, p.pitch);
    expect(dx).toBeCloseTo(1, 6);
    expect(dy).toBeCloseTo(0, 6);
    expect(dz).toBeCloseTo(0, 6);
    expect(eyeY(p)).toBeCloseTo(1.62, 6);
  });

  it('never penetrates a wall', () => {
    // Wall occupying z = -3 (blocks from z -3 to -2), player walks towards -Z.
    const world = new TestWorld(0).fillSolid(-5, 5, 0, 3, -3, -3);
    const p = standing(world);
    for (let i = 0; i < 120; i++) {
      stepPlayer(p, { ...FORWARD, sprint: true }, world, SIM_DT);
      expect(p.z - 0.3).toBeGreaterThanOrEqual(-2 - 1e-9);
    }
    expect(p.z).toBeCloseTo(-1.7, 6);
    expect(p.againstWall).toBe(true);
  });

  it('slides along a wall when moving diagonally into it', () => {
    const world = new TestWorld(0).fillSolid(-50, 50, 0, 3, -3, -3);
    const p = standing(world);
    run(p, world, 60, { ...FORWARD, strafe: 1 });
    const x0 = p.x;
    run(p, world, 60, { ...FORWARD, strafe: 1 });
    expect(p.z).toBeCloseTo(-1.7, 6);
    expect((p.x - x0) / (60 * SIM_DT)).toBeGreaterThan(0.5 * WALK_SPEED);
  });

  it('walks through a 2-high, 1-wide tunnel but not into a 1-high gap', () => {
    // A thick wall at z = -6..-3 with a tunnel at x = 0.
    const tunnel = new TestWorld(0).fillSolid(-3, 3, 0, 4, -6, -3);
    const open = (world: TestWorld, height: number): TestWorld => {
      const cells = world as unknown as { solid: Set<string> };
      for (let z = -6; z <= -3; z++)
        for (let y = 0; y < height; y++) cells.solid.delete(`0,${y},${z}`);
      return world;
    };
    const p = standing(open(tunnel, 2));
    run(p, tunnel, 240, FORWARD);
    expect(p.z).toBeLessThan(-7);
    expect(p.x).toBeCloseTo(0.5, 6);

    const gap = open(new TestWorld(0).fillSolid(-3, 3, 0, 4, -6, -3), 1);
    const q = standing(gap);
    run(q, gap, 240, FORWARD);
    expect(q.z).toBeCloseTo(-1.7, 6);
  });
});

describe('analog movement (Phase 2 AC1.1)', () => {
  it('scales the walking speed with the stick deflection', () => {
    const world = new TestWorld(0);
    for (const [deflection, expected] of [
      [0.5, 0.5 * WALK_SPEED],
      [0.25, 0.25 * WALK_SPEED],
      [1, WALK_SPEED],
    ]) {
      const p = standing(world);
      run(p, world, 60, { ...NO_INPUT, forward: deflection });
      const speed = Math.hypot(p.vx, p.vz);
      // Half deflection gives 50 % ± 10 % of the walking speed.
      expect(speed).toBeGreaterThan(expected - 0.1 * WALK_SPEED);
      expect(speed).toBeLessThan(expected + 0.1 * WALK_SPEED);
      expect(speed).toBeCloseTo(expected, 6);
    }
  });

  it('moves along the analog direction and never faster than full deflection', () => {
    const world = new TestWorld(0);
    const p = standing(world);
    run(p, world, 60, { ...NO_INPUT, forward: 0.3, strafe: 0.4 });
    // Yaw 0 looks towards -Z; strafing right is +X.
    expect(p.vx).toBeCloseTo(0.4 * WALK_SPEED, 6);
    expect(p.vz).toBeCloseTo(-0.3 * WALK_SPEED, 6);
    const q = standing(world);
    run(q, world, 60, { ...NO_INPUT, forward: 1, strafe: 1 });
    expect(Math.hypot(q.vx, q.vz)).toBeCloseTo(WALK_SPEED, 6);
  });
});

describe('jumping (AC8.3)', () => {
  it('peaks between 1.1 and 1.4 blocks', () => {
    const world = new TestWorld(0);
    const p = standing(world);
    let peak = 0;
    stepPlayer(p, { ...NO_INPUT, jump: true }, world, SIM_DT);
    for (let i = 0; i < 120; i++) {
      stepPlayer(p, NO_INPUT, world, SIM_DT);
      peak = Math.max(peak, p.y);
    }
    expect(peak).toBeGreaterThan(1.1);
    expect(peak).toBeLessThan(1.4);
    expect(p.y).toBe(0);
    expect(p.onGround).toBe(true);
  });

  it('cannot jump in mid-air', () => {
    const world = new TestWorld(0);
    const p = createPlayer(0.5, 5, 0.5);
    stepPlayer(p, { ...NO_INPUT, jump: true }, world, SIM_DT);
    expect(p.vy).toBeLessThan(0);
  });

  it('gets onto a 1-block step but not onto a 2-block step', () => {
    const jumpForward: MoveInput = { ...FORWARD, jump: true };
    const oneStep = new TestWorld(0).fillSolid(-3, 3, 0, 0, -8, -3);
    const p = standing(oneStep);
    run(p, oneStep, 60, jumpForward);
    run(p, oneStep, 60);
    expect(p.y).toBe(1);
    expect(p.z).toBeLessThan(-2);

    const twoSteps = new TestWorld(0).fillSolid(-3, 3, 0, 1, -8, -3);
    const q = standing(twoSteps);
    run(q, twoSteps, 180, jumpForward);
    run(q, twoSteps, 60);
    expect(q.y).toBe(0);
    expect(q.z).toBeCloseTo(-1.7, 6);
  });

  it('bumps its head on a ceiling', () => {
    const world = new TestWorld(0).fillSolid(-1, 1, 2, 2, -1, 1);
    const p = standing(world);
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      stepPlayer(p, { ...NO_INPUT, jump: i === 0 }, world, SIM_DT);
      peak = Math.max(peak, p.y);
    }
    // Head room is 2 blocks, the player is 1.8 tall.
    expect(peak).toBeCloseTo(0.2, 6);
  });
});

describe('flying (AC8.6)', () => {
  it('hovers without input and still collides', () => {
    const world = new TestWorld(0).fillSolid(-5, 5, 0, 30, -3, -3);
    const p = createPlayer(0.5, 20, 0.5);
    p.mode = 'fly';
    run(p, world, 300);
    expect(p.y).toBe(20);
    run(p, world, 120, { ...FORWARD, sprint: true });
    expect(p.z).toBeCloseTo(-1.7, 6);
    // Flying down ends on the ground, flying up rises.
    run(p, world, 600, { ...NO_INPUT, descend: true });
    expect(p.y).toBe(0);
    expect(p.onGround).toBe(true);
    run(p, world, 60, { ...NO_INPUT, jump: true });
    expect(p.y).toBeGreaterThan(5);
  });

  it('flies at 10 blocks/s, 20 when sprinting', () => {
    const world = new TestWorld(0);
    for (const [sprint, speed] of [
      [false, 10],
      [true, 20],
    ] as const) {
      const p = createPlayer(0.5, 20, 0.5);
      p.mode = 'fly';
      run(p, world, 60, { ...FORWARD, sprint });
      const z0 = p.z;
      run(p, world, 60, { ...FORWARD, sprint });
      expect((z0 - p.z) / (60 * SIM_DT)).toBeCloseTo(speed, 3);
    }
  });
});

describe('swimming (AC8.7)', () => {
  /** A 12-deep pool: water in blocks y = 0..11 (surface at y = 12), floor below. */
  function pool(): TestWorld {
    return new TestWorld(0).fillWater(-8, 8, 0, 11, -8, 8);
  }

  it('sinks slowly without input', () => {
    const world = pool();
    const p = createPlayer(0.5, 8, 0.5);
    for (let i = 0; i < 120; i++) {
      stepPlayer(p, NO_INPUT, world, SIM_DT);
      expect(p.inWater || p.onGround).toBe(true);
      expect(-p.vy).toBeLessThan(3);
    }
    expect(p.y).toBeLessThan(8);
    expect(p.y).toBeGreaterThan(8 - 3 * 2);
  });

  it('slows down a fast fall into water', () => {
    const world = pool();
    const p = createPlayer(0.5, 30, 0.5);
    run(p, world, 75);
    expect(p.inWater).toBe(true);
    run(p, world, 60);
    expect(-p.vy).toBeLessThan(3);
  });

  it('rises to the surface when holding jump and stays there', () => {
    const world = pool();
    const p = createPlayer(0.5, 2, 0.5);
    run(p, world, 400, { ...NO_INPUT, jump: true });
    for (let i = 0; i < 300; i++) {
      stepPlayer(p, { ...NO_INPUT, jump: true }, world, SIM_DT);
      // Bobbing at the surface: the body centre stays near the water line at y = 12.
      expect(p.y + 0.9).toBeGreaterThan(11.6);
      expect(p.y + 0.9).toBeLessThan(12.6);
    }
  });

  it('swims at the swim speed', () => {
    const world = pool();
    const p = createPlayer(0.5, 6, 0.5);
    run(p, world, 30, FORWARD);
    const z0 = p.z;
    run(p, world, 30, FORWARD);
    expect((z0 - p.z) / (30 * SIM_DT)).toBeCloseTo(2.2, 3);
  });

  it('climbs out onto a bank one block above the water surface, not two', () => {
    const jumpForward: MoveInput = { ...FORWARD, jump: true };
    // Bank at z <= -4 with its top at y = 13: one block above the water surface (12).
    const low = pool().fillSolid(-8, 8, 0, 12, -40, -4);
    const p = createPlayer(0.5, 9, 0.5);
    run(p, low, 240, jumpForward);
    run(p, low, 60);
    expect(p.y).toBe(13);
    expect(p.onGround).toBe(true);
    expect(p.z).toBeLessThan(-3.7);
    expect(p.z).toBeGreaterThan(-40);

    const high = pool().fillSolid(-8, 8, 0, 13, -40, -4);
    const q = createPlayer(0.5, 9, 0.5);
    run(q, high, 600, jumpForward);
    expect(q.y).toBeLessThan(13.5);
    expect(q.z).toBeCloseTo(-2.7, 6);
  });
});

describe('embedded positions (AC8.10)', () => {
  /** Everything solid: what physics sees in chunks that are not loaded yet. */
  const solidEverywhere: PhysicsWorld = { isSolidAt: () => true, isWaterAt: () => false };

  it('does not fall through unloaded terrain', () => {
    const p = createPlayer(0.5, 60, 0.5);
    run(p, solidEverywhere, 300, FORWARD);
    expect(p.y).toBe(60);
    expect(Math.abs(p.x - 0.5)).toBeLessThan(0.21);
    expect(Math.abs(p.z - 0.5)).toBeLessThan(0.21);
    const q = createPlayer(0.5, 60.7, 0.5);
    run(q, solidEverywhere, 300);
    expect(q.y).toBe(60);
  });

  it('is not ejected when a block appears inside the player', () => {
    const world = new TestWorld(0);
    const p = standing(world);
    world.addSolid(0, 0, 0).addSolid(0, 1, 0);
    run(p, world, 60);
    expect(p.y).toBe(0);
    expect(p.x).toBe(0.5);
  });
});

describe('playerIntersectsBlock', () => {
  it('detects overlap with the 0.6 × 1.8 × 0.6 box', () => {
    const p = createPlayer(0.5, 10, 0.5);
    expect(playerIntersectsBlock(p, 0, 10, 0)).toBe(true);
    expect(playerIntersectsBlock(p, 0, 11, 0)).toBe(true);
    expect(playerIntersectsBlock(p, 0, 12, 0)).toBe(false);
    expect(playerIntersectsBlock(p, 0, 9, 0)).toBe(false);
    expect(playerIntersectsBlock(p, 1, 10, 0)).toBe(false);
    expect(playerIntersectsBlock(p, -1, 10, 0)).toBe(false);
    p.x = 0.9;
    expect(playerIntersectsBlock(p, 1, 10, 0)).toBe(true);
    // Touching faces do not count as overlap.
    p.x = 0.7;
    expect(playerIntersectsBlock(p, 1, 10, 0)).toBe(false);
  });
});

describe('look', () => {
  it('clamps pitch to ±89° and wraps yaw', () => {
    const p = createPlayer(0, 0, 0);
    applyLook(p, 0, 10);
    expect(p.pitch).toBeCloseTo((89 * Math.PI) / 180, 10);
    applyLook(p, 0, -20);
    expect(p.pitch).toBeCloseTo((-89 * Math.PI) / 180, 10);
    applyLook(p, Math.PI * 1.5, 0);
    expect(p.yaw).toBeCloseTo(-Math.PI / 2, 10);
    applyLook(p, -Math.PI * 3, 0);
    expect(p.yaw).toBeCloseTo(Math.PI / 2, 10);
  });
});
