"""Read existing textures and resize/save generated bake maps (no image generation)."""
from pathlib import Path

import bpy
import numpy as np


def load_np(path, colorspace="sRGB"):
    img = bpy.data.images.load(str(path))
    img.colorspace_settings.name = colorspace
    w, h = img.size
    px = np.empty(w * h * img.channels, dtype=np.float32)
    img.pixels.foreach_get(px)
    arr = px.reshape(h, w, img.channels)
    if img.channels == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1), np.float32)], 2)
    bpy.data.images.remove(img)
    return arr


def save_np(arr, path, colorspace="sRGB"):
    """Write PNG. Returns the reloaded image datablock (safe to use in materials)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    h, w = arr.shape[:2]
    if arr.ndim == 2:
        arr = np.dstack([arr, arr, arr, np.ones_like(arr)])
    img = bpy.data.images.new(path.stem + "_tmp", w, h, alpha=True, float_buffer=False)
    img.pixels.foreach_set(np.clip(arr, 0, 1).astype(np.float32).ravel())
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    out = bpy.data.images.load(str(path), check_existing=False)
    out.colorspace_settings.name = colorspace
    return out


def resize(arr, nh, nw):
    h, w = arr.shape[:2]
    ys = (np.arange(nh) + 0.5) * h / nh - 0.5
    xs = (np.arange(nw) + 0.5) * w / nw - 0.5
    y0 = np.clip(np.floor(ys).astype(int), 0, h - 1)
    x0 = np.clip(np.floor(xs).astype(int), 0, w - 1)
    y1, x1 = np.clip(y0 + 1, 0, h - 1), np.clip(x0 + 1, 0, w - 1)
    fy = np.clip(ys - y0, 0, 1)[:, None, None]
    fx = np.clip(xs - x0, 0, 1)[None, :, None]
    a = arr[y0][:, x0] * (1 - fx) + arr[y0][:, x1] * fx
    b = arr[y1][:, x0] * (1 - fx) + arr[y1][:, x1] * fx
    return (a * (1 - fy) + b * fy).astype(np.float32)



