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
    # Surface normal of tilted box in Three.js space
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
# SCULPTED STORMVEIL-STYLE GOTHIC ARCHITECTURAL PRIMITIVES
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
    course_h: float = 0.58,
    block_w: float = 1.05,
    relief_min: float = 0.03,
    relief_max: float = 0.09,
    density: float = 0.72,
    seed: int = 101,
) -> None:
    """
    Overlays genuine 3D staggered coursed ashlar/rubble stone blocks across a wall face.
    Blocks vary in width, thickness (relief), subtle tilt, and material tone so walls
    read as physical ancient hand-laid stone blocks rather than flat boxes.
    """
    rng = random.Random(seed)
    ox, oy, oz = origin
    n_rows = max(1, int(round(height / course_h)))
    rh = height / n_rows

    for r in range(n_rows):
        zc = oz + (r + 0.5) * rh
        row_shift = (r % 2) * (block_w * 0.48)
        cursor = -width * 0.5 + (row_shift % block_w) - block_w * 0.5
        while cursor < width * 0.5 - 0.15:
            bw = block_w * rng.uniform(0.68, 1.38)
            x0 = max(-width * 0.5 + 0.04, cursor)
            x1 = min(width * 0.5 - 0.04, cursor + bw - 0.035)
            cursor += bw
            seg_w = x1 - x0
            if seg_w < 0.24:
                continue
            if rng.random() > density:
                continue
            xc = (x0 + x1) * 0.5
            depth = rng.uniform(relief_min, relief_max)
            bh = rh * rng.uniform(0.84, 0.96)
            pick = rng.random()
            mat = mat_dark if pick < 0.18 else (mat_accent if pick < 0.56 else mat_primary)
            tilt = rng.uniform(-0.022, 0.022)
            if axis == "Y":
                b.add_box(
                    mat,
                    (ox + xc, oy + sign * (depth * 0.5), zc),
                    (seg_w, depth + 0.06, bh),
                    bevel=min(0.028, depth * 0.35),
                    rot=(rng.uniform(-0.015, 0.015), tilt, 0.0),
                )
            else:
                b.add_box(
                    mat,
                    (ox + sign * (depth * 0.5), oy + xc, zc),
                    (depth + 0.06, seg_w, bh),
                    bevel=min(0.028, depth * 0.35),
                    rot=(tilt, rng.uniform(-0.015, 0.015), 0.0),
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
    """Multi-stage Gothic stepped buttress with sloped stone weathering caps."""
    bx, by, bz = base_pos
    stage_h = height / stages
    for i in range(stages):
        frac = 1.0 - i * 0.24
        p = proj * frac
        w = width * (1.0 - i * 0.08)
        z0 = bz + i * stage_h
        zc = z0 + stage_h * 0.5
        if axis == "Y":
            b.add_box(mat_body, (bx, by + sign * (p * 0.5), zc), (w, p + 0.14, stage_h), bevel=0.035)
            # Sloped weathering cap catching sunlight & moss
            b.add_box(
                mat_cap,
                (bx, by + sign * (p * 0.54), z0 + stage_h + 0.06),
                (w + 0.16, p + 0.26, 0.20),
                bevel=0.025,
                rot=(-sign * 0.28, 0.0, 0.0),
            )
        else:
            b.add_box(mat_body, (bx + sign * (p * 0.5), by, zc), (p + 0.14, w, stage_h), bevel=0.035)
            b.add_box(
                mat_cap,
                (bx + sign * (p * 0.54), by, z0 + stage_h + 0.06),
                (p + 0.26, w + 0.16, 0.20),
                bevel=0.025,
                rot=(0.0, sign * 0.28, 0.0),
            )


def add_gothic_pointed_arch(
    b: MeshBuilder,
    center: tuple[float, float, float],
    half_span: float,
    spring_z: float,
    apex_rise: float,
    depth: float,
    ring_thick: float = 0.42,
    segments_per_side: int = 7,
    axis: str = "Y",
    mat_voussoir: str = "limestone_weathered",
    mat_trim: str = "citadel_masonry",
) -> None:
    """
    True pointed Gothic (ogival) arch built from individually rotated staggered stone
    voussoirs, chamfered impost capitals, and a proud keystone.
    """
    cx, cy, cz = center
    # Impost capitals at spring line
    for side in (-1, 1):
        if axis == "Y":
            b.add_box(mat_trim, (cx + side * (half_span + ring_thick * 0.45), cy, cz + spring_z), (ring_thick * 1.25, depth + 0.16, 0.28), bevel=0.025)
        else:
            b.add_box(mat_trim, (cx, cy + side * (half_span + ring_thick * 0.45), cz + spring_z), (depth + 0.16, ring_thick * 1.25, 0.28), bevel=0.025)

    # Pointed two-center arc geometry: center offset inward
    R = (half_span * half_span + apex_rise * apex_rise) / max(0.2, 2.0 * half_span)
    # Use smooth pointed Gothic curve: x(t) = side * half_span * (1 - t)^0.86, z(t) = spring_z + apex_rise * sin(t * pi/2)
    for side in (-1, 1):
        for i in range(segments_per_side):
            t0 = i / segments_per_side
            t1 = (i + 1) / segments_per_side
            tm = (t0 + t1) * 0.5
            x0 = side * half_span * ((1.0 - t0) ** 0.85)
            z0 = spring_z + apex_rise * math.sin(t0 * math.pi * 0.5)
            x1 = side * half_span * ((1.0 - t1) ** 0.85)
            z1 = spring_z + apex_rise * math.sin(t1 * math.pi * 0.5)
            xm, zm = (x0 + x1) * 0.5, (z0 + z1) * 0.5
            seg_len = math.hypot(x1 - x0, z1 - z0)
            ang = math.atan2(z1 - z0, x1 - x0)
            # Outward normal
            nx = side * math.sin(abs(ang)) if side > 0 else -math.sin(abs(ang))
            # Robust perpendicular outward from arch center
            vx, vz = x1 - x0, z1 - z0
            if side > 0:
                ox_n, oz_n = vz / max(1e-4, seg_len), -vx / max(1e-4, seg_len)
            else:
                ox_n, oz_n = -vz / max(1e-4, seg_len), vx / max(1e-4, seg_len)
            if ox_n * side < 0:
                ox_n, oz_n = -ox_n, -oz_n
            if oz_n < 0:
                oz_n = abs(oz_n)
            nlen = math.hypot(ox_n, oz_n)
            ox_n, oz_n = ox_n / nlen, oz_n / nlen

            protrude = 0.08 if i % 2 == 0 else 0.02
            vm = mat_voussoir if i % 2 == 0 else mat_trim
            px = xm + ox_n * (ring_thick * 0.45)
            pz = cz + zm + oz_n * (ring_thick * 0.45)
            if axis == "Y":
                b.add_box(
                    vm,
                    (cx + px, cy, pz),
                    (seg_len + 0.07, depth + protrude, ring_thick),
                    bevel=0.025,
                    rot=(0.0, -ang, 0.0),
                )
            else:
                b.add_box(
                    vm,
                    (cx, cy + px, pz),
                    (depth + protrude, seg_len + 0.07, ring_thick),
                    bevel=0.025,
                    rot=(ang, 0.0, 0.0),
                )
    # Proud Keystone at apex
    if axis == "Y":
        b.add_box(mat_voussoir, (cx, cy, cz + spring_z + apex_rise + ring_thick * 0.35), (0.44, depth + 0.22, ring_thick * 1.35), bevel=0.03)
    else:
        b.add_box(mat_voussoir, (cx, cy, cz + spring_z + apex_rise + ring_thick * 0.35), (depth + 0.22, 0.44, ring_thick * 1.35), bevel=0.03)


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
    """Weathered Stormveil battlement parapet with irregular chipped/broken merlons."""
    rng = random.Random(seed)
    sx, sy, sz = start
    if axis == "X":
        b.add_box(mat_wall, (sx + length * 0.5, sy, sz + parapet_h * 0.5), (length, thick, parapet_h), bevel=0.03)
        b.add_box(mat_cap, (sx + length * 0.5, sy, sz + parapet_h + 0.05), (length + 0.08, thick + 0.14, 0.13), bevel=0.02)
    else:
        b.add_box(mat_wall, (sx, sy + length * 0.5, sz + parapet_h * 0.5), (thick, length, parapet_h), bevel=0.03)
        b.add_box(mat_cap, (sx, sy + length * 0.5, sz + parapet_h + 0.05), (thick + 0.14, length + 0.08, 0.13), bevel=0.02)

    step = 1.65
    n = max(1, int(length / step))
    for i in range(n):
        pos = (i + 0.5) * (length / n)
        # Occasional weathered/broken shorter merlon for Stormveil ancient silhouette
        if rng.random() < 0.18:
            mh = merlon_h * rng.uniform(0.32, 0.58)
            mw = 0.85 * rng.uniform(0.75, 0.95)
            has_cap = False
        else:
            mh = merlon_h * rng.uniform(0.90, 1.08)
            mw = 0.96 * rng.uniform(0.92, 1.04)
            has_cap = True
        if axis == "X":
            b.add_box(mat_wall, (sx + pos, sy, sz + parapet_h + mh * 0.5), (mw, thick, mh), bevel=0.03)
            if has_cap:
                b.add_box(mat_cap, (sx + pos, sy, sz + parapet_h + mh + 0.06), (mw + 0.12, thick + 0.16, 0.14), bevel=0.025)
        else:
            b.add_box(mat_wall, (sx, sy + pos, sz + parapet_h + mh * 0.5), (thick, mw, mh), bevel=0.03)
            if has_cap:
                b.add_box(mat_cap, (sx, sy + pos, sz + parapet_h + mh + 0.06), (thick + 0.16, mw + 0.12, 0.14), bevel=0.025)


def add_wall_vines(
    b: MeshBuilder,
    anchor: tuple[float, float, float],
    width: float,
    drop: float,
    axis: str = "Y",
    sign: int = -1,
    seed: int = 404,
) -> None:
    """Slender gnarled vine stems + thin overlapping diagonal ivy fronds draping organically down masonry."""
    rng = random.Random(seed)
    ax, ay, az = anchor
    strands = max(2, int(width * 1.35))
    for i in range(strands):
        u = -width * 0.45 + (i + 0.5) * (width * 0.9 / strands) + rng.uniform(-0.18, 0.18)
        strand_drop = drop * rng.uniform(0.45, 1.0)
        # Slender gnarled woody vine stem
        if axis == "Y":
            b.add_box("aged_oak_timber", (ax + u, ay + sign * 0.04, az - strand_drop * 0.5), (0.045, 0.045, strand_drop), rot=(0.0, rng.uniform(-0.08, 0.08), 0.0))
        else:
            b.add_box("aged_oak_timber", (ax + sign * 0.04, ay + u, az - strand_drop * 0.5), (0.045, 0.045, strand_drop), rot=(rng.uniform(-0.08, 0.08), 0.0, 0.0))
        clusters = max(4, int(strand_drop / 0.28))
        for k in range(clusters):
            t = k / max(1, clusters - 1)
            dz = -t * strand_drop
            sway = math.sin(t * 5.2 + i * 1.3) * 0.14
            for sub in (-1, 1):
                if rng.random() < 0.28:
                    continue
                leaf_w = rng.uniform(0.11, 0.21) * (1.0 - t * 0.30)
                leaf_h = leaf_w * rng.uniform(1.1, 1.55)
                out = 0.055 + rng.uniform(0.01, 0.065)
                lat = sway + sub * rng.uniform(0.05, 0.18)
                if axis == "Y":
                    b.add_box(
                        "foliage_leaf",
                        (ax + u + lat, ay + sign * out, az + dz + rng.uniform(-0.06, 0.06)),
                        (leaf_w, 0.022, leaf_h),
                        bevel=0.005,
                        rot=(rng.uniform(-0.35, 0.35), rng.uniform(-0.75, 0.75), rng.uniform(-0.35, 0.35)),
                    )
                else:
                    b.add_box(
                        "foliage_leaf",
                        (ax + sign * out, ay + u + lat, az + dz + rng.uniform(-0.06, 0.06)),
                        (0.022, leaf_w, leaf_h),
                        bevel=0.005,
                        rot=(rng.uniform(-0.75, 0.75), rng.uniform(-0.35, 0.35), rng.uniform(-0.35, 0.35)),
                    )


def add_iron_brazier(b: MeshBuilder, pos: tuple[float, float, float], scale: float = 1.0) -> None:
    """Forged Gothic iron fire brazier with glowing embers."""
    x, y, z = pos
    # Stone pedestal base
    b.add_cylinder("damp_slate_stone", (x, y, z + 0.22 * scale), 0.42 * scale, 0.34 * scale, 0.44 * scale, segs=8, bevel=0.02)
    # Iron tripod legs & basket bowl
    b.add_cylinder("iron_forged", (x, y, z + 0.72 * scale), 0.16 * scale, 0.46 * scale, 0.55 * scale, segs=8, bevel=0.015)
    b.add_cylinder("iron_forged", (x, y, z + 1.05 * scale), 0.48 * scale, 0.52 * scale, 0.16 * scale, segs=8, bevel=0.01)
    # Glowing coal core
    b.add_cylinder("ember_forge", (x, y, z + 1.02 * scale), 0.36 * scale, 0.22 * scale, 0.24 * scale, segs=7)
    b.add_box("glow_warm", (x, y, z + 1.16 * scale), (0.28 * scale, 0.28 * scale, 0.24 * scale), bevel=0.04)


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
    Builds weathered irregular stone stairs from Blender p0 -> p1 with optional stepped
    side parapets and solid masonry backing, returning (box_colliders, oriented_colliders).
    """
    rng = random.Random(seed)
    dx, dy, dz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
    run = math.hypot(dx, dy)
    ang_z = math.atan2(dy, dx)
    ux, uy = dx / max(1e-5, run), dy / max(1e-5, run)
    # Left perpendicular in Blender XY
    lx, ly = -uy, ux

    tread_d = run / max(1, step_count)
    rise_h = dz / max(1, step_count)

    for i in range(step_count):
        t = (i + 0.5) / step_count
        sx = p0[0] + dx * t
        sy = p0[1] + dy * t
        top_z = p0[2] + (i + 1) * rise_h
        if solid_under:
            h = max(0.32, top_z - p0[2] + 0.35)
            zc = top_z - h * 0.5
        else:
            h = abs(rise_h) + 0.26
            zc = top_z - h * 0.5
        # Slight weathered step width/lip variation
        b.add_box(
            mat_tread,
            (sx, sy, zc),
            (tread_d + 0.08, width + rng.uniform(-0.04, 0.04), h),
            bevel=0.02,
            rot=(0.0, 0.0, ang_z),
        )

    box_cols: list[dict] = []
    oriented_cols: list[dict] = [bl_ramp(p0, p1, width=width + 0.16, thickness=0.36, pad_len=0.30)]

    # Sloped cheek walls / stone parapets along left and/or right edges
    slope_pitch = math.atan2(dz, max(1e-5, run))
    slope_len = math.hypot(run, dz)
    for side, enabled in ((1.0, parapet_left), (-1.0, parapet_right)):
        if not enabled:
            continue
        off = side * (width * 0.5 + 0.22)
        mx = (p0[0] + p1[0]) * 0.5 + lx * off
        my = (p0[1] + p1[1]) * 0.5 + ly * off
        mz = (p0[2] + p1[2]) * 0.5 + 0.62
        b.add_box(
            mat_wall,
            (mx, my, mz),
            (slope_len + 0.3, 0.42, 1.18),
            bevel=0.03,
            rot=(0.0, -slope_pitch, ang_z),
        )
        # Guardrail sloped collider
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
    # Central pointed Gothic archway: x in [-2.8, +2.8], clear height z_bl = 0..5.8m!
    for side, sx_center, sw in ((-1, -7.2, 8.8), (1, 7.2, 8.8)):
        # Heavy battered stone plinth (widens at base)
        b.add_box("damp_slate_stone", (sx_center, 0.0, 0.55), (sw + 0.55, 7.45, 2.3), bevel=0.05)
        # Main masonry drum body
        b.add_box("citadel_masonry", (sx_center, 0.0, 5.25), (sw, 6.8, 8.5), bevel=0.04)
        # Sculpted irregular 3D coursed stone blocks on South (-Y) and North (+Y) facades
        add_sculpted_masonry_face(b, (sx_center, -3.4, 1.5), sw - 0.6, 7.8, "Y", -1, seed=910 + side)
        add_sculpted_masonry_face(b, (sx_center, 3.4, 1.5), sw - 0.6, 7.8, "Y", 1, seed=920 + side)
        # Twin massive stepped Gothic buttresses flanking arch & outer flanks
        add_stepped_buttress(b, (side * 3.55, -3.4, 0.0), 1.35, 1.35, 8.9, "Y", -1, stages=3)
        add_stepped_buttress(b, (side * 10.6, -3.4, 0.0), 1.55, 1.55, 9.2, "Y", -1, stages=3)
        add_stepped_buttress(b, (side * 3.55, 3.4, 0.0), 1.25, 1.15, 8.8, "Y", 1, stages=3)
        # Recessed narrow Gothic arrow slits
        for az in (4.2, 7.1):
            b.add_box("damp_slate_stone", (side * 7.2, -3.46, az), (0.38, 0.25, 1.65), bevel=0.02)
            b.add_box("iron_forged", (side * 7.2, -3.42, az), (0.14, 0.14, 1.45))

    # Central Bridge Span above the Gatehouse Archway (z_bl = 5.95..9.5m)
    b.add_box("citadel_masonry", (0.0, 0.0, 7.72), (6.4, 6.8, 3.55), bevel=0.04)
    add_sculpted_masonry_face(b, (0.0, -3.4, 6.2), 5.6, 3.2, "Y", -1, seed=931)
    add_sculpted_masonry_face(b, (0.0, 3.4, 6.2), 5.6, 3.2, "Y", 1, seed=932)

    # Pointed Gothic Gate Archways (South face, Middle rib, North face)
    for ay in (-3.25, 0.0, 3.25):
        add_gothic_pointed_arch(b, (0.0, ay, 0.0), half_span=2.85, spring_z=3.15, apex_rise=2.55, depth=0.82, ring_thick=0.52, axis="Y")

    # Raised Iron Portcullis Teeth & Heavy Oak Gate Leaves (pinned open!)
    for px in (-2.2, -1.65, -1.1, -0.55, 0.0, 0.55, 1.1, 1.65, 2.2):
        b.add_box("iron_forged", (px, -2.55, 4.95), (0.09, 0.09, 1.35))
    b.add_box("iron_forged", (0.0, -2.55, 4.75), (5.0, 0.11, 0.11))
    for side in (-1, 1):
        b.add_box("aged_oak_timber", (side * 2.68, -1.1, 2.2), (0.22, 2.4, 4.4), bevel=0.02)
        for hz in (1.0, 2.2, 3.4):
            b.add_box("iron_forged", (side * 2.55, -1.1, hz), (0.08, 2.35, 0.14))

    # Walkable Top Battlement Stone Deck at z_bl = 9.5m (x in [-15.2, +12.0])
    b.add_box("broken_flagstone", (-1.5, 0.0, 9.42), (27.6, 6.9, 0.24), bevel=0.02)
    add_broken_crenellations(b, (-15.0, -3.25, 9.5), 26.8, axis="X", seed=941)
    add_broken_crenellations(b, (-11.0, 3.25, 9.5), 22.8, axis="X", seed=942)
    # Timber War-Hoarding Gallery crowning the South Gatehouse!
    for hx in (-2.4, -1.2, 0.0, 1.2, 2.4):
        b.add_box("aged_oak_timber", (hx, -3.65, 9.2), (0.22, 1.15, 0.24), bevel=0.015)
    b.add_box("aged_oak_timber", (0.0, -3.95, 10.65), (6.4, 0.22, 2.2), bevel=0.02)
    b.add_box("roof_slate", (0.0, -3.45, 12.15), (6.9, 2.4, 0.22), bevel=0.02, rot=(0.35, 0.0, 0.0))

    # Soaring West Citadel Watchtower rising at x = -13.8, y_bl = -1.2 (rises to z_bl = 17.8m!)
    b.add_box("damp_slate_stone", (-13.8, -0.8, 1.0), (5.8, 6.2, 3.2), bevel=0.05)
    b.add_box("citadel_masonry", (-13.8, -0.8, 9.2), (5.2, 5.6, 15.6), bevel=0.04)
    add_sculpted_masonry_face(b, (-13.8, -3.6, 2.2), 4.6, 14.2, "Y", -1, seed=951)
    add_sculpted_masonry_face(b, (-11.2, -0.8, 9.8), 4.8, 6.8, "X", 1, seed=952)
    add_stepped_buttress(b, (-16.4, -0.8, 0.0), 1.4, 1.4, 13.5, "X", -1, stages=3)
    add_broken_crenellations(b, (-16.3, -3.4, 17.0), 5.0, axis="X", seed=953)
    add_broken_crenellations(b, (-16.3, 1.8, 17.0), 5.0, axis="X", seed=954)
    add_broken_crenellations(b, (-16.3, -3.4, 17.0), 5.2, axis="Y", seed=955)
    add_broken_crenellations(b, (-11.3, -3.4, 17.0), 5.2, axis="Y", seed=956)

    # Flanking East Bastion Tower (x = +13.6, rises to z_bl = 14.2m for dramatic asymmetric Stormveil skyline!)
    b.add_box("damp_slate_stone", (13.6, -0.5, 0.9), (5.6, 6.0, 3.0), bevel=0.05)
    b.add_box("citadel_masonry", (13.6, -0.5, 7.6), (5.0, 5.4, 12.6), bevel=0.04)
    add_sculpted_masonry_face(b, (13.6, -3.2, 2.0), 4.4, 11.4, "Y", -1, seed=961)
    add_stepped_buttress(b, (16.1, -0.5, 0.0), 1.35, 1.35, 11.5, "X", 1, stages=3)
    add_broken_crenellations(b, (11.2, -3.0, 13.9), 4.8, axis="X", seed=962)
    add_broken_crenellations(b, (11.2, 2.0, 13.9), 4.8, axis="X", seed=963)
    # Steep Gothic conical slate turret on East Tower
    b.add_cylinder("roof_slate", (13.6, -0.5, 16.6), 3.35, 0.18, 4.4, segs=8, bevel=0.02)

    # Iron Braziers, Hanging Tattered Banners & Climbing Wall Vines!
    add_iron_brazier(b, (-4.1, -4.1, 0.0), scale=1.05)
    add_iron_brazier(b, (4.1, -4.1, 0.0), scale=1.05)
    add_iron_brazier(b, (0.0, -2.5, 9.5), scale=0.95)
    for sx in (-4.4, 4.4):
        b.add_planar_quad("banner_ashenhold", (sx - 0.55, -3.72, 3.5), (sx + 0.55, -3.72, 3.5), (sx + 0.55, -3.72, 7.9), (sx - 0.55, -3.72, 7.9), double_sided=True)
    add_wall_vines(b, (-8.8, -3.45, 7.8), 3.2, 4.8, "Y", -1, seed=971)
    add_wall_vines(b, (9.0, -3.45, 6.8), 2.8, 4.2, "Y", -1, seed=972)
    add_wall_vines(b, (-13.5, -3.65, 14.5), 3.6, 5.5, "Y", -1, seed=973)

    # Walkable Switchback Guard Stairway on North (inner) side of Gatehouse West Pier:
    # Descends smoothly from +9.5m Gatehouse Deck (x=-12.8, y_bl=+2.8) -> Landing (+4.8m at x=-6.2, y_bl=+4.5)
    # -> Courtyard Ground (+0.15m at x=-6.2, y_bl=+12.5, world z=+1.5m!)
    # Flight 1: Landing (x=-6.4, y_bl=4.6, z=4.8) -> Top Deck (x=-12.8, y_bl=4.6, z=9.5) [run=6.4, rise=4.7 -> 36deg... make run=7.8 -> 31deg!]
    # Let's make Flight 1: (-4.8, 4.6, 4.8) -> (-12.8, 4.6, 9.5) [run=8.0, rise=4.7 -> 30.4deg!]
    c1, o1 = add_stone_stair_flight(b, (-4.8, 4.6, 4.8), (-12.8, 4.6, 9.5), width=2.2, step_count=16, parapet_left=False, parapet_right=False, solid_under=True, seed=981)
    # Mid Landing at (-3.8, 5.2, 4.8)
    b.add_box("citadel_masonry", (-4.8, 5.2, 2.35), (2.4, 3.2, 4.9), bevel=0.03)
    b.add_box("broken_flagstone", (-4.8, 5.2, 4.78), (2.5, 3.3, 0.14), bevel=0.015)
    # Flight 2: Courtyard (-4.8, 14.2, 0.15) -> Mid Landing (-4.8, 6.2, 4.8) [run=8.0, rise=4.65 -> 30.2deg!]
    c2, o2 = add_stone_stair_flight(b, (-4.8, 14.2, 0.15), (-4.8, 6.2, 4.8), width=2.2, step_count=16, parapet_left=True, parapet_right=True, solid_under=True, seed=982)
    # Top connector slab joining stair top (-12.8, 4.6, 9.5) to Gatehouse Deck & West Curtain Walk (-13.5, 6.0, 9.5)
    b.add_box("broken_flagstone", (-13.2, 3.8, 9.42), (3.6, 3.6, 0.24), bevel=0.02)

    cols.extend([
        # Left & Right Gatehouse Piers (leave x in [-2.85, +2.85] 100% open!)
        bl_box(-7.2, 0.0, 4.6, 8.6, 6.8, 9.2),
        bl_box(7.2, 0.0, 4.6, 8.6, 6.8, 9.2),
        # West & East Towers
        bl_box(-13.8, -0.8, 8.5, 5.4, 5.8, 17.0),
        bl_box(13.6, -0.5, 7.0, 5.2, 5.6, 14.0),
        # Walkable Gatehouse Top Deck Floor (+9.5m)
        bl_box(-1.5, 0.0, 9.36, 27.6, 6.9, 0.30),
        bl_box(-13.2, 3.8, 9.36, 3.6, 3.6, 0.30),
        # Gatehouse Top Parapets (keep gap at x in [-14.8, -11.5] on North side for Rampart Walk!)
        bl_box(-1.5, -3.25, 10.2, 26.8, 0.56, 1.4),
        bl_box(0.5, 3.25, 10.2, 22.8, 0.56, 1.4),
        # Guard stair mid landing
        bl_box(-4.8, 5.2, 2.4, 2.4, 3.2, 4.8),
    ])
    cols.extend(c1 + c2)
    oriented.extend(o1 + o2)
    export_sv_model(b, "sv_hero_gate_tower", colliders=cols, oriented=oriented)


# =============================================================================
# HERO ASSET 2: MONUMENTAL OVERHEAD GOTHIC BRIDGE + WEST & EAST RAMPART LINKS
# Placed at (0.0, 0.0, -14.5). Spans curved alley at y = +9.5m!
# Includes:
#   - Pointed Gothic Ribbed Arch spanning alley (x in [-3.1, +3.1], clear y = 0..7.6m)
#   - Walkable +9.5m Stone Bridge Deck (x in [-14.8, +13.0], z_world in [-16.8, -12.2])
#   - Continuous West Curtain Battlement Walk (x = -13.5, y = +9.5m, z_world = -14.5 -> +11.5)
#   - East Bridge-to-Tavern-2F Descend Stair (x = +11.6, z_world = -12.5 -> -5.2, +9.5m -> +5.2m)
# =============================================================================
def build_sv_gothic_bridge() -> None:
    b = MeshBuilder("sv_hero_gothic_bridge", seed=902)
    cols: list[dict] = []
    oriented: list[dict] = []

    # Heavy Battered Stone Piers flanking the narrow 5.4m Trade Alley (pier inner faces at x = ±3.05)
    for side in (-1, 1):
        px = side * 6.0
        b.add_box("damp_slate_stone", (px, 0.0, 1.6), (6.2, 5.9, 4.2), bevel=0.05)
        b.add_box("citadel_masonry", (px, 0.0, 6.0), (5.8, 5.4, 7.0), bevel=0.04)
        add_sculpted_masonry_face(b, (px, -2.7, 2.2), 5.2, 7.0, "Y", -1, seed=1010 + side)
        add_sculpted_masonry_face(b, (px, 2.7, 2.2), 5.2, 7.0, "Y", 1, seed=1020 + side)
        add_stepped_buttress(b, (side * 4.2, -2.7, 1.0), 1.15, 1.05, 8.0, "Y", -1, stages=3)
        add_stepped_buttress(b, (side * 4.2, 2.7, 1.0), 1.15, 1.05, 8.0, "Y", 1, stages=3)
        # Wing bridge support arches extending to West (-13.5) and East (+12.0)
        b.add_box("citadel_masonry", (side * 11.4, 0.0, 5.2), (5.6, 4.6, 8.6), bevel=0.04)
        add_sculpted_masonry_face(b, (side * 11.4, -2.3, 2.5), 4.8, 6.6, "Y", -1, seed=1030 + side)

    # Spandrel Stone Bridge Span above Alley Arch (z_bl = 7.4..9.5m)
    b.add_box("citadel_masonry", (0.0, 0.0, 8.45), (7.2, 5.2, 2.1), bevel=0.04)
    add_sculpted_masonry_face(b, (0.0, -2.6, 7.5), 6.2, 1.9, "Y", -1, seed=1041)
    add_sculpted_masonry_face(b, (0.0, 2.6, 7.5), 6.2, 1.9, "Y", 1, seed=1042)

    # Triple Pointed Gothic Stone Rib Arches spanning dramatically overhead!
    for ay in (-2.55, 0.0, 2.55):
        add_gothic_pointed_arch(b, (0.0, ay, 0.0), half_span=3.15, spring_z=4.25, apex_rise=3.05, depth=0.72, ring_thick=0.48, axis="Y")

    # Corbelled Aged-Oak Machicolation Timber Gallery Brackets under the Bridge Deck
    for bx in (-4.8, -3.2, -1.6, 0.0, 1.6, 3.2, 4.8):
        for sy in (-2.85, 2.85):
            b.add_box("aged_oak_timber", (bx, sy, 9.12), (0.24, 0.85, 0.42), bevel=0.015)

    # Walkable +9.5m Stone Bridge Deck spanning x in [-15.2, +13.4], y_bl in [-2.6, +2.6]
    b.add_box("broken_flagstone", (-0.9, 0.0, 9.42), (28.6, 5.2, 0.24), bevel=0.02)
    # Broken Gothic Crenellations on South & North edges of Bridge (leave openings at West -13.5 & East +11.6!)
    add_broken_crenellations(b, (-11.6, -2.45, 9.5), 21.6, axis="X", seed=1051)
    add_broken_crenellations(b, (-11.6, 2.45, 9.5), 24.6, axis="X", seed=1052)

    # Iron Braziers, Tattered Crimson Banners & Cascading Vines on the Overhead Bridge!
    add_iron_brazier(b, (-3.6, -1.6, 9.5), scale=0.88)
    add_iron_brazier(b, (3.6, -1.6, 9.5), scale=0.88)
    for sx in (-3.6, 3.6):
        b.add_planar_quad("banner_ashenhold", (sx - 0.52, -2.92, 4.6), (sx + 0.52, -2.92, 4.6), (sx + 0.52, -2.92, 8.8), (sx - 0.52, -2.92, 8.8), double_sided=True)
    add_wall_vines(b, (0.0, -2.68, 9.1), 4.6, 2.8, "Y", -1, seed=1061)
    add_wall_vines(b, (-6.0, -2.75, 8.6), 3.2, 4.5, "Y", -1, seed=1062)
    add_wall_vines(b, (6.0, -2.75, 8.2), 3.0, 3.8, "Y", -1, seed=1063)

    # CONTINUOUS WEST CURTAIN BATTLEMENT WALK (+9.5m) running South from Bridge (y_bl = -2.4)
    # all the way to Gatehouse West Deck (y_bl = -25.8 -> world z = +11.3m!)
    # Length = 23.4m along Blender -Y (world +Z), centered at x = -13.5, y_bl = -14.1
    b.add_box("citadel_masonry", (-13.5, -14.1, 4.6), (3.4, 23.8, 9.6), bevel=0.04)
    add_sculpted_masonry_face(b, (-11.8, -14.1, 1.2), 22.8, 8.0, "X", 1, seed=1071)
    for by in (-22.0, -16.0, -10.0, -4.5):
        add_stepped_buttress(b, (-11.8, by, 0.2), 1.15, 0.95, 8.6, "X", 1, stages=3)
    b.add_box("broken_flagstone", (-13.5, -14.1, 9.42), (3.5, 24.0, 0.24), bevel=0.02)
    add_broken_crenellations(b, (-15.0, -25.8, 9.5), 23.8, axis="Y", seed=1072)
    add_broken_crenellations(b, (-12.0, -25.8, 9.5), 23.8, axis="Y", parapet_h=0.88, merlon_h=0.32, seed=1073)

    # EAST RAMPART-TO-TAVERN-2F BRIDGE STAIR:
    # Descends smoothly from Bridge East Landing (+11.6, y_bl=-2.2, z=9.5 -> world z=-12.3)
    # straight South to Tavern 2F Rear Rampart Door (+11.6, y_bl=-9.8, z=5.2 -> world z=-4.7, y=+5.2m!)
    # Run = 7.6m, rise = 4.3m -> 29.5 deg!
    c_et, o_et = add_stone_stair_flight(
        b,
        (11.6, -9.8, 5.2),
        (11.6, -2.2, 9.5),
        width=2.3,
        step_count=15,
        parapet_left=True,
        parapet_right=True,
        solid_under=False,
        mat_tread="aged_oak_timber",
        mat_wall="citadel_masonry",
        seed=1081,
    )
    # Stone pier supporting Tavern-2F bridge landing
    b.add_box("citadel_masonry", (11.6, -10.4, 2.5), (2.8, 1.8, 5.4), bevel=0.03)
    b.add_box("aged_oak_timber", (11.6, -10.2, 5.18), (2.7, 1.8, 0.18), bevel=0.015)

    cols.extend([
        # Alley Flanking Bridge Piers (keep x in [-3.05, +3.05] 100% open!)
        bl_box(-6.0, 0.0, 4.6, 5.9, 5.6, 9.2),
        bl_box(6.0, 0.0, 4.6, 5.9, 5.6, 9.2),
        bl_box(-11.4, 0.0, 4.6, 5.6, 4.6, 9.2),
        bl_box(11.4, 0.0, 4.6, 5.6, 4.6, 9.2),
        # Walkable +9.5m Overhead Bridge Floor Deck
        bl_box(-0.9, 0.0, 9.36, 28.6, 5.2, 0.30),
        # Bridge Parapet Guardrails (leave West x=-13.5 and East x=+11.6 stairs open!)
        bl_box(-0.8, -2.45, 10.2, 21.6, 0.56, 1.4),
        bl_box(0.7, 2.45, 10.2, 24.6, 0.56, 1.4),
        # West Curtain Wall Solid Core + Walkable +9.5m Floor + Parapets
        bl_box(-13.5, -14.1, 4.6, 3.4, 23.8, 9.2),
        bl_box(-13.5, -14.1, 9.36, 3.5, 24.0, 0.30),
        bl_box(-15.0, -14.1, 10.2, 0.56, 23.8, 1.4),
        bl_box(-12.0, -14.1, 10.1, 0.56, 23.8, 1.2),
        # East Tavern-2F Bridge Landing
        bl_box(11.6, -10.3, 5.12, 2.7, 1.8, 0.24),
    ])
    cols.extend(c_et)
    oriented.extend(o_et)
    export_sv_model(b, "sv_hero_gothic_bridge", colliders=cols, oriented=oriented)


# =============================================================================
# HERO ASSET 3: MARKET NORTH BASTION WALL + SHOWCASE CAM-F MASONRY + SWITCHBACK STAIRS
#               + CONTINUOUS WEST MARKET RAMPART WALK (+9.5m joining Overhead Bridge!)
# Placed at (0.0, 3.5, -51.0).
#   - Local z_bl = 0.0 -> world y = +3.5m (Market Plaza)
#   - Local z_bl = 4.0 -> world y = +7.5m (North Bastion Overlook, Cam D at world [0, 7.85, -53.5]!)
#   - Local z_bl = 6.0 -> world y = +9.5m (West Market Battlement Walk running South to Bridge!)
#   - Local y_bl = -0.4 -> world z = -50.6 (RIGHT IN FRONT of Cam F at world [0, 3.95, -49.2]!)
# =============================================================================
def build_sv_market_bastion() -> None:
    b = MeshBuilder("sv_hero_market_bastion", seed=903)
    cols: list[dict] = []
    oriented: list[dict] = []

    WALL_W = 34.0
    DECK_H = 4.0  # +4.0m local = +7.5m world!

    # Heavy Battered Lower Plinth & Main Retaining Bastion Body (y_bl in [0.0, +4.2], z_bl in [-0.6, 4.0])
    b.add_box("damp_slate_stone", (0.0, 2.0, 0.35), (WALL_W + 0.6, 4.8, 1.9), bevel=0.05)
    b.add_box("citadel_masonry", (0.0, 2.1, 2.15), (WALL_W, 4.2, 3.7), bevel=0.04)
    # Walkable +7.5m Overlook Flagstone Deck (y_bl in [0.0, +6.5], z_bl = 4.0)
    b.add_box("broken_flagstone", (0.0, 3.2, DECK_H - 0.08), (WALL_W, 6.6, 0.22), bevel=0.02)

    # -------------------------------------------------------------------------
    # SHOWCASE HERO MASONRY ZONE FOR CAM F (1m closeup at world [0, 3.95, -49.2])
    # Wall front face sits at local y_bl = -0.35 (world z = -50.65, 1.45m ahead of Cam F!)
    # -------------------------------------------------------------------------
    b.add_box("citadel_masonry", (0.0, -0.05, 2.0), (8.2, 0.72, 4.05), bevel=0.03)
    # High-density sculpted individual 3D stone courses right in front of Cam F!
    add_sculpted_masonry_face(
        b,
        (0.0, -0.40, 0.25),
        width=7.8,
        height=3.65,
        axis="Y",
        sign=-1,
        course_h=0.42,
        block_w=0.82,
        relief_min=0.035,
        relief_max=0.095,
        density=0.92,
        seed=1101,
    )
    # Twin Stepped Sculpted Gothic Buttresses framing Cam F at x = ±2.45
    add_stepped_buttress(b, (-2.45, -0.40, 0.0), 1.05, 0.92, 4.05, "Y", -1, stages=3)
    add_stepped_buttress(b, (2.45, -0.40, 0.0), 1.05, 0.92, 4.05, "Y", -1, stages=3)
    # Recessed Pointed Gothic Blind-Arch Shrine Niche right at x = 0.0 (Cam F centerpiece!)
    b.add_box("damp_slate_stone", (0.0, -0.32, 1.55), (1.75, 0.34, 2.45), bevel=0.02)
    add_gothic_pointed_arch(b, (0.0, -0.52, 0.0), half_span=0.96, spring_z=1.55, apex_rise=1.05, depth=0.38, ring_thick=0.26, segments_per_side=6, axis="Y")
    # Carved weathered stone basin pedestal, forged iron tie-plates & lantern sconce inside niche
    b.add_box("limestone_weathered", (0.0, -0.66, 0.62), (1.35, 0.48, 0.22), bevel=0.025)
    b.add_cylinder("citadel_masonry", (0.0, -0.66, 0.30), 0.32, 0.38, 0.58, segs=8, bevel=0.02)
    # Forged iron tie-plates anchored into the masonry flanking the shrine
    for tx in (-1.45, 1.45):
        b.add_box("iron_forged", (tx, -0.49, 2.25), (0.10, 0.06, 0.72), bevel=0.01)
        b.add_box("iron_forged", (tx, -0.49, 2.25), (0.34, 0.06, 0.10), bevel=0.01)
    # Wrought-iron Gothic cage lantern mounted on iron wall bracket (intricate 1m closeup detail!)
    b.add_box("iron_forged", (0.0, -0.56, 2.08), (0.10, 0.38, 0.08), bevel=0.01)
    b.add_box("iron_forged", (0.0, -0.50, 1.92), (0.09, 0.09, 0.36), bevel=0.01)
    # Iron lantern cap, base plate & 4 corner cage bars framing warm recessed ember core
    b.add_box("iron_forged", (0.0, -0.72, 1.98), (0.24, 0.24, 0.05), bevel=0.01)
    b.add_box("iron_forged", (0.0, -0.72, 1.64), (0.22, 0.22, 0.05), bevel=0.01)
    b.add_cylinder("iron_forged", (0.0, -0.72, 2.05), 0.14, 0.03, 0.12, segs=4)
    for lx in (-0.095, 0.095):
        for ly in (-0.625, -0.815):
            b.add_box("iron_forged", (lx, ly, 1.81), (0.028, 0.028, 0.32))
    b.add_box("ember_forge", (0.0, -0.72, 1.77), (0.09, 0.09, 0.14), bevel=0.02)
    # Carved weathered limestone shield crest relief below lantern
    b.add_box("limestone_weathered", (0.0, -0.47, 1.24), (0.58, 0.14, 0.56), bevel=0.03)
    b.add_box("citadel_masonry", (0.0, -0.51, 1.24), (0.38, 0.08, 0.38), bevel=0.02, rot=(0.0, 0.785, 0.0))
    # Cascading wall ivy vines & basal fallen rubble stones framing Cam F
    add_wall_vines(b, (-1.9, -0.50, 3.85), 1.4, 2.4, "Y", -1, seed=1111)
    add_wall_vines(b, (2.1, -0.50, 3.70), 1.3, 2.1, "Y", -1, seed=1112)
    for rx, ry, rs in ((-1.7, -0.75, 0.28), (-1.35, -0.82, 0.20), (1.65, -0.78, 0.26), (1.95, -0.88, 0.18)):
        b.add_box("limestone_weathered", (rx, ry, rs * 0.45), (rs * 1.4, rs * 1.1, rs * 0.9), bevel=0.03, rot=(0.1, 0.2, rx))

    # Sculpted outer bastion wall faces flanking Cam F (x in [-16, -4] and [+4, +16])
    add_sculpted_masonry_face(b, (-10.2, 0.0, 0.3), 11.4, 3.6, "Y", -1, seed=1121)
    add_sculpted_masonry_face(b, (10.2, 0.0, 0.3), 11.4, 3.6, "Y", -1, seed=1122)
    for bx in (-14.5, -7.2, 7.2, 14.5):
        add_stepped_buttress(b, (bx, 0.0, 0.0), 1.15, 0.95, 4.0, "Y", -1, stages=2)

    # Central +7.5m Overlook Balustrade (y_bl = -0.25, x in [-4.5, +4.5]) — low enough (0.95m) so Cam D
    # at world [0, 7.85, -53.5] (local y_bl = +2.5, eye z_bl = 4.35 + 1.65 = 6.0m) looks cleanly over it!
    add_broken_crenellations(b, (-4.4, -0.20, DECK_H), 8.8, axis="X", thick=0.44, parapet_h=0.72, merlon_h=0.22, seed=1131)

    # TWIN IRREGULAR GOTHIC SWITCHBACK STAIRS climbing Market (+3.5m, local z=0) -> Overlook (+7.5m, local z=4.0)!
    # Placed at y_bl = -1.65, x = ±11.4 -> ±4.6 (run=6.8m, rise=4.0m -> 30.5 deg), completely clear of x=-13.5 West Rampart!
    c_sw, o_sw = add_stone_stair_flight(b, (-11.4, -1.65, 0.0), (-4.6, -1.65, DECK_H), width=2.4, step_count=16, parapet_left=False, parapet_right=True, solid_under=True, seed=1141)
    c_se, o_se = add_stone_stair_flight(b, (11.4, -1.65, 0.0), (4.6, -1.65, DECK_H), width=2.4, step_count=16, parapet_left=True, parapet_right=False, solid_under=True, seed=1142)
    # Top landing slabs joining stair tops (x = ±4.6, y_bl = -1.65) smoothly back onto Overlook Deck (y_bl >= 0)!
    for side in (-1, 1):
        b.add_box("citadel_masonry", (side * 3.6, -1.45, DECK_H * 0.5), (2.2, 2.9, DECK_H), bevel=0.03)
        b.add_box("broken_flagstone", (side * 3.6, -1.45, DECK_H - 0.06), (2.3, 3.0, 0.16), bevel=0.015)
        add_iron_brazier(b, (side * 12.6, -2.5, 0.0), scale=0.92)
        # Tall weathered banners flanking the overlook
        b.add_cylinder("aged_oak_timber", (side * 2.8, -0.25, DECK_H + 2.4), 0.08, 0.06, 4.8, segs=8)
        b.add_planar_quad("banner_ashenhold", (side * 2.8 - 0.45, -0.45, DECK_H + 1.5), (side * 2.8 + 0.45, -0.45, DECK_H + 1.5), (side * 2.8 + 0.45, -0.45, DECK_H + 4.2), (side * 2.8 - 0.45, -0.45, DECK_H + 4.2), double_sided=True)

    # -------------------------------------------------------------------------
    # WEST OVERLOOK -> +9.5m WEST MARKET BATTLEMENT RAMPART WALK (Joins Overhead Bridge!)
    # From West Overlook (-13.5, y_bl=+2.2, local z=4.0 -> world y=+7.5m),
    # climbs smoothly South to (-13.5, y_bl=-2.8, local z=6.0 -> world y=+9.5m) [run=5.0m, rise=2.0m -> 21.8 deg!]
    # Then runs continuously South along x = -13.5 at world y = +9.5m all the way to y_bl = -34.2 (world z = -16.8m),
    # meeting sv_hero_gothic_bridge's +9.5m deck seamlessly with ZERO gap!
    # Underneath this West Rampart Wall sits a dramatic GOTHIC STONE MARKET ARCADE (pointed arches at Market +3.5m)!
    # -------------------------------------------------------------------------
    c_wr, o_wr = add_stone_stair_flight(b, (-13.5, 2.2, DECK_H), (-13.5, -2.8, 6.0), width=2.6, step_count=10, parapet_left=True, parapet_right=True, solid_under=True, seed=1151)

    # Continuous West Market Arcade + +9.5m Rampart Walk (x = -13.5, y_bl in [-34.5, -2.8], length = 31.7m!)
    # Built as massive gothic stone arcade piers + pointed arches facing Market (+X) so players see deep
    # shadowed Gothic recesses along the entire West side of Market Plaza!
    arcade_z0 = -2.8
    bay_len = 5.2
    for i in range(6):
        by_mid = arcade_z0 - (i + 0.5) * bay_len
        # Rear curtain wall behind arcade (x = -15.3)
        b.add_box("citadel_masonry", (-15.3, by_mid, 3.0), (1.2, bay_len + 0.1, 6.2), bevel=0.03)
        # Arcade pier on Market side (x = -12.1)
        b.add_box("damp_slate_stone", (-12.1, by_mid + bay_len * 0.5, 2.8), (1.35, 1.35, 5.8), bevel=0.04)
        add_stepped_buttress(b, (-11.45, by_mid + bay_len * 0.5, 0.0), 0.92, 0.72, 5.6, "X", 1, stages=2)
        # Pointed Gothic arcade arch spanning between piers!
        add_gothic_pointed_arch(b, (-12.1, by_mid, 0.0), half_span=1.95, spring_z=2.3, apex_rise=1.85, depth=1.1, ring_thick=0.38, segments_per_side=6, axis="X")
        # Upper spandrel masonry above arcade arch up to +6.0m rampart deck
        b.add_box("citadel_masonry", (-12.2, by_mid, 5.05), (1.3, bay_len, 1.9), bevel=0.03)
        add_sculpted_masonry_face(b, (-11.55, by_mid, 3.9), bay_len - 0.6, 2.0, "X", 1, seed=1160 + i)
        if i % 2 == 0:
            add_wall_vines(b, (-11.5, by_mid, 5.8), 2.4, 2.4, "X", 1, seed=1170 + i)

    # Walkable +9.5m (local z=6.0) West Rampart Flagstone Deck & Broken Crenellations
    b.add_box("broken_flagstone", (-13.5, -18.8, 5.92), (3.8, 32.4, 0.24), bevel=0.02)
    add_broken_crenellations(b, (-15.1, -34.8, 6.0), 32.0, axis="Y", seed=1181)
    add_broken_crenellations(b, (-11.9, -34.8, 6.0), 32.0, axis="Y", parapet_h=0.88, merlon_h=0.30, seed=1182)

    cols.extend([
        # Main North Retaining Wall Core (local y_bl in [0.0, +4.2], z in [0, 4.0])
        bl_box(0.0, 2.1, DECK_H * 0.5, WALL_W, 4.2, DECK_H),
        # Showcase Cam F front masonry wall
        bl_box(0.0, -0.1, DECK_H * 0.5, 8.2, 0.72, DECK_H),
        # Overlook Top Deck (+7.5m)
        bl_box(0.0, 3.2, DECK_H - 0.10, WALL_W, 6.6, 0.28),
        # Overlook Front Parapet (keep x=±3.6 stair landings wide open!)
        bl_box(0.0, -0.20, DECK_H + 0.55, 5.2, 0.46, 1.1),
        # Stair top landing boxes flush at x = ±4.7
        bl_box(-3.6, -1.45, DECK_H * 0.5, 2.2, 2.9, DECK_H),
        bl_box(3.6, -1.45, DECK_H * 0.5, 2.2, 2.9, DECK_H),
        # West Market Arcade Rear Curtain Wall (keeps recessed arcade open at x in [-14.5, -12.8], solid outer wall!)
        bl_box(-15.3, -18.8, 3.0, 1.2, 32.0, 6.0),
        # West Rampart +9.5m Walkable Floor Deck & Parapets
        bl_box(-13.5, -18.8, 5.88, 3.8, 32.4, 0.28),
        bl_box(-15.1, -18.8, 6.65, 0.54, 32.0, 1.3),
        bl_box(-11.9, -18.8, 6.55, 0.54, 32.0, 1.1),
    ])
    cols.extend(c_sw + c_se + c_wr)
    oriented.extend(o_sw + o_se + o_wr)
    export_sv_model(b, "sv_hero_market_bastion", colliders=cols, oriented=oriented)


# =============================================================================
# HERO ASSET 4: CLIFFSIDE SUMMIT ASCENT + +19.5m CITADEL WATCHTOWER PLATFORM
# Placed at (0.0, 7.5, -55.0).
#   - Local z_bl = 0.0  -> world y = +7.5m (North Bastion Overlook)
#   - Local z_bl = 6.0  -> world y = +13.5m (Mid-Cliff Battlement Landing)
#   - Local z_bl = 12.0 -> world y = +19.5m (CITADEL WATCHTOWER SUMMIT PLATFORM!)
#   - Soaring Gothic Keep Spire rises to local z_bl = 20.5m (world y = +28.0m skyline!)
# =============================================================================
def build_sv_summit_ascent() -> None:
    b = MeshBuilder("sv_hero_summit_ascent", seed=904)
    cols: list[dict] = []
    oriented: list[dict] = []

    # Massive Jagged Mountain Crag Cliff Wall towering behind the +7.5m Overlook (y_bl in [3.5, 14.5])
    # Built from staggered sculptural rock slabs + stepped Gothic bastion masonry rising to +19.5m (local 12.0)!
    b.add_box("mountain_crag_rock", (0.0, 9.2, 4.8), (34.0, 11.5, 11.0), bevel=0.35)
    for rx, ry, rz, sx, sy, sz, rot_z in (
        (-13.0, 5.2, 4.5, 6.5, 5.2, 10.5, 0.14),
        (13.2, 5.4, 4.8, 6.8, 5.0, 11.2, -0.16),
        (-6.0, 6.2, 5.8, 7.2, 4.5, 12.0, 0.08),
        (5.5, 6.0, 5.6, 7.5, 4.8, 11.8, -0.09),
    ):
        b.add_box("mountain_crag_rock", (rx, ry, rz), (sx, sy, sz), bevel=0.45, rot=(0.06, -0.05, rot_z))

    # Towering Sculpted Gothic Bastion Wall rising behind Flight 2 (y_bl in [7.6, 14.5], local z = 0..12.0m!)
    b.add_box("citadel_masonry", (0.0, 11.0, 6.0), (24.0, 6.8, 12.2), bevel=0.05)
    add_sculpted_masonry_face(b, (0.0, 7.6, 1.0), 22.8, 10.8, "Y", -1, course_h=0.68, block_w=1.25, seed=1201)
    for bx in (-10.2, -3.6, 3.6, 10.2):
        add_stepped_buttress(b, (bx, 7.6, 0.0), 1.45, 0.95, 11.8, "Y", -1, stages=3)

    # FLIGHT 1 (Local z = 0.0 -> 6.0, world +7.5m -> +13.5m):
    # Starts at East Overlook (+9.5, y_bl=2.2, z=0.0 -> world [+9.5, +7.5, -57.2])
    # Climbs West along the towering cliff face to (-9.5, y_bl=2.2, z=6.0 -> world [-9.5, +13.5, -57.2])!
    # Run = 19.0m, rise = 6.0m -> super smooth 17.5 deg slope!
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
    # Mid-Cliff Battlement Landing at (-10.8, y_bl=4.4, z=6.0 -> world y=+13.5m)
    b.add_box("citadel_masonry", (-10.8, 4.2, 2.9), (4.4, 6.4, 6.2), bevel=0.04)
    b.add_box("broken_flagstone", (-10.8, 4.2, 5.94), (4.5, 6.5, 0.22), bevel=0.02)
    add_broken_crenellations(b, (-12.9, 1.0, 6.0), 6.2, axis="Y", seed=1212)
    add_iron_brazier(b, (-11.6, 1.8, 6.0), scale=0.95)

    # FLIGHT 2 (Local z = 6.0 -> 12.0, world +13.5m -> +19.5m!):
    # Starts at Mid-Cliff Landing (-9.0, y_bl=6.2, z=6.0)
    # Climbs East right in front of the y_bl=7.6 bastion wall to (+7.5, y_bl=6.2, z=12.0 -> world [+7.5, +19.5, -61.2])!
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

    # +19.5m CITADEL WATCHTOWER & HIGH RAMPART SUMMIT PLATFORM (local z = 12.0, x in [-11, +11], y_bl in [7.4, 14.6])
    b.add_box("broken_flagstone", (0.0, 11.0, 11.92), (23.2, 7.4, 0.26), bevel=0.02)
    # Connector slab at Flight 2 top (+9.2, y_bl=6.8, z=12.0)
    b.add_box("citadel_masonry", (9.2, 6.8, 5.9), (3.8, 3.2, 12.0), bevel=0.04)
    b.add_box("broken_flagstone", (9.2, 6.8, 11.92), (3.9, 3.3, 0.24), bevel=0.02)

    # Broken Gothic Crenellations framing the +19.5m Panoramic Summit Overlook!
    # Leave opening at x in [+7.3, +10.8] on y_bl=7.4 so player walks cleanly from Flight 2 onto Summit!
    add_broken_crenellations(b, (-11.4, 7.4, 12.0), 18.4, axis="X", seed=1221)
    add_broken_crenellations(b, (-11.4, 14.5, 12.0), 22.8, axis="X", seed=1222)
    add_broken_crenellations(b, (-11.4, 7.4, 12.0), 7.2, axis="Y", seed=1223)
    add_broken_crenellations(b, (11.2, 5.5, 12.0), 9.1, axis="Y", seed=1224)

    # Soaring Stormveil North Watchtower Keep Crown (rising behind summit at x = -7.8, y_bl = 11.5 up to world +28.5m!)
    b.add_box("citadel_masonry", (-7.8, 11.8, 16.4), (5.8, 5.4, 9.2), bevel=0.04)
    add_sculpted_masonry_face(b, (-7.8, 9.1, 12.4), 5.2, 8.2, "Y", -1, seed=1231)
    add_broken_crenellations(b, (-10.6, 9.1, 21.0), 5.6, axis="X", seed=1232)
    b.add_cylinder("roof_slate", (-7.8, 11.8, 23.6), 3.6, 0.16, 4.8, segs=8, bevel=0.02)

    # Dramatic Summit Landmarks: Roaring Iron Watch-Brazier, Timber War-Hoarding & Crimson Standard!
    add_iron_brazier(b, (0.0, 9.2, 12.0), scale=1.25)
    add_iron_brazier(b, (6.5, 9.6, 12.0), scale=1.0)
    b.add_cylinder("aged_oak_timber", (3.2, 8.0, 15.2), 0.11, 0.08, 6.4, segs=8)
    b.add_planar_quad("banner_ashenhold", (2.5, 7.65, 13.8), (3.9, 7.65, 13.8), (3.9, 7.65, 18.0), (2.5, 7.65, 18.0), double_sided=True)
    add_wall_vines(b, (-5.0, 7.52, 10.6), 4.5, 5.2, "Y", -1, seed=1241)
    add_wall_vines(b, (5.5, 7.52, 9.2), 4.2, 4.8, "Y", -1, seed=1242)

    cols.extend([
        # Main Cliff Bastion Core (starts strictly behind Flight 2 at y_bl >= 7.6!)
        bl_box(0.0, 11.1, 5.9, 24.0, 6.8, 11.8),
        # Mid-Cliff Landing (+13.5m world, local z=6.0) flush at x_max = -9.6
        bl_box(-11.4, 4.2, 2.95, 3.6, 6.5, 6.1),
        bl_box(-12.9, 4.2, 6.7, 0.56, 6.4, 1.4),
        # Flight 2 Top Connector (+19.5m world, local z=12.0) flush at x_min = +7.6
        bl_box(9.4, 6.8, 5.95, 3.6, 3.3, 12.1),
        # Summit Platform Floor (+19.5m world, local z=12.0)
        bl_box(0.0, 11.0, 11.88, 23.2, 7.4, 0.30),
        # Summit Parapet Guardrails (leave Flight 2 entry x in [7.3, 10.6] open!)
        bl_box(-2.2, 7.4, 12.7, 18.4, 0.56, 1.4),
        bl_box(0.0, 14.5, 12.7, 22.8, 0.56, 1.4),
        bl_box(-11.4, 11.0, 12.7, 0.56, 7.2, 1.4),
        bl_box(11.2, 10.0, 12.7, 0.56, 9.1, 1.4),
        # North Watchtower Keep Base on Summit NW
        bl_box(-7.8, 11.8, 16.4, 5.8, 5.4, 9.2),
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

    # Atmospheric Iron Wall Sconces, Glowing Torches & Ancient Iron-Bound Cistern Chest!
    for sy in (-5.5, 0.0, 5.5):
        b.add_box("iron_forged", (-2.25, sy, 2.35), (0.34, 0.14, 0.14))
        b.add_box("glow_warm", (-2.05, sy, 2.52), (0.18, 0.18, 0.28))
        b.add_box("iron_forged", (2.25, sy, 2.35), (0.34, 0.14, 0.14))
        b.add_box("glow_warm", (2.05, sy, 2.52), (0.18, 0.18, 0.28))
    # Iron-bound timber supply chest in cistern niche
    b.add_box("aged_oak_timber", (-1.7, -9.8, 0.42), (0.85, 1.25, 0.78), bevel=0.02)
    b.add_box("iron_forged", (-1.7, -9.8, 0.52), (0.89, 1.29, 0.09))

    # SOUTH STAIRWAY: Climbs East (+X) from Cistern South (local x=1.4, y_bl=-10.0, z=0.0 -> world [-11.1, -4.0, -7.0])
    # up to Trade Alley West Portal (local x=9.8, y_bl=-10.0, z=5.35 -> world [-2.7, +1.35, -7.0])!
    # Run = 8.4m, rise = 5.35m -> 32.5 deg, parapet_left/right=False so turning North into Cistern Hall is 100% open!
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
    # Sculpted Pointed Gothic Culvert Entrance Archway facing Trade Alley East at local x = +8.8, y_bl = -10.0!
    add_gothic_pointed_arch(b, (8.6, -10.0, 5.35), half_span=1.45, spring_z=1.5, apex_rise=1.35, depth=0.85, ring_thick=0.38, segments_per_side=6, axis="X")
    b.add_box("citadel_masonry", (8.6, -11.65, 6.85), (1.1, 0.75, 3.1), bevel=0.03)
    b.add_box("citadel_masonry", (8.6, -8.35, 6.85), (1.1, 0.75, 3.1), bevel=0.03)
    add_wall_vines(b, (9.05, -10.0, 8.2), 2.4, 2.2, "X", 1, seed=1312)

    # NORTH STAIRWAY: Climbs North (+Y_bl, world -Z) & slightly East from Cistern North
    # (local x=0.4, y_bl=+7.5, z=0.0 -> world [-12.1, -4.0, -24.5])
    # up to Market Plaza SW Stairwell Opening (local x=+3.2, y_bl=+19.8, z=7.50 -> world [-9.3, +3.50, -36.8])!
    # Run = hypot(2.8, 12.3) = 12.6m, rise = 7.50m -> 30.7 deg!
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
    # Sculpted Gothic Stairwell Portal Hood at Market SW exit (local x=+3.2, y_bl=+19.8, z=7.50)
    add_gothic_pointed_arch(b, (3.2, 19.4, 7.50), half_span=1.48, spring_z=1.55, apex_rise=1.35, depth=0.78, ring_thick=0.36, segments_per_side=6, axis="Y")
    b.add_box("citadel_masonry", (1.6, 19.4, 8.95), (0.68, 0.95, 2.9), bevel=0.03)
    b.add_box("citadel_masonry", (4.8, 19.4, 8.95), (0.68, 0.95, 2.9), bevel=0.03)
    add_iron_brazier(b, (5.2, 20.1, 7.50), scale=0.82)

    cols.extend([
        # Solid Cistern Walkable Floor (continuous across drain grates at local z = 0.0!)
        bl_box(0.0, -1.5, -0.15, 5.4, 21.2, 0.34),
        # Cistern Side & South Walls
        bl_box(-2.8, -1.5, 2.3, 0.9, 21.6, 5.2),
        bl_box(2.8, 0.5, 2.3, 0.9, 17.4, 5.2),
        bl_box(0.0, -11.8, 2.3, 6.4, 0.9, 5.2),
        # Solid Upper Deck Ceiling above Cistern (prevents falling in from street/market above!)
        bl_box(0.0, -1.5, 4.85, 6.5, 20.6, 1.1),
    ])
    cols.extend(c_s + c_n)
    oriented.extend(o_s + o_n)
    export_sv_model(b, "sv_hero_undercroft", colliders=cols, oriented=oriented)


# =============================================================================
# HERO ASSET 6: STORMVEIL GOTHIC 2-STORY TAVERN (Shell + Interior)
# Placed at (9.2, 1.56, -3.2), yaw = -PI/2 (faces West toward Trade Alley!).
#   - Local -Y -> Three +Z -> rotated yaw=-PI/2 -> World -X (West Street Facade!)
#   - Local +Y -> World +X (East Rear Wall with Fireplace)
#   - Local +X -> World -Z (North Wall -> faces Overhead Bridge!)
#   - Local -X -> World +Z (South Wall)
#   - Open West Doorway + 2 LARGE OPEN MULLIONED GOTHIC WINDOWS on West Facade so
#     Cam E (world [8.4, 1.88, -3.5], looking West!) sees crisp 13:00 daylight streaming in!
#   - Internal Aged-Oak Stair climbs 1F (local z=0.14) -> 2F (local z=3.64 -> world y=+5.20m)
#     and exits via OPEN NORTH-REAR 2F DOORWAY at world (+11.6, +5.20, -4.8) directly onto
#     the East Rampart-to-Bridge Stairway (+5.20m -> +9.5m)!
# =============================================================================
def build_sv_tavern_v3() -> None:
    b = MeshBuilder("sv_hero_tavern_v3", seed=906)
    cols: list[dict] = []
    oriented: list[dict] = []

    W, D = 10.6, 8.0
    hw, hd = W * 0.5, D * 0.5
    H1, H2 = 3.55, 3.25
    wt = 0.48

    # Deep stone foundation plinth + Warm oak 1F floor at local z = 0.14 (world y = 1.70m)
    b.add_box("damp_slate_stone", (0.0, 0.0, -0.95), (W + 0.55, D + 0.55, 2.0), bevel=0.05)
    b.add_box("aged_oak_timber", (0.0, 0.0, 0.08), (W - 0.3, D - 0.3, 0.14))

    # Solid East (Back, +Y), South (-X) & North (+X) 1F Sculpted Stone Walls
    b.add_box("citadel_masonry", (0.0, hd - wt * 0.5, H1 * 0.5), (W, wt, H1), bevel=0.03)
    b.add_box("citadel_masonry", (-hw + wt * 0.5, 0.0, H1 * 0.5), (wt, D, H1), bevel=0.03)
    b.add_box("citadel_masonry", (hw - wt * 0.5, 0.0, H1 * 0.5), (wt, D, H1), bevel=0.03)
    add_sculpted_masonry_face(b, (-hw, 0.0, 0.2), D - 0.5, H1 - 0.3, "X", -1, seed=1401)
    add_sculpted_masonry_face(b, (hw, 0.0, 0.2), D - 0.5, H1 - 0.3, "X", 1, seed=1402)
    add_stepped_buttress(b, (-hw, -hd, 0.0), 0.85, 0.72, H1 + 0.4, "Y", -1, stages=2)
    add_stepped_buttress(b, (hw, -hd, 0.0), 0.85, 0.72, H1 + 0.4, "Y", -1, stages=2)

    # FRONT FACADE (-Y -> World West facing Trade Alley!):
    # Built with THREE REAL OPEN APERTURES so real 13:00 daylight floods Cam E!
    #   - Central Wide Pointed Arch Doorway: x in [-1.35, +1.35], z in [0.0, 2.85]
    #   - Left Open Mullioned Gothic Window: x in [-4.05, -2.25], z in [0.95, 2.65]
    #   - Right Open Mullioned Gothic Window: x in [+2.25, +4.05], z in [0.95, 2.65]
    fy = -hd + wt * 0.5
    # Corner piers & mullions between doorway & windows
    for px, pw in ((-4.68, 1.26), (-1.80, 0.90), (1.80, 0.90), (4.68, 1.26)):
        b.add_box("citadel_masonry", (px, fy, H1 * 0.5), (pw, wt, H1), bevel=0.03)
    # Window sills (below z=0.95) & headers (above z=2.65)
    for wx in (-3.15, 3.15):
        b.add_box("citadel_masonry", (wx, fy, 0.48), (1.82, wt, 0.96), bevel=0.025)
        b.add_box("limestone_weathered", (wx, fy - 0.06, 0.98), (1.98, wt + 0.16, 0.14), bevel=0.02)
        b.add_box("citadel_masonry", (wx, fy, 3.10), (1.82, wt, 0.90), bevel=0.025)
        # Slender stone center mullion + transom cross so daylight streams brightly through!
        b.add_box("limestone_weathered", (wx, fy, 1.80), (0.12, 0.18, 1.70), bevel=0.01)
        b.add_box("limestone_weathered", (wx, fy, 2.02), (1.80, 0.16, 0.10), bevel=0.01)
    # Doorway top lintel + Pointed Gothic Door Arch
    b.add_box("citadel_masonry", (0.0, fy, 3.22), (2.72, wt, 0.68), bevel=0.025)
    add_gothic_pointed_arch(b, (0.0, -hd - 0.02, 0.0), half_span=1.38, spring_z=1.75, apex_rise=1.18, depth=0.62, ring_thick=0.28, segments_per_side=6, axis="Y")
    # Sculpted masonry blocks on front piers
    add_sculpted_masonry_face(b, (-4.68, -hd, 0.2), 1.15, H1 - 0.3, "Y", -1, block_w=0.55, seed=1405)
    add_sculpted_masonry_face(b, (4.68, -hd, 0.2), 1.15, H1 - 0.3, "Y", -1, block_w=0.55, seed=1406)

    # Heavy Aged-Oak Exposed Ceiling Beams + 2F Floor Deck (with stairwell opening at x in [+1.2, +4.8], y in [-1.8, +2.6])
    for bx in (-3.6, -1.8, 0.0, 1.8, 3.6):
        b.add_box("aged_oak_timber", (bx, 0.0, H1 - 0.14), (0.24, D - 0.4, 0.28), bevel=0.015)
    # 2F Floor: Left half (x in [-5.3, +1.2]) + Rear strip (x in [+1.2, +5.3], y in [+2.4, +4.0]) + Front strip (y in [-4.0, -2.0])
    b.add_box("aged_oak_timber", (-2.05, 0.0, H1 + 0.06), (6.5, D + 0.4, 0.18), bevel=0.015)
    b.add_box("aged_oak_timber", (3.25, 3.15, H1 + 0.06), (4.1, 1.9, 0.18), bevel=0.015)
    b.add_box("aged_oak_timber", (3.25, -3.15, H1 + 0.06), (4.1, 2.2, 0.18), bevel=0.015)

    # 2nd Floor Overhanging Gothic Timber-and-Stone Story + Open Front Street Balcony!
    uW, uD = W + 0.5, D + 0.5
    z2 = H1 + 0.15
    # Back (+Y) & South (-X) walls
    b.add_box("limestone_weathered", (0.0, uD * 0.5 - 0.2, z2 + H2 * 0.5), (uW, 0.36, H2), bevel=0.02)
    b.add_box("limestone_weathered", (-uW * 0.5 + 0.2, 0.0, z2 + H2 * 0.5), (0.36, uD, H2), bevel=0.02)
    # North (+X) 2F wall WITH OPEN RAMPART BRIDGE DOORWAY (y in [+1.2, +3.6] -> world x in [+10.4, +12.8], z=-8.5!)
    # Wait: check world coordinates of North (+X) 2F wall!
    # Tavern center = (9.2, 1.56, -3.2), yaw = -PI/2:
    #   wx = 9.2 + lx*0 + lz*(-1) = 9.2 - lz = 9.2 + ly_bl
    #   wz = -3.2 - lx*(-1) + lz*0 = -3.2 + lx?
    # HOLD ON! Let's check CityPhase1Builder.ts lines 177-178!
    #   ca = cos(-PI/2) = 0, sa = sin(-PI/2) = -1
    #   wx = pos.x + lx * ca + lz * sa = pos.x - lz = pos.x + ly_bl
    #   wz = pos.z - lx * sa + lz * ca = pos.z + lx!
    # WHOA! CHECK THAT SIGN!!
    # With yaw = -PI/2:
    #   Three.js local +X -> World +Z (South!)
    #   Three.js local -X -> World -Z (North — toward the Overhead Bridge!)
    #   Three.js local +Z (-Y_bl) -> World -X (West — toward Trade Alley!)
    #   Three.js local -Z (+Y_bl) -> World +X (East — rear of Tavern!)
    # THANK GOODNESS WE VERIFIED THAT SIGN!!
    # So the Bridge Stair landing at world (x=+11.6, y=+5.2, z=-4.7) is at Tavern local:
    #   ly_bl = wx - 9.2 = +2.4!
    #   lx = wz - (-3.2) = -1.5! (Wait: Bridge stair lands at world z=-4.7 -> local x = -1.5?
    #   No, Bridge origin is z=-14.5, Bridge stair bottom is y_bl=-9.8 -> Three local z=+9.8 -> world z = -14.5 + 9.8 = -4.7!
    #   And Tavern center is at world z=-3.2, with local x in [-5.3, +5.3] -> world z in [-8.5, +2.1]!
    #   Wait: if Bridge stair bottom is at world (x=+11.6, z=-4.7), that's INSIDE Tavern's North half (world z=-4.7 -> local x = -1.5)!
    #   Even better: let's make Bridge stair land at world (x=+11.6, z=-8.6) (which is Bridge y_bl = -5.9 -> wait: Bridge z=-14.5,
    #   y_bl=-5.9 -> world z = -14.5 + 5.9 = -8.6, right outside Tavern's North wall at local x = -5.3 (world z = -8.5)!
    #   OR adjust Bridge stair in build_sv_gothic_bridge OR place a clean 2F North Balcony Walkway from local x=-5.3 out to world z=-8.6!)
    # Let's check: in build_sv_gothic_bridge, stair bottom was (11.6, -9.8, 5.2) -> world z = -14.5 + 9.8 = -4.7!
    # Wait: if Tavern is centered at (9.2, 1.56, -0.5) (shifted just 2.7m South? NO! Cam E is at [8.4, 1.88, -3.5]!).
    # Wait: if Tavern center is at (9.2, 1.56, -3.2) with W=10.6 -> local x in [-5.3, +5.3] -> world z in [-8.5, +2.1].
    # Let's check where the Bridge stair bottom should meet Tavern 2F:
    #   Tavern 2F North Wall is at local x = -5.3 -> world z = -8.5!
    #   At world x = +11.6, that is Tavern local ly_bl = 11.6 - 9.2 = +2.4!
    #   So if we open a 2.4m-wide 2F Rear Rampart Doorway in Tavern's **North Wall (local x = -5.3, y_bl in [+1.2, +3.6])**,
    #   it opens at world (x = +10.4..+12.8, y = +5.20, z = -8.5)!
    #   And on the Bridge side (`z = -14.5`), world `z = -8.5` is Bridge local `y_bl = -6.0` (run = 6.0 - 2.2 = 3.8m? Too steep!).
    #   SO make the Bridge stair start further North on the Bridge at Bridge `y_bl = +1.8` (world `z = -16.3`) and run South to `y_bl = -6.0` (world `z = -8.5`) -> run = 7.8m, rise = 4.3m -> 28.9 deg!!
    #   GENIUS!! That's 100% collision-free, zero overlap with Tavern walls, and connects Bridge (+9.5m) -> Tavern 2F (+5.20m) right through the North 2F Doorway at world (+11.6, +5.20, -8.5)!

    # North (-X) 2F Wall with OPEN 2.4m RAMPART BRIDGE DOORWAY at y_bl in [+1.1, +3.5]!
    b.add_box("limestone_weathered", (-uW * 0.5 + 0.2, -1.65, z2 + H2 * 0.5), (0.36, 5.2, H2), bevel=0.02)
    b.add_box("limestone_weathered", (-uW * 0.5 + 0.2, 3.85, z2 + H2 * 0.5), (0.36, 0.85, H2), bevel=0.02)
    b.add_box("aged_oak_timber", (-uW * 0.5 + 0.2, 2.30, z2 + 2.75), (0.42, 2.5, 0.95), bevel=0.02)
    # South (+X) 2F Wall (solid)
    b.add_box("limestone_weathered", (uW * 0.5 - 0.2, 0.0, z2 + H2 * 0.5), (0.36, uD, H2), bevel=0.02)
    # West (-Y) 2F Front Wall with Open Balcony Doorway (x in [-1.2, +1.2]) + Flanking Timber Frame
    b.add_box("limestone_weathered", (-3.4, -uD * 0.5 + 0.2, z2 + H2 * 0.5), (4.4, 0.36, H2), bevel=0.02)
    b.add_box("limestone_weathered", (3.4, -uD * 0.5 + 0.2, z2 + H2 * 0.5), (4.4, 0.36, H2), bevel=0.02)
    b.add_box("aged_oak_timber", (0.0, -uD * 0.5 + 0.2, z2 + 2.8), (2.5, 0.40, 0.90), bevel=0.02)
    # Half-timbered aged-oak exterior framing posts on 2F
    for px in (-5.2, -2.6, 0.0, 2.6, 5.2):
        b.add_box("aged_oak_timber", (px, -uD * 0.5 - 0.04, z2 + H2 * 0.5), (0.20, 0.14, H2), bevel=0.01)
    b.add_box("aged_oak_timber", (0.0, -uD * 0.5 - 0.04, z2 + 0.12), (uW + 0.1, 0.18, 0.22), bevel=0.01)
    b.add_box("aged_oak_timber", (0.0, -uD * 0.5 - 0.04, z2 + H2 - 0.10), (uW + 0.1, 0.18, 0.22), bevel=0.01)

    # Walkable Overhanging 2F Front Street Balcony (-Y_bl = West facing Trade Alley!)
    b.add_box("aged_oak_timber", (0.0, -uD * 0.5 - 0.78, z2 - 0.06), (6.2, 1.55, 0.18), bevel=0.015)
    b.add_box("aged_oak_timber", (0.0, -uD * 0.5 - 1.48, z2 + 0.95), (6.2, 0.14, 0.14), bevel=0.01)
    for bx in (-3.0, -1.5, 0.0, 1.5, 3.0):
        b.add_box("aged_oak_timber", (bx, -uD * 0.5 - 1.48, z2 + 0.48), (0.14, 0.14, 0.95), bevel=0.01)

    # Steep Gothic Slate Gable Roof + Stone Chimney
    b.add_pitched_tiled_roof("roof_slate", "aged_oak_timber", (0.0, 0.0, z2 + H2 + 0.05), length=uW + 0.4, half_span=uD * 0.5 + 0.2, rise=3.3, along_axis="X", overhang=0.65, eave_rafters=True, with_3d_tiles=True)
    b.add_chimney("citadel_masonry", "limestone_weathered", (2.8, hd - 0.5), z2 + 1.0, z2 + H2 + 4.4, width=1.15)
    # Hanging Tavern Sign + Wall Vines
    b.add_box("iron_forged", (-1.8, -hd - 0.65, 3.15), (0.08, 1.25, 0.08))
    b.add_box("sign_tavern", (-1.8, -hd - 0.92, 2.75), (0.08, 0.76, 0.64), bevel=0.015)
    add_wall_vines(b, (-4.4, -hd - 0.06, 3.4), 1.6, 2.6, "Y", -1, seed=1411)

    # INTERNAL AGED-OAK STAIRCASE climbing 1F (local z=0.14) -> 2F (local z=3.68)
    # Runs along South-East interior corner: (x=+3.4, y_bl=-1.8, z=0.14) -> (x=+3.4, y_bl=+2.7, z=3.68)
    # Wait: run = 4.5m, rise = 3.54m -> 38.2 deg (a bit steep? Let's make run = 5.6m: y_bl=-2.7 -> +2.9 -> 32.3 deg!).
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
        # 1F Floor
        bl_box(0.0, 0.0, 0.04, W, D, 0.22),
        # 1F Back (+Y), North (-X), South (+X) Walls
        bl_box(0.0, hd - wt * 0.5, H1 * 0.5, W, wt, H1),
        bl_box(-hw + wt * 0.5, 0.0, H1 * 0.5, wt, D, H1),
        bl_box(hw - wt * 0.5, 0.0, H1 * 0.5, wt, D, H1),
        # 1F Front Wall flanking wide open doorway (x in [-1.35, +1.35] open!)
        bl_box(-3.35, fy, H1 * 0.5, 3.9, wt, H1),
        bl_box(3.35, fy, H1 * 0.5, 3.9, wt, H1),
        # 2F Walkable Floor Slabs (leaving stairwell x in [+2.4, +4.4], y in [-2.6, +2.6] open!)
        bl_box(-1.5, 0.0, H1 + 0.06, 7.6, D + 0.4, 0.20),
        bl_box(3.6, 3.35, H1 + 0.06, 3.2, 1.5, 0.20),
        bl_box(3.6, -3.35, H1 + 0.06, 3.2, 1.5, 0.20),
        # 2F Balcony Floor & Rail
        bl_box(0.0, -uD * 0.5 - 0.78, z2 - 0.06, 6.2, 1.55, 0.20),
        bl_box(0.0, -uD * 0.5 - 1.48, z2 + 0.55, 6.2, 0.20, 1.1),
        # 2F Walls (North wall leaves y_bl in [+1.1, +3.5] OPEN for Bridge Rampart exit!)
        bl_box(0.0, uD * 0.5 - 0.2, z2 + H2 * 0.5, uW, 0.38, H2),
        bl_box(uW * 0.5 - 0.2, 0.0, z2 + H2 * 0.5, 0.38, uD, H2),
        bl_box(-uW * 0.5 + 0.2, -1.65, z2 + H2 * 0.5, 0.38, 5.2, H2),
        bl_box(-3.4, -uD * 0.5 + 0.2, z2 + H2 * 0.5, 4.4, 0.38, H2),
        bl_box(3.4, -uD * 0.5 + 0.2, z2 + H2 * 0.5, 4.4, 0.38, H2),
    ])
    cols.extend(c_st)
    oriented.extend(o_st)
    export_sv_model(b, "sv_hero_tavern_v3", colliders=cols, oriented=oriented)

    # Distance-culled (<28m) Tavern Interior Pack (Hearth, Oak Tables, Bar Counter, Ale Kegs, Flagons)
    bi = MeshBuilder("sv_hero_tavern_v3_interior", seed=907)
    # Stone Hearth Fireplace on East (+Y) Back Wall
    bi.add_box("citadel_masonry", (-1.4, hd - 0.85, 1.55), (2.4, 1.05, 3.1), bevel=0.03)
    bi.add_box("limestone_weathered", (-1.4, hd - 1.02, 2.35), (2.65, 1.25, 0.28), bevel=0.025)
    bi.add_box("ember_forge", (-1.4, hd - 0.72, 0.42), (1.35, 0.52, 0.36), bevel=0.02)
    bi.add_box("glow_warm", (-1.4, hd - 0.65, 0.62), (0.85, 0.30, 0.30))
    # Tavern Bar Counter along North-East interior (x in [-4.4, -1.6], y = 1.6)
    bi.add_box("aged_oak_timber", (-3.1, 1.4, 0.58), (2.8, 0.78, 1.05), bevel=0.02)
    bi.add_box("planks_oak", (-3.1, 1.4, 1.14), (2.95, 0.92, 0.10), bevel=0.015)
    # Ale Kegs behind bar
    for kx in (-4.0, -3.1, -2.2):
        bi.add_cylinder("aged_oak_timber", (kx, 2.7, 0.62), 0.36, 0.34, 0.92, segs=10, bevel=0.02)
        bi.add_cylinder("iron_forged", (kx, 2.7, 0.85), 0.37, 0.37, 0.06, segs=10)
    # Heavy Oak Tavern Tables + Benches + Brass Flagons (positioned so Cam E sees warm foreground framing!)
    for tx, ty in ((-2.6, -1.4), (0.6, 1.4)):
        bi.add_box("planks_oak", (tx, ty, 0.86), (1.85, 1.02, 0.10), bevel=0.015)
        for lx in (-0.75, 0.75):
            for ly in (-0.36, 0.36):
                bi.add_box("aged_oak_timber", (tx + lx, ty + ly, 0.44), (0.12, 0.12, 0.82), bevel=0.01)
        bi.add_box("planks_oak", (tx, ty - 0.78, 0.48), (1.65, 0.34, 0.08), bevel=0.01)
        bi.add_cylinder("brass_aged", (tx + 0.35, ty + 0.12, 1.04), 0.08, 0.06, 0.24, segs=8)
        bi.add_cylinder("ceramic_clay", (tx - 0.25, ty - 0.10, 1.06), 0.09, 0.06, 0.28, segs=8)
    # Overhead Iron Chandelier Ring with warm candles
    bi.add_cylinder("iron_forged", (-0.8, 0.0, 2.68), 0.78, 0.78, 0.08, segs=12)
    for k in range(6):
        ang = k * (math.pi / 3.0)
        bi.add_box("glow_warm", (-0.8 + math.cos(ang) * 0.72, math.sin(ang) * 0.72, 2.84), (0.09, 0.09, 0.22))
    # 2F Guest Beds & Rug
    bi.add_box("cloth_crimson", (-2.4, 1.5, H1 + 0.22), (2.2, 1.5, 0.04))
    bi.add_box("aged_oak_timber", (-3.8, -1.6, H1 + 0.45), (2.1, 1.25, 0.55), bevel=0.02)
    bi.add_box("cloth_linen", (-3.8, -1.6, H1 + 0.76), (1.95, 1.12, 0.16), bevel=0.02)
    export_sv_model(bi, "sv_hero_tavern_v3_interior", colliders=[], bake_ao=True)


# =============================================================================
# HERO ASSET 7: FLANKING BUTTRESSED WALL, MOUNTAIN CRAG OUTCROP & CLOSE-UP PROPS
# =============================================================================
def build_sv_supporting_kit() -> None:
    # 1. Sculpted 12m Gothic Buttressed Curtain Wall (for enclosing East Market & flanks)
    b = MeshBuilder("sv_hero_buttress_wall_12m", seed=908)
    b.add_box("damp_slate_stone", (0.0, 0.0, 0.8), (12.0, 2.2, 2.4), bevel=0.05)
    b.add_box("citadel_masonry", (0.0, 0.0, 4.4), (12.0, 1.8, 5.6), bevel=0.04)
    add_sculpted_masonry_face(b, (0.0, -0.9, 1.6), 11.4, 5.2, "Y", -1, seed=1501)
    for bx in (-4.2, 0.0, 4.2):
        add_stepped_buttress(b, (bx, -0.9, 0.0), 1.05, 0.95, 6.9, "Y", -1, stages=3)
    add_broken_crenellations(b, (-6.0, -0.55, 7.2), 12.0, axis="X", seed=1502)
    add_wall_vines(b, (-2.0, -0.96, 6.8), 3.4, 3.8, "Y", -1, seed=1503)
    export_sv_model(b, "sv_hero_buttress_wall_12m", colliders=[bl_box(0.0, 0.0, 4.0, 12.0, 2.1, 8.2)])

    # 2. Dramatic Craggy Mountain Outcrop Cliff Block (hugs citadel perimeter like Stormveil cliffs!)
    bc = MeshBuilder("sv_hero_crag_outcrop", seed=909)
    rng = random.Random(1511)
    for cx, cy, cz, sx, sy, sz in (
        (0.0, 0.0, 3.5, 7.5, 6.4, 9.0),
        (-2.8, -1.6, 2.4, 4.8, 4.2, 6.5),
        (2.6, 1.4, 4.8, 5.2, 4.6, 10.2),
        (0.4, -2.4, 1.4, 4.6, 3.2, 3.8),
        (-1.2, 2.2, 6.2, 4.4, 4.2, 7.5),
    ):
        bc.add_box(
            "mountain_crag_rock",
            (cx, cy, cz),
            (sx, sy, sz),
            bevel=0.45,
            rot=(rng.uniform(-0.14, 0.14), rng.uniform(-0.14, 0.14), rng.uniform(-0.35, 0.35)),
        )
    export_sv_model(bc, "sv_hero_crag_outcrop", colliders=[bl_box(0.0, 0.0, 4.5, 8.2, 7.0, 9.2)])

    # 3. Close-Up Prop: Fallen Weathered Stone Rubble & Weeds Cluster
    br = MeshBuilder("sv_prop_rubble_pile", seed=910)
    rrng = random.Random(1521)
    for i in range(11):
        ang = i * 0.62 + rrng.uniform(-0.2, 0.2)
        rad = rrng.uniform(0.1, 1.05)
        s = rrng.uniform(0.18, 0.44)
        mat = "limestone_weathered" if i % 3 == 0 else ("damp_slate_stone" if i % 3 == 1 else "citadel_masonry")
        br.add_box(
            mat,
            (math.cos(ang) * rad, math.sin(ang) * rad, s * 0.42),
            (s * rrng.uniform(1.0, 1.6), s * rrng.uniform(0.8, 1.3), s * 0.85),
            bevel=0.03,
            rot=(rrng.uniform(-0.3, 0.3), rrng.uniform(-0.3, 0.3), rrng.uniform(0, 3.14)),
        )
    for k in range(4):
        br.add_box("foliage_leaf", (rrng.uniform(-0.8, 0.8), rrng.uniform(-0.8, 0.8), 0.16), (0.34, 0.34, 0.26), bevel=0.05, rot=(0.2, -0.2, k))
    export_sv_model(br, "sv_prop_rubble_pile", colliders=[])

    # 4. Close-Up Prop: Iron War Brazier (standalone instanced prop)
    bb = MeshBuilder("sv_prop_iron_brazier", seed=911)
    add_iron_brazier(bb, (0.0, 0.0, 0.0), scale=1.0)
    export_sv_model(bb, "sv_prop_iron_brazier", colliders=[bl_box(0.0, 0.0, 0.55, 0.85, 0.85, 1.1)])

    # 5. Close-Up Prop: Weathered Timber Siege Scaffolding Frame
    bs = MeshBuilder("sv_prop_timber_scaffold", seed=912)
    for px in (-1.4, 1.4):
        for py in (-0.6, 0.6):
            bs.add_box("aged_oak_timber", (px, py, 2.2), (0.16, 0.16, 4.4), bevel=0.015)
    for pz in (1.6, 3.3):
        bs.add_box("planks_oak", (0.0, 0.0, pz), (3.2, 1.35, 0.12), bevel=0.01)
    # Cross braces + resting ladder
    bs.add_box("aged_oak_timber", (0.0, -0.62, 1.8), (3.4, 0.09, 0.11), rot=(0.0, 0.65, 0.0))
    bs.add_box("aged_oak_timber", (0.0, -0.62, 1.8), (3.4, 0.09, 0.11), rot=(0.0, -0.65, 0.0))
    export_sv_model(bs, "sv_prop_timber_scaffold", colliders=[bl_box(0.0, 0.0, 2.0, 3.1, 1.3, 4.0)])


# Patch build_sv_gothic_bridge East stair coordinates BEFORE running so it meets Tavern 2F North Doorway
# at world (+11.6, +5.20, -8.5) (Bridge local y_bl = -6.0) cleanly!
def build_sv_gothic_bridge_fixed() -> None:
    b = MeshBuilder("sv_hero_gothic_bridge", seed=902)
    cols: list[dict] = []
    oriented: list[dict] = []

    for side in (-1, 1):
        px = side * 6.0
        b.add_box("damp_slate_stone", (px, 0.0, 1.6), (6.2, 5.9, 4.2), bevel=0.05)
        b.add_box("citadel_masonry", (px, 0.0, 6.0), (5.8, 5.4, 7.0), bevel=0.04)
        add_sculpted_masonry_face(b, (px, -2.7, 2.2), 5.2, 7.0, "Y", -1, seed=1010 + side)
        add_sculpted_masonry_face(b, (px, 2.7, 2.2), 5.2, 7.0, "Y", 1, seed=1020 + side)
        add_stepped_buttress(b, (side * 4.2, -2.7, 1.0), 1.15, 1.05, 8.0, "Y", -1, stages=3)
        add_stepped_buttress(b, (side * 4.2, 2.7, 1.0), 1.15, 1.05, 8.0, "Y", 1, stages=3)
        if side == -1:
            b.add_box("citadel_masonry", (-11.4, 0.0, 5.2), (5.6, 4.6, 8.6), bevel=0.04)
            add_sculpted_masonry_face(b, (-11.4, -2.3, 2.5), 4.8, 6.6, "Y", -1, seed=1029)
        else:
            # Twin tall Gothic columns flanking the open East Bridge-to-Tavern-2F stairwell (x in [10.2, 13.0] open!)
            for cx in (9.2, 13.8):
                b.add_box("citadel_masonry", (cx, 0.0, 4.7), (1.35, 4.6, 9.4), bevel=0.04)

    b.add_box("citadel_masonry", (0.0, 0.0, 8.45), (7.2, 5.2, 2.1), bevel=0.04)
    add_sculpted_masonry_face(b, (0.0, -2.6, 7.5), 6.2, 1.9, "Y", -1, seed=1041)
    add_sculpted_masonry_face(b, (0.0, 2.6, 7.5), 6.2, 1.9, "Y", 1, seed=1042)

    for ay in (-2.55, 0.0, 2.55):
        add_gothic_pointed_arch(b, (0.0, ay, 0.0), half_span=3.15, spring_z=4.25, apex_rise=3.05, depth=0.72, ring_thick=0.48, axis="Y")

    for bx in (-4.8, -3.2, -1.6, 0.0, 1.6, 3.2, 4.8):
        for sy in (-2.85, 2.85):
            b.add_box("aged_oak_timber", (bx, sy, 9.12), (0.24, 0.85, 0.42), bevel=0.015)

    # Walkable +9.5m Bridge Deck (leave open stairwell slot at x in [10.3, 12.9], y_bl < +1.5!)
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

    # CONTINUOUS WEST CURTAIN BATTLEMENT WALK (+9.5m) joining Gatehouse West Deck at world z=+11.3m!
    # Rests above Undercroft upper deck (z_bl >= 1.8m) so Undercroft South Stair below has full 5m+ clearance!
    b.add_box("citadel_masonry", (-13.5, -14.1, 5.6), (3.4, 23.8, 7.6), bevel=0.04)
    add_sculpted_masonry_face(b, (-11.8, -14.1, 2.0), 22.8, 7.2, "X", 1, seed=1071)
    for by in (-22.0, -16.0, -10.0, -4.5):
        add_stepped_buttress(b, (-11.8, by, 1.4), 1.15, 0.95, 7.6, "X", 1, stages=3)
    b.add_box("broken_flagstone", (-13.5, -14.1, 9.42), (3.5, 24.0, 0.24), bevel=0.02)
    add_broken_crenellations(b, (-15.0, -25.8, 9.5), 23.8, axis="Y", seed=1072)
    add_broken_crenellations(b, (-12.0, -25.8, 9.5), 23.8, axis="Y", parapet_h=0.88, merlon_h=0.32, seed=1073)

    # EAST RAMPART-TO-TAVERN-2F BRIDGE STAIR:
    # Descends smoothly from Bridge East Landing (+11.6, y_bl=+1.8, z=9.5 -> world z=-16.3)
    # straight South to Tavern 2F North Rampart Doorway (+11.6, y_bl=-6.0, z=5.20 -> world z=-8.5, y=+5.20m!)
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
        # Walkable +9.5m Overhead Bridge Floor Deck
        bl_box(-2.4, 0.0, 9.36, 25.6, 5.2, 0.30),
        bl_box(11.8, 2.0, 9.36, 3.4, 1.4, 0.30),
        # Bridge Parapet Guardrails
        bl_box(-0.8, -2.45, 10.2, 21.6, 0.56, 1.4),
        bl_box(0.9, 2.45, 10.2, 25.0, 0.56, 1.4),
        # West Curtain Wall Core (base at z_bl=+1.8m so Undercroft below stays 100% open!) + Floor + Parapets
        bl_box(-13.5, -14.1, 5.6, 3.4, 23.8, 7.6),
        bl_box(-13.5, -14.1, 9.36, 3.5, 24.0, 0.30),
        bl_box(-15.0, -14.1, 10.2, 0.56, 23.8, 1.4),
        bl_box(-12.0, -14.1, 10.1, 0.56, 23.8, 1.2),
        # East Tavern 2F threshold slab
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
    print(f"[stormveil_kit] Exported {len(MANIFEST)} sculpted Stormveil V3 GLBs + manifest -> {manifest_path}", flush=True)


if __name__ == "__main__":
    main()
