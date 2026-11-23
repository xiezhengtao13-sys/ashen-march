#!/usr/bin/env python3
"""
Blender 4.0+ generator for the Ashenhold (灰烬城) Compact Terraced Hillside Redesign
(Phase 2 Sample Slice + 5-Tier Retaining Architecture + Walkable A/B Interiors).

Canonical local orientation before GLTF export (+Y up in Three.js):
  Blender local X  -> Three.js +X (width)
  Blender local -Y -> Three.js +Z (front facade faces South when yaw = 0)
  Blender local Z  -> Three.js +Y (up)

Outputs .glb models + hillside_manifest.json (boxes, cylinders, oriented ramp colliders)
into public/assets/city/models/.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from generate_models import MATERIAL_SPECS, MeshBuilder, OUT_DIR, reset_scene  # noqa: E402
from building_kit import add_diagonal_timber_bay  # noqa: E402

MANIFEST: dict[str, dict] = {}


def add_detailed_window(
    b: MeshBuilder,
    center: tuple[float, float, float],
    width: float,
    height: float,
    axis: str = "Y",
    sign: int = -1,
    shutters: bool = True,
    flower_box: bool = False,
) -> None:
    normal = (0.0, float(sign)) if axis == "Y" else (float(sign), 0.0)
    b.add_recessed_window(
        center=center,
        width=width,
        height=height,
        facing_normal=normal,
        with_shutters=shutters,
        with_flowerbox=flower_box,
        glow=False,
    )


def add_timber_grid_wall(
    b: MeshBuilder,
    mat: str,
    origin: tuple[float, float, float],
    span: float,
    height: float,
    bays: int,
    normal_axis: str = "Y",
    braces: bool = True,
) -> None:
    cx, cy, z0 = origin
    thick = 0.14
    post_w = 0.16
    if normal_axis == "Y":
        for rz in (z0 + 0.08, z0 + height * 0.52, z0 + height - 0.08):
            b.add_box(mat, (cx, cy, rz), (span, thick, post_w), bevel=0.01)
        for i in range(bays + 1):
            px = cx - span * 0.5 + (i / max(1, bays)) * span
            b.add_box(mat, (px, cy, z0 + height * 0.5), (post_w, thick, height), bevel=0.01)
        if braces:
            bay_w = span / max(1, bays)
            for i in (0, bays - 1):
                bx = cx - span * 0.5 + (i + 0.5) * bay_w
                add_diagonal_timber_bay(b, mat, bx, cy, z0 + height * 0.5, bay_w, height * 0.9, "Y", thick, "x_brace" if i == 0 else "brace")
    else:
        for rz in (z0 + 0.08, z0 + height * 0.52, z0 + height - 0.08):
            b.add_box(mat, (cx, cy, rz), (thick, span, post_w), bevel=0.01)
        for i in range(bays + 1):
            py = cy - span * 0.5 + (i / max(1, bays)) * span
            b.add_box(mat, (cx, py, z0 + height * 0.5), (thick, post_w, height), bevel=0.01)
        if braces:
            bay_w = span / max(1, bays)
            for i in (0, bays - 1):
                by = cy - span * 0.5 + (i + 0.5) * bay_w
                add_diagonal_timber_bay(b, mat, cx, by, z0 + height * 0.5, bay_w, height * 0.9, "X", thick, "brace")


def add_roof_helper(
    b: MeshBuilder,
    roof_mat: str,
    trim_mat: str,
    center: tuple[float, float, float],
    span_width: float,
    length: float,
    pitch_height: float,
    overhang: float = 0.6,
    along_axis: str = "X",
) -> None:
    b.add_pitched_tiled_roof(
        roof_mat=roof_mat,
        trim_mat=trim_mat,
        center=center,
        length=length,
        half_span=span_width * 0.5,
        rise=pitch_height,
        along_axis=along_axis,
        overhang=overhang,
        eave_rafters=True,
        with_3d_tiles=True,
    )


def export_hillside_model(
    b: MeshBuilder,
    model_name: str,
    colliders: list[dict] | None = None,
    cylinders: list[dict] | None = None,
    oriented_colliders: list[dict] | None = None,
    bake_ao: bool = True,
) -> None:
    reset_scene()
    for mat_name in b.mat_names:
        if mat_name not in MATERIAL_SPECS:
            raise ValueError(f"Unknown material '{mat_name}' in {model_name}")
    b.finalize_and_export(OUT_DIR / f"{model_name}.glb", bake_ao=bake_ao, basal_height=0.65)
    MANIFEST[f"{model_name}.glb"] = {
        "colliders": colliders or [],
        "cylinderColliders": cylinders or [],
        "orientedColliders": oriented_colliders or [],
    }


def bl_box_to_collider(cx: float, cy: float, cz: float, sx: float, sy: float, sz: float) -> dict:
    """Convert Blender box center+size to Three.js static box collider {center, half}."""
    return {
        "center": [round(cx, 3), round(cz, 3), round(-cy, 3)],
        "half": [round(sx * 0.5, 3), round(sz * 0.5, 3), round(sy * 0.5, 3)],
    }


# ---------------------------------------------------------------------------
# A1. South Gate Guardhouse (Full Walkable Interior, Tier 0 West)
# ---------------------------------------------------------------------------
def build_guardhouse_a1() -> None:
    b = MeshBuilder("hillside_guardhouse_a1", seed=701)
    # 9.2m (X) x 7.0m (Y), Front door faces -Y (Three +Z), wide open arch at x=0, y=-3.5
    W, D, H1, H2 = 9.2, 7.0, 3.6, 3.1
    hw, hd = W * 0.5, D * 0.5
    wt = 0.48

    # Deep stone plinth extending -1.8m down to handle hillside grade seamlessly
    b.add_box("stone_trim", (0.0, 0.0, -0.9), (W + 0.35, D + 0.35, 1.85), bevel=0.04)
    # Interior flagstone floor (z = 0.02)
    b.add_box("stone_trim", (0.0, 0.0, 0.02), (W - 0.5, D - 0.5, 0.12))

    # Back wall (+Y), Left wall (-X), Right wall (+X)
    b.add_box("stone_ashlar", (0.0, hd - wt * 0.5, H1 * 0.5), (W, wt, H1), bevel=0.03)
    b.add_box("stone_ashlar", (-hw + wt * 0.5, 0.0, H1 * 0.5), (wt, D, H1), bevel=0.03)
    b.add_box("stone_ashlar", (hw - wt * 0.5, 0.0, H1 * 0.5), (wt, D, H1), bevel=0.03)

    # Front wall (-Y) with wide 2.4m arched doorway at x = 0 (z = 0..2.75)
    b.add_box("stone_ashlar", (-2.9, -hd + wt * 0.5, H1 * 0.5), (3.4, wt, H1), bevel=0.03)
    b.add_box("stone_ashlar", (2.9, -hd + wt * 0.5, H1 * 0.5), (3.4, wt, H1), bevel=0.03)
    b.add_box("stone_ashlar", (0.0, -hd + wt * 0.5, 3.15), (2.6, wt, 0.90), bevel=0.025)
    b.add_stone_arch("stone_trim", (0.0, -hd - 0.02, 1.55), radius=1.22, depth=0.58, ring_thickness=0.28, num_voussoirs=9, facing_axis="Y")

    # Corner ashlar quoins
    for sx in (-hw, hw):
        for sy in (-hd, hd):
            for k in range(5):
                b.add_box("stone_trim", (sx * 0.99, sy * 0.99, 0.36 + k * 0.7), (0.64 if k % 2 == 0 else 0.44, 0.44 if k % 2 == 0 else 0.64, 0.54), bevel=0.02)

    # Exposed oak ceiling rafters & 2nd floor jettied half-timbered quarters
    for rx in (-3.2, -1.6, 0.0, 1.6, 3.2):
        b.add_box("timber_oak", (rx, 0.0, H1 - 0.14), (0.22, D - 0.4, 0.24), bevel=0.015)
    b.add_box("planks_oak", (0.0, 0.0, H1 + 0.06), (W + 0.3, D + 0.45, 0.18), bevel=0.02)

    # Upper jettied watch room (overhangs 0.35m over street)
    uW, uD = W + 0.45, D + 0.55
    b.add_box("plaster_cream", (0.0, -0.1, H1 + H2 * 0.5 + 0.1), (uW, uD, H2), bevel=0.02)
    add_timber_grid_wall(b, "timber_oak", (0.0, -uD * 0.5 - 0.1, H1 + 0.1), uW, H2, 4, "Y", True)
    add_timber_grid_wall(b, "timber_oak", (0.0, uD * 0.5 - 0.1, H1 + 0.1), uW, H2, 4, "Y", False)
    add_timber_grid_wall(b, "timber_oak", (-uW * 0.5, -0.1, H1 + 0.1), uD, H2, 3, "X", False)
    add_timber_grid_wall(b, "timber_oak", (uW * 0.5, -0.1, H1 + 0.1), uD, H2, 3, "X", False)

    # Front & side windows (1st and 2nd floor)
    for wx in (-2.9, 2.9):
        add_detailed_window(b, (wx, -hd - 0.04, 1.85), 1.05, 1.15, "Y", -1, shutters=True, flower_box=False)
    for wx in (-3.0, 0.0, 3.0):
        add_detailed_window(b, (wx, -uD * 0.5 - 0.12, H1 + 1.55), 1.05, 1.20, "Y", -1, shutters=True, flower_box=True)

    # Steep Slate Gable Roof + Chimney
    add_roof_helper(b, "roof_slate", "timber_oak", (0.0, -0.1, H1 + H2 + 0.12), span_width=uD, length=uW, pitch_height=2.85, overhang=0.65, along_axis="X")
    b.add_chimney("stone_ashlar", "stone_trim", (-3.2, 2.2), H1 + H2 - 0.5, H1 + H2 + 3.6, width=0.95)

    # Interior Guardroom Details (Hearth, Oak Duty Table, Weapon Rack, Benches)
    # Stone Fireplace on Back-Left Wall
    b.add_box("stone_trim", (-2.6, hd - 0.85, 1.35), (1.9, 0.95, 2.7), bevel=0.03)
    b.add_box("stone_ashlar", (-2.6, hd - 0.95, 2.25), (2.15, 1.1, 0.35), bevel=0.025)
    b.add_box("ember_forge", (-2.6, hd - 0.72, 0.42), (1.1, 0.55, 0.36), bevel=0.02)
    # Heavy Oak Duty Table (center-right)
    b.add_box("planks_oak", (1.2, 0.6, 0.88), (2.2, 1.15, 0.11), bevel=0.015)
    for lx in (0.3, 2.1):
        for ly in (0.15, 1.05):
            b.add_box("timber_oak", (lx, ly, 0.44), (0.14, 0.14, 0.84), bevel=0.01)
    # Wooden Bench
    b.add_box("planks_oak", (1.2, -0.45, 0.46), (1.8, 0.42, 0.08), bevel=0.01)
    # Forged Weapon Rack along right interior wall
    b.add_box("timber_oak", (hw - 0.8, 0.5, 1.05), (0.28, 2.1, 1.9), bevel=0.015)
    for wy in (-0.2, 0.25, 0.7, 1.15):
        b.add_cylinder("iron_forged", (hw - 0.88, wy, 1.25), 0.035, 0.035, 1.85, segs=6)
    # Hanging Guard Banner outside
    b.add_planar_quad("banner_ashenhold", (-2.1, -hd - 0.22, 4.1), (-1.2, -hd - 0.22, 4.1), (-1.2, -hd - 0.22, 6.2), (-2.1, -hd - 0.22, 6.2), double_sided=True)

    colliders = [
        bl_box_to_collider(0.0, 0.0, -0.04, W - 0.1, D - 0.1, 0.20),            # Raised interior floor
        bl_box_to_collider(0.0, hd - wt * 0.5, H1 * 0.5, W, wt, H1),            # Back
        bl_box_to_collider(-hw + wt * 0.5, 0.0, H1 * 0.5, wt, D, H1),           # Left
        bl_box_to_collider(hw - wt * 0.5, 0.0, H1 * 0.5, wt, D, H1),            # Right
        bl_box_to_collider(-2.9, -hd + wt * 0.5, H1 * 0.5, 3.4, wt, H1),        # Front-Left
        bl_box_to_collider(2.9, -hd + wt * 0.5, H1 * 0.5, 3.4, wt, H1),         # Front-Right
        bl_box_to_collider(1.2, 0.6, 0.48, 2.1, 1.1, 0.96),                     # Duty table
    ]
    export_hillside_model(b, "hillside_guardhouse_a1", colliders=colliders)


# ---------------------------------------------------------------------------
# A2. Ember & Flagon Double-Story Inn & Tavern (2-Floor Walkable Interior + Balcony!)
# ---------------------------------------------------------------------------
def build_tavern_a2() -> None:
    b = MeshBuilder("hillside_tavern_a2", seed=702)
    # 10.6m (X) x 8.4m (Y). Front porch faces -Y (Three +Z).
    # Walkable 1st Floor (z = 0.05) + Climbable Oak Staircase along Back Wall (+Y) -> 2nd Floor Gallery & Front Balcony (z = +3.55)!
    W, D = 10.6, 8.4
    H1, H2 = 3.55, 3.25
    hw, hd = W * 0.5, D * 0.5
    wt = 0.45

    # Deep stone foundation plinth for hillside grade
    b.add_box("stone_trim", (0.0, 0.0, -1.1), (W + 0.4, D + 0.4, 2.25), bevel=0.04)
    # 1st floor oak plank floor
    b.add_box("planks_oak", (0.0, 0.0, 0.03), (W - 0.4, D - 0.4, 0.14))

    # 1st Floor Perimeter Walls (with wide 2.5m doorway on front -Y at x = -0.8)
    b.add_box("stone_ashlar", (0.0, hd - wt * 0.5, H1 * 0.5), (W, wt, H1), bevel=0.03)  # Back wall
    b.add_box("stone_ashlar", (-hw + wt * 0.5, 0.0, H1 * 0.5), (wt, D, H1), bevel=0.03)  # Left wall
    b.add_box("stone_ashlar", (hw - wt * 0.5, 0.0, H1 * 0.5), (wt, D, H1), bevel=0.03)   # Right wall
    # Front wall left/right of doorway x in [-2.05, +0.45]
    b.add_box("stone_ashlar", (-3.675, -hd + wt * 0.5, H1 * 0.5), (3.25, wt, H1), bevel=0.03)
    b.add_box("stone_ashlar", (2.875, -hd + wt * 0.5, H1 * 0.5), (4.85, wt, H1), bevel=0.03)
    b.add_box("stone_ashlar", (-0.8, -hd + wt * 0.5, 3.12), (2.6, wt, 0.86), bevel=0.025)
    b.add_stone_arch("stone_trim", (-0.8, -hd - 0.03, 1.55), radius=1.28, depth=0.58, ring_thickness=0.26, num_voussoirs=9, facing_axis="Y")

    # Welcoming Covered Timber Front Porch supporting the 2nd-floor Overlook Balcony!
    porch_y = -hd - 1.65
    for px in (-4.4, -2.2, 0.6, 2.8, 4.8):
        b.add_box("stone_trim", (px, porch_y, 0.25), (0.42, 0.42, 0.52), bevel=0.02)
        b.add_box("timber_oak", (px, porch_y, H1 * 0.5 + 0.1), (0.24, 0.24, H1 - 0.2), bevel=0.015)
    b.add_box("timber_oak", (0.0, porch_y, H1 - 0.1), (W - 0.4, 0.30, 0.28), bevel=0.02)

    # 2nd Floor Structural Deck (z = H1 = 3.55m) — leaves stairwell opening at back-left (x in [-4.5, +1.5], y in [2.1, 3.8])
    # Main front + right slab
    b.add_box("planks_oak", (0.0, -1.1, H1), (W - 0.4, 6.2, 0.22), bevel=0.015)
    # Back-right landing at top of stairs (x in [1.5, 4.9], y in [2.0, 3.85])
    b.add_box("planks_oak", (3.2, 2.9, H1), (3.4, 1.9, 0.22), bevel=0.015)
    # Street-facing 2nd Floor Overlook Balcony Deck (projects to y = -hd - 1.85!)
    b.add_box("planks_oak", (0.0, -hd - 0.92, H1), (W - 0.2, 1.9, 0.22), bevel=0.02)
    # Carved Oak Balcony Railing (z = H1..H1+1.05)
    b.add_box("timber_oak", (0.0, -hd - 1.78, H1 + 1.02), (W - 0.2, 0.14, 0.12), bevel=0.015)
    for rx in range(-5, 6):
        b.add_box("timber_oak", (rx * 0.98, -hd - 1.78, H1 + 0.52), (0.10, 0.10, 0.98), bevel=0.01)
    for sx in (-hw + 0.15, hw - 0.15):
        b.add_box("timber_oak", (sx, -hd - 0.92, H1 + 1.02), (0.14, 1.8, 0.12), bevel=0.015)
        b.add_box("timber_oak", (sx, -hd - 0.92, H1 + 0.52), (0.12, 1.7, 0.92), bevel=0.01)

    # REAL CLIMBABLE OAK STAIRCASE along Back Wall (y = 2.95, climbs from x = -3.8, z = 0.08 up to x = +1.7, z = 3.55!)
    num_steps = 15
    x_start, x_end = -3.8, 1.65
    for k in range(num_steps):
        t = (k + 0.5) / num_steps
        sx_pos = x_start + t * (x_end - x_start)
        sz_pos = 0.08 + t * (H1 - 0.08)
        b.add_box("planks_oak", (sx_pos, 2.95, sz_pos - 0.09), ((x_end - x_start) / num_steps + 0.06, 1.55, 0.18), bevel=0.012)
    # Stair stringer & handrail
    stair_len = math.hypot(x_end - x_start, H1)
    stair_ang = math.atan2(H1, x_end - x_start)
    b.add_box("timber_oak", ((x_start + x_end) * 0.5, 2.15, H1 * 0.5 + 0.72), (stair_len, 0.10, 0.10), bevel=0.01, rot=(0.0, -stair_ang, 0.0))
    # Stairwell safety rail on 2nd floor
    b.add_box("timber_oak", (-1.1, 2.02, H1 + 0.98), (5.3, 0.10, 0.10), bevel=0.01)
    for bx in (-3.6, -2.3, -1.0, 0.3, 1.4):
        b.add_box("timber_oak", (bx, 2.02, H1 + 0.50), (0.09, 0.09, 0.94), bevel=0.01)

    # 2nd Floor Timber-Framed Walls (with wide open Balcony Arch at front x = 0 & rear east-bridge doorway ready)
    b.add_box("plaster_ochre", (0.0, hd - wt * 0.5, H1 + H2 * 0.5), (W, wt, H2), bevel=0.02)
    b.add_box("plaster_ochre", (-hw + wt * 0.5, 0.0, H1 + H2 * 0.5), (wt, D, H2), bevel=0.02)
    b.add_box("plaster_ochre", (hw - wt * 0.5, 0.0, H1 + H2 * 0.5), (wt, D, H2), bevel=0.02)
    # Front 2nd-floor wall with 2.0m Balcony Door at x = 0.0
    b.add_box("plaster_ochre", (-3.15, -hd + wt * 0.5, H1 + H2 * 0.5), (4.3, wt, H2), bevel=0.02)
    b.add_box("plaster_ochre", (3.15, -hd + wt * 0.5, H1 + H2 * 0.5), (4.3, wt, H2), bevel=0.02)
    b.add_box("plaster_ochre", (0.0, -hd + wt * 0.5, H1 + H2 - 0.35), (2.2, wt, 0.70), bevel=0.02)
    add_timber_grid_wall(b, "timber_oak", (-3.15, -hd - 0.02, H1), 4.3, H2, 2, "Y", True)
    add_timber_grid_wall(b, "timber_oak", (3.15, -hd - 0.02, H1), 4.3, H2, 2, "Y", True)
    add_timber_grid_wall(b, "timber_oak", (-hw - 0.02, 0.0, H1), D, H2, 3, "X", False)
    add_timber_grid_wall(b, "timber_oak", (hw + 0.02, 0.0, H1), D, H2, 3, "X", False)

    # Windows + Hanging Tavern Sign
    add_detailed_window(b, (2.9, -hd - 0.03, 1.85), 1.35, 1.25, "Y", -1, shutters=True, flower_box=True)
    add_detailed_window(b, (-3.3, -hd - 0.03, H1 + 1.55), 1.15, 1.25, "Y", -1, shutters=True, flower_box=True)
    add_detailed_window(b, (3.3, -hd - 0.03, H1 + 1.55), 1.15, 1.25, "Y", -1, shutters=True, flower_box=True)
    # Wrought-iron bracket & painted Tavern Sign projecting over street
    b.add_box("iron_forged", (-2.2, -hd - 2.35, H1 + 0.45), (0.08, 1.35, 0.08), bevel=0.008)
    b.add_planar_quad("sign_tavern", (-2.24, -hd - 2.85, H1 - 0.45), (-2.24, -hd - 1.95, H1 - 0.45), (-2.24, -hd - 1.95, H1 + 0.35), (-2.24, -hd - 2.85, H1 + 0.35), double_sided=True)

    # Warm Clay Tile Pitched Roof overhanging the 2nd-floor Balcony + Brick Chimney!
    add_roof_helper(b, "roof_clay", "timber_oak", (0.0, -0.85, H1 + H2 + 0.05), span_width=D + 2.1, length=W + 0.4, pitch_height=3.25, overhang=0.65, along_axis="X")
    b.add_chimney("brick_medieval", "stone_trim", (-4.1, -0.2), H1 + H2 - 0.5, H1 + H2 + 3.9, width=1.05)

    # Built-in Stone Fireplace on Left Interior Wall (x = -hw + 0.75, y = -0.2)
    b.add_box("stone_trim", (-hw + 0.75, -0.2, 1.45), (1.1, 2.2, 2.9), bevel=0.03)
    b.add_box("ember_forge", (-hw + 0.95, -0.2, 0.45), (0.65, 1.2, 0.38), bevel=0.02)

    # Exact Colliders including 2nd-floor slab, balcony guardrails, and SMOOTH SLOPED RAMP for oak staircase!
    colliders = [
        # 1st floor raised oak floor slab + walls
        bl_box_to_collider(0.0, 0.0, -0.04, W - 0.1, D - 0.1, 0.22),
        bl_box_to_collider(0.0, hd - wt * 0.5, (H1 + H2) * 0.5, W, wt, H1 + H2),
        bl_box_to_collider(-hw + wt * 0.5, 0.0, (H1 + H2) * 0.5, wt, D, H1 + H2),
        bl_box_to_collider(hw - wt * 0.5, 0.0, (H1 + H2) * 0.5, wt, D, H1 + H2),
        bl_box_to_collider(-3.675, -hd + wt * 0.5, H1 * 0.5, 3.25, wt, H1),
        bl_box_to_collider(2.875, -hd + wt * 0.5, H1 * 0.5, 4.85, wt, H1),
        # 2nd floor slabs (leaving stairwell open!)
        bl_box_to_collider(0.0, -1.1, H1, W - 0.4, 6.2, 0.24),
        bl_box_to_collider(3.2, 2.9, H1, 3.4, 1.9, 0.24),
        bl_box_to_collider(0.0, -hd - 0.92, H1, W - 0.2, 1.9, 0.24),
        # 2nd floor front walls (leaving balcony door open) & balcony safety rail
        bl_box_to_collider(-3.15, -hd + wt * 0.5, H1 + H2 * 0.5, 4.3, wt, H2),
        bl_box_to_collider(3.15, -hd + wt * 0.5, H1 + H2 * 0.5, 4.3, wt, H2),
        bl_box_to_collider(0.0, -hd - 1.82, H1 + 0.65, W, 0.22, 1.3),
        bl_box_to_collider(-hw + 0.12, -hd - 0.92, H1 + 0.65, 0.24, 1.9, 1.3),
        bl_box_to_collider(hw - 0.12, -hd - 0.92, H1 + 0.65, 0.24, 1.9, 1.3),
        # Stairwell guardrail on 2nd floor
        bl_box_to_collider(-1.1, 2.02, H1 + 0.6, 5.2, 0.18, 1.2),
    ]
    # Smooth sloped Rapier ramp beneath visible oak staircase (climbs along +X from x=-3.8, y=0.05 to x=+1.65, y=3.55)
    # Three.js Z = -Blender Y = -2.95
    dx = x_end - x_start
    dy = H1 - 0.05
    ramp_len = math.hypot(dx, dy)
    roll = math.atan2(dy, dx)
    oriented = [
        {
            "center": [round((x_start + x_end) * 0.5, 3), round(0.05 + dy * 0.5 - 0.12, 3), -2.95],
            "half": [round(ramp_len * 0.5 + 0.15, 3), 0.14, 0.82],
            "rot": [0.0, 0.0, round(roll, 4)],
        }
    ]
    export_hillside_model(b, "hillside_tavern_a2", colliders=colliders, oriented_colliders=oriented)


def build_tavern_a2_interior() -> None:
    """Distance-culled (<28m) interior furniture pack for A2 Tavern (Bar, Kegs, Tables, Chandelier, Upper Beds)."""
    b = MeshBuilder("hillside_tavern_a2_interior", seed=703)
    # Oak Bar Counter (right side of ground floor)
    b.add_box("planks_oak", (2.6, 0.2, 1.05), (3.4, 0.78, 0.12), bevel=0.015)
    b.add_box("timber_oak", (2.6, 0.2, 0.52), (3.25, 0.66, 0.98), bevel=0.02)
    # Stacked Oak Beer Kegs behind bar
    for ky in (0.95, 1.55):
        b.add_cylinder("planks_oak", (3.85, ky, 0.55), 0.34, 0.34, 0.85, segs=10, bevel=0.02, rot=(0.0, math.pi * 0.5, 0.0))
        b.add_cylinder("iron_forged", (3.85, ky, 0.55), 0.355, 0.355, 0.08, segs=10, rot=(0.0, math.pi * 0.5, 0.0))
    # Two Dining Tables + Benches + Brass Tankards
    for tx, ty in ((-1.8, -1.6), (-1.8, 0.6)):
        b.add_box("planks_oak", (tx, ty, 0.82), (1.75, 0.92, 0.09), bevel=0.012)
        for lx in (-0.72, 0.72):
            b.add_box("timber_oak", (tx + lx, ty, 0.41), (0.12, 0.74, 0.80), bevel=0.01)
        b.add_box("planks_oak", (tx, ty - 0.72, 0.45), (1.55, 0.34, 0.07), bevel=0.01)
        b.add_box("brass_aged", (tx + 0.35, ty + 0.1, 0.96), (0.11, 0.11, 0.18), bevel=0.01)
        b.add_box("brass_aged", (tx - 0.28, ty - 0.12, 0.96), (0.11, 0.11, 0.18), bevel=0.01)
    # Wrought-Iron Ring Chandelier hanging from 1st-floor ceiling
    b.add_cylinder("iron_forged", (0.0, -0.5, 2.95), 0.04, 0.04, 1.1, segs=6)
    b.add_cylinder("iron_forged", (0.0, -0.5, 2.48), 0.75, 0.75, 0.09, segs=12)
    for k in range(6):
        a = k * math.pi / 3.0
        b.add_cylinder("glow_warm", (math.cos(a) * 0.72, -0.5 + math.sin(a) * 0.72, 2.62), 0.045, 0.04, 0.18, segs=6)
    # 2nd Floor Inn Guest Room Furnishings (z = 3.66+)
    for bx in (-3.2, 3.3):
        b.add_box("timber_oak", (bx, -1.5, 3.92), (1.35, 2.05, 0.42), bevel=0.02)
        b.add_box("cloth_crimson" if bx < 0 else "cloth_navy", (bx, -1.5, 4.18), (1.22, 1.85, 0.16), bevel=0.02)
        b.add_box("planks_oak", (bx, 0.2, 3.98), (0.85, 0.55, 0.52), bevel=0.015)

    colliders = [
        bl_box_to_collider(2.6, 0.2, 0.55, 3.3, 0.72, 1.1),  # Bar counter
    ]
    export_hillside_model(b, "hillside_tavern_a2_interior", colliders=colliders, bake_ao=False)


# ---------------------------------------------------------------------------
# A3. Iron Anchor Apothecary & Alchemy Hall (Full Walkable Interior, Market SW)
# ---------------------------------------------------------------------------
def build_apothecary_a3() -> None:
    b = MeshBuilder("hillside_apothecary_a3", seed=704)
    W, D, H1, H2 = 9.0, 7.2, 3.5, 3.2
    hw, hd = W * 0.5, D * 0.5
    wt = 0.44

    b.add_box("stone_trim", (0.0, 0.0, -0.95), (W + 0.35, D + 0.35, 1.95), bevel=0.04)
    b.add_box("planks_oak", (0.0, 0.0, 0.03), (W - 0.4, D - 0.4, 0.12))

    # 1st floor stone-and-brick walls with 2.2m open front doorway at x = 0.0
    b.add_box("stone_ashlar", (0.0, hd - wt * 0.5, H1 * 0.5), (W, wt, H1), bevel=0.03)
    b.add_box("stone_ashlar", (-hw + wt * 0.5, 0.0, H1 * 0.5), (wt, D, H1), bevel=0.03)
    b.add_box("stone_ashlar", (hw - wt * 0.5, 0.0, H1 * 0.5), (wt, D, H1), bevel=0.03)
    b.add_box("stone_ashlar", (-2.8, -hd + wt * 0.5, H1 * 0.5), (3.4, wt, H1), bevel=0.03)
    b.add_box("stone_ashlar", (2.8, -hd + wt * 0.5, H1 * 0.5), (3.4, wt, H1), bevel=0.03)
    b.add_box("stone_ashlar", (0.0, -hd + wt * 0.5, 3.08), (2.4, wt, 0.84), bevel=0.025)
    b.add_stone_arch("stone_trim", (0.0, -hd - 0.02, 1.52), radius=1.15, depth=0.52, ring_thickness=0.24, num_voussoirs=9, facing_axis="Y")

    # Emerald striped shop awning over entrance
    b.add_box("awning_emerald", (0.0, -hd - 0.92, 2.82), (7.6, 1.85, 0.10), bevel=0.015, rot=(0.24, 0.0, 0.0))
    for px in (-3.6, -1.45, 1.45, 3.6):
        b.add_box("timber_oak", (px, -hd - 1.72, 1.32), (0.14, 0.14, 2.64), bevel=0.01)

    # Hanging Apothecary Sign
    b.add_box("iron_forged", (3.8, -hd - 1.25, 3.35), (0.08, 1.15, 0.08), bevel=0.008)
    b.add_planar_quad("sign_apothecary", (3.85, -hd - 1.75, 2.55), (3.85, -hd - 0.90, 2.55), (3.85, -hd - 0.90, 3.30), (3.85, -hd - 1.75, 3.30), double_sided=True)

    # Jettied 2nd & 3rd floor sage-plaster half-timbered upper stories
    uW, uD = W + 0.55, D + 0.60
    b.add_box("planks_oak", (0.0, 0.0, H1 + 0.06), (uW, uD, 0.18), bevel=0.02)
    b.add_box("plaster_sage", (0.0, -0.05, H1 + H2 * 0.5 + 0.1), (uW, uD, H2), bevel=0.02)
    add_timber_grid_wall(b, "timber_oak", (0.0, -uD * 0.5 - 0.05, H1 + 0.1), uW, H2, 4, "Y", True)
    add_timber_grid_wall(b, "timber_oak", (0.0, uD * 0.5 - 0.05, H1 + 0.1), uW, H2, 4, "Y", False)
    add_timber_grid_wall(b, "timber_oak", (-uW * 0.5, -0.05, H1 + 0.1), uD, H2, 3, "X", False)
    add_timber_grid_wall(b, "timber_oak", (uW * 0.5, -0.05, H1 + 0.1), uD, H2, 3, "X", False)

    for wx in (-2.9, 2.9):
        add_detailed_window(b, (wx, -hd - 0.03, 1.75), 1.05, 1.15, "Y", -1, shutters=True, flower_box=False)
    for wx in (-2.9, 0.0, 2.9):
        add_detailed_window(b, (wx, -uD * 0.5 - 0.07, H1 + 1.55), 1.05, 1.25, "Y", -1, shutters=True, flower_box=True)

    # Steep Slate Gable Roof + Chimney
    add_roof_helper(b, "roof_slate", "timber_oak", (0.0, -0.05, H1 + H2 + 0.12), span_width=uW, length=uD, pitch_height=3.45, overhang=0.65, along_axis="Y")
    b.add_chimney("brick_medieval", "stone_trim", (3.0, 1.8), H1 + H2 - 0.4, H1 + H2 + 4.1, width=0.92)

    colliders = [
        bl_box_to_collider(0.0, hd - wt * 0.5, H1 * 0.5, W, wt, H1),
        bl_box_to_collider(-hw + wt * 0.5, 0.0, H1 * 0.5, wt, D, H1),
        bl_box_to_collider(hw - wt * 0.5, 0.0, H1 * 0.5, wt, D, H1),
        bl_box_to_collider(-2.8, -hd + wt * 0.5, H1 * 0.5, 3.4, wt, H1),
        bl_box_to_collider(2.8, -hd + wt * 0.5, H1 * 0.5, 3.4, wt, H1),
    ]
    export_hillside_model(b, "hillside_apothecary_a3", colliders=colliders)


def build_apothecary_a3_interior() -> None:
    """Distance-culled (<28m) interior alchemy shelves, potion phials & counter for A3 Apothecary."""
    b = MeshBuilder("hillside_apothecary_a3_interior", seed=705)
    # Shop Counter along back-center
    b.add_box("planks_oak", (0.0, 1.4, 1.02), (3.8, 0.72, 0.10), bevel=0.012)
    b.add_box("timber_oak", (0.0, 1.4, 0.50), (3.65, 0.62, 0.94), bevel=0.015)
    # Tall Wall Apothecary Shelving + Colorful Potion Bottles along back & side walls
    for sx in (-3.6, 3.6):
        b.add_box("timber_oak", (sx, 0.2, 1.45), (0.42, 4.4, 2.75), bevel=0.015)
        for sz in (0.65, 1.25, 1.85, 2.40):
            b.add_box("planks_oak", (sx * 0.96, 0.2, sz), (0.48, 4.2, 0.06), bevel=0.008)
            for k in range(6):
                py = -1.55 + k * 0.62
                pmat = ("cloth_crimson", "awning_emerald", "cloth_navy", "brass_aged", "glow_warm")[((k + int(sz * 3)) % 5)]
                b.add_cylinder(pmat, (sx * 0.92, py, sz + 0.16), 0.075, 0.04, 0.24, segs=6)
    # Brass Alembic & Mortar on Alchemy Counter
    b.add_cylinder("brass_aged", (-0.95, 1.4, 1.26), 0.19, 0.11, 0.36, segs=10)
    b.add_cylinder("brass_aged", (-0.65, 1.4, 1.38), 0.05, 0.03, 0.42, segs=6, rot=(0.0, 0.9, 0.0))
    b.add_cylinder("glow_warm", (0.85, 1.4, 1.24), 0.09, 0.05, 0.28, segs=8)
    # Hanging Herb Bundles from oak rafters
    for hx in (-2.0, -0.6, 0.8, 2.1):
        b.add_cylinder("foliage_leaf", (hx, -0.4, 2.95), 0.08, 0.16, 0.55, segs=7)

    colliders = [
        bl_box_to_collider(0.0, 1.4, 0.52, 3.7, 0.68, 1.04),
    ]
    export_hillside_model(b, "hillside_apothecary_a3_interior", colliders=colliders, bake_ao=False)


# ---------------------------------------------------------------------------
# B1. South Gate Caravan Warehouse (B-Class Walkable Cargo Hall)
# ---------------------------------------------------------------------------
def build_warehouse_b1() -> None:
    b = MeshBuilder("hillside_warehouse_b1", seed=706)
    W, D, H = 8.4, 6.8, 4.4
    hw, hd = W * 0.5, D * 0.5
    wt = 0.42

    b.add_box("stone_trim", (0.0, 0.0, -0.9), (W + 0.3, D + 0.3, 1.85), bevel=0.04)
    b.add_box("stone_trim", (0.0, 0.0, 0.02), (W - 0.4, D - 0.4, 0.10))
    # Stone lower wall + Oak plank upper cargo hall
    b.add_box("stone_ashlar", (0.0, hd - wt * 0.5, 1.0), (W, wt, 2.0), bevel=0.025)
    b.add_box("planks_oak", (0.0, hd - wt * 0.5, 3.2), (W, wt, 2.4), bevel=0.02)
    for sx in (-hw + wt * 0.5, hw - wt * 0.5):
        b.add_box("stone_ashlar", (sx, 0.0, 1.0), (wt, D, 2.0), bevel=0.025)
        b.add_box("planks_oak", (sx, 0.0, 3.2), (wt, D, 2.4), bevel=0.02)
    # Front wall with wide 3.0m open double-barn entrance
    b.add_box("stone_ashlar", (-2.85, -hd + wt * 0.5, 1.0), (2.7, wt, 2.0), bevel=0.025)
    b.add_box("planks_oak", (-2.85, -hd + wt * 0.5, 3.2), (2.7, wt, 2.4), bevel=0.02)
    b.add_box("stone_ashlar", (2.85, -hd + wt * 0.5, 1.0), (2.7, wt, 2.0), bevel=0.025)
    b.add_box("planks_oak", (2.85, -hd + wt * 0.5, 3.2), (2.7, wt, 2.4), bevel=0.02)
    b.add_box("timber_oak", (0.0, -hd + wt * 0.5, 3.75), (3.2, wt + 0.06, 1.3), bevel=0.02)
    # Flung-open Heavy Barn Doors
    b.add_box("planks_oak", (-1.95, -hd - 0.65, 1.5), (0.14, 1.35, 2.95), bevel=0.015, rot=(0.0, 0.0, -0.45))
    b.add_box("planks_oak", (1.95, -hd - 0.65, 1.5), (0.14, 1.35, 2.95), bevel=0.015, rot=(0.0, 0.0, 0.45))
    # Overhead Cargo Hoist Beam projecting out front gable
    b.add_box("timber_oak", (0.0, -hd - 0.85, H + 0.9), (0.24, 2.4, 0.26), bevel=0.015)
    b.add_cylinder("iron_forged", (0.0, -hd - 1.65, H + 0.62), 0.16, 0.16, 0.10, segs=10, rot=(0.0, math.pi * 0.5, 0.0))
    # Steep Clay Roof + Solid Front/Back Timber-Plank Gable End Walls
    add_roof_helper(b, "roof_clay", "timber_oak", (0.0, 0.0, H), span_width=W + 0.2, length=D + 0.2, pitch_height=2.9, overhang=0.6, along_axis="Y")
    for sy in (-hd + wt * 0.5, hd - wt * 0.5):
        b.add_box("planks_oak", (0.0, sy, H + 0.65), (W * 0.72, wt, 1.35), bevel=0.02)
        b.add_box("planks_oak", (0.0, sy, H + 1.65), (W * 0.42, wt, 0.95), bevel=0.02)
        b.add_box("planks_oak", (0.0, sy, H + 2.35), (W * 0.18, wt, 0.65), bevel=0.015)
    # Walk-in Cargo Stacks (crates, barrels, grain sacks around perimeter, center clear!)
    b.add_box("planks_oak", (-2.6, 1.6, 0.55), (1.15, 1.15, 1.1), bevel=0.02)
    b.add_box("planks_oak", (-2.4, 1.6, 1.55), (0.90, 0.90, 0.90), bevel=0.02)
    b.add_box("planks_oak", (2.5, 1.7, 0.55), (1.2, 1.1, 1.1), bevel=0.02)
    b.add_cylinder("planks_oak", (2.7, 0.2, 0.50), 0.38, 0.36, 0.96, segs=10, bevel=0.02)
    b.add_cylinder("fabric_sack", (-2.6, 0.1, 0.42), 0.42, 0.28, 0.78, segs=9)

    colliders = [
        bl_box_to_collider(0.0, 0.0, -0.05, W - 0.1, D - 0.1, 0.22),  # Solid raised cargo floor
        bl_box_to_collider(0.0, hd - wt * 0.5, 2.2, W, wt, 4.4),
        bl_box_to_collider(-hw + wt * 0.5, 0.0, 2.2, wt, D, 4.4),
        bl_box_to_collider(hw - wt * 0.5, 0.0, 2.2, wt, D, 4.4),
        bl_box_to_collider(-2.85, -hd + wt * 0.5, 2.2, 2.7, wt, 4.4),
        bl_box_to_collider(2.85, -hd + wt * 0.5, 2.2, 2.7, wt, 4.4),
    ]
    export_hillside_model(b, "hillside_warehouse_b1", colliders=colliders)


# ---------------------------------------------------------------------------
# B2. Carter Rain Shelter & Repair Shed (B-Class Open-Sided Timber Shelter)
# ---------------------------------------------------------------------------
def build_carter_shed_b2() -> None:
    b = MeshBuilder("hillside_carter_shed_b2", seed=707)
    W, D = 6.2, 4.6
    b.add_box("stone_trim", (0.0, 0.0, -0.75), (W + 0.2, D + 0.2, 1.52), bevel=0.03)
    # Rear stone wall + timber posts
    b.add_box("stone_ashlar", (0.0, D * 0.5 - 0.22, 1.55), (W, 0.44, 3.1), bevel=0.03)
    for px in (-2.85, 0.0, 2.85):
        b.add_box("timber_oak", (px, -D * 0.5 + 0.18, 1.4), (0.22, 0.22, 2.8), bevel=0.015)
        b.add_box("timber_oak", (px, 0.0, 2.85), (0.18, D, 0.20), bevel=0.015, rot=(0.14, 0.0, 0.0))
    # Slanted Clay Lean-to Roof
    b.add_box("roof_clay", (0.0, -0.05, 3.12), (W + 0.8, D + 0.9, 0.20), bevel=0.02, rot=(0.18, 0.0, 0.0))
    # Repair Bench + Spare Wooden Wheels + Hay Bale
    b.add_box("planks_oak", (-1.5, 1.35, 0.85), (2.2, 0.75, 0.10), bevel=0.012)
    b.add_box("timber_oak", (-2.4, 1.35, 0.42), (0.14, 0.65, 0.82), bevel=0.01)
    b.add_box("timber_oak", (-0.6, 1.35, 0.42), (0.14, 0.65, 0.82), bevel=0.01)
    b.add_cylinder("timber_oak", (1.8, 1.55, 0.62), 0.58, 0.58, 0.12, segs=12, rot=(math.pi * 0.5, 0.0, 0.15))
    b.add_box("fabric_sack", (1.6, 0.4, 0.45), (1.15, 0.85, 0.85), bevel=0.04)

    colliders = [
        bl_box_to_collider(0.0, D * 0.5 - 0.22, 1.55, W, 0.46, 3.1),
        bl_box_to_collider(-1.5, 1.35, 0.45, 2.2, 0.78, 0.90),
    ]
    export_hillside_model(b, "hillside_carter_shed_b2", colliders=colliders)


# ---------------------------------------------------------------------------
# Monumental Market Covered Bridge-Arch (Tier 0 -> Tier 1 Vertical Portal)
# ---------------------------------------------------------------------------
def build_market_bridge_arch() -> None:
    b = MeshBuilder("hillside_market_bridge_arch", seed=708)
    # 6.0m wide open stone tunnel (x in [-3.0, +3.0], z = 0..4.9m) over Gateward Grand Steps!
    # Massive ashlar piers on left/right (x = ±5.0) + overhanging timber-framed gallery bridge room above!
    for sx in (-5.0, 5.0):
        b.add_box("stone_ashlar", (sx, 0.0, 2.1), (4.0, 5.4, 6.2), bevel=0.04)
        b.add_box("stone_trim", (sx, 0.0, -0.7), (4.3, 5.7, 1.1), bevel=0.03)
        b.add_box("stone_trim", (sx, 0.0, 5.25), (4.25, 5.65, 0.32), bevel=0.025)
    # Spandrel arch lintel & dual voussoir stone arch rings (south & north faces)
    b.add_box("stone_ashlar", (0.0, 0.0, 4.95), (6.4, 5.1, 1.15), bevel=0.03)
    for sy in (-2.62, 2.62):
        b.add_stone_arch("stone_trim", (0.0, sy, 2.05), radius=3.05, depth=0.68, ring_thickness=0.52, num_voussoirs=13, facing_axis="Y")
    # Corbelled timber brackets supporting the overhanging enclosed bridge gallery
    for bx in (-5.2, -3.4, -1.6, 0.0, 1.6, 3.4, 5.2):
        for sy in (-2.95, 2.95):
            b.add_box("timber_oak", (bx, sy, 5.15), (0.24, 0.72, 0.42), bevel=0.015)
    # Enclosed 2nd-Story Half-Timbered Gallery Room spanning the street (14.4m x 6.4m x 3.2m)
    b.add_box("plaster_cream", (0.0, 0.0, 7.05), (14.4, 6.4, 3.2), bevel=0.02)
    add_timber_grid_wall(b, "timber_oak", (0.0, -3.22, 5.45), 14.4, 3.2, 6, "Y", True)
    add_timber_grid_wall(b, "timber_oak", (0.0, 3.22, 5.45), 14.4, 3.2, 6, "Y", True)
    # Mullioned Gallery Windows + Central Oriel Bay Window looking south down Trade Street!
    b.add_box("timber_oak", (0.0, -3.65, 6.95), (2.5, 0.85, 2.15), bevel=0.02)
    add_detailed_window(b, (0.0, -4.10, 7.05), 1.45, 1.35, "Y", -1, shutters=False, flower_box=True)
    for wx in (-4.4, 4.4):
        add_detailed_window(b, (wx, -3.24, 7.05), 1.20, 1.25, "Y", -1, shutters=True, flower_box=True)
        add_detailed_window(b, (wx, 3.24, 7.05), 1.20, 1.25, "Y", 1, shutters=True, flower_box=False)
    add_detailed_window(b, (0.0, 3.24, 7.05), 1.35, 1.25, "Y", 1, shutters=True, flower_box=True)
    # Steep Clay Tile Roof with Central Bell Turret Cupola!
    add_roof_helper(b, "roof_clay", "timber_oak", (0.0, 0.0, 8.65), span_width=6.6, length=14.6, pitch_height=3.15, overhang=0.68, along_axis="X")
    b.add_box("stone_trim", (0.0, 0.0, 12.1), (1.7, 1.7, 1.4), bevel=0.03)
    b.add_cylinder("roof_slate", (0.0, 0.0, 13.75), 1.25, 0.08, 2.15, segs=8, bevel=0.015)
    # Flanking Crimson Ashenhold Banners
    for sx in (-3.8, 3.8):
        b.add_planar_quad("banner_ashenhold", (sx - 0.48, -2.85, 2.1), (sx + 0.48, -2.85, 2.1), (sx + 0.48, -2.85, 4.85), (sx - 0.48, -2.85, 4.85), double_sided=True)

    colliders = [
        bl_box_to_collider(-5.0, 0.0, 3.0, 4.0, 5.4, 6.2),
        bl_box_to_collider(5.0, 0.0, 3.0, 4.0, 5.4, 6.2),
    ]
    export_hillside_model(b, "hillside_market_bridge_arch", colliders=colliders)


# ---------------------------------------------------------------------------
# Monumental 4.2m Market North Retaining Wall + Twin Switchback Grand Staircases
# (Climbs cleanly from Tier 1 +3.5m -> Tier 2 Mid-Terrace Overlook +7.5m!)
# ---------------------------------------------------------------------------
def build_retaining_staircase() -> None:
    b = MeshBuilder("hillside_retaining_staircase", seed=709)
    # Origin at (0, 0, 0) placed at Market North edge (x=0, y=3.5m, z=-51.5m).
    # Wall rises z_bl = 0.0 -> 4.05m (top deck at +4.0m local = +7.5m world!).
    # Twin grand staircases climb symmetrically from outer bases (x = ±11.6, y_bl = -2.2)
    # inward along the wall face up to the central overlook landing (x = ±3.2, y_bl = -2.2, z_bl = 4.0m)!
    WALL_W = 32.0
    WALL_H = 4.05

    # Main massive ashlar retaining wall core
    b.add_box("stone_ashlar", (0.0, 1.5, WALL_H * 0.5 - 0.25), (WALL_W, 3.2, WALL_H + 0.5), bevel=0.04)
    # Top stone coping cornice along full retaining wall
    b.add_box("stone_trim", (0.0, 1.4, WALL_H + 0.08), (WALL_W + 0.4, 3.6, 0.26), bevel=0.025)
    # Central blind arch alcove + carved crest pier on the wall face (between twin stairs)
    b.add_box("stone_trim", (0.0, -0.35, WALL_H * 0.5), (5.6, 0.85, WALL_H), bevel=0.03)
    b.add_stone_arch("stone_trim", (0.0, -0.82, 1.55), radius=1.65, depth=0.45, ring_thickness=0.32, num_voussoirs=11, facing_axis="Y")
    b.add_box("stone_ashlar", (0.0, -0.58, 1.35), (2.7, 0.25, 2.7), bevel=0.02)
    # Stepped buttresses on outer ends
    for bx in (-14.8, -12.6, 12.6, 14.8):
        b.add_box("stone_trim", (bx, -0.32, WALL_H * 0.48), (1.05, 0.95, WALL_H * 0.96), bevel=0.03)

    # Central +4.0m Overlook Landing Platform (x in [-3.6, +3.6], y_bl in [-3.4, +3.2])
    b.add_box("stone_ashlar", (0.0, -1.7, WALL_H * 0.5 - 0.1), (7.2, 3.5, WALL_H + 0.2), bevel=0.03)
    b.add_box("stone_trim", (0.0, -1.7, WALL_H + 0.02), (6.9, 3.2, 0.12), bevel=0.01)

    # Twin Symmetrical Grand Stone Staircases (climb 4.0m vertically over 8.2m horizontally -> gentle 26° grade!)
    # Left stair: x_bl from -11.8 (z=0.0) to -3.6 (z=4.0), y_bl = -1.75 (depth 2.8m)
    # Right stair: x_bl from +11.8 (z=0.0) to +3.6 (z=4.0), y_bl = -1.75 (depth 2.8m)
    n_steps = 16
    span_x = 8.2
    for side in (-1, 1):
        # Solid masonry under-stair cheek block
        for k in range(n_steps):
            t = (k + 0.5) / n_steps
            sh = (k + 1) / n_steps * WALL_H
            sx = side * (11.8 - t * span_x)
            step_w = span_x / n_steps + 0.05
            b.add_box("stone_ashlar", (sx, -1.75, sh * 0.5 - 0.15), (step_w, 2.85, sh + 0.3), bevel=0.015)
            b.add_box("stone_trim", (sx, -1.75, sh - 0.04), (step_w + 0.03, 2.95, 0.09), bevel=0.01)
        # Outer stone balustrade wall along front edge of stairs (y_bl = -3.18)
        ang = math.atan2(WALL_H, span_x)
        slen = math.hypot(span_x, WALL_H)
        b.add_box(
            "stone_trim",
            (side * 7.7, -3.18, WALL_H * 0.5 + 0.52),
            (slen, 0.34, 0.96),
            bevel=0.02,
            rot=(0.0, side * ang, 0.0),
        )
        # Base newel lantern pier
        b.add_box("stone_trim", (side * 12.05, -3.18, 0.72), (0.68, 0.68, 1.44), bevel=0.025)
        b.add_box("iron_forged", (side * 12.05, -3.18, 1.72), (0.28, 0.28, 0.52), bevel=0.01)
        b.add_box("glow_warm", (side * 12.05, -3.18, 1.72), (0.18, 0.18, 0.34))

    # Carved Stone Balustrade across Top +4.0m Overlook Front Edge & Wings
    b.add_box("stone_trim", (0.0, -3.32, WALL_H + 0.98), (7.2, 0.32, 0.18), bevel=0.02)
    b.add_box("stone_trim", (0.0, -3.32, WALL_H + 0.18), (7.2, 0.34, 0.24), bevel=0.02)
    for bx in (-3.3, -2.2, -1.1, 0.0, 1.1, 2.2, 3.3):
        b.add_box("stone_trim", (bx, -3.32, WALL_H + 0.58), (0.24, 0.24, 0.68), bevel=0.015)
    # Wing parapet balustrades atop retaining wall (x in [-15.8, -3.6] and [+3.6, +15.8])
    for side in (-1, 1):
        b.add_box("stone_trim", (side * 9.7, -0.05, WALL_H + 0.56), (12.2, 0.38, 1.02), bevel=0.025)
        # Tall Crimson Banner Posts framing the Overlook!
        b.add_cylinder("timber_oak", (side * 3.45, -3.32, WALL_H + 2.4), 0.08, 0.06, 4.6, segs=8)
        b.add_planar_quad("banner_ashenhold", (side * 3.45 - 0.45, -3.52, WALL_H + 1.4), (side * 3.45 + 0.45, -3.52, WALL_H + 1.4), (side * 3.45 + 0.45, -3.52, WALL_H + 4.1), (side * 3.45 - 0.45, -3.52, WALL_H + 4.1), double_sided=True)

    # Exact Colliders: Solid Retaining Wall + Overlook Floor + Parapets + TWO SMOOTH SLOPED RAMP COLLIDERS!
    colliders = [
        # Main retaining wall block (y_bl = +1.5 -> z_three = -1.5)
        bl_box_to_collider(0.0, 1.5, WALL_H * 0.5, WALL_W, 3.1, WALL_H),
        # Central Overlook deck support + floor
        bl_box_to_collider(0.0, -1.7, WALL_H * 0.5, 7.2, 3.5, WALL_H),
        # Overlook front balustrade guardrail
        bl_box_to_collider(0.0, -3.32, WALL_H + 0.6, 7.2, 0.36, 1.2),
        # Wing parapet guardrails
        bl_box_to_collider(-9.7, -0.05, WALL_H + 0.6, 12.2, 0.40, 1.2),
        bl_box_to_collider(9.7, -0.05, WALL_H + 0.6, 12.2, 0.40, 1.2),
    ]
    # Left stair climbs along +X (x=-11.8, y=0 -> x=-3.6, y=4.0): roll = +atan2(4.0, 8.2)
    # Right stair climbs along -X (x=+11.8, y=0 -> x=+3.6, y=4.0): roll = -atan2(4.0, 8.2)
    # Three.js Z = -Blender Y = +1.75
    ramp_len = math.hypot(span_x, WALL_H)
    ramp_ang = math.atan2(WALL_H, span_x)
    oriented = [
        {
            "center": [-7.7, round(WALL_H * 0.5 - 0.14, 3), 1.75],
            "half": [round(ramp_len * 0.5 + 0.2, 3), 0.16, 1.45],
            "rot": [0.0, 0.0, round(ramp_ang, 4)],
        },
        {
            "center": [7.7, round(WALL_H * 0.5 - 0.14, 3), 1.75],
            "half": [round(ramp_len * 0.5 + 0.2, 3), 0.16, 1.45],
            "rot": [0.0, 0.0, round(-ramp_ang, 4)],
        },
    ]
    export_hillside_model(b, "hillside_retaining_staircase", colliders=colliders, oriented_colliders=oriented)


# ---------------------------------------------------------------------------
# Modular 4.2m Tall Stepped Hillside Terrace Retaining Wall (16m Instanced)
# ---------------------------------------------------------------------------
def build_terrace_wall_16m() -> None:
    b = MeshBuilder("hillside_terrace_wall_16m", seed=710)
    b.add_box("stone_ashlar", (0.0, 0.0, 2.0), (16.0, 2.2, 4.4), bevel=0.04)
    b.add_box("stone_trim", (0.0, 0.0, 4.28), (16.0, 2.5, 0.30), bevel=0.025)
    # Parapet wall along front edge
    b.add_box("stone_trim", (0.0, -0.95, 4.82), (16.0, 0.42, 0.88), bevel=0.02)
    for bx in (-6.0, 0.0, 6.0):
        b.add_box("stone_trim", (bx, -1.25, 1.95), (0.95, 0.72, 4.2), bevel=0.03)
    export_hillside_model(
        b,
        "hillside_terrace_wall_16m",
        colliders=[bl_box_to_collider(0.0, 0.0, 2.6, 16.0, 2.3, 5.2)],
        bake_ao=False,
    )


# ---------------------------------------------------------------------------
# Compact Narrow-Street Terraced Houses (C-Class, 3 Distinct Medieval Profiles)
# ---------------------------------------------------------------------------
def build_narrow_terraced_houses() -> None:
    specs = [
        ("hillside_c_narrow_a", 6.6, 6.4, 3.2, 3.1, 2.6, "stone_ashlar", "plaster_cream", "roof_clay", "X", True, 711),
        ("hillside_c_narrow_b", 6.8, 6.8, 3.4, 3.2, 2.8, "brick_medieval", "plaster_ochre", "roof_slate", "Y", True, 712),
        ("hillside_c_narrow_c", 6.4, 6.2, 3.1, 3.0, 2.5, "stone_ashlar", "plaster_sage", "roof_clay", "Y", False, 713),
    ]
    for name, w, d, h1, h2, h3, base_mat, upper_mat, roof_mat, roof_axis, has_balcony, seed in specs:
        b = MeshBuilder(name, seed=seed)
        hw, hd = w * 0.5, d * 0.5
        # Deep plinth (-2.2m) so houses on hillside slopes never float!
        b.add_box("stone_trim", (0.0, 0.0, -1.1), (w + 0.3, d + 0.3, 2.25), bevel=0.04)
        b.add_box(base_mat, (0.0, 0.0, h1 * 0.5), (w, d, h1), bevel=0.03)
        # Jettied 2nd floor
        uW, uD = w + 0.45, d + 0.55
        b.add_box("timber_oak", (0.0, -0.1, h1), (uW + 0.1, uD + 0.1, 0.22), bevel=0.02)
        b.add_box(upper_mat, (0.0, -0.1, h1 + h2 * 0.5), (uW, uD, h2), bevel=0.02)
        add_timber_grid_wall(b, "timber_oak", (0.0, -uD * 0.5 - 0.1, h1), uW, h2, 3, "Y", True)
        add_timber_grid_wall(b, "timber_oak", (0.0, uD * 0.5 - 0.1, h1), uW, h2, 3, "Y", False)
        add_timber_grid_wall(b, "timber_oak", (-uW * 0.5, -0.1, h1), uD, h2, 2, "X", False)
        add_timber_grid_wall(b, "timber_oak", (uW * 0.5, -0.1, h1), uD, h2, 2, "X", False)
        # 3rd floor double-jettied attic story for authentic tight medieval skyline
        tW, tD = uW + 0.35, uD + 0.40
        b.add_box(upper_mat, (0.0, -0.2, h1 + h2 + h3 * 0.5), (tW, tD, h3), bevel=0.02)
        add_timber_grid_wall(b, "timber_oak", (0.0, -tD * 0.5 - 0.2, h1 + h2), tW, h3, 3, "Y", True)
        # Front door + windows + optional cantilevered wooden balcony
        b.add_box("planks_oak", (-1.1, -hd - 0.02, 1.15), (1.15, 0.14, 2.3), bevel=0.015)
        b.add_stone_arch("stone_trim", (-1.1, -hd - 0.04, 1.4), radius=0.68, depth=0.22, ring_thickness=0.16, num_voussoirs=7, facing_axis="Y")
        add_detailed_window(b, (1.45, -hd - 0.04, 1.65), 1.05, 1.15, "Y", -1, shutters=True, flower_box=True)
        for wx in (-1.6, 1.6):
            add_detailed_window(b, (wx, -uD * 0.5 - 0.12, h1 + 1.55), 1.05, 1.20, "Y", -1, shutters=True, flower_box=True)
        add_detailed_window(b, (0.0, -tD * 0.5 - 0.22, h1 + h2 + 1.25), 1.15, 1.10, "Y", -1, shutters=True, flower_box=True)
        if has_balcony:
            b.add_box("planks_oak", (0.0, -uD * 0.5 - 0.62, h1 + 0.12), (3.4, 1.05, 0.14), bevel=0.015)
            b.add_box("timber_oak", (0.0, -uD * 0.5 - 1.08, h1 + 1.02), (3.4, 0.10, 0.10), bevel=0.01)
            for rx in (-1.6, -0.8, 0.0, 0.8, 1.6):
                b.add_box("timber_oak", (rx, -uD * 0.5 - 1.08, h1 + 0.56), (0.08, 0.08, 0.86), bevel=0.008)
        # Steep Roof + Tall Brick Chimney
        top_z = h1 + h2 + h3
        add_roof_helper(
            b,
            roof_mat,
            "timber_oak",
            (0.0, -0.2, top_z),
            span_width=tD if roof_axis == "X" else tW,
            length=tW if roof_axis == "X" else tD,
            pitch_height=2.95,
            overhang=0.62,
            along_axis=roof_axis,
        )
        b.add_chimney("brick_medieval", "stone_trim", (1.9, 1.4), top_z - 0.4, top_z + 3.4, width=0.82)
        export_hillside_model(
            b,
            name,
            colliders=[bl_box_to_collider(0.0, 0.0, (h1 + h2) * 0.5, w + 0.2, d + 0.2, h1 + h2)],
        )


# ---------------------------------------------------------------------------
# Medieval Timber Construction / Guard Barricade (Clear Phase 3 / Phase 4 Gate)
# ---------------------------------------------------------------------------
def build_guard_barricade() -> None:
    b = MeshBuilder("hillside_guard_barricade", seed=714)
    W = 6.2
    for px in (-2.8, 0.0, 2.8):
        b.add_box("timber_oak", (px, 0.0, 0.72), (0.24, 0.24, 1.44), bevel=0.015)
        b.add_box("timber_oak", (px, 0.35, 0.45), (0.16, 0.95, 0.18), bevel=0.01, rot=(0.65, 0.0, 0.0))
    for hz in (0.45, 1.05):
        b.add_box("planks_oak", (0.0, -0.14, hz), (W, 0.12, 0.24), bevel=0.015)
    b.add_planar_quad("banner_ashenhold", (-0.52, -0.24, 0.20), (0.52, -0.24, 0.20), (0.52, -0.24, 1.32), (-0.52, -0.24, 1.32), double_sided=True)
    export_hillside_model(
        b,
        "hillside_guard_barricade",
        colliders=[bl_box_to_collider(0.0, 0.0, 0.85, W, 0.65, 1.7)],
        bake_ao=False,
    )


def main() -> None:
    build_guardhouse_a1()
    build_tavern_a2()
    build_tavern_a2_interior()
    build_apothecary_a3()
    build_apothecary_a3_interior()
    build_warehouse_b1()
    build_carter_shed_b2()
    build_market_bridge_arch()
    build_retaining_staircase()
    build_terrace_wall_16m()
    build_narrow_terraced_houses()
    build_guard_barricade()

    manifest_path = OUT_DIR / "hillside_manifest.json"
    manifest_path.write_text(json.dumps(MANIFEST, indent=2), encoding="utf-8")
    print(f"Generated {len(MANIFEST)} Hillside Redesign Phase-2 models -> {manifest_path}")


if __name__ == "__main__":
    main()
