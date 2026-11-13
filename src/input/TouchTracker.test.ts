import { describe, expect, it } from 'vitest';
import type { HeldAction, PressAction } from './Input';
import { type TouchTarget, TouchTracker, stickOutput } from './TouchTracker';

const RADIUS = 60;
const OPTIONS = { stickRadius: RADIUS, deadzone: 0.15, sprintThreshold: 0.9, stickZoneTop: 0.3 };
const WIDTH = 960;
const HEIGHT = 540;
const SURFACE: TouchTarget = { kind: 'surface' };

/** Records what the tracker reports, like `Input` would. */
function createSink() {
  const held = new Set<HeldAction>();
  const presses: PressAction[] = [];
  const move = { forward: 0, strafe: 0 };
  return {
    held,
    presses,
    move,
    setHeld: (action: HeldAction, on: boolean) => {
      if (on) held.add(action);
      else held.delete(action);
    },
    setMove: (forward: number, strafe: number) => {
      move.forward = forward;
      move.strafe = strafe;
    },
    press: (action: PressAction) => {
      presses.push(action);
    },
  };
}

function setup() {
  const sink = createSink();
  const tracker = new TouchTracker(sink, OPTIONS);
  const down = (id: number, x: number, y: number, target: TouchTarget = SURFACE) =>
    tracker.down(id, target, x, y, WIDTH, HEIGHT);
  return { sink, tracker, down };
}

describe('stickOutput (AC1.1)', () => {
  const out = (dx: number, dy: number) => stickOutput(dx, dy, RADIUS, 0.15, 0.9);

  it('maps deflection to analog forward and strafe', () => {
    expect(out(0, -30)).toMatchObject({ forward: 0.5, strafe: 0, sprint: false });
    expect(out(0, 30)).toMatchObject({ forward: -0.5, strafe: 0 });
    expect(out(30, 0)).toMatchObject({ forward: 0, strafe: 0.5 });
    expect(out(-45, 0)).toMatchObject({ forward: 0, strafe: -0.75 });
    const diagonal = out(24, -18);
    expect(diagonal.forward).toBeCloseTo(0.3);
    expect(diagonal.strafe).toBeCloseTo(0.4);
  });

  it('is zero inside the dead zone', () => {
    expect(out(0, 0)).toMatchObject({ forward: 0, strafe: 0, sprint: false });
    expect(out(0, -8)).toMatchObject({ forward: 0, strafe: 0 });
    expect(out(6, 6)).toMatchObject({ forward: 0, strafe: 0 });
    // Just outside the dead zone the deflection passes through unchanged.
    expect(out(0, -10).forward).toBeCloseTo(10 / 60);
  });

  it('limits the deflection to the radius', () => {
    const far = out(0, -300);
    expect(far.forward).toBe(1);
    expect(far.knobY).toBe(-RADIUS);
    const diagonal = out(200, -200);
    expect(Math.hypot(diagonal.forward, diagonal.strafe)).toBeCloseTo(1);
    expect(Math.hypot(diagonal.knobX, diagonal.knobY)).toBeCloseTo(RADIUS);
  });

  it('sprints beyond the threshold only', () => {
    expect(out(0, -54).sprint).toBe(false);
    expect(out(0, -55).sprint).toBe(true);
    expect(out(0, -60).sprint).toBe(true);
    expect(out(60, 0).sprint).toBe(true);
  });
});

describe('TouchTracker stick (AC1.1)', () => {
  it('starts where the thumb lands and reports analog movement', () => {
    const { sink, tracker, down } = setup();
    down(1, 150, 400);
    expect(tracker.stick).toEqual({ originX: 150, originY: 400, knobX: 0, knobY: 0 });
    expect(sink.move).toEqual({ forward: 0, strafe: 0 });
    tracker.move(1, 150, 370);
    expect(sink.move).toEqual({ forward: 0.5, strafe: 0 });
    expect(sink.held.has('sprint')).toBe(false);
    expect(tracker.stick).toMatchObject({ knobX: 0, knobY: -30 });
    tracker.move(1, 180, 400);
    expect(sink.move).toEqual({ forward: 0, strafe: 0.5 });
  });

  it('sprints beyond the threshold and stops sprinting below it', () => {
    const { sink, tracker, down } = setup();
    down(1, 150, 400);
    tracker.move(1, 150, 300);
    expect(sink.move.forward).toBe(1);
    expect(sink.held.has('sprint')).toBe(true);
    tracker.move(1, 150, 370);
    expect(sink.held.has('sprint')).toBe(false);
  });

  it('returns to zero when released', () => {
    const { sink, tracker, down } = setup();
    down(1, 150, 400);
    tracker.move(1, 150, 300);
    tracker.up(1);
    expect(sink.move).toEqual({ forward: 0, strafe: 0 });
    expect(sink.held.size).toBe(0);
    expect(tracker.stick).toBeNull();
    // Later movement of the lifted finger is ignored.
    tracker.move(1, 150, 300);
    expect(sink.move).toEqual({ forward: 0, strafe: 0 });
  });

  it('only starts in the lower left part and only once', () => {
    const { sink, tracker, down } = setup();
    down(1, 150, 100); // too high
    tracker.move(1, 150, 40);
    expect(tracker.stick).toBeNull();
    expect(sink.move).toEqual({ forward: 0, strafe: 0 });
    expect(tracker.consumeLook()).toEqual({ dx: 0, dy: 0 });

    down(2, 150, 400);
    down(3, 300, 400); // a second finger on the left does not move the stick
    tracker.move(3, 300, 300);
    expect(tracker.stick).toMatchObject({ originX: 150, originY: 400 });
    expect(sink.move).toEqual({ forward: 0, strafe: 0 });
  });
});

describe('TouchTracker look', () => {
  it('accumulates the drag on the right half until consumed', () => {
    const { tracker, down } = setup();
    down(1, 700, 200);
    tracker.move(1, 720, 190);
    tracker.move(1, 750, 170);
    expect(tracker.consumeLook()).toEqual({ dx: 50, dy: -30 });
    expect(tracker.consumeLook()).toEqual({ dx: 0, dy: 0 });
    tracker.up(1);
    tracker.move(1, 900, 100);
    expect(tracker.consumeLook()).toEqual({ dx: 0, dy: 0 });
  });

  it('works together with the stick and ignores a second look finger', () => {
    const { sink, tracker, down } = setup();
    down(1, 150, 400);
    down(2, 700, 200);
    down(3, 800, 200);
    tracker.move(1, 150, 340);
    tracker.move(2, 740, 200);
    tracker.move(3, 600, 500);
    expect(sink.move.forward).toBe(1);
    expect(tracker.consumeLook()).toEqual({ dx: 40, dy: 0 });
    // A stick finger that wanders to the right half stays the stick.
    tracker.move(1, 800, 400);
    expect(sink.move.strafe).toBe(1);
    expect(tracker.consumeLook()).toEqual({ dx: 0, dy: 0 });
  });
});

describe('TouchTracker buttons and slots', () => {
  const button = (name: 'break' | 'place' | 'up' | 'down' | 'fly' | 'menu'): TouchTarget => ({
    kind: 'button',
    button: name,
  });

  it('holds and presses break and place like the mouse buttons', () => {
    const { sink, tracker, down } = setup();
    down(1, 700, 300, button('break'));
    expect(sink.held.has('break')).toBe(true);
    expect(sink.presses).toEqual([{ type: 'break' }]);
    tracker.up(1);
    expect(sink.held.has('break')).toBe(false);
    down(2, 650, 350, button('place'));
    expect(sink.held.has('place')).toBe(true);
    expect(sink.presses).toEqual([{ type: 'break' }, { type: 'place' }]);
    tracker.up(2);
    expect(sink.held.size).toBe(0);
  });

  it('maps up and down to held jump and descend, fly and menu to presses', () => {
    const { sink, tracker, down } = setup();
    down(1, 900, 300, button('up'));
    down(2, 900, 400, button('down'));
    expect([...sink.held].sort()).toEqual(['descend', 'jump']);
    tracker.up(1);
    expect([...sink.held]).toEqual(['descend']);
    tracker.up(2);
    down(3, 900, 30, button('fly'));
    down(4, 30, 30, button('menu'));
    expect(sink.presses).toEqual([{ type: 'toggleFly' }, { type: 'menu' }]);
    expect(sink.held.size).toBe(0);
  });

  it('selects a slot of the block bar', () => {
    const { sink, down } = setup();
    down(1, 480, 520, { kind: 'slot', slot: 5 });
    expect(sink.presses).toEqual([{ type: 'selectSlot', slot: 5 }]);
  });

  it('does not turn the view with a drag that starts on a button (AC2.5)', () => {
    const { sink, tracker, down } = setup();
    down(1, 700, 300, button('break'));
    tracker.move(1, 600, 200);
    expect(tracker.consumeLook()).toEqual({ dx: 0, dy: 0 });
    expect(sink.move).toEqual({ forward: 0, strafe: 0 });
  });

  it('triggers no button from the stick or the look area (AC2.5)', () => {
    const { sink, tracker, down } = setup();
    down(1, 150, 400);
    down(2, 700, 200);
    tracker.move(1, 150, 370);
    tracker.move(2, 720, 220);
    tracker.up(1);
    tracker.up(2);
    expect(sink.presses).toEqual([]);
    expect(sink.held.size).toBe(0);
  });

  it('keeps a button held while a second finger still rests on it', () => {
    const { sink, tracker, down } = setup();
    down(1, 900, 300, button('up'));
    down(2, 905, 305, button('up'));
    tracker.up(1);
    expect(sink.held.has('jump')).toBe(true);
    tracker.up(2);
    expect(sink.held.has('jump')).toBe(false);
  });

  it('reset lifts every finger', () => {
    const { sink, tracker, down } = setup();
    down(1, 150, 400);
    down(2, 700, 200);
    down(3, 900, 300, button('up'));
    tracker.move(1, 150, 300);
    tracker.move(2, 750, 200);
    tracker.reset();
    expect(sink.move).toEqual({ forward: 0, strafe: 0 });
    expect(sink.held.size).toBe(0);
    expect(tracker.stick).toBeNull();
    expect(tracker.consumeLook()).toEqual({ dx: 0, dy: 0 });
  });

  it('treats a repeated id as a new touch', () => {
    const { sink, tracker, down } = setup();
    down(1, 900, 300, button('up'));
    down(1, 150, 400);
    expect(sink.held.has('jump')).toBe(false);
    expect(tracker.stick).not.toBeNull();
  });
});
