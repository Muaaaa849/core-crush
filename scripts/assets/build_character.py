"""Kenney characterMedium + cyborgFemaleA スキン + idle/run/jump を1つのGLBへまとめる。

blender -b --factory-startup --python build_character.py -- <kenney files dir> <out.glb>
"""
import sys
from pathlib import Path

import bpy

src, out = (Path(p).resolve() for p in sys.argv[sys.argv.index("--") + 1:])
ANIMS = ("idle", "run", "jump")
SKIN = "cyborgFemaleA.png"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(src / "Model" / "characterMedium.fbx"))
rig = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

# FBXの材質「skin」は画像ノードを持たず、Alpha=0で読み込まれる。スキン画像をBase Colorへ繋ぎ、不透明にする。
skin = bpy.data.images.load(str(src / "Skins" / SKIN))
for mat in {slot.material for mesh in meshes for slot in mesh.material_slots}:
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = skin
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Alpha"].default_value = 1.0
    mat.surface_render_method = "DITHERED"

# 動作FBXの骨格は基準姿勢がモデル（Tポーズ）と異なるため、ローカル回転をそのまま移すと姿勢が崩れる。
# モデルの各骨を動作側の同名骨へワールド空間で追従させ、見た目どおりの姿勢をキーへ焼き込む。
bpy.context.view_layer.objects.active = rig
for name in ANIMS:
    before = set(bpy.data.objects)
    actions_before = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=str(src / "Animations" / f"{name}.fbx"))
    imported = [o for o in bpy.data.objects if o not in before]
    src_rig = next(o for o in imported if o.type == "ARMATURE")
    # 各FBXは「Targeting Pose」（2フレームの照準姿勢）と本来の動作の2テイクを持ち、読み込み直後は前者が有効になる。
    (motion,) = [a for a in bpy.data.actions if a not in actions_before and "Targeting Pose" not in a.name]
    src_rig.animation_data.action = motion
    src_rig.animation_data.action_slot = motion.slots[0]

    for pb in rig.pose.bones:
        if pb.name in src_rig.pose.bones:
            c = pb.constraints.new("COPY_TRANSFORMS")
            c.target, c.subtarget = src_rig, pb.name
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    first, last = (int(f) for f in motion.frame_range)
    bpy.ops.nla.bake(frame_start=first, frame_end=last, visual_keying=True, clear_constraints=True,
                     use_current_action=False, bake_types={"POSE"})
    bpy.ops.object.mode_set(mode="OBJECT")

    baked = rig.animation_data.action
    baked.name = name
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, first, baked)
    strip.action_slot = rig.animation_data.action_slot
    rig.animation_data.action = None
    for o in imported:
        bpy.data.objects.remove(o, do_unlink=True)

rig.animation_data.action = None
for o in bpy.context.scene.objects:
    print("OBJ", o.name, o.type, tuple(round(d, 3) for d in o.dimensions))
print("TRACKS", [t.name for t in rig.animation_data.nla_tracks])

out.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(out),
    export_format="GLB",
    export_image_format="WEBP",
    export_animation_mode="NLA_TRACKS",
    export_yup=True,
)
