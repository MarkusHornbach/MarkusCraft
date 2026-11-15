// Shared chunk materials: one shader for the opaque, cutout and translucent passes.
import * as THREE from 'three';
import {
  BRIGHTNESS_DEFAULT,
  LIGHT_GAMMA,
  MIN_LIGHT_BRIGHTEST,
  MIN_LIGHT_DARKEST,
  TORCH_TINT,
} from '../game/config';
import type { Atlas } from './textures/atlas';

/** The darkest a place gets on screen for a Brightness setting of 0..1. */
export function minLightFor(brightness: number): number {
  return MIN_LIGHT_DARKEST + (MIN_LIGHT_BRIGHTEST - MIN_LIGHT_DARKEST) * brightness;
}

export interface ChunkUniforms {
  [name: string]: THREE.IUniform;
  uMap: THREE.IUniform<THREE.Texture>;
  /** World brightness multiplier (1 = day). Applied in display space like the face shades. */
  uDaylight: THREE.IUniform<number>;
  /** The darkest a place gets (see `minLightFor`), in the same display space. */
  uMinLight: THREE.IUniform<number>;
  uFogColor: THREE.IUniform<THREE.Color>;
  uFogNear: THREE.IUniform<number>;
  uFogFar: THREE.IUniform<number>;
}

export interface ChunkMaterials {
  opaque: THREE.ShaderMaterial;
  cutout: THREE.ShaderMaterial;
  translucent: THREE.ShaderMaterial;
  uniforms: ChunkUniforms;
  dispose(): void;
}

// The light of a vertex is turned into a colour factor in the vertex shader, so a pixel
// costs what it did before there was light: one `pow` for the face shade. Between the
// vertices of a face the light is therefore blended as linear light, the shade (as
// before) as a perceptual value.
const VERTEX_SHADER = /* glsl */ `
  uniform float uDaylight;
  uniform float uMinLight;

  varying vec2 vUv;
  varying float vShade;
  varying vec3 vLight;
  varying float vFogDepth;

  void main() {
    vUv = uv;
    vShade = color.r;
    // Sky light counts as much as there is daylight; block light is warm and does not
    // care about the time of day. The brighter of the two lights a place, and no place
    // is darker than the Brightness setting allows. All of this is perceptual (0.5 looks
    // half as bright), like the face shades; the last step converts to linear light.
    float sky = pow(color.g, LIGHT_GAMMA) * uDaylight;
    vec3 lit = max(vec3(sky), pow(color.b, LIGHT_GAMMA) * TORCH_TINT);
    vLight = pow(max(lit, vec3(uMinLight)), vec3(2.2));
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = length(viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;

  varying vec2 vUv;
  varying float vShade;
  varying vec3 vLight;
  varying float vFogDepth;

  void main() {
    vec4 texel = texture2D(uMap, vUv);
    #ifdef CUTOUT
      if (texel.a < 0.4) discard;
    #endif
    // Shade values are meant perceptually (0.5 looks half as bright), the texture is
    // linear here, so the multiplier is converted to linear light.
    vec3 color = texel.rgb * (pow(vShade, 2.2) * vLight);
    float fog = clamp((vFogDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
    color = mix(color, uFogColor, fog);
    #ifdef TRANSLUCENT
      gl_FragColor = vec4(color, mix(texel.a, 1.0, fog));
    #else
      gl_FragColor = vec4(color, 1.0);
    #endif
    #include <colorspace_fragment>
  }
`;

/**
 * Uploads the atlas with its hand-built mip chain. Magnification is nearest (crisp
 * pixels); minification picks the nearest texel of blended mip levels, which cannot
 * bleed across tiles because every level was filtered per tile.
 */
export function createAtlasTexture(atlas: Atlas): THREE.DataTexture {
  const base = atlas.levels[0];
  const texture = new THREE.DataTexture(base.data, base.size, base.size, THREE.RGBAFormat);
  texture.mipmaps = atlas.levels.map((level) => ({
    data: level.data,
    width: level.size,
    height: level.size,
  }));
  texture.generateMipmaps = false;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createChunkMaterials(atlas: Atlas): ChunkMaterials {
  const texture = createAtlasTexture(atlas);
  const uniforms: ChunkUniforms = {
    uMap: { value: texture },
    uDaylight: { value: 1 },
    uMinLight: { value: minLightFor(BRIGHTNESS_DEFAULT) },
    uFogColor: { value: new THREE.Color(1, 1, 1) },
    uFogNear: { value: 10 },
    uFogFar: { value: 100 },
  };
  const base = {
    uniforms,
    defines: {
      LIGHT_GAMMA: LIGHT_GAMMA.toFixed(4),
      TORCH_TINT: `vec3(${TORCH_TINT.map((v) => v.toFixed(4)).join(', ')})`,
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    vertexColors: true,
  };
  const opaque = new THREE.ShaderMaterial(base);
  const cutout = new THREE.ShaderMaterial({ ...base, defines: { ...base.defines, CUTOUT: 1 } });
  const translucent = new THREE.ShaderMaterial({
    ...base,
    defines: { ...base.defines, TRANSLUCENT: 1 },
    transparent: true,
    depthWrite: false,
    // The water surface must be visible from below as well.
    side: THREE.DoubleSide,
  });
  // The three materials share one uniforms object so a single update reaches all.
  opaque.uniforms = uniforms;
  cutout.uniforms = uniforms;
  translucent.uniforms = uniforms;
  return {
    opaque,
    cutout,
    translucent,
    uniforms,
    dispose() {
      opaque.dispose();
      cutout.dispose();
      translucent.dispose();
      texture.dispose();
    },
  };
}
