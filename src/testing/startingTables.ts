// Test helper: the progress tables with the plan's starting values (Phase 8 plan 5.1), so
// that engine tests do not change when the shipped tables are tuned.
import { PROGRESS_TABLES, type ProgressTables } from '../progress/tables';

/** Counts of the plan's starting table, by task id; labels follow them. */
const STARTING_COUNTS: Record<number, [string, number]> = {
  1: ['Mine 4 logs', 4],
  2: ['Make 8 planks', 8],
  6: ['Mine 8 stone', 8],
  11: ['Make 2 coal', 2],
  12: ['Mine 3 coal', 3],
  13: ['Make 8 torches', 8],
  15: ['Place 4 torches', 4],
  16: ['Mine 3 iron ore', 3],
  17: ['Make 3 iron ingots', 3],
  19: ['Make 4 glass', 4],
  20: ['Place 8 stone bricks', 8],
  21: ['Store 4 stone in a chest', 4],
};

export const STARTING_TABLES: ProgressTables = {
  ...PROGRESS_TABLES,
  tasks: PROGRESS_TABLES.tasks.map((task) => {
    const start = STARTING_COUNTS[task.id];
    return start ? { ...task, label: start[0], count: start[1] } : task;
  }),
  levels: [0, 30, 80, 150, 240, 350, 480],
};
