#!/usr/bin/env python3
"""
Builds src/data/cityLayout.json and syncs src/data/cityPhase1Config.json for
Ashenhold V5: 8-Cell Interconnected Mountain Citadel (`feature/ashenhold-interconnected-city-v5`).
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT / "public/assets/city/models"
PHASE1_CFG_PATH = ROOT / "src/data/cityPhase1Config.json"
PHASE1_CFG = json.loads(PHASE1_CFG_PATH.read_text(encoding="utf-8"))
KIT_MANIFEST = json.loads((MODELS_DIR / "kit_manifest.json").read_text(encoding="utf-8"))
HILLSIDE_MANIFEST = json.loads((MODELS_DIR / "hillside_manifest.json").read_text(encoding="utf-8"))
SV_MANIFEST = json.loads((MODELS_DIR / "stormveil_manifest.json").read_text(encoding="utf-8"))
V5_MANIFEST = json.loads((MODELS_DIR / "v5_manifest.json").read_text(encoding="utf-8"))

PHASE1_COLLIDERS: dict[str, dict] = {}
for a in PHASE1_CFG["architecture"]:
    PHASE1_COLLIDERS[a["model"]] = {
        "colliders": a.get("colliders", []),
        "cylinderColliders": a.get("cylinderColliders", []),
        "orientedColliders": [],
    }


def get_colliders(model: str) -> dict:
    if model in V5_MANIFEST:
        return V5_MANIFEST[model]
    if model in SV_MANIFEST:
        return SV_MANIFEST[model]
    if model in HILLSIDE_MANIFEST:
        return HILLSIDE_MANIFEST[model]
    if model in KIT_MANIFEST:
        return {
            "colliders": KIT_MANIFEST[model].get("colliders", []),
            "cylinderColliders": KIT_MANIFEST[model].get("cylinderColliders", []),
            "orientedColliders": [],
        }
    return PHASE1_COLLIDERS.get(model, {"colliders": [], "cylinderColliders": [], "orientedColliders": []})


PI = math.pi
HP = PI * 0.5


def arch(
    aid: str,
    model: str,
    x: float,
    y: float,
    z: float,
    yaw: float = 0.0,
    district: str = "ashenhold_main_street",
    cell_id: str | None = None,
    tier: str = "explorable",
    y_mode: str = "fixed",
    y_offset: float = 0.0,
    cull_dist: float = 165.0,
    building_class: str = "A",
    is_interior: bool = False,
) -> dict:
    cols = get_colliders(model)
    entry: dict = {
        "id": aid,
        "model": model,
        "position": {"x": round(x, 3), "y": round(y, 3), "z": round(z, 3)},
        "yMode": y_mode,
        "yOffset": round(y_offset, 3),
        "yaw": round(yaw, 4),
        "district": district,
        "tier": tier,
        "buildingClass": building_class,
        "cullDist": cull_dist,
    }
    if cell_id:
        entry["cellId"] = cell_id
    if is_interior:
        entry["isInterior"] = True
    if tier != "decorative":
        if cols.get("colliders"):
            entry["colliders"] = cols["colliders"]
        if cols.get("cylinderColliders"):
            entry["cylinderColliders"] = cols["cylinderColliders"]
        if cols.get("orientedColliders"):
            entry["orientedColliders"] = cols["orientedColliders"]
    return entry


def build_layout() -> dict:
    architecture: list[dict] = []

    # =========================================================================
    # CELL 01: BENT-AXIS BARBICAN, DOUBLE SOUTH GATE, DEFENSE TOWER & GUARDHOUSE
    # =========================================================================
    architecture.extend([
        arch("v5_cell01_barbican", "v5_cell01_barbican.glb", 0.0, 0.0, 23.0, 0.0, "ashenhold_gate", "cell_01_barbican_gate", cull_dist=280),
        arch("v5_cell01_barbican_interior", "v5_cell01_barbican_interior.glb", 0.0, 0.0, 23.0, 0.0, "ashenhold_gate", "cell_01_barbican_gate", cull_dist=32, is_interior=True),
        arch("sv_south_gate_tower", "sv_hero_gate_tower.glb", 0.0, 0.0, 12.2, 0.0, "ashenhold_gate", "cell_01_barbican_gate", cull_dist=300),
        arch("sv_south_wall_w1", "sv_hero_buttress_wall_12m.glb", -22.5, 0.4, 12.4, 0.0, "ashenhold_gate", "cell_01_barbican_gate", cull_dist=260),
        arch("sv_south_wall_e1", "sv_hero_buttress_wall_12m.glb", 22.5, 0.4, 12.4, 0.0, "ashenhold_gate", "cell_01_barbican_gate", cull_dist=260),
    ])

    # =========================================================================
    # CELL 02: S-CURVED TRADE STREET, EMBER TAVERN (1F-2F), APOTHECARY & WAREHOUSE
    # =========================================================================
    architecture.extend([
        arch("sv_overhead_gothic_bridge", "sv_hero_gothic_bridge.glb", 0.0, 0.0, -14.5, 0.0, "ashenhold_main_street", "cell_02_trade_street", cull_dist=260),
        arch("sv_tavern_shell", "sv_hero_tavern_v3.glb", 9.2, 1.56, -3.2, -HP, "ashenhold_main_street", "cell_02_trade_street", cull_dist=220),
        arch("sv_tavern_interior", "sv_hero_tavern_v3_interior.glb", 9.2, 1.56, -3.2, -HP, "ashenhold_main_street", "cell_02_trade_street", cull_dist=30, is_interior=True),
        arch("v5_cell02_trade_annex", "v5_cell02_trade_annex.glb", 0.0, 0.0, 0.0, 0.0, "ashenhold_main_street", "cell_02_trade_street", cull_dist=240),
        arch("v5_cell02_trade_annex_interior", "v5_cell02_trade_annex_interior.glb", 0.0, 0.0, 0.0, 0.0, "ashenhold_main_street", "cell_02_trade_street", cull_dist=32, is_interior=True),
    ])

    # =========================================================================
    # CELL 03: ENCLOSED CENTRAL GOTHIC MARKET, FOUNTAIN, 6 STALLS & 2F GUILD SHOP
    # =========================================================================
    architecture.extend([
        arch("sv_market_north_bastion", "sv_hero_market_bastion.glb", 0.0, 3.50, -51.0, 0.0, "ashenhold_market_plaza", "cell_03_market_plaza", cull_dist=280),
        arch("landmark_market_fountain", "landmark_market_fountain.glb", 0.0, 3.85, -35.0, 0.0, "ashenhold_market_plaza", "cell_03_market_plaza", cull_dist=240),
        arch("landmark_market_pillar", "landmark_market_pillar.glb", -6.2, 3.50, -23.4, 0.35, "ashenhold_market_plaza", "cell_03_market_plaza", cull_dist=200),
        arch("v5_cell03_market_guildshop", "v5_cell03_market_guildshop.glb", 0.0, 0.0, 0.0, 0.0, "ashenhold_market_plaza", "cell_03_market_plaza", cull_dist=240),
        arch("v5_cell03_market_guildshop_interior", "v5_cell03_market_guildshop_interior.glb", 0.0, 0.0, 0.0, 0.0, "ashenhold_market_plaza", "cell_03_market_plaza", cull_dist=32, is_interior=True),
        arch("c_market_e_north", "hillside_c_narrow_c.glb", 15.6, 3.50, -42.5, -HP, "ashenhold_market_plaza", "cell_03_market_plaza", building_class="C"),
        arch("stall_01_bakery", "stall_01_bakery.glb", 9.0, 3.50, -27.2, -HP, "ashenhold_market_plaza", "cell_03_market_plaza", building_class="B"),
        arch("stall_02_produce", "stall_02_produce.glb", -9.2, 3.50, -28.0, HP, "ashenhold_market_plaza", "cell_03_market_plaza", building_class="B"),
        arch("stall_04_pottery", "stall_04_pottery.glb", 9.0, 3.50, -35.6, -HP, "ashenhold_market_plaza", "cell_03_market_plaza", building_class="B"),
        arch("stall_07_drapery", "stall_07_drapery.glb", 8.2, 3.50, -42.4, -HP * 0.65, "ashenhold_market_plaza", "cell_03_market_plaza", building_class="B"),
        arch("stall_06_spices", "stall_06_spices.glb", -8.0, 3.50, -43.0, HP * 0.65, "ashenhold_market_plaza", "cell_03_market_plaza", building_class="B"),
        arch("stall_08_jeweler", "stall_08_jeweler.glb", -4.4, 3.50, -24.2, 0.25, "ashenhold_market_plaza", "cell_03_market_plaza", building_class="B"),
    ])

    # =========================================================================
    # CELL 04: WEST ARTISAN & FORGE QUARTER (+7.0m Terrace & +10.5m Forge Loft)
    # =========================================================================
    architecture.extend([
        arch("v5_cell04_artisan", "v5_cell04_artisan.glb", -32.0, 7.0, -42.0, 0.0, "ashenhold_artisan_quarter", "cell_04_artisan_quarter", cull_dist=280),
        arch("v5_cell04_artisan_interior", "v5_cell04_artisan_interior.glb", -32.0, 7.0, -42.0, 0.0, "ashenhold_artisan_quarter", "cell_04_artisan_quarter", cull_dist=36, is_interior=True),
        arch("a3_apothecary_shell", "hillside_apothecary_a3.glb", -32.5, 7.00, -22.5, 0.0, "ashenhold_artisan_quarter", "cell_04_artisan_quarter", building_class="A"),
        arch("a3_apothecary_interior", "hillside_apothecary_a3_interior.glb", -32.5, 7.00, -22.5, 0.0, "ashenhold_artisan_quarter", "cell_04_artisan_quarter", cull_dist=28, is_interior=True),
    ])

    # =========================================================================
    # CELL 05: EAST RESIDENTIAL HEIGHTS (+7.5m..+11.0m Stepped Lanes & Hidden Yard)
    # =========================================================================
    architecture.extend([
        arch("v5_cell05_residential", "v5_cell05_residential.glb", 32.0, 7.5, -42.0, 0.0, "ashenhold_residential_quarter", "cell_05_residential_heights", cull_dist=280),
        arch("v5_cell05_residential_interior", "v5_cell05_residential_interior.glb", 32.0, 7.5, -42.0, 0.0, "ashenhold_residential_quarter", "cell_05_residential_heights", cull_dist=36, is_interior=True),
    ])

    # =========================================================================
    # CELL 06: CATHEDRAL OF ST. IGNIS, CLIMBABLE BELL TOWER (+24.2m) & GUILDHALL
    # =========================================================================
    architecture.extend([
        arch("sv_summit_watchtower_ascent", "sv_hero_summit_ascent.glb", 0.0, 7.50, -55.0, 0.0, "ashenhold_temple_acropolis", "cell_06_temple_acropolis", cull_dist=340),
        arch("v5_cell06_temple", "v5_cell06_temple.glb", 0.0, 12.2, -86.0, 0.0, "ashenhold_temple_acropolis", "cell_06_temple_acropolis", cull_dist=360),
        arch("v5_cell06_temple_interior", "v5_cell06_temple_interior.glb", 0.0, 12.2, -86.0, 0.0, "ashenhold_temple_acropolis", "cell_06_temple_acropolis", cull_dist=36, is_interior=True),
    ])

    # =========================================================================
    # CELL 07: TRULY EXPLORABLE LORD'S CASTLE (+18m Bailey, Great Hall & +30.5m Keep)
    # =========================================================================
    architecture.extend([
        arch("v5_cell07_castle", "v5_cell07_castle.glb", 0.0, 18.0, -124.0, 0.0, "ashenhold_castle_approach", "cell_07_lord_castle", cull_dist=440),
        arch("v5_cell07_castle_interior", "v5_cell07_castle_interior.glb", 0.0, 18.0, -124.0, 0.0, "ashenhold_castle_approach", "cell_07_lord_castle", cull_dist=40, is_interior=True),
    ])

    # =========================================================================
    # CELL 08: CITY-WIDE -4.0m UNDERCROFT, WINE CELLAR & CASTLE SECRET VAULT
    # =========================================================================
    architecture.extend([
        arch("sv_undercroft_cistern", "sv_hero_undercroft.glb", -12.5, -4.00, -17.0, 0.0, "ashenhold_undercroft", "cell_08_undercroft_cellars", cull_dist=180),
        arch("v5_cell08_undercroft_ext", "v5_cell08_undercroft_ext.glb", 0.0, -4.00, 0.0, 0.0, "ashenhold_undercroft", "cell_08_undercroft_cellars", cull_dist=220),
    ])

    # =========================================================================
    # PERIMETER STRATIFIED CLIFF CRAGS
    # =========================================================================
    architecture.extend([
        arch("crag_west_gate", "sv_hero_crag_outcrop.glb", -22.5, -0.5, 6.0, 0.4, "ashenhold_gate", "cell_01_barbican_gate", cull_dist=280),
        arch("crag_east_gate", "sv_hero_crag_outcrop.glb", 22.8, -0.5, 5.5, -0.6, "ashenhold_gate", "cell_01_barbican_gate", cull_dist=280),
        arch("crag_west_mid", "sv_hero_crag_outcrop.glb", -44.5, 4.5, -12.0, 1.1, "ashenhold_artisan_quarter", "cell_04_artisan_quarter", cull_dist=280),
        arch("crag_east_mid", "sv_hero_crag_outcrop.glb", 44.5, 4.5, -12.0, -0.9, "ashenhold_residential_quarter", "cell_05_residential_heights", cull_dist=280),
        arch("crag_temple_nw", "sv_hero_crag_outcrop.glb", -28.5, 13.5, -88.0, 0.3, "ashenhold_temple_acropolis", "cell_06_temple_acropolis", cull_dist=360),
        arch("crag_temple_ne", "sv_hero_crag_outcrop.glb", 28.5, 13.5, -88.0, -0.4, "ashenhold_temple_acropolis", "cell_06_temple_acropolis", cull_dist=360),
    ])

    # =========================================================================
    # CURATED CLOSE-UP MEDIEVAL PROPS ACROSS ALL 8 CELLS
    # =========================================================================
    prop_batches: dict[str, list[dict]] = {
        "sv_prop_rubble_pile.glb": [
            {"x": -10.5, "z": 28.2, "yaw": 0.4, "scale": 1.0},
            {"x": -3.38, "z": -11.4, "yaw": 1.1, "scale": 0.78},
            {"x": 3.48, "z": -11.6, "yaw": -0.5, "scale": 0.76},
            {"x": -3.8, "z": -49.5, "yaw": 0.2, "scale": 0.96},
            {"x": 3.8, "z": -49.4, "yaw": 2.4, "scale": 0.92},
            {"x": -27.5, "z": -43.5, "yaw": 0.9, "scale": 0.95},
            {"x": -8.5, "z": -111.5, "yaw": 0.5, "scale": 0.92},
        ],
        "sv_prop_iron_brazier.glb": [
            {"x": -3.4, "z": 4.5, "yaw": 0.0, "scale": 0.92, "collider": True},
            {"x": 3.6, "z": -9.8, "yaw": 0.0, "scale": 0.92, "collider": True},
            {"x": -5.6, "z": -30.5, "yaw": 0.0, "scale": 0.95, "collider": True},
            {"x": 5.6, "z": -30.5, "yaw": 0.0, "scale": 0.95, "collider": True},
            {"x": -5.6, "z": -39.5, "yaw": 0.0, "scale": 0.95, "collider": True},
            {"x": 5.6, "z": -39.5, "yaw": 0.0, "scale": 0.95, "collider": True},
            {"x": -4.8, "z": -116.5, "yaw": 0.0, "scale": 1.0, "collider": True},
            {"x": 4.8, "z": -116.5, "yaw": 0.0, "scale": 1.0, "collider": True},
        ],
        "sv_prop_timber_scaffold.glb": [
            {"x": -6.8, "z": -3.8, "yaw": HP, "scale": 1.0, "collider": True},
            {"x": -40.5, "z": -24.0, "yaw": 0.2, "scale": 0.95, "collider": True},
        ],
        "prop_barrel.glb": [
            {"x": 2.4, "z": 27.6, "yaw": 0.5, "scale": 1.0, "collider": True},
            {"x": 4.4, "z": -1.0, "yaw": 0.3, "scale": 1.02, "collider": True},
            {"x": -10.8, "z": -27.5, "yaw": 0.4, "scale": 1.0},
            {"x": -29.2, "z": -47.0, "yaw": 0.8, "scale": 1.04},
            {"x": 25.8, "z": -53.2, "yaw": 1.1, "scale": 1.0},
            {"x": -9.2, "z": -113.0, "yaw": 0.2, "scale": 1.02},
        ],
        "prop_crate.glb": [
            {"x": 3.6, "z": 27.5, "yaw": 0.2, "scale": 1.05, "collider": True},
            {"x": -3.8, "z": -1.5, "yaw": -0.3, "scale": 0.96, "collider": True},
            {"x": -28.6, "z": -48.6, "yaw": 0.35, "scale": 1.04},
            {"x": 25.6, "z": -55.0, "yaw": -0.2, "scale": 1.0},
            {"x": 9.2, "z": -113.0, "yaw": 0.4, "scale": 1.05},
        ],
        "prop_cart.glb": [
            {"x": 0.2, "z": 28.0, "yaw": -0.25, "scale": 1.0, "collider": True},
            {"x": 7.6, "z": -22.2, "yaw": 0.72, "scale": 0.95, "collider": True},
            {"x": -26.2, "z": -51.5, "yaw": 0.25, "scale": 1.0, "collider": True},
            {"x": -7.2, "z": -119.0, "yaw": -0.3, "scale": 1.0, "collider": True},
        ],
        "prop_trough.glb": [
            {"x": -4.8, "z": 15.8, "yaw": 0.12, "scale": 1.0, "collider": True},
        ],
        "prop_bench.glb": [
            {"x": -5.0, "z": -35.0, "yaw": HP, "scale": 1.0, "collider": True},
            {"x": 5.0, "z": -35.0, "yaw": -HP, "scale": 1.0, "collider": True},
            {"x": 36.8, "z": -43.2, "yaw": 0.0, "scale": 1.0, "collider": True},
            {"x": 0.0, "z": -82.5, "yaw": 0.0, "scale": 1.05, "collider": True},
        ],
        "prop_sack.glb": [
            {"x": 10.6, "z": -28.8, "yaw": 0.4, "scale": 1.05},
            {"x": -9.8, "z": -42.5, "yaw": -0.5, "scale": 1.0},
            {"x": -29.8, "z": -45.5, "yaw": 0.3, "scale": 1.05},
        ],
        "prop_amphora.glb": [
            {"x": 10.2, "z": -37.2, "yaw": 0.2, "scale": 1.08},
            {"x": 36.2, "z": -48.5, "yaw": 0.9, "scale": 1.02},
        ],
        "prop_lantern_post.glb": [
            {"x": -3.2, "z": 20.5, "yaw": 0.0, "scale": 1.0},
            {"x": -3.2, "z": 10.0, "yaw": 0.0, "scale": 1.0},
            {"x": 3.4, "z": 1.5, "yaw": PI, "scale": 1.0},
            {"x": -3.4, "z": -9.2, "yaw": 0.0, "scale": 1.0},
            {"x": 5.2, "z": -22.0, "yaw": PI, "scale": 1.0},
            {"x": -23.5, "z": -38.0, "yaw": 0.0, "scale": 1.0},
            {"x": 23.5, "z": -38.0, "yaw": PI, "scale": 1.0},
            {"x": -3.6, "z": -85.0, "yaw": 0.0, "scale": 1.0},
            {"x": 3.6, "z": -85.0, "yaw": PI, "scale": 1.0},
        ],
        "prop_debris_cluster.glb": [
            {"x": -2.8, "z": 7.8, "yaw": 0.4, "scale": 1.0},
            {"x": 2.9, "z": -7.5, "yaw": 1.6, "scale": 1.0},
            {"x": -4.4, "z": -44.0, "yaw": 0.8, "scale": 1.0},
            {"x": 4.4, "z": -44.0, "yaw": 2.2, "scale": 1.0},
        ],
    }

    # =========================================================================
    # VIRTUAL WARM POINT LIGHTS ACROSS ALL 8 CELLS (Dynamically Pooled to <= 6 GPU Lights!)
    # =========================================================================
    lights = [
        {"id": "l_barbican_gate", "cellId": "cell_01_barbican_gate", "position": {"x": -6.2, "y": 4.4, "z": 31.2}, "color": "#ffb25a", "intensity": 8.5, "distance": 16.0},
        {"id": "l_inner_gate", "cellId": "cell_01_barbican_gate", "position": {"x": 0.0, "y": 4.6, "z": 13.8}, "color": "#ffb25a", "intensity": 8.0, "distance": 17.0},
        {"id": "l_tavern_hearth", "cellId": "cell_02_trade_street", "position": {"x": 11.4, "y": 3.2, "z": -1.8}, "color": "#ff9e4a", "intensity": 10.5, "distance": 14.0, "alwaysOn": True},
        {"id": "l_apothecary_warm", "cellId": "cell_02_trade_street", "position": {"x": -8.2, "y": 2.6, "z": 3.0}, "color": "#ffaa52", "intensity": 7.5, "distance": 12.0, "alwaysOn": True},
        {"id": "l_market_shrine", "cellId": "cell_03_market_plaza", "position": {"x": 0.0, "y": 5.8, "z": -48.2}, "color": "#ffaa4f", "intensity": 7.5, "distance": 16.0},
        {"id": "l_market_bakery", "cellId": "cell_03_market_plaza", "position": {"x": 15.6, "y": 5.2, "z": -25.4}, "color": "#ff9842", "intensity": 9.0, "distance": 13.0, "alwaysOn": True},
        {"id": "l_artisan_forge", "cellId": "cell_04_artisan_quarter", "position": {"x": -37.2, "y": 9.0, "z": -34.6}, "color": "#ff7e2e", "intensity": 13.5, "distance": 18.0, "alwaysOn": True},
        {"id": "l_residential_well", "cellId": "cell_05_residential_heights", "position": {"x": 37.2, "y": 9.5, "z": -46.5}, "color": "#ffb35c", "intensity": 8.5, "distance": 15.0},
        {"id": "l_cathedral_altar", "cellId": "cell_06_temple_acropolis", "position": {"x": -11.7, "y": 15.2, "z": -92.5}, "color": "#ffbe6b", "intensity": 11.5, "distance": 18.0, "alwaysOn": True},
        {"id": "l_summit_beacon", "cellId": "cell_06_temple_acropolis", "position": {"x": 0.0, "y": 21.4, "z": -63.8}, "color": "#ff923b", "intensity": 10.5, "distance": 18.0, "alwaysOn": True},
        {"id": "l_castle_bailey", "cellId": "cell_07_lord_castle", "position": {"x": 0.0, "y": 20.5, "z": -115.0}, "color": "#ffab52", "intensity": 9.0, "distance": 18.0},
        {"id": "l_castle_great_hall", "cellId": "cell_07_lord_castle", "position": {"x": 0.0, "y": 23.6, "z": -134.5}, "color": "#ff943d", "intensity": 13.0, "distance": 20.0, "alwaysOn": True},
        {"id": "l_undercroft_south", "cellId": "cell_08_undercroft_cellars", "position": {"x": -12.5, "y": -1.6, "z": -11.5}, "color": "#ff8d38", "intensity": 12.0, "distance": 16.0, "alwaysOn": True},
        {"id": "l_undercroft_north", "cellId": "cell_08_undercroft_cellars", "position": {"x": -12.5, "y": -1.6, "z": -21.5}, "color": "#ff8d38", "intensity": 12.0, "distance": 16.0, "alwaysOn": True},
        {"id": "l_undercroft_cellar", "cellId": "cell_08_undercroft_cellars", "position": {"x": 13.0, "y": -1.8, "z": 14.0}, "color": "#ff9642", "intensity": 11.0, "distance": 15.0, "alwaysOn": True},
        {"id": "l_undercroft_vault", "cellId": "cell_08_undercroft_cellars", "position": {"x": 8.5, "y": -1.6, "z": -121.0}, "color": "#ffa84c", "intensity": 12.5, "distance": 16.0, "alwaysOn": True},
    ]

    # =========================================================================
    # DATA-DRIVEN LORE, BELL ROPE & EXPLORATION REWARD CHESTS ACROSS ALL 8 CELLS
    # =========================================================================
    lore_interactables = [
        {
            "id": "lore:barbican_roster",
            "label": "检视：瓮城曲轴防卫手札 [E]",
            "title": "灰烬城南门瓮城戍卫手札",
            "body": "南外城门故意偏筑于西侧，入城者必先受正北巨塔与折角照壁阻截，须于瓮城院内向东折转九十度方得窥见内门。东侧防卫塔内设双折木梯直登+9.5米城墙步道，西侧石阶则暗通城底泄洪渠。",
            "position": {"x": -7.2, "y": 1.02, "z": 18.2},
            "radius": 3.4,
            "meshKind": "book",
        },
        {
            "id": "lore:ashenhold_charter",
            "label": "阅读：灰烬城八区舆图宪章 [E]",
            "title": "灰烬城山堡八大城区宪章",
            "body": "灰烬城依山势辟为八重箱庭：南麓曲轴瓮城、贸易街与余烬酒馆、中央拱廊市集、西翼铁砧工匠区、东翼阶梯居民高地、圣伊格尼斯大圣堂与钟楼、山巅领主城堡，以及贯通地底的黑石暗渠与秘库。",
            "position": {"x": -6.2, "y": 4.8, "z": -23.4},
            "radius": 3.5,
            "meshKind": "board",
        },
        {
            "id": "lore:undercroft_journal",
            "label": "检查：暗渠石匠的潮湿日志 [E]",
            "title": "黑石排水暗渠与秘库修筑志",
            "body": "暗渠南起瓮城西壁，东支通余烬酒馆地下酒窖，主渠向北直抵市集西南井口；至于东壁铁栅后的北向长隧，则深潜于圣堂山腹之下，直连领主城堡军械库的四折岩井密道。",
            "position": {"x": -13.8, "y": -3.1, "z": -16.8},
            "radius": 3.4,
            "meshKind": "book",
        },
        {
            "id": "lore:tavern_ledger",
            "label": "翻阅：余烬与酒杯旅店住客名册 [E]",
            "title": "余烬与酒杯旅店 · 二层廊桥与酒窖记事",
            "body": "二楼北门既可登跨街哥特石桥，亦可东渡石廊直入居民高地；后院货栈之下的酒窖则常年冰凉，守夜人偶闻窖底传来暗渠流水回响。",
            "position": {"x": 10.8, "y": 2.72, "z": -6.1},
            "radius": 3.0,
            "meshKind": "book",
        },
        {
            "id": "lore:artisan_forge_codex",
            "label": "阅读：铁砧大锻坊淬火铭文 [E]",
            "title": "灰烬锻铁行会炉火律",
            "body": "西翼山风助燃双烟囱大锻炉，凡守望者重剑与城防铁栅皆出于此。由锻坊二楼阁楼外栈道可直跨市集西拱廊城墙。",
            "position": {"x": -31.8, "y": 8.05, "z": -32.2},
            "radius": 3.4,
            "meshKind": "board",
        },
        {
            "id": "lore:residential_diary",
            "label": "翻阅：石井内院居民的旧日记 [E]",
            "title": "织坊高地古井小院记事",
            "body": "穿过阶梯窄巷的低矮过街楼，便是外人难觅的古井内院。若从织锦匠宅邸一楼登梯至二楼卧室，还可踏过巷上木廊桥直登东侧上层石台。",
            "position": {"x": 41.8, "y": 8.45, "z": -49.2},
            "radius": 3.2,
            "meshKind": "book",
        },
        {
            "id": "lore:cathedral_chronicle",
            "label": "查阅：圣堂古卷档案馆秘录 [E]",
            "title": "圣伊格尼斯圣堂与山巅御道纪略",
            "body": "圣堂西侧钟楼高耸入云，拾级三折可达+24.2米钟亭敲响青铜晨钟；中层+19.5米石廊更凌空架设天桥，南接悬崖瞭望塔顶，北连领主城堡外护墙。",
            "position": {"x": 12.2, "y": 13.25, "z": -86.8},
            "radius": 3.5,
            "meshKind": "book",
        },
        {
            "id": "lore:summit_beacon",
            "label": "检视：+19.5米北瞭望塔烽火志 [E]",
            "title": "灰烬边堡中枢烽火台",
            "body": "立于+19.5米悬崖堡垒之巅，向南可俯瞰拱廊市集与双城门，向北可踏高架石桥直通圣堂钟楼中廊与领主城堡城垛。",
            "position": {"x": 0.0, "y": 20.6, "z": -64.2},
            "radius": 3.6,
            "meshKind": "board",
        },
        {
            "id": "lore:castle_decree",
            "label": "阅读：灰烬领主议事厅军令 [E]",
            "title": "灰烬领主山巅议事厅戍边令",
            "body": "北方古代墓穴异动频仍，禁卫军须日夜巡视外庭院与+30.5米主堡王冠塔台。军械库东壁暗井钥匙由军需官掌管，战时可直通城底秘库。",
            "position": {"x": 0.0, "y": 22.4, "z": -138.8},
            "radius": 3.6,
            "meshKind": "book",
        },
    ]

    city_chests = [
        {
            "id": "chest:barbican_tower",
            "label": "开启：瓮城防卫塔战备箱",
            "position": {"x": 14.3, "y": 4.82, "z": 25.4},
            "gold": 40,
            "items": [{"itemId": "minor_health_potion", "quantity": 2}],
        },
        {
            "id": "chest:tavern_wine_cellar",
            "label": "开启：酒馆地窖走私木箱",
            "position": {"x": 12.4, "y": -3.95, "z": 14.8},
            "gold": 55,
            "items": [{"itemId": "mana_potion", "quantity": 2}],
        },
        {
            "id": "chest:residential_heirloom",
            "label": "开启：古井内院传家木匣",
            "position": {"x": 43.0, "y": 7.62, "z": -50.6},
            "gold": 65,
            "items": [{"itemId": "ashen_amulet", "quantity": 1}],
        },
        {
            "id": "chest:castle_armory",
            "label": "开启：领主军械库精钢箱",
            "position": {"x": 12.6, "y": 18.10, "z": -115.2},
            "gold": 95,
            "items": [{"itemId": "citadel_knights_greatsword", "quantity": 1}],
        },
        {
            "id": "chest:royal_secret_vault",
            "label": "开启：灰烬王室地下秘库金箱",
            "position": {"x": 8.5, "y": -3.95, "z": -122.4},
            "gold": 160,
            "items": [
                {"itemId": "sovereign_ember_ring", "quantity": 1},
                {"itemId": "greater_health_potion", "quantity": 2},
            ],
        },
    ]

    bell_interactables = [
        {
            "id": "bell:cathedral_belfry",
            "label": "敲响：圣伊格尼斯钟楼青铜大钟 (+24.2m)",
            "position": {"x": -22.1, "y": 24.25, "z": -92.2},
            "radius": 3.8,
        }
    ]

    portals = {
        "toRavendale": {
            "position": {"x": -10.6, "y": 0.0, "z": 35.0},
            "targetPosition": PHASE1_CFG["portals"]["toRavendale"]["targetPosition"],
            "targetYaw": PHASE1_CFG["portals"]["toRavendale"]["targetYaw"],
            "label": PHASE1_CFG["portals"]["toRavendale"]["label"],
        }
    }

    return {
        "bounds": {
            "explorable": {"minX": -48, "maxX": 48, "minZ": -145, "maxZ": 38},
            "verticalLayers": [-4.0, 0.0, 3.5, 7.0, 7.5, 9.5, 11.0, 12.2, 18.0, 19.5, 21.0, 24.2, 30.5],
        },
        "spawnPoint": {"x": -6.2, "y": 0.35, "z": 34.8},
        "spawnYaw": 0.0,
        "portals": portals,
        "architecture": architecture,
        "propBatches": prop_batches,
        "lights": lights,
        "loreInteractables": lore_interactables,
        "cityChests": city_chests,
        "bellInteractables": bell_interactables,
    }


def main() -> None:
    layout = build_layout()
    out_path = ROOT / "src/data/cityLayout.json"
    out_path.write_text(json.dumps(layout, indent=2, ensure_ascii=False), encoding="utf-8")

    # Sync spawnPoint & return portal into cityPhase1Config.json so GameApp.enterCity() spawns outside Outer Barbican Gate!
    PHASE1_CFG["spawnPoint"] = layout["spawnPoint"]
    PHASE1_CFG["spawnYaw"] = layout["spawnYaw"]
    PHASE1_CFG["portals"]["toRavendale"]["position"] = layout["portals"]["toRavendale"]["position"]
    PHASE1_CFG_PATH.write_text(json.dumps(PHASE1_CFG, indent=2, ensure_ascii=False), encoding="utf-8")

    explorable = sum(1 for a in layout["architecture"] if a.get("tier") != "decorative")
    interiors = sum(1 for a in layout["architecture"] if a.get("isInterior"))
    prop_total = sum(len(v) for v in layout["propBatches"].values())
    print(
        f"[build_v5_layout] Wrote {out_path}: {explorable} explorable architecture entries ({interiors} interior packs), "
        f"{prop_total} props, {len(layout['lights'])} virtual lights, {len(layout['loreInteractables'])} lore points, "
        f"{len(layout['cityChests'])} chests."
    )


if __name__ == "__main__":
    main()
