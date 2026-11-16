import { describe, expect, it } from 'vitest';
import {
  PAD_LOOK_MAX_RAD_PER_S,
  PAD_NAV_DELAY_MS,
  PAD_NAV_REPEAT_MS,
  PAD_RAMP_FACTOR,
} from '../game/config';
import { expectFasterThan } from '../testing/timing';
import {
  PAD_BUTTONS,
  PAD_PLAY_MAPPING,
  PadButton,
  type PadFrame,
  PadMapper,
  applyDeadzone,
} from './padMapping';

const STEP_MS = 10;

/** A controller at rest, with some buttons set. */
function snapshot(
  buttons: Partial<Record<number, number>> = {},
  axes: [number, number, number, number] = [0, 0, 0, 0],
): { buttons: number[]; axes: number[] } {
  const values: number[] = [];
  for (let i = 0; i < 17; i++) values.push(buttons[i] ?? 0);
  return { buttons: values, axes };
}

/** A mapper that has seen one snapshot at rest, so presses count from now on. */
function awake(): PadMapper {
  const mapper = new PadMapper();
  mapper.update(snapshot(), STEP_MS);
  return mapper;
}

function copy(frame: PadFrame) {
  return {
    ...frame,
    held: [...frame.held],
    presses: [...frame.presses],
    pressed: [...frame.pressed],
    released: [...frame.released],
  };
}

describe('dead zone (Phase 5 AC1.1)', () => {
  it('reads zero inside and rescales outside, keeping the direction', () => {
    for (const angle of [0, 0.7, 2, 3.5, 5]) {
      for (const length of [0, 0.05, 0.1, 0.15]) {
        const out = applyDeadzone(Math.cos(angle) * length, Math.sin(angle) * length, 0.15);
        expect(Math.hypot(out.x, out.y)).toBe(0);
      }
      const half = applyDeadzone(Math.cos(angle) * 0.575, Math.sin(angle) * 0.575, 0.15);
      expect(Math.hypot(half.x, half.y)).toBeCloseTo(0.5, 9);
      expect(Math.atan2(half.y, half.x)).toBeCloseTo(Math.atan2(Math.sin(angle), Math.cos(angle)));
      const full = applyDeadzone(Math.cos(angle), Math.sin(angle), 0.15);
      expect(Math.hypot(full.x, full.y)).toBeCloseTo(1, 9);
    }
    // A square gate reports more than 1 in the corners: still full speed, not more.
    const corner = applyDeadzone(1, 1, 0.15);
    expect(Math.hypot(corner.x, corner.y)).toBeCloseTo(1, 9);
  });

  it('gives zero movement and look inside, half and full speed outside', () => {
    const mapper = awake();
    for (const [x, y] of [
      [0.1, 0.1],
      [-0.15, 0],
      [0, 0.149],
    ]) {
      const f = mapper.update(snapshot({}, [x, y, x, y]), STEP_MS);
      expect([f.forward, f.strafe, f.lookX, f.lookY]).toEqual([0, 0, 0, 0]);
    }
    let f = mapper.update(snapshot({}, [0, -0.575, 0, 0]), STEP_MS);
    expect(f.forward).toBeCloseTo(0.5, 9);
    expect(f.strafe).toBe(0);
    f = mapper.update(snapshot({}, [1, 0, 0, 0]), STEP_MS);
    expect(f.strafe).toBeCloseTo(1, 9);
    f = mapper.update(snapshot({}, [0, 1, 0, 0]), STEP_MS);
    expect(f.forward).toBeCloseTo(-1, 9);
  });
});

describe('look (Phase 5 AC1.2)', () => {
  it('turns at the maximum rate times the sensitivity, a quarter at half deflection', () => {
    for (const sensitivity of [1, 0.5, 2.5]) {
      const mapper = awake();
      mapper.setLook(sensitivity, false);
      const full = mapper.update(snapshot({}, [0, 0, 1, 0]), STEP_MS);
      expect(full.lookX).toBeCloseTo(PAD_LOOK_MAX_RAD_PER_S * sensitivity, 9);
      expect(full.lookY).toBe(0);
      // Half of the rescaled range: 0.15 + 0.85 / 2.
      const half = mapper.update(snapshot({}, [0, 0, 0.575, 0]), STEP_MS);
      expect(half.lookX).toBeCloseTo((PAD_LOOK_MAX_RAD_PER_S * sensitivity) / 4, 9);
    }
  });

  it('right turns right, up looks up; invert flips only the vertical axis', () => {
    const mapper = awake();
    const right = copy(mapper.update(snapshot({}, [0, 0, 1, 0]), STEP_MS));
    expect(right.lookX).toBeGreaterThan(0);
    const left = copy(mapper.update(snapshot({}, [0, 0, -1, 0]), STEP_MS));
    expect(left.lookX).toBeLessThan(0);
    const up = copy(mapper.update(snapshot({}, [0, 0, 0, -1]), STEP_MS));
    expect(up.lookY).toBeGreaterThan(0);
    const down = copy(mapper.update(snapshot({}, [0, 0, 0, 1]), STEP_MS));
    expect(down.lookY).toBeLessThan(0);
    mapper.setLook(1, true);
    const diagonal = [0, 0, 0.6, -0.6] as [number, number, number, number];
    const inverted = copy(mapper.update(snapshot({}, diagonal), STEP_MS));
    mapper.setLook(1, false);
    const normal = copy(mapper.update(snapshot({}, diagonal), STEP_MS));
    expect(inverted.lookX).toBeCloseTo(normal.lookX, 12);
    expect(inverted.lookY).toBeCloseTo(-normal.lookY, 12);
    expect(normal.lookY).toBeGreaterThan(0);
  });
});

describe('ramp (Phase 5 AC1.3)', () => {
  /** Holds the right stick fully sideways for `ms` and returns the rate at the end. */
  function rateAfter(mapper: PadMapper, ms: number): number {
    let rate = 0;
    for (let t = 0; t <= ms; t += STEP_MS) {
      rate = mapper.update(snapshot({}, [0, 0, 1, 0]), STEP_MS).lookX;
    }
    return rate;
  }

  it('is unchanged until 250 ms, 1.6 times from 650 ms on', () => {
    expect(rateAfter(awake(), 250)).toBeCloseTo(PAD_LOOK_MAX_RAD_PER_S, 9);
    expect(rateAfter(awake(), 450)).toBeCloseTo(PAD_LOOK_MAX_RAD_PER_S * 1.3, 9);
    expect(rateAfter(awake(), 650)).toBeCloseTo(PAD_LOOK_MAX_RAD_PER_S * PAD_RAMP_FACTOR, 9);
    expect(rateAfter(awake(), 3000)).toBeCloseTo(PAD_LOOK_MAX_RAD_PER_S * PAD_RAMP_FACTOR, 9);
  });

  it('starts over when the stick drops below 0.95', () => {
    const mapper = awake();
    rateAfter(mapper, 1000);
    mapper.update(snapshot({}, [0, 0, 0.9, 0]), STEP_MS);
    expect(rateAfter(mapper, 200)).toBeCloseTo(PAD_LOOK_MAX_RAD_PER_S, 9);
  });

  it('never speeds up looking up and down', () => {
    const mapper = awake();
    let f = mapper.update(snapshot({}, [0, 0, 0, -1]), STEP_MS);
    for (let t = 0; t < 1000; t += STEP_MS) f = mapper.update(snapshot({}, [0, 0, 0, -1]), STEP_MS);
    expect(f.lookY).toBeCloseTo(PAD_LOOK_MAX_RAD_PER_S, 9);
  });
});

describe('buttons (Phase 5 AC1.4)', () => {
  it('a press reports one press and holds until the value falls below 0.35', () => {
    const mapper = awake();
    let f = mapper.update(snapshot({ [PadButton.RT]: 0.6 }), STEP_MS);
    expect(f.pressed).toEqual([PadButton.RT]);
    expect(f.presses).toEqual([{ type: 'break' }]);
    expect(f.held.has('break')).toBe(true);
    expect(f.used).toBe(true);
    for (const value of [0.6, 0.45, 0.36, 0.35]) {
      f = mapper.update(snapshot({ [PadButton.RT]: value }), STEP_MS);
      expect(f.pressed).toEqual([]);
      expect(f.presses).toEqual([]);
      expect(f.held.has('break')).toBe(true);
    }
    f = mapper.update(snapshot({ [PadButton.RT]: 0.34 }), STEP_MS);
    expect(f.released).toEqual([PadButton.RT]);
    expect(f.held.has('break')).toBe(false);
  });

  it('values between 0.35 and 0.5 never start a press', () => {
    const mapper = awake();
    for (const value of [0.36, 0.49, 0.4, 0.499]) {
      const f = mapper.update(snapshot({ [PadButton.LT]: value }), STEP_MS);
      expect(f.pressed).toEqual([]);
      expect(f.held.size).toBe(0);
      expect(f.used).toBe(false);
    }
  });

  it('a button down in the first snapshot after a reset reports nothing until pressed again', () => {
    const mapper = new PadMapper();
    let f = mapper.update(snapshot({ [PadButton.A]: 1 }), STEP_MS);
    expect(f.pressed).toEqual([]);
    expect(f.held.size).toBe(0);
    expect(f.used).toBe(false);
    f = mapper.update(snapshot({ [PadButton.A]: 1 }), STEP_MS);
    expect(f.held.size).toBe(0);
    f = mapper.update(snapshot({}), STEP_MS);
    expect(f.released).toEqual([]);
    f = mapper.update(snapshot({ [PadButton.A]: 1 }), STEP_MS);
    expect(f.pressed).toEqual([PadButton.A]);
    expect([...f.held]).toEqual(['jump']);

    mapper.reset();
    f = mapper.update(snapshot({ [PadButton.A]: 1, [PadButton.X]: 1 }), STEP_MS);
    expect(f.presses).toEqual([]);
    expect(f.held.size).toBe(0);
    expect(mapper.isDown(PadButton.A)).toBe(false);
  });
});

describe('blockHeld', () => {
  it('a button held across a change reports nothing until released and pressed again', () => {
    const mapper = awake();
    let f = mapper.update(snapshot({ [PadButton.A]: 1, [PadButton.LS]: 1 }, [0, -1, 0, 0]), 10);
    expect([...f.held].sort()).toEqual(['jump', 'sprint']);
    mapper.blockHeld();
    f = mapper.update(snapshot({ [PadButton.A]: 1 }, [0, -1, 0, 0]), 10);
    expect(f.held.size).toBe(0);
    f = mapper.update(snapshot({}, [0, -1, 0, 0]), 10);
    expect(f.released).toEqual([]);
    f = mapper.update(snapshot({ [PadButton.A]: 1 }, [0, -1, 0, 0]), 10);
    expect(f.pressed).toEqual([PadButton.A]);
  });
});

describe('sprint and the mapping (Phase 5 AC1.5)', () => {
  it('the stick click sprints until the left stick returns into its dead zone', () => {
    const mapper = awake();
    let f = mapper.update(snapshot({}, [0, -1, 0, 0]), STEP_MS);
    expect(f.held.has('sprint')).toBe(false);
    f = mapper.update(snapshot({ [PadButton.LS]: 1 }, [0, -1, 0, 0]), STEP_MS);
    expect(f.held.has('sprint')).toBe(true);
    // Letting go of the click keeps sprinting; so does any direction outside the dead zone.
    for (const axes of [
      [0, -1, 0, 0],
      [0.5, -0.2, 0, 0],
      [-0.3, 0, 0, 0],
    ] as [number, number, number, number][]) {
      f = mapper.update(snapshot({}, axes), STEP_MS);
      expect(f.held.has('sprint')).toBe(true);
    }
    f = mapper.update(snapshot({}, [0.1, 0, 0, 0]), STEP_MS);
    expect(f.held.has('sprint')).toBe(false);
    f = mapper.update(snapshot({}, [0, -1, 0, 0]), STEP_MS);
    expect(f.held.has('sprint')).toBe(false);
  });

  it('pins the mapping table of plan 5.3', () => {
    const table: [number, string[], unknown[]][] = [
      [PadButton.A, ['jump'], []],
      [PadButton.B, ['descend'], []],
      [PadButton.X, [], [{ type: 'toggleFly' }]],
      [PadButton.Y, [], [{ type: 'inventory' }]],
      [PadButton.LB, [], [{ type: 'cycleSlot', direction: -1 }]],
      [PadButton.RB, [], [{ type: 'cycleSlot', direction: 1 }]],
      [PadButton.LT, ['place'], [{ type: 'place' }]],
      [PadButton.RT, ['break'], [{ type: 'break' }]],
      [PadButton.SELECT, [], []],
      [PadButton.START, [], [{ type: 'menu' }]],
      [PadButton.LS, ['sprint'], []],
      [PadButton.RS, [], []],
      [PadButton.UP, [], []],
      [PadButton.DOWN, [], []],
      [PadButton.LEFT, [], [{ type: 'cycleSlot', direction: -1 }]],
      [PadButton.RIGHT, [], [{ type: 'cycleSlot', direction: 1 }]],
    ];
    expect(table.length).toBe(PAD_BUTTONS);
    for (const [button, held, presses] of table) {
      const mapper = awake();
      // The left stick is pushed so that the sprint latch shows.
      const f = mapper.update(snapshot({ [button]: 1 }, [0, -1, 0, 0]), STEP_MS);
      expect([...f.held], `held of button ${button}`).toEqual(held);
      expect(f.presses, `presses of button ${button}`).toEqual(presses);
      expect(f.pressed).toEqual([button]);
    }
    expect(PAD_PLAY_MAPPING.length).toBe(11);
  });

  it('counts as used on a press or a stick beyond 0.5, never on drift', () => {
    const mapper = awake();
    expect(mapper.update(snapshot({}, [0.14, 0.1, -0.1, 0.12]), STEP_MS).used).toBe(false);
    expect(mapper.update(snapshot({}, [0.45, 0, 0, 0]), STEP_MS).used).toBe(false);
    expect(mapper.update(snapshot({}, [0.51, 0, 0, 0]), STEP_MS).used).toBe(true);
    expect(mapper.update(snapshot({}, [0, 0, 0, -0.6]), STEP_MS).used).toBe(true);
    expect(mapper.update(snapshot({ [PadButton.SELECT]: 1 }), STEP_MS).used).toBe(true);
    // Holding is not using it again.
    expect(mapper.update(snapshot({ [PadButton.SELECT]: 1 }), STEP_MS).used).toBe(false);
  });
});

describe('navigation (Phase 5 AC1.7)', () => {
  it('moves at once, again after 400 ms, then every 120 ms, from D-pad and left stick', () => {
    const mapper = awake();
    const moves: number[] = [];
    for (let t = 0; t <= 1000; t += STEP_MS) {
      if (mapper.update(snapshot({ [PadButton.DOWN]: 1 }), STEP_MS).nav === 'down') moves.push(t);
    }
    const expected = [0];
    for (let t = PAD_NAV_DELAY_MS; t <= 1000; t += PAD_NAV_REPEAT_MS) expected.push(t);
    expect(moves).toEqual(expected);

    mapper.update(snapshot(), STEP_MS);
    expect(mapper.update(snapshot({}, [-0.8, 0.2, 0, 0]), STEP_MS).nav).toBe('left');
    expect(mapper.update(snapshot({}, [-0.8, 0.2, 0, 0]), STEP_MS).nav).toBeNull();
    // A change of direction starts over.
    expect(mapper.update(snapshot({}, [0.1, -0.7, 0, 0]), STEP_MS).nav).toBe('up');
    expect(mapper.update(snapshot({}, [0.1, 0.3, 0, 0]), STEP_MS).nav).toBeNull();
    // The D-pad wins over the stick.
    expect(mapper.update(snapshot({ [PadButton.RIGHT]: 1 }, [0, 1, 0, 0]), STEP_MS).nav).toBe(
      'right',
    );
  });

  it('reports the right stick for scrolling', () => {
    const mapper = awake();
    expect(mapper.update(snapshot({}, [0, 0, 0, 1]), STEP_MS).scroll).toBeCloseTo(1, 9);
    expect(mapper.update(snapshot({}, [0, 0, 0, 0.1]), STEP_MS).scroll).toBe(0);
  });
});

describe('cost (Phase 5 AC1.6)', () => {
  it('10 000 updates with a full snapshot take less than 20 ms', () => {
    const snapshots = [
      snapshot({ 0: 1, 6: 0.7, 7: 0.4, 10: 1, 12: 1 }, [0.4, -0.9, 1, 0.3]),
      snapshot({ 1: 1, 5: 1, 7: 1, 15: 1 }, [-0.2, 0.6, -0.97, -0.5]),
    ];
    let best = Infinity;
    for (let round = 0; round < 5; round++) {
      const mapper = new PadMapper();
      const start = performance.now();
      for (let i = 0; i < 10_000; i++) mapper.update(snapshots[i & 1], 16);
      best = Math.min(best, performance.now() - start);
    }
    expectFasterThan(best, 20);
  });
});
