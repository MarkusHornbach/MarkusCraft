// Reads what a performance test result says about the device: browser, GPU, screen.
// Shell code: everything here comes from browser APIs.
import type { BenchEnv } from '../bench/benchReport';
import { cutText } from '../bench/benchReport';

/** Name of the graphics chip as WebGL tells it, or "unknown". */
function gpuName(canvas: HTMLCanvasElement): string {
  try {
    const gl = canvas.getContext('webgl2');
    if (!gl) return 'unknown';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name: unknown = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    return typeof name === 'string' && name !== '' ? name : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** JavaScript heap in use in MB; only Chromium tells. */
export function heapMb(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  const used = memory?.usedJSHeapSize;
  return typeof used === 'number' && Number.isFinite(used) ? used / (1024 * 1024) : null;
}

/** The environment of a run, without the refresh rate (the run measures that). */
export function readBenchEnv(
  canvas: HTMLCanvasElement,
  pixelRatio: number,
  input: 'mouse' | 'touch',
  wake: boolean,
): Omit<BenchEnv, 'hz'> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency;
  const memory = nav.deviceMemory;
  const round2 = (value: number): number => Math.round(value * 100) / 100;
  return {
    ua: cutText(nav.userAgent),
    gpu: cutText(gpuName(canvas)),
    screenW: window.screen.width,
    screenH: window.screen.height,
    dpr: round2(window.devicePixelRatio),
    pixelRatio: round2(pixelRatio),
    canvasW: canvas.width,
    canvasH: canvas.height,
    input,
    cores: typeof cores === 'number' && cores > 0 ? cores : null,
    memory: typeof memory === 'number' && memory > 0 ? memory : null,
    wake,
  };
}
