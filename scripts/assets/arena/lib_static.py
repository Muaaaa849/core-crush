"""Export path for non-baked assets (MT_/MFX_ only): save source + GLB/FBX + provenance."""
import bpy

import lib_core as C
from lib_bake import write_provenance
from lib_export import export_asset


def finish(aid, objs, libs=(), textures=()):
    for o in objs:
        if not o.data.uv_layers:
            raise RuntimeError(f"{o.name} has no UVs")
    C.save_blend(aid)
    write_provenance(aid, libs)
    export_asset(aid, objs, textures=textures)
    print("BUILD_DONE", aid)


def quad_strip(name, p0, p1, width, mat, z=0.0, uv_len=1.0, v_range=(0.0, 1.0)):
    """Flat strip on the floor from p0 to p1 (x, y), UV u along length (tiles every uv_len m)."""
    from mathutils import Vector
    a, b = Vector((p0[0], p0[1], z)), Vector((p1[0], p1[1], z))
    d = (b - a)
    n = Vector((-d.y, d.x, 0)).normalized() * width / 2
    vs = [a - n, b - n, b + n, a + n]
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in vs], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    L = d.length / uv_len
    for li, u in enumerate(((0, v_range[0]), (L, v_range[0]), (L, v_range[1]), (0, v_range[1]))):
        uv.data[li].uv = u
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    return ob
