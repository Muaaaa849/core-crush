"""Materials: smart high-poly materials (for Cycles baking) and final game materials (MB_/MT_/MFX_)."""
import bpy

from lib_core import LIB


def _nt(name):
    m = bpy.data.materials.new(name)
    if hasattr(m, "use_nodes"):
        m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m, nt, bsdf


def _s(sockets, name, stype=None):
    for s in sockets:
        if s.name == name and (stype is None or s.type == stype):
            return s
    raise KeyError(name)


def _put(nt, sock, v):
    if isinstance(v, bpy.types.NodeSocket):
        nt.links.new(v, sock)
    else:
        sock.default_value = v


def math(nt, op, a, b=0.0, c=0.0, clamp=False):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    n.use_clamp = clamp
    for s, v in zip(n.inputs, (a, b, c)):
        _put(nt, s, v)
    return n.outputs[0]


def mix(nt, fac, a, b, blend="MIX"):
    n = nt.nodes.new("ShaderNodeMix")
    n.data_type = "RGBA"
    n.blend_type = blend
    _put(nt, _s(n.inputs, "Factor", "VALUE"), fac)
    _put(nt, _s(n.inputs, "A", "RGBA"), a)
    _put(nt, _s(n.inputs, "B", "RGBA"), b)
    return _s(n.outputs, "Result", "RGBA")


def mixf(nt, fac, a, b):
    n = nt.nodes.new("ShaderNodeMix")
    n.data_type = "FLOAT"
    _put(nt, _s(n.inputs, "Factor", "VALUE"), fac)
    _put(nt, _s(n.inputs, "A", "VALUE"), a)
    _put(nt, _s(n.inputs, "B", "VALUE"), b)
    return _s(n.outputs, "Result", "VALUE")


def maprange(nt, v, a, b, c=0.0, d=1.0):
    n = nt.nodes.new("ShaderNodeMapRange")
    n.clamp = True
    _put(nt, _s(n.inputs, "Value", "VALUE"), v)
    _s(n.inputs, "From Min", "VALUE").default_value = a
    _s(n.inputs, "From Max", "VALUE").default_value = b
    _s(n.inputs, "To Min", "VALUE").default_value = c
    _s(n.inputs, "To Max", "VALUE").default_value = d
    return _s(n.outputs, "Result", "VALUE")


def noise(nt, vec, scale, detail=6.0, rough=0.6):
    n = nt.nodes.new("ShaderNodeTexNoise")
    _put(nt, n.inputs["Vector"], vec)
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = rough
    return n.outputs["Fac"]


_imgs = {}


def lib_image(lib, map_name, colorspace):
    key = (lib, map_name)
    if key not in _imgs:
        img = bpy.data.images.load(str(LIB / lib / f"{map_name}.png"), check_existing=True)
        img.colorspace_settings.name = colorspace
        _imgs[key] = img
    return _imgs[key]


def box_tex(nt, vec, lib, map_name, colorspace="sRGB", blend=0.25):
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = lib_image(lib, map_name, colorspace)
    n.projection = "BOX"
    n.projection_blend = blend
    n.extension = "REPEAT"
    nt.links.new(vec, n.inputs["Vector"])
    return n


def scaled_obj_coords(nt, scale, offset=(0, 0, 0)):
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale, scale, scale)
    mp.inputs["Location"].default_value = offset
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    return mp.outputs["Vector"], tc


def smart(name, base="painted_metal", tint=(1, 1, 1), scale=1.0, metallic=None, edge="rust_steel", edge_amt=0.6,
          edge_metal=True, grime=0.6, wet=0.5, rough_mul=1.0, bump=0.35, emission=None, offset=(0, 0, 0), recolor=None, recolor_gain=3.0, overlay=None,
          edge_radius=0.012, ao_dist=0.08, recolor_flat=0.0):
    """High-poly material for baking: GPT library base + edge wear + cavity/bottom grime + wet streaks."""
    m, nt, bsdf = _nt(name)
    vec, tc = scaled_obj_coords(nt, scale, offset)
    import json
    params = json.loads((LIB / base / "params.json").read_text(encoding="utf-8"))
    col = box_tex(nt, vec, base, "basecolor").outputs["Color"]
    if recolor is not None:
        bw = nt.nodes.new("ShaderNodeRGBToBW")
        nt.links.new(col, bw.inputs["Color"])
        g = recolor_gain
        val = bw.outputs["Val"]
        if recolor_flat > 0:  # squash the library's dark grunge towards its mean (clean factory paint)
            val = mixf(nt, recolor_flat, val, 0.25)
        col = mix(nt, 1.0, val, (recolor[0] * g, recolor[1] * g, recolor[2] * g, 1), "MULTIPLY")
    if tuple(tint) != (1, 1, 1):
        col = mix(nt, 1.0, col, (*tint, 1), "MULTIPLY")
    rough = box_tex(nt, vec, base, "roughness", "Non-Color").outputs["Color"]
    rough = math(nt, "MULTIPLY", rough, rough_mul)
    hgt = box_tex(nt, vec, base, "height", "Non-Color").outputs["Color"]
    metal = params["metallic"] if metallic is None else metallic

    # band overlay (painted stripes / zones) along an object axis
    if overlay:
        sx = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(tc.outputs["Object"], sx.inputs[0])
        coord = sx.outputs[overlay.get("axis", "Z")]
        lo, hi = overlay["range"]
        soft = overlay.get("soft", 0.004)
        inb = math(nt, "MULTIPLY", maprange(nt, coord, lo - soft, lo + soft), maprange(nt, coord, hi + soft, hi - soft))
        ovec, _ = scaled_obj_coords(nt, overlay.get("scale", scale))
        ocol = box_tex(nt, ovec, overlay["lib"], "basecolor").outputs["Color"]
        if overlay.get("stripes"):  # procedural 45-degree hazard stripes in object X+Z (follow any face, one scale)
            diag = math(nt, "ADD", sx.outputs["X"], sx.outputs["Z"])
            band = math(nt, "GREATER_THAN", math(nt, "FRACT", math(nt, "DIVIDE", diag, overlay["stripes"])), 0.5)
            grit = nt.nodes.new("ShaderNodeRGBToBW")
            nt.links.new(ocol, grit.inputs["Color"])
            g = maprange(nt, grit.outputs["Val"], 0.0, 0.6, 0.55, 1.15)
            yb = mix(nt, band, (0.025, 0.022, 0.02, 1), (0.78, 0.52, 0.05, 1))
            ocol = mix(nt, 1.0, yb, g, "MULTIPLY")
        if overlay.get("recolor"):
            bw2 = nt.nodes.new("ShaderNodeRGBToBW")
            nt.links.new(ocol, bw2.inputs["Color"])
            rc, g2 = overlay["recolor"], overlay.get("gain", 5.0)
            ocol = mix(nt, 1.0, bw2.outputs["Val"], (rc[0] * g2, rc[1] * g2, rc[2] * g2, 1), "MULTIPLY")
        orough = box_tex(nt, ovec, overlay["lib"], "roughness", "Non-Color").outputs["Color"]
        col = mix(nt, inb, col, ocol)
        rough = mixf(nt, inb, rough, orough)
        metal = mixf(nt, inb, metal, 0.0)

    # edge mask from shader bevel vs true normal
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 8
    bev.inputs["Radius"].default_value = edge_radius
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    nt.links.new(bev.outputs["Normal"], dot.inputs[0])
    nt.links.new(geo.outputs["Normal"], dot.inputs[1])
    edge_raw = maprange(nt, dot.outputs["Value"], 0.995, 0.93)
    brk = noise(nt, tc.outputs["Object"], 9.0 / max(scale, 0.2), 8, 0.7)
    edge_mask = math(nt, "MULTIPLY", edge_raw, maprange(nt, brk, 0.35, 0.6, 0.25, 1.6), clamp=True)
    edge_mask = math(nt, "MULTIPLY", edge_mask, edge_amt, clamp=True)
    if edge:
        ecol = box_tex(nt, vec, edge, "basecolor").outputs["Color"]
        col = mix(nt, edge_mask, col, ecol)
        rough = mixf(nt, edge_mask, rough, 0.38 if edge_metal else 0.75)
        metal = mixf(nt, edge_mask, metal, 1.0 if edge_metal else 0.2)

    # cavity + bottom grime
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = 8
    ao.only_local = True
    ao.inputs["Distance"].default_value = ao_dist
    cav = maprange(nt, ao.outputs["AO"], 0.95, 0.4)
    gen = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], gen.inputs[0])
    bottom = maprange(nt, gen.outputs["Z"], 0.35, 0.0)
    gn = noise(nt, tc.outputs["Object"], 4.0, 6, 0.65)
    grime_mask = math(nt, "MAXIMUM", cav, math(nt, "MULTIPLY", bottom, maprange(nt, gn, 0.3, 0.7, 0.3, 1.0)))
    grime_mask = math(nt, "MULTIPLY", grime_mask, grime, clamp=True)
    col = mix(nt, grime_mask, col, (0.035, 0.03, 0.025, 1), "MULTIPLY")
    col = mix(nt, math(nt, "MULTIPLY", grime_mask, 0.5), col, (0.05, 0.045, 0.04, 1))
    rough = mixf(nt, grime_mask, rough, 0.92)

    # wet streaks on up-facing surfaces
    if wet > 0:
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(geo.outputs["Normal"], sep.inputs[0])
        up = maprange(nt, sep.outputs["Z"], 0.5, 0.9)
        wn = noise(nt, tc.outputs["Object"], 2.5, 4, 0.5)
        wet_mask = math(nt, "MULTIPLY", up, maprange(nt, wn, 0.45, 0.62), clamp=True)
        rough = mixf(nt, math(nt, "MULTIPLY", wet_mask, wet), rough, 0.08)

    _put(nt, bsdf.inputs["Base Color"], col)
    _put(nt, bsdf.inputs["Roughness"], rough)
    _put(nt, bsdf.inputs["Metallic"], metal)
    bp = nt.nodes.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = bump
    bp.inputs["Distance"].default_value = 0.004
    nt.links.new(hgt, bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], bsdf.inputs["Normal"])
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission[0], 1)
        bsdf.inputs["Emission Strength"].default_value = emission[1]
    return m


def mb(name, basecolor_img, mr_img, normal_img, emissive_img=None, emissive_strength=1.0):
    """Final baked game material (unique UVs)."""
    m, nt, bsdf = _nt(name)
    uv = nt.nodes.new("ShaderNodeTexCoord").outputs["UV"]

    def tex(img, cs):
        n = nt.nodes.new("ShaderNodeTexImage")
        img.colorspace_settings.name = cs
        n.image = img
        nt.links.new(uv, n.inputs["Vector"])
        return n

    nt.links.new(tex(basecolor_img, "sRGB").outputs["Color"], bsdf.inputs["Base Color"])
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(tex(mr_img, "Non-Color").outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(tex(normal_img, "Non-Color").outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if emissive_img is not None:
        nt.links.new(tex(emissive_img, "sRGB").outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emissive_strength
    return m


def mt(name, lib, tint=None, alpha=False, emission=None, emissive_strength=0.0):
    """Tiling game material from a library set (UVs carry the tiling)."""
    m, nt, bsdf = _nt(name)
    uv = nt.nodes.new("ShaderNodeTexCoord").outputs["UV"]

    def tex(map_name, cs):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = lib_image(lib, map_name, cs)
        nt.links.new(uv, n.inputs["Vector"])
        return n

    bc = tex("basecolor", "sRGB")
    col = bc.outputs["Color"]
    if tint is not None:
        col = mix(nt, 1.0, col, (*tint, 1), "MULTIPLY")
    nt.links.new(col, bsdf.inputs["Base Color"])
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(tex("mr", "Non-Color").outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(tex("normal", "Non-Color").outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if emissive_strength > 0:
        nt.links.new(tex("emissive", "sRGB").outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emissive_strength
    if alpha:
        cut = nt.nodes.new("ShaderNodeMath")
        cut.operation = "ROUND"
        nt.links.new(bc.outputs["Alpha"], cut.inputs[0])
        nt.links.new(cut.outputs[0], bsdf.inputs["Alpha"])
        try:
            m.surface_render_method = "DITHERED"
        except Exception:
            pass
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission[0], 1)
        bsdf.inputs["Emission Strength"].default_value = emission[1]
    return m


def mfx(name, color, strength=8.0, img=None, base=(0.02, 0.02, 0.025), alpha=None):
    """Emissive / shader-placeholder game material (neon, screens, plasma, hologram)."""
    m, nt, bsdf = _nt(name)
    bsdf.inputs["Base Color"].default_value = (*base, 1)
    bsdf.inputs["Roughness"].default_value = 0.25
    if img is not None:
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        uv = nt.nodes.new("ShaderNodeTexCoord").outputs["UV"]
        nt.links.new(uv, n.inputs["Vector"])
        nt.links.new(n.outputs["Color"], bsdf.inputs["Emission Color"])
        nt.links.new(n.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
    bsdf.inputs["Emission Strength"].default_value = strength
    if alpha is not None:
        bsdf.inputs["Alpha"].default_value = alpha
        try:
            m.surface_render_method = "BLENDED"
        except Exception:
            pass
    return m
