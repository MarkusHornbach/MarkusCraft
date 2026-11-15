// Recorded light checksum, shared by the unit test (Node) and the browser test.

/**
 * FNV-1a over the light of the 3 × 3 chunks around the origin of seed 1337 with generator
 * version 1, without edits (see `lightChecksumOf`). It changes only when the light rules or
 * the opacity of a block change; record the new value then.
 */
export const LIGHT_CHECKSUM_1337_V1 = 3140696357;
