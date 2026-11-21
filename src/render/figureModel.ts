// The player figure on the GPU (Phase 6 part D): one geometry of six boxes whose limbs the
// vertex shader turns about their pivots, the atlas of every look, one material per figure.
import * as THREE from 'three';
import {
  FACE_SHADE_BOTTOM,
  FACE_SHADE_EAST_WEST,
  FACE_SHADE_NORTH_SOUTH,
  FACE_SHADE_TOP,
  FIGURE_ARM,
  FIGURE_BODY,
  FIGURE_HEAD,
  FIGURE_LEG,
  FIGURE_TEXELS_TALL,
  PLAYER_HEIGHT,
} from '../game/config';
import type { FigureAngles } from '../player/figureMotion';
import {
  FIGURE_ATLAS_SIZE,
  type FaceName,
  type FigureAtlas,
  type FigurePart,
  faceRect,
  lookOrigin,
  paintFigureAtlas,
} from './textures/figureTexture';

/** Blocks per figure texel. */
export const FIGURE_SCALE = PLAYER_HEIGHT / FIGURE_TEXELS_TALL;

/** The four colours of the player slots (host first): the belt and the name tag stripe. */
export const PLAYER_COLORS: readonly number[] = [0xd8553f, 0x3f86d8, 0x4fae4a, 0xe8b630];

/** Part indices in the geometry (attribute `aPart`). */
const PART_BODY = 0;
const PART_HEAD = 1;
const PART_LEFT_ARM = 2;
const PART_RIGHT_ARM = 3;
const PART_LEFT_LEG = 4;
const PART_RIGHT_LEG = 5;

/** The painted atlas, made once per page; textures are made from it per renderer. */
let atlasCache: FigureAtlas | null = null;
export function figureAtlas(): FigureAtlas {
  atlasCache ??= paintFigureAtlas();
  return atlasCache;
}

/**
 * The atlas as a texture: colours in sRGB; the accent is marked by alpha 128 (the painter's
 * texels are all opaque; the shader draws every texel opaque). Nearest filtering without
 * mipmaps: a figure is small and its texels are large.
 */
export function createFigureTexture(): THREE.DataTexture {
  const atlas = figureAtlas();
  const data = new Uint8Array(atlas.pixels.length);
  data.set(atlas.pixels);
  for (let i = 0; i < atlas.accent.length; i++) if (atlas.accent[i] === 1) data[i * 4 + 3] = 128;
  const texture = new THREE.DataTexture(data, atlas.size, atlas.size, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

type Vec3 = readonly [number, number, number];

/** The corners of a face as seen from outside (top left, top right, bottom right, bottom left). */
function corners(face: FaceName, lo: Vec3, hi: Vec3): Vec3[] {
  const [x0, y0, z0] = lo;
  const [x1, y1, z1] = hi;
  // Forward is −z, the figure's right +x: its front shows its right side on the left.
  switch (face) {
    case 'front':
      return [
        [x1, y1, z0],
        [x0, y1, z0],
        [x0, y0, z0],
        [x1, y0, z0],
      ];
    case 'back':
      return [
        [x0, y1, z1],
        [x1, y1, z1],
        [x1, y0, z1],
        [x0, y0, z1],
      ];
    case 'right':
      return [
        [x1, y1, z1],
        [x1, y1, z0],
        [x1, y0, z0],
        [x1, y0, z1],
      ];
    case 'left':
      return [
        [x0, y1, z0],
        [x0, y1, z1],
        [x0, y0, z1],
        [x0, y0, z0],
      ];
    case 'top':
      return [
        [x1, y1, z1],
        [x0, y1, z1],
        [x0, y1, z0],
        [x1, y1, z0],
      ];
    case 'bottom':
      return [
        [x1, y0, z0],
        [x0, y0, z0],
        [x0, y0, z1],
        [x1, y0, z1],
      ];
  }
}

const FACE_SHADES: Record<FaceName, number> = {
  front: FACE_SHADE_NORTH_SOUTH,
  back: FACE_SHADE_NORTH_SOUTH,
  right: FACE_SHADE_EAST_WEST,
  left: FACE_SHADE_EAST_WEST,
  top: FACE_SHADE_TOP,
  bottom: FACE_SHADE_BOTTOM,
};
const FACES: readonly FaceName[] = ['front', 'back', 'right', 'left', 'top', 'bottom'];

/**
 * The six boxes of the figure, its feet centre at the origin, facing −z. Positions in
 * blocks; `uv` in texels of a look's cell (the shader adds the look's place); `aPart` the
 * part, `aPivot` the point it turns about.
 */
export function createFigureGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const parts: number[] = [];
  const pivots: number[] = [];
  const indices: number[] = [];
  const s = FIGURE_SCALE;
  const legH = FIGURE_LEG[1];
  const bodyTop = legH + FIGURE_BODY[1];
  const box = (part: number, texture: FigurePart, lo: Vec3, hi: Vec3, pivot: Vec3): void => {
    for (const face of FACES) {
      const r = faceRect(texture, face);
      const base = positions.length / 3;
      const tex: [number, number][] = [
        [r.u, r.v],
        [r.u + r.w, r.v],
        [r.u + r.w, r.v + r.h],
        [r.u, r.v + r.h],
      ];
      corners(face, lo, hi).forEach((c, k) => {
        positions.push(c[0] * s, c[1] * s, c[2] * s);
        uvs.push(tex[k][0], tex[k][1]);
        colors.push(FACE_SHADES[face], 0, 0);
        parts.push(part);
        pivots.push(pivot[0] * s, pivot[1] * s, pivot[2] * s);
      });
      // Counter-clockwise from outside: (TL, BL, BR) and (TL, BR, TR).
      indices.push(base, base + 3, base + 2, base, base + 2, base + 1);
    }
  };
  const [legW, , legD] = FIGURE_LEG;
  const [bodyW, , bodyD] = FIGURE_BODY;
  const [armW, armH, armD] = FIGURE_ARM;
  const [headW, headH, headD] = FIGURE_HEAD;
  box(
    PART_BODY,
    'body',
    [-bodyW / 2, legH, -bodyD / 2],
    [bodyW / 2, bodyTop, bodyD / 2],
    [0, 0, 0],
  );
  box(
    PART_HEAD,
    'head',
    [-headW / 2, bodyTop, -headD / 2],
    [headW / 2, bodyTop + headH, headD / 2],
    [0, bodyTop, 0],
  );
  const shoulder = bodyTop - 1;
  for (const [part, side] of [
    [PART_RIGHT_ARM, 1],
    [PART_LEFT_ARM, -1],
  ] as const) {
    const inner = (side * bodyW) / 2;
    const outer = inner + side * armW;
    box(
      part,
      'arm',
      [Math.min(inner, outer), bodyTop - armH, -armD / 2],
      [Math.max(inner, outer), bodyTop, armD / 2],
      [(inner + outer) / 2, shoulder, 0],
    );
  }
  for (const [part, side] of [
    [PART_RIGHT_LEG, 1],
    [PART_LEFT_LEG, -1],
  ] as const) {
    const outer = side * legW;
    box(
      part,
      'leg',
      [Math.min(0, outer), 0, -legD / 2],
      [Math.max(0, outer), legH, legD / 2],
      [outer / 2, legH, 0],
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(parts, 1));
  geometry.setAttribute('aPivot', new THREE.Float32BufferAttribute(pivots, 3));
  geometry.setIndex(indices);
  // The limbs swing out of the boxes' bounds: a generous sphere keeps culling right.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, PLAYER_HEIGHT / 2, 0), 1.6);
  return geometry;
}

const VERTEX_SHADER = /* glsl */ `
  attribute float aPart;
  attribute vec3 aPivot;
  uniform vec4 uLimbs;
  uniform vec2 uHead;
  uniform vec2 uLook;
  varying vec2 vUv;
  varying float vShade;
  varying float vFogDepth;
  mat3 rotX(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
  }
  mat3 rotY(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
  }
  void main() {
    vec3 p = position - aPivot;
    if (aPart > 0.5 && aPart < 1.5) {
      p = rotY(uHead.x) * (rotX(uHead.y) * p);
    } else if (aPart > 1.5) {
      float a = aPart < 2.5 ? uLimbs.x : aPart < 3.5 ? uLimbs.y : aPart < 4.5 ? uLimbs.z : uLimbs.w;
      p = rotX(a) * p;
    }
    p += aPivot;
    vUv = (uv + uLook) / ${FIGURE_ATLAS_SIZE.toFixed(1)};
    vShade = color.r;
    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    vFogDepth = length(viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uAccent;
  uniform vec3 uLight;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec2 vUv;
  varying float vShade;
  varying float vFogDepth;
  void main() {
    vec4 texel = texture2D(uMap, vUv);
    vec3 albedo = texel.a < 0.75 ? texel.rgb * uAccent : texel.rgb;
    vec3 color = albedo * pow(vShade, 2.2) * uLight;
    float fog = clamp((vFogDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
    gl_FragColor = vec4(mix(color, uFogColor, fog), 1.0);
    #include <colorspace_fragment>
  }
`;

/** Fog of the figure: shared with the chunks in the world, none in the preview. */
export interface FigureFog {
  uFogColor: THREE.IUniform<THREE.Color>;
  uFogNear: THREE.IUniform<number>;
  uFogFar: THREE.IUniform<number>;
}

export function noFog(): FigureFog {
  return {
    uFogColor: { value: new THREE.Color(0, 0, 0) },
    uFogNear: { value: 1e6 },
    uFogFar: { value: 2e6 },
  };
}

/** The material of one figure: its look, slot colour, angles and light are uniforms. */
export function createFigureMaterial(texture: THREE.Texture, fog: FigureFog): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uLimbs: { value: new THREE.Vector4() },
      uHead: { value: new THREE.Vector2() },
      uLook: { value: new THREE.Vector2() },
      uAccent: { value: new THREE.Color(1, 1, 1) },
      uLight: { value: new THREE.Vector3(1, 1, 1) },
      uFogColor: fog.uFogColor,
      uFogNear: fog.uFogNear,
      uFogFar: fog.uFogFar,
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    vertexColors: true,
  });
}

/** Sets the look (its place in the atlas) and the slot colour of a figure's material. */
export function setFigureLook(material: THREE.ShaderMaterial, look: number, slot: number): void {
  const o = lookOrigin(look);
  (material.uniforms.uLook.value as THREE.Vector2).set(o.u, o.v);
  (material.uniforms.uAccent.value as THREE.Color).setHex(
    PLAYER_COLORS[slot % PLAYER_COLORS.length],
  );
}

/** Writes the angles of a frame into the material; the body's yaw is the mesh's rotation. */
export function setFigureAngles(material: THREE.ShaderMaterial, a: FigureAngles): void {
  (material.uniforms.uLimbs.value as THREE.Vector4).set(
    a.leftArm,
    a.rightArm,
    a.leftLeg,
    a.rightLeg,
  );
  (material.uniforms.uHead.value as THREE.Vector2).set(a.headYaw, a.headPitch);
}
