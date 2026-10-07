// 描画バックエンドの差を吸収する計測用ヘルパー（M0-5）。
import type { WebGPURenderer } from 'three/webgpu';

interface BackendInternals {
  isWebGPUBackend?: boolean;
  device?: GPUDevice & { adapterInfo?: GPUAdapterInfo };
  gl?: WebGL2RenderingContext;
}

const internals = (r: WebGPURenderer) => r.backend as unknown as BackendInternals;

export function backendName(r: WebGPURenderer): 'webgpu' | 'webgl2' {
  return internals(r).isWebGPUBackend ? 'webgpu' : 'webgl2';
}

export function gpuName(r: WebGPURenderer): string {
  const { device, gl } = internals(r);
  if (device) {
    const info = device.adapterInfo;
    return info ? info.description || `${info.vendor} ${info.architecture}` : 'unknown';
  }
  const ext = gl!.getExtension('WEBGL_debug_renderer_info');
  return String(gl!.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl!.RENDERER));
}

/** 送信済みの描画命令がGPUで完了するまで待つ。 */
export async function gpuDone(r: WebGPURenderer): Promise<void> {
  const { device, gl } = internals(r);
  if (device) return device.queue.onSubmittedWorkDone();
  gl!.readPixels(0, 0, 1, 1, gl!.RGBA, gl!.UNSIGNED_BYTE, new Uint8Array(4));
}

/**
 * setAnimationLoop外で1フレーム描くとき、ループと同じくフレーム番号を進める。
 * 進めないとPassNodeなど「1フレーム1回」のノードが再描画されない（three r186 Animation.start）。
 */
export function beginFrame(r: WebGPURenderer): void {
  r.info.reset();
  (r as unknown as { _nodes: { nodeFrame: { update(): void } } })._nodes.nodeFrame.update();
}
