// The other players (Phase 6 part D): a blocky figure in its look, animated from the
// received movement, lit and fogged like the terrain, with a name tag above it. Two draw
// calls per figure: the figure (one mesh) and the tag.
import * as THREE from 'three';
import {
  LIGHT_GAMMA,
  LIGHT_MAX,
  PLAYER_EYE_HEIGHT,
  PLAYER_HEIGHT,
  TORCH_TINT,
} from '../game/config';
import {
  type FigureAngles,
  FigureMotion,
  type MotionInput,
  createAngles,
} from '../player/figureMotion';
import {
  PLAYER_COLORS,
  createFigureGeometry,
  createFigureMaterial,
  createFigureTexture,
  setFigureAngles,
  setFigureLook,
} from './figureModel';
import type { ChunkUniforms } from './materials';

export { PLAYER_COLORS };

/** Height of the name tag in blocks, and its gap above the head. */
const TAG_HEIGHT = 0.28;
const TAG_GAP = 0.25;
const TAG_FONT_PX = 40;
/** The stripe of the slot colour at the tag's left edge, in canvas pixels. */
const TAG_STRIPE_PX = 10;

/** A pose to draw. */
export interface FigurePose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface FigureInput {
  id: number;
  name: string;
  slot: number;
  look: number;
  pose: FigurePose | null;
  fly: boolean;
  busy: boolean;
  /** Block changes the player caused so far. */
  edits: number;
  /** Jumps of the drawn pose so far (teleports). */
  snaps: number;
}

/** Sky light and block light (0–15) at a point, or null where nothing is lit. */
export type LightAt = (x: number, y: number, z: number) => { sky: number; block: number } | null;

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** The name on a dark rounded plate with a stripe of the slot colour, drawn into a canvas. */
function nameTexture(name: string, slot: number): { texture: THREE.CanvasTexture; aspect: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `600 ${TAG_FONT_PX}px system-ui, sans-serif`;
  let width = 200;
  if (ctx) {
    ctx.font = font;
    width = Math.ceil(ctx.measureText(name).width);
  }
  const padX = 18;
  const height = TAG_FONT_PX + 20;
  canvas.width = width + padX * 2 + TAG_STRIPE_PX;
  canvas.height = height;
  if (ctx) {
    ctx.fillStyle = 'rgba(16, 20, 28, 0.7)';
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, 14);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = cssColor(PLAYER_COLORS[slot % PLAYER_COLORS.length]);
    ctx.fillRect(0, 0, TAG_STRIPE_PX, canvas.height);
    ctx.restore();
    ctx.font = font;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(name, (canvas.width + TAG_STRIPE_PX) / 2, height / 2 + 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return { texture, aspect: canvas.width / canvas.height };
}

interface Figure {
  name: string;
  slot: number;
  look: number;
  group: THREE.Group;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  tag: THREE.Sprite;
  tagTexture: THREE.CanvasTexture;
  /** How often the tag was drawn (a new name draws it again). */
  tagDraws: number;
  motion: FigureMotion;
  input: MotionInput;
  angles: FigureAngles;
}

export class RemotePlayers {
  private readonly scene: THREE.Scene;
  private readonly uniforms: ChunkUniforms;
  private readonly geometry: THREE.BufferGeometry;
  private readonly texture: THREE.DataTexture;
  private readonly figures = new Map<number, Figure>();

  constructor(scene: THREE.Scene, uniforms: ChunkUniforms) {
    this.scene = scene;
    this.uniforms = uniforms;
    this.geometry = createFigureGeometry();
    this.texture = createFigureTexture();
  }

  /** How many figures are drawn right now. */
  get drawn(): number {
    let count = 0;
    for (const figure of this.figures.values()) if (figure.group.visible) count++;
    return count;
  }

  /** The angles a figure was drawn with in the last frame, and its tag draws; or null. */
  state(id: number): { anim: FigureAngles; tagDraws: number } | null {
    const figure = this.figures.get(id);
    if (!figure || !figure.group.visible) return null;
    return { anim: { ...figure.angles }, tagDraws: figure.tagDraws };
  }

  /** Brings the figures in line with the players and their poses for this frame. */
  update(players: readonly FigureInput[], lightAt: LightAt, nowMs: number): void {
    const seen = new Set<number>();
    for (const player of players) {
      seen.add(player.id);
      let figure = this.figures.get(player.id);
      figure ??= this.create(player);
      if (figure.name !== player.name || figure.slot !== player.slot) this.retag(figure, player);
      if (figure.look !== player.look || figure.slot !== player.slot) {
        figure.look = player.look;
        figure.slot = player.slot;
        setFigureLook(figure.material, player.look, player.slot);
      }
      const pose = player.pose;
      figure.group.visible = pose !== null;
      if (!pose) continue;
      const input = figure.input;
      input.x = pose.x;
      input.y = pose.y;
      input.z = pose.z;
      input.yaw = pose.yaw;
      input.pitch = pose.pitch;
      input.nowMs = nowMs;
      input.fly = player.fly;
      input.busy = player.busy;
      input.edits = player.edits;
      input.snaps = player.snaps;
      figure.motion.step(input, figure.angles);
      figure.group.position.set(pose.x, pose.y, pose.z);
      figure.mesh.rotation.y = figure.angles.bodyYaw;
      setFigureAngles(figure.material, figure.angles);
      this.light(figure, lightAt(pose.x, pose.y + PLAYER_EYE_HEIGHT, pose.z));
    }
    for (const id of [...this.figures.keys()]) if (!seen.has(id)) this.remove(id);
  }

  /** Removes all figures (another world). */
  clear(): void {
    for (const id of [...this.figures.keys()]) this.remove(id);
  }

  /** The terrain's light rule (vertex shader of the chunks), worked out once per figure. */
  private light(figure: Figure, light: { sky: number; block: number } | null): void {
    const skyLevel = light ? light.sky : LIGHT_MAX;
    const blockLevel = light ? light.block : 0;
    const daylight = this.uniforms.uDaylight.value;
    const floor = this.uniforms.uMinLight.value;
    const sky = (skyLevel / LIGHT_MAX) ** LIGHT_GAMMA * daylight;
    const block = (blockLevel / LIGHT_MAX) ** LIGHT_GAMMA;
    const channel = (tint: number): number => Math.max(sky, block * tint, floor) ** 2.2;
    (figure.material.uniforms.uLight.value as THREE.Vector3).set(
      channel(TORCH_TINT[0]),
      channel(TORCH_TINT[1]),
      channel(TORCH_TINT[2]),
    );
  }

  private create(player: FigureInput): Figure {
    const material = createFigureMaterial(this.texture, {
      // Shared with the chunks: the figure fades into the same fog.
      uFogColor: this.uniforms.uFogColor,
      uFogNear: this.uniforms.uFogNear,
      uFogFar: this.uniforms.uFogFar,
    });
    setFigureLook(material, player.look, player.slot);
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(this.geometry, material);
    group.add(mesh);
    const { texture, aspect } = nameTexture(player.name, player.slot);
    const tag = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    tag.scale.set(TAG_HEIGHT * aspect, TAG_HEIGHT, 1);
    tag.position.y = PLAYER_HEIGHT + TAG_GAP + TAG_HEIGHT / 2;
    // Drawn after the terrain so its transparent corners blend over it.
    tag.renderOrder = 3;
    group.add(tag);
    this.scene.add(group);
    const figure: Figure = {
      name: player.name,
      slot: player.slot,
      look: player.look,
      group,
      mesh,
      material,
      tag,
      tagTexture: texture,
      tagDraws: 1,
      motion: new FigureMotion(),
      input: {
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        pitch: 0,
        nowMs: 0,
        fly: false,
        busy: false,
        edits: player.edits,
        snaps: player.snaps,
      },
      angles: createAngles(),
    };
    this.figures.set(player.id, figure);
    return figure;
  }

  /** A new name or slot: the tag is drawn again. */
  private retag(figure: Figure, player: FigureInput): void {
    const { texture, aspect } = nameTexture(player.name, player.slot);
    figure.tagTexture.dispose();
    figure.tagTexture = texture;
    figure.tag.material.map = texture;
    figure.tag.material.needsUpdate = true;
    figure.tag.scale.set(TAG_HEIGHT * aspect, TAG_HEIGHT, 1);
    figure.name = player.name;
    figure.tagDraws++;
  }

  private remove(id: number): void {
    const figure = this.figures.get(id);
    if (!figure) return;
    this.figures.delete(id);
    this.scene.remove(figure.group);
    figure.material.dispose();
    figure.tag.material.dispose();
    figure.tagTexture.dispose();
  }
}
