"""plasma_fence: center divider spanning the enlarged cage: two coil emitter pylons, rails, plasma curtain (MFX)."""
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import lib_core as C  # noqa: E402
import lib_mat as M  # noqa: E402
from lib_parts import bolt, screen_image, smooth_path, text_mesh, warn_sign  # noqa: E402
from lib_pipeline import run_asset  # noqa: E402
from lib_std import LIBS_STD, neon, std  # noqa: E402

AID = "plasma_fence"
PX = 10.15       # pylon x
CUR = (9.8, 0.24, 3.0)  # curtain half-width, bottom, top


def pylon(hi, m, sx):
    bs = 3 if hi else 1
    x = sx * PX
    p = [C.box("base", (1.2, 1.0, 0.08), (x, 0, 0.04), mat=m["dark"], bevel=0.012, segs=bs),
         C.box("lower", (0.72, 0.62, 1.55), (x, 0, 0.08 + 0.775), mat=m["hazard"], bevel=0.02, segs=bs),
         C.box("collar", (0.8, 0.7, 0.12), (x, 0, 1.69), mat=m["yellow"], bevel=0.012, segs=bs),
         C.cyl("core", 0.22, 1.25, (x, 0, 2.35), mat=m["dark"], segs=32 if hi else 12),
         C.box("cap", (0.74, 0.64, 0.42), (x, 0, 3.18), mat=m["paint"], bevel=0.02, segs=bs),
         C.box("capcollar", (0.8, 0.7, 0.1), (x, 0, 2.98), mat=m["yellow"], bevel=0.012, segs=bs),
         C.cyl("beaconbase", 0.11, 0.08, (x, 0, 3.43), mat=m["dark"], segs=16 if hi else 8)]
    for sy in (-1, 1):  # gussets
        p.append(C.box("gusset", (0.05, 0.25, 0.3), (x + sx * 0.0, sy * 0.42, 0.22), (sy * math.radians(20), 0, 0), mat=m["yellow"], bevel=0.006, segs=bs))
    for gx in (-1, 1):
        p.append(C.box("gusset", (0.25, 0.05, 0.3), (x + gx * 0.47, 0, 0.22), (0, gx * math.radians(-20), 0), mat=m["yellow"], bevel=0.006, segs=bs))
    for a in range(8 if hi else 6):  # coil cage bars
        ang = a * 2 * math.pi / (8 if hi else 6)
        p.append(C.box("bar", (0.03, 0.03, 1.25), (x + math.cos(ang) * 0.31, math.sin(ang) * 0.31, 2.35), (0, 0, ang), mat=m["steel"]))
    for sy in (-1, 1):  # cable runs down the outside
        path = smooth_path([(x + sx * 0.37, sy * 0.2, 3.1), (x + sx * 0.48, sy * 0.22, 2.4), (x + sx * 0.4, sy * 0.25, 1.4), (x + sx * 0.45, sy * 0.3, 0.3), (x + sx * 0.7, sy * 0.35, 0.05)], 20 if hi else 8)
        p.append(C.tube_along("cable", path, 0.035, mat=m["rubber"], segs=10 if hi else 6))
    p.append(C.box("slit", (0.06, 0.05, 0.6), (x - sx * 0.36, 0, 1.05), mat=m["dark"], bevel=0.006, segs=bs))
    return p


def body(hi, m):
    bs = 3 if hi else 1
    p = pylon(hi, m, -1) + pylon(hi, m, 1)
    p.append(C.box("toprail", (2 * PX - 0.7, 0.36, 0.3), (0, 0, 3.12), mat=m["yellow"], bevel=0.02, segs=bs))
    p.append(C.box("toprail_in", (2 * PX - 0.7, 0.2, 0.08), (0, 0, 2.96), mat=m["dark"], bevel=0.01, segs=bs))
    p.append(C.box("botrail", (2 * PX - 0.7, 0.36, 0.22), (0, 0, 0.11), mat=m["dark"], bevel=0.02, segs=bs))
    for x in [-9.0 + i * 2.0 for i in range(10)]:  # emitter nodes along rails
        p.append(C.box("node", (0.3, 0.42, 0.12), (x, 0, 2.94), mat=m["paint"], bevel=0.012, segs=bs))
        p.append(C.box("node", (0.3, 0.42, 0.1), (x, 0, 0.27), mat=m["paint"], bevel=0.012, segs=bs))
    return p


def detail(m):
    p = []
    for sx in (-1, 1):
        x = sx * PX
        p += warn_sign((x, -0.312, 0.95), "-y", 0.28, m)
        p += warn_sign((x, 0.312, 0.95), "y", 0.28, m)
        p.append(text_mesh("P-01" if sx < 0 else "P-02", 0.11, (x, -0.313, 0.55), (math.pi / 2, 0, 0), m["yellow"], extrude=0.002))
        for cx in (-0.5, 0.5):
            for cy in (-0.4, 0.4):
                p.append(bolt(Vector((x + cx, cy, 0.08)), (0, 0, 1), m["steel"], r=0.025))
    for x in [-9.5 + i * 0.5 for i in range(39)]:
        for y in (-0.182, 0.182):
            p.append(bolt(Vector((x, y, 3.2)), (0, 1 if y > 0 else -1, 0), m["steel"], r=0.014))
    p.append(C.box("hazstripe", (2 * PX - 0.9, 0.006, 0.16), (0, -0.183, 3.12), mat=m["hazard"]))
    p.append(C.box("hazstripe", (2 * PX - 0.9, 0.006, 0.16), (0, 0.183, 3.12), mat=m["hazard"]))
    return p


def curtain(m):
    hw, z0, z1 = CUR
    me = bpy.data.meshes.new("curtain")
    nx, nz = 23, 4
    verts, faces = [], []
    for i in range(nx + 1):
        for j in range(nz + 1):
            verts.append((-hw + 2 * hw * i / nx, 0, z0 + (z1 - z0) * j / nz))
    for i in range(nx):
        for j in range(nz):
            a = i * (nz + 1) + j
            faces.append((a, a + nz + 1, a + nz + 2, a + 1))
    me.from_pydata(verts, [], faces)
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = ((v.x + hw) / (z1 - z0), (v.z - z0) / (z1 - z0))
    ob = bpy.data.objects.new("curtain", me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(m["plasma"])
    return ob


def fx(m):
    parts = [curtain(m)]
    for sx in (-1, 1):
        x = sx * PX
        for k in range(4):
            parts.append(C.torus("coil", 0.245, 0.03, (x, 0, 1.9 + k * 0.3), mat=m["cyan"], seg=24, ring=6))
        parts.append(C.cyl("beacon", 0.08, 0.14, (x, 0, 3.54), mat=m["magenta"], segs=12, r2=0.06))
        parts.append(C.box("slitglow", (0.02, 0.03, 0.52), (x - sx * 0.39, 0, 1.05), mat=m["magenta"]))
    for z in (0.23, 2.9):
        for y in (-0.19, 0.19):
            parts.append(C.box("railneon", (2 * PX - 1.0, 0.012, 0.025), (0, y, z), mat=m["magenta"]))
    return parts


def main():
    C.reset()
    m = std()
    img = screen_image(C.ASSET_SOURCE / "textures" / AID / "src_plasma.png", C.ARENA / "textures" / AID / f"{AID}_curtain.png", 1024, 1024)
    m["plasma"] = M.mfx("MFX_plasma_curtain", (1, 1, 1), 1.0, img=img, alpha=0.3)
    m["cyan"] = neon("cyan", 12.0)
    m["magenta"] = neon("magenta", 14.0)
    run_asset(AID, m, body, detail=detail, fx=fx, res=2048, extrusion=0.025, ray=0.06, libs=LIBS_STD, drop_bottom=True)


main()
