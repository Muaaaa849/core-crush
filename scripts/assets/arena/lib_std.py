"""Shared high-poly smart materials (art bible palette)."""
from lib_mat import mfx, smart

Y = (0.75, 0.5, 0.05)
LIBS_STD = ["painted_metal", "rust_steel", "galvanized", "hazard_paint", "rubber"]


def std():
    return {
        "paint": smart("H_paint", "painted_metal", tint=(0.62, 0.64, 0.7), edge="rust_steel", edge_amt=0.8, grime=0.75),
        "dark": smart("H_dark", "painted_metal", tint=(0.36, 0.36, 0.4), edge="rust_steel", edge_amt=0.5, grime=0.85),
        "yellow": smart("H_yellow", "painted_metal", recolor=Y, recolor_gain=5.5, edge="rust_steel", edge_amt=0.9, grime=0.6),
        "steel": smart("H_steel", "galvanized", tint=(1.6, 1.6, 1.62), edge="rust_steel", edge_amt=0.5, metallic=1.0, rough_mul=1.3),
        "hazard": smart("H_hazard", "hazard_paint", scale=2.5, edge="rust_steel", edge_amt=0.5, grime=0.5),
        "ink": smart("H_ink", "painted_metal", recolor=(0.02, 0.02, 0.02), recolor_gain=2.0, edge=None, grime=0.2, bump=0.1),
        "rubber": smart("H_rubber", "rubber", tint=(0.55, 0.55, 0.55), edge=None, grime=0.6, wet=0.8, metallic=0.0),
        "orange": smart("H_orange", "painted_metal", recolor=(0.8, 0.22, 0.04), recolor_gain=5.0, edge="rust_steel", edge_amt=0.5),
    }


def neon(color="magenta", strength=12.0):
    cols = {"magenta": (1.0, 0.17, 0.84), "cyan": (0.1, 0.9, 1.0), "amber": (1.0, 0.55, 0.08), "red": (1.0, 0.06, 0.03),
            "white": (1.0, 0.95, 0.9)}
    return mfx(f"MFX_{color}", cols[color], strength)
