"""Standard static-asset pipeline: high/low build -> cull -> UV -> bake -> fx -> save -> export."""
import bpy

import lib_core as C
from lib_bake import bake, cull_hidden, unwrap
from lib_export import export_asset


def run_asset(aid, mats, body, detail=None, fx=None, res=1024, extrusion=0.015, ray=0.04, libs=(), angle=66,
              cull=True, drop_bottom=True, margin=0.006, extra_low=None, emissive_strength=4.0):
    """body(hi, m) -> parts (shared silhouette); detail(m) -> high-only parts; fx(m) -> unbaked MFX_/MT_ parts.
    extra_low(m) -> list of already-final low objects (e.g. MT_ tiling meshes with their own UVs)."""
    high = C.join(body(True, mats) + (detail(mats) if detail else []), f"{aid}_high")
    low = C.join(body(False, mats), f"{aid}_low")
    C.log(f"{aid}: high {C.tris(high)} tris, low {C.tris(low)} tris")
    if cull:
        cull_hidden(low, drop_bottom=drop_bottom)
    unwrap(low, angle=angle, margin=margin)
    paths = bake(aid, low, [high], res=res, extrusion=extrusion, ray=ray, libs_used=libs,
                 emissive_strength=emissive_strength)
    out = [low]
    if fx:
        fxo = C.join(fx(mats), f"{aid}_low_fx")
        if not fxo.data.uv_layers:
            unwrap(fxo, angle=66)
        out.append(fxo)
    if extra_low:
        out += extra_low(mats)
    high.hide_set(True)
    high.hide_render = True
    C.save_blend(aid)
    export_asset(aid, out, textures=paths.values())
    print("BUILD_DONE", aid)
    return out




