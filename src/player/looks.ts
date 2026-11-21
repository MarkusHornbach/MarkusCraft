// The looks of the player figure (Phase 6 part D): an append-only table of colours and
// styles the figure painter uses. Ids travel in the protocol and are stored on the device.

export type Rgb = readonly [number, number, number];

export type HairStyle = 'short' | 'long' | 'crop' | 'bun';
export type TopPattern = 'plain' | 'stripes' | 'vest' | 'collar';
export type LegStyle = 'trousers' | 'skirt';

export interface Look {
  id: number;
  name: string;
  skin: Rgb;
  hair: Rgb;
  hairStyle: HairStyle;
  top: Rgb;
  /** Second colour of the top: stripes, the vest's shirt, the collar. */
  topDetail: Rgb;
  pattern: TopPattern;
  /** Long sleeves reach the wrist; short ones end above the elbow. */
  longSleeves: boolean;
  legs: Rgb;
  legStyle: LegStyle;
  shoes: Rgb;
}

/** "Automatic": the look comes from the player key. */
export const LOOK_AUTOMATIC = 0;
export const LOOK_COUNT = 8;

/**
 * Ids 1–8; never renumber or reuse an id (pinned by `looks.test.ts`). None uses the colour
 * scheme of a well-known default skin (turquoise top, blue trousers, short brown hair, or
 * orange hair with a green top).
 */
export const LOOKS: readonly Look[] = [
  {
    id: 1,
    name: 'Fern',
    skin: [236, 198, 168],
    hair: [214, 178, 96],
    hairStyle: 'long',
    top: [92, 128, 64],
    topDetail: [214, 222, 190],
    pattern: 'collar',
    longSleeves: true,
    legs: [86, 70, 56],
    legStyle: 'skirt',
    shoes: [64, 44, 34],
  },
  {
    id: 2,
    name: 'Ember',
    skin: [160, 104, 70],
    hair: [36, 28, 26],
    hairStyle: 'crop',
    top: [196, 74, 40],
    topDetail: [244, 196, 92],
    pattern: 'stripes',
    longSleeves: false,
    legs: [58, 54, 60],
    legStyle: 'trousers',
    shoes: [30, 30, 34],
  },
  {
    id: 3,
    name: 'Pebble',
    skin: [214, 170, 132],
    hair: [120, 120, 126],
    hairStyle: 'short',
    top: [150, 146, 136],
    topDetail: [96, 92, 86],
    pattern: 'vest',
    longSleeves: true,
    legs: [70, 66, 62],
    legStyle: 'trousers',
    shoes: [128, 84, 52],
  },
  {
    id: 4,
    name: 'River',
    skin: [112, 72, 50],
    hair: [22, 20, 22],
    hairStyle: 'bun',
    top: [40, 84, 150],
    topDetail: [228, 232, 240],
    pattern: 'collar',
    longSleeves: true,
    legs: [206, 196, 170],
    legStyle: 'trousers',
    shoes: [240, 240, 236],
  },
  {
    id: 5,
    name: 'Moss',
    skin: [196, 146, 110],
    hair: [70, 46, 30],
    hairStyle: 'long',
    top: [62, 82, 46],
    topDetail: [150, 118, 72],
    pattern: 'vest',
    longSleeves: false,
    legs: [110, 92, 64],
    legStyle: 'trousers',
    shoes: [48, 36, 28],
  },
  {
    id: 6,
    name: 'Dune',
    skin: [184, 132, 92],
    hair: [154, 98, 52],
    hairStyle: 'crop',
    top: [222, 192, 128],
    topDetail: [170, 116, 70],
    pattern: 'stripes',
    longSleeves: true,
    legs: [140, 96, 62],
    legStyle: 'skirt',
    shoes: [92, 62, 40],
  },
  {
    id: 7,
    name: 'Frost',
    skin: [248, 222, 206],
    hair: [236, 236, 232],
    hairStyle: 'short',
    top: [182, 206, 224],
    topDetail: [244, 248, 252],
    pattern: 'plain',
    longSleeves: true,
    legs: [82, 92, 112],
    legStyle: 'trousers',
    shoes: [40, 46, 60],
  },
  {
    id: 8,
    name: 'Plum',
    skin: [136, 88, 62],
    hair: [92, 36, 70],
    hairStyle: 'bun',
    top: [120, 52, 104],
    topDetail: [236, 180, 210],
    pattern: 'plain',
    longSleeves: false,
    legs: [44, 36, 52],
    legStyle: 'skirt',
    shoes: [176, 52, 60],
  },
];

/** The look with this id (1–8), or the first one. */
export function lookById(id: number): Look {
  return LOOKS.find((l) => l.id === id) ?? LOOKS[0];
}

export function isLookId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= LOOK_COUNT;
}

/** A stored choice: 0 (Automatic) or a look id; anything else counts as 0. */
export function isLookChoice(value: unknown): value is number {
  return value === LOOK_AUTOMATIC || isLookId(value);
}

/** The look of a device that never chose one: the same key always gives the same look. */
export function lookForKey(key: string): number {
  const first = parseInt(key.slice(0, 2), 16);
  return 1 + ((Number.isFinite(first) ? first : 0) % LOOK_COUNT);
}

/** The look a choice stands for: 1–8 as chosen, 0 or anything invalid from the key. */
export function resolveLook(choice: unknown, key: string): number {
  return isLookId(choice) ? choice : lookForKey(key);
}
