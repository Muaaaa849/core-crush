"""UV unwrapping and high->low Cycles baking into a glTF-ready MB_ texture set."""
import json
import math

import bpy
import numpy as np

from lib_core import ARENA, log
from lib_mat import mb
from lib_tex import save_np


def select_only(objs, active=None):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def unwrap(ob, angle=60, margin=0.004, uv_scale=None):
    """Smart-project + concave pack (unique 0..1 UVs). Seams follow the 'angle' limit."""
    select_only([ob])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    _seam_unwrap_tubes(ob)
    try:
        bpy.ops.uv.average_islands_scale()
        bpy.ops.uv.pack_islands(rotate=True, margin=margin, shape_method="CONCAVE")
    except TypeError:
        bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def _seam_unwrap_tubes(ob):
    """Re-unwrap faces tagged 'tubeuv' (tube_along(uvseam=True)) along their seams -> straight strips. Edit mode in/out."""
    if "tubeuv" not in ob.data.attributes:
        return
    bpy.ops.object.mode_set(mode="OBJECT")
    at = ob.data.attributes["tubeuv"]
    flags = [False] * len(ob.data.polygons)
    at.data.foreach_get("value", flags)
    if not any(flags):
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        return
    me = ob.data
    vsel = [False] * len(me.vertices)
    for p, f in zip(me.polygons, flags):
        if f:
            for v in p.vertices:
                vsel[v] = True
    me.vertices.foreach_set("select", vsel)
    me.edges.foreach_set("select", [vsel[e.vertices[0]] and vsel[e.vertices[1]] for e in me.edges])
    me.polygons.foreach_set("select", flags)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.0)
    bpy.ops.mesh.select_all(action="SELECT")


def cube_uv(ob, size=1.0):
    """Tiling UVs by cube projection (for MT_ materials): UV units = meters / size."""
    select_only([ob])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=size, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def _new_img(name, res, color=(0, 0, 0, 1), noncolor=True):
    img = bpy.data.images.new(name, res, res, alpha=False)
    img.generated_color = color
    img.colorspace_settings.name = "Non-Color" if noncolor else "sRGB"
    return img


def _img_np(img):
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)


def _swap_metal_to_emission(mats, socket="Metallic"):
    saved = []
    for m in mats:
        nt = m.node_tree
        out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        orig = out.inputs["Surface"].links[0].from_socket if out.inputs["Surface"].links else None
        em = nt.nodes.new("ShaderNodeEmission")
        inp = bsdf.inputs[socket]
        src = inp.links[0].from_socket if inp.links else None
        if src is not None:
            nt.links.new(src, em.inputs["Color"])
        else:
            v = inp.default_value
            em.inputs["Color"].default_value = tuple(v) if hasattr(v, "__len__") else (v, v, v, 1)
        nt.links.new(em.outputs[0], out.inputs["Surface"])
        saved.append((nt, out, orig, em))
    return saved


def _restore(saved):
    for nt, out, orig, em in saved:
        if orig is not None:
            nt.links.new(orig, out.inputs["Surface"])
        nt.nodes.remove(em)


def bake(aid, low, highs, res=1024, extrusion=0.02, ray=0.06, ao_strength=0.45, samples=32,
         emissive_strength=4.0, libs_used=()):
    lows = low if isinstance(low, (list, tuple)) else [low]
    low = lows[0]
    """Bake highs -> low. Writes arena/textures/<aid>/*, assigns MB_<aid> to low, returns texture paths."""
    sc = bpy.context.scene
    sc.cycles.samples = samples
    out_dir = ARENA / "textures" / aid
    out_dir.mkdir(parents=True, exist_ok=True)
    # temp material on low carrying the bake target node
    tmp = bpy.data.materials.new(f"BAKE_{aid}")
    if hasattr(tmp, "use_nodes"):
        tmp.use_nodes = True
    node = tmp.node_tree.nodes.new("ShaderNodeTexImage")
    tmp.node_tree.nodes.active = node
    for lo in lows:
        lo.data.materials.clear()
        lo.data.materials.append(tmp)

    for h in highs:
        h.hide_render = False
    select_only(list(highs) + [low], low)
    bk = sc.render.bake
    bk.use_selected_to_active = True
    bk.cage_extrusion = extrusion
    bk.max_ray_distance = ray
    bk.margin = max(4, res // 128)
    try:  # adjacent-face margin: continues the real texture across seams instead of smearing edge pixels outward
        bk.margin_type = "ADJACENT_FACES"
    except Exception:
        pass
    bk.target = "IMAGE_TEXTURES"

    imgs = {}

    def run(key, btype, noncolor=True, color=(0, 0, 0, 1), **kw):
        img = _new_img(f"{aid}_{key}", res, color, noncolor)
        node.image = img
        log(f"bake {aid} {key} {res}px x{len(lows)}")
        for i, lo in enumerate(lows):
            select_only(list(highs) + [lo], lo)
            bpy.ops.object.bake(type=btype, use_selected_to_active=True, cage_extrusion=extrusion,
                                max_ray_distance=ray, margin=bk.margin, use_clear=(i == 0), **kw)
        imgs[key] = img

    run("normal", "NORMAL", color=(0.5, 0.5, 1, 1), normal_space="TANGENT")
    run("rough", "ROUGHNESS")
    run("ao", "AO")
    run("emit", "EMIT", noncolor=False)
    hmats = {s.material for h in highs for s in h.material_slots if s.material}
    for key, sock, nc in (("metal", "Metallic", True), ("color", "Base Color", False)):
        saved = _swap_metal_to_emission(hmats, sock)
        try:
            run(key, "EMIT", noncolor=nc)
        finally:
            _restore(saved)

    col = _img_np(imgs["color"])
    ao = _img_np(imgs["ao"])[..., :1]
    col[..., :3] *= (1 - ao_strength) + ao_strength * ao
    rough = _img_np(imgs["rough"])[..., 0]
    metal = _img_np(imgs["metal"])[..., 0]
    mr = np.dstack([np.zeros_like(rough), rough, metal, np.ones_like(rough)])
    paths = {
        "basecolor": out_dir / f"{aid}_basecolor.png",
        "mr": out_dir / f"{aid}_metal_rough.png",
        "normal": out_dir / f"{aid}_normal.png",
        "ao": out_dir / f"{aid}_ao.png",
    }
    i_bc = save_np(col, paths["basecolor"], "sRGB")
    i_mr = save_np(mr, paths["mr"], "Non-Color")
    i_n = save_np(_img_np(imgs["normal"]), paths["normal"], "Non-Color")
    save_np(_img_np(imgs["ao"]), paths["ao"], "Non-Color")
    emit = _img_np(imgs["emit"])
    i_e = None
    if emit[..., :3].max() > 0.02:
        paths["emissive"] = out_dir / f"{aid}_emissive.png"
        i_e = save_np(emit, paths["emissive"], "sRGB")
    for img in imgs.values():
        bpy.data.images.remove(img)

    final = mb(f"MB_{aid}", i_bc, i_mr, i_n, i_e, emissive_strength)
    for lo in lows:
        lo.data.materials.clear()
        lo.data.materials.append(final)
    bpy.data.materials.remove(tmp)
    write_provenance(aid, libs_used)
    return paths


def write_provenance(aid, libs_used, extra_entries=None):
    p = ARENA / "textures" / aid / "provenance.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    data = {"entries": [], "uses_library": []}
    if p.is_file():
        data = json.loads(p.read_text(encoding="utf-8"))
    data.setdefault("entries", [])
    data["uses_library"] = sorted(set(data.get("uses_library", [])) | set(libs_used))
    if extra_entries:
        data["entries"] += extra_entries
    p.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def cull_hidden(ob, dist=0.015, drop_bottom=True, floor_z=0.005):
    """Delete low-poly faces that can never be seen: faces whose every sample point is covered within `dist`
    by other geometry along the face normal (interpenetrating/stacked parts), and floor-contact bottom faces."""
    import bmesh
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm)
    kill = []
    for f in bm.faces:
        n = f.normal
        c = f.calc_center_median()
        if drop_bottom and n.z < -0.95 and c.z < floor_z:
            kill.append(f)
            continue
        pts = [c] + [c.lerp(v.co, 0.85) for v in f.verts]
        covered = True
        for p in pts:
            hit = tree.ray_cast(p + n * 1e-4, n, dist)
            if hit[0] is not None and hit[2] != f.index:
                continue
            touching = any(idx != f.index and bm.faces[idx].normal.dot(n) < -0.9
                           for _co, _no, idx, _d in tree.find_nearest_range(p, 0.0015))
            if not touching:
                covered = False
                break
        if covered:
            kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(ob.data)
    bm.free()
    log(f"cull_hidden {ob.name}: removed {len(kill)} faces")
    return len(kill)
