// M0-1 / M0-2：配信用の派生素材（docs/assets.md）が契約どおりに生成されているか。
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MAX_BYTES = 25 * 1024 * 1024;
const dir = new URL('../public/assets/', import.meta.url);

interface GltfJson {
  nodes?: { name?: string }[];
  materials?: { name?: string; alphaMode?: string; pbrMetallicRoughness?: { baseColorTexture?: unknown } }[];
  animations?: { name?: string; samplers: { input: number }[] }[];
  accessors?: { max?: number[] }[];
  images?: { mimeType?: string }[];
  extensions?: { KHR_lights_punctual?: { lights: unknown[] } };
}

function readGlbJson(file: URL): GltfJson {
  const buf = readFileSync(file);
  expect(buf.toString('ascii', 0, 4)).toBe('glTF');
  const jsonLength = buf.readUInt32LE(12);
  return JSON.parse(buf.toString('utf8', 20, 20 + jsonLength)) as GltfJson;
}

describe.each(['stage.glb', 'core_ball.glb', 'character.glb'])('%s', (name) => {
  const file = new URL(name, dir);

  it('exists and is at most 25MiB', () => {
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeLessThanOrEqual(MAX_BYTES);
  });

  it('uses WebP textures only', () => {
    const mimeTypes = (readGlbJson(file).images ?? []).map((i) => i.mimeType);
    expect(mimeTypes.filter((m) => m !== 'image/webp')).toEqual([]);
  });
});

describe('asset contents', () => {
  it('core_ball keeps the LCD material', () => {
    const json = readGlbJson(new URL('core_ball.glb', dir));
    expect(json.materials?.map((m) => m.name)).toContain('M_LCD');
  });

  it('character has idle / run / jump animations', () => {
    const json = readGlbJson(new URL('character.glb', dir));
    expect(json.animations?.map((a) => a.name).sort()).toEqual(['idle', 'jump', 'run']);
  });

  it('character animations are motions, not a held pose', () => {
    const json = readGlbJson(new URL('character.glb', dir));
    for (const animation of json.animations ?? []) {
      const duration = Math.max(...animation.samplers.map((s) => json.accessors![s.input].max![0]));
      expect(duration, animation.name).toBeGreaterThan(0.3);
    }
  });

  it('character materials are opaque and textured with the skin', () => {
    const json = readGlbJson(new URL('character.glb', dir));
    for (const material of json.materials ?? []) {
      expect(material.alphaMode ?? 'OPAQUE').toBe('OPAQUE');
      expect(material.pbrMetallicRoughness?.baseColorTexture).toBeDefined();
    }
  });

  it('stage keeps its lights and has no display core in the court', () => {
    const json = readGlbJson(new URL('stage.glb', dir));
    expect(json.extensions?.KHR_lights_punctual?.lights.length ?? 0).toBeGreaterThan(0);
    expect((json.nodes ?? []).filter((n) => n.name?.startsWith('core_ball'))).toEqual([]);
  });
});
