// Chunk meshes: turns mesher output into Three.js geometry and releases it on unload.
import * as THREE from 'three';
import { CHUNK_SIZE } from '../game/config';
import { chunkKey } from '../world/chunk';
import type { ChunkMeshData, MeshBuffers } from '../world/meshing/mesher';
import type { ChunkMaterials } from './materials';

type Pass = 'opaque' | 'cutout' | 'translucent';
const PASSES: readonly Pass[] = ['opaque', 'cutout', 'translucent'];

export class ChunkMeshes {
  /** At most three meshes (one per pass) per chunk. */
  private readonly meshes = new Map<string, THREE.Mesh[]>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly materials: ChunkMaterials,
  ) {}

  get chunkCount(): number {
    return this.meshes.size;
  }

  /** Replaces the meshes of a chunk with new data. */
  set(cx: number, cz: number, data: ChunkMeshData): void {
    this.remove(cx, cz);
    const list: THREE.Mesh[] = [];
    for (const pass of PASSES) {
      const buffers = data[pass];
      if (buffers.indices.length === 0) continue;
      const mesh = new THREE.Mesh(createGeometry(buffers), this.materials[pass]);
      mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      // Water is drawn after everything else so what lies behind it is already there.
      if (pass === 'translucent') mesh.renderOrder = 1;
      this.scene.add(mesh);
      list.push(mesh);
    }
    this.meshes.set(chunkKey(cx, cz), list);
  }

  remove(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const list = this.meshes.get(key);
    if (!list) return;
    for (const mesh of list) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.delete(key);
  }

  dispose(): void {
    for (const list of this.meshes.values()) {
      for (const mesh of list) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
      }
    }
    this.meshes.clear();
  }
}

function createGeometry(buffers: MeshBuffers): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(buffers.uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 3));
  const vertexCount = buffers.positions.length / 3;
  // 16-bit indices halve the index memory for the many small chunks.
  const indices = vertexCount <= 65535 ? new Uint16Array(buffers.indices) : buffers.indices;
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}
