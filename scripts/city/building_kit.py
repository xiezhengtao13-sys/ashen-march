#!/usr/bin/env python3
"""
Blender 4.0+ parametric medieval building, market stall, arch & citadel generator
for Ashenhold (灰烬城) 200x240m expansion (Phase 2).

Canonical local orientation before GLTF export (+Y up in Three.js):
  Blender local X  -> Three.js +X (width)
  Blender local -Y -> Three.js +Z (front facade faces South when yaw = 0)
  Blender local Z  -> Three.js +Y (up)

Outputs .glb models + kit_manifest.json (exact local colliders) into public/assets/city/models/.
Run via:
  blender --background --python scripts/city/building_kit.py
"""
import json
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from generate_models import MATERIAL_SPECS, MeshBuilder, OUT_DIR, reset_scene  # noqa: E402

MANIFEST: dict[str, dict] = {}


def export_model(
    b: MeshBuilder,
    model_name: str,
    colliders: list[dict] | None = None,
    cylinders: list[dict] | None = None,
    bake_ao: bool = True,
) -> None:
    reset_scene()
    # Add missing fallback materials if needed
    for mat_name in b.mat_names:
        if mat_name not in MATERIAL_SPECS:
            raise ValueError(f"Unknown material '{mat_name}' in {model_name}")
    b.finalize_and_export(OUT_DIR / f"{model_name}.glb", bake_ao=bake_ao, basal_height=0.70)
    MANIFEST[f"{model_name}.glb"] = {
        "colliders": colliders or [],
        "cylinderColliders": cylinders or [],
    }


def add_diagonal_timber_bay(
    b: MeshBuilder,
    mat: str,
    cx: float,
    cy: float,
    cz: float,
    span_w: float,
    bay_h: float,
    normal_axis: str,
    thickness: float = 0.14,
    mode: str = "brace",
) -> None:
    """Half-timber diagonal wind-braces or St. Andrew cross inside a wall bay."""
    diag_len = math.hypot(span_w * 0.45, bay_h * 0.85)
    ang = math.atan2(bay_h * 0.85, span_w * 0.45)
    if normal_axis == "Y":
        if mode == "x_brace":
            b.add_box(mat, (cx, cy, cz), (diag_len, thickness, thickness), bevel=0.008, rot=(0.0, ang, 0.0))
            b.add_box(mat, (cx, cy, cz), (diag_len, thickness, thickness), bevel=0.008, rot=(0.0, -ang, 0.0))
        else:
            b.add_box(mat, (cx - span_w * 0.25, cy, cz), (diag_len * 0.85, thickness, thickness), bevel=0.008, rot=(0.0, ang, 0.0))
            b.add_box(mat, (cx + span_w * 0.25, cy, cz), (diag_len * 0.85, thickness, thickness), bevel=0.008, rot=(0.0, -ang, 0.0))
    else:
        if mode == "x_brace":
            b.add_box(mat, (cx, cy, cz), (thickness, diag_len, thickness), bevel=0.008, rot=(ang, 0.0, 0.0))
            b.add_box(mat, (cx, cy, cz), (thickness, diag_len, thickness), bevel=0.008, rot=(-ang, 0.0, 0.0))
        else:
            b.add_box(mat, (cx, cy - span_w * 0.25, cz), (thickness, diag_len * 0.85, thickness), bevel=0.008, rot=(ang, 0.0, 0.0))
            b.add_box(mat, (cx, cy + span_w * 0.25, cz), (thickness, diag_len * 0.85, thickness), bevel=0.008, rot=(-ang, 0.0, 0.0))


def add_gable_dormer(
    b: MeshBuilder,
    center: tuple[float, float, float],
    width: float,
    height: float,
    depth: float,
    wall_mat: str,
    roof_mat: str,
    facing_y: float = -1.0,
) -> None:
    """Small pitched roof dormer breaking a roof slope."""
    cx, cy, cz = center
    b.add_box(wall_mat, (cx, cy, cz), (width, depth, height), bevel=0.015)
    b.add_box("timber_oak", (cx - width * 0.48, cy + facing_y * depth * 0.48, cz), (0.11, 0.12, height), bevel=0.008)
    b.add_box("timber_oak", (cx + width * 0.48, cy + facing_y * depth * 0.48, cz), (0.11, 0.12, height), bevel=0.008)
    b.add_recessed_window((cx, cy + facing_y * (depth * 0.5), cz), width * 0.65, height * 0.66, (0.0, facing_y), with_shutters=False, glow=True)
    b.add_wedge_block(wall_mat, [(-width * 0.5, cz + height * 0.5), (width * 0.5, cz + height * 0.5), (0.0, cz + height * 0.5 + width * 0.55)], cy + facing_y * (depth * 0.44), 0.14, bevel=0.01)
    b.add_pitched_tiled_roof(roof_mat, "timber_oak", (cx, cy, cz + height * 0.5), length=depth + 0.2, half_span=width * 0.52, rise=width * 0.55, along_axis="Y", overhang=0.22, eave_rafters=False, with_3d_tiles=False)


def build_townhouse(
    model_name: str,
    seed: int,
    width: float = 8.4,
    depth: float = 7.2,
    ground_h: float = 3.5,
    upper_floors: int = 1,
    floor_h: float = 2.95,
    ground_mat: str = "stone_ashlar",
    upper_mat: str = "plaster_cream",
    roof_mat: str = "roof_slate",
    roof_style: str = "gable_front",  # gable_front | gable_side | hipped | stepped_flemish | gambrel
    jetty: float = 0.36,
    timber_style: str = "brace",  # brace | x_brace | grid
    front_door_offset: float = 0.0,
    with_porch: bool = False,
    with_balcony: bool = False,
    with_bay_window: bool = False,
    with_dormers: int = 0,
    with_side_lean_to: str | None = None,  # None | 'left' | 'right' | 'smithy_forge'
    sign_mat: str | None = None,
    awning_mat: str | None = None,
    chimney_side: str = "back_right",
) -> None:
    """
    Parametric medieval building builder creating structurally rich, unique non-cloned houses
    with recessed plinths, stone quoins, cantilevered jetties + curved oak knee braces,
    half-timber bracing, shuttered windows, flowerboxes, porches, balconies & chimneys.
    """
    b = MeshBuilder(model_name, seed=seed)
    hw, hd = width * 0.5, depth * 0.5

    # 1. Foundation Stone Plinth (extends -0.45m below ground origin for sloped hillside seating!)
    b.add_box("stone_trim", (0.0, 0.0, -0.10), (width + 0.36, depth + 0.36, 0.80), bevel=0.03)

    # 2. Ground Story Walls + Corner Stone Quoins (for stone/brick bases)
    b.add_box(ground_mat, (0.0, 0.0, ground_h * 0.5), (width, depth, ground_h), bevel=0.028)
    if ground_mat in ("stone_ashlar", "brick_medieval"):
        b.add_stone_quoins("stone_trim", -hw, -hd, 0.25, ground_h, 1.0, 1.0)
        b.add_stone_quoins("stone_trim", hw, -hd, 0.25, ground_h, -1.0, 1.0)
        b.add_stone_quoins("stone_trim", -hw, hd, 0.25, ground_h, 1.0, -1.0)
        b.add_stone_quoins("stone_trim", hw, hd, 0.25, ground_h, -1.0, -1.0)
    else:
        for sx in (-hw, hw):
            for sy in (-hd, hd):
                b.add_box("timber_oak", (sx, sy, ground_h * 0.5), (0.22, 0.22, ground_h), bevel=0.015)

    # Front Door on -Y facade (Three.js +Z)
    dx = front_door_offset
    b.add_stone_arch("stone_trim", (dx, -hd - 0.04, 1.85), radius=0.82, depth=0.36, ring_thickness=0.22, num_voussoirs=7, facing_axis="Y")
    b.add_box("planks_oak", (dx, -hd + 0.02, 1.25), (1.42, 0.16, 2.38), bevel=0.015)
    b.add_box("iron_forged", (dx - 0.42, -hd - 0.07, 1.2), (0.22, 0.05, 0.08), bevel=0.005)
    # Stone stoop step
    b.add_box("stone_trim", (dx, -hd - 0.45, 0.06), (2.1, 0.85, 0.26), bevel=0.02)

    # Ground windows flanking doorway
    win_candidates = [-hw + 1.45, 0.0, hw - 1.45]
    for wx in win_candidates:
        if abs(wx - dx) < 1.85:
            continue
        if with_bay_window and abs(wx - (-hw + 1.45)) < 0.5:
            b.add_box("stone_trim", (wx, -hd - 0.34, 0.58), (1.95, 0.68, 1.16), bevel=0.02)
            b.add_recessed_window((wx, -hd - 0.65, 1.82), 1.65, 1.35, (0.0, -1.0), frame_mat="timber_oak", with_shutters=False, with_flowerbox=True, glow=True)
            b.add_box(roof_mat, (wx, -hd - 0.42, 2.75), (2.15, 0.88, 0.14), bevel=0.012, rot=(-0.38, 0.0, 0.0))
        else:
            b.add_recessed_window((wx, -hd - 0.02, 1.82), 1.25, 1.32, (0.0, -1.0), frame_mat="timber_oak", with_shutters=True, glow=True)

    # Side ground windows for streets passing perpendicular
    for side in (-1, 1):
        if with_side_lean_to == ("left" if side == -1 else "right"):
            continue
        if with_side_lean_to == "smithy_forge" and side == -1:
            continue
        b.add_recessed_window((side * (hw + 0.02), 0.0, 1.85), 1.2, 1.25, (float(side), 0.0), frame_mat="timber_oak", with_shutters=True, glow=True)

    # Optional Covered Shop Awning or Timber Colonnade Porch on front (-Y)
    if with_porch:
        px0, px1 = -hw + 0.4, hw - 0.4
        n_posts = max(3, int(width / 2.8) + 1)
        for pi in range(n_posts):
            px = px0 + (px1 - px0) * (pi / max(1, n_posts - 1))
            b.add_box("stone_trim", (px, -hd - 1.05, 0.22), (0.38, 0.38, 0.44), bevel=0.02)
            b.add_box("timber_oak", (px, -hd - 1.05, 1.58), (0.20, 0.20, 2.50), bevel=0.015)
        b.add_box("timber_oak", (0.0, -hd - 1.05, 2.90), (width - 0.4, 0.24, 0.24), bevel=0.015)
        b.add_box(roof_mat, (0.0, -hd - 0.62, 3.12), (width + 0.2, 1.45, 0.14), bevel=0.012, rot=(-0.25, 0.0, 0.0))
    elif awning_mat:
        b.add_box("timber_oak", (0.0, -hd - 0.08, 2.86), (width - 0.6, 0.16, 0.16), bevel=0.01)
        b.add_box(awning_mat, (0.0, -hd - 0.85, 2.55), (width - 0.5, 1.75, 0.08), bevel=0.01, rot=(-0.36, 0.0, 0.0))
        for ax in (-hw + 0.55, hw - 0.55):
            b.add_box("timber_oak", (ax, -hd - 0.82, 2.38), (0.09, 1.65, 0.09), bevel=0.008, rot=(-0.36, 0.0, 0.0))

    # Optional Wrought-Iron Balcony on 2nd floor front (-Y)
    if with_balcony:
        bw = min(3.4, width * 0.48)
        for bx in (-bw * 0.38, 0.0, bw * 0.38):
            b.add_box("stone_trim", (bx, -hd - jetty - 0.34, ground_h - 0.18), (0.24, 0.72, 0.30), bevel=0.015)
        b.add_box("stone_trim", (0.0, -hd - jetty - 0.46, ground_h + 0.06), (bw + 0.2, 0.92, 0.14), bevel=0.015)
        b.add_box("iron_forged", (0.0, -hd - jetty - 0.88, ground_h + 0.96), (bw + 0.15, 0.07, 0.07), bevel=0.006)
        n_bars = max(5, int(bw / 0.28))
        for bi in range(n_bars):
            bx = -bw * 0.48 + (bi / max(1, n_bars - 1)) * bw * 0.96
            b.add_box("iron_forged", (bx, -hd - jetty - 0.88, ground_h + 0.52), (0.045, 0.045, 0.85), bevel=0.004)

    # Hanging Shop Sign on Forged Iron Bracket
    if sign_mat:
        sx = dx + 1.45 if dx <= 0 else dx - 1.45
        b.add_box("iron_forged", (sx, -hd - 0.65, ground_h - 0.05), (0.08, 1.25, 0.08), bevel=0.006)
        b.add_box("timber_oak", (sx, -hd - 0.86, ground_h - 0.58), (0.08, 0.88, 0.82), bevel=0.01)
        b.add_planar_quad(sign_mat, (sx - 0.05, -hd - 1.26, ground_h - 0.95), (sx - 0.05, -hd - 0.46, ground_h - 0.95), (sx - 0.05, -hd - 0.46, ground_h - 0.22), (sx - 0.05, -hd - 1.26, ground_h - 0.22))
        b.add_planar_quad(sign_mat, (sx + 0.05, -hd - 0.46, ground_h - 0.95), (sx + 0.05, -hd - 1.26, ground_h - 0.95), (sx + 0.05, -hd - 1.26, ground_h - 0.22), (sx + 0.05, -hd - 0.46, ground_h - 0.22))

    # 3. Upper Cantilevered Half-Timbered Floors
    cur_z = ground_h
    uw, ud = width, depth
    for fl in range(upper_floors):
        j_amt = jetty if fl == 0 else jetty * 0.55
        uw += j_amt * 0.8
        ud += j_amt * 2.0
        uhw, uhd = uw * 0.5, ud * 0.5

        # Heavy oak floor bressummer plate & curved jetty knee braces on front (-Y) & back (+Y)
        b.add_box("timber_oak", (0.0, 0.0, cur_z + 0.08), (uw + 0.16, ud + 0.16, 0.22), bevel=0.016)
        if j_amt > 0.15:
            n_braces = max(3, int(width / 2.3) + 1)
            for bi in range(n_braces):
                bx = (-hw + 0.55) + (width - 1.1) * (bi / max(1, n_braces - 1))
                b.add_jetty_brace("timber_oak", (bx, -hd, cur_z - 0.68), (0.0, -1.0), reach=j_amt + 0.10, height=0.68, thickness=0.14)

        b.add_box(upper_mat, (0.0, 0.0, cur_z + 0.18 + floor_h * 0.5), (uw, ud, floor_h), bevel=0.02)
        # Perimeter horizontal framing timbers
        for tz in (cur_z + 0.24, cur_z + 0.18 + floor_h - 0.08):
            b.add_box("timber_oak", (0.0, 0.0, tz), (uw + 0.14, ud + 0.14, 0.16), bevel=0.012)

        # Vertical bays + diagonal bracing
        n_bays = max(2, int(round(uw / 2.6)))
        bay_w = uw / n_bays
        for bi in range(n_bays + 1):
            px = -uhw + bi * bay_w
            for sy in (-uhd, uhd):
                b.add_box("timber_oak", (px, sy, cur_z + 0.18 + floor_h * 0.5), (0.16, 0.16, floor_h), bevel=0.01)
            if bi < n_bays:
                mid_x = px + bay_w * 0.5
                win_center_z = cur_z + 0.18 + floor_h * 0.52
                b.add_recessed_window(
                    (mid_x, -uhd - 0.02, win_center_z),
                    min(1.22, bay_w * 0.52),
                    min(1.36, floor_h * 0.52),
                    (0.0, -1.0),
                    with_shutters=True,
                    with_flowerbox=(fl == 0 and bi % 2 == 0),
                    glow=True,
                )
                if timber_style in ("brace", "x_brace") and bay_w > 2.2:
                    add_diagonal_timber_bay(b, "timber_oak", mid_x, uhd + 0.01, cur_z + 0.18 + floor_h * 0.5, bay_w * 0.78, floor_h * 0.85, "Y", mode=timber_style)

        # Side walls timber posts + side windows + bracing
        n_sbays = max(2, int(round(ud / 2.8)))
        sbay_d = ud / n_sbays
        for si in range(n_sbays + 1):
            py = -uhd + si * sbay_d
            for sx in (-uhw, uhw):
                b.add_box("timber_oak", (sx, py, cur_z + 0.18 + floor_h * 0.5), (0.16, 0.16, floor_h), bevel=0.01)
            if si < n_sbays:
                mid_y = py + sbay_d * 0.5
                for sx in (-1, 1):
                    if si % 2 == 0:
                        b.add_recessed_window((sx * (uhw + 0.02), mid_y, cur_z + 0.18 + floor_h * 0.52), 1.05, 1.25, (float(sx), 0.0), with_shutters=True, glow=True)
                    elif timber_style in ("brace", "x_brace"):
                        add_diagonal_timber_bay(b, "timber_oak", sx * (uhw + 0.01), mid_y, cur_z + 0.18 + floor_h * 0.5, sbay_d * 0.78, floor_h * 0.85, "X", mode=timber_style)

        cur_z += 0.18 + floor_h

    # 4. Roof Variants (gable_front | gable_side | hipped | stepped_flemish | gambrel)
    eave_z = cur_z
    ridge_rise = min(4.2, (uw if roof_style in ("gable_front", "stepped_flemish", "gambrel") else ud) * 0.44)
    if roof_style == "gable_front":
        for gy in (-ud * 0.5 + 0.12, ud * 0.5 - 0.12):
            b.add_wedge_block(upper_mat, [(-uw * 0.5, eave_z), (uw * 0.5, eave_z), (0.0, eave_z + ridge_rise)], gy, 0.26, bevel=0.015)
        b.add_pitched_tiled_roof(roof_mat, "timber_oak", (0.0, 0.0, eave_z), length=ud, half_span=uw * 0.5, rise=ridge_rise, along_axis="Y", overhang=0.52, eave_rafters=True, with_3d_tiles=False)
        b.add_recessed_window((0.0, -ud * 0.5 - 0.02, eave_z + ridge_rise * 0.42), 1.05, 1.2, (0.0, -1.0), with_shutters=True, glow=True)
    elif roof_style == "stepped_flemish":
        for gy in (-ud * 0.5 + 0.14, ud * 0.5 - 0.14):
            b.add_wedge_block(ground_mat, [(-uw * 0.5, eave_z), (uw * 0.5, eave_z), (0.0, eave_z + ridge_rise)], gy, 0.34, bevel=0.02)
        n_steps = 4
        for step in range(n_steps):
            frac = step / n_steps
            sx_pos = uw * 0.46 * (1.0 - frac * 0.82)
            sz_pos = eave_z + 0.45 + frac * (ridge_rise - 0.55)
            for sgn in (-1, 1):
                b.add_box(ground_mat, (sgn * sx_pos, -ud * 0.5 + 0.06, sz_pos), (0.85, 0.42, 0.85), bevel=0.02)
                b.add_box("stone_trim", (sgn * sx_pos, -ud * 0.5 + 0.06, sz_pos + 0.46), (0.98, 0.52, 0.13), bevel=0.015)
        b.add_box("stone_trim", (0.0, -ud * 0.5 + 0.06, eave_z + ridge_rise + 0.25), (1.15, 0.52, 0.65), bevel=0.02)
        # Cargo hoist beam sticking out front stepped gable
        b.add_box("timber_oak", (0.0, -ud * 0.5 - 0.55, eave_z + ridge_rise * 0.72), (0.20, 1.25, 0.22), bevel=0.012)
        b.add_pitched_tiled_roof(roof_mat, "timber_oak", (0.0, 0.0, eave_z), length=ud - 0.1, half_span=uw * 0.49, rise=ridge_rise, along_axis="Y", overhang=0.42, eave_rafters=False, with_3d_tiles=False)
        b.add_recessed_window((0.0, -ud * 0.5 - 0.04, eave_z + ridge_rise * 0.36), 1.05, 1.25, (0.0, -1.0), frame_mat="stone_trim", with_shutters=True, glow=True)
    elif roof_style == "gambrel":
        low_rise = ridge_rise * 0.58
        high_rise = ridge_rise * 0.52
        mid_span = uw * 0.27
        for gy in (-ud * 0.5 + 0.12, ud * 0.5 - 0.12):
            b.add_wedge_block(upper_mat, [(-uw * 0.5, eave_z), (uw * 0.5, eave_z), (mid_span, eave_z + low_rise), (-mid_span, eave_z + low_rise)], gy, 0.24, bevel=0.012)
            b.add_wedge_block(upper_mat, [(-mid_span, eave_z + low_rise), (mid_span, eave_z + low_rise), (0.0, eave_z + low_rise + high_rise)], gy, 0.24, bevel=0.012)
        # Lower steep skirt slopes + upper shallower pitched roof
        for sgn in (-1, 1):
            ang = math.atan2(low_rise, uw * 0.5 - mid_span)
            slen = math.hypot(uw * 0.5 - mid_span, low_rise) + 0.55
            mx = sgn * ((uw * 0.5 + mid_span) * 0.5 + 0.12)
            mz = eave_z + low_rise * 0.42
            b.add_box(roof_mat, (mx, 0.0, mz), (slen, ud + 0.9, 0.16), bevel=0.015, rot=(0.0, sgn * ang, 0.0))
        b.add_pitched_tiled_roof(roof_mat, "timber_oak", (0.0, 0.0, eave_z + low_rise), length=ud + 0.1, half_span=mid_span, rise=high_rise, along_axis="Y", overhang=0.35, eave_rafters=False, with_3d_tiles=False)
    elif roof_style == "hipped":
        # Four-sided chamfered pyramid/hip roof
        ridge_len = max(1.0, uw - ud * 0.65)
        b.add_pitched_tiled_roof(roof_mat, "timber_oak", (0.0, 0.0, eave_z), length=ridge_len + 0.6, half_span=ud * 0.5, rise=ridge_rise, along_axis="X", overhang=0.55, eave_rafters=True, with_3d_tiles=False)
        for sgn in (-1, 1):
            b.add_wedge_block(roof_mat, [(-ud * 0.54, eave_z - 0.1), (ud * 0.54, eave_z - 0.1), (0.0, eave_z + ridge_rise)], sgn * (ridge_len * 0.5 + 0.5), 1.4, bevel=0.02, rot=(0.0, 0.0, math.pi * 0.5))
    else:  # gable_side (ridge parallel to street X axis!)
        for gx in (-uw * 0.5 + 0.12, uw * 0.5 - 0.12):
            b.add_wedge_block(upper_mat, [(-ud * 0.5, eave_z), (ud * 0.5, eave_z), (0.0, eave_z + ridge_rise)], 0.0, 0.26, bevel=0.015, rot=(0.0, 0.0, math.pi / 2), offset=(gx, 0.0, 0.0))
        b.add_pitched_tiled_roof(roof_mat, "timber_oak", (0.0, 0.0, eave_z), length=uw, half_span=ud * 0.5, rise=ridge_rise, along_axis="X", overhang=0.52, eave_rafters=True, with_3d_tiles=False)
        if with_dormers > 0:
            for di in range(with_dormers):
                dx_off = 0.0 if with_dormers == 1 else (-uw * 0.24 if di == 0 else uw * 0.24)
                add_gable_dormer(b, (dx_off, -ud * 0.28, eave_z + ridge_rise * 0.42), 1.35, 1.25, 1.5, upper_mat, roof_mat, -1.0)

    # 5. Chimney
    cx_ch = hw * 0.52 if "right" in chimney_side else -hw * 0.52
    cy_ch = hd * 0.45 if "back" in chimney_side else -hd * 0.45
    b.add_chimney("stone_ashlar", "stone_trim", (cx_ch, cy_ch), max(ground_h, eave_z - 1.0), eave_z + ridge_rise + 1.4, width=0.98)

    # 6. Optional Attached Side Workshop / Lean-to / Open Smithy Forge Shed
    colliders = [{"center": [0.0, (eave_z) * 0.5, 0.0], "half": [hw + 0.15, (eave_z) * 0.5 + 0.2, hd + 0.15]}]
    if with_side_lean_to in ("left", "right"):
        sx_s = -1.0 if with_side_lean_to == "left" else 1.0
        shed_w = 2.6
        shed_d = depth * 0.72
        scx = sx_s * (hw + shed_w * 0.5 - 0.1)
        b.add_box("planks_oak", (scx, 0.0, 1.15), (shed_w, shed_d, 2.3), bevel=0.02)
        b.add_box(roof_mat, (scx + sx_s * 0.15, 0.0, 2.55), (shed_w + 0.7, shed_d + 0.5, 0.14), bevel=0.012, rot=(0.0, sx_s * 0.35, 0.0))
        colliders.append({"center": [scx, 1.2, 0.0], "half": [shed_w * 0.5, 1.2, shed_d * 0.5]})
    elif with_side_lean_to == "smithy_forge":
        # Open-air covered Forge Porch on Left (-X) with Glowing Coal Hearth, Chimney Hood, Anvil & Weapon Rack!
        fx = -hw - 2.3
        b.add_box("stone_trim", (fx, 0.0, 0.02), (4.6, 6.2, 0.26), bevel=0.02)
        # Posts supporting open timber smithy canopy
        for fy in (-2.75, 2.75):
            b.add_box("stone_trim", (fx - 1.9, fy, 0.22), (0.4, 0.4, 0.44), bevel=0.02)
            b.add_box("timber_oak", (fx - 1.9, fy, 1.65), (0.22, 0.22, 2.6), bevel=0.015)
        b.add_box("timber_oak", (fx - 1.9, 0.0, 3.0), (0.24, 5.9, 0.22), bevel=0.015)
        b.add_box(roof_mat, (fx + 0.1, 0.0, 3.35), (5.0, 6.4, 0.16), bevel=0.015, rot=(0.0, -0.26, 0.0))
        # Stone Forge Hearth against main wall + glowing coals + flue chimney!
        b.add_box("stone_ashlar", (fx + 1.2, 1.1, 0.58), (1.7, 1.9, 1.16), bevel=0.03)
        b.add_box("ember_forge", (fx + 1.05, 1.1, 1.18), (0.95, 1.05, 0.16), bevel=0.02)
        b.add_box("iron_forged", (fx + 1.05, 1.1, 2.35), (1.2, 1.35, 0.5), bevel=0.02)
        b.add_chimney("stone_ashlar", "stone_trim", (fx + 1.35, 1.1), 2.5, 7.6, width=1.15)
        # Forging Anvil on oak stump + wooden quench barrel
        b.add_cylinder("timber_oak", (fx - 0.35, -0.45, 0.35), 0.32, 0.30, 0.70, segs=10)
        b.add_box("iron_forged", (fx - 0.35, -0.45, 0.84), (0.72, 0.30, 0.28), bevel=0.02)
        b.add_cylinder("planks_oak", (fx + 0.85, -1.55, 0.42), 0.38, 0.35, 0.84, segs=12)
        colliders.append({"center": [fx + 1.1, 1.3, 1.1], "half": [1.0, 1.3, 1.1]})
        colliders.append({"center": [fx - 1.9, 2.75, 1.5], "half": [0.25, 1.5, 0.25]})
        colliders.append({"center": [fx - 1.9, -2.75, 1.5], "half": [0.25, 1.5, 0.25]})

    export_model(b, model_name, colliders=colliders)


def build_market_stalls() -> None:
    """
    Generate 10 unique, heavily detailed market stalls (NO clone templates).
    Each faces local -Y (South at yaw=0) with width ~3.6m..4.3m, depth ~2.3m.
    """
    specs = [
        ("stall_01_bakery", 101, "awning_striped", "cloth_linen", "bakery", 3.8),
        ("stall_02_produce", 102, "awning_emerald", "cloth_ochre", "produce", 4.0),
        ("stall_03_butcher", 103, "awning_striped", "cloth_crimson", "butcher", 3.7),
        ("stall_04_pottery", 104, "awning_ochre", "cloth_linen", "pottery", 3.9),
        ("stall_05_fish", 105, "awning_navy", "cloth_navy", "fish", 3.8),
        ("stall_06_spices", 106, "awning_plum", "cloth_crimson", "caravan", 4.2),
        ("stall_07_drapery", 107, "awning_navy", "cloth_ochre", "drapery", 4.0),
        ("stall_08_jeweler", 108, "awning_plum", "cloth_navy", "jeweler", 3.5),
        ("stall_09_ironmonger", 109, "awning_ochre", "cloth_crimson", "iron", 4.1),
        ("stall_10_scribe", 110, "awning_emerald", "cloth_linen", "scribe", 3.6),
    ]

    for model_name, seed, awning_mat, cloth_mat, kind, w in specs:
        b = MeshBuilder(model_name, seed=seed)
        hw = w * 0.5
        d = 2.25

        if kind == "caravan":
            # Built-in Merchant Caravan Cart Booth with spoke wheels & arched canvas tilt!
            b.add_box("planks_oak", (0.0, 0.0, 0.72), (w - 0.4, 1.65, 0.16), bevel=0.015)
            b.add_box("planks_oak", (0.0, 0.78, 1.05), (w - 0.4, 0.10, 0.65), bevel=0.01)
            b.add_box("planks_oak", (0.0, -0.78, 0.92), (w - 0.4, 0.10, 0.36), bevel=0.01)
            for sx in (-hw + 0.32, hw - 0.32):
                b.add_cylinder("timber_oak", (sx, 0.0, 0.56), 0.56, 0.56, 0.12, segs=14, rot=(0.0, math.pi / 2, 0.0))
                b.add_cylinder("iron_forged", (sx, 0.0, 0.56), 0.58, 0.58, 0.05, segs=14, rot=(0.0, math.pi / 2, 0.0))
                b.add_box("timber_oak", (sx, 0.0, 1.65), (0.12, 1.6, 1.75), bevel=0.01)
            b.add_box(awning_mat, (0.0, -0.05, 2.65), (w, 2.2, 0.10), bevel=0.02, rot=(-0.22, 0.0, 0.0))
            for i in range(4):
                b.add_cylinder("brass_aged", (-1.1 + i * 0.72, -0.2, 1.08), 0.16, 0.12, 0.52, segs=10)
            b.add_box("fabric_sack", (0.0, -1.1, 0.36), (1.1, 0.5, 0.65), bevel=0.05)
        elif kind == "jeweler":
            # Enclosed Timber Kiosk Booth with lockable shutters & leaded corner lantern
            b.add_box("timber_oak", (0.0, 0.0, 0.46), (w, d, 0.92), bevel=0.02)
            b.add_box(cloth_mat, (0.0, -0.15, 0.95), (w - 0.15, d * 0.72, 0.08), bevel=0.01)
            b.add_box("planks_oak", (0.0, d * 0.45, 1.55), (w, 0.12, 1.9), bevel=0.015)
            for px in (-hw + 0.14, hw - 0.14):
                for py in (-d * 0.42, d * 0.42):
                    b.add_box("timber_oak", (px, py, 1.55), (0.14, 0.14, 2.2), bevel=0.01)
            b.add_pitched_tiled_roof("roof_slate", "timber_oak", (0.0, 0.0, 2.55), length=w + 0.1, half_span=d * 0.5, rise=0.95, along_axis="X", overhang=0.35, eave_rafters=False, with_3d_tiles=False)
            for ci in (-0.9, 0.0, 0.9):
                b.add_box("brass_aged", (ci, -0.2, 1.10), (0.48, 0.34, 0.22), bevel=0.015)
                b.add_box("iron_forged", (ci, -0.37, 1.10), (0.12, 0.04, 0.09), bevel=0.005)
            b.add_box("glow_warm", (hw - 0.18, -d * 0.42, 2.15), (0.18, 0.18, 0.26), bevel=0.01)
        else:
            # Open-Front Timber Stall Frame + Draped Canvas Table + Sloped Awning + Thematic Goods
            for px in (-hw + 0.14, hw - 0.14):
                b.add_box("timber_oak", (px, -d * 0.42, 1.25), (0.13, 0.13, 2.50), bevel=0.01)
                b.add_box("timber_oak", (px, d * 0.42, 1.48), (0.13, 0.13, 2.95), bevel=0.01)
                b.add_box("timber_oak", (px, 0.0, 2.68), (0.11, d + 0.65, 0.11), bevel=0.008, rot=(-0.22, 0.0, 0.0))
            b.add_box("timber_oak", (0.0, -d * 0.42, 2.42), (w, 0.12, 0.12), bevel=0.008)
            b.add_box("timber_oak", (0.0, d * 0.42, 2.92), (w, 0.12, 0.12), bevel=0.008)
            # Counter table & fabric skirt
            b.add_box("planks_oak", (0.0, 0.0, 0.92), (w - 0.2, d * 0.72, 0.10), bevel=0.012)
            b.add_box(cloth_mat, (0.0, -d * 0.32, 0.46), (w - 0.26, 0.12, 0.88), bevel=0.01)
            for lx in (-hw + 0.22, hw - 0.22):
                b.add_box("timber_oak", (lx, -d * 0.30, 0.45), (0.12, d * 0.68, 0.90), bevel=0.01)
            # Back cloth screen or plank shelf
            b.add_box("planks_oak" if kind in ("pottery", "scribe", "iron") else cloth_mat, (0.0, d * 0.40, 1.55), (w - 0.28, 0.08, 1.85), bevel=0.01)
            # Striped Canvas Awning Canopy with Scalloped Front Trim
            b.add_box(awning_mat, (0.0, 0.0, 2.72), (w + 0.15, d + 0.75, 0.06), bevel=0.01, rot=(-0.22, 0.0, 0.0))
            b.add_box(awning_mat, (0.0, -d * 0.5 - 0.26, 2.38), (w + 0.15, 0.05, 0.26), bevel=0.008)

            # Thematic Goods Display per Stall!
            if kind == "bakery":
                for tx in (-1.0, 0.0, 1.0):
                    b.add_box("planks_oak", (tx, -0.05, 1.02), (0.82, 0.62, 0.08), bevel=0.01)
                    for lx_off in (-0.22, 0.18):
                        b.add_cylinder("plaster_ochre", (tx + lx_off, -0.05, 1.12), 0.16, 0.13, 0.14, segs=8)
                b.add_cylinder("fabric_sack", (-1.15, -0.95, 0.36), 0.34, 0.28, 0.72, segs=10)
            elif kind == "produce":
                for xi, ang in [(-1.1, 0.15), (-0.35, -0.1), (0.4, 0.2), (1.15, -0.15)]:
                    b.add_box("planks_oak", (xi, -0.05, 1.06), (0.64, 0.62, 0.24), bevel=0.01, rot=(0.24, 0.0, ang))
                    b.add_cylinder("foliage_leaf" if xi < 0.2 else "ceramic_clay", (xi, -0.02, 1.22), 0.22, 0.18, 0.18, segs=8)
                b.add_box("brass_aged", (1.25, 0.3, 1.22), (0.35, 0.18, 0.45), bevel=0.01)
            elif kind == "butcher":
                b.add_cylinder("planks_oak", (-1.15, -0.95, 0.42), 0.42, 0.42, 0.84, segs=12)
                b.add_box("iron_forged", (-1.15, -0.95, 0.90), (0.28, 0.04, 0.12), bevel=0.005)
                b.add_box("timber_oak", (0.0, 0.35, 1.85), (w - 0.5, 0.10, 0.10), bevel=0.008)
                for hi in (-0.9, -0.2, 0.5, 1.1):
                    b.add_cylinder("cloth_crimson", (hi, 0.35, 1.48), 0.14, 0.08, 0.48, segs=7)
                b.add_cylinder("planks_oak", (1.1, -0.95, 0.42), 0.34, 0.34, 0.84, segs=10)
            elif kind == "pottery":
                b.add_box("planks_oak", (0.0, 0.28, 1.48), (w - 0.5, 0.42, 0.08), bevel=0.01)
                for ax in (-1.2, -0.6, 0.0, 0.6, 1.2):
                    b.add_cylinder("ceramic_clay", (ax, -0.05, 1.22), 0.15, 0.10, 0.48, segs=10)
                    if abs(ax) < 0.9:
                        b.add_cylinder("ceramic_clay", (ax + 0.1, 0.28, 1.72), 0.14, 0.08, 0.42, segs=10)
            elif kind == "fish":
                for tx in (-0.85, 0.85):
                    b.add_box("planks_oak", (tx, -0.08, 1.06), (1.35, 0.85, 0.22), bevel=0.015, rot=(0.22, 0.0, 0.0))
                b.add_cylinder("timber_oak", (-hw + 0.55, -0.95, 0.38), 0.36, 0.36, 0.76, segs=12)
                b.add_cylinder("fabric_sack", (hw - 0.55, -0.95, 0.28), 0.30, 0.26, 0.56, segs=10)
            elif kind == "drapery":
                roll_mats = ["cloth_crimson", "cloth_navy", "cloth_emerald", "cloth_ochre", "cloth_linen"]
                for ri, rm in enumerate(roll_mats):
                    rx = -1.35 + ri * 0.68
                    b.add_cylinder(rm, (rx, -0.02, 1.32), 0.15, 0.15, 0.72, segs=10, rot=(0.15, 0.0, 0.0))
                b.add_box("cloth_crimson", (0.0, -0.35, 1.00), (1.5, 0.6, 0.12), bevel=0.01)
            elif kind == "iron":
                b.add_box("iron_forged", (-0.95, -0.05, 1.06), (0.68, 0.32, 0.24), bevel=0.015)
                b.add_box("planks_oak", (0.85, -0.95, 0.40), (0.88, 0.65, 0.76), bevel=0.02)
                b.add_box("iron_forged", (0.3, 0.0, 1.15), (0.95, 0.18, 0.08), bevel=0.008)
                b.add_cylinder("iron_forged", (1.2, 0.22, 1.35), 0.14, 0.14, 0.75, segs=8)
            elif kind == "scribe":
                b.add_box("timber_oak", (-0.65, -0.08, 1.10), (0.85, 0.68, 0.32), bevel=0.01, rot=(0.25, 0.0, 0.0))
                b.add_box("cloth_linen", (-0.65, -0.08, 1.28), (0.68, 0.52, 0.05), bevel=0.005, rot=(0.25, 0.0, 0.0))
                for si in range(5):
                    b.add_cylinder("cloth_linen", (0.45 + si * 0.22, -0.05, 1.05), 0.065, 0.065, 0.58, segs=8, rot=(math.pi / 2, 0.0, 0.15))
                b.add_box("timber_oak", (0.95, 0.28, 1.52), (0.78, 0.38, 0.85), bevel=0.015)

        colliders = [{"center": [0.0, 1.25, 0.0], "half": [hw + 0.05, 1.25, d * 0.52]}]
        export_model(b, model_name, colliders=colliders)


def build_market_landmarks() -> None:
    # 1. Centerpiece Two-Tier Octagonal Phoenix-Anvil Stone Fountain (radius ~3.85m core basin)
    b = MeshBuilder("landmark_market_fountain", seed=301)
    # Octagonal stepped stone rim (stepped base walkable up to inner basin edge)
    b.add_cylinder("stone_trim", (0.0, 0.0, 0.18), 4.45, 4.35, 0.36, segs=8, bevel=0.03)
    b.add_cylinder("stone_ashlar", (0.0, 0.0, 0.72), 3.65, 3.65, 0.78, segs=8, bevel=0.03)
    b.add_cylinder("stone_trim", (0.0, 0.0, 1.16), 3.90, 3.90, 0.22, segs=8, bevel=0.03)
    # Inner carved octagonal fountain pedestal & upper catch basin
    b.add_cylinder("stone_trim", (0.0, 0.0, 1.75), 1.05, 0.82, 1.95, segs=8, bevel=0.03)
    b.add_cylinder("stone_ashlar", (0.0, 0.0, 2.82), 1.75, 1.55, 0.36, segs=12, bevel=0.03)
    b.add_cylinder("stone_trim", (0.0, 0.0, 3.55), 0.52, 0.38, 1.35, segs=8, bevel=0.025)
    b.add_cylinder("brass_aged", (0.0, 0.0, 4.55), 0.22, 0.04, 0.95, segs=8)
    for k in range(4):
        ang = k * (math.pi * 0.5)
        sx, sy = math.cos(ang), math.sin(ang)
        b.add_box("brass_aged", (sx * 1.02, sy * 1.02, 2.02), (0.36, 0.18, 0.16), bevel=0.015, rot=(0.0, 0.0, ang))
    # Corner stone bollards + iron chains framing octagonal corners
    for k in range(8):
        ang = k * (math.pi / 4)
        bx, by = math.cos(ang) * 4.2, math.sin(ang) * 4.2
        b.add_cylinder("stone_trim", (bx, by, 0.65), 0.24, 0.18, 0.68, segs=6, bevel=0.015)
    export_model(
        b,
        "landmark_market_fountain",
        cylinders=[{"center": [0.0, 2.2, 0.0], "halfHeight": 2.2, "radius": 3.78}],
    )

    # 2. Municipal Guild Charter Pillar & Bellcot (at Market South Mouth)
    b = MeshBuilder("landmark_market_pillar", seed=302)
    b.add_box("stone_trim", (0.0, 0.0, 0.25), (2.5, 2.5, 0.50), bevel=0.03)
    b.add_box("stone_ashlar", (0.0, 0.0, 1.05), (1.7, 1.7, 1.15), bevel=0.03)
    b.add_box("stone_trim", (0.0, 0.0, 3.05), (1.05, 1.05, 3.1), bevel=0.03)
    b.add_box("stone_trim", (0.0, 0.0, 4.75), (1.35, 1.35, 0.30), bevel=0.025)
    b.add_cylinder("brass_aged", (0.0, 0.0, 5.25), 0.28, 0.16, 0.45, segs=12)
    b.add_cylinder("roof_slate", (0.0, 0.0, 5.95), 0.85, 0.05, 1.45, segs=4, rot=(0.0, 0.0, math.pi / 4))
    for sgn in (-1, 1):
        b.add_box("iron_forged", (sgn * 0.88, 0.0, 3.65), (0.85, 0.08, 0.08), bevel=0.008)
        b.add_box("glow_warm", (sgn * 1.18, 0.0, 3.35), (0.24, 0.24, 0.34), bevel=0.015)
    export_model(
        b,
        "landmark_market_pillar",
        colliders=[{"center": [0.0, 2.5, 0.0], "half": [1.15, 2.5, 1.15]}],
    )

    # 3. St. Ignis Market Bell-Tower Chapel (NW North Market Terrace, facing +Z South)
    b = MeshBuilder("bldg_market_chapel", seed=303)
    b.add_box("stone_trim", (0.0, 0.0, -0.15), (12.6, 15.6, 0.90), bevel=0.04)
    b.add_box("stone_ashlar", (0.0, 0.0, 4.4), (11.6, 14.6, 8.8), bevel=0.03)
    # Corner stone quoins framing front South gable
    b.add_stone_quoins("stone_trim", -5.8, -7.3, 0.3, 8.7, 1.0, 1.0)
    b.add_stone_quoins("stone_trim", 5.8, -7.3, 0.3, 8.7, -1.0, 1.0)
    for sx in (-5.85, 5.85):
        for by in (-5.0, 0.0, 5.0):
            b.add_box("stone_trim", (sx, by, 4.0), (0.65, 0.75, 8.0), bevel=0.025)
    # Projecting Gabled Stone Entrance Porch & Proud Double Oak Doors facing -Y (Three.js +Z)
    for sgn in (-1, 1):
        b.add_box("stone_ashlar", (sgn * 1.65, -7.75, 1.85), (0.85, 1.05, 3.7), bevel=0.025)
    b.add_box("stone_trim", (0.0, -7.75, 3.85), (4.2, 1.25, 0.45), bevel=0.025)
    b.add_wedge_block("stone_ashlar", [(-2.05, 4.05), (2.05, 4.05), (0.0, 5.75)], -7.75, 0.95, bevel=0.02)
    b.add_pitched_tiled_roof("roof_slate", "stone_trim", (0.0, -7.75, 4.05), length=1.3, half_span=2.1, rise=1.75, along_axis="Y", overhang=0.22, eave_rafters=False, with_3d_tiles=False)
    b.add_stone_arch("stone_trim", (0.0, -8.25, 2.15), radius=1.25, depth=0.45, ring_thickness=0.34, num_voussoirs=9, facing_axis="Y")
    b.add_box("planks_oak", (0.0, -7.42, 1.6), (2.35, 0.22, 3.1), bevel=0.015)
    b.add_box("iron_forged", (0.0, -7.54, 1.6), (0.10, 0.06, 3.0), bevel=0.005)
    # Proud Illuminated Lancet Triple Window + Stone Rose Wheel Window in Upper Gable!
    b.add_recessed_window((0.0, -7.42, 6.75), 2.35, 2.75, (0.0, -1.0), frame_mat="stone_trim", with_shutters=False, glow=True)
    b.add_box("window_leaded", (0.0, -7.38, 6.75), (2.05, 0.08, 2.45), bevel=0.0)
    # Circular Rose Wheel Window at z = 10.6
    b.add_cylinder("stone_trim", (0.0, -7.32, 10.65), 1.32, 1.32, 0.28, segs=16, rot=(math.pi / 2, 0.0, 0.0))
    b.add_cylinder("window_leaded", (0.0, -7.36, 10.65), 1.05, 1.05, 0.16, segs=16, rot=(math.pi / 2, 0.0, 0.0))
    b.add_box("stone_trim", (0.0, -7.42, 10.65), (2.15, 0.12, 0.14), bevel=0.008)
    b.add_box("stone_trim", (0.0, -7.42, 10.65), (0.14, 0.12, 2.15), bevel=0.008)
    for wy in (-3.0, 2.5):
        b.add_recessed_window((-5.88, wy, 4.8), 1.1, 2.4, (-1.0, 0.0), frame_mat="stone_trim", with_shutters=False, glow=True)
        b.add_recessed_window((5.88, wy, 4.8), 1.1, 2.4, (1.0, 0.0), frame_mat="stone_trim", with_shutters=False, glow=True)
    # Pitched Slate Nave Roof
    b.add_wedge_block("stone_ashlar", [(-5.8, 8.8), (5.8, 8.8), (0.0, 14.2)], -7.15, 0.38, bevel=0.02)
    b.add_wedge_block("stone_ashlar", [(-5.8, 8.8), (5.8, 8.8), (0.0, 14.2)], 7.15, 0.38, bevel=0.02)
    b.add_pitched_tiled_roof("roof_slate", "stone_trim", (0.0, 0.0, 8.8), length=14.6, half_span=5.8, rise=5.4, along_axis="Y", overhang=0.55, eave_rafters=False, with_3d_tiles=False)
    # Tall Square Belfry Tower rising on North-West nave shoulder (to y ~ 26m!)
    tx, ty = -2.2, 3.2
    b.add_box("stone_ashlar", (tx, ty, 13.5), (5.2, 5.2, 13.0), bevel=0.03)
    b.add_box("stone_trim", (tx, ty, 16.5), (5.6, 5.6, 0.45), bevel=0.025)
    b.add_box("stone_trim", (tx, ty, 20.1), (5.7, 5.7, 0.55), bevel=0.025)
    b.add_recessed_window((tx, ty - 2.66, 18.2), 1.4, 2.4, (0.0, -1.0), frame_mat="stone_trim", with_shutters=False, glow=True)
    b.add_cylinder("roof_slate", (tx, ty, 24.4), 3.1, 0.10, 8.6, segs=4, bevel=0.02, rot=(0.0, 0.0, math.pi / 4))
    b.add_cylinder("brass_aged", (tx, ty, 29.2), 0.14, 0.02, 1.4, segs=8)
    export_model(
        b,
        "bldg_market_chapel",
        colliders=[{"center": [0.0, 4.5, 0.0], "half": [5.9, 4.5, 7.6]}],
    )

    # 4. Masons' Arcade & Guild Exchange (NE Market Plaza, facing +Z South, with walkable arched loggia!)
    b = MeshBuilder("bldg_mason_hall", seed=304)
    b.add_box("stone_trim", (0.0, 0.0, -0.15), (13.4, 9.8, 0.90), bevel=0.03)
    # Back mass (behind arcade) + 5 front arcade stone piers leaving open porch walkway
    b.add_box("stone_ashlar", (0.0, 1.35, 2.05), (12.8, 6.2, 4.1), bevel=0.03)
    for px in (-5.6, -2.8, 0.0, 2.8, 5.6):
        b.add_box("stone_ashlar", (px, -3.85, 1.95), (0.85, 0.95, 3.9), bevel=0.025)
    for ax in (-4.2, -1.4, 1.4, 4.2):
        b.add_stone_arch("stone_trim", (ax, -3.85, 2.35), radius=1.08, depth=0.92, ring_thickness=0.34, num_voussoirs=9, facing_axis="Y")
    b.add_box("stone_ashlar", (0.0, -3.85, 3.62), (12.8, 0.92, 0.92), bevel=0.02)
    b.add_box("planks_oak", (0.0, -1.72, 1.35), (1.7, 0.18, 2.65), bevel=0.015)
    # 2nd Floor Sage Plaster & Twin Dutch Gables
    b.add_box("plaster_sage", (0.0, 0.0, 5.65), (13.0, 9.1, 3.1), bevel=0.025)
    b.add_box("timber_oak", (0.0, 0.0, 4.18), (13.2, 9.3, 0.22), bevel=0.015)
    for wx in (-4.2, -1.4, 1.4, 4.2):
        b.add_box("timber_oak", (wx - 1.3, -4.56, 5.65), (0.18, 0.16, 3.0), bevel=0.01)
        b.add_recessed_window((wx, -4.58, 5.65), 1.3, 1.45, (0.0, -1.0), with_shutters=True, with_flowerbox=True, glow=True)
    for cx in (-3.2, 3.2):
        b.add_wedge_block("plaster_sage", [(-3.1, 7.2), (3.1, 7.2), (0.0, 10.6)], -4.45, 0.28, bevel=0.015, offset=(cx, 0.0, 0.0))
        b.add_wedge_block("plaster_sage", [(-3.1, 7.2), (3.1, 7.2), (0.0, 10.6)], 4.45, 0.28, bevel=0.015, offset=(cx, 0.0, 0.0))
        b.add_pitched_tiled_roof("roof_clay", "timber_oak", (cx, 0.0, 7.2), length=9.1, half_span=3.1, rise=3.4, along_axis="Y", overhang=0.45, eave_rafters=True, with_3d_tiles=False)
    b.add_chimney("stone_ashlar", "stone_trim", (4.5, 2.5), 6.5, 11.4, width=1.0)
    export_model(
        b,
        "bldg_mason_hall",
        colliders=[
            {"center": [0.0, 2.5, -1.35], "half": [6.5, 2.5, 3.15]},
            {"center": [-5.6, 2.0, 3.85], "half": [0.45, 2.0, 0.48]},
            {"center": [-2.8, 2.0, 3.85], "half": [0.45, 2.0, 0.48]},
            {"center": [0.0, 2.0, 3.85], "half": [0.45, 2.0, 0.48]},
            {"center": [2.8, 2.0, 3.85], "half": [0.45, 2.0, 0.48]},
            {"center": [5.6, 2.0, 3.85], "half": [0.45, 2.0, 0.48]},
        ],
    )


def build_arches_and_walls() -> None:
    # 1. Market Gate Bridge Arch (replaces Phase-1 blocking wall! Open 5.6m x 4.4m carriage tunnel!)
    b = MeshBuilder("market_gate_arch", seed=401)
    # Left & Right Stone Bridge Abutments (leaving clear center X in [-2.8, +2.8])
    b.add_box("stone_trim", (-5.4, 0.0, -0.15), (5.2, 5.2, 0.8), bevel=0.03)
    b.add_box("stone_trim", (5.4, 0.0, -0.15), (5.2, 5.2, 0.8), bevel=0.03)
    b.add_box("stone_ashlar", (-5.4, 0.0, 2.65), (5.0, 4.8, 5.3), bevel=0.03)
    b.add_box("stone_ashlar", (5.4, 0.0, 2.65), (5.0, 4.8, 5.3), bevel=0.03)
    b.add_stone_arch("stone_trim", (0.0, -2.28, 2.35), radius=2.85, depth=0.85, ring_thickness=0.42, num_voussoirs=13, facing_axis="Y")
    b.add_stone_arch("stone_trim", (0.0, 2.28, 2.35), radius=2.85, depth=0.85, ring_thickness=0.42, num_voussoirs=13, facing_axis="Y")
    b.add_box("stone_ashlar", (0.0, 0.0, 4.95), (6.0, 4.7, 1.35), bevel=0.025)
    # 2nd-Story Timber Gallery spanning across road with sign + banners
    b.add_box("timber_oak", (0.0, 0.0, 5.45), (16.4, 5.0, 0.24), bevel=0.015)
    b.add_box("plaster_ochre", (0.0, 0.0, 7.05), (16.2, 4.8, 3.0), bevel=0.02)
    for tx in (-7.2, -3.6, 0.0, 3.6, 7.2):
        b.add_box("timber_oak", (tx, -2.42, 7.05), (0.18, 0.16, 3.0), bevel=0.01)
        b.add_box("timber_oak", (tx, 2.42, 7.05), (0.18, 0.16, 3.0), bevel=0.01)
    for wx in (-4.8, -1.8, 1.8, 4.8):
        b.add_recessed_window((wx, -2.42, 7.05), 1.15, 1.3, (0.0, -1.0), with_shutters=True, glow=True)
        b.add_recessed_window((wx, 2.42, 7.05), 1.15, 1.3, (0.0, 1.0), with_shutters=True, glow=True)
    b.add_pitched_tiled_roof("roof_slate", "timber_oak", (0.0, 0.0, 8.55), length=16.4, half_span=2.55, rise=2.65, along_axis="X", overhang=0.48, eave_rafters=True, with_3d_tiles=False)
    b.add_planar_quad("banner_ashenhold", (-2.2, -2.48, 3.9), (-1.4, -2.48, 3.9), (-1.4, -2.48, 5.2), (-2.2, -2.48, 5.2))
    b.add_planar_quad("banner_ashenhold", (1.4, -2.48, 3.9), (2.2, -2.48, 3.9), (2.2, -2.48, 5.2), (1.4, -2.48, 5.2))
    export_model(
        b,
        "market_gate_arch",
        colliders=[
            {"center": [-5.4, 3.0, 0.0], "half": [2.5, 3.0, 2.4]},
            {"center": [5.4, 3.0, 0.0], "half": [2.5, 3.0, 2.4]},
        ],
    )

    # 2. Covered Alley Arch House Connector (used for Copperhorn West Alley & Lantern East Alley!)
    for model_name, mat_wall, seed in [("alley_arch_west", "plaster_cream", 402), ("alley_arch_east", "plaster_terracotta", 403)]:
        b = MeshBuilder(model_name, seed=seed)
        b.add_box("stone_trim", (-4.4, 0.0, -0.15), (3.6, 4.4, 0.8), bevel=0.025)
        b.add_box("stone_trim", (4.4, 0.0, -0.15), (3.6, 4.4, 0.8), bevel=0.025)
        b.add_box("stone_ashlar", (-4.4, 0.0, 2.3), (3.4, 4.2, 4.6), bevel=0.03)
        b.add_box("stone_ashlar", (4.4, 0.0, 2.3), (3.4, 4.2, 4.6), bevel=0.03)
        b.add_stone_arch("stone_trim", (0.0, -2.02, 2.1), radius=2.65, depth=0.65, ring_thickness=0.38, num_voussoirs=11, facing_axis="Y")
        b.add_stone_arch("stone_trim", (0.0, 2.02, 2.1), radius=2.65, depth=0.65, ring_thickness=0.38, num_voussoirs=11, facing_axis="Y")
        b.add_box("stone_ashlar", (0.0, 0.0, 4.25), (5.5, 4.1, 1.1), bevel=0.02)
        b.add_box(mat_wall, (0.0, 0.0, 6.2), (12.6, 4.3, 2.8), bevel=0.02)
        b.add_box("timber_oak", (0.0, 0.0, 4.78), (12.8, 4.4, 0.22), bevel=0.015)
        for wx in (-3.2, 0.0, 3.2):
            b.add_recessed_window((wx, -2.18, 6.2), 1.1, 1.25, (0.0, -1.0), with_shutters=True, glow=True)
            b.add_recessed_window((wx, 2.18, 6.2), 1.1, 1.25, (0.0, 1.0), with_shutters=True, glow=True)
        b.add_pitched_tiled_roof("roof_clay" if seed == 402 else "roof_slate", "timber_oak", (0.0, 0.0, 7.6), length=12.8, half_span=2.2, rise=2.3, along_axis="X", overhang=0.42, eave_rafters=False, with_3d_tiles=False)
        export_model(
            b,
            model_name,
            colliders=[
                {"center": [-4.4, 2.5, 0.0], "half": [1.7, 2.5, 2.1]},
                {"center": [4.4, 2.5, 0.0], "half": [1.7, 2.5, 2.1]},
            ],
        )

    # 3. Phase-1 South Courtyard Connectors (Cleanly fills Gap-A behind South Gate without blocking alleys!)
    b = MeshBuilder("courtyard_connectors", seed=404)
    for sx in (-1, 1):
        wx = sx * 6.8
        b.add_box("stone_ashlar", (wx, -8.2, 1.9), (0.65, 6.2, 3.8), bevel=0.025)
        b.add_box("stone_trim", (wx, -8.2, 3.92), (0.82, 6.4, 0.22), bevel=0.02)
        b.add_box("planks_oak", (wx - sx * 0.12, -8.2, 1.25), (0.55, 1.35, 2.4), bevel=0.015)
        b.add_stone_arch("stone_trim", (wx - sx * 0.22, -8.2, 1.65), radius=0.72, depth=0.38, ring_thickness=0.24, num_voussoirs=7, facing_axis="X")
        bx = sx * 14.5
        b.add_box("stone_ashlar", (bx, -7.8, 2.2), (7.2, 8.2, 4.4), bevel=0.03)
        b.add_box("plaster_cream" if sx < 0 else "plaster_sage", (bx, -7.8, 5.9), (7.4, 8.4, 3.0), bevel=0.025)
        b.add_pitched_tiled_roof("roof_slate" if sx < 0 else "roof_clay", "timber_oak", (bx, -7.8, 7.4), length=8.4, half_span=3.7, rise=3.0, along_axis="Y", eave_rafters=False, with_3d_tiles=False)
    # West Courtyard wall between Guardhouse and Tavern (keeps South-West closed while Copperhorn Alley north of Tavern stays open!)
    b.add_box("stone_ashlar", (-6.9, 5.2, 2.0), (0.65, 5.2, 4.0), bevel=0.025)
    b.add_box("stone_trim", (-6.9, 5.2, 4.12), (0.82, 5.4, 0.22), bevel=0.02)
    b.add_box("stone_ashlar", (-14.5, 5.5, 2.4), (6.5, 8.2, 4.8), bevel=0.03)
    b.add_box("plaster_ochre", (-14.5, 5.5, 6.2), (6.7, 8.4, 2.8), bevel=0.025)
    b.add_pitched_tiled_roof("roof_clay", "timber_oak", (-14.5, 5.5, 7.6), length=8.5, half_span=3.4, rise=2.9, along_axis="Y", eave_rafters=False, with_3d_tiles=False)
    # South courtyard wall between Apothecary & Guildhouse arch opening (leaving Guildhouse Cart Arch Y in [-4.5, -2.0] open!)
    b.add_box("stone_ashlar", (6.9, 3.6, 2.0), (0.65, 2.4, 4.0), bevel=0.025)
    b.add_box("stone_trim", (6.9, 3.6, 4.12), (0.82, 2.6, 0.22), bevel=0.02)
    export_model(
        b,
        "courtyard_connectors",
        colliders=[
            {"center": [-6.8, 2.0, 8.2], "half": [0.45, 2.0, 3.2]},
            {"center": [6.8, 2.0, 8.2], "half": [0.45, 2.0, 3.2]},
            {"center": [-6.9, 2.0, -5.2], "half": [0.45, 2.0, 2.7]},
            {"center": [6.9, 2.0, -3.6], "half": [0.45, 2.0, 1.3]},
        ],
    )

    # 4. City Retaining Terrace Wall Module (16m long masonry terrace wall + stone balustrade)
    b = MeshBuilder("city_retaining_wall", seed=405)
    b.add_box("stone_ashlar", (0.0, 0.0, 0.9), (16.0, 1.2, 2.4), bevel=0.03)
    b.add_box("stone_trim", (0.0, 0.0, 2.2), (16.2, 1.45, 0.28), bevel=0.025)
    for bx in (-7.2, -3.6, 0.0, 3.6, 7.2):
        b.add_box("stone_trim", (bx, 0.0, 2.72), (0.52, 0.52, 0.85), bevel=0.02)
        b.add_box("stone_trim", (bx, -0.68, 0.95), (0.55, 0.45, 2.0), bevel=0.02)
    export_model(
        b,
        "city_retaining_wall",
        colliders=[{"center": [0.0, 1.5, 0.0], "half": [8.0, 1.5, 0.72]}],
    )

    # 5. Perimeter City Curtain Wall Module (24m long fortified ashlar curtain wall + crenellations)
    b = MeshBuilder("perimeter_curtain_wall", seed=406)
    b.add_box("stone_ashlar", (0.0, 0.0, 4.0), (24.0, 2.6, 9.0), bevel=0.04)
    b.add_box("stone_trim", (0.0, 0.0, 8.65), (24.0, 2.9, 0.38), bevel=0.03)
    for mx in range(-11, 12, 2):
        b.add_box("stone_ashlar", (float(mx), -1.1, 9.45), (1.15, 0.65, 1.25), bevel=0.025)
    for bx in (-8.0, 0.0, 8.0):
        b.add_box("stone_trim", (bx, -1.45, 3.8), (1.1, 0.75, 7.8), bevel=0.03)
    export_model(
        b,
        "perimeter_curtain_wall",
        colliders=[{"center": [0.0, 4.5, 0.0], "half": [12.0, 4.5, 1.4]}],
        bake_ao=False,
    )


def build_castle_landmarks() -> None:
    """
    Phase 3 Reserved Landmark Assets (visually unmistakable from gate/plaza/terraces,
    with solid closed portcullis barrier marking Phase 3 Citadel boundary!).
    """
    # 1. Citadel Barbican Gatehouse (Lowered Iron Portcullis + Twin Cylindrical Bastions)
    b = MeshBuilder("castle_barbican_gate", seed=501)
    b.add_box("stone_trim", (0.0, 0.0, -0.3), (18.0, 6.8, 1.2), bevel=0.04)
    for sx in (-6.2, 6.2):
        b.add_cylinder("stone_ashlar", (sx, 0.0, 7.5), 3.6, 3.3, 15.0, segs=12, bevel=0.04)
        b.add_cylinder("stone_trim", (sx, 0.0, 15.2), 3.85, 3.85, 0.55, segs=12, bevel=0.03)
        b.add_cylinder("roof_slate", (sx, 0.0, 17.8), 4.0, 0.12, 5.2, segs=12, bevel=0.02)
    b.add_box("stone_ashlar", (-3.8, 0.0, 5.5), (3.2, 5.8, 11.0), bevel=0.04)
    b.add_box("stone_ashlar", (3.8, 0.0, 5.5), (3.2, 5.8, 11.0), bevel=0.04)
    b.add_box("stone_ashlar", (0.0, 0.0, 9.2), (4.6, 5.5, 4.8), bevel=0.04)
    b.add_stone_arch("stone_trim", (0.0, -2.95, 3.2), radius=2.6, depth=0.85, ring_thickness=0.45, num_voussoirs=11, facing_axis="Y")
    # LOWERED CLOSED PORTCULLIS + Heavy Oak Gates!
    b.add_box("planks_oak", (0.0, 0.6, 2.4), (5.0, 0.45, 4.8), bevel=0.02)
    for gx in (-2.0, -1.2, -0.4, 0.4, 1.2, 2.0):
        b.add_cylinder("iron_forged", (gx, -2.55, 2.4), 0.075, 0.075, 4.9, segs=6)
    for gz in (0.7, 1.6, 2.5, 3.4, 4.3):
        b.add_box("iron_forged", (0.0, -2.55, gz), (4.8, 0.12, 0.12), bevel=0.008)
    for sx in (-3.2, 3.2):
        b.add_planar_quad("banner_ashenhold", (sx - 0.55, -3.05, 5.8), (sx + 0.55, -3.05, 5.8), (sx + 0.55, -3.05, 9.2), (sx - 0.55, -3.05, 9.2), double_sided=True)
    export_model(
        b,
        "castle_barbican_gate",
        colliders=[{"center": [0.0, 4.5, 0.0], "half": [9.2, 4.5, 3.1]}],
    )

    # 2. Towering Citadel High Keep & Curtain Wings (Landmark silhouetted behind Barbican)
    b = MeshBuilder("castle_citadel_keep", seed=502)
    b.add_box("stone_trim", (0.0, 0.0, 4.5), (44.0, 20.0, 10.5), bevel=0.08)
    b.add_box("stone_ashlar", (0.0, 0.0, 16.5), (27.0, 15.0, 16.0), bevel=0.05)
    # Central Sovereign Keep Tower rising to ~50m above citadel plateau (~63m city total!)
    b.add_box("stone_ashlar", (0.0, 1.5, 31.0), (12.8, 12.8, 26.0), bevel=0.05)
    b.add_box("stone_trim", (0.0, 1.5, 27.5), (13.4, 13.4, 0.70), bevel=0.03)
    b.add_box("stone_trim", (0.0, 1.5, 35.5), (13.4, 13.4, 0.70), bevel=0.03)
    b.add_box("stone_trim", (0.0, 1.5, 43.2), (13.8, 13.8, 0.80), bevel=0.03)
    for wx in (-3.2, 0.0, 3.2):
        b.add_recessed_window((wx, -4.96, 31.5), 1.35, 3.2, (0.0, -1.0), frame_mat="stone_trim", with_shutters=False, glow=True)
        b.add_recessed_window((wx, -4.96, 39.2), 1.35, 2.8, (0.0, -1.0), frame_mat="stone_trim", with_shutters=False, glow=True)
    for tx in (-6.4, 6.4):
        for ty in (-4.8, 7.8):
            b.add_cylinder("stone_trim", (tx, ty, 30.0), 2.4, 2.15, 28.0, segs=10, bevel=0.03)
            b.add_cylinder("roof_slate", (tx, ty, 47.0), 2.65, 0.12, 6.8, segs=10, bevel=0.02)
    b.add_pitched_tiled_roof("roof_slate", "stone_trim", (0.0, 1.5, 43.6), length=12.6, half_span=6.2, rise=6.2, along_axis="X", eave_rafters=False, with_3d_tiles=False)
    for sx in (-16.0, 16.0):
        b.add_cylinder("stone_ashlar", (sx, -3.5, 18.0), 4.2, 3.9, 20.5, segs=10, bevel=0.04)
        b.add_cylinder("roof_slate", (sx, -3.5, 31.2), 4.55, 0.15, 6.2, segs=10, bevel=0.02)
    export_model(b, "castle_citadel_keep", colliders=[], bake_ao=False)

    # 3. Outer Decorative Skyline Clusters (explicitly outside perimeter walls)
    b = MeshBuilder("outer_decorative_horizon", seed=503)
    specs = [
        (-14.0, 0.0, 8.0, 7.0, 8.5, "plaster_cream", "roof_slate"),
        (-4.5, 2.5, 9.0, 8.0, 10.0, "brick_medieval", "roof_clay"),
        (6.0, -1.0, 8.5, 7.5, 9.2, "plaster_ochre", "roof_slate"),
        (16.0, 2.0, 8.0, 7.5, 8.8, "plaster_sage", "roof_clay"),
    ]
    for rx, ry, rw, rd, rh, wm, rm in specs:
        b.add_box(wm, (rx, ry, rh * 0.5), (rw, rd, rh), bevel=0.02)
        b.add_pitched_tiled_roof(rm, "timber_oak", (rx, ry, rh), length=rd, half_span=rw * 0.5, rise=3.0, along_axis="Y", eave_rafters=False, with_3d_tiles=False)
    export_model(b, "outer_decorative_horizon", colliders=[], bake_ao=False)


def build_extra_props() -> None:
    # 1. Carved Stone Market Well with Wooden Bucket Roof
    b = MeshBuilder("prop_well_stone", seed=601)
    b.add_cylinder("stone_ashlar", (0.0, 0.0, 0.45), 1.15, 1.10, 0.90, segs=10, bevel=0.025)
    b.add_cylinder("stone_trim", (0.0, 0.0, 0.96), 1.24, 1.24, 0.18, segs=10, bevel=0.02)
    for sx in (-0.98, 0.98):
        b.add_box("timber_oak", (sx, 0.0, 1.65), (0.16, 0.16, 1.45), bevel=0.01)
    b.add_cylinder("timber_oak", (0.0, 0.0, 1.55), 0.08, 0.08, 2.05, segs=8, rot=(0.0, math.pi / 2, 0.0))
    b.add_pitched_tiled_roof("roof_clay", "timber_oak", (0.0, 0.0, 2.38), length=2.25, half_span=0.88, rise=0.82, along_axis="X", overhang=0.22, eave_rafters=False, with_3d_tiles=False)
    export_model(b, "prop_well_stone", cylinders=[{"center": [0.0, 0.8, 0.0], "halfHeight": 0.8, "radius": 1.18}])

    # 2. Heraldic Banner Pole
    b = MeshBuilder("prop_banner_pole", seed=602)
    b.add_cylinder("stone_trim", (0.0, 0.0, 0.25), 0.36, 0.28, 0.50, segs=8, bevel=0.02)
    b.add_cylinder("timber_oak", (0.0, 0.0, 2.65), 0.08, 0.06, 4.8, segs=8)
    b.add_box("timber_oak", (0.42, 0.0, 4.75), (0.95, 0.08, 0.08), bevel=0.008)
    b.add_planar_quad("banner_ashenhold", (0.08, -0.02, 2.65), (0.86, -0.02, 2.65), (0.86, -0.02, 4.72), (0.08, -0.02, 4.72), double_sided=True)
    export_model(b, "prop_banner_pole")


def build_all_buildings() -> None:
    # Central Market Ring & South Mouth Corners
    build_townhouse("bldg_south_corner_west", seed=201, width=9.0, depth=7.2, ground_h=3.6, upper_floors=1, ground_mat="stone_ashlar", upper_mat="plaster_cream", roof_mat="roof_clay", roof_style="gable_side", with_dormers=1, sign_mat=None)
    build_townhouse("bldg_south_corner_east", seed=202, width=9.0, depth=7.4, ground_h=3.6, upper_floors=1, ground_mat="brick_medieval", upper_mat="plaster_ochre", roof_mat="roof_slate", roof_style="hipped", with_balcony=True)

    build_townhouse("bldg_bakery", seed=203, width=9.8, depth=7.4, ground_h=3.6, upper_floors=1, ground_mat="stone_ashlar", upper_mat="plaster_cream", roof_mat="roof_clay", roof_style="gable_side", awning_mat="awning_ochre", sign_mat="sign_bakery", with_dormers=2, with_side_lean_to="left")
    build_townhouse("bldg_draper", seed=204, width=10.6, depth=7.4, ground_h=3.6, upper_floors=2, ground_mat="brick_medieval", upper_mat="plaster_terracotta", roof_mat="roof_slate", roof_style="gable_front", timber_style="x_brace", awning_mat="awning_navy", sign_mat="sign_market", front_door_offset=1.6)
    build_townhouse("bldg_clockmaker", seed=205, width=8.2, depth=7.2, ground_h=3.8, upper_floors=2, floor_h=2.75, ground_mat="stone_ashlar", upper_mat="plaster_sage", roof_mat="roof_slate", roof_style="stepped_flemish", with_bay_window=True, with_balcony=True)

    build_townhouse("bldg_vintner", seed=206, width=9.2, depth=7.4, ground_h=3.5, upper_floors=1, ground_mat="stone_ashlar", upper_mat="plaster_sage", roof_mat="roof_clay", roof_style="gambrel", with_porch=True, sign_mat="sign_tavern", with_side_lean_to="right")
    build_townhouse("bldg_armorer", seed=207, width=10.2, depth=7.5, ground_h=3.8, upper_floors=1, ground_mat="stone_ashlar", upper_mat="brick_medieval", roof_mat="roof_slate", roof_style="stepped_flemish", timber_style="grid", with_balcony=True, sign_mat="sign_smithy", front_door_offset=-1.5)
    build_townhouse("bldg_exchange", seed=208, width=9.4, depth=7.8, ground_h=3.7, upper_floors=2, ground_mat="brick_medieval", upper_mat="plaster_ochre", roof_mat="roof_slate", roof_style="hipped", awning_mat="awning_striped", with_bay_window=True)

    # West Artisan & Smiths' Quarter
    build_townhouse("bldg_smithy", seed=210, width=9.6, depth=7.6, ground_h=3.6, upper_floors=1, ground_mat="stone_ashlar", upper_mat="plaster_terracotta", roof_mat="roof_slate", roof_style="gable_front", with_side_lean_to="smithy_forge", sign_mat="sign_smithy")
    build_townhouse("bldg_cooperage", seed=211, width=10.4, depth=7.4, ground_h=3.4, upper_floors=1, ground_mat="brick_medieval", upper_mat="plaster_ochre", roof_mat="roof_clay", roof_style="gambrel", with_porch=True, with_side_lean_to="right")
    build_townhouse("bldg_tannery", seed=212, width=11.0, depth=7.2, ground_h=3.4, upper_floors=1, ground_mat="stone_ashlar", upper_mat="plaster_cream", roof_mat="roof_clay", roof_style="gable_side", timber_style="x_brace", with_dormers=2, with_balcony=True)
    build_townhouse("bldg_artisan_row_a", seed=213, width=9.0, depth=7.0, ground_h=3.4, upper_floors=2, floor_h=2.7, ground_mat="brick_medieval", upper_mat="plaster_sage", roof_mat="roof_slate", roof_style="gable_front", with_bay_window=True)
    build_townhouse("bldg_artisan_row_b", seed=214, width=9.6, depth=7.0, ground_h=3.5, upper_floors=1, ground_mat="stone_ashlar", upper_mat="plaster_ochre", roof_mat="roof_clay", roof_style="hipped", awning_mat="awning_plum")
    build_townhouse("bldg_artisan_row_c", seed=215, width=10.2, depth=7.2, ground_h=3.4, upper_floors=1, ground_mat="brick_medieval", upper_mat="plaster_cream", roof_mat="roof_slate", roof_style="gable_side", with_dormers=1, with_side_lean_to="left")

    # East Residential & Weavers' Hill Quarter
    build_townhouse("bldg_weaver_hall", seed=220, width=11.4, depth=7.6, ground_h=3.7, upper_floors=2, ground_mat="stone_ashlar", upper_mat="plaster_ochre", roof_mat="roof_clay", roof_style="gable_side", timber_style="x_brace", with_balcony=True, with_dormers=2, awning_mat="awning_emerald", sign_mat="sign_market")
    build_townhouse("bldg_res_tall_a", seed=221, width=8.6, depth=7.2, ground_h=3.5, upper_floors=2, floor_h=2.8, ground_mat="brick_medieval", upper_mat="plaster_cream", roof_mat="roof_slate", roof_style="stepped_flemish", with_bay_window=True)
    build_townhouse("bldg_res_gable_b", seed=222, width=9.8, depth=7.2, ground_h=3.4, upper_floors=1, ground_mat="stone_ashlar", upper_mat="plaster_terracotta", roof_mat="roof_clay", roof_style="gambrel", with_porch=True)
    build_townhouse("bldg_res_corner_c", seed=223, width=9.4, depth=7.4, ground_h=3.6, upper_floors=1, ground_mat="brick_medieval", upper_mat="plaster_sage", roof_mat="roof_slate", roof_style="hipped", with_balcony=True)
    build_townhouse("bldg_res_cottages_d", seed=224, width=10.4, depth=6.8, ground_h=3.2, upper_floors=1, floor_h=2.7, ground_mat="stone_ashlar", upper_mat="plaster_cream", roof_mat="roof_clay", roof_style="gable_side", timber_style="brace", with_dormers=2)
    build_townhouse("bldg_res_townhouse_e", seed=225, width=9.2, depth=7.2, ground_h=3.5, upper_floors=1, ground_mat="brick_medieval", upper_mat="plaster_ochre", roof_mat="roof_slate", roof_style="gable_front", with_bay_window=True, awning_mat="awning_navy")

    # Castle Forecourt Flanks
    build_townhouse("bldg_castle_flank_west", seed=230, width=10.5, depth=7.8, ground_h=3.8, upper_floors=1, ground_mat="stone_ashlar", upper_mat="stone_ashlar", roof_mat="roof_slate", roof_style="hipped", timber_style="grid")
    build_townhouse("bldg_castle_flank_east", seed=231, width=10.5, depth=7.8, ground_h=3.8, upper_floors=1, ground_mat="stone_ashlar", upper_mat="brick_medieval", roof_mat="roof_slate", roof_style="gable_side", with_dormers=2)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    build_market_stalls()
    build_market_landmarks()
    build_arches_and_walls()
    build_castle_landmarks()
    build_extra_props()
    build_all_buildings()

    manifest_path = OUT_DIR / "kit_manifest.json"
    manifest_path.write_text(json.dumps(MANIFEST, indent=2), encoding="utf-8")
    print(f"Generated {len(MANIFEST)} Phase-2 Ashenhold models -> {manifest_path}")


if __name__ == "__main__":
    main()
