# CORE-CRUSH

違法サイバー・ケージファイトの FPS/TPS ドッジボール。中央を越えた瞬間から8秒で爆発するコアを、跳ね返しのラリーとフェイントで相手へ押し付け合う。1v1・1v2・2v2対応予定。

- 設計：[docs/design/README.md](docs/design/README.md)
- 現在地：[docs/progress.md](docs/progress.md)
- 素材：[docs/assets.md](docs/assets.md)

## 動かす

```
npm install
npm run dev
```

`?backend=webgl` を付けるとWebGL2で描画する（既定はWebGPU。非対応ブラウザでは自動でWebGL2）。`?stats` で計測表示を出す。

## クレジット

Characters by Kenney (CC0)。
