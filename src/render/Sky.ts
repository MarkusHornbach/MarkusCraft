// Sky: a gradient dome around the camera. Below the horizon it shows the fog colour, so
// the fogged edge of the loaded world blends into it.
import * as THREE from 'three';

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    vDirection = position;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
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

export class Sky {
  readonly horizon = new THREE.Color(0xbcd8f5);
  readonly zenith = new THREE.Color(0x4f8fe6);
  private readonly dome: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    const material = new THREE.ShaderMaterial({
      uniforms: { uHorizon: { value: this.horizon }, uZenith: { value: this.zenith } },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), material);
    // Drawn first, behind everything; it follows the camera so it never gets closer.
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);
  }

  /** Call once per frame before rendering. */
  update(camera: THREE.Camera): void {
    this.dome.position.copy(camera.position);
  }
}
