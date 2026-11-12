// Renderer: owns the Three.js renderer, scene, camera and everything drawn in the world.
import * as THREE from 'three';
import { CHUNK_SIZE, FOG_START_FACTOR, FOV_DEFAULT, PLAYER_EYE_HEIGHT } from '../game/config';
import type { ChunkMeshData } from '../world/meshing/mesher';
import { ChunkMeshes } from './ChunkMeshes';
import { type ChunkMaterials, createChunkMaterials } from './materials';
import { Sky } from './Sky';
import { type Atlas, buildAtlas } from './textures/atlas';

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
}

export interface CameraPose {
  x: number;
  /** Feet height; the camera sits at eye height above it. */
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface RendererOptions {
  /** Test mode: keep the drawing buffer so screenshots and pixel reads are reliable. */
  preserveDrawingBuffer: boolean;
  /** Fixed pixel ratio, or null to follow the device (capped at 2). */
  pixelRatio: number | null;
}

/** True if the browser can create a WebGL2 context. */
export function isWebGL2Available(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly atlas: Atlas;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly webgl: THREE.WebGLRenderer;
  private readonly materials: ChunkMaterials;
  private readonly chunks: ChunkMeshes;
  private readonly sky: Sky;
  private readonly stats: RenderStats = { drawCalls: 0, triangles: 0, geometries: 0 };
  private renderDistance = 8;

  constructor(canvas: HTMLCanvasElement, options: RendererOptions) {
    this.canvas = canvas;
    this.webgl = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      preserveDrawingBuffer: options.preserveDrawingBuffer,
      powerPreference: 'high-performance',
    });
    this.webgl.setPixelRatio(options.pixelRatio ?? Math.min(window.devicePixelRatio, 2));
    this.camera = new THREE.PerspectiveCamera(FOV_DEFAULT, 16 / 9, 0.1, 2000);
    this.camera.rotation.order = 'YXZ';
    this.atlas = buildAtlas();
    this.materials = createChunkMaterials(this.atlas);
    this.chunks = new ChunkMeshes(this.scene, this.materials);
    this.sky = new Sky(this.scene);
    this.materials.uniforms.uFogColor.value.copy(this.sky.horizon);
    this.setRenderDistance(this.renderDistance);
  }

  setSize(width: number, height: number): void {
    this.webgl.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setFov(fov: number): void {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  get fov(): number {
    return this.camera.fov;
  }

  /** Fog hides the edge of the loaded area: it starts at 60 % of the distance. */
  setRenderDistance(chunks: number): void {
    this.renderDistance = chunks;
    const far = chunks * CHUNK_SIZE;
    this.materials.uniforms.uFogNear.value = far * FOG_START_FACTOR;
    this.materials.uniforms.uFogFar.value = far;
  }

  setChunkMesh(cx: number, cz: number, data: ChunkMeshData): void {
    this.chunks.set(cx, cz, data);
  }

  removeChunkMesh(cx: number, cz: number): void {
    this.chunks.remove(cx, cz);
  }

  setCamera(pose: CameraPose): void {
    this.camera.position.set(pose.x, pose.y + PLAYER_EYE_HEIGHT, pose.z);
    this.camera.rotation.set(pose.pitch, pose.yaw, 0);
  }

  render(): void {
    this.sky.update(this.camera);
    this.webgl.render(this.scene, this.camera);
    const info = this.webgl.info;
    this.stats.drawCalls = info.render.calls;
    this.stats.triangles = info.render.triangles;
    this.stats.geometries = info.memory.geometries;
  }

  getStats(): RenderStats {
    return this.stats;
  }
}
