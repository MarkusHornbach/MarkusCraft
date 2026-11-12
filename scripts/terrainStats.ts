// Dev tool: prints height and water statistics of the terrain. Run: npx vite-node scripts/terrainStats.ts
import { SEA_LEVEL } from '../src/game/config';
import { Terrain } from '../src/world/generation/terrain';

for (const seed of [1, 1337, 987654321, 42, 7]) {
  const t = new Terrain(seed);
  let min = Infinity;
  let max = -Infinity;
  let water = 0;
  let trees = 0;
  let grass = 0;
  let steep = 0;
  const n = 512;
  for (let z = -n / 2; z < n / 2; z++) {
    for (let x = -n / 2; x < n / 2; x++) {
      const h = t.heightAt(x, z);
      min = Math.min(min, h);
      max = Math.max(max, h);
      if (h < SEA_LEVEL) water++;
      if (h > SEA_LEVEL + 2) grass++;
      if (t.treeAt(x, z) > 0) trees++;
      if (Math.abs(h - t.heightAt(x + 1, z)) > 3) steep++;
    }
  }
  const total = n * n;
  console.log(
    `seed ${seed}: h ${min}..${max}, water ${((water / total) * 100).toFixed(1)}%, ` +
      `trees/100 grass ${((trees / grass) * 100).toFixed(2)}, steep ${((steep / total) * 100).toFixed(2)}%, h(0,0)=${t.heightAt(0, 0)}`,
  );
}
