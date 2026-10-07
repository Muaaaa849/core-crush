"""Render the cached assembly from above and from behind a baseline.
Run Blender headless with --python-exit-code 1 --python this script.
Review-only camera/compositor changes do not affect exported assets or light energies.
"""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
from mathutils import Vector
import lib_core as C

bpy.ops.wm.open_mainfile(filepath=str(C.SOURCE / "arena_stage.blend"))
# The web stage removes display cores and their glow lights.
for ob in list(bpy.data.objects):
    if ob.name.startswith("core_ball"):
        bpy.data.objects.remove(ob, do_unlink=True)
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.eevee.taa_render_samples = 64
sc.eevee.shadow_pool_size = "1024"
sc.render.resolution_x, sc.render.resolution_y = 1600, 900
sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = "PNG"
sc.world = bpy.data.worlds.new("review_world")
sc.world.node_tree.nodes.get("Background").inputs[0].default_value = (0.035, 0.045, 0.07, 1)
sc.world.node_tree.nodes.get("Background").inputs[1].default_value = 0.3
sc.view_settings.view_transform = "AgX"
sc.view_settings.exposure = 1.0
# Blender 5 uses compositor node groups instead of scene.node_tree.
nt = bpy.data.node_groups.new("review_compositor", "CompositorNodeTree")
sc.compositing_node_group = nt
nt.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
rl = nt.nodes.new("CompositorNodeRLayers")
glow = nt.nodes.new("CompositorNodeGlare")
glow.inputs["Type"].default_value = "Fog Glow"
glow.inputs["Quality"].default_value = "High"
nt.links.new(rl.outputs["Image"], glow.inputs["Image"])
out = nt.nodes.new("NodeGroupOutput")
nt.links.new(glow.outputs["Image"], out.inputs["Image"])
cam = bpy.data.objects.new("review_camera", bpy.data.cameras.new("review_camera"))
sc.collection.objects.link(cam)
sc.camera = cam
preview = C.ARENA / "preview"
preview.mkdir(parents=True, exist_ok=True)
for name, loc, target, lens in [
    ("stage_wide", (27, -38, 27), (0, 0, 1.0), 38),
    ("stage_baseline", (0, -17.2, 1.65), (0, 2, 1.65), 20),
]:
    cam.location = loc
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    cam.data.clip_end = 500
    sc.render.filepath = str(preview / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"REVIEW_RENDER {sc.render.filepath}", flush=True)
