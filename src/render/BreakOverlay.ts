// Break overlay: cracks on the six faces of the block that is being broken.
import * as THREE from 'three';
import { CRACK_SIZE, CRACK_STAGES, paintCracks } from './textures/cracks';

/** Slightly larger than the block, so the cracks lie on top of its faces. */
const INFLATE = 0.002;

export class BreakOverlay {
  private readonly mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private readonly textures: THREE.DataTexture[] = [];
  private stage = -1;

  constructor(scene: THREE.Scene) {
    for (let stage = 0; stage < CRACK_STAGES; stage++) {
      const texture = new THREE.DataTexture(
        paintCracks(stage),
        CRACK_SIZE,
        CRACK_SIZE,
        THREE.RGBAFormat,
      );
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      this.textures.push(texture);
    }
    const size = 1 + 2 * INFLATE;
    // One box with one material: a single draw call.
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshBasicMaterial({
        map: this.textures[0],
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  /** Shows the cracks of a stage on a block, or hides them when `block` is null. */
  set(block: { x: number; y: number; z: number } | null, stage = 0): void {
    this.mesh.visible = block !== null;
    if (!block) return;
    this.mesh.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
    const clamped = Math.max(0, Math.min(CRACK_STAGES - 1, stage));
    if (clamped === this.stage) return;
    this.stage = clamped;
    this.mesh.material.map = this.textures[clamped];
    this.mesh.material.needsUpdate = true;
  }
}
