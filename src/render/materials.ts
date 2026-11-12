// Shared chunk materials: one shader for the opaque, cutout and translucent passes.
import * as THREE from 'three';
import type { Atlas } from './textures/atlas';

export interface ChunkUniforms {
  [name: string]: THREE.IUniform;
  uMap: THREE.IUniform<THREE.Texture>;
  /** World brightness multiplier (1 = day). Applied in display space like the face shades. */
  uDaylight: THREE.IUniform<number>;
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

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying float vShade;
  varying float vFogDepth;

  void main() {
    vUv = uv;
    vShade = color.r;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = length(viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uDaylight;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;

  varying vec2 vUv;
  varying float vShade;
  varying float vFogDepth;

  void main() {
    vec4 texel = texture2D(uMap, vUv);
    #ifdef CUTOUT
      if (texel.a < 0.4) discard;
    #endif
    // Shade values are meant perceptually (0.5 looks half as bright), the texture is
    // linear here, so the multiplier is converted to linear light.
    float light = pow(vShade * uDaylight, 2.2);
    vec3 color = texel.rgb * light;
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
    uFogColor: { value: new THREE.Color(1, 1, 1) },
    uFogNear: { value: 10 },
    uFogFar: { value: 100 },
  };
  const base = {
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    vertexColors: true,
  };
  const opaque = new THREE.ShaderMaterial(base);
  const cutout = new THREE.ShaderMaterial({ ...base, defines: { CUTOUT: 1 } });
  const translucent = new THREE.ShaderMaterial({
    ...base,
    defines: { TRANSLUCENT: 1 },
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
