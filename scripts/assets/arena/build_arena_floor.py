"""arena_floor: 22 x 39 m steel deck (two 13x15.6 courts + margins), tiling MT_ materials, court markings, emissive center line,
drain grates, raised deck edge. Pivot = court center on the floor (z=0)."""
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bmesh  # noqa: E402

import lib_core as C  # noqa: E402
import lib_mat as M  # noqa: E402
from lib_static import finish, quad_strip  # noqa: E402
from lib_std import neon  # noqa: E402

AID = "arena_floor"
FX, FY = 11.0, 19.5     # half extents of the deck
CX, CY = 6.5, 15.6     # court half extents
LW = 0.1               # line width
LZ = 0.003


def deck(m):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=22, y_segments=39, size=1.0)
    bmesh.ops.scale(bm, vec=(FX, FY, 1), verts=bm.verts)
    ob = C.obj_from_bm(bm, f"{AID}_low_deck", [m["plates"]])
    uv = ob.data.uv_layers.new(name="UVMap")
    for poly in ob.data.polygons:
        for li in poly.loop_indices:
            v = ob.data.vertices[ob.data.loops[li].vertex_index].co
            uv.data[li].uv = (v.x / 3.0, v.y / 3.0)  # one plate tile = 3 m
    return ob


def edge(m):
    """Raised steel deck edge / curb around the whole floor (MT painted metal)."""
    parts = []
    for (x, y, sx, sy) in ((0, -FY - 0.15, 2 * FX + 0.6, 0.3), (0, FY + 0.15, 2 * FX + 0.6, 0.3),
                           (-FX - 0.15, 0, 0.3, 2 * FY), (FX + 0.15, 0, 0.3, 2 * FY)):
        parts.append(C.box("curb", (sx, sy, 0.18), (x, y, 0.09), mat=m["curb"], bevel=0.02, segs=1))
    ob = C.join(parts, f"{AID}_low_curb")
    from lib_bake import cube_uv
    cube_uv(ob, size=1.0)
    return ob


def ring(name, cx, cy, r, mat, segs=64):
    bm = bmesh.new()
    inner, outer = [], []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        inner.append(bm.verts.new((cx + math.cos(a) * (r - LW / 2), cy + math.sin(a) * (r - LW / 2), LZ)))
        outer.append(bm.verts.new((cx + math.cos(a) * (r + LW / 2), cy + math.sin(a) * (r + LW / 2), LZ)))
    for i in range(segs):
        j = (i + 1) % segs
        bm.faces.new((inner[i], outer[i], outer[j], inner[j]))
    ob = C.obj_from_bm(bm, name, [mat])
    uv = ob.data.uv_layers.new(name="UVMap")
    circ = 2 * math.pi * r
    for poly in ob.data.polygons:
        for li in poly.loop_indices:
            vi = ob.data.loops[li].vertex_index
            idx, is_outer = vi // 2, vi % 2 == 1
            ang = idx / segs
            uv.data[li].uv = (ang * circ, 0.62 if is_outer else 0.38)
    return ob


def lines(m):
    L = []
    mat = m["line"]
    v = (0.36, 0.64)
    x, y = CX - LW / 2, CY - LW / 2
    L.append(quad_strip("l", (-CX, -y), (CX, -y), LW, mat, LZ, 1.0, v))
    L.append(quad_strip("l", (-CX, y), (CX, y), LW, mat, LZ, 1.0, v))
    L.append(quad_strip("l", (-x, -CY), (-x, CY), LW, mat, LZ, 1.0, v))
    L.append(quad_strip("l", (x, -CY), (x, CY), LW, mat, LZ, 1.0, v))
    for y in (-5.2, 5.2, -10.4, 10.4):  # attack / throw lines
        L.append(quad_strip("l", (-CX, y), (CX, y), LW * 0.7, mat, LZ, 1.0, v))
    L.append(ring("ring", 0, -7.8, 1.95, mat))
    L.append(ring("ring", 0, 7.8, 1.95, mat))
    ob = C.join(L, f"{AID}_low_lines")
    return ob


def grates(m):
    G = []
    for x in (-8.5, 8.5):
        for y in (-15.6, -7.8, 0, 7.8, 15.6):
            G.append(quad_strip("g", (x, y - 0.5), (x, y + 0.5), 0.6, m["grate"], LZ * 2, 0.5, (0.0, 1.2)))
    return C.join(G, f"{AID}_low_grates")


def centerline(m):
    return C.join([quad_strip("c", (-CX - 0.3, 0), (CX + 0.3, 0), 0.12, m["glow"], LZ * 3, 1.0, (0, 1))], f"{AID}_low_centerline")


def main():
    C.reset()
    m = {
        "plates": M.mt("MT_floor_plates", "floor_plates"),
        "line": M.mt("MT_line_paint", "line_paint"),
        "grate": M.mt("MT_grate", "grate_metal", alpha=True),
        "curb": M.mt("MT_hazard_paint", "hazard_paint"),
        "glow": neon("magenta", 6.0),
    }
    objs = [deck(m), edge(m), lines(m), grates(m), centerline(m)]
    finish(AID, objs, libs=["floor_plates", "line_paint", "grate_metal", "hazard_paint"])


main()
