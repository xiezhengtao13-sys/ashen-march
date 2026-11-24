#!/usr/bin/env python3
"""
Blender 4.0+ Sculpted Stormveil-Inspired Gothic Mountain Citadel Hero Asset Generator
for Ashenhold Visual Fidelity V3 (`feature/ashenhold-art-direction-v3`).

Art Direction: Grounded Gothic Medieval Fantasy — Weathered Mountain Citadel.
Every Hero Asset uses real 3D sculpted irregular coursed masonry blocks (protruding
+2.5cm..+8.5cm with bevelled chips), stepped buttresses with sloped weatherings,
pointed Gothic arches with individually rotated voussoirs, battered plinths, broken
ancient merlons, iron tie-plates, hanging vines, and mathematically exact Rapier
colliders (boxes + universal oriented ramp colliders).

Canonical local orientation before GLTF export (+Y up in Three.js):
  Blender local X  -> Three.js +X (width)
  Blender local -Y -> Three.js +Z (front facade faces South when yaw = 0)
  Blender local Z  -> Three.js +Y (up)

Run via:
  blender --background --python scripts/city/stormveil_kit.py
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
from v4_sculpt_helpers import (  # noqa: E402
    add_curb_and_gutter_run,
    add_gothic_cage_lantern,
    add_hewn_stone_block,
    add_molded_gothic_arch,
    add_ribbed_groin_vault,
    add_sculpted_wall_courses,
    add_stratified_cliff_crag,
    add_wrought_iron_brazier,
)

MANIFEST: dict[str, dict] = {}


def bl_box(cx: float, cy: float, cz: float, sx: float, sy: float, sz: float) -> dict:
    """Convert Blender center+size box to Three.js static box collider {center, half}."""
    return {
        "center": [round(cx, 3), round(cz, 3), round(-cy, 3)],
        "half": [round(sx * 0.5, 3), round(sz * 0.5, 3), round(sy * 0.5, 3)],
    }


def bl_ramp(
    p0: tuple[float, float, float],
    p1: tuple[float, float, float],
    width: float,
    thickness: float = 0.34,
    pad_len: float = 0.28,
) -> dict:
    """
    Universal exact Three.js orientedBox ramp collider whose TOP surface passes cleanly
    through Blender 3D endpoints p0 (bottom) and p1 (top).
    Matches PhysicsWorld.addStaticOrientedBox YXZ intrinsic Euler rotation:
      rot = [0, yaw, roll] where local +X runs from p0 -> p1.
    """
    tx0, ty0, tz0 = p0[0], p0[2], -p0[1]
    tx1, ty1, tz1 = p1[0], p1[2], -p1[1]
    dx, dy, dz = tx1 - tx0, ty1 - ty0, tz1 - tz0
    run = math.hypot(dx, dz)
    length = math.hypot(run, dy)
    yaw = math.atan2(-dz, dx)
    roll = math.atan2(dy, max(1e-5, run))
    nx = -math.sin(roll) * math.cos(yaw)
    ny = math.cos(roll)
    nz = math.sin(roll) * math.sin(yaw)
    mx = (tx0 + tx1) * 0.5 - nx * (thickness * 0.5)
    my = (ty0 + ty1) * 0.5 - ny * (thickness * 0.5)
    mz = (tz0 + tz1) * 0.5 - nz * (thickness * 0.5)
    return {
        "center": [round(mx, 3), round(my, 3), round(mz, 3)],
        "half": [round(length * 0.5 + pad_len, 3), round(thickness * 0.5, 3), round(width * 0.5, 3)],
        "rot": [0.0, round(yaw, 4), round(roll, 4)],
    }


def export_sv_model(
    b: MeshBuilder,
    model_name: str,
    colliders: list[dict] | None = None,
    cylinders: list[dict] | None = None,
    oriented: list[dict] | None = None,
    bake_ao: bool = True,
) -> None:
    reset_scene()
    for mat_name in b.mat_names:
        if mat_name not in MATERIAL_SPECS:
            raise ValueError(f"Unknown material '{mat_name}' in {model_name}")
    b.finalize_and_export(OUT_DIR / f"{model_name}.glb", bake_ao=bake_ao, basal_height=0.85)
    MANIFEST[f"{model_name}.glb"] = {
        "colliders": colliders or [],
        "cylinderColliders": cylinders or [],
        "orientedColliders": oriented or [],
    }


# =============================================================================
# V4 BMesh SCULPTED STORMVEIL GOTHIC ARCHITECTURAL PRIMITIVES
# =============================================================================
def add_sculpted_masonry_face(
    b: MeshBuilder,
    origin: tuple[float, float, float],
    width: float,
    height: float,
    axis: str = "Y",
    sign: int = -1,
    mat_primary: str = "citadel_masonry",
    mat_accent: str = "limestone_weathered",
    mat_dark: str = "damp_slate_stone",
    course_h: float = 0.56,
    block_w: float = 1.02,
    relief_min: float = 0.035,
    relief_max: float = 0.105,
    density: float = 0.78,
    seed: int = 101,
) -> None:
    """Delegates to V4 subdivided 26-vert chipped stone block sculpting (zero sub-brick grid!)."""
    _ = (mat_primary, mat_accent, mat_dark)
    add_sculpted_wall_courses(
        b,
        origin=origin,
        width=width,
        height=height,
        axis=axis,
        sign=sign,
        course_h=course_h,
        block_w=block_w,
        relief_min=relief_min,
        relief_max=relief_max,
        density=density,
        seed=seed,
    )


def add_stepped_buttress(
    b: MeshBuilder,
    base_pos: tuple[float, float, float],
    width: float,
    proj: float,
    height: float,
    axis: str = "Y",
    sign: int = -1,
    stages: int = 3,
    mat_body: str = "citadel_masonry",
    mat_cap: str = "limestone_weathered",
) -> None:
    """Multi-stage battered Gothic stepped buttress with sculpted plinth, quoins & sloped dripstones."""
    bx, by, bz = base_pos
    stage_h = height / stages
    # Heavy battered base plinth
    if axis == "Y":
        add_hewn_stone_block(b, "damp_slate_stone", (bx, by + sign * (proj * 0.56), bz + 0.42), (width + 0.24, proj + 0.28, 0.88), chip_amp=0.032, taper=0.08, seed=int(abs(bx * 13 + by * 7)) + 3)
    else:
        add_hewn_stone_block(b, "damp_slate_stone", (bx + sign * (proj * 0.56), by, bz + 0.42), (proj + 0.28, width + 0.24, 0.88), chip_amp=0.032, taper=0.08, seed=int(abs(bx * 13 + by * 7)) + 3)

    for i in range(stages):
        frac = 1.0 - i * 0.24
        p = proj * frac
        w = width * (1.0 - i * 0.09)
        z0 = bz + i * stage_h
        zc = z0 + stage_h * 0.5
        if axis == "Y":
            add_hewn_stone_block(b, mat_body, (bx, by + sign * (p * 0.5), zc), (w, p + 0.16, stage_h), chip_amp=0.028, taper=0.04, seed=200 + i * 11 + int(abs(bx * 5)))
            # Sculpted corner quoins along buttress shaft
            for qk in range(max(1, int(stage_h / 0.68))):
                qz = z0 + 0.34 + qk * 0.68
                if qz < z0 + stage_h - 0.18:
                    qside = 1 if qk % 2 == 0 else -1
                    add_hewn_stone_block(b, mat_cap, (bx + qside * (w * 0.34), by + sign * (p * 0.72), qz), (w * 0.38, p * 0.58, 0.30), chip_amp=0.022, seed=240 + qk + i)
            # Sloped dripstone weathering cap
            add_hewn_stone_block(
                b,
                mat_cap,
                (bx, by + sign * (p * 0.55), z0 + stage_h + 0.07),
                (w + 0.20, p + 0.30, 0.22),
                chip_amp=0.024,
                rot=(-sign * 0.32, 0.0, 0.0),
                seed=280 + i,
            )
        else:
            add_hewn_stone_block(b, mat_body, (bx + sign * (p * 0.5), by, zc), (p + 0.16, w, stage_h), chip_amp=0.028, taper=0.04, seed=200 + i * 11 + int(abs(by * 5)))
            for qk in range(max(1, int(stage_h / 0.68))):
                qz = z0 + 0.34 + qk * 0.68
                if qz < z0 + stage_h - 0.18:
                    qside = 1 if qk % 2 == 0 else -1
                    add_hewn_stone_block(b, mat_cap, (bx + sign * (p * 0.72), by + qside * (w * 0.34), qz), (p * 0.58, w * 0.38, 0.30), chip_amp=0.022, seed=240 + qk + i)
            add_hewn_stone_block(
                b,
                mat_cap,
                (bx + sign * (p * 0.55), by, z0 + stage_h + 0.07),
                (p + 0.30, w + 0.20, 0.22),
                chip_amp=0.024,
                rot=(0.0, sign * 0.32, 0.0),
                seed=280 + i,
            )


def add_gothic_pointed_arch(
    b: MeshBuilder,
    center: tuple[float, float, float],
    half_span: float,
    spring_z: float,
    apex_rise: float,
    depth: float,
    ring_thick: float = 0.42,
    segments_per_side: int = 8,
    axis: str = "Y",
    mat_voussoir: str = "limestone_weathered",
    mat_trim: str = "citadel_masonry",
) -> None:
    """Delegates to V4 multi-order recessed Gothic pointed archivolt with solid hewn voussoirs."""
    _ = (mat_voussoir, mat_trim)
    add_molded_gothic_arch(
        b,
        center=center,
        half_span=half_span,
        spring_z=spring_z,
        apex_rise=apex_rise,
        depth=depth,
        ring_thick=ring_thick,
        segments_per_side=segments_per_side,
        axis=axis,
        with_hood_mold=True,
        seed=int(abs(center[0] * 17 + center[1] * 23 + center[2] * 11)) + 19,
    )


def add_broken_crenellations(
    b: MeshBuilder,
    start: tuple[float, float, float],
    length: float,
    axis: str = "X",
    thick: float = 0.56,
    parapet_h: float = 0.95,
    merlon_h: float = 0.78,
    mat_wall: str = "citadel_masonry",
    mat_cap: str = "limestone_weathered",
    seed: int = 303,
) -> None:
    """Weathered Stormveil battlement parapet with sculpted solid-stone coping & chipped/broken merlons."""
    rng = random.Random(seed)
    sx, sy, sz = start
    if axis == "X":
        b.add_box(mat_wall, (sx + length * 0.5, sy, sz + parapet_h * 0.5), (length, thick, parapet_h), bevel=0.03)
    else:
        b.add_box(mat_wall, (sx, sy + length * 0.5, sz + parapet_h * 0.5), (thick, length, parapet_h), bevel=0.03)

    # Individual sculpted limestone coping slabs along parapet top (instead of one extruded strip!)
    n_cope = max(2, int(round(length / 1.15)))
    cope_l = length / n_cope
    for c in range(n_cope):
        cp = (c + 0.5) * cope_l
        if axis == "X":
            add_hewn_stone_block(b, mat_cap, (sx + cp, sy, sz + parapet_h + 0.06), (cope_l - 0.025, thick + 0.16, 0.15), chip_amp=0.022, seed=seed + c * 5)
        else:
            add_hewn_stone_block(b, mat_cap, (sx, sy + cp, sz + parapet_h + 0.06), (thick + 0.16, cope_l - 0.025, 0.15), chip_amp=0.022, seed=seed + c * 5)

    step = 1.65
    n = max(1, int(length / step))
    for i in range(n):
        pos = (i + 0.5) * (length / n)
        if rng.random() < 0.20:
            mh = merlon_h * rng.uniform(0.32, 0.58)
            mw = 0.85 * rng.uniform(0.75, 0.95)
            has_cap = False
        else:
            mh = merlon_h * rng.uniform(0.90, 1.08)
            mw = 0.96 * rng.uniform(0.92, 1.04)
            has_cap = True
        if axis == "X":
            add_hewn_stone_block(b, mat_cap, (sx + pos, sy, sz + parapet_h + mh * 0.5), (mw, thick, mh), chip_amp=0.030, taper=0.05, seed=seed + 100 + i)
            if has_cap:
                add_hewn_stone_block(b, mat_cap, (sx + pos, sy, sz + parapet_h + mh + 0.07), (mw + 0.14, thick + 0.18, 0.16), chip_amp=0.022, seed=seed + 200 + i)
        else:
            add_hewn_stone_block(b, mat_cap, (sx, sy + pos, sz + parapet_h + mh * 0.5), (thick, mw, mh), chip_amp=0.030, taper=0.05, seed=seed + 100 + i)
            if has_cap:
                add_hewn_stone_block(b, mat_cap, (sx, sy + pos, sz + parapet_h + mh + 0.07), (thick + 0.18, mw + 0.14, 0.16), chip_amp=0.022, seed=seed + 200 + i)


def add_wall_vines(
    b: MeshBuilder,
    anchor: tuple[float, float, float],
    width: float,
    drop: float,
    axis: str = "Y",
    sign: int = -1,
    seed: int = 404,
) -> None:
    """Organic diagonal creeping ivy stems + clustered leaf tufts (eliminates rigid vertical square grids!)."""
    rng = random.Random(seed)
    ax, ay, az = anchor
    roots = max(2, int(width * 0.75))
    for i in range(roots):
        u_cur = -width * 0.42 + (i + 0.5) * (width * 0.84 / roots) + rng.uniform(-0.22, 0.22)
        z_cur = az
        segs = max(3, int(drop / 0.65))
        drift_dir = rng.choice((-1.0, 1.0)) * rng.uniform(0.16, 0.34)
        for s in range(segs):
            t = s / max(1, segs)
            dz = (drop / segs) * rng.uniform(0.68, 1.05)
            du = drift_dir * dz + math.sin(s * 1.4 + i) * 0.14
            u_next = max(-width * 0.52, min(width * 0.52, u_cur + du))
            z_next = z_cur - dz
            um, zm = (u_cur + u_next) * 0.5, (z_cur + z_next) * 0.5
            slen = math.hypot(u_next - u_cur, z_next - z_cur)
            ang = math.atan2(u_next - u_cur, z_cur - z_next)
            stem_th = 0.036 * (1.0 - t * 0.38)
            if axis == "Y":
                b.add_box("aged_oak_timber", (ax + um, ay + sign * 0.035, zm), (stem_th, stem_th, slen + 0.03), rot=(0.0, ang, 0.0))
            else:
                b.add_box("aged_oak_timber", (ax + sign * 0.035, ay + um, zm), (stem_th, stem_th, slen + 0.03), rot=(-ang, 0.0, 0.0))

            # Dense organic ivy foliage mat near top cornice tapering to sparse trailing tendrils
            n_tufts = 3 if t < 0.45 else (2 if t < 0.78 else 1)
            for _ in range(n_tufts):
                lu = um + rng.uniform(-0.22, 0.22)
                lz = zm + rng.uniform(-0.18, 0.18)
                lw = rng.uniform(0.18, 0.34) * (1.0 - t * 0.35)
                lh = lw * rng.uniform(0.75, 1.18)
                out = 0.042 + rng.uniform(0.008, 0.038)
                if axis == "Y":
                    b.add_box("foliage_leaf", (ax + lu, ay + sign * out, lz), (lw, 0.035, lh), bevel=0.01, rot=(rng.uniform(-0.22, 0.22), rng.uniform(-0.65, 0.65), rng.uniform(-0.25, 0.25)))
                else:
                    b.add_box("foliage_leaf", (ax + sign * out, ay + lu, lz), (0.035, lw, lh), bevel=0.01, rot=(rng.uniform(-0.65, 0.65), rng.uniform(-0.22, 0.22), rng.uniform(-0.25, 0.25)))
            u_cur, z_cur = u_next, z_next


def add_iron_brazier(b: MeshBuilder, pos: tuple[float, float, float], scale: float = 1.0) -> None:
    """Delegates to V4 forged-iron basket brazier with charred oak logs & jagged coals."""
    add_wrought_iron_brazier(b, pos, scale=scale, seed=int(abs(pos[0] * 19 + pos[1] * 31)) + 41)


def add_stone_stair_flight(
    b: MeshBuilder,
    p0: tuple[float, float, float],
    p1: tuple[float, float, float],
    width: float,
    step_count: int,
    parapet_left: bool = True,
    parapet_right: bool = True,
    solid_under: bool = True,
    mat_tread: str = "broken_flagstone",
    mat_wall: str = "citadel_masonry",
    seed: int = 505,
) -> tuple[list[dict], list[dict]]:
    """
    V4 Weathered Irregular Stone/Timber Stairs:
      - Overhanging solid-stone/oak step treads over horizontal-coursed masonry piers.
      - Side cheek walls use 100% horizontal stone courses capped by STEPPED horizontal
        `limestone_weathered` coping blocks (eliminates diagonal plank bars in Cam H!).
    """
    rng = random.Random(seed)
    dx, dy, dz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
    run = math.hypot(dx, dy)
    ang_z = math.atan2(dy, dx)
    ux, uy = dx / max(1e-5, run), dy / max(1e-5, run)
    lx, ly = -uy, ux

    tread_d = run / max(1, step_count)
    rise_h = dz / max(1, step_count)
    tread_mat = "aged_oak_timber" if mat_tread == "aged_oak_timber" else "limestone_weathered"

    for i in range(step_count):
        t = (i + 0.5) / step_count
        sx = p0[0] + dx * t
        sy = p0[1] + dy * t
        top_z = p0[2] + (i + 1) * rise_h
        tread_thick = 0.16
        add_hewn_stone_block(
            b,
            tread_mat,
            (sx, sy, top_z - tread_thick * 0.5),
            (tread_d + 0.09, width + rng.uniform(-0.03, 0.04), tread_thick),
            chip_amp=0.022,
            bulge_amp=0.010,
            taper=0.01,
            rot=(rng.uniform(-0.012, 0.012), rng.uniform(-0.012, 0.012), ang_z),
            seed=seed + i * 7,
        )
        if solid_under:
            under_h = max(0.18, (top_z - tread_thick) - p0[2] + 0.30)
            b.add_box(
                mat_wall,
                (sx, sy, (top_z - tread_thick) - under_h * 0.5),
                (tread_d + 0.03, width - 0.08, under_h),
                bevel=0.015,
                rot=(0.0, 0.0, ang_z),
            )
        else:
            b.add_box(
                mat_wall,
                (sx, sy, top_z - tread_thick - 0.10),
                (tread_d + 0.04, width - 0.12, 0.22),
                rot=(0.0, 0.0, ang_z),
            )

    box_cols: list[dict] = []
    oriented_cols: list[dict] = [bl_ramp(p0, p1, width=width + 0.16, thickness=0.36, pad_len=0.30)]

    slope_pitch = math.atan2(dz, max(1e-5, run))
    slope_len = math.hypot(run, dz)
    n_cheek = max(5, step_count // 2)
    for side, enabled in ((1.0, parapet_left), (-1.0, parapet_right)):
        if not enabled:
            continue
        off = side * (width * 0.5 + 0.22)
        if mat_wall == "aged_oak_timber":
            mx = (p0[0] + p1[0]) * 0.5 + lx * off
            my = (p0[1] + p1[1]) * 0.5 + ly * off
            mz = (p0[2] + p1[2]) * 0.5 + 0.92
            b.add_box("aged_oak_timber", (mx, my, mz), (slope_len + 0.25, 0.14, 0.14), bevel=0.015, rot=(0.0, -slope_pitch, ang_z))
            for pk in range(5):
                pt = pk / 4.0
                px = p0[0] + dx * pt + lx * off
                py = p0[1] + dy * pt + ly * off
                pz = p0[2] + dz * pt + 0.46
                b.add_box("aged_oak_timber", (px, py, pz), (0.14, 0.14, 0.96), bevel=0.01, rot=(0.0, 0.0, ang_z))
        else:
            # Stepped horizontal-coursed stone parapet piers + horizontal overhanging coping slabs!
            seg_d = run / n_cheek
            for ck in range(n_cheek):
                ct = (ck + 0.5) / n_cheek
                cx_p = p0[0] + dx * ct + lx * off
                cy_p = p0[1] + dy * ct + ly * off
                top_rail_z = p0[2] + dz * ((ck + 0.85) / n_cheek) + 0.86
                bot_z = (p0[2] - 0.25) if solid_under else (p0[2] + dz * ct - 0.24)
                ch_h = max(0.45, top_rail_z - bot_z)
                b.add_box(mat_wall, (cx_p, cy_p, bot_z + ch_h * 0.5), (seg_d + 0.05, 0.44, ch_h), bevel=0.02, rot=(0.0, 0.0, ang_z))
                add_hewn_stone_block(
                    b,
                    "limestone_weathered",
                    (cx_p, cy_p, top_rail_z + 0.09),
                    (seg_d + 0.12, 0.56, 0.19),
                    chip_amp=0.024,
                    rot=(0.0, 0.0, ang_z),
                    seed=seed + 300 + ck + (0 if side > 0 else 40),
                )
        gp0 = (p0[0] + lx * off, p0[1] + ly * off, p0[2] + 1.25)
        gp1 = (p1[0] + lx * off, p1[1] + ly * off, p1[2] + 1.25)
        oriented_cols.append(bl_ramp(gp0, gp1, width=0.44, thickness=1.35, pad_len=0.22))

    return box_cols, oriented_cols


# =============================================================================
# HERO ASSET 1: SOUTH GATEHOUSE + WALKABLE WEST WATCHTOWER (z = +14.0, y = 0.0)
# Connects Ground (0.0m) -> Gatehouse Battlement (+9.5m) -> West Watchtower Peak (+15.5m)
# =============================================================================
def build_sv_gate_tower() -> None:
    b = MeshBuilder("sv_hero_gate_tower", seed=901)
    cols: list[dict] = []
    oriented: list[dict] = []

    # Monumental South Gatehouse Core (x in [-16, +15], y_bl in [-3.4, +3.4], top deck z_bl = 9.5m)
    # Central pointed Gothic archway: x in [-2.85, +2.85], clear height z_bl = 0..5.7m!
    for side, sx_center, sw in ((-1, -7.2, 8.8), (1, 7.2, 8.8)):
        # Multi-course battered stone plinth (widens at ground level, zero raw box look!)
        add_hewn_stone_block(b, "damp_slate_stone", (sx_center, 0.0, 0.52), (sw + 0.72, 7.65, 1.35), chip_amp=0.04, taper=0.08, seed=901 + side)
        add_hewn_stone_block(b, "damp_slate_stone", (sx_center, 0.0, 1.55), (sw + 0.36, 7.25, 1.05), chip_amp=0.035, taper=0.06, seed=905 + side)
        # Molded limestone stringcourse band separating plinth from upper drum
        add_hewn_stone_block(b, "limestone_weathered", (sx_center, 0.0, 2.16), (sw + 0.44, 7.36, 0.24), chip_amp=0.025, seed=908 + side)
        # Main masonry drum body with slight batter
        add_hewn_stone_block(b, "citadel_masonry", (sx_center, 0.0, 5.65), (sw, 6.8, 7.5), chip_amp=0.035, taper=0.03, seed=909 + side)
        # Sculpted irregular 3D coursed solid-limestone & slate blocks on South (-Y), North (+Y) & Passage-Inner faces!
        add_sculpted_masonry_face(b, (sx_center, -3.42, 2.25), sw - 0.5, 6.9, "Y", -1, seed=910 + side)
        add_sculpted_masonry_face(b, (sx_center, 3.42, 2.25), sw - 0.5, 6.9, "Y", 1, seed=920 + side)
        add_sculpted_masonry_face(b, (side * 2.92, 0.0, 0.35), 6.2, 3.1, "X", -side, course_h=0.48, block_w=0.88, seed=925 + side)
        # Twin massive stepped Gothic buttresses flanking arch & outer flanks
        add_stepped_buttress(b, (side * 3.55, -3.4, 0.0), 1.38, 1.42, 8.9, "Y", -1, stages=3)
        add_stepped_buttress(b, (side * 10.6, -3.4, 0.0), 1.58, 1.58, 9.2, "Y", -1, stages=3)
        add_stepped_buttress(b, (side * 3.55, 3.4, 0.0), 1.28, 1.22, 8.8, "Y", 1, stages=3)
        # Deep chamfered Gothic arrow embrasures with limestone lintels/sills & forged iron crossbars
        for az in (4.2, 7.1):
            b.add_box("damp_slate_stone", (side * 7.2, -3.38, az), (0.56, 0.42, 1.82), bevel=0.03)
            add_hewn_stone_block(b, "limestone_weathered", (side * 7.2, -3.50, az - 0.96), (0.76, 0.34, 0.18), chip_amp=0.02, seed=928 + int(az))
            add_hewn_stone_block(b, "limestone_weathered", (side * 7.2, -3.50, az + 0.96), (0.76, 0.34, 0.20), chip_amp=0.02, seed=929 + int(az))
            b.add_box("iron_forged", (side * 7.2, -3.44, az), (0.06, 0.06, 1.62))
            for bar_z in (-0.45, 0.0, 0.45):
                b.add_box("iron_forged", (side * 7.2, -3.44, az + bar_z), (0.44, 0.06, 0.06))

    # Central Bridge Span above the Gatehouse Archway + True Ribbed Gothic Groin Vault Ceiling!
    b.add_box("citadel_masonry", (0.0, 0.0, 7.72), (6.4, 6.8, 3.55), bevel=0.04)
    add_sculpted_masonry_face(b, (0.0, -3.42, 6.2), 5.6, 3.2, "Y", -1, seed=931)
    add_sculpted_masonry_face(b, (0.0, 3.42, 6.2), 5.6, 3.2, "Y", 1, seed=932)
    add_ribbed_groin_vault(b, (0.0, 0.0, 0.0), half_span=2.82, y_length=6.5, spring_z=3.15, apex_rise=2.50, bays=2, seed=934)

    # Multi-order Pointed Gothic Gate Archivolts (South face, Middle transverse rib, North face)
    for ay in (-3.28, 0.0, 3.28):
        add_gothic_pointed_arch(b, (0.0, ay, 0.0), half_span=2.85, spring_z=3.15, apex_rise=2.55, depth=0.84, ring_thick=0.52, axis="Y")

    # Raised Forged-Iron Portcullis Grid + Spiked Iron Shoes + Windlass Hoist Chains!
    for px in (-2.2, -1.65, -1.1, -0.55, 0.0, 0.55, 1.1, 1.65, 2.2):
        b.add_box("iron_forged", (px, -2.55, 5.05), (0.085, 0.085, 1.45))
        b.add_cylinder("iron_forged", (px, -2.55, 4.24), 0.055, 0.008, 0.22, segs=4)
    for hz_bar in (4.65, 5.15, 5.55):
        b.add_box("iron_forged", (0.0, -2.55, hz_bar), (5.05, 0.11, 0.09))
    for cx_ch in (-1.65, 1.65):
        b.add_cylinder("iron_forged", (cx_ch, -2.35, 5.35), 0.045, 0.045, 1.15, segs=6)

    # Heavy Recessed Studded Oak Gate Leaves with Forged Pintle Hinges & Iron Ring Knockers!
    for side in (-1, 1):
        b.add_box("aged_oak_timber", (side * 2.70, -1.05, 2.22), (0.24, 2.45, 4.42), bevel=0.02)
        for hz in (0.75, 1.85, 2.95, 3.85):
            b.add_box("iron_forged", (side * 2.56, -1.05, hz), (0.07, 2.38, 0.13), bevel=0.008)
            b.add_cylinder("iron_forged", (side * 2.62, -2.22, hz), 0.09, 0.09, 0.24, segs=8)
        # Hanging hexagonal cage lantern inside gate passage
        add_gothic_cage_lantern(b, (side * 2.36, 1.55, 3.05), scale=1.05)

    # Hand-hewn Stone Curbstones & Storm Drain Grates framing the Gatehouse Passage (`Cam A`)!
    add_curb_and_gutter_run(b, [(-2.74, -4.2, 0.0), (-2.74, 0.0, 0.0), (-2.74, 4.2, 0.0)], grate_indices={1}, seed=936)
    add_curb_and_gutter_run(b, [(2.74, -4.2, 0.0), (2.74, 0.0, 0.0), (2.74, 4.2, 0.0)], grate_indices={1}, seed=938)

    # Benchmark A Set-Dressing: Guard Timber Cheval-de-Frise Palisade & Forged Halberd Weapon Rack!
    for side in (-1, 1):
        gx_base = side * 5.6
        b.add_box("aged_oak_timber", (gx_base, -4.65, 0.58), (2.2, 0.18, 0.18), bevel=0.015)
        for sk in (-0.85, -0.30, 0.30, 0.85):
            b.add_cylinder("aged_oak_timber", (gx_base + sk, -4.85, 0.68), 0.075, 0.015, 1.45, segs=6, rot=(0.58, 0.0, 0.0))
            b.add_cylinder("aged_oak_timber", (gx_base + sk, -4.45, 0.68), 0.075, 0.015, 1.45, segs=6, rot=(-0.58, 0.0, 0.0))
    # Inner courtyard guard halberd & shield rack (x = -3.85, y_bl = +4.65 -> clear of road!)
    b.add_box("aged_oak_timber", (-3.95, 4.85, 0.85), (0.14, 1.65, 1.65), bevel=0.015)
    for hy in (4.25, 4.65, 5.05, 5.45):
        b.add_cylinder("aged_oak_timber", (-3.82, hy, 1.15), 0.03, 0.025, 2.25, segs=6, rot=(0.0, 0.12, 0.0))
        b.add_box("iron_forged", (-3.68, hy, 2.22), (0.04, 0.18, 0.34), bevel=0.005)

    # Walkable Top Battlement Stone Deck at z_bl = 9.5m + Machicolation Corbels
    b.add_box("broken_flagstone", (-1.5, 0.0, 9.42), (27.6, 6.9, 0.24), bevel=0.02)
    for mx in range(-14, 12, 2):
        add_hewn_stone_block(b, "limestone_weathered", (float(mx), -3.55, 9.15), (0.38, 0.65, 0.55), chip_amp=0.02, seed=940 + mx)
    add_broken_crenellations(b, (-15.0, -3.25, 9.5), 26.8, axis="X", seed=941)
    add_broken_crenellations(b, (-11.0, 3.25, 9.5), 22.8, axis="X", seed=942)
    # Timber War-Hoarding Gallery crowning the South Gatehouse!
    for hx in (-2.4, -1.2, 0.0, 1.2, 2.4):
        b.add_box("aged_oak_timber", (hx, -3.65, 9.2), (0.22, 1.15, 0.24), bevel=0.015)
    b.add_box("aged_oak_timber", (0.0, -3.95, 10.65), (6.4, 0.22, 2.2), bevel=0.02)
    b.add_box("roof_slate", (0.0, -3.45, 12.15), (6.9, 2.4, 0.22), bevel=0.02, rot=(0.35, 0.0, 0.0))

    # Soaring West Citadel Watchtower rising at x = -13.8, y_bl = -0.8 (rises to z_bl = 17.8m!)
    add_hewn_stone_block(b, "damp_slate_stone", (-13.8, -0.8, 1.1), (5.9, 6.3, 3.2), chip_amp=0.04, taper=0.08, seed=950)
    add_hewn_stone_block(b, "citadel_masonry", (-13.8, -0.8, 9.2), (5.2, 5.6, 15.6), chip_amp=0.035, taper=0.04, seed=951)
    add_sculpted_masonry_face(b, (-13.8, -3.62, 2.2), 4.6, 14.2, "Y", -1, seed=951)
    add_sculpted_masonry_face(b, (-11.18, -0.8, 9.8), 4.8, 6.8, "X", 1, seed=952)
    add_stepped_buttress(b, (-16.4, -0.8, 0.0), 1.4, 1.4, 13.5, "X", -1, stages=3)
    add_broken_crenellations(b, (-16.3, -3.4, 17.0), 5.0, axis="X", seed=953)
    add_broken_crenellations(b, (-16.3, 1.8, 17.0), 5.0, axis="X", seed=954)
    add_broken_crenellations(b, (-16.3, -3.4, 17.0), 5.2, axis="Y", seed=955)
    add_broken_crenellations(b, (-11.3, -3.4, 17.0), 5.2, axis="Y", seed=956)

    # Flanking East Bastion Tower (x = +13.6, rises to z_bl = 14.2m + steep slate spire!)
    add_hewn_stone_block(b, "damp_slate_stone", (13.6, -0.5, 1.0), (5.7, 6.1, 3.0), chip_amp=0.04, taper=0.08, seed=960)
    add_hewn_stone_block(b, "citadel_masonry", (13.6, -0.5, 7.6), (5.0, 5.4, 12.6), chip_amp=0.035, taper=0.04, seed=961)
    add_sculpted_masonry_face(b, (13.6, -3.22, 2.0), 4.4, 11.4, "Y", -1, seed=961)
    add_stepped_buttress(b, (16.1, -0.5, 0.0), 1.35, 1.35, 11.5, "X", 1, stages=3)
    add_broken_crenellations(b, (11.2, -3.0, 13.9), 4.8, axis="X", seed=962)
    add_broken_crenellations(b, (11.2, 2.0, 13.9), 4.8, axis="X", seed=963)
    b.add_cylinder("roof_slate", (13.6, -0.5, 16.6), 3.35, 0.16, 4.6, segs=8, bevel=0.02)

    # Forged Log/Coal Braziers, Hanging Tattered Banners & Climbing Wall Vines!
    add_iron_brazier(b, (-4.1, -4.1, 0.0), scale=1.05)
    add_iron_brazier(b, (4.1, -4.1, 0.0), scale=1.05)
    add_iron_brazier(b, (0.0, -2.5, 9.5), scale=0.95)
    for sx in (-4.4, 4.4):
        b.add_planar_quad("banner_ashenhold", (sx - 0.55, -3.72, 3.5), (sx + 0.55, -3.72, 3.5), (sx + 0.55, -3.72, 7.9), (sx - 0.55, -3.72, 7.9), double_sided=True)
    add_wall_vines(b, (-8.8, -3.45, 7.8), 3.2, 4.8, "Y", -1, seed=971)
    add_wall_vines(b, (9.0, -3.45, 6.8), 2.8, 4.2, "Y", -1, seed=972)
    add_wall_vines(b, (-13.5, -3.65, 14.5), 3.6, 5.5, "Y", -1, seed=973)

    # Walkable Switchback Guard Stairway on North (inner) side of Gatehouse West Pier
    c1, o1 = add_stone_stair_flight(b, (-4.8, 4.6, 4.8), (-12.8, 4.6, 9.5), width=2.2, step_count=16, parapet_left=False, parapet_right=False, solid_under=True, seed=981)
    b.add_box("citadel_masonry", (-4.8, 5.2, 2.35), (2.4, 3.2, 4.9), bevel=0.03)
    b.add_box("broken_flagstone", (-4.8, 5.2, 4.78), (2.5, 3.3, 0.14), bevel=0.015)
    c2, o2 = add_stone_stair_flight(b, (-4.8, 14.2, 0.15), (-4.8, 6.2, 4.8), width=2.2, step_count=16, parapet_left=True, parapet_right=True, solid_under=True, seed=982)
    b.add_box("broken_flagstone", (-13.2, 3.8, 9.42), (3.6, 3.6, 0.24), bevel=0.02)

    cols.extend([
        bl_box(-7.2, 0.0, 4.6, 8.6, 6.8, 9.2),
        bl_box(7.2, 0.0, 4.6, 8.6, 6.8, 9.2),
        bl_box(-13.8, -0.8, 8.5, 5.4, 5.8, 17.0),
        bl_box(13.6, -0.5, 7.0, 5.2, 5.6, 14.0),
        bl_box(-1.5, 0.0, 9.36, 27.6, 6.9, 0.30),
        bl_box(-13.2, 3.8, 9.36, 3.6, 3.6, 0.30),
        bl_box(-1.5, -3.25, 10.2, 26.8, 0.56, 1.4),
        bl_box(0.5, 3.25, 10.2, 22.8, 0.56, 1.4),
        bl_box(-4.8, 5.2, 2.4, 2.4, 3.2, 4.8),
    ])
    cols.extend(c1 + c2)
    oriented.extend(o1 + o2)
    export_sv_model(b, "sv_hero_gate_tower", colliders=cols, oriented=oriented)


# (Legacy build_sv_gothic_bridge placeholder removed — build_sv_gothic_bridge_fixed below exports sv_hero_gothic_bridge.glb)


# =============================================================================
# HERO ASSET 3: MARKET NORTH BASTION WALL + SHOWCASE CAM-F & CAM-H CLIFF-WALL JUNCTION
# Placed at (0.0, 3.5, -51.0).
# =============================================================================
def build_sv_market_bastion() -> None:
    b = MeshBuilder("sv_hero_market_bastion", seed=903)
    cols: list[dict] = []
    oriented: list[dict] = []

    WALL_W = 34.0
    DECK_H = 4.0  # +4.0m local = +7.5m world!

    # Battered Lower Slate Plinth, Molded Stringcourse & Main Retaining Bastion Body
    add_hewn_stone_block(b, "damp_slate_stone", (0.0, 2.0, 0.45), (WALL_W + 0.7, 4.9, 1.65), chip_amp=0.04, taper=0.07, seed=1100)
    add_hewn_stone_block(b, "limestone_weathered", (0.0, 2.0, 1.35), (WALL_W + 0.4, 4.6, 0.22), chip_amp=0.025, seed=1102)
    b.add_box("citadel_masonry", (0.0, 2.1, 2.65), (WALL_W, 4.2, 2.7), bevel=0.04)
    b.add_box("broken_flagstone", (0.0, 3.2, DECK_H - 0.08), (WALL_W, 6.6, 0.22), bevel=0.02)

    # -------------------------------------------------------------------------
    # BENCHMARK C & CAM F (1m closeup at world [0, 3.95, -49.2], wall face at y_bl = -0.40)
    # Note: Keep x in [-1.05, +1.05] clear of wall bossage so the recessed Gothic shrine niche stays clean!
    # -------------------------------------------------------------------------
    b.add_box("citadel_masonry", (0.0, -0.05, 2.0), (8.2, 0.72, 4.05), bevel=0.03)
    for side_f, xf_c in ((-1, -2.52), (1, 2.52)):
        add_sculpted_masonry_face(
            b,
            (xf_c, -0.40, 0.25),
            width=2.85,
            height=3.65,
            axis="Y",
            sign=-1,
            course_h=0.42,
            block_w=0.78,
            relief_min=0.038,
            relief_max=0.095,
            density=0.94,
            seed=1101 + side_f,
        )
    add_sculpted_masonry_face(b, (0.0, -0.40, 2.95), width=2.2, height=0.95, axis="Y", sign=-1, course_h=0.38, block_w=0.68, seed=1103)
    add_stepped_buttress(b, (-2.45, -0.40, 0.0), 1.08, 0.96, 4.05, "Y", -1, stages=3)
    add_stepped_buttress(b, (2.45, -0.40, 0.0), 1.08, 0.96, 4.05, "Y", -1, stages=3)

    # Deep Recessed Pointed Gothic Blind-Arch Shrine Niche right at x = 0.0 (Cam F 1m centerpiece!)
    b.add_box("damp_slate_stone", (0.0, -0.30, 1.58), (1.82, 0.36, 2.52), bevel=0.02)
    # Carved twin recessed Gothic lancet panels + chamfered limestone mullion ribs inside niche back
    for mx_n in (-0.52, 0.0, 0.52):
        b.add_box("limestone_weathered", (mx_n, -0.47, 1.48), (0.085, 0.09, 1.55), bevel=0.012)
    b.add_box("limestone_weathered", (0.0, -0.47, 1.98), (1.16, 0.09, 0.085), bevel=0.012)
    add_gothic_pointed_arch(b, (0.0, -0.52, 0.0), half_span=0.96, spring_z=1.55, apex_rise=1.05, depth=0.42, ring_thick=0.28, segments_per_side=7, axis="Y")

    # Carved weathered limestone altar shelf, octagonal slate pedestal & votive melted wax candles!
    add_hewn_stone_block(b, "limestone_weathered", (0.0, -0.68, 0.62), (1.46, 0.54, 0.22), chip_amp=0.024, seed=1105)
    b.add_cylinder("damp_slate_stone", (0.0, -0.68, 0.30), 0.34, 0.39, 0.58, segs=8, bevel=0.02)
    for vx_c, vh_c in ((-0.46, 0.14), (-0.36, 0.09), (0.44, 0.12)):
        b.add_cylinder("cloth_linen", (vx_c, -0.74, 0.73 + vh_c * 0.5), 0.024, 0.021, vh_c, segs=6)
        b.add_cylinder("glow_warm", (vx_c, -0.74, 0.74 + vh_c + 0.016), 0.010, 0.002, 0.028, segs=5)

    # Intricate Forged-Iron S-Scroll Wall Anchor Tie-Plates with Rivet Bolts flanking Cam F!
    for tx in (-1.48, 1.48):
        b.add_box("iron_forged", (tx, -0.50, 2.25), (0.08, 0.05, 0.76), bevel=0.008)
        b.add_box("iron_forged", (tx, -0.50, 2.25), (0.36, 0.05, 0.08), bevel=0.008)
        b.add_cylinder("iron_forged", (tx, -0.53, 2.25), 0.055, 0.055, 0.08, segs=6, rot=(math.pi * 0.5, 0.0, 0.0))

    # Forged Wrought-Iron Scroll Bracket + Hexagonal Gothic Cage Lantern (NO salmon-pink octagon!)
    b.add_box("iron_forged", (0.0, -0.62, 2.14), (0.06, 0.44, 0.06), bevel=0.006)
    b.add_box("iron_forged", (0.0, -0.54, 1.98), (0.05, 0.34, 0.05), rot=(0.68, 0.0, 0.0))
    add_gothic_cage_lantern(b, (0.0, -0.78, 1.82), scale=1.02)

    # Carved Multi-Piece Limestone Gothic Heraldic Tablet & Iron Cross Relief below Lantern
    add_hewn_stone_block(b, "limestone_weathered", (0.0, -0.51, 1.16), (0.64, 0.14, 0.60), chip_amp=0.022, seed=1107)
    add_hewn_stone_block(b, "damp_slate_stone", (0.0, -0.56, 1.16), (0.46, 0.10, 0.44), chip_amp=0.018, seed=1108)
    b.add_box("iron_forged", (0.0, -0.62, 1.16), (0.048, 0.04, 0.28))
    b.add_box("iron_forged", (0.0, -0.62, 1.21), (0.19, 0.04, 0.048))

    # Cascading wall ivy vines & sculpted basal fallen rubble stones framing Cam F
    add_wall_vines(b, (-1.9, -0.50, 3.85), 1.4, 2.4, "Y", -1, seed=1111)
    add_wall_vines(b, (2.1, -0.50, 3.70), 1.3, 2.1, "Y", -1, seed=1112)
    for idx_r, (rx, ry, rs) in enumerate(((-1.7, -0.75, 0.28), (-1.35, -0.82, 0.20), (1.65, -0.78, 0.26), (1.95, -0.88, 0.18))):
        add_hewn_stone_block(b, "limestone_weathered", (rx, ry, rs * 0.42), (rs * 1.4, rs * 1.1, rs * 0.85), chip_amp=0.03, rot=(0.12, -0.15, rx), seed=1115 + idx_r)

    # Sculpted outer bastion wall faces + Curb/Drainage Gutter along Market North Wall base!
    add_sculpted_masonry_face(b, (-10.2, 0.0, 0.3), 11.4, 3.6, "Y", -1, seed=1121)
    add_sculpted_masonry_face(b, (10.2, 0.0, 0.3), 11.4, 3.6, "Y", -1, seed=1122)
    for bx in (-14.5, -7.2, 7.2, 14.5):
        add_stepped_buttress(b, (bx, 0.0, 0.0), 1.18, 0.98, 4.0, "Y", -1, stages=2)
    add_curb_and_gutter_run(b, [(-3.8, -0.92, 0.0), (0.0, -0.92, 0.0), (3.8, -0.92, 0.0)], grate_indices={0, 1}, seed=1125)

    # -------------------------------------------------------------------------
    # BENCHMARK C & CAM H: NATURAL JAGGED MOUNTAIN BEDROCK INTERLOCKING WITH BASTION MASONRY!
    # -------------------------------------------------------------------------
    add_stratified_cliff_crag(b, (-8.8, 0.65, 1.85), (4.6, 2.8, 4.2), dip_angle=0.48, subdivisions=2, rot=(0.04, 0.08, 0.12), seed=1126)
    add_stratified_cliff_crag(b, (-11.2, 1.35, 3.10), (3.8, 3.2, 5.0), dip_angle=0.52, subdivisions=2, rot=(-0.05, 0.10, -0.18), seed=1127)
    add_stratified_cliff_crag(b, (8.9, 0.70, 1.75), (4.4, 2.7, 4.0), dip_angle=-0.46, subdivisions=2, rot=(0.05, -0.08, -0.14), seed=1128)
    add_stratified_cliff_crag(b, (11.4, 1.40, 2.95), (3.6, 3.0, 4.8), dip_angle=-0.50, subdivisions=2, rot=(-0.04, -0.09, 0.16), seed=1129)

    # Central +7.5m Overlook Balustrade
    add_broken_crenellations(b, (-4.4, -0.20, DECK_H), 8.8, axis="X", thick=0.44, parapet_h=0.72, merlon_h=0.22, seed=1131)

    # TWIN IRREGULAR GOTHIC SWITCHBACK STAIRS climbing Market (+3.5m) -> Overlook (+7.5m)!
    c_sw, o_sw = add_stone_stair_flight(b, (-11.4, -1.65, 0.0), (-4.6, -1.65, DECK_H), width=2.4, step_count=16, parapet_left=False, parapet_right=True, solid_under=True, seed=1141)
    c_se, o_se = add_stone_stair_flight(b, (11.4, -1.65, 0.0), (4.6, -1.65, DECK_H), width=2.4, step_count=16, parapet_left=True, parapet_right=False, solid_under=True, seed=1142)
    # Sculpted stone face courses on the south-facing spandrel triangles of the switchback stairs (`Cam H` & `Cam C`!)
    add_sculpted_masonry_face(b, (-7.8, -2.88, 0.2), 5.6, 2.2, "Y", -1, course_h=0.42, block_w=0.82, seed=1145)
    add_sculpted_masonry_face(b, (7.8, -2.88, 0.2), 5.6, 2.2, "Y", -1, course_h=0.42, block_w=0.82, seed=1146)

    for side in (-1, 1):
        b.add_box("citadel_masonry", (side * 3.6, -1.45, DECK_H * 0.5), (2.2, 2.9, DECK_H), bevel=0.03)
        add_sculpted_masonry_face(b, (side * 3.6, -2.92, 0.25), 2.0, DECK_H - 0.3, "Y", -1, course_h=0.44, block_w=0.75, seed=1147 + side)
        b.add_box("broken_flagstone", (side * 3.6, -1.45, DECK_H - 0.06), (2.3, 3.0, 0.16), bevel=0.015)
        add_iron_brazier(b, (side * 12.6, -2.5, 0.0), scale=0.92)
        b.add_cylinder("aged_oak_timber", (side * 2.8, -0.25, DECK_H + 2.4), 0.08, 0.06, 4.8, segs=8)
        b.add_planar_quad("banner_ashenhold", (side * 2.8 - 0.45, -0.45, DECK_H + 1.5), (side * 2.8 + 0.45, -0.45, DECK_H + 1.5), (side * 2.8 + 0.45, -0.45, DECK_H + 4.2), (side * 2.8 - 0.45, -0.45, DECK_H + 4.2), double_sided=True)

    # WEST OVERLOOK -> +9.5m WEST MARKET BATTLEMENT RAMPART WALK + GOTHIC STONE MARKET ARCADE
    c_wr, o_wr = add_stone_stair_flight(b, (-13.5, 2.2, DECK_H), (-13.5, -2.8, 6.0), width=2.6, step_count=10, parapet_left=True, parapet_right=True, solid_under=True, seed=1151)

    arcade_z0 = -2.8
    bay_len = 5.2
    for i in range(6):
        by_mid = arcade_z0 - (i + 0.5) * bay_len
        b.add_box("citadel_masonry", (-15.3, by_mid, 3.0), (1.2, bay_len + 0.1, 6.2), bevel=0.03)
        add_hewn_stone_block(b, "damp_slate_stone", (-12.1, by_mid + bay_len * 0.5, 2.8), (1.38, 1.38, 5.8), chip_amp=0.035, taper=0.04, seed=1155 + i)
        add_stepped_buttress(b, (-11.45, by_mid + bay_len * 0.5, 0.0), 0.92, 0.74, 5.6, "X", 1, stages=2)
        add_gothic_pointed_arch(b, (-12.1, by_mid, 0.0), half_span=1.95, spring_z=2.3, apex_rise=1.85, depth=1.1, ring_thick=0.38, segments_per_side=7, axis="X")
        b.add_box("citadel_masonry", (-12.2, by_mid, 5.05), (1.3, bay_len, 1.9), bevel=0.03)
        add_sculpted_masonry_face(b, (-11.55, by_mid, 3.9), bay_len - 0.6, 2.0, "X", 1, seed=1160 + i)
        # Contextual Market Merchant Goods tucked inside sheltered Gothic Arcade bays (`Cam C` & `Cam H`!)
        if i in (0, 2, 4):
            b.add_box("aged_oak_timber", (-14.1, by_mid - 0.5, 0.45), (0.95, 1.35, 0.88), bevel=0.02, rot=(0.0, 0.0, 0.08))
            b.add_cylinder("aged_oak_timber", (-13.9, by_mid + 0.75, 0.46), 0.36, 0.34, 0.92, segs=10, bevel=0.02)
            b.add_cylinder("ceramic_clay", (-13.3, by_mid + 1.25, 0.34), 0.22, 0.14, 0.68, segs=10, bevel=0.015)
            add_gothic_cage_lantern(b, (-12.1, by_mid, 3.65), scale=0.92)
        if i % 2 == 0:
            add_wall_vines(b, (-11.5, by_mid, 5.8), 2.4, 2.4, "X", 1, seed=1170 + i)

    b.add_box("broken_flagstone", (-13.5, -18.8, 5.92), (3.8, 32.4, 0.24), bevel=0.02)
    add_broken_crenellations(b, (-15.1, -34.8, 6.0), 32.0, axis="Y", seed=1181)
    add_broken_crenellations(b, (-11.9, -34.8, 6.0), 32.0, axis="Y", parapet_h=0.88, merlon_h=0.30, seed=1182)

    cols.extend([
        bl_box(0.0, 2.1, DECK_H * 0.5, WALL_W, 4.2, DECK_H),
        bl_box(0.0, -0.1, DECK_H * 0.5, 8.2, 0.72, DECK_H),
        bl_box(0.0, 3.2, DECK_H - 0.10, WALL_W, 6.6, 0.28),
        bl_box(0.0, -0.20, DECK_H + 0.55, 5.2, 0.46, 1.1),
        bl_box(-3.6, -1.45, DECK_H * 0.5, 2.2, 2.9, DECK_H),
        bl_box(3.6, -1.45, DECK_H * 0.5, 2.2, 2.9, DECK_H),
        bl_box(-15.3, -18.8, 3.0, 1.2, 32.0, 6.0),
        bl_box(-13.5, -18.8, 5.88, 3.8, 32.4, 0.28),
        bl_box(-15.1, -18.8, 6.65, 0.54, 32.0, 1.3),
        bl_box(-11.9, -18.8, 6.55, 0.54, 32.0, 1.1),
    ])
    cols.extend(c_sw + c_se + c_wr)
    oriented.extend(o_sw + o_se + o_wr)
    export_sv_model(b, "sv_hero_market_bastion", colliders=cols, oriented=oriented)


# =============================================================================
# HERO ASSET 4: CLIFFSIDE SUMMIT ASCENT + +19.5m CITADEL WATCHTOWER PLATFORM
# Placed at (0.0, 7.5, -55.0). Replaces ALL beveled-cube cliffs with true
# BMesh subdivided 28-deg dipping stratified mountain crags!
# =============================================================================
def build_sv_summit_ascent() -> None:
    b = MeshBuilder("sv_hero_summit_ascent", seed=904)
    cols: list[dict] = []
    oriented: list[dict] = []

    # True Stratified Mountain Crag Cliff Faces erupting behind the +7.5m Overlook (`Cam C` & `Cam H`!)
    # Kept strictly at y_bl >= 4.2 (or flanks |x| >= 11.5) so Flight 1 (y_bl=2.2) stays 100% clear!
    for idx_c, (rx, ry, rz, sx, sy, sz, dip, rz_ang) in enumerate((
        (-14.2, 5.8, 5.2, 9.5, 6.5, 12.2, 0.48, 0.14),
        (-7.2, 6.6, 5.8, 10.2, 5.8, 12.8, 0.44, 0.06),
        (0.5, 7.2, 5.5, 11.0, 5.5, 12.0, 0.46, -0.05),
        (7.8, 6.5, 5.6, 10.0, 5.6, 12.6, -0.45, -0.09),
        (14.5, 5.8, 5.4, 9.4, 6.4, 12.4, -0.49, -0.16),
        (-16.5, 10.5, 8.8, 9.0, 8.2, 15.5, 0.52, 0.22),
        (16.2, 10.8, 8.5, 9.2, 8.0, 15.0, -0.50, -0.20),
    )):
        add_stratified_cliff_crag(b, (rx, ry, rz), (sx, sy, sz), dip_angle=dip, subdivisions=2, rot=(0.04, -0.03, rz_ang), seed=1200 + idx_c)

    # Towering Sculpted Gothic Bastion Wall rising out of the cliff behind Flight 2 (y_bl in [7.6, 14.5], local z = 0..12.0m!)
    add_hewn_stone_block(b, "citadel_masonry", (0.0, 11.0, 6.0), (24.0, 6.8, 12.2), chip_amp=0.05, taper=0.05, seed=1208)
    add_sculpted_masonry_face(b, (0.0, 7.58, 1.0), 22.8, 10.8, "Y", -1, course_h=0.64, block_w=1.18, seed=1201)
    for bx in (-10.2, -5.2, 0.0, 5.2, 10.2):
        add_stepped_buttress(b, (bx, 7.58, 0.0), 1.45, 1.05, 11.8, "Y", -1, stages=3)

    # FLIGHT 1 (Local z = 0.0 -> 6.0, world +7.5m -> +13.5m)
    c1, o1 = add_stone_stair_flight(
        b,
        (9.5, 2.2, 0.0),
        (-9.5, 2.2, 6.0),
        width=2.6,
        step_count=24,
        parapet_left=True,
        parapet_right=False,
        solid_under=True,
        seed=1211,
    )
    add_sculpted_masonry_face(b, (0.0, 0.85, 0.3), 17.5, 3.2, "Y", -1, course_h=0.48, block_w=0.95, seed=1210)
    # Mid-Cliff Battlement Landing at (-10.8, y_bl=4.2, z=6.0 -> world y=+13.5m)
    add_hewn_stone_block(b, "citadel_masonry", (-10.8, 4.2, 2.9), (4.4, 6.4, 6.2), chip_amp=0.04, taper=0.05, seed=1212)
    b.add_box("broken_flagstone", (-10.8, 4.2, 5.94), (4.5, 6.5, 0.22), bevel=0.02)
    add_broken_crenellations(b, (-12.9, 1.0, 6.0), 6.2, axis="Y", seed=1212)
    add_iron_brazier(b, (-11.6, 1.8, 6.0), scale=0.95)

    # FLIGHT 2 (Local z = 6.0 -> 12.0, world +13.5m -> +19.5m!)
    c2, o2 = add_stone_stair_flight(
        b,
        (-9.0, 6.2, 6.0),
        (7.5, 6.2, 12.0),
        width=2.6,
        step_count=24,
        parapet_left=False,
        parapet_right=True,
        solid_under=True,
        seed=1213,
    )

    # +19.5m CITADEL WATCHTOWER & HIGH RAMPART SUMMIT PLATFORM
    b.add_box("broken_flagstone", (0.0, 11.0, 11.92), (23.2, 7.4, 0.26), bevel=0.02)
    add_hewn_stone_block(b, "citadel_masonry", (9.2, 6.8, 5.9), (3.8, 3.2, 12.0), chip_amp=0.04, taper=0.04, seed=1218)
    b.add_box("broken_flagstone", (9.2, 6.8, 11.92), (3.9, 3.3, 0.24), bevel=0.02)

    add_broken_crenellations(b, (-11.4, 7.4, 12.0), 18.4, axis="X", seed=1221)
    add_broken_crenellations(b, (-11.4, 14.5, 12.0), 22.8, axis="X", seed=1222)
    add_broken_crenellations(b, (-11.4, 7.4, 12.0), 7.2, axis="Y", seed=1223)
    add_broken_crenellations(b, (11.2, 5.5, 12.0), 9.1, axis="Y", seed=1224)

    # Asymmetric Stormveil North Watchtower Keep + Secondary East Turret (`Cam C` skyline!)
    add_hewn_stone_block(b, "citadel_masonry", (-7.8, 11.8, 16.6), (6.0, 5.6, 9.6), chip_amp=0.04, taper=0.05, seed=1230)
    add_sculpted_masonry_face(b, (-7.8, 9.0, 12.4), 5.2, 8.4, "Y", -1, seed=1231)
    add_stepped_buttress(b, (-10.6, 9.0, 12.0), 1.0, 0.85, 8.6, "Y", -1, stages=2)
    add_stepped_buttress(b, (-5.0, 9.0, 12.0), 1.0, 0.85, 8.6, "Y", -1, stages=2)
    add_broken_crenellations(b, (-10.6, 9.0, 21.3), 5.6, axis="X", seed=1232)
    b.add_cylinder("roof_slate", (-7.8, 11.8, 24.0), 3.7, 0.14, 5.2, segs=8, bevel=0.02)

    # East Octagonal Signal Bastion Turret on Summit Platform
    b.add_cylinder("citadel_masonry", (8.2, 12.4, 15.2), 2.55, 2.35, 6.6, segs=8, bevel=0.03)
    add_broken_crenellations(b, (6.2, 10.2, 18.4), 4.0, axis="X", seed=1235)
    b.add_cylinder("roof_slate", (8.2, 12.4, 20.6), 2.65, 0.12, 3.8, segs=8, bevel=0.02)

    add_iron_brazier(b, (0.0, 9.2, 12.0), scale=1.25)
    add_iron_brazier(b, (5.2, 9.4, 12.0), scale=1.0)
    b.add_cylinder("aged_oak_timber", (3.2, 8.0, 15.2), 0.11, 0.08, 6.4, segs=8)
    b.add_planar_quad("banner_ashenhold", (2.5, 7.65, 13.8), (3.9, 7.65, 13.8), (3.9, 7.65, 18.0), (2.5, 7.65, 18.0), double_sided=True)
    add_wall_vines(b, (-5.0, 7.52, 10.6), 4.5, 5.2, "Y", -1, seed=1241)
    add_wall_vines(b, (5.5, 7.52, 9.2), 4.2, 4.8, "Y", -1, seed=1242)

    cols.extend([
        bl_box(0.0, 11.1, 5.9, 24.0, 6.8, 11.8),
        bl_box(-11.4, 4.2, 2.95, 3.6, 6.5, 6.1),
        bl_box(-12.9, 4.2, 6.7, 0.56, 6.4, 1.4),
        bl_box(9.4, 6.8, 5.95, 3.6, 3.3, 12.1),
        bl_box(0.0, 11.0, 11.88, 23.2, 7.4, 0.30),
        bl_box(-2.2, 7.4, 12.7, 18.4, 0.56, 1.4),
        bl_box(0.0, 14.5, 12.7, 22.8, 0.56, 1.4),
        bl_box(-11.4, 11.0, 12.7, 0.56, 7.2, 1.4),
        bl_box(11.2, 10.0, 12.7, 0.56, 9.1, 1.4),
        bl_box(-7.8, 11.8, 16.4, 5.8, 5.4, 9.2),
        bl_box(8.2, 12.4, 15.2, 4.8, 4.8, 6.6),
    ])
    cols.extend(c1 + c2)
    oriented.extend(o1 + o2)
    export_sv_model(b, "sv_hero_summit_ascent", colliders=cols, oriented=oriented)


# =============================================================================
# HERO ASSET 5: -4.0m VAULTED STONE UNDERCROFT & DRAINAGE CISTERN
# Placed at (-12.5, -4.0, -17.0).
#   - Local z_bl = 0.0 -> world y = -4.0m (Cistern Floor!)
#   - Local y_bl = -8.0 -> world z = -9.0 (South Stair bottom)
#     Climbs East (+X) from (-12.5, -4.0, -9.0) -> Trade Alley (-5.4, +1.35, -7.0)!
#     Wait: let's keep it axis-aligned along +X for super crisp collision & walking!
#     South Stair: local (0.0, -9.5, 0.0) -> local (+8.4, -9.5, 5.35)
#       -> world (-12.5, -4.0, -7.5) -> world (-4.1, +1.35, -7.5) [run=8.4m, rise=5.35m -> 32.5deg!]
#     Let's make run = 9.0m -> (-12.5 -> -3.5) or start stair inside cistern at local (-1.0, -10.0, 0.0) -> (+8.2, -10.0, 5.35) [run=9.2m, rise=5.35m -> 30.2deg!].
#     And at world x = -4.3, z = -7.0, Trade Street ground is right at y = +1.35m!
#   - North Stair: local (0.0, +7.0, 0.0) -> local (0.0, +19.5, 7.52)
#       -> world (-12.5, -4.0, -24.0) -> world (-12.5, +3.52, -36.5) [run=12.5m, rise=7.52m -> 31.0deg!]
#     Wait: world (-12.5, +3.52, -36.5) is right inside the West Market Arcade? Remember West Market Arcade
#     piers are at x = -12.1 and rear wall at x = -15.3! Let's shift North Stair slightly East to x_world = -9.6
#     (local x = +2.9) so it emerges cleanly onto the open Market Plaza SW stone flagstones at (-9.6, +3.50, -36.0)
#     with ZERO interference with the West Market Arcade piers!
# =============================================================================
def build_sv_undercroft() -> None:
    b = MeshBuilder("sv_hero_undercroft", seed=905)
    cols: list[dict] = []
    oriented: list[dict] = []

    # Main Vaulted Cistern Hall: local x in [-2.6, +2.6], y_bl in [-11.5, +8.5], z_bl = 0.0 (world y = -4.0m)
    # Floor slabs flanking central recessed drainage gutter
    b.add_box("damp_slate_stone", (-1.55, -1.5, -0.15), (2.1, 21.0, 0.36), bevel=0.02)
    b.add_box("damp_slate_stone", (1.55, -1.5, -0.15), (2.1, 21.0, 0.36), bevel=0.02)
    # Recessed Drain Trough Floor (z_bl = -0.22) + Forged Iron Drain Grates across center
    b.add_box("damp_slate_stone", (0.0, -1.5, -0.35), (1.1, 21.0, 0.24))
    for gy in range(-10, 9, 2):
        for gx in (-0.36, -0.12, 0.12, 0.36):
            b.add_box("iron_forged", (gx, float(gy), -0.02), (0.05, 1.85, 0.05))
        b.add_box("iron_forged", (0.0, float(gy), -0.02), (0.98, 0.08, 0.05))

    # Heavy Damp-Slate Vault Side Walls (x = ±2.65, leave South Stair East opening at y_bl in [-11.4, -8.2], x=+2.65!)
    # West solid cistern wall
    b.add_box("damp_slate_stone", (-2.8, -1.5, 2.3), (0.9, 21.6, 5.2), bevel=0.04)
    add_sculpted_masonry_face(b, (-2.35, -1.5, 0.2), 19.6, 3.8, "X", 1, mat_primary="damp_slate_stone", mat_accent="citadel_masonry", seed=1301)
    # East cistern wall (stops at y_bl = -8.0 to leave a 3.2m-wide vaulted opening for South Ascent Stair!)
    b.add_box("damp_slate_stone", (2.8, 0.5, 2.3), (0.9, 17.4, 5.2), bevel=0.04)
    add_sculpted_masonry_face(b, (2.35, 0.5, 0.2), 16.0, 3.8, "X", -1, mat_primary="damp_slate_stone", mat_accent="citadel_masonry", seed=1302)
    # South End Wall (y_bl = -11.8)
    b.add_box("damp_slate_stone", (0.0, -11.8, 2.3), (6.4, 0.9, 5.2), bevel=0.04)

    # 6 Pointed Gothic Stone Rib Arches + Solid Barrel Vault Ceiling overhead (z_bl = 4.2..5.4m)!
    for ry in (-7.5, -4.5, -1.5, 1.5, 4.5, 7.5):
        add_gothic_pointed_arch(b, (0.0, ry, 0.0), half_span=2.35, spring_z=1.95, apex_rise=2.05, depth=0.62, ring_thick=0.38, segments_per_side=6, axis="Y", mat_voussoir="citadel_masonry", mat_trim="damp_slate_stone")
    # Vaulted ceiling roof slab + Upper Street/Courtyard Stone Deck above tunnel (world y = +1.4m -> local z_bl = 5.4m)
    b.add_box("citadel_masonry", (0.0, -1.5, 4.85), (6.5, 20.6, 1.1), bevel=0.04)

    # Atmospheric Forged-Iron Cage Lantern Sconces & Ancient Iron-Bound Cistern Chest!
    for sy in (-5.5, 0.0, 5.5):
        b.add_box("iron_forged", (-2.25, sy, 2.48), (0.36, 0.07, 0.07))
        add_gothic_cage_lantern(b, (-2.04, sy, 2.26), scale=0.88)
        b.add_box("iron_forged", (2.25, sy, 2.48), (0.36, 0.07, 0.07))
        add_gothic_cage_lantern(b, (2.04, sy, 2.26), scale=0.88)
    b.add_box("aged_oak_timber", (-1.7, -9.8, 0.42), (0.85, 1.25, 0.78), bevel=0.02)
    b.add_box("iron_forged", (-1.7, -9.8, 0.52), (0.89, 1.29, 0.09))

    # SOUTH STAIRWAY climbing East (+X) up to Trade Alley West Portal
    c_s, o_s = add_stone_stair_flight(
        b,
        (1.4, -10.0, 0.0),
        (9.8, -10.0, 5.35),
        width=2.5,
        step_count=20,
        parapet_left=False,
        parapet_right=False,
        solid_under=True,
        mat_tread="damp_slate_stone",
        mat_wall="citadel_masonry",
        seed=1311,
    )
    add_gothic_pointed_arch(b, (8.6, -10.0, 5.35), half_span=1.45, spring_z=1.5, apex_rise=1.35, depth=0.85, ring_thick=0.38, segments_per_side=7, axis="X")
    add_hewn_stone_block(b, "citadel_masonry", (8.6, -11.65, 6.85), (1.15, 0.82, 3.1), chip_amp=0.03, taper=0.04, seed=1313)
    add_hewn_stone_block(b, "citadel_masonry", (8.6, -8.35, 6.85), (1.15, 0.82, 3.1), chip_amp=0.03, taper=0.04, seed=1314)
    add_wall_vines(b, (9.05, -10.0, 8.2), 2.4, 2.2, "X", 1, seed=1312)

    # NORTH STAIRWAY climbing North (+Y_bl) up to Market Plaza SW Stairwell Opening
    c_n, o_n = add_stone_stair_flight(
        b,
        (0.4, 7.5, 0.0),
        (3.2, 19.8, 7.50),
        width=2.5,
        step_count=26,
        parapet_left=True,
        parapet_right=True,
        solid_under=True,
        mat_tread="damp_slate_stone",
        mat_wall="citadel_masonry",
        seed=1315,
    )
    add_gothic_pointed_arch(b, (3.2, 19.4, 7.50), half_span=1.48, spring_z=1.55, apex_rise=1.35, depth=0.78, ring_thick=0.36, segments_per_side=7, axis="Y")
    add_hewn_stone_block(b, "citadel_masonry", (1.6, 19.4, 8.95), (0.72, 0.98, 2.9), chip_amp=0.03, taper=0.04, seed=1316)
    add_hewn_stone_block(b, "citadel_masonry", (4.8, 19.4, 8.95), (0.72, 0.98, 2.9), chip_amp=0.03, taper=0.04, seed=1317)
    add_iron_brazier(b, (5.2, 20.1, 7.50), scale=0.82)

    cols.extend([
        bl_box(0.0, -1.5, -0.15, 5.4, 21.2, 0.34),
        bl_box(-2.8, -1.5, 2.3, 0.9, 21.6, 5.2),
        bl_box(2.8, 0.5, 2.3, 0.9, 17.4, 5.2),
        bl_box(0.0, -11.8, 2.3, 6.4, 0.9, 5.2),
        bl_box(0.0, -1.5, 4.85, 6.5, 20.6, 1.1),
    ])
    cols.extend(c_s + c_n)
    oriented.extend(o_s + o_n)
    export_sv_model(b, "sv_hero_undercroft", colliders=cols, oriented=oriented)


# =============================================================================
# HERO ASSET 6: STORMVEIL GOTHIC 2-STORY TAVERN (Shell + Interior — Cam E Showcase!)
# Placed at (9.2, 1.56, -3.2), yaw = -PI/2 (faces West toward Trade Alley!).
# =============================================================================
def build_sv_tavern_v3() -> None:
    b = MeshBuilder("sv_hero_tavern_v3", seed=906)
    cols: list[dict] = []
    oriented: list[dict] = []

    W, D = 10.6, 8.0
    hw, hd = W * 0.5, D * 0.5
    H1, H2 = 3.55, 3.25
    wt = 0.48

    # Deep battered stone foundation plinth + Warm oak 1F floor + Hewn Stone Threshold Step!
    add_hewn_stone_block(b, "damp_slate_stone", (0.0, 0.0, -0.95), (W + 0.65, D + 0.65, 2.0), chip_amp=0.04, taper=0.06, seed=1400)
    b.add_box("aged_oak_timber", (0.0, 0.0, 0.08), (W - 0.3, D - 0.3, 0.14))
    add_hewn_stone_block(b, "limestone_weathered", (0.0, -hd - 0.16, 0.06), (2.95, 0.55, 0.18), chip_amp=0.025, seed=1403)

    # Solid East (Back, +Y), South (+X) & North (-X) 1F Sculpted Stone Walls
    b.add_box("citadel_masonry", (0.0, hd - wt * 0.5, H1 * 0.5), (W, wt, H1), bevel=0.03)
    b.add_box("citadel_masonry", (-hw + wt * 0.5, 0.0, H1 * 0.5), (wt, D, H1), bevel=0.03)
    b.add_box("citadel_masonry", (hw - wt * 0.5, 0.0, H1 * 0.5), (wt, D, H1), bevel=0.03)
    add_sculpted_masonry_face(b, (-hw, 0.0, 0.2), D - 0.5, H1 - 0.3, "X", -1, seed=1401)
    add_sculpted_masonry_face(b, (hw, 0.0, 0.2), D - 0.5, H1 - 0.3, "X", 1, seed=1402)
    add_stepped_buttress(b, (-hw, -hd, 0.0), 0.88, 0.76, H1 + 0.4, "Y", -1, stages=2)
    add_stepped_buttress(b, (hw, -hd, 0.0), 0.88, 0.76, H1 + 0.4, "Y", -1, stages=2)

    # FRONT FACADE (-Y -> World West facing Trade Alley, right in Cam E foreground!):
    fy = -hd + wt * 0.5
    for px, pw in ((-4.68, 1.26), (-1.80, 0.90), (1.80, 0.90), (4.68, 1.26)):
        b.add_box("citadel_masonry", (px, fy, H1 * 0.5), (pw, wt, H1), bevel=0.03)
    # Interior Aged-Oak Timber Posts & Wainscot Beam Framing on inside of Front Wall (`Cam E`!)
    for ipx in (-4.25, -2.22, -1.42, 1.42, 2.22, 4.25):
        b.add_box("aged_oak_timber", (ipx, fy + 0.26, H1 * 0.5), (0.18, 0.16, H1 - 0.1), bevel=0.012)
    b.add_box("aged_oak_timber", (0.0, fy + 0.27, 2.98), (3.35, 0.20, 0.24), bevel=0.015)

    # Deep Chamfered Solid-Limestone Doorway Jambs + Pinned Oak Door Leaf with Iron Hinges (`Cam E`!)
    for side_j in (-1, 1):
        for jz in (0.35, 0.95, 1.55):
            add_hewn_stone_block(b, "limestone_weathered", (side_j * 1.42, fy, jz), (0.30, wt + 0.14, 0.56), chip_amp=0.02, seed=1420 + int(jz * 10) + side_j)
    # Heavy open oak tavern door swung back against interior south jamb (`x = -1.32`)
    b.add_box("aged_oak_timber", (-1.30, fy + 0.72, 1.18), (0.12, 1.15, 2.15), bevel=0.015, rot=(0.0, 0.0, -0.18))
    for hz in (0.55, 1.25, 1.85):
        b.add_box("iron_forged", (-1.24, fy + 0.72, hz), (0.15, 1.05, 0.07), rot=(0.0, 0.0, -0.18))

    # Mullioned Gothic Windows with Sculpted Limestone Sills & Headers
    for wx in (-3.15, 3.15):
        b.add_box("citadel_masonry", (wx, fy, 0.48), (1.82, wt, 0.96), bevel=0.025)
        add_hewn_stone_block(b, "limestone_weathered", (wx, fy - 0.04, 0.98), (2.02, wt + 0.20, 0.16), chip_amp=0.02, seed=1430 + int(abs(wx)))
        b.add_box("citadel_masonry", (wx, fy, 3.10), (1.82, wt, 0.90), bevel=0.025)
        add_hewn_stone_block(b, "limestone_weathered", (wx, fy + 0.02, 2.68), (1.96, wt + 0.14, 0.16), chip_amp=0.018, seed=1435 + int(abs(wx)))
        b.add_box("limestone_weathered", (wx, fy, 1.80), (0.12, 0.20, 1.70), bevel=0.01)
        b.add_box("limestone_weathered", (wx, fy, 2.02), (1.80, 0.18, 0.10), bevel=0.01)

    b.add_box("citadel_masonry", (0.0, fy, 3.22), (2.72, wt, 0.68), bevel=0.025)
    add_gothic_pointed_arch(b, (0.0, -hd - 0.02, 0.0), half_span=1.38, spring_z=1.75, apex_rise=1.18, depth=0.66, ring_thick=0.28, segments_per_side=7, axis="Y")
    add_sculpted_masonry_face(b, (-4.68, -hd, 0.2), 1.15, H1 - 0.3, "Y", -1, block_w=0.55, seed=1405)
    add_sculpted_masonry_face(b, (4.68, -hd, 0.2), 1.15, H1 - 0.3, "Y", -1, block_w=0.55, seed=1406)

    # Exterior Tavern Set-Dressing: Stacked Split Firewood Rack & Ale Barrel under Front Eave!
    for fz_row in range(3):
        for fx_log in range(4):
            b.add_cylinder("aged_oak_timber", (3.25 + fx_log * 0.16, -hd - 0.34, 0.16 + fz_row * 0.13), 0.065, 0.06, 0.58, segs=6, rot=(0.0, math.pi * 0.5, 1.57))
    add_gothic_cage_lantern(b, (1.85, -hd - 0.42, 2.55), scale=0.95)

    # Heavy Aged-Oak Exposed Ceiling Beams & Joists + 2F Floor Deck
    for bx in (-4.4, -3.1, -1.8, -0.5, 0.8, 2.1, 3.6):
        b.add_box("aged_oak_timber", (bx, 0.0, H1 - 0.14), (0.24, D - 0.3, 0.30), bevel=0.015)
    b.add_box("aged_oak_timber", (-2.05, 0.0, H1 + 0.06), (6.5, D + 0.4, 0.18), bevel=0.015)
    b.add_box("aged_oak_timber", (3.25, 3.15, H1 + 0.06), (4.1, 1.9, 0.18), bevel=0.015)
    b.add_box("aged_oak_timber", (3.25, -3.15, H1 + 0.06), (4.1, 2.2, 0.18), bevel=0.015)

    # 2nd Floor Overhanging Gothic Timber-and-Roughcast Story + Open Front Street Balcony!
    uW, uD = W + 0.5, D + 0.5
    z2 = H1 + 0.15
    b.add_box("plaster_cream", (0.0, uD * 0.5 - 0.2, z2 + H2 * 0.5), (uW, 0.36, H2), bevel=0.02)
    b.add_box("plaster_cream", (-uW * 0.5 + 0.2, -1.65, z2 + H2 * 0.5), (0.36, 5.2, H2), bevel=0.02)
    b.add_box("plaster_cream", (-uW * 0.5 + 0.2, 3.85, z2 + H2 * 0.5), (0.36, 0.85, H2), bevel=0.02)
    b.add_box("aged_oak_timber", (-uW * 0.5 + 0.2, 2.30, z2 + 2.75), (0.42, 2.5, 0.95), bevel=0.02)
    b.add_box("plaster_cream", (uW * 0.5 - 0.2, 0.0, z2 + H2 * 0.5), (0.36, uD, H2), bevel=0.02)
    b.add_box("plaster_cream", (-3.4, -uD * 0.5 + 0.2, z2 + H2 * 0.5), (4.4, 0.36, H2), bevel=0.02)
    b.add_box("plaster_cream", (3.4, -uD * 0.5 + 0.2, z2 + H2 * 0.5), (4.4, 0.36, H2), bevel=0.02)
    b.add_box("aged_oak_timber", (0.0, -uD * 0.5 + 0.2, z2 + 2.8), (2.5, 0.40, 0.90), bevel=0.02)
    for px in (-5.2, -3.4, -1.6, 0.0, 1.6, 3.4, 5.2):
        b.add_box("aged_oak_timber", (px, -uD * 0.5 - 0.04, z2 + H2 * 0.5), (0.20, 0.14, H2), bevel=0.01)
    b.add_box("aged_oak_timber", (0.0, -uD * 0.5 - 0.04, z2 + 0.12), (uW + 0.1, 0.18, 0.22), bevel=0.01)
    b.add_box("aged_oak_timber", (0.0, -uD * 0.5 - 0.04, z2 + H2 - 0.10), (uW + 0.1, 0.18, 0.22), bevel=0.01)

    # Walkable Overhanging 2F Front Street Balcony + Carved Oak Knee Braces
    b.add_box("aged_oak_timber", (0.0, -uD * 0.5 - 0.78, z2 - 0.06), (6.2, 1.55, 0.18), bevel=0.015)
    b.add_box("aged_oak_timber", (0.0, -uD * 0.5 - 1.48, z2 + 0.95), (6.2, 0.14, 0.14), bevel=0.01)
    for bx in (-3.0, -1.5, 0.0, 1.5, 3.0):
        b.add_box("aged_oak_timber", (bx, -uD * 0.5 - 1.48, z2 + 0.48), (0.14, 0.14, 0.95), bevel=0.01)
        b.add_jetty_brace("aged_oak_timber", (bx, -hd, z2 - 0.95), (0.0, -1.0), reach=0.95, height=0.88)

    b.add_pitched_tiled_roof("roof_slate", "aged_oak_timber", (0.0, 0.0, z2 + H2 + 0.05), length=uW + 0.4, half_span=uD * 0.5 + 0.2, rise=3.3, along_axis="X", overhang=0.65, eave_rafters=True, with_3d_tiles=True)
    b.add_chimney("citadel_masonry", "limestone_weathered", (2.8, hd - 0.5), z2 + 1.0, z2 + H2 + 4.4, width=1.15)
    b.add_box("iron_forged", (-1.8, -hd - 0.65, 3.15), (0.08, 1.25, 0.08))
    b.add_box("sign_tavern", (-1.8, -hd - 0.92, 2.75), (0.08, 0.76, 0.64), bevel=0.015)
    add_wall_vines(b, (-4.4, -hd - 0.06, 3.4), 1.6, 2.6, "Y", -1, seed=1411)

    c_st, o_st = add_stone_stair_flight(
        b,
        (3.4, -2.7, 0.14),
        (3.4, 2.9, H1 + 0.14),
        width=1.65,
        step_count=14,
        parapet_left=True,
        parapet_right=False,
        solid_under=False,
        mat_tread="aged_oak_timber",
        mat_wall="aged_oak_timber",
        seed=1415,
    )

    cols.extend([
        bl_box(0.0, 0.0, 0.04, W, D, 0.22),
        bl_box(0.0, hd - wt * 0.5, H1 * 0.5, W, wt, H1),
        bl_box(-hw + wt * 0.5, 0.0, H1 * 0.5, wt, D, H1),
        bl_box(hw - wt * 0.5, 0.0, H1 * 0.5, wt, D, H1),
        bl_box(-3.35, fy, H1 * 0.5, 3.9, wt, H1),
        bl_box(3.35, fy, H1 * 0.5, 3.9, wt, H1),
        bl_box(-1.5, 0.0, H1 + 0.06, 7.6, D + 0.4, 0.20),
        bl_box(3.6, 3.35, H1 + 0.06, 3.2, 1.5, 0.20),
        bl_box(3.6, -3.35, H1 + 0.06, 3.2, 1.5, 0.20),
        bl_box(0.0, -uD * 0.5 - 0.78, z2 - 0.06, 6.2, 1.55, 0.20),
        bl_box(0.0, -uD * 0.5 - 1.48, z2 + 0.55, 6.2, 0.20, 1.1),
        bl_box(0.0, uD * 0.5 - 0.2, z2 + H2 * 0.5, uW, 0.38, H2),
        bl_box(uW * 0.5 - 0.2, 0.0, z2 + H2 * 0.5, 0.38, uD, H2),
        bl_box(-uW * 0.5 + 0.2, -1.65, z2 + H2 * 0.5, 0.38, 5.2, H2),
        bl_box(-3.4, -uD * 0.5 + 0.2, z2 + H2 * 0.5, 4.4, 0.38, H2),
        bl_box(3.4, -uD * 0.5 + 0.2, z2 + H2 * 0.5, 4.4, 0.38, H2),
    ])
    cols.extend(c_st)
    oriented.extend(o_st)
    export_sv_model(b, "sv_hero_tavern_v3", colliders=cols, oriented=oriented)

    # Distance-culled (<28m) Tavern Interior Pack (Hearth with Split Logs, Oak Tables, Bar Counter, Ale Kegs)
    bi = MeshBuilder("sv_hero_tavern_v3_interior", seed=907)
    add_hewn_stone_block(bi, "citadel_masonry", (-1.4, hd - 0.85, 1.55), (2.4, 1.05, 3.1), chip_amp=0.03, seed=1450)
    add_hewn_stone_block(bi, "limestone_weathered", (-1.4, hd - 1.02, 2.35), (2.65, 1.25, 0.28), chip_amp=0.022, seed=1451)
    bi.add_box("ember_forge", (-1.4, hd - 0.72, 0.34), (1.35, 0.52, 0.24), bevel=0.02)
    for lg_x, lg_rz in ((-1.65, 0.28), (-1.15, -0.32), (-1.40, 1.45)):
        bi.add_cylinder("aged_oak_timber", (lg_x, hd - 0.68, 0.48), 0.075, 0.065, 0.68, segs=6, rot=(0.15, math.pi * 0.5, lg_rz))
    bi.add_cylinder("glow_warm", (-1.4, hd - 0.66, 0.54), 0.14, 0.03, 0.22, segs=5)

    bi.add_box("aged_oak_timber", (-3.1, 1.4, 0.58), (2.8, 0.78, 1.05), bevel=0.02)
    bi.add_box("planks_oak", (-3.1, 1.4, 1.14), (2.95, 0.92, 0.10), bevel=0.015)
    for kx in (-4.0, -3.1, -2.2):
        bi.add_cylinder("aged_oak_timber", (kx, 2.7, 0.62), 0.36, 0.34, 0.92, segs=10, bevel=0.02)
        bi.add_cylinder("iron_forged", (kx, 2.7, 0.85), 0.37, 0.37, 0.06, segs=10)
    for tx, ty in ((-2.6, -1.4), (0.6, 1.4)):
        bi.add_box("planks_oak", (tx, ty, 0.86), (1.85, 1.02, 0.10), bevel=0.015)
        for lx in (-0.75, 0.75):
            for ly in (-0.36, 0.36):
                bi.add_box("aged_oak_timber", (tx + lx, ty + ly, 0.44), (0.12, 0.12, 0.82), bevel=0.01)
        bi.add_box("planks_oak", (tx, ty - 0.78, 0.48), (1.65, 0.34, 0.08), bevel=0.01)
        bi.add_cylinder("brass_aged", (tx + 0.35, ty + 0.12, 1.04), 0.08, 0.06, 0.24, segs=8)
        bi.add_cylinder("ceramic_clay", (tx - 0.25, ty - 0.10, 1.06), 0.09, 0.06, 0.28, segs=8)
        # Tallow candle on oak table
        bi.add_cylinder("cloth_linen", (tx + 0.05, ty + 0.22, 0.98), 0.026, 0.024, 0.14, segs=6)
        bi.add_cylinder("glow_warm", (tx + 0.05, ty + 0.22, 1.07), 0.018, 0.005, 0.05, segs=5)
    # Overhead Forged-Iron Chandelier Wheel with Tallow Candles + Chains
    bi.add_cylinder("iron_forged", (-0.8, 0.0, 2.68), 0.78, 0.78, 0.07, segs=12)
    for k in range(6):
        ang = k * (math.pi / 3.0)
        cx_c = -0.8 + math.cos(ang) * 0.72
        cy_c = math.sin(ang) * 0.72
        bi.add_cylinder("cloth_linen", (cx_c, cy_c, 2.79), 0.032, 0.028, 0.16, segs=6)
        bi.add_cylinder("glow_warm", (cx_c, cy_c, 2.90), 0.022, 0.006, 0.065, segs=5)
    bi.add_box("cloth_crimson", (-2.4, 1.5, H1 + 0.22), (2.2, 1.5, 0.04))
    bi.add_box("aged_oak_timber", (-3.8, -1.6, H1 + 0.45), (2.1, 1.25, 0.55), bevel=0.02)
    bi.add_box("cloth_linen", (-3.8, -1.6, H1 + 0.76), (1.95, 1.12, 0.16), bevel=0.02)
    export_sv_model(bi, "sv_hero_tavern_v3_interior", colliders=[], bake_ao=True)


# =============================================================================
# HERO ASSET 7: SUPPORTING WALLS, TRUE STRATIFIED CLIFFS, PROPS & HIGH CITADEL KEEP
# =============================================================================
def build_sv_supporting_kit() -> None:
    # 1. Sculpted 12m Gothic Buttressed Curtain Wall
    b = MeshBuilder("sv_hero_buttress_wall_12m", seed=908)
    add_hewn_stone_block(b, "damp_slate_stone", (0.0, 0.0, 0.8), (12.2, 2.35, 2.2), chip_amp=0.04, taper=0.07, seed=1500)
    b.add_box("citadel_masonry", (0.0, 0.0, 4.4), (12.0, 1.8, 5.6), bevel=0.04)
    add_sculpted_masonry_face(b, (0.0, -0.92, 1.6), 11.4, 5.2, "Y", -1, seed=1501)
    for bx in (-4.2, 0.0, 4.2):
        add_stepped_buttress(b, (bx, -0.9, 0.0), 1.08, 0.98, 6.9, "Y", -1, stages=3)
    add_broken_crenellations(b, (-6.0, -0.55, 7.2), 12.0, axis="X", seed=1502)
    add_wall_vines(b, (-2.0, -0.96, 6.8), 3.4, 3.8, "Y", -1, seed=1503)
    export_sv_model(b, "sv_hero_buttress_wall_12m", colliders=[bl_box(0.0, 0.0, 4.0, 12.0, 2.1, 8.2)])

    # 2. True Stratified Mountain Outcrop Cliff Mass (100% BMesh subdivided dipping crags — ZERO beveled boxes!)
    bc = MeshBuilder("sv_hero_crag_outcrop", seed=909)
    for idx_m, (cx, cy, cz, sx, sy, sz, dip, rz_a) in enumerate((
        (0.0, 0.0, 3.8, 8.2, 6.8, 9.6, 0.48, 0.12),
        (-3.0, -1.6, 2.4, 5.4, 4.6, 6.8, 0.52, -0.24),
        (2.8, 1.5, 5.0, 5.8, 5.0, 10.6, 0.44, 0.31),
        (0.4, -2.5, 1.4, 5.0, 3.6, 4.0, 0.46, -0.15),
    )):
        add_stratified_cliff_crag(bc, (cx, cy, cz), (sx, sy, sz), dip_angle=dip, subdivisions=2, rot=(0.04, -0.04, rz_a), seed=1510 + idx_m)
    export_sv_model(bc, "sv_hero_crag_outcrop", colliders=[bl_box(0.0, 0.0, 4.5, 8.2, 7.0, 9.2)])

    # 3. Sculpted Fallen Chiseled Stone Rubble & Highland Moss Cluster
    br = MeshBuilder("sv_prop_rubble_pile", seed=910)
    rrng = random.Random(1521)
    for i in range(10):
        ang = i * 0.64 + rrng.uniform(-0.2, 0.2)
        rad = rrng.uniform(0.08, 0.92)
        s = rrng.uniform(0.16, 0.38)
        mat = "limestone_weathered" if i % 2 == 0 else "damp_slate_stone"
        add_hewn_stone_block(
            br,
            mat,
            (math.cos(ang) * rad, math.sin(ang) * rad, s * 0.36),
            (s * rrng.uniform(1.1, 1.6), s * rrng.uniform(0.8, 1.3), s * 0.72),
            chip_amp=0.032,
            rot=(rrng.uniform(-0.28, 0.28), rrng.uniform(-0.28, 0.28), rrng.uniform(0, 3.14)),
            seed=1525 + i,
        )
    for k in range(5):
        fa = k * 1.25
        br.add_box("foliage_leaf", (math.cos(fa) * 0.42, math.sin(fa) * 0.42, 0.08), (0.28, 0.14, 0.12), bevel=0.02, rot=(0.35, -0.25, fa))
    export_sv_model(br, "sv_prop_rubble_pile", colliders=[])
    # Also overwrite legacy `prop_debris_cluster.glb` so Cam G has chiseled stones instead of 3 green sticks!
    bd = MeshBuilder("prop_debris_cluster", seed=913)
    for i in range(7):
        ang = i * 0.9 + 0.2
        rad = 0.12 + (i % 3) * 0.22
        s = 0.14 + (i % 3) * 0.07
        add_hewn_stone_block(bd, "limestone_weathered" if i % 2 == 0 else "damp_slate_stone", (math.cos(ang) * rad, math.sin(ang) * rad, s * 0.32), (s * 1.4, s * 1.0, s * 0.65), chip_amp=0.024, rot=(0.15, -0.18, ang), seed=1540 + i)
    export_sv_model(bd, "prop_debris_cluster", colliders=[])

    # 4. Overwrite `prop_lantern_post.glb` with Chamfered Oak Post + Forged Scroll Arm + Hexagonal Iron Cage Lantern!
    blp = MeshBuilder("prop_lantern_post", seed=914)
    add_hewn_stone_block(blp, "damp_slate_stone", (0.0, 0.0, 0.22), (0.44, 0.44, 0.44), chip_amp=0.024, taper=0.08, seed=1550)
    blp.add_box("aged_oak_timber", (0.0, 0.0, 1.68), (0.17, 0.17, 2.65), bevel=0.02)
    blp.add_box("aged_oak_timber", (0.38, 0.0, 2.86), (0.92, 0.13, 0.14), bevel=0.015)
    blp.add_jetty_brace("aged_oak_timber", (0.08, 0.0, 2.28), (1.0, 0.0), reach=0.52, height=0.54, thickness=0.09)
    blp.add_box("iron_forged", (0.72, 0.0, 2.74), (0.04, 0.04, 0.20))
    add_gothic_cage_lantern(blp, (0.72, 0.0, 2.48), scale=0.96)
    export_sv_model(blp, "prop_lantern_post", colliders=[])

    # 5. Close-Up Prop: Iron War Brazier (standalone instanced prop)
    bb = MeshBuilder("sv_prop_iron_brazier", seed=911)
    add_iron_brazier(bb, (0.0, 0.0, 0.0), scale=1.0)
    export_sv_model(bb, "sv_prop_iron_brazier", colliders=[bl_box(0.0, 0.0, 0.55, 0.85, 0.85, 1.1)])

    # 6. Close-Up Prop: Weathered Timber Siege Scaffolding Frame
    bs = MeshBuilder("sv_prop_timber_scaffold", seed=912)
    for px in (-1.4, 1.4):
        for py in (-0.6, 0.6):
            bs.add_box("aged_oak_timber", (px, py, 2.2), (0.16, 0.16, 4.4), bevel=0.015)
    for pz in (1.6, 3.3):
        bs.add_box("planks_oak", (0.0, 0.0, pz), (3.2, 1.35, 0.12), bevel=0.01)
    bs.add_box("aged_oak_timber", (0.0, -0.62, 1.8), (3.4, 0.09, 0.11), rot=(0.0, 0.65, 0.0))
    bs.add_box("aged_oak_timber", (0.0, -0.62, 1.8), (3.4, 0.09, 0.11), rot=(0.0, -0.65, 0.0))
    export_sv_model(bs, "sv_prop_timber_scaffold", colliders=[bl_box(0.0, 0.0, 2.0, 3.1, 1.3, 4.0)])

    # 7. Stormveil High Citadel Keep & Barbican Skyline Landmarks (`Cam C` distant upper citadel!)
    bk = MeshBuilder("castle_citadel_keep", seed=915)
    add_stratified_cliff_crag(bk, (-10.0, 0.0, 3.5), (14.0, 12.0, 10.0), dip_angle=0.46, subdivisions=2, seed=1560)
    add_stratified_cliff_crag(bk, (10.5, 0.5, 3.2), (13.5, 11.5, 9.5), dip_angle=-0.44, subdivisions=2, seed=1561)
    add_hewn_stone_block(bk, "damp_slate_stone", (-1.5, 0.0, 4.5), (17.5, 13.5, 9.5), chip_amp=0.06, taper=0.08, seed=1562)
    add_hewn_stone_block(bk, "citadel_masonry", (-1.5, 0.0, 15.5), (13.8, 10.8, 15.0), chip_amp=0.05, taper=0.06, seed=1563)
    for kbx in (-6.8, -1.5, 3.8):
        add_stepped_buttress(bk, (kbx, -5.4, 2.0), 1.65, 1.55, 19.5, "Y", -1, stages=3)
    for lxz in ((-4.2, 14.5), (-1.5, 15.5), (1.2, 14.5), (-4.2, 19.2), (1.2, 19.2)):
        bk.add_box("damp_slate_stone", (lxz[0], -5.45, lxz[1]), (0.85, 0.45, 2.85), bevel=0.03)
        add_gothic_pointed_arch(bk, (lxz[0], -5.52, lxz[1] - 1.4), half_span=0.52, spring_z=1.8, apex_rise=0.95, depth=0.38, ring_thick=0.22, segments_per_side=5, axis="Y")
    add_broken_crenellations(bk, (-8.2, -5.3, 22.8), 13.4, axis="X", parapet_h=1.1, merlon_h=0.95, seed=1565)
    bk.add_cylinder("citadel_masonry", (-6.8, -1.2, 23.5), 3.4, 3.0, 12.5, segs=8, bevel=0.04)
    bk.add_cylinder("roof_slate", (-6.8, -1.2, 33.0), 3.6, 0.18, 7.2, segs=8, bevel=0.02)
    bk.add_cylinder("citadel_masonry", (6.8, -1.0, 16.5), 4.2, 3.8, 13.5, segs=8, bevel=0.04)
    add_broken_crenellations(bk, (3.4, -4.6, 23.2), 6.8, axis="X", seed=1568)
    bk.add_cylinder("roof_slate", (6.8, -1.0, 26.2), 4.0, 0.20, 5.8, segs=8, bevel=0.02)
    export_sv_model(bk, "castle_citadel_keep", colliders=[])

    # 8. V4 Sculpted Gothic Market Cistern Fountain (`Cam C` & `Cam D` centerpiece!)
    bf = MeshBuilder("landmark_market_fountain", seed=916)
    bf.add_cylinder("damp_slate_stone", (0.0, 0.0, 0.16), 4.42, 4.28, 0.32, segs=8, bevel=0.02)
    bf.add_cylinder("citadel_masonry", (0.0, 0.0, 0.70), 3.66, 3.60, 0.78, segs=8, bevel=0.02)
    # 8 Individually sculpted overhanging octagonal coping stones + corner buttress piers & iron bollard chains
    for k in range(8):
        a0 = k * (math.pi * 0.25)
        a1 = (k + 1) * (math.pi * 0.25)
        am = (a0 + a1) * 0.5
        rim_r = 3.55
        seg_w = 2.0 * rim_r * math.tan(math.pi / 8.0)
        add_hewn_stone_block(
            bf,
            "limestone_weathered",
            (math.cos(am) * rim_r, math.sin(am) * rim_r, 1.15),
            (0.58, seg_w - 0.04, 0.22),
            chip_amp=0.024,
            rot=(0.0, 0.0, am),
            seed=1600 + k,
        )
        # Sculpted corner buttress block + outer bollard + forged chain link
        add_hewn_stone_block(
            bf,
            "limestone_weathered",
            (math.cos(a0) * 3.72, math.sin(a0) * 3.72, 0.64),
            (0.46, 0.46, 1.02),
            chip_amp=0.024,
            taper=0.08,
            rot=(0.0, 0.0, a0),
            seed=1610 + k,
        )
        bx0, by0 = math.cos(a0) * 4.24, math.sin(a0) * 4.24
        bx1, by1 = math.cos(a1) * 4.24, math.sin(a1) * 4.24
        add_hewn_stone_block(bf, "damp_slate_stone", (bx0, by0, 0.46), (0.34, 0.34, 0.88), chip_amp=0.02, taper=0.12, rot=(0.0, 0.0, a0), seed=1620 + k)
        if k % 2 == 0:
            ch_len = math.hypot(bx1 - bx0, by1 - by0)
            bf.add_box("iron_forged", ((bx0 + bx1) * 0.5, (by0 + by1) * 0.5, 0.72), (ch_len, 0.035, 0.035), rot=(0.0, 0.0, math.atan2(by1 - by0, bx1 - bx0)))
    # Central Gothic Pinnacled Spire, 4 Lion/Gargoyle Iron Water Spouts & Upper Catch Basin (water at +1.09 & +2.94!)
    add_hewn_stone_block(bf, "damp_slate_stone", (0.0, 0.0, 1.72), (1.42, 1.42, 1.90), chip_amp=0.03, taper=0.06, seed=1630)
    for k in range(4):
        ang = k * (math.pi * 0.5)
        sx_f, sy_f = math.cos(ang), math.sin(ang)
        add_hewn_stone_block(bf, "limestone_weathered", (sx_f * 0.82, sy_f * 0.82, 1.98), (0.48, 0.36, 0.36), chip_amp=0.02, rot=(0.0, 0.0, ang), seed=1632 + k)
        bf.add_cylinder("iron_forged", (sx_f * 1.12, sy_f * 1.12, 1.94), 0.055, 0.045, 0.38, segs=6, rot=(0.0, math.pi * 0.5 + 0.25, ang))
    bf.add_cylinder("limestone_weathered", (0.0, 0.0, 2.82), 1.72, 1.48, 0.34, segs=12, bevel=0.025)
    add_hewn_stone_block(bf, "citadel_masonry", (0.0, 0.0, 3.48), (0.86, 0.86, 1.18), chip_amp=0.025, taper=0.08, seed=1638)
    bf.add_cylinder("damp_slate_stone", (0.0, 0.0, 4.48), 0.46, 0.05, 1.05, segs=8, bevel=0.015)
    bf.add_box("iron_forged", (0.0, 0.0, 5.12), (0.05, 0.05, 0.44))
    bf.add_box("iron_forged", (0.0, 0.0, 5.18), (0.24, 0.05, 0.05))
    export_sv_model(bf, "landmark_market_fountain", cylinders=[{"center": [0.0, 2.2, 0.0], "halfHeight": 2.2, "radius": 3.78}])

    # 9. V4 Sculpted Gothic Charter Pillar (replaces orange glow cubes with real hexagonal iron cage lanterns!)
    bp = MeshBuilder("landmark_market_pillar", seed=917)
    add_hewn_stone_block(bp, "damp_slate_stone", (0.0, 0.0, 0.26), (2.45, 2.45, 0.52), chip_amp=0.03, taper=0.08, seed=1640)
    add_hewn_stone_block(bp, "citadel_masonry", (0.0, 0.0, 1.08), (1.68, 1.68, 1.18), chip_amp=0.03, taper=0.06, seed=1641)
    add_hewn_stone_block(bp, "limestone_weathered", (0.0, 0.0, 3.05), (1.02, 1.02, 2.95), chip_amp=0.026, taper=0.05, seed=1642)
    add_hewn_stone_block(bp, "limestone_weathered", (0.0, 0.0, 4.68), (1.36, 1.36, 0.28), chip_amp=0.022, seed=1643)
    bp.add_cylinder("roof_slate", (0.0, 0.0, 5.48), 0.82, 0.05, 1.38, segs=4, rot=(0.0, 0.0, math.pi * 0.25))
    for sgn in (-1, 1):
        bp.add_box("iron_forged", (sgn * 0.86, 0.0, 3.72), (0.82, 0.06, 0.06))
        add_gothic_cage_lantern(bp, (sgn * 1.16, 0.0, 3.44), scale=0.92)
    export_sv_model(bp, "landmark_market_pillar", colliders=[bl_box(0.0, 0.0, 2.5, 1.85, 1.85, 5.0)])

    # 10. V4 Grounded Gothic Oak-and-Linen Market Stalls (replaces ALL floating orange glow cubes & circus awnings in Cam C!)
    stall_specs = [
        ("stall_01_bakery", 1701, "awning_ochre", "cloth_linen", "bakery", 3.8),
        ("stall_02_produce", 1702, "awning_emerald", "cloth_ochre", "produce", 4.0),
        ("stall_04_pottery", 1704, "awning_ochre", "cloth_linen", "pottery", 3.9),
        ("stall_06_spices", 1706, "awning_plum", "cloth_crimson", "caravan", 4.2),
        ("stall_07_drapery", 1707, "awning_navy", "cloth_ochre", "drapery", 4.0),
        ("stall_08_jeweler", 1708, "awning_plum", "cloth_linen", "jeweler", 3.5),
    ]
    for s_name, s_seed, aw_mat, cl_mat, kind, sw in stall_specs:
        sb = MeshBuilder(s_name, seed=s_seed)
        shw = sw * 0.5
        sd = 2.25
        # Hewn slate corner footings
        for px in (-shw + 0.16, shw - 0.16):
            for py in (-sd * 0.42, sd * 0.42):
                add_hewn_stone_block(sb, "damp_slate_stone", (px, py, 0.11), (0.34, 0.34, 0.22), chip_amp=0.018, taper=0.08, seed=s_seed + int(px * 10 + py * 5))
                sb.add_box("aged_oak_timber", (px, py, 1.48 if py > 0 else 1.32), (0.14, 0.14, 2.65 if py > 0 else 2.35), bevel=0.012)
            sb.add_box("aged_oak_timber", (px, 0.0, 2.62), (0.12, sd + 0.62, 0.12), bevel=0.01, rot=(-0.20, 0.0, 0.0))
            sb.add_jetty_brace("aged_oak_timber", (px, -sd * 0.42, 1.85), (0.0, 1.0), reach=0.45, height=0.48, thickness=0.09)
        sb.add_box("aged_oak_timber", (0.0, -sd * 0.42, 2.44), (sw, 0.13, 0.14), bevel=0.01)
        sb.add_box("aged_oak_timber", (0.0, sd * 0.42, 2.82), (sw, 0.13, 0.14), bevel=0.01)
        # Heavy oak counter & stone/timber base chest
        sb.add_box("aged_oak_timber", (0.0, -0.05, 0.48), (sw - 0.26, sd * 0.68, 0.88), bevel=0.015)
        sb.add_box("planks_oak", (0.0, -0.08, 0.95), (sw - 0.10, sd * 0.78, 0.09), bevel=0.012)
        sb.add_box(cl_mat, (0.0, -sd * 0.44, 0.56), (sw - 0.36, 0.05, 0.72), bevel=0.008)
        sb.add_box("planks_oak", (0.0, sd * 0.40, 1.52), (sw - 0.28, 0.08, 1.82), bevel=0.01)

        if kind == "jeweler":
            # Steep weathered slate roof + wrought-iron lockboxes + real hexagonal iron cage lantern!
            sb.add_pitched_tiled_roof("roof_slate", "aged_oak_timber", (0.0, 0.0, 2.52), length=sw + 0.1, half_span=sd * 0.52, rise=0.92, along_axis="X", overhang=0.36, eave_rafters=True, with_3d_tiles=False)
            for ci in (-0.88, 0.0, 0.88):
                sb.add_box("aged_oak_timber", (ci, -0.16, 1.09), (0.46, 0.34, 0.20), bevel=0.012)
                sb.add_box("iron_forged", (ci, -0.16, 1.15), (0.48, 0.36, 0.04))
                sb.add_cylinder("brass_aged", (ci + 0.16, 0.10, 1.12), 0.07, 0.05, 0.22, segs=8)
        else:
            # Sagged weathered multi-panel canvas canopy with wooden ridge battens
            for seg_c in (-1, 0, 1):
                seg_x = seg_c * (sw / 3.0)
                sag_z = -0.04 if seg_c == 0 else 0.0
                sb.add_box(aw_mat, (seg_x, 0.0, 2.68 + sag_z), (sw / 3.0 + 0.04, sd + 0.72, 0.055), bevel=0.008, rot=(-0.20, 0.0, 0.0))
            sb.add_box(aw_mat, (0.0, -sd * 0.5 - 0.24, 2.34), (sw + 0.08, 0.04, 0.22), bevel=0.006)
            if kind == "bakery":
                for tx in (-0.95, 0.0, 0.95):
                    sb.add_box("planks_oak", (tx, -0.08, 1.03), (0.78, 0.56, 0.06), bevel=0.008)
                    sb.add_cylinder("cloth_ochre", (tx - 0.16, -0.08, 1.12), 0.15, 0.12, 0.12, segs=8)
                    sb.add_cylinder("cloth_linen", (tx + 0.16, -0.06, 1.11), 0.13, 0.10, 0.11, segs=8)
                sb.add_cylinder("fabric_sack", (-1.15, -0.92, 0.34), 0.32, 0.26, 0.68, segs=8)
            elif kind == "produce":
                for xi, ang in ((-1.05, 0.12), (-0.32, -0.08), (0.42, 0.15), (1.12, -0.12)):
                    sb.add_box("aged_oak_timber", (xi, -0.06, 1.08), (0.60, 0.56, 0.20), bevel=0.01, rot=(0.18, 0.0, ang))
                    sb.add_cylinder("foliage_leaf" if xi < 0.1 else "ceramic_clay", (xi, -0.04, 1.20), 0.20, 0.16, 0.14, segs=7)
            elif kind == "pottery":
                for ax in (-1.15, -0.55, 0.05, 0.65, 1.20):
                    sb.add_cylinder("ceramic_clay", (ax, -0.06, 1.20), 0.15, 0.09, 0.44, segs=9)
            elif kind == "caravan":
                for sx_w in (-shw + 0.28, shw - 0.28):
                    sb.add_cylinder("aged_oak_timber", (sx_w, 0.0, 0.54), 0.52, 0.52, 0.11, segs=12, rot=(0.0, math.pi * 0.5, 0.0))
                    sb.add_cylinder("iron_forged", (sx_w, 0.0, 0.54), 0.54, 0.54, 0.05, segs=12, rot=(0.0, math.pi * 0.5, 0.0))
                for i_b in range(4):
                    sb.add_cylinder("ceramic_clay", (-1.05 + i_b * 0.70, -0.10, 1.18), 0.15, 0.11, 0.42, segs=9)
            elif kind == "drapery":
                for ri, rm in enumerate(("cloth_crimson", "cloth_navy", "cloth_emerald", "cloth_ochre", "cloth_linen")):
                    sb.add_cylinder(rm, (-1.28 + ri * 0.64, -0.04, 1.26), 0.13, 0.13, 0.62, segs=9, rot=(0.16, 0.0, 0.0))

        # Authentic wrought-iron bracket + hexagonal Gothic cage lantern (ZERO orange glow cube!)
        sb.add_box("iron_forged", (shw - 0.16, -sd * 0.52, 2.30), (0.05, 0.28, 0.05))
        add_gothic_cage_lantern(sb, (shw - 0.16, -sd * 0.62, 2.08), scale=0.78)
        export_sv_model(sb, s_name, colliders=[{"center": [0.0, 1.25, 0.0], "half": [round(shw + 0.05, 3), 1.25, round(sd * 0.52, 3)]}])


def _alley_center_x(world_z: float) -> float:
    """Exact replica of CityRoadNetwork.getCityRoadCenterX(z) for seamless curb placement."""
    if world_z >= 10.5 or world_z <= -12.5:
        return 0.0
    u = (10.5 - world_z) / 23.0
    return math.sin(u * math.pi * 1.85) * 1.95 * math.sin(u * math.pi)


def _alley_base_y(world_z: float) -> float:
    """Exact replica of CityRoadNetwork.getCityStreetBaseY(z)."""
    def _sm(e0: float, e1: float, x: float) -> float:
        t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
        return t * t * (3.0 - 2.0 * t)
    if world_z >= 11.0:
        return 0.0
    if world_z >= -11.0:
        return _sm(11.0, -11.0, world_z) * 1.7
    return 1.7 + _sm(-11.0, -19.5, world_z) * 1.8


# =============================================================================
# HERO ASSET 2 (BENCHMARK B & CAM G): MONUMENTAL OVERHEAD GOTHIC BRIDGE,
# RIBBED GROIN VAULT, FLANKING ALLEY TIMBER SHORING & S-CURVED CURBSTONES/GRATES
# Placed at (0.0, 0.0, -14.5). Note: y_bl = -14.5 - world_z, z_bl = world_y!
# =============================================================================
def build_sv_gothic_bridge_fixed() -> None:
    b = MeshBuilder("sv_hero_gothic_bridge", seed=902)
    cols: list[dict] = []
    oriented: list[dict] = []

    for side in (-1, 1):
        px = side * 6.0
        add_hewn_stone_block(b, "damp_slate_stone", (px, 0.0, 1.65), (6.3, 6.0, 4.2), chip_amp=0.04, taper=0.07, seed=1001 + side)
        add_hewn_stone_block(b, "limestone_weathered", (px, 0.0, 3.82), (6.05, 5.75, 0.24), chip_amp=0.025, seed=1003 + side)
        b.add_box("citadel_masonry", (px, 0.0, 6.45), (5.8, 5.4, 5.2), bevel=0.04)
        add_sculpted_masonry_face(b, (px, -2.72, 2.2), 5.2, 7.0, "Y", -1, seed=1010 + side)
        add_sculpted_masonry_face(b, (px, 2.72, 2.2), 5.2, 7.0, "Y", 1, seed=1020 + side)
        # Sculpted inner alley pier faces (`x = ±3.05`) right in Cam B close view!
        add_sculpted_masonry_face(b, (side * 3.06, 0.0, 1.8), 5.0, 3.8, "X", -side, course_h=0.46, block_w=0.86, seed=1025 + side)
        add_stepped_buttress(b, (side * 4.2, -2.7, 1.0), 1.18, 1.10, 8.0, "Y", -1, stages=3)
        add_stepped_buttress(b, (side * 4.2, 2.7, 1.0), 1.18, 1.10, 8.0, "Y", 1, stages=3)
        if side == -1:
            b.add_box("citadel_masonry", (-11.4, 0.0, 5.2), (5.6, 4.6, 8.6), bevel=0.04)
            add_sculpted_masonry_face(b, (-11.4, -2.32, 2.5), 4.8, 6.6, "Y", -1, seed=1029)
        else:
            for cx in (9.2, 13.8):
                add_hewn_stone_block(b, "citadel_masonry", (cx, 0.0, 4.7), (1.42, 4.6, 9.4), chip_amp=0.035, taper=0.04, seed=1032 + int(cx))

    b.add_box("citadel_masonry", (0.0, 0.0, 8.45), (7.2, 5.2, 2.1), bevel=0.04)
    add_sculpted_masonry_face(b, (0.0, -2.62, 7.5), 6.2, 1.9, "Y", -1, seed=1041)
    add_sculpted_masonry_face(b, (0.0, 2.62, 7.5), 6.2, 1.9, "Y", 1, seed=1042)

    # True Ribbed Gothic Groin Vault Ceiling under the Overhead Bridge (`Cam B` centerpiece!)
    add_ribbed_groin_vault(b, (0.0, 0.0, 0.0), half_span=3.12, y_length=5.1, spring_z=4.25, apex_rise=3.02, bays=2, seed=1045)
    for ay in (-2.55, 0.0, 2.55):
        add_gothic_pointed_arch(b, (0.0, ay, 0.0), half_span=3.15, spring_z=4.25, apex_rise=3.05, depth=0.74, ring_thick=0.48, axis="Y")

    # Corbelled Aged-Oak Machicolation Gallery Brackets + Angled Timber Shoring Struts (`Benchmark B`!)
    for bx in (-4.8, -3.2, -1.6, 0.0, 1.6, 3.2, 4.8):
        for sy in (-2.85, 2.85):
            b.add_box("aged_oak_timber", (bx, sy, 9.12), (0.24, 0.88, 0.42), bevel=0.015)
    # Heavy aged-oak diagonal shoring braces & hanging cage lanterns flanking the narrow bridge mouth!
    for side in (-1, 1):
        b.add_jetty_brace("aged_oak_timber", (side * 3.08, -1.8, 3.25), (-side, 0.0), reach=0.85, height=1.25, thickness=0.18)
        b.add_jetty_brace("aged_oak_timber", (side * 3.08, 1.8, 3.25), (-side, 0.0), reach=0.85, height=1.25, thickness=0.18)
        add_gothic_cage_lantern(b, (side * 2.58, -2.65, 3.85), scale=1.02)

    # S-CURVED CHISELED STONE CURBSTONES & RECESSED IRON STORM GRATES (`Cam G` & `Cam B`!)
    # Runs continuously from South Gate inner apron (world z = +9.8 -> y_bl = -24.3)
    # into the Overhead Gothic Bridge mouth (world z = -13.8 -> y_bl = -0.7)!
    west_curb_pts: list[tuple[float, float, float]] = []
    east_curb_pts: list[tuple[float, float, float]] = []
    for step_i in range(15):
        wz = 9.8 - step_i * 1.68
        y_bl = -14.5 - wz
        z_bl = _alley_base_y(wz)
        cx_rd = _alley_center_x(wz)
        west_curb_pts.append((cx_rd - 2.86, y_bl, z_bl))
        east_curb_pts.append((cx_rd + 2.86, y_bl, z_bl))
    # Leave gap on West curb around Undercroft South Stair mouth (world z in [-8.6, -5.4] -> step_i in {9, 10})!
    add_curb_and_gutter_run(b, west_curb_pts[:9], grate_indices={2, 6}, seed=1047)
    add_curb_and_gutter_run(b, west_curb_pts[11:], grate_indices={1}, seed=1048)
    add_curb_and_gutter_run(b, east_curb_pts, grate_indices={3, 8, 12}, seed=1049)

    # Flanking Battered Stone Retaining Plinth along West Alley Shoulder (`Cam G` left side — covers steep slope!)
    for wz_seg in (-9.6, -11.4):
        yb_s = -14.5 - wz_seg
        zb_s = _alley_base_y(wz_seg)
        cx_s = _alley_center_x(wz_seg)
        add_hewn_stone_block(b, "citadel_masonry", (cx_s - 3.95, yb_s, zb_s + 0.68), (1.65, 1.85, 1.55), chip_amp=0.035, taper=0.08, seed=1055 + int(abs(wz_seg * 10)))
        add_hewn_stone_block(b, "limestone_weathered", (cx_s - 3.95, yb_s, zb_s + 1.50), (1.75, 1.92, 0.18), chip_amp=0.024, seed=1058 + int(abs(wz_seg * 10)))

    # Walkable +9.5m Bridge Deck
    b.add_box("broken_flagstone", (-2.4, 0.0, 9.42), (25.6, 5.2, 0.24), bevel=0.02)
    b.add_box("broken_flagstone", (11.8, 2.0, 9.42), (3.4, 1.4, 0.24), bevel=0.02)
    add_broken_crenellations(b, (-11.6, -2.45, 9.5), 21.6, axis="X", seed=1051)
    add_broken_crenellations(b, (-11.6, 2.45, 9.5), 25.0, axis="X", seed=1052)

    add_iron_brazier(b, (-3.6, -1.6, 9.5), scale=0.88)
    add_iron_brazier(b, (3.6, -1.6, 9.5), scale=0.88)
    for sx in (-3.6, 3.6):
        b.add_planar_quad("banner_ashenhold", (sx - 0.52, -2.92, 4.6), (sx + 0.52, -2.92, 4.6), (sx + 0.52, -2.92, 8.8), (sx - 0.52, -2.92, 8.8), double_sided=True)
    add_wall_vines(b, (0.0, -2.68, 9.1), 4.6, 2.8, "Y", -1, seed=1061)
    add_wall_vines(b, (-6.0, -2.75, 8.6), 3.2, 4.5, "Y", -1, seed=1062)
    add_wall_vines(b, (6.0, -2.75, 8.2), 3.0, 3.8, "Y", -1, seed=1063)

    # CONTINUOUS WEST CURTAIN BATTLEMENT WALK (+9.5m)
    b.add_box("citadel_masonry", (-13.5, -14.1, 5.6), (3.4, 23.8, 7.6), bevel=0.04)
    add_sculpted_masonry_face(b, (-11.8, -14.1, 2.0), 22.8, 7.2, "X", 1, seed=1071)
    for by in (-22.0, -16.0, -10.0, -4.5):
        add_stepped_buttress(b, (-11.8, by, 1.4), 1.15, 0.95, 7.6, "X", 1, stages=3)
    b.add_box("broken_flagstone", (-13.5, -14.1, 9.42), (3.5, 24.0, 0.24), bevel=0.02)
    add_broken_crenellations(b, (-15.0, -25.8, 9.5), 23.8, axis="Y", seed=1072)
    add_broken_crenellations(b, (-12.0, -25.8, 9.5), 23.8, axis="Y", parapet_h=0.88, merlon_h=0.32, seed=1073)

    # EAST RAMPART-TO-TAVERN-2F BRIDGE STAIR
    c_et, o_et = add_stone_stair_flight(
        b,
        (11.6, -6.0, 5.20),
        (11.6, 1.8, 9.50),
        width=2.3,
        step_count=16,
        parapet_left=False,
        parapet_right=True,
        solid_under=False,
        mat_tread="aged_oak_timber",
        mat_wall="citadel_masonry",
        seed=1081,
    )
    b.add_box("aged_oak_timber", (11.6, -6.35, 5.14), (2.4, 1.2, 0.18), bevel=0.015)

    cols.extend([
        bl_box(-6.0, 0.0, 4.6, 5.9, 5.6, 9.2),
        bl_box(6.0, 0.0, 4.6, 5.9, 5.6, 9.2),
        bl_box(-11.4, 0.0, 5.5, 5.6, 4.6, 7.6),
        bl_box(9.2, 0.0, 4.7, 1.35, 4.6, 9.4),
        bl_box(13.8, 0.0, 4.7, 1.35, 4.6, 9.4),
        bl_box(-2.4, 0.0, 9.36, 25.6, 5.2, 0.30),
        bl_box(11.8, 2.0, 9.36, 3.4, 1.4, 0.30),
        bl_box(-0.8, -2.45, 10.2, 21.6, 0.56, 1.4),
        bl_box(0.9, 2.45, 10.2, 25.0, 0.56, 1.4),
        bl_box(-13.5, -14.1, 5.6, 3.4, 23.8, 7.6),
        bl_box(-13.5, -14.1, 9.36, 3.5, 24.0, 0.30),
        bl_box(-15.0, -14.1, 10.2, 0.56, 23.8, 1.4),
        bl_box(-12.0, -14.1, 10.1, 0.56, 23.8, 1.2),
        bl_box(11.6, -6.35, 5.10, 2.4, 1.2, 0.22),
    ])
    cols.extend(c_et)
    oriented.extend(o_et)
    export_sv_model(b, "sv_hero_gothic_bridge", colliders=cols, oriented=oriented)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    builders = [
        ("sv_hero_gate_tower", build_sv_gate_tower),
        ("sv_hero_gothic_bridge", build_sv_gothic_bridge_fixed),
        ("sv_hero_market_bastion", build_sv_market_bastion),
        ("sv_hero_summit_ascent", build_sv_summit_ascent),
        ("sv_hero_undercroft", build_sv_undercroft),
        ("sv_hero_tavern_v3", build_sv_tavern_v3),
        ("sv_supporting_kit", build_sv_supporting_kit),
    ]
    for label, fn in builders:
        print(f"[stormveil_kit] Building {label}...", flush=True)
        fn()

    manifest_path = OUT_DIR / "stormveil_manifest.json"
    manifest_path.write_text(json.dumps(MANIFEST, indent=2), encoding="utf-8")
    print(f"[stormveil_kit] Exported {len(MANIFEST)} sculpted Stormveil V4 GLBs + manifest -> {manifest_path}", flush=True)


if __name__ == "__main__":
    main()
