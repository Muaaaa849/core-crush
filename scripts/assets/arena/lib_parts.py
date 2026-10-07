"""Reusable detail parts: boolean cuts, bolts, text meshes, panels."""
import bpy
from mathutils import Vector

import lib_core as C

FONT = r"C:\Windows\Fonts\arialbd.ttf"


def bolt(pos, normal, mat, r=0.012, segs=6):
    n = Vector(normal).normalized()
    depth = r * 0.7
    ob = C.cyl("bolt", r, depth, mat=mat, segs=segs)
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = n.to_track_quat("Z", "Y")
    ob.location = Vector(pos) + n * (depth * 0.35)
    C.add_bevel(ob, r * 0.18, 2, angle=30)
    return ob


def text_mesh(body, size, loc, rot, mat, extrude=0.001, align="CENTER"):
    cu = bpy.data.curves.new("txt", "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = align
    cu.align_y = "CENTER"
    try:
        cu.font = bpy.data.fonts.load(FONT, check_existing=True)
    except Exception:
        pass
    tmp = bpy.data.objects.new("txt_tmp", cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    ob = bpy.data.objects.new("text", me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.clear()
    me.materials.append(mat)
    ob.location, ob.rotation_euler = loc, rot
    return ob


import math as _m

import bmesh as _bmesh

FACE_ROT = {"-y": (_m.pi / 2, 0, 0), "y": (_m.pi / 2, 0, _m.pi), "x": (_m.pi / 2, 0, _m.pi / 2),
            "-x": (_m.pi / 2, 0, -_m.pi / 2), "z": (0, 0, 0)}
FACE_N = {"-y": (0, -1, 0), "y": (0, 1, 0), "x": (1, 0, 0), "-x": (-1, 0, 0), "z": (0, 0, 1)}


def poly_plate(points, depth, loc, face, mat, scale=1.0):
    """Flat prism from a 2D polygon (x right, y up in the plate plane) facing `face` ('-y','x',...)."""
    bm = _bmesh.new()
    vs = [bm.verts.new((x * scale, y * scale, 0)) for x, y in points]
    f = bm.faces.new(vs)
    r = _bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [e for e in r["geom"] if isinstance(e, _bmesh.types.BMVert)]
    _bmesh.ops.translate(bm, verts=top, vec=(0, 0, depth))
    _bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = C.obj_from_bm(bm, "plate", [mat])
    ob.rotation_euler = FACE_ROT[face]
    ob.location = loc
    return ob


BOLT_SHAPE = [(-0.1, 0.5), (0.25, 0.5), (0.05, 0.1), (0.3, 0.1), (-0.2, -0.55), (-0.02, -0.05), (-0.28, -0.05)]
TRI = [(-0.5, -0.43), (0.5, -0.43), (0.0, 0.43)]


def warn_sign(loc, face, size, m, glyph="bolt"):
    """Yellow warning triangle with black border and lightning bolt / '!' (high-poly decal)."""
    n = Vector(FACE_N[face])
    parts = [poly_plate(TRI, 0.002, Vector(loc), face, m["ink"], size * 1.12),
             poly_plate(TRI, 0.002, Vector(loc) + n * 0.002, face, m["yellow"], size * 0.92)]
    if glyph == "bolt":
        parts.append(poly_plate(BOLT_SHAPE, 0.002, Vector(loc) + n * 0.004 - Vector((0, 0, size * 0.06)), face, m["ink"], size * 0.5))
    else:
        parts.append(text_mesh("!", size * 0.6, Vector(loc) + n * 0.004, FACE_ROT[face], m["ink"], extrude=0.001))
    return parts


def smooth_path(ctrl, n=24):
    """Catmull-Rom through control points -> list of points."""
    P = [Vector(p) for p in ctrl]
    P = [P[0]] + P + [P[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        steps = max(2, n // (len(ctrl) - 1))
        for s in range(steps):
            t = s / steps
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-2])
    return out


def screen_image(src, dst, w, h):
    """Resize the existing screen graphic to a power-of-two emissive texture; returns the image."""
    from lib_tex import load_np, resize, save_np
    arr = load_np(src)
    return save_np(resize(arr, h, w), dst, "sRGB")


