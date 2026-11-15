import { describe, it } from 'vitest';
import { COUNT, editsPart, randomEdits, worldOf } from '../../testing/lightEdits';
import { artificialGroup } from '../../testing/lightScenes';
import { TIMING_ENFORCED } from '../../testing/timing';

describe('light after edits, part 4 of 4', () => {
  it('Phase 4 AC2.3 and AC2.5: random edits keep the stored light equal to the slow check', () => {
    editsPart(4);
  });

  it('Phase 4 AC2.3: random edits that reach the top of the world', () => {
    // A world that reaches the top makes the slow check slowest; fewer edits under coverage.
    randomEdits(worldOf(artificialGroup(79, COUNT)), TIMING_ENFORCED ? 30 : 12, 2025, true);
  });
});
