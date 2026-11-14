// Renderer: owns the Three.js renderer, scene, camera and everything drawn in the world.
import * as THREE from 'three';
import {
  CHUNK_SIZE,
  FOG_START_FACTOR,
  FOV_DEFAULT,
  PLAYER_EYE_HEIGHT,
  UNDERWATER_FOG_FAR,
  UNDERWATER_FOG_NEAR,
} from '../game/config';
import { daylightFactor } from '../world/dayNight';
import type { ChunkMeshData } from '../world/meshing/mesher';
import { BreakOverlay } from './BreakOverlay';
import { ChunkMeshes } from './ChunkMeshes';
import { type ChunkMaterials, createChunkMaterials } from './materials';
import { Sky } from './Sky';
import { type Atlas, buildAtlas } from './textures/atlas';

const HIGHLIGHT_INFLATE = 0.004;
/** Display-space colour of the fog under water at full daylight. */
const UNDERWATER_COLOR: [number, number, number] = [0.1, 0.3, 0.6];

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
  /** Device pixels per CSS pixel to render at. */
  pixelRatio: number;
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
  private readonly highlight: THREE.LineSegments;
  private readonly breakOverlay: BreakOverlay;

  constructor(canvas: HTMLCanvasElement, options: RendererOptions) {
    this.canvas = canvas;
    this.webgl = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      preserveDrawingBuffer: options.preserveDrawingBuffer,
      powerPreference: 'high-performance',
    });
    this.webgl.setPixelRatio(options.pixelRatio);
    this.camera = new THREE.PerspectiveCamera(FOV_DEFAULT, 16 / 9, 0.1, 2000);
    this.camera.rotation.order = 'YXZ';
    this.atlas = buildAtlas();
    this.materials = createChunkMaterials(this.atlas);
    this.chunks = new ChunkMeshes(this.scene, this.materials);
    this.sky = new Sky(this.scene);
    this.setRenderDistance(this.renderDistance);

    // Outline of the targeted block, slightly larger than the block to avoid z-fighting.
    const size = 1 + 2 * HIGHLIGHT_INFLATE;
    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.8 }),
    );
    this.highlight.visible = false;
    this.highlight.renderOrder = 2;
    this.scene.add(this.highlight);
    this.breakOverlay = new BreakOverlay(this.scene);
  }

  /** Shows cracks of the given stage on a block being broken; null hides them. */
  setBreakOverlay(block: { x: number; y: number; z: number } | null, stage = 0): void {
    this.breakOverlay.set(block, stage);
  }

  /** Shows the outline around a block, or hides it when `block` is null. */
  setHighlight(block: { x: number; y: number; z: number } | null): void {
    this.highlight.visible = block !== null;
    if (block) this.highlight.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
  }

  setSize(width: number, height: number): void {
    this.webgl.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Changes the pixel ratio; call `setSize` afterwards to resize the drawing buffer. */
  setPixelRatio(ratio: number): void {
    this.webgl.setPixelRatio(ratio);
  }

  get pixelRatio(): number {
    return this.webgl.getPixelRatio();
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
  }

  /**
   * Applies time of day and the underwater state: sky, fog and world brightness.
   * Under water the fog is short and blue instead of matching the horizon.
   */
  setEnvironment(time: number, underwater: boolean): void {
    this.sky.update(this.camera, time);
    const daylight = daylightFactor(time);
    const uniforms = this.materials.uniforms;
    uniforms.uDaylight.value = daylight;
    if (underwater) {
      uniforms.uFogColor.value
        .setRGB(...UNDERWATER_COLOR, THREE.SRGBColorSpace)
        .multiplyScalar(daylight ** 2.2);
      uniforms.uFogNear.value = UNDERWATER_FOG_NEAR;
      uniforms.uFogFar.value = UNDERWATER_FOG_FAR;
    } else {
      const far = this.renderDistance * CHUNK_SIZE;
      uniforms.uFogColor.value.copy(this.sky.horizon);
      uniforms.uFogNear.value = far * FOG_START_FACTOR;
      uniforms.uFogFar.value = far;
    }
  }

  setChunkMesh(cx: number, cz: number, data: ChunkMeshData): void {
    this.chunks.set(cx, cz, data);
  }

  removeChunkMesh(cx: number, cz: number): void {
    this.chunks.remove(cx, cz);
  }

  /** Removes all chunk meshes and frees their GPU buffers (another world is loaded). */
  clearChunkMeshes(): void {
    this.chunks.dispose();
  }

  setCamera(pose: CameraPose): void {
    this.camera.position.set(pose.x, pose.y + PLAYER_EYE_HEIGHT, pose.z);
    this.camera.rotation.set(pose.pitch, pose.yaw, 0);
  }

  render(): void {
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
