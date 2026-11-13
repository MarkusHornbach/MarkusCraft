// Recorded terrain checksum, shared by the unit test (Node) and the browser test.

/**
 * `terrainChecksum(1337, 1)`: FNV-1a over the 3 × 3 chunks around the origin of seed 1337
 * with generator version 1. It must never change: saved worlds rely on this terrain.
 */
export const TERRAIN_CHECKSUM_1337_V1 = 884517734;
