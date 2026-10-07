"""Shared helpers for CORE-CRUSH arena asset builds (Blender 5.2, headless)."""
import os
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[3]
# Inputs are read-only; every generated file belongs to the local cache.
ASSET_SOURCE = Path(os.environ.get("CORECRUSH_ASSET_SRC", "D:/T3test")).resolve() / "arena"
ARENA = ROOT / ".cache" / "arena"
LIB = ASSET_SOURCE / "textures" / "_library"
EXPORT = ARENA / "export"
SOURCE = ARENA / "source"


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    setup_cycles(sc)
    return sc


def setup_cycles(sc, samples=16):
    sc.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "OPTIX"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type in ("OPTIX",)
        sc.cycles.device = "GPU"
    except Exception as e:
        print(f"[lib] GPU setup failed, CPU bake: {e}")
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False


def obj_from_bm(bm, name, mats=(), coll=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    for m in mats:
        me.materials.append(m)
    return ob


# ------------------------------------------------------------ primitive builders (return objects)

def box(name, size, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, coll=None, bevel=0.0, segs=1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    ob = obj_from_bm(bm, name, [mat] if mat else (), coll)
    ob.location, ob.rotation_euler = loc, rot
    if bevel > 0:
        add_bevel(ob, bevel, segs)
    return ob


def cyl(name, r, depth, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, coll=None, segs=24, r2=None, bevel=0.0, bsegs=1, caps=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r,
                          radius2=r if r2 is None else r2, depth=depth)
    ob = obj_from_bm(bm, name, [mat] if mat else (), coll)
    ob.location, ob.rotation_euler = loc, rot
    for p in ob.data.polygons:
        p.use_smooth = True
    if bevel > 0:
        add_bevel(ob, bevel, bsegs)
    return ob


def torus(name, R, r, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, coll=None, seg=32, ring=10):
    bm = bmesh.new()
    verts = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ring_v = []
        for j in range(ring):
            b = 2 * math.pi * j / ring
            p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
            ring_v.append(bm.verts.new(p))
        verts.append(ring_v)
    for i in range(seg):
        for j in range(ring):
            bm.faces.new((verts[i][j], verts[(i + 1) % seg][j], verts[(i + 1) % seg][(j + 1) % ring], verts[i][(j + 1) % ring]))
    ob = obj_from_bm(bm, name, [mat] if mat else (), coll)
    ob.location, ob.rotation_euler = loc, rot
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def tube_along(name, pts, r, mat=None, coll=None, segs=10, caps=True, uvseam=False):
    """Swept tube through a polyline of points (Vector-able). uvseam: mark one seam along the length and tag the faces
    ('tubeuv' face attribute) so lib_bake.unwrap lays the tube out as one straight, evenly scaled strip."""
    pts = [Vector(p) for p in pts]
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
        n1 = t.cross(up).normalized()
        n2 = t.cross(n1).normalized()
        rings.append([bm.verts.new(p + (n1 * math.cos(2 * math.pi * k / segs) + n2 * math.sin(2 * math.pi * k / segs)) * r)
                      for k in range(segs)])
    for a, b in zip(rings, rings[1:]):
        for k in range(segs):
            bm.faces.new((a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]))
    if uvseam:
        bm.edges.ensure_lookup_table()
        for a, b in zip(rings, rings[1:]):
            bm.edges.get((a[0], b[0])).seam = True
    if caps:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = obj_from_bm(bm, name, [mat] if mat else (), coll)
    for p in ob.data.polygons:
        p.use_smooth = True
    if uvseam:
        at = ob.data.attributes.new("tubeuv", "BOOLEAN", "FACE")
        at.data.foreach_set("value", [True] * len(ob.data.polygons))
    return ob


def add_bevel(ob, width, segs=1, angle=40, harden=True, profile=0.5):
    m = ob.modifiers.new("Bevel", "BEVEL")
    m.width = width
    m.segments = segs
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(angle)
    m.profile = profile
    m.harden_normals = harden
    m.use_clamp_overlap = True
    return m


def apply_all(ob):
    """Bake modifiers into the mesh data (keeps custom normals)."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def join(objs, name):
    """Apply modifiers + transforms and join objects into one mesh object named `name`."""
    objs = [o for o in objs if o is not None]
    for o in objs:
        apply_all(o)
    base = objs[0]
    with bpy.context.temp_override(active_object=base, object=base, selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    base.name = name
    base.data.name = name
    with bpy.context.temp_override(active_object=base, object=base, selected_objects=[base], selected_editable_objects=[base]):
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return base


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def save_blend(aid):
    SOURCE.mkdir(parents=True, exist_ok=True)
    p = SOURCE / f"{aid}.blend"
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(p), compress=True)
    return p


def log(msg):
    print(f"[build] {msg}", flush=True)


def lathe(name, profile, segs=32, mat=None, coll=None, smooth=True):
    """Revolve [(r, z), ...] around Z. Points with r==0 close the shape."""
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in profile]
    for a, b in zip(vs, vs[1:]):
        bm.edges.new((a, b))
    bmesh.ops.spin(bm, geom=bm.verts[:] + bm.edges[:], angle=2 * math.pi, steps=segs, axis=(0, 0, 1), cent=(0, 0, 0))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = obj_from_bm(bm, name, [mat] if mat else (), coll)
    for p in ob.data.polygons:
        p.use_smooth = smooth
    return ob



