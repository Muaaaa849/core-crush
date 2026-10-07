// 原本から public/assets/ の配信用派生素材を作る（docs/assets.md）。
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const SRC = process.env.CORECRUSH_ASSET_SRC ?? 'D:/T3test';
const BLENDER = process.env.BLENDER ?? 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const OUT = root('public/assets');

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

async function optimize(src, out, edit = () => {}) {
  const doc = await io.read(src);
  edit(doc);
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp' }),
    meshopt({ encoder: MeshoptEncoder }),
  );
  await io.write(out, doc);
}

// 試合球は core_ball/output/core_ball.glb だけ。ステージ内の展示用コアとその発光ライトは除く。
function removeDisplayCores(doc) {
  const remove = (node) => {
    node.listChildren().forEach(remove);
    node.dispose();
  };
  doc.getRoot().listNodes()
    .filter((n) => !n.isDisposed() && n.getName().startsWith('core_ball'))
    .forEach(remove);
}

mkdirSync(OUT, { recursive: true });
mkdirSync(root('.cache'), { recursive: true });

const jobs = [
  ['stage.glb', async () => {
    for (const asset of ['arena_floor', 'plasma_fence', 'light_truss', 'arena_stage']) {
      execFileSync(BLENDER, ['-b', '--factory-startup', '--python-exit-code', '1',
        '--python', root(`scripts/assets/arena/build_${asset}.py`)], {
        stdio: 'inherit',
        env: { ...process.env, CORECRUSH_ASSET_SRC: SRC, PYTHONUTF8: '1' },
      });
    }
    await optimize(root('.cache/arena/export/arena_stage.glb'), `${OUT}/stage.glb`, removeDisplayCores);
  }],
  ['core_ball.glb', () => optimize(`${SRC}/core_ball/output/core_ball.glb`, `${OUT}/core_ball.glb`)],
  ['character.glb', async () => {
    const raw = root('.cache/character.glb');
    execFileSync(BLENDER, ['-b', '--factory-startup', '--python-exit-code', '1', '--python', root('scripts/assets/build_character.py'),
      '--', root('art/kenney-protagonists/files'), raw]);
    await optimize(raw, `${OUT}/character.glb`);
  }],
];

for (const [name, job] of jobs) {
  const started = performance.now();
  await job();
  const mib = statSync(`${OUT}/${name}`).size / 2 ** 20;
  console.log(`${name}: ${mib.toFixed(2)} MiB (${((performance.now() - started) / 1000).toFixed(1)} s)`);
}
