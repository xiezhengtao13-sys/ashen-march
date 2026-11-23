#!/usr/bin/env python3
"""
Deterministic Ashenhold City Phase-2 master layout assembler.
Merges Phase 1 Gate & Main Street architecture (removing the Phase 1 blocking
skyline_distant dummy) with Phase 2 Central Market Plaza, 10 distinct market stalls,
West Artisan Quarter, East Weavers' Hill Residential Quarter, Castle Causeway,
City Perimeter Curtain Walls, Decorative Horizon, Lights, and Street/Market Props.

Reads collider definitions directly from public/assets/city/models/kit_manifest.json
to guarantee visual meshes and Rapier colliders stay synchronized.
Writes: src/data/cityLayout.json
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PHASE1_PATH = ROOT / "src" / "data" / "cityPhase1Config.json"
MANIFEST_PATH = ROOT / "public" / "assets" / "city" / "models" / "kit_manifest.json"
OUT_PATH = ROOT / "src" / "data" / "cityLayout.json"


def main() -> None:
    p1 = json.loads(PHASE1_PATH.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    # Keep all real Phase-1 buildings/gates/walls, replace blocking skyline_distant
    arch = [a for a in p1["architecture"] if a["id"] != "skyline_distant"]
    for a in arch:
        a["tier"] = "explorable"
        a["district"] = "ashenhold_gate" if a["position"]["z"] > 8 else "ashenhold_main_street"

    def add_kit(
        aid: str,
        model: str,
        x: float,
        z: float,
        yaw: float,
        district: str,
        tier: str = "explorable",
        y_offset: float = 0.0,
        fixed_y: float | None = None,
        cull_dist: float = 115.0,
    ) -> None:
        m = manifest[model]
        entry: dict = {
            "id": aid,
            "model": model,
            "position": {"x": round(x, 3), "y": round(fixed_y if fixed_y is not None else 0.0, 3), "z": round(z, 3)},
            "yMode": "fixed" if fixed_y is not None else "ground",
            "yOffset": round(y_offset, 3),
            "yaw": round(yaw, 4),
            "district": district,
            "tier": tier,
            "cullDist": cull_dist,
        }
        if m.get("colliders"):
            entry["colliders"] = m["colliders"]
        if m.get("cylinderColliders"):
            entry["cylinderColliders"] = m["cylinderColliders"]
        arch.append(entry)

    # 1. Connectors & Walkable Archways Linking Main Street -> Plaza & Both Alleys
    add_kit("courtyard_connectors", "courtyard_connectors.glb", 0.0, 0.0, 0.0, "ashenhold_main_street", fixed_y=0.35, cull_dist=130.0)
    add_kit("market_gate_arch", "market_gate_arch.glb", 3.9, -31.5, -0.09, "ashenhold_main_street", y_offset=-0.05, cull_dist=150.0)
    add_kit("alley_arch_west", "alley_arch_west.glb", -14.5, -21.8, math.pi * 0.5, "ashenhold_artisan_quarter", y_offset=-0.05, cull_dist=125.0)
    add_kit("alley_arch_east", "alley_arch_east.glb", 21.5, -8.8, math.pi * 0.5, "ashenhold_residential_quarter", y_offset=-0.05, cull_dist=125.0)

    # 2. Market Mouth & Central Market Plaza Perimeter Buildings
    add_kit("bldg_south_corner_west", "bldg_south_corner_west.glb", -12.0, -42.5, 1.18, "ashenhold_market_plaza", y_offset=-0.05)
    add_kit("bldg_south_corner_east", "bldg_south_corner_east.glb", 19.8, -42.2, -1.15, "ashenhold_market_plaza", y_offset=-0.05)

    # West Plaza Row (facing East +X, yaw = +pi/2; gap at z in [-77,-65] for Smiths' Row!)
    add_kit("bldg_bakery", "bldg_bakery.glb", -28.0, -58.0, 1.57, "ashenhold_market_plaza", y_offset=-0.04)
    add_kit("bldg_draper", "bldg_draper.glb", -28.0, -83.5, 1.52, "ashenhold_market_plaza", y_offset=-0.04)
    add_kit("bldg_clockmaker", "bldg_clockmaker.glb", -26.5, -95.0, 1.38, "ashenhold_market_plaza", y_offset=-0.04)

    # East Plaza Row (facing West -X, yaw = -pi/2; gaps at z=-50.5 & z=-70)
    add_kit("bldg_vintner", "bldg_vintner.glb", 35.8, -59.5, -1.57, "ashenhold_market_plaza", y_offset=-0.04)
    add_kit("bldg_armorer", "bldg_armorer.glb", 35.8, -83.0, -1.52, "ashenhold_market_plaza", y_offset=-0.04)
    add_kit("bldg_exchange", "bldg_exchange.glb", 34.5, -95.0, -1.35, "ashenhold_market_plaza", y_offset=-0.04)

    # North Plaza Row (Bell Chapel spire + Masons' Arcade Hall + Nook Transition Houses!)
    add_kit("bldg_market_nw_nook", "bldg_res_townhouse_e.glb", -21.8, -103.0, 0.24, "ashenhold_market_plaza", y_offset=-0.05)
    add_kit("bldg_market_chapel", "bldg_market_chapel.glb", -12.5, -104.5, 0.08, "ashenhold_market_plaza", y_offset=-0.05, cull_dist=320.0)
    add_kit("bldg_mason_hall", "bldg_mason_hall.glb", 19.5, -103.5, -0.06, "ashenhold_market_plaza", y_offset=-0.05, cull_dist=180.0)
    add_kit("bldg_market_ne_nook", "bldg_artisan_row_b.glb", 30.8, -102.2, -0.26, "ashenhold_market_plaza", y_offset=-0.05)

    # Plaza Landmarks + 10 Distinct Stalls
    add_kit("landmark_market_fountain", "landmark_market_fountain.glb", 4.0, -74.0, 0.0, "ashenhold_market_plaza", y_offset=-0.02, cull_dist=170.0)
    add_kit("landmark_market_pillar", "landmark_market_pillar.glb", -0.8, -50.8, 0.35, "ashenhold_market_plaza", y_offset=-0.02, cull_dist=150.0)

    stalls = [
        ("stall_01_bakery",     "stall_01_bakery.glb",     -15.0, -56.2,  0.88),
        ("stall_02_produce",    "stall_02_produce.glb",     -7.2, -59.0,  0.42),
        ("stall_03_butcher",    "stall_03_butcher.glb",    -16.5, -64.5,  1.42),
        ("stall_04_pottery",    "stall_04_pottery.glb",     18.8, -56.0, -0.78),
        ("stall_05_fish",       "stall_05_fish.glb",        23.5, -62.5, -1.32),
        ("stall_06_spices",     "stall_06_spices.glb",      13.2, -61.5, -0.38),
        ("stall_07_drapery",    "stall_07_drapery.glb",    -15.8, -83.0,  1.88),
        ("stall_08_jeweler",    "stall_08_jeweler.glb",     -9.5, -88.8,  2.42),
        ("stall_09_ironmonger", "stall_09_ironmonger.glb",  18.5, -83.5, -1.85),
        ("stall_10_scribe",     "stall_10_scribe.glb",      12.8, -89.8, -2.52),
    ]
    for sid, mod, sx, sz, syaw in stalls:
        add_kit(sid, mod, sx, sz, syaw, "ashenhold_market_plaza", y_offset=-0.02, cull_dist=125.0)

    # 3. West Artisan & Smiths' Quarter (Route A Loop)
    add_kit("bldg_smithy", "bldg_smithy.glb", -39.5, -81.8, 0.04, "ashenhold_artisan_quarter", y_offset=-0.08)
    add_kit("bldg_artisan_row_a", "bldg_artisan_row_a.glb", -53.5, -80.5, -0.10, "ashenhold_artisan_quarter", y_offset=-0.08)
    add_kit("bldg_cooperage", "bldg_cooperage.glb", -40.0, -61.8, math.pi - 0.04, "ashenhold_artisan_quarter", y_offset=-0.08)
    add_kit("bldg_artisan_row_b", "bldg_artisan_row_b.glb", -46.2, -39.5, -1.62, "ashenhold_artisan_quarter", y_offset=-0.08)
    add_kit("bldg_tannery", "bldg_tannery.glb", -65.2, -56.0, 1.54, "ashenhold_artisan_quarter", y_offset=-0.08)
    add_kit("bldg_artisan_row_c", "bldg_artisan_row_c.glb", -64.0, -33.0, 1.48, "ashenhold_artisan_quarter", y_offset=-0.08)
    # Close inner south edge of Copperhorn Alley cleanly behind Guardhouse & Tavern
    add_kit("bldg_copperhorn_back", "bldg_res_townhouse_e.glb", -34.0, -14.2, math.pi + 0.04, "ashenhold_artisan_quarter", y_offset=-0.08)
    add_kit("bldg_copperhorn_corner", "bldg_res_cottages_d.glb", -50.5, -13.8, math.pi - 0.12, "ashenhold_artisan_quarter", y_offset=-0.08)

    # 4. East Residential & Weavers' Hill Overlook (Route B Loop)
    add_kit("bldg_weaver_hall", "bldg_weaver_hall.glb", 49.0, -78.8, -0.05, "ashenhold_residential_quarter", y_offset=-0.08, cull_dist=145.0)
    add_kit("bldg_res_tall_a", "bldg_res_tall_a.glb", 63.8, -58.5, -1.52, "ashenhold_residential_quarter", y_offset=-0.08)
    add_kit("bldg_res_gable_b", "bldg_res_gable_b.glb", 63.5, -42.0, -1.62, "ashenhold_residential_quarter", y_offset=-0.08)
    add_kit("bldg_res_corner_c", "bldg_res_corner_c.glb", 59.5, -24.0, -1.35, "ashenhold_residential_quarter", y_offset=-0.08)
    add_kit("bldg_res_cottages_d", "bldg_res_cottages_d.glb", 42.5, -34.5, 1.52, "ashenhold_residential_quarter", y_offset=-0.08)
    add_kit("bldg_res_townhouse_e", "bldg_res_townhouse_e.glb", 32.5, -17.5, -0.08, "ashenhold_residential_quarter", y_offset=-0.08)
    # South border of Guildhouse Courtyard Alley
    add_kit("bldg_lantern_south", "bldg_res_gable_b.glb", 35.5, -0.8, math.pi, "ashenhold_residential_quarter", y_offset=-0.08)
    add_kit("bldg_lantern_se", "bldg_res_tall_a.glb", 54.0, -4.5, math.pi - 0.35, "ashenhold_residential_quarter", y_offset=-0.08)

    # Terrace Retaining Walls along Weavers' Hill Overlook & Castle Causeway
    add_kit("retaining_weaver_north", "city_retaining_wall.glb", 40.5, -86.0, 1.57, "ashenhold_residential_quarter", y_offset=-0.95)
    add_kit("retaining_castle_west_1", "city_retaining_wall.glb", -2.5, -112.0, 1.57, "ashenhold_castle_approach", y_offset=-0.6)
    add_kit("retaining_castle_west_2", "city_retaining_wall.glb", -2.5, -132.0, 1.57, "ashenhold_castle_approach", y_offset=-0.6)
    add_kit("retaining_castle_east_1", "city_retaining_wall.glb", 10.5, -112.0, -1.57, "ashenhold_castle_approach", y_offset=-0.6)
    add_kit("retaining_castle_east_2", "city_retaining_wall.glb", 10.5, -132.0, -1.57, "ashenhold_castle_approach", y_offset=-0.6)

    # 5. North King's Castle Causeway Forecourt & Closed Citadel Landmark (Phase 3)
    add_kit("bldg_castle_flank_west", "bldg_castle_flank_west.glb", -19.5, -158.0, 1.52, "ashenhold_castle_approach", y_offset=-0.08, cull_dist=180.0)
    add_kit("bldg_castle_flank_east", "bldg_castle_flank_east.glb", 27.5, -158.0, -1.52, "ashenhold_castle_approach", y_offset=-0.08, cull_dist=180.0)
    add_kit("castle_barbican_gate", "castle_barbican_gate.glb", 4.0, -173.0, 0.0, "ashenhold_castle_approach", tier="landmark_closed", fixed_y=9.75, cull_dist=260.0)
    add_kit("castle_citadel_keep", "castle_citadel_keep.glb", 4.0, -191.0, 0.0, "ashenhold_castle_approach", tier="landmark_closed", fixed_y=13.5, cull_dist=320.0)

    # 6. Perimeter Curtain Walls Enclosing the ~200x240m Walled City (no floating void edges!)
    for idx, wz in enumerate([-156, -132, -108, -84, -60, -36, -12, 8]):
        add_kit(f"wall_west_{idx}", "perimeter_curtain_wall.glb", -71.0, float(wz), 1.5708, "ashenhold_artisan_quarter", y_offset=-0.3, cull_dist=200.0)
        add_kit(f"wall_east_{idx}", "perimeter_curtain_wall.glb", 71.0, float(wz), -1.5708, "ashenhold_residential_quarter", y_offset=-0.3, cull_dist=200.0)
    for idx, wx in enumerate([-57.6, -33.6, 33.6, 57.6]):
        add_kit(f"wall_south_{idx}", "perimeter_curtain_wall.glb", float(wx), 13.6, 0.0, "ashenhold_gate", y_offset=-0.3, cull_dist=200.0)
    for idx, wx in enumerate([-56.0, -32.0, -14.0, 22.0, 42.0, 60.0]):
        add_kit(f"wall_north_{idx}", "perimeter_curtain_wall.glb", float(wx), -173.5, 0.0, "ashenhold_castle_approach", y_offset=-0.3, cull_dist=220.0)

    # 7. Decorative Outer Perimeter Skyline Clusters (strictly outside walls, labelled decorative)
    outer_clusters = [
        ("deco_west_1", -88.0, -110.0, 0.25),
        ("deco_west_2", -88.0, -45.0, -0.15),
        ("deco_east_1", 88.0, -115.0, -0.20),
        ("deco_east_2", 88.0, -40.0, 0.18),
        ("deco_north_w", -42.0, -196.0, 0.12),
        ("deco_north_e", 48.0, -196.0, -0.14),
    ]
    for did, dx, dz, dyaw in outer_clusters:
        add_kit(did, "outer_decorative_horizon.glb", dx, dz, dyaw, "ashenhold_castle_approach", tier="decorative", y_offset=-0.2, cull_dist=280.0)

    # 8. Street, Market, Smithy & Residential Life Props (instanced batches)
    props = p1["propBatches"]
    # Remove single Phase-1 center blocking notice clutter around -22.2 (shift crates slightly right to road shoulder)
    props["prop_barrel.glb"] = [e for e in props["prop_barrel.glb"] if e["z"] > -20]
    props["prop_crate.glb"] = [e for e in props["prop_crate.glb"] if e["z"] > -20]

    props.setdefault("prop_well_stone.glb", [])
    props.setdefault("prop_banner_pole.glb", [])

    # Market & District Handcarts, Crates, Barrels, Sacks, Amphorae, Benches, Lantern Posts, Banners, Wells!
    props["prop_cart.glb"].extend([
        {"x": -5.8, "z": -53.5, "yaw": 0.42, "scale": 1.0, "collider": True},
        {"x": 11.2, "z": -52.0, "yaw": -0.68, "scale": 0.96, "collider": True},
        {"x": -34.0, "z": -71.5, "yaw": 1.48, "scale": 1.0, "collider": True},
        {"x": 27.2, "z": -9.5, "yaw": 1.35, "scale": 0.92, "collider": True},
    ])
    props["prop_well_stone.glb"].extend([
        {"x": -50.2, "z": -48.5, "yaw": 0.4, "scale": 1.0, "collider": True},
        {"x": 49.0, "z": -56.5, "yaw": -0.5, "scale": 1.0, "collider": True},
    ])
    props["prop_banner_pole.glb"].extend([
        {"x": -1.5, "z": -102.0, "yaw": 0.0, "scale": 1.0, "collider": False},
        {"x": 9.5,  "z": -102.0, "yaw": 3.14, "scale": 1.0, "collider": False},
        {"x": -1.5, "z": -128.0, "yaw": 0.0, "scale": 1.0, "collider": False},
        {"x": 9.5,  "z": -128.0, "yaw": 3.14, "scale": 1.0, "collider": False},
        {"x": -1.5, "z": -152.0, "yaw": 0.0, "scale": 1.0, "collider": False},
        {"x": 9.5,  "z": -152.0, "yaw": 3.14, "scale": 1.0, "collider": False},
        {"x": -4.0, "z": -169.0, "yaw": 0.0, "scale": 1.1, "collider": False},
        {"x": 12.0, "z": -169.0, "yaw": 3.14, "scale": 1.1, "collider": False},
    ])
    props["prop_bench.glb"].extend([
        {"x": -2.4, "z": -66.0, "yaw": 1.57, "scale": 1.0, "collider": True},
        {"x": 10.4, "z": -66.0, "yaw": -1.57, "scale": 1.0, "collider": True},
        {"x": -2.4, "z": -82.0, "yaw": 1.57, "scale": 1.0, "collider": True},
        {"x": 10.4, "z": -82.0, "yaw": -1.57, "scale": 1.0, "collider": True},
        {"x": 47.0, "z": -71.5, "yaw": 0.0, "scale": 1.0, "collider": True},
    ])
    props["prop_barrel.glb"].extend([
        {"x": -22.2, "z": -54.0, "yaw": 0.4, "scale": 1.0, "collider": True},
        {"x": -21.6, "z": -53.3, "yaw": 1.2, "scale": 0.92, "collider": False},
        {"x": 29.8,  "z": -56.5, "yaw": 0.8, "scale": 1.05, "collider": True},
        {"x": 30.2,  "z": -57.4, "yaw": 2.1, "scale": 0.95, "collider": False},
        {"x": 29.8,  "z": -60.5, "yaw": 0.3, "scale": 1.0, "collider": True},
        {"x": -44.2, "z": -67.2, "yaw": 1.1, "scale": 1.0, "collider": True},
        {"x": -43.5, "z": -67.8, "yaw": 2.4, "scale": 0.94, "collider": False},
        {"x": -60.2, "z": -52.5, "yaw": 0.6, "scale": 1.0, "collider": True},
        {"x": 57.5,  "z": -36.5, "yaw": 1.4, "scale": 1.0, "collider": True},
        {"x": 16.5,  "z": -98.0, "yaw": 0.5, "scale": 1.0, "collider": False},
    ])
    props["prop_crate.glb"].extend([
        {"x": -18.0, "z": -54.5, "yaw": 0.25, "scale": 0.95, "collider": True},
        {"x": -17.3, "z": -53.8, "yaw": -0.2, "scale": 0.82, "collider": False},
        {"x": 22.0,  "z": -54.5, "yaw": 0.4,  "scale": 0.96, "collider": True},
        {"x": 22.1,  "z": -54.5, "yaw": 0.7,  "scale": 0.72, "yOffset": 0.82, "collider": False},
        {"x": -18.5, "z": -86.5, "yaw": 0.1,  "scale": 0.95, "collider": True},
        {"x": 21.5,  "z": -85.5, "yaw": -0.3, "scale": 0.95, "collider": True},
        {"x": -46.5, "z": -76.0, "yaw": 0.3,  "scale": 1.0, "collider": True},
        {"x": 52.5,  "z": -62.5, "yaw": -0.15,"scale": 0.95, "collider": True},
        {"x": -7.0,  "z": -155.0,"yaw": 0.2,  "scale": 1.0, "collider": True},
        {"x": 15.0,  "z": -155.0,"yaw": -0.4, "scale": 1.0, "collider": True},
    ])
    props["prop_sack.glb"].extend([
        {"x": -19.2, "z": -57.2, "yaw": 0.8, "scale": 1.0, "collider": False},
        {"x": -12.5, "z": -59.5, "yaw": 1.9, "scale": 0.92, "collider": False},
        {"x": 16.5,  "z": -66.0, "yaw": 0.4, "scale": 1.0, "collider": False},
        {"x": -42.5, "z": -66.5, "yaw": 2.2, "scale": 0.95, "collider": False},
        {"x": 45.2,  "z": -74.0, "yaw": 1.1, "scale": 1.0, "collider": False},
    ])
    props["prop_amphora.glb"].extend([
        {"x": 20.5, "z": -57.5, "yaw": 0.3, "scale": 1.0, "collider": False},
        {"x": 21.0, "z": -58.0, "yaw": 1.7, "scale": 0.88, "collider": False},
        {"x": 15.2, "z": -62.5, "yaw": 2.1, "scale": 1.0, "collider": False},
        {"x": 57.5, "z": -48.5, "yaw": 0.6, "scale": 1.0, "collider": False},
    ])
    props["prop_planter.glb"].extend([
        {"x": -22.2, "z": -81.0, "yaw": 0.4, "scale": 1.0, "collider": False},
        {"x": 29.8,  "z": -81.0, "yaw": 1.6, "scale": 1.0, "collider": False},
        {"x": 59.0,  "z": -62.0, "yaw": 0.8, "scale": 1.0, "collider": False},
        {"x": 58.2,  "z": -44.0, "yaw": 2.1, "scale": 1.0, "collider": False},
        {"x": -5.0,  "z": -98.5, "yaw": 0.2, "scale": 1.0, "collider": False},
        {"x": 13.0,  "z": -98.5, "yaw": 1.4, "scale": 1.0, "collider": False},
    ])
    props["prop_lantern_post.glb"].extend([
        {"x": -6.0,  "z": -48.5, "yaw": 0.4,  "scale": 1.0, "collider": False},
        {"x": 14.0,  "z": -48.5, "yaw": 2.7,  "scale": 1.0, "collider": False},
        {"x": -18.5, "z": -66.0, "yaw": 0.0,  "scale": 1.0, "collider": False},
        {"x": 26.8,  "z": -65.2, "yaw": 3.14, "scale": 1.0, "collider": False},
        {"x": -3.0,  "z": -94.0, "yaw": 0.0,  "scale": 1.0, "collider": False},
        {"x": 11.0,  "z": -94.0, "yaw": 3.14, "scale": 1.0, "collider": False},
        {"x": -48.0, "z": -68.0, "yaw": 0.0,  "scale": 1.0, "collider": False},
        {"x": -52.0, "z": -38.0, "yaw": 0.0,  "scale": 1.0, "collider": False},
        {"x": -34.0, "z": -19.0, "yaw": 1.57, "scale": 1.0, "collider": False},
        {"x": 51.0,  "z": -64.0, "yaw": 3.14, "scale": 1.0, "collider": False},
        {"x": 52.0,  "z": -34.0, "yaw": 3.14, "scale": 1.0, "collider": False},
        {"x": 34.0,  "z": -12.5, "yaw": -1.57,"scale": 1.0, "collider": False},
        {"x": -2.0,  "z": -152.0,"yaw": 0.0,  "scale": 1.0, "collider": False},
        {"x": 10.0,  "z": -152.0,"yaw": 3.14, "scale": 1.0, "collider": False},
    ])
    props["prop_debris_cluster.glb"].extend([
        {"x": -22.0, "z": -72.0, "yaw": 0.5, "scale": 1.1, "collider": False},
        {"x": 29.0,  "z": -69.0, "yaw": 1.8, "scale": 1.1, "collider": False},
        {"x": -54.0, "z": -52.0, "yaw": 0.9, "scale": 1.2, "collider": False},
        {"x": 52.0,  "z": -48.0, "yaw": 2.3, "scale": 1.1, "collider": False},
        {"x": 4.0,   "z": -118.0,"yaw": 0.4, "scale": 1.0, "collider": False},
        {"x": -20.0, "z": -22.0, "yaw": 1.2, "scale": 1.1, "collider": False},
    ])

    layout = {
        "zoneId": p1["zoneId"],
        "cityName": "灰烬城 (Ashenhold)",
        "version": "phase2-market-200x240",
        "bounds": {
            "explorable": {"minX": -69, "maxX": 69, "minZ": -171, "maxZ": 31},
            "worldEnvelope": {"minX": -108, "maxX": 108, "minZ": -210, "maxZ": 38},
        },
        "spawnPoint": p1["spawnPoint"],
        "spawnYaw": p1["spawnYaw"],
        "portals": p1["portals"],
        "regions": [
            {"id": "ashenhold_gate", "name": "灰烬城 · 南城门", "tier": "explorable"},
            {"id": "ashenhold_main_street", "name": "灰烬城 · 门卫主街", "tier": "explorable"},
            {"id": "ashenhold_market_plaza", "name": "灰烬城 · 中央市集", "tier": "explorable"},
            {"id": "ashenhold_artisan_quarter", "name": "灰烬城 · 铁匠工坊区", "tier": "explorable"},
            {"id": "ashenhold_residential_quarter", "name": "灰烬城 · 织坊居民高地", "tier": "explorable"},
            {"id": "ashenhold_castle_approach", "name": "灰烬城 · 城堡大道 (前庭)", "tier": "explorable"},
            {"id": "ashenhold_citadel_inner", "name": "领主内堡 (Phase 3 未开放)", "tier": "landmark_closed"},
        ],
        "architecture": arch,
        "propBatches": props,
        # Dynamic point lights kept <= 6 active simultaneous closest pools + updated gently in runtime
        "lights": [
            {"position": {"x": 0.0, "y": 4.1, "z": 14.0}, "color": "#ff9e42", "intensity": 3.4, "distance": 16},
            {"position": {"x": -9.3, "y": 3.1, "z": -12.4}, "color": "#ffa042", "intensity": 4.4, "distance": 15},
            {"position": {"x": -11.4, "y": 1.6, "z": -13.8}, "color": "#ff6a22", "intensity": 3.6, "distance": 12},
            {"position": {"x": 4.0, "y": 7.4, "z": -74.0}, "color": "#ffb05c", "intensity": 4.0, "distance": 24},
            {"position": {"x": -45.5, "y": 4.8, "z": -79.5}, "color": "#ff6b26", "intensity": 4.8, "distance": 16},
            {"position": {"x": 4.0, "y": 12.8, "z": -168.0}, "color": "#ffa44c", "intensity": 3.8, "distance": 18},
        ],
    }

    OUT_PATH.write_text(json.dumps(layout, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({len(arch)} arch/buildings/walls, {sum(len(v) for v in props.values())} instanced props)")


if __name__ == "__main__":
    main()
