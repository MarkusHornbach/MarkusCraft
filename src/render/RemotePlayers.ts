// The other players: a placeholder figure (body and head box) in the player's colour, lit
// and fogged like the terrain, with a name tag above it. Shapes and colours are code.
import * as THREE from 'three';
import {
  FACE_SHADE_BOTTOM,
  FACE_SHADE_EAST_WEST,
  FACE_SHADE_NORTH_SOUTH,
  FACE_SHADE_TOP,
  LIGHT_GAMMA,
  LIGHT_MAX,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TORCH_TINT,
} from '../game/config';
import type { ChunkUniforms } from './materials';

/** The four colours of the player slots (host first). */
export const PLAYER_COLORS: readonly number[] = [0xd8553f, 0x3f86d8, 0x4fae4a, 0xe8b630];

/** Height of the body; the head sits on it. */
const BODY_HEIGHT = 1.3;
const BODY_DEPTH = 0.4;
const HEAD_SIZE = PLAYER_HEIGHT - BODY_HEIGHT;
/** The side of the head that looks forward is drawn darker: it shows where the player looks. */
const FACE_SHADE = 0.42;
/** Height of the name tag in blocks, and its gap above the head. */
const TAG_HEIGHT = 0.28;
const TAG_GAP = 0.25;
const TAG_FONT_PX = 40;

/** A pose to draw, with the light at the figure's eyes. */
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
  pose: FigurePose | null;
}

/** Sky light and block light (0–15) at a point, or null where nothing is lit. */
export type LightAt = (x: number, y: number, z: number) => { sky: number; block: number } | null;

const VERTEX_SHADER = /* glsl */ `
  varying float vShade;
  varying float vFogDepth;
  void main() {
    vShade = color.r;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = length(viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uLight;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying float vShade;
  varying float vFogDepth;
  void main() {
    vec3 color = uColor * pow(vShade, 2.2) * uLight;
    float fog = clamp((vFogDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
    gl_FragColor = vec4(mix(color, uFogColor, fog), 1.0);
    #include <colorspace_fragment>
  }
`;

/** A box with a shade per face as vertex colour (red channel), like the terrain's faces. */
function shadedBox(w: number, h: number, d: number, front: number): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  // BoxGeometry's faces: +x, -x, +y, -y, +z, -z; four vertices each. Forward is -z.
  const shades = [
    FACE_SHADE_EAST_WEST,
    FACE_SHADE_EAST_WEST,
    FACE_SHADE_TOP,
    FACE_SHADE_BOTTOM,
    FACE_SHADE_NORTH_SOUTH,
    front,
  ];
  const colors = new Float32Array(24 * 3);
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < 4; v++) colors.set([shades[face], 0, 0], (face * 4 + v) * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** The name on a dark rounded plate, drawn into a canvas. */
function nameTexture(name: string): { texture: THREE.CanvasTexture; aspect: number } {
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
  canvas.width = width + padX * 2;
  canvas.height = height;
  if (ctx) {
    ctx.fillStyle = 'rgba(16, 20, 28, 0.7)';
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, 14);
    ctx.fill();
    ctx.font = font;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(name, canvas.width / 2, height / 2 + 1);
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
  group: THREE.Group;
  head: THREE.Mesh;
  material: THREE.ShaderMaterial;
  tag: THREE.Sprite;
  tagTexture: THREE.CanvasTexture;
}

export class RemotePlayers {
  private readonly scene: THREE.Scene;
  private readonly uniforms: ChunkUniforms;
  private readonly body: THREE.BoxGeometry;
  private readonly headGeometry: THREE.BoxGeometry;
  private readonly figures = new Map<number, Figure>();

  constructor(scene: THREE.Scene, uniforms: ChunkUniforms) {
    this.scene = scene;
    this.uniforms = uniforms;
    this.body = shadedBox(PLAYER_WIDTH, BODY_HEIGHT, BODY_DEPTH, FACE_SHADE_NORTH_SOUTH);
    this.body.translate(0, BODY_HEIGHT / 2, 0);
    this.headGeometry = shadedBox(HEAD_SIZE, HEAD_SIZE, HEAD_SIZE, FACE_SHADE);
    this.headGeometry.translate(0, HEAD_SIZE / 2, 0);
  }

  /** How many figures are drawn right now. */
  get drawn(): number {
    let count = 0;
    for (const figure of this.figures.values()) if (figure.group.visible) count++;
    return count;
  }

  /** Brings the figures in line with the players and their poses for this frame. */
  update(players: readonly FigureInput[], lightAt: LightAt): void {
    const seen = new Set<number>();
    for (const player of players) {
      seen.add(player.id);
      let figure = this.figures.get(player.id);
      if (figure && (figure.name !== player.name || figure.slot !== player.slot)) {
        this.remove(player.id);
        figure = undefined;
      }
      figure ??= this.create(player);
      const pose = player.pose;
      figure.group.visible = pose !== null;
      if (!pose) continue;
      figure.group.position.set(pose.x, pose.y, pose.z);
      figure.group.rotation.set(0, pose.yaw, 0);
      figure.head.rotation.set(pose.pitch, 0, 0);
      this.light(figure, lightAt(pose.x, pose.y + BODY_HEIGHT + HEAD_SIZE / 2, pose.z));
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
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(PLAYER_COLORS[player.slot % PLAYER_COLORS.length]) },
        uLight: { value: new THREE.Vector3(1, 1, 1) },
        // Shared with the chunks: the figure fades into the same fog.
        uFogColor: this.uniforms.uFogColor,
        uFogNear: this.uniforms.uFogNear,
        uFogFar: this.uniforms.uFogFar,
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      vertexColors: true,
    });
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    group.add(new THREE.Mesh(this.body, material));
    const head = new THREE.Mesh(this.headGeometry, material);
    head.position.y = BODY_HEIGHT;
    group.add(head);
    const { texture, aspect } = nameTexture(player.name);
    const tag = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    tag.scale.set(TAG_HEIGHT * aspect, TAG_HEIGHT, 1);
    tag.position.y = PLAYER_HEIGHT + TAG_GAP + TAG_HEIGHT / 2;
    // Drawn after the terrain so its transparent corners blend over it.
    tag.renderOrder = 3;
    group.add(tag);
    this.scene.add(group);
    const figure = {
      name: player.name,
      slot: player.slot,
      group,
      head,
      material,
      tag,
      tagTexture: texture,
    };
    this.figures.set(player.id, figure);
    return figure;
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
