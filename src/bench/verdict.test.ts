import { describe, expect, it } from 'vitest';
import {
  type JudgedScenario,
  chunkWorkLight,
  isThrottled,
  lightLetter,
  loadingLight,
  scenarioLight,
  smoothnessLight,
  workersText,
  workersVerdict,
  worstLight,
} from './verdict';

/** A scenario of 1 000 frames in which everything is green. */
function scenario(patch: Partial<JudgedScenario> = {}): JudgedScenario {
  return {
    id: 'walk',
    rd: 5,
    frames: 1000,
    ms: 16_700,
    p99: 20,
    long: 0,
    cwOver: 0,
    lagAvg: 6,
    cut: false,
    ...patch,
  };
}

describe('lights (Phase 4P AC1.6)', () => {
  it('smoothness: green up to 1 % long frames and a p99 of 33 ms', () => {
    expect(smoothnessLight(scenario({ long: 10, p99: 33 }))).toBe('green');
    expect(smoothnessLight(scenario({ long: 11, p99: 33 }))).toBe('yellow');
    expect(smoothnessLight(scenario({ long: 10, p99: 33.1 }))).toBe('yellow');
  });

  it('smoothness: yellow up to 5 % long frames and a p99 of 50 ms, red beyond', () => {
    expect(smoothnessLight(scenario({ long: 50, p99: 50 }))).toBe('yellow');
    expect(smoothnessLight(scenario({ long: 51, p99: 50 }))).toBe('red');
    expect(smoothnessLight(scenario({ long: 50, p99: 50.1 }))).toBe('red');
    expect(smoothnessLight(scenario({ frames: 0 }))).toBe('red');
  });

  it('loading: only for flying; green from render distance − 1, yellow from half of it', () => {
    expect(loadingLight(scenario({ lagAvg: 0 }))).toBeNull();
    expect(loadingLight(scenario({ id: 'fly', lagAvg: 4 }))).toBe('green');
    expect(loadingLight(scenario({ id: 'fly', lagAvg: 3.9 }))).toBe('yellow');
    expect(loadingLight(scenario({ id: 'fly', lagAvg: 2.5 }))).toBe('yellow');
    expect(loadingLight(scenario({ id: 'fly', lagAvg: 2.4 }))).toBe('red');
    expect(loadingLight(scenario({ id: 'fly', rd: 8, lagAvg: 7 }))).toBe('green');
    expect(loadingLight(scenario({ id: 'fly', rd: 8, lagAvg: 4 }))).toBe('yellow');
    expect(loadingLight(scenario({ id: 'fly', rd: 8, lagAvg: 3.9 }))).toBe('red');
  });

  it('chunk work: green up to 0.1 % of the frames above the limit, yellow up to 1 %', () => {
    expect(chunkWorkLight(scenario({ cwOver: 1 }))).toBe('green');
    expect(chunkWorkLight(scenario({ cwOver: 2 }))).toBe('yellow');
    expect(chunkWorkLight(scenario({ cwOver: 10 }))).toBe('yellow');
    expect(chunkWorkLight(scenario({ cwOver: 11 }))).toBe('red');
    expect(chunkWorkLight(scenario({ frames: 0 }))).toBe('red');
  });

  it("a scenario's light is its worst one, and a cut window is red", () => {
    expect(scenarioLight(scenario())).toBe('green');
    expect(scenarioLight(scenario({ cwOver: 2 }))).toBe('yellow');
    expect(scenarioLight(scenario({ cwOver: 2, long: 60 }))).toBe('red');
    expect(scenarioLight(scenario({ id: 'fly', lagAvg: 1 }))).toBe('red');
    expect(scenarioLight(scenario({ id: 'fly', lagAvg: 3 }))).toBe('yellow');
    expect(scenarioLight(scenario({ cut: true }))).toBe('red');
    expect(worstLight([])).toBe('green');
    expect(worstLight(['green', null, 'yellow'])).toBe('yellow');
    expect(['green', 'yellow', 'red'].map((l) => lightLetter(l as 'green'))).toEqual([
      'G',
      'Y',
      'R',
    ]);
  });

  it('the throttling flag: the last stand more than 20 % slower than the first', () => {
    const first = scenario({ id: 'stand', ms: 10_000 });
    const middle = scenario({ id: 'fly', ms: 90_000 });
    expect(isThrottled([first, middle, scenario({ id: 'stand', ms: 11_900 })])).toBe(false);
    expect(isThrottled([first, middle, scenario({ id: 'stand', ms: 12_100 })])).toBe(true);
    // Fewer frames in the same time are a slowdown too.
    expect(isThrottled([first, scenario({ id: 'stand', ms: 10_000, frames: 800 })])).toBe(true);
    // Nothing to compare.
    expect(isThrottled([first])).toBe(false);
    expect(isThrottled([first, middle])).toBe(false);
    expect(isThrottled([first, scenario({ id: 'stand', rd: 8, ms: 20_000 })])).toBe(false);
    expect(isThrottled([first, scenario({ id: 'stand', frames: 0 })])).toBe(false);
  });
});

describe('the Web Workers line (Phase 4P AC1.6)', () => {
  const stand = scenario({ id: 'stand' });
  const fly = scenario({ id: 'fly' });
  const edit = scenario({ id: 'edit' });

  it('touch: not needed when loading and chunk work of fly and edit are green', () => {
    expect(workersVerdict([stand, fly, edit], 'touch', false)).toBe('not needed');
    // Smoothness alone does not ask for workers.
    const rough = scenario({ id: 'fly', long: 500, p99: 90 });
    expect(workersVerdict([stand, rough, edit], 'touch', false)).toBe('not needed');
    // Neither does another scenario.
    expect(workersVerdict([scenario({ cwOver: 500 }), fly, edit], 'touch', false)).toBe(
      'not needed',
    );
  });

  it('touch: borderline when one of them is yellow', () => {
    const slow = scenario({ id: 'fly', lagAvg: 3 });
    expect(workersVerdict([stand, slow, edit], 'touch', false)).toBe('borderline');
    const busy = scenario({ id: 'edit', cwOver: 5 });
    expect(workersVerdict([stand, fly, busy], 'touch', false)).toBe('borderline');
  });

  it('touch: recommended when one of them is red', () => {
    const late = scenario({ id: 'fly', lagAvg: 1 });
    expect(workersVerdict([stand, late, edit], 'touch', false)).toBe('recommended');
    const busy = scenario({ id: 'edit', cwOver: 50 });
    expect(workersVerdict([stand, scenario({ id: 'fly', lagAvg: 3 }), busy], 'touch', false)).toBe(
      'recommended',
    );
  });

  it('lights at render distance 8 never change the line', () => {
    const far = scenario({ id: 'fly', rd: 8, lagAvg: 0, cwOver: 900 });
    const farEdit = scenario({ id: 'edit', rd: 8, cwOver: 900 });
    expect(workersVerdict([stand, fly, edit, far, farEdit], 'touch', false)).toBe('not needed');
  });

  it('mouse mode and a quick run decide nothing', () => {
    const late = scenario({ id: 'fly', lagAvg: 0 });
    expect(workersVerdict([late], 'mouse', false)).toBe('mouse');
    expect(workersVerdict([late], 'touch', true)).toBe('quick');
    expect(workersVerdict([late], 'mouse', true)).toBe('quick');
    expect(workersText('mouse')).toBe('Web Workers (Part C): decided on phones and tablets');
    expect(workersText('quick')).toBe('Web Workers (Part C): not a measurement');
    expect(workersText('recommended')).toBe('Web Workers (Part C): recommended');
    expect(workersText('borderline')).toBe('Web Workers (Part C): borderline');
    expect(workersText('not needed')).toBe('Web Workers (Part C): not needed');
  });
});
