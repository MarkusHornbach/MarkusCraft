import { describe, it } from 'vitest';
import { COUNT, editsPart, randomEdits, worldOf } from '../../testing/lightEdits';
import { artificialGroup } from '../../testing/lightScenes';

describe('light after edits, part 4 of 4', () => {
  it('Phase 4 AC2.3 and AC2.5: random edits keep the stored light equal to the slow check', () => {
    editsPart(4);
  });

  it('Phase 4 AC2.3: random edits that reach the top of the world', () => {
    randomEdits(worldOf(artificialGroup(79, COUNT)), 30, 2025, true);
  });
});
