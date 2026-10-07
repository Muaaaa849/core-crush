"""light_truss: 9 m box truss section (two per row in the stage) (MT galvanized tubes) with 4 stadium floodlights + cable runs (baked MB_).
Pivot = top-center of the beam (hang it at the rig height in the stage)."""
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import lib_core as C  # noqa: E402
import lib_mat as M  # noqa: E402
from lib_bake import cube_uv  # noqa: E402
from lib_parts import bolt, smooth_path  # noqa: E402
from lib_pipeline import run_asset  # noqa: E402
from lib_std import LIBS_STD, neon, std  # noqa: E402

AID = "light_truss"
L, S = 9.0, 0.5  # length, section
LX = (-2.25, 2.25)
K = 1.45  # floodlight scale
TILT = math.radians(35)


def truss_tubes(hi, mat):
    seg = 16 if hi else 8
    p = []
    cs = [(-S / 2, -S / 2), (S / 2, -S / 2), (S / 2, S / 2), (-S / 2, S / 2)]  # (y, z) corners, z relative to -S/2
    for y, z in cs:
        p.append(C.tube_along("chord", [(-L / 2, y, z - S / 2), (L / 2, y, z - S / 2)], 0.025, mat=mat, segs=seg))
    bays = int(L / 0.5)
    for b in range(bays):
        x0, x1 = -L / 2 + b * 0.5, -L / 2 + (b + 1) * 0.5
        for (y0, z0), (y1, z1) in zip(cs, cs[1:] + cs[:1]):  # one diagonal per face per bay (zigzag)
            a = (x0, y0, z0 - S / 2) if b % 2 == 0 else (x0, y1, z1 - S / 2)
            c = (x1, y1, z1 - S / 2) if b % 2 == 0 else (x1, y0, z0 - S / 2)
            p.append(C.tube_along("diag", [a, c], 0.014, mat=mat, segs=12 if hi else 6))
    if hi:  # welded node collars where the diagonals meet the chords
        for b in range(bays + 1):
            for y, z in cs:
                p.append(C.cyl("node", 0.032, 0.05, (-L / 2 + b * 0.5, y, z - S / 2), (0, math.pi / 2, 0), mat=mat, segs=16))
    for x in (-L / 2, L / 2):  # end plates
        p.append(C.box("endplate", (0.02, S + 0.08, S + 0.08), (x, 0, -S / 2), mat=mat))
    return p


def main_cable():
    """Power feed draped in catenary loops under the truss between the lamps."""
    pts = [(-L / 2 + 0.2, S / 2 + 0.06, -0.12), (-3.4, S / 2 + 0.1, -S - 0.55), (-0.6, S / 2 + 0.06, -0.12),
           (0.6, S / 2 + 0.06, -0.12), (3.4, S / 2 + 0.1, -S - 0.55), (L / 2 - 0.2, S / 2 + 0.06, -0.12)]
    return smooth_path(pts, 24)


def flood(hi, m, x):
    """Stadium floodlight on a yoke: clamp + ballast box, housing, rim, 4 barn doors, rear fins."""
    bs = 3 if hi else 2
    seg = 48 if hi else 20
    p = [C.box("clamp", (0.18, S + 0.14, 0.12), (x, 0, -S - 0.06), mat=m["dark"], bevel=0.012, segs=bs),
         C.box("ballast", (0.42, 0.26, 0.2), (x + 0.36, 0, -S - 0.1), mat=m["paint"], bevel=0.015, segs=bs),
         C.box("yoke", (0.07, 0.62 * K, 0.07), (x, 0, -S - 0.2), mat=m["yellow"], bevel=0.01, segs=bs)]
    for sy in (-1, 1):
        p.append(C.box("yokearm", (0.07, 0.07, 0.5), (x, sy * 0.3 * K, -S - 0.43), mat=m["yellow"], bevel=0.01, segs=bs))
        p.append(C.cyl("pivot", 0.07, 0.06, (x, sy * 0.27 * K, -S - 0.6), (0, 0, 0), mat=m["steel"], segs=16 if hi else 8))
        p[-1].rotation_euler = (math.pi / 2, 0, 0)
    hz = -S - 0.6
    d = Vector((0, -math.sin(TILT), -math.cos(TILT)))  # beam direction
    c = Vector((x, 0, hz))
    prof = [(0.0, 0.2), (0.12, 0.2), (0.19, 0.17), (0.235, 0.1), (0.255, 0.0), (0.27, -0.12), (0.285, -0.18), (0.0, -0.18)]
    house = C.lathe("housing", [(r * K, z * K) for r, z in prof], segs=seg, mat=m["paint"])
    house.location, house.rotation_euler = c, (-TILT, 0, 0)
    p.append(house)
    p.append(C.torus("rim", 0.285 * K, 0.022, c + d * 0.18 * K, (-TILT, 0, 0), mat=m["yellow"], seg=seg, ring=8 if hi else 5))
    p.append(C.cyl("back", 0.18 * K, 0.16, c - d * 0.24 * K, (-TILT, 0, 0), mat=m["dark"], segs=24 if hi else 10))
    for k in range(6 if hi else 0):  # cooling fins on the back
        a = k * math.pi / 6
        from mathutils import Matrix as _M
        fin = C.box("fin", (0.012, 0.3 * K, 0.1), mat=m["dark"])
        fin.matrix_world = _M.Translation(c - d * 0.3 * K) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4() @ _M.Rotation(a, 4, "Z")
        p.append(fin)
    # barn doors: four flaps hinged on the rim, opened ~35 deg
    from mathutils import Matrix
    q = d.to_track_quat("Z", "Y")
    for k in range(4):
        ang = k * math.pi / 2
        hinge_local = Vector((math.cos(ang) * 0.29 * K, math.sin(ang) * 0.29 * K, 0))
        flap = C.box("barndoor", (0.4 * K, 0.012, 0.2 * K), mat=m["dark"], bevel=0.003 if hi else 0, segs=2 if hi else 1)
        rot = q.to_matrix().to_4x4() @ Matrix.Rotation(ang + math.pi / 2, 4, "Z") @ Matrix.Rotation(math.radians(-35), 4, "X")             @ Matrix.Translation((0, 0, 0.1 * K))
        flap.matrix_world = Matrix.Translation(c + d * 0.19 * K + q.to_matrix() @ hinge_local) @ rot
        p.append(flap)
    return p


def body(hi, m):
    p = []
    for x in LX:
        p += flood(hi, m, x)
    if hi:
        p.append(C.tube_along("cable", main_cable(), 0.04, mat=m["rubber"], segs=10))
    for x in LX:
        drop = smooth_path([(x + 0.5, S / 2 + 0.06, -0.12), (x + 0.6, S / 2 + 0.12, -S - 0.3), (x + 0.36, 0.14, -S - 0.2)], 10 if hi else 5)
        p.append(C.tube_along("drop", drop, 0.025, mat=m["rubber"], segs=8 if hi else 5))
    if hi:
        p += truss_tubes(True, m["steel"])
    return p


def detail(m):
    p = []
    for x in LX:
        for sy in (-1, 1):
            p.append(bolt(Vector((x, sy * (0.3 * K + 0.04), -S - 0.6)), (0, sy, 0), m["steel"], r=0.025))
    for x in [-L / 2 + 0.5 + i for i in range(9)]:
        p.append(C.box("tie", (0.03, 0.08, 0.08), (x, S / 2 + 0.05, -0.11), mat=m["orange"]))
    return p


def fx(m):
    parts = []
    for x in LX:
        hz = -S - 0.6
        lens = C.cyl("lens", 0.25 * K, 0.02, (x, -math.sin(TILT) * 0.165 * K, hz - math.cos(TILT) * 0.165 * K), (-TILT, 0, 0), mat=m["lamp"], segs=24)
        parts.append(lens)
    return parts


def extra_low(m):
    tubes = truss_tubes(False, m["truss"])
    ob = C.join(tubes, f"{AID}_low_truss")
    cube_uv(ob, size=0.5)
    cab = C.join([C.tube_along("cable", main_cable(), 0.04, mat=m["rubbermt"], segs=8)], f"{AID}_low_cable")
    cube_uv(cab, size=0.5)
    return [ob, cab]


def main():
    C.reset()
    m = std()
    m["truss"] = M.mt("MT_galvanized", "galvanized")
    m["rubbermt"] = M.mt("MT_rubber", "rubber")
    m["lamp"] = neon("white", 25.0)
    run_asset(AID, m, body, detail=detail, fx=fx, extra_low=extra_low, res=2048, extrusion=0.02, ray=0.05,
              libs=LIBS_STD, drop_bottom=False, cull=True)


main()
