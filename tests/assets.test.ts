// M0-1 / M0-2：配信用の派生素材（docs/assets.md）が契約どおりに生成されているか。
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { assetVersions } from '../scripts/asset-versions';

const MAX_BYTES = 25 * 1024 * 1024;
const dir = new URL('../public/assets/', import.meta.url);

describe.each(['lcd_0_calm_mask', 'lcd_1_panic_mask', 'lcd_2_rage_mask'])('%s', (name) => {
  const file = new URL(`${name}.webp`, dir);

  it('is a versioned WebP face mask with separate face and crack channels', async () => {
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeLessThanOrEqual(MAX_BYTES);
    expect(assetVersions(fileURLToPath(dir))[name]).toMatch(/^[0-9a-f]{12}$/);
    const metadata = await sharp(readFileSync(file)).metadata();
    expect(metadata.format).toBe('webp');
    expect([metadata.width, metadata.height]).toEqual([48, 30]);
    const { data, info } = await sharp(readFileSync(file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const red = [], green = [], blue = [];
    for (let i = 0; i < data.length; i += info.channels) {
      red.push(data[i]); green.push(data[i + 1]); blue.push(data[i + 2]);
    }
    expect([...new Set(red)].sort((a, b) => a - b)).toEqual([0, 255]);
    expect([...new Set(green)].sort((a, b) => a - b)).toEqual(name.includes('rage') ? [0, 255] : [0]);
    expect([...new Set(blue)]).toEqual([0]);
  });
});

interface GltfJson {
  nodes?: { name?: string; translation?: number[] }[];
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

  it('stage is enlarged per decision 0006 (cage at x=±10.5 m, z=±18 m with 3 m modules)', () => {
    const json = readGlbJson(new URL('stage.glb', dir));
    const cage = (json.nodes ?? []).filter((n) => /^cage_perimeter__(module|gate|corner)_\d+$/.test(n.name ?? ''));
    const xs = cage.map((n) => Math.abs(n.translation?.[0] ?? 0));
    const zs = cage.map((n) => Math.abs(n.translation?.[2] ?? 0));
    expect(Math.max(...xs)).toBeCloseTo(10.5, 3);
    expect(Math.max(...zs)).toBeCloseTo(18, 3);
    expect(cage.length).toBe(42); // 短辺7×2＋長辺12×2＋角4
  });
});
