"""arena_stage: assemble the CORE-CRUSH arena from the exported asset GLBs.

Every asset GLB is imported once into a hidden library; placements are linked duplicates (shared mesh data) under an
Empty named <asset_id>__<n> so the stage GLB keeps one mesh per asset piece. Rigged assets are imported per placement.
Lights are POINT/SPOT/SUN only (glTF KHR_lights_punctual). Outputs arena/export/arena_stage.glb + source/arena_stage.blend.
Layout (GDD 2.1): two 13 x 15.6 m courts (y<0 player 1, y>0 player 2), plasma fence on y=0, cage 21 x 36 m,
light trusses at 8 m, odds boards hung over the fence, props in the margins / outside the cage, billboards and the
junk-city skyline beyond."""
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import lib_core as C  # noqa: E402
import lib_mat as M  # noqa: E402
from lib_bake import cube_uv  # noqa: E402
from lib_export import update_manifest  # noqa: E402

EXP = C.EXPORT
REGENERATED = {"arena_floor", "plasma_fence", "light_truss"}


def asset_glb(aid):
    directory = EXP if aid in REGENERATED else C.ASSET_SOURCE / "export"
    return directory / f"{aid}.glb"


SID = "arena_stage"
LIB = {}       # aid -> list of imported objects (hidden library)
COUNT = {}


def import_lib(aid):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(asset_glb(aid)))
    objs = [o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    LIB[aid] = objs
    return objs


def piece_objs(aid, piece=None):
    objs = [o for o in LIB[aid] if o.type == "MESH"]
    if piece is None:
        return objs, Vector()
    pre = f"{aid}_low_{piece}"
    sel = [o for o in objs if o.name == pre or o.name.startswith(pre + "_")]
    main = next(o for o in sel if o.name == pre)
    return sel, main.matrix_world.translation.copy()


def place(aid, loc, rz=0.0, piece=None, scale=1.0, rx=0.0, ry=0.0):
    """Linked-duplicate an asset (or one kit piece) under an Empty named after the asset id."""
    objs, pivot = piece_objs(aid, piece)
    n = COUNT.get(aid, 0)
    COUNT[aid] = n + 1
    root = bpy.data.objects.new(f"{aid}__{piece + '_' if piece else ''}{n:02d}", None)
    bpy.context.scene.collection.objects.link(root)
    root.location = loc
    root.rotation_euler = (rx, ry, rz)
    root.scale = (scale, scale, scale)
    for o in objs:
        d = o.copy()  # shares o.data
        d.name = f"{o.name}__{n:02d}"
        bpy.context.scene.collection.objects.link(d)
        d.parent = root
        d.matrix_parent_inverse = Matrix.Identity(4)
        d.matrix_basis = Matrix.Translation(-pivot) @ o.matrix_world
        d.hide_render = False
        d.hide_set(False)
    return root


def place_rig(aid, loc, rz=0.0):
    """Rigged assets: fresh import per placement, re-rooted under an Empty (keeps skin + actions)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(asset_glb(aid)))
    new = [o for o in bpy.data.objects if o not in before]
    n = COUNT.get(aid, 0)
    COUNT[aid] = n + 1
    root = bpy.data.objects.new(f"{aid}__{n:02d}", None)
    bpy.context.scene.collection.objects.link(root)
    root.location, root.rotation_euler = loc, (0, 0, rz)
    for o in list(new):
        if o.type == "MESH" and o.name.startswith("Icosphere"):  # importer bone-shape helper, not part of the asset
            new.remove(o)
            bpy.data.objects.remove(o, do_unlink=True)
    for o in new:
        if o.parent is None:
            o.parent = root
    return root


def hide_library():
    for objs in LIB.values():
        for o in objs:
            bpy.data.objects.remove(o, do_unlink=True)


def light(name, kind, loc, color, energy, rot=(0, 0, 0), size=0.2, spot=math.radians(60), blend=0.4):
    ld = bpy.data.lights.new(name, kind)
    ld.color = color
    ld.energy = energy
    if kind in ("POINT", "SPOT"):
        ld.shadow_soft_size = size
    if kind == "SPOT":
        ld.spot_size = spot
        ld.spot_blend = blend
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.location, ob.rotation_euler = loc, rot
    return ob


def aim(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return ob


def outer_ground():
    """Wet concrete apron around the deck (the venue floor beyond the arena), 300 x 300 m, tiling MT_."""
    mat = M.mt("MT_concrete", "concrete")
    ob = C.box("arena_floor_apron", (300, 300, 0.1), (0, 0, -0.08), mat=mat)
    cube_uv(ob, size=4.0)
    ob.data.name = "arena_floor_apron"
    return ob


# ------------------------------------------------------------------ layout

CAGE_X, CAGE_Y, MOD = 10.5, 18.0, 3.0


def build_layout():
    place("arena_floor", (0, 0, 0))
    outer_ground()
    place("plasma_fence", (0, 0, 0))
    # cage: 7 modules on the short sides (one is the gate), 12 on the long sides, corner posts
    for k in range(7):
        x0 = -CAGE_X + k * MOD
        place("cage_perimeter", (x0, -CAGE_Y, 0), 0.0, piece="gate" if k == 3 else "module")
        place("cage_perimeter", (-x0, CAGE_Y, 0), math.pi, piece="gate" if k == 3 else "module")
    for k in range(12):
        y0 = -CAGE_Y + k * MOD
        place("cage_perimeter", (CAGE_X, y0, 0), math.pi / 2, piece="module")
        place("cage_perimeter", (-CAGE_X, -y0, 0), -math.pi / 2, piece="module")
    for (x, y), rz in (((-CAGE_X, -CAGE_Y), 0.0), ((CAGE_X, -CAGE_Y), math.pi / 2), ((CAGE_X, CAGE_Y), math.pi),
                       ((-CAGE_X, CAGE_Y), -math.pi / 2)):
        place("cage_perimeter", (x, y, 0), rz, piece="corner")
    # light trusses + hanging odds boards over the fence
    for y in TRUSS_Y:
        for x in truss_x(y):
            place("light_truss", (x, y, TRUSS_Z))
    place("holo_odds_board", (0, -0.35, BOARD_Z), 0.0)
    place("holo_odds_board", (0, 0.35, BOARD_Z), math.pi)
    # gameplay machines
    place_rig("core_launcher", (9.0, 2.34, 0), -math.pi / 2)
    place_rig("core_launcher", (-9.0, -2.34, 0), math.pi / 2)
    place_rig("referee_drone", (2.8, -0.6, 3.6), 0.4)
    place("core_canister_rack", (9.1, 5.2, 0), -math.pi / 2)
    place("core_canister_rack", (-9.1, -5.2, 0), math.pi / 2)
    for loc, rz in BALLS:
        place("core_ball", loc, rz)
    for p in PROPS:
        place(*p)


TRUSS_Y = (-8.45, 0.0, 8.45)


def truss_x(y):
    """9 m sections; the centre row leaves room for the odds-board chains (x +-1.6)."""
    return (-5.7, 5.7) if y == 0.0 else (-4.5, 4.5)


BALLS = [((0.35, -6.4, 1.05), 0.25), ((-0.3, 5.6, 0.14), math.pi + 0.3)]
TRUSS_Z = 8.0
BOARD_Z = 5.4
PROPS = [
    # (aid, loc, rz[, piece]) - asset fronts face -Y in their own space
    ("hazard_barrier", (-3.2, -16.8, 0), math.pi), ("hazard_barrier", (3.4, -16.8, 0), math.pi + 0.05),
    ("hazard_barrier", (-3, 16.8, 0), 0.0), ("hazard_barrier", (3.3, 16.8, 0), -0.05),
    ("steam_vent", (8.7, -9.75, 0), 0.0), ("steam_vent", (-8.7, 9.75, 0), math.pi), ("steam_vent", (-8.7, -8.58, 0), math.pi),
    ("steam_vent", (8.7, 11.7, 0), 0.0),
    ("junk_barrel", (9, -14.56, 0), 0.3), ("junk_barrel", (9.45, -13.65, 0), 1.2), ("junk_barrel", (-9.2, 14.3, 0), 0.7),
    ("junk_barrel", (-9.3, -13.26, 0), 2.0),
    ("cargo_crate", (-9, -11.18, 0), math.pi / 2 + 0.1), ("cargo_crate", (-9.1, 12.22, 0), math.pi / 2 - 0.2),
    ("cargo_crate", (9, 14.69, 0), -math.pi / 2 + 0.3),
    ("betting_terminal", (-12, -8.5, 0), math.pi / 2), ("betting_terminal", (-12, 8.5, 0), math.pi / 2),
    ("betting_terminal", (12, 7.5, 0), -math.pi / 2), ("betting_terminal", (12, -8, 0), -math.pi / 2),
    ("power_generator", (12.8, -12.5, 0), -math.pi / 2), ("power_generator", (-13, 13, 0), math.pi / 2),
    ("cable_bundle", (12, -11.7, 0), math.pi), ("cable_bundle", (-12.2, 12.2, 0), 0.0),
    ("neon_sign", (-4.5, -17.75, 2.3), math.pi), ("neon_sign", (4.5, 17.75, 2.3), 0.0),
    ("scrap_pile", (-14.5, -19, 0), 0.4), ("scrap_pile", (14, -20, 0), 2.6), ("scrap_pile", (-15, 18, 0), -0.8),
    ("scrap_pile", (15.5, 16.5, 0), 3.4),
    ("neon_billboards", (-15, 34.5, 0), 0.1, "a"), ("neon_billboards", (16, 36.5, 0), -0.15, "c"),
    ("neon_billboards", (5, -35.5, 0), math.pi, "b"), ("neon_billboards", (-33, -10.5, 0), math.pi / 2, "c"),
    ("city_skyline", (0, 0, 0), 0.0),
]


def build_lights():
    # floodlights on the trusses (match light_truss lamp x positions), aimed at the courts
    for y in TRUSS_Y:
        for x in [sx + lx for sx in truss_x(y) for lx in (-2.25, 2.25)]:
            tgt = (x * 0.6, y + (-3.9 if y < 0 else 3.9 if y > 0 else 0.0), 0)
            s = light(f"light_truss_flood_{x:+.2f}_{y:+.0f}", "SPOT", (x, y, TRUSS_Z - 1.4), (1.0, 0.93, 0.85), 900,
                      spot=math.radians(70), blend=0.6, size=0.3)
            aim(s, tgt)
    # neon accent fill: magenta on the west side, cyan on the east side (GDD 12.2)
    for y in (-13.0, -4.55, 4.55, 13.0):
        light(f"cage_perimeter_neon_m_{y:+.0f}", "POINT", (-CAGE_X + 0.6, y, 2.6), (1.0, 0.17, 0.84), 260, size=0.5)
        light(f"cage_perimeter_neon_c_{y:+.0f}", "POINT", (CAGE_X - 0.6, y, 2.6), (0.1, 0.9, 1.0), 260, size=0.5)
    for i, (loc, rz) in enumerate(BALLS[:2]):  # the core is the brightest thing on court: cyan glow pool
        light(f"core_ball_glow_{i}", "POINT", (loc[0], loc[1] - 0.35, loc[2] + 0.3), (0.0, 0.78, 1.0), 120, size=0.15)
    light("plasma_fence_glow", "POINT", (0, 0, 1.5), (0.2, 0.75, 1.0), 300, size=1.0)
    # venue / city glow beyond the cage
    for (x, y), col in (((-15, 30.5), (1.0, 0.2, 0.8)), ((16, 32.5), (0.1, 0.85, 1.0)), ((5, -31.5), (1.0, 0.3, 0.75)),
                        ((-29, -10.5), (0.15, 0.8, 1.0))):
        light(f"neon_billboards_spill_{x:+g}_{y:+g}", "POINT", (x, y, 6), col, 6000, size=2.0)
    sun = light("city_skyline_moon", "SUN", (0, 0, 50), (0.45, 0.55, 0.8), 0.25)
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))


def main():
    C.reset()
    for aid in ("arena_floor", "plasma_fence", "cage_perimeter", "light_truss", "holo_odds_board", "core_canister_rack",
                "core_ball", "hazard_barrier", "steam_vent", "junk_barrel", "cargo_crate", "betting_terminal",
                "power_generator", "cable_bundle", "neon_sign", "scrap_pile", "neon_billboards", "city_skyline"):
        import_lib(aid)
    build_layout()
    hide_library()
    build_lights()
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    C.save_blend(SID)
    EXP.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(EXP / f"{SID}.glb"), export_format="GLB", export_lights=True,
                              export_apply=False, export_yup=True, export_animations=True, export_animation_mode="ACTIONS")
    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == "MESH" for p in o.data.polygons)
    meshes = {o.data.name for o in bpy.data.objects if o.type == "MESH"}
    update_manifest({"id": SID, "glb": f"export/{SID}.glb", "triangles": tris,
                     "unique_meshes": len(meshes), "lights": sum(1 for o in bpy.data.objects if o.type == "LIGHT"),
                     "placements": {k: v for k, v in sorted(COUNT.items())}, "units": "meters",
                     "up_axis": "+Y (glTF) / Z (Blender source)", "textures": []})
    print(f"STAGE_DONE objects={len(bpy.data.objects)} unique_meshes={len(meshes)} tris={tris} "
          f"lights={sum(1 for o in bpy.data.objects if o.type == 'LIGHT')}")


main()
