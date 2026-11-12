// Entry point (step-1 placeholder): renders one lit, textured cube to prove the pipeline.
import * as THREE from 'three';
import './ui/ui.css';

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7fb2ff);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0.7, 0.6, 0.9);
camera.lookAt(0, 0, 0);

const SIZE = 16;
const pixels = new Uint8Array(SIZE * SIZE * 4);
for (let i = 0; i < SIZE * SIZE; i++) {
  const x = i % SIZE;
  const y = Math.floor(i / SIZE);
  const v = 90 + ((x * 7 + y * 13) % 11) * 12;
  pixels.set([v, 160 + ((x ^ y) & 7) * 8, 70 + (x % 4) * 10, 255], i * 4);
}
const texture = new THREE.DataTexture(pixels, SIZE, SIZE);
texture.magFilter = THREE.NearestFilter;
texture.colorSpace = THREE.SRGBColorSpace;
texture.needsUpdate = true;

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1.5, 1.5, 1.5),
  new THREE.MeshLambertMaterial({ map: texture }),
);
scene.add(cube);
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(2, 4, 1);
scene.add(sun);

let frames = 0;
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
  frames++;
});

Object.assign(window, { __mc: { isReady: () => frames > 0 } });
