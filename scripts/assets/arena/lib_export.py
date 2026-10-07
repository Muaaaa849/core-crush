"""GLB export + manifest update."""
import json

import bpy

from lib_core import ARENA, EXPORT, log, tris


def export_asset(aid, objs, textures=()):
    EXPORT.mkdir(parents=True, exist_ok=True)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    glb = EXPORT / f"{aid}.glb"
    kw = dict(filepath=str(glb), export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
              export_texcoords=True, export_normals=True, export_tangents=False, export_materials="EXPORT",
              export_image_format="AUTO", export_lights=False, export_cameras=False, export_extras=True)
    kw.update(export_animations=False)
    bpy.ops.export_scene.gltf(**kw)
    meshes = [o for o in objs if o.type == "MESH"]
    entry = {
        "id": aid, "glb": f"export/{aid}.glb", "fbx": None,
        "triangles": sum(tris(o) for o in meshes),
        "vertices": sum(len(o.data.vertices) for o in meshes),
        "materials": sorted({s.material.name for o in meshes for s in o.material_slots if s.material}),
        "textures": [str(p.relative_to(ARENA).as_posix()) if hasattr(p, "relative_to") else p for p in textures],
        "units": "meters", "up_axis": "+Y (glTF) / Z (Blender source)",
    }
    update_manifest(entry)
    log(f"exported {aid}: {entry['triangles']} tris")
    return entry


def update_manifest(entry):
    p = ARENA / "manifest.json"
    data = json.loads(p.read_text(encoding="utf-8")) if p.is_file() else {"assets": []}
    data["assets"] = [e for e in data["assets"] if e["id"] != entry["id"]] + [entry]
    data["assets"].sort(key=lambda e: e["id"])
    p.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
