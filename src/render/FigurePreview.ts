// The preview of "Your player" (Phase 6 part D): the own figure in its look, walking on the
// spot and turning once every 8 s, on a small WebGL canvas of its own. Without WebGL it
// does not exist and the section shows the head icon instead.
import * as THREE from 'three';
import { PLAYER_HEIGHT, WALK_SPEED } from '../game/config';
import { FigureMotion, type MotionInput, createAngles } from '../player/figureMotion';
import {
  createFigureGeometry,
  createFigureMaterial,
  createFigureTexture,
  noFog,
  setFigureAngles,
  setFigureLook,
} from './figureModel';

/** One turn of the figure takes this long. */
const TURN_MS = 8_000;
/** At most this many pictures per second. */
const FRAME_GAP_MS = 1000 / 30 - 1;

export class FigurePreview {
  readonly canvas: HTMLCanvasElement;
  /** Pictures drawn so far. */
  frames = 0;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly geometry: THREE.BufferGeometry;
  private readonly texture: THREE.DataTexture;
  private readonly material: THREE.ShaderMaterial;
  private readonly mesh: THREE.Mesh;
  private readonly motion = new FigureMotion();
  private readonly angles = createAngles();
  private readonly input: MotionInput = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    nowMs: 0,
    fly: false,
    busy: false,
    edits: 0,
    snaps: 0,
  };
  private running = false;
  private raf = 0;
  private startMs = -1;
  private lastDrawMs = -Infinity;
  private lastStepMs = 0;

  /**
   * A preview on a new canvas, or null if this browser gives it no WebGL. The context is
   * asked for first, so a failure logs nothing.
   */
  static create(width: number, height: number, look: number): FigurePreview | null {
    const canvas = document.createElement('canvas');
    let context: WebGL2RenderingContext | null;
    try {
      context = canvas.getContext('webgl2', { alpha: true, antialias: false });
    } catch {
      context = null;
    }
    if (!context) return null;
    try {
      return new FigurePreview(canvas, context, width, height, look);
    } catch {
      return null;
    }
  }

  private constructor(
    canvas: HTMLCanvasElement,
    context: WebGL2RenderingContext,
    width: number,
    height: number,
    look: number,
  ) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(0x000000, 0);
    this.camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 20);
    this.camera.position.set(0, PLAYER_HEIGHT * 0.62, 4.4);
    this.camera.lookAt(0, PLAYER_HEIGHT * 0.5, 0);
    this.geometry = createFigureGeometry();
    this.texture = createFigureTexture();
    // Lit evenly: full light, no fog; the accent of the first slot.
    this.material = createFigureMaterial(this.texture, noFog());
    setFigureLook(this.material, look, 0);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);
  }

  setLook(look: number): void {
    setFigureLook(this.material, look, 0);
    // A paused preview shows the new look at once.
    if (!this.running) this.draw(this.lastStepMs);
  }

  /** Draws while on (the section is in view), at most 30 pictures a second. */
  setRunning(on: boolean): void {
    if (on === this.running) return;
    this.running = on;
    if (on) this.raf = requestAnimationFrame((t) => this.tick(t));
    else cancelAnimationFrame(this.raf);
  }

  dispose(): void {
    this.setRunning(false);
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.renderer.dispose();
    // Gives the context back at once instead of when the canvas is collected.
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  private tick(nowMs: number): void {
    if (!this.running) return;
    this.raf = requestAnimationFrame((t) => this.tick(t));
    if (nowMs - this.lastDrawMs < FRAME_GAP_MS) return;
    this.lastDrawMs = nowMs;
    if (this.startMs < 0) this.startMs = nowMs;
    this.draw(nowMs - this.startMs);
  }

  /** One picture at `t` ms after the start: the figure walks towards where it faces. */
  private draw(t: number): void {
    const dt = Math.max(0, t - this.lastStepMs);
    this.lastStepMs = t;
    const yaw = (-(t % TURN_MS) / TURN_MS) * Math.PI * 2;
    const step = (WALK_SPEED * dt) / 1000;
    const input = this.input;
    input.x += -Math.sin(yaw) * step;
    input.z += -Math.cos(yaw) * step;
    input.yaw = yaw;
    input.nowMs = t;
    this.motion.step(input, this.angles);
    // Walking on the spot: the figure stays at the origin.
    this.mesh.rotation.y = this.angles.bodyYaw;
    setFigureAngles(this.material, this.angles);
    this.renderer.render(this.scene, this.camera);
    this.frames++;
  }
}
