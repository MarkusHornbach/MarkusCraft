// Sky: gradient dome, sun, moon and stars around the camera, driven by the time of day.
// Below the horizon the dome shows the fog colour, so the fogged world edge blends in.
import * as THREE from 'three';
import { TEXTURE_SEED } from '../game/config';
import { deriveSeed, mulberry32 } from '../util/rng';
import {
  SUN_TILT,
  moonDirection,
  skyColors,
  starVisibility,
  sunDirection,
} from '../world/dayNight';
import { paintMoon, paintSun } from './textures/celestial';

const DOME_VERTEX = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DOME_FRAGMENT = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;

  varying vec3 vDirection;

  void main() {
    float height = normalize(vDirection).y;
    // The square root keeps the pale band near the horizon narrow.
    float t = sqrt(clamp(height, 0.0, 1.0));
    gl_FragColor = vec4(mix(uHorizon, uZenith, t), 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * Sun, moon and stars are transparent, so they are drawn after the terrain. They sit far
 * away (inside the far plane) and use the depth test, which lets the terrain hide them.
 */
const CELESTIAL_DISTANCE = 900;
const SUN_SIZE = 0.26 * CELESTIAL_DISTANCE;
const MOON_SIZE = 0.14 * CELESTIAL_DISTANCE;
const STAR_COUNT = 700;
const TEXTURE_SIZE = 64;

function celestialTexture(data: Uint8Array<ArrayBuffer>): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function celestialQuad(texture: THREE.Texture, size: number, order: number): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  return mesh;
}

export class Sky {
  /** Current horizon colour (linear); the fog uses the same colour. */
  readonly horizon = new THREE.Color();
  private readonly zenith = new THREE.Color();
  private readonly dome: THREE.Mesh;
  private readonly sun: THREE.Mesh;
  private readonly moon: THREE.Mesh;
  private readonly stars: THREE.Points;

  constructor(scene: THREE.Scene) {
    const domeMaterial = new THREE.ShaderMaterial({
      uniforms: { uHorizon: { value: this.horizon }, uZenith: { value: this.zenith } },
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), domeMaterial);
    // Drawn first, behind everything; it follows the camera so it never gets closer.
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Stars: seeded points on a sphere. They turn with the sky around the east-west axis.
    const rng = mulberry32(deriveSeed(TEXTURE_SEED, 1001));
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const y = rng() * 2 - 1;
      const angle = rng() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      positions[i * 3] = Math.cos(angle) * r * CELESTIAL_DISTANCE;
      positions[i * 3 + 1] = y * CELESTIAL_DISTANCE;
      positions[i * 3 + 2] = Math.sin(angle) * r * CELESTIAL_DISTANCE;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2,
        sizeAttenuation: false,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.sun = celestialQuad(celestialTexture(paintSun(TEXTURE_SIZE)), SUN_SIZE, -8);
    this.moon = celestialQuad(
      celestialTexture(paintMoon(TEXTURE_SIZE, mulberry32(deriveSeed(TEXTURE_SEED, 1002)))),
      MOON_SIZE,
      -8,
    );
    scene.add(this.sun, this.moon);
    this.update(new THREE.PerspectiveCamera(), 0.25);
  }

  /** Call once per frame before rendering. */
  update(camera: THREE.Camera, time: number): void {
    const colours = skyColors(time);
    this.horizon.setRGB(...colours.horizon, THREE.SRGBColorSpace);
    this.zenith.setRGB(...colours.zenith, THREE.SRGBColorSpace);
    this.dome.position.copy(camera.position);

    this.place(this.sun, camera, sunDirection(time));
    this.place(this.moon, camera, moonDirection(time));

    const visibility = starVisibility(time);
    this.stars.visible = visibility > 0;
    (this.stars.material as THREE.PointsMaterial).opacity = visibility;
    this.stars.position.copy(camera.position);
    // Same rotation as the sun's arc: around the tilted east-west axis.
    this.stars.rotation.set(SUN_TILT, 0, time * Math.PI * 2, 'XZY');
  }

  private place(body: THREE.Mesh, camera: THREE.Camera, direction: [number, number, number]): void {
    // Bodies below the horizon are hidden; they fade out just beneath it.
    const fade = THREE.MathUtils.smoothstep(direction[1], -0.14, -0.02);
    body.visible = fade > 0;
    (body.material as THREE.MeshBasicMaterial).opacity = fade;
    body.position.set(
      camera.position.x + direction[0] * CELESTIAL_DISTANCE,
      camera.position.y + direction[1] * CELESTIAL_DISTANCE,
      camera.position.z + direction[2] * CELESTIAL_DISTANCE,
    );
    body.lookAt(camera.position);
  }
}
