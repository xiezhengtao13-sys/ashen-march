#!/usr/bin/env python3
"""
Builds src/data/cityLayout.json for Ashenhold Visual Fidelity V3:
Stormveil-Inspired Grounded Gothic Mountain Citadel (`feature/ashenhold-art-direction-v3`).

4 Truly Interconnected Walkable Vertical Layers (Zero Teleports):
  - Layer 1 (-4.0m): Vaulted Stone Undercroft & Drainage Cistern (sv_hero_undercroft.glb)
  - Layer 2 (0.0m -> +3.5m): Monumental Gothic South Gatehouse & Watchtower (sv_hero_gate_tower.glb)
      -> Tight Curved Buttressed Alley -> 2-Story Gothic Tavern w/ Open Daylight Windows (sv_hero_tavern_v3.glb)
      -> Compact Multi-Level Gothic Market Arcade & Fountain (+3.5m)
  - Layer 3 (+7.5m -> +9.5m): North Bastion Overlook (+7.5m, sv_hero_market_bastion.glb)
      -> Continuous West Market Battlement Wall Walk (+9.5m)
      -> Monumental Walkable Overhead Gothic Bridge (+9.5m, sv_hero_gothic_bridge.glb)
      -> East Bridge-to-Tavern-2F Stair (+9.5m -> +5.2m) & Gatehouse Guard Stair (+9.5m -> 0.0m)
  - Layer 4 (+19.5m): Cliffside Outer Stairway Ascent (+7.5m -> +13.5m -> +19.5m Citadel Watchtower Summit,
      sv_hero_summit_ascent.glb) overlooking every lower layer!
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT / "public/assets/city/models"
PHASE1_CFG = json.loads((ROOT / "src/data/cityPhase1Config.json").read_text(encoding="utf-8"))
KIT_MANIFEST = json.loads((MODELS_DIR / "kit_manifest.json").read_text(encoding="utf-8"))
HILLSIDE_MANIFEST = json.loads((MODELS_DIR / "hillside_manifest.json").read_text(encoding="utf-8"))
SV_MANIFEST = json.loads((MODELS_DIR / "stormveil_manifest.json").read_text(encoding="utf-8"))

PHASE1_COLLIDERS: dict[str, dict] = {}
for a in PHASE1_CFG["architecture"]:
    PHASE1_COLLIDERS[a["model"]] = {
        "colliders": a.get("colliders", []),
        "cylinderColliders": a.get("cylinderColliders", []),
        "orientedColliders": [],
    }


def get_colliders(model: str) -> dict:
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
    tier: str = "explorable",
    y_mode: str = "fixed",
    y_offset: float = 0.0,
    cull_dist: float = 165.0,
    building_class: str = "A",
    is_interior: bool = False,
    custom_colliders: list | None = None,
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
    if is_interior:
        entry["isInterior"] = True
    if tier != "decorative":
        c_boxes = custom_colliders if custom_colliders is not None else cols.get("colliders", [])
        if c_boxes:
            entry["colliders"] = c_boxes
        if cols.get("cylinderColliders"):
            entry["cylinderColliders"] = cols["cylinderColliders"]
        if cols.get("orientedColliders"):
            entry["orientedColliders"] = cols["orientedColliders"]
    return entry


def build_layout() -> dict:
    architecture: list[dict] = []

    # =========================================================================
    # 1. HERO CITADEL CORE — 4 INTERCONNECTED VERTICAL LAYERS (-4m .. +19.5m!)
    # =========================================================================
    architecture.extend([
        # HERO 1: South Gothic Gatehouse, West Watchtower (+17.8m), East Conical Turret & +9.5m Battlement Deck + Guard Stair
        arch("sv_south_gate_tower", "sv_hero_gate_tower.glb", 0.0, 0.0, 12.2, 0.0, "ashenhold_gate", cull_dist=280),

        # HERO 2: Monumental Overhead Pointed Gothic Bridge (+9.5m), West Curtain Battlement Walk & East Bridge->Tavern 2F Stair
        arch("sv_overhead_gothic_bridge", "sv_hero_gothic_bridge.glb", 0.0, 0.0, -14.5, 0.0, "ashenhold_main_street", cull_dist=260),

        # HERO 3: Market North Sculpted Bastion Wall (Cam F 1m Showcase!), Twin Switchback Stairs (+3.5->+7.5m),
        #         West Rampart Climb (+7.5->+9.5m) & Continuous West Gothic Market Arcade + Battlement Walk!
        arch("sv_market_north_bastion", "sv_hero_market_bastion.glb", 0.0, 3.50, -51.0, 0.0, "ashenhold_market_plaza", cull_dist=280),

        # HERO 4: Cliffside Outer Stairway Ascent (+7.5m -> +13.5m Mid-Cliff -> +19.5m Citadel Watchtower Summit Platform!)
        arch("sv_summit_watchtower_ascent", "sv_hero_summit_ascent.glb", 0.0, 7.50, -55.0, 0.0, "ashenhold_temple_acropolis", cull_dist=340),

        # HERO 5: Sub-Level (-4.0m) Vaulted Stone Undercroft & Drainage Cistern + South & North Stone Stairwells!
        arch("sv_undercroft_cistern", "sv_hero_undercroft.glb", -12.5, -4.00, -17.0, 0.0, "ashenhold_main_street", cull_dist=180),

        # HERO 6: 2-Story Stormveil Stone-and-Oak Tavern w/ Open Daylight Mullioned Windows (Cam E!) + 1F->2F->Bridge Link!
        arch("sv_tavern_shell", "sv_hero_tavern_v3.glb", 9.2, 1.56, -3.2, -HP, "ashenhold_main_street", cull_dist=200),
        arch("sv_tavern_interior", "sv_hero_tavern_v3_interior.glb", 9.2, 1.56, -3.2, -HP, "ashenhold_main_street", cull_dist=28, is_interior=True),
    ])

    # =========================================================================
    # 2. TIGHT CURVED TRADE ALLEY & MARKET ARCADE ENCLOSING STRUCTURES
    # =========================================================================
    architecture.extend([
        # East Trade Alley Guard Shed & Sculpted Buttress Framing Walls
        arch("b2_carter_shed", "hillside_carter_shed_b2.glb", 8.4, 0.52, 6.8, -HP, "ashenhold_main_street", building_class="B"),
        arch("sv_east_alley_wall", "sv_hero_buttress_wall_12m.glb", 14.8, 0.2, 2.0, -HP, "ashenhold_main_street"),
        arch("sv_south_wall_w1", "sv_hero_buttress_wall_12m.glb", -22.5, 0.4, 12.4, 0.0, "ashenhold_gate", cull_dist=260),
        arch("sv_south_wall_e1", "sv_hero_buttress_wall_12m.glb", 22.5, 0.4, 12.4, 0.0, "ashenhold_gate", cull_dist=260),

        # Compact Central Market Plaza (+3.5m): Phoenix Fountain Centerpiece + East Bakery + Tight Stalls + Buttressed East Wall
        arch("landmark_market_fountain", "landmark_market_fountain.glb", 0.0, 3.85, -35.0, 0.0, "ashenhold_market_plaza", cull_dist=240),
        arch("landmark_market_pillar", "landmark_market_pillar.glb", -6.2, 3.50, -23.4, 0.35, "ashenhold_market_plaza", cull_dist=200),
        arch("bldg_market_bakery", "bldg_bakery.glb", 14.8, 3.50, -27.5, -HP, "ashenhold_market_plaza", building_class="A"),
        arch("c_market_e_north", "hillside_c_narrow_c.glb", 15.0, 3.50, -40.2, -HP, "ashenhold_market_plaza", building_class="C"),
        arch("sv_east_market_wall_s", "sv_hero_buttress_wall_12m.glb", 18.8, 3.50, -24.5, -HP, "ashenhold_market_plaza"),
        arch("sv_east_market_wall_n", "sv_hero_buttress_wall_12m.glb", 18.8, 3.50, -39.5, -HP, "ashenhold_market_plaza"),

        # Walkable Apothecary tucked cleanly into West Market North-West terrace bay (leaves Undercroft exit at (-9.3, -36.8) clear!)
        arch("a3_apothecary_shell", "hillside_apothecary_a3.glb", -21.0, 7.00, -40.5, HP, "ashenhold_artisan_quarter", building_class="A"),
        arch("a3_apothecary_interior", "hillside_apothecary_a3_interior.glb", -21.0, 7.00, -40.5, HP, "ashenhold_artisan_quarter", cull_dist=28, is_interior=True),

        # 6 Compact Market Stalls arranged around Fountain (keeping North Undercroft portal [-9.3, -36.8] & sightlines open!)
        arch("stall_01_bakery", "stall_01_bakery.glb", 9.0, 3.50, -27.2, -HP, "ashenhold_market_plaza", building_class="B"),
        arch("stall_02_produce", "stall_02_produce.glb", -9.2, 3.50, -28.0, HP, "ashenhold_market_plaza", building_class="B"),
        arch("stall_04_pottery", "stall_04_pottery.glb", 9.0, 3.50, -35.6, -HP, "ashenhold_market_plaza", building_class="B"),
        arch("stall_07_drapery", "stall_07_drapery.glb", 8.2, 3.50, -42.4, -HP * 0.65, "ashenhold_market_plaza", building_class="B"),
        arch("stall_06_spices", "stall_06_spices.glb", -8.0, 3.50, -43.0, HP * 0.65, "ashenhold_market_plaza", building_class="B"),
        arch("stall_08_jeweler", "stall_08_jeweler.glb", -4.4, 3.50, -24.2, 0.25, "ashenhold_market_plaza", building_class="B"),
    ])

    # =========================================================================
    # 3. CRAGGY MOUNTAIN CLIFF OUTCROPS & DISTANT CITADEL SKYLINE (Stormveil Massing)
    # =========================================================================
    architecture.extend([
        # Sculpted Mountain Crag Outcrops hugging the flanks of the Citadel!
        arch("crag_west_gate", "sv_hero_crag_outcrop.glb", -22.5, -0.5, 6.0, 0.4, "ashenhold_gate", cull_dist=280),
        arch("crag_east_gate", "sv_hero_crag_outcrop.glb", 22.8, -0.5, 5.5, -0.6, "ashenhold_gate", cull_dist=280),
        arch("crag_west_mid", "sv_hero_crag_outcrop.glb", -22.5, 2.5, -18.0, 1.1, "ashenhold_artisan_quarter", cull_dist=280),
        arch("crag_east_mid", "sv_hero_crag_outcrop.glb", 23.5, 2.5, -16.0, -0.9, "ashenhold_residential_quarter", cull_dist=280),
        arch("crag_west_north", "sv_hero_crag_outcrop.glb", -21.5, 6.5, -56.0, 0.7, "ashenhold_artisan_quarter", cull_dist=320),
        arch("crag_east_north", "sv_hero_crag_outcrop.glb", 21.5, 6.5, -56.0, -0.8, "ashenhold_residential_quarter", cull_dist=320),
        arch("crag_summit_nw", "sv_hero_crag_outcrop.glb", -16.5, 11.5, -70.0, 0.3, "ashenhold_temple_acropolis", cull_dist=360),
        arch("crag_summit_ne", "sv_hero_crag_outcrop.glb", 16.5, 11.5, -70.0, -0.4, "ashenhold_temple_acropolis", cull_dist=360),

        # Upper Terraced Gothic Skyline Silhouettes (West Artisan & East Residential + High Citadel Keep)
        arch("sky_west_smithy", "bldg_smithy.glb", -28.0, 7.0, -28.0, HP, "ashenhold_artisan_quarter", tier="decorative", cull_dist=280),
        arch("sky_west_house", "hillside_c_narrow_b.glb", -28.0, 7.0, -48.0, HP * 0.85, "ashenhold_artisan_quarter", tier="decorative", cull_dist=280),
        arch("sky_east_house1", "hillside_c_narrow_a.glb", 27.5, 7.5, -28.0, -HP, "ashenhold_residential_quarter", tier="decorative", cull_dist=280),
        arch("sky_east_house2", "hillside_c_narrow_b.glb", 27.5, 7.5, -46.0, -HP * 0.85, "ashenhold_residential_quarter", tier="decorative", cull_dist=280),
        arch("sky_citadel_barbican", "castle_barbican_gate.glb", 0.0, 17.5, -94.0, 0.0, "ashenhold_castle_approach", tier="decorative", cull_dist=380),
        arch("sky_citadel_keep", "castle_citadel_keep.glb", 0.0, 21.0, -118.0, 0.0, "ashenhold_castle_approach", tier="decorative", cull_dist=420),
    ])

    # =========================================================================
    # 4. CURATED CLOSE-UP MEDIEVAL & STORMVEIL ENVIRONMENTAL PROPS
    # =========================================================================
    prop_batches: dict[str, list[dict]] = {
        "sv_prop_rubble_pile.glb": [
            {"x": -5.4, "z": 17.6, "yaw": 0.4, "scale": 1.05},
            {"x": 5.8, "z": 17.4, "yaw": -0.8, "scale": 0.98},
            {"x": -3.38, "z": -11.4, "yaw": 1.1, "scale": 0.78},
            {"x": 3.48, "z": -11.6, "yaw": -0.5, "scale": 0.76},
            {"x": -3.8, "z": -49.5, "yaw": 0.2, "scale": 0.96},
            {"x": 3.8, "z": -49.4, "yaw": 2.4, "scale": 0.92},
            {"x": -11.4, "z": -38.5, "yaw": 0.9, "scale": 0.95},
        ],
        "sv_prop_iron_brazier.glb": [
            {"x": -3.4, "z": 4.5, "yaw": 0.0, "scale": 0.92, "collider": True},
            {"x": 3.6, "z": -9.8, "yaw": 0.0, "scale": 0.92, "collider": True},
            {"x": -5.6, "z": -30.5, "yaw": 0.0, "scale": 0.95, "collider": True},
            {"x": 5.6, "z": -30.5, "yaw": 0.0, "scale": 0.95, "collider": True},
            {"x": -5.6, "z": -39.5, "yaw": 0.0, "scale": 0.95, "collider": True},
            {"x": 5.6, "z": -39.5, "yaw": 0.0, "scale": 0.95, "collider": True},
        ],
        "sv_prop_timber_scaffold.glb": [
            {"x": -6.8, "z": 3.2, "yaw": HP, "scale": 1.0, "collider": True},
            {"x": 11.8, "z": -45.5, "yaw": -HP * 0.4, "scale": 0.95, "collider": True},
        ],
        "prop_barrel.glb": [
            {"x": 4.4, "z": -1.0, "yaw": 0.3, "scale": 1.02, "collider": True},
            {"x": 4.4, "z": -5.4, "yaw": 0.9, "scale": 0.96, "collider": True},
            {"x": -3.6, "z": 6.2, "yaw": 0.6, "scale": 1.0},
            {"x": -10.8, "z": -27.5, "yaw": 0.4, "scale": 1.0},
            {"x": 11.4, "z": -31.0, "yaw": 1.2, "scale": 1.02},
        ],
        "prop_crate.glb": [
            {"x": 4.9, "z": 5.0, "yaw": 0.2, "scale": 1.05, "collider": True},
            {"x": -3.8, "z": -1.5, "yaw": -0.3, "scale": 0.96, "collider": True},
            {"x": 11.6, "z": -24.0, "yaw": 0.4, "scale": 1.0},
            {"x": -6.8, "z": -46.2, "yaw": 0.25, "scale": 1.0},
        ],
        "prop_cart.glb": [
            {"x": 4.6, "z": 8.4, "yaw": -0.35, "scale": 1.0, "collider": True},
            {"x": 7.6, "z": -22.2, "yaw": 0.72, "scale": 0.95, "collider": True},
        ],
        "prop_trough.glb": [
            {"x": -4.6, "z": 18.8, "yaw": 0.12, "scale": 1.0, "collider": True},
        ],
        "prop_bench.glb": [
            {"x": -5.0, "z": -35.0, "yaw": HP, "scale": 1.0, "collider": True},
            {"x": 5.0, "z": -35.0, "yaw": -HP, "scale": 1.0, "collider": True},
        ],
        "prop_sack.glb": [
            {"x": 10.6, "z": -28.8, "yaw": 0.4, "scale": 1.05},
            {"x": -9.8, "z": -42.5, "yaw": -0.5, "scale": 1.0},
        ],
        "prop_amphora.glb": [
            {"x": 10.2, "z": -37.2, "yaw": 0.2, "scale": 1.08},
            {"x": -6.0, "z": -25.4, "yaw": 1.1, "scale": 1.0},
        ],
        "prop_lantern_post.glb": [
            {"x": -3.2, "z": 10.0, "yaw": 0.0, "scale": 1.0},
            {"x": 3.4, "z": 1.5, "yaw": PI, "scale": 1.0},
            {"x": -3.4, "z": -9.2, "yaw": 0.0, "scale": 1.0},
            {"x": 5.2, "z": -22.0, "yaw": PI, "scale": 1.0},
        ],
        "prop_debris_cluster.glb": [
            {"x": -2.8, "z": 7.8, "yaw": 0.4, "scale": 1.0},
            {"x": 2.9, "z": -7.5, "yaw": 1.6, "scale": 1.0},
            {"x": -4.4, "z": -44.0, "yaw": 0.8, "scale": 1.0},
            {"x": 4.4, "z": -44.0, "yaw": 2.2, "scale": 1.0},
        ],
    }

    # =========================================================================
    # 5. STRATEGIC WARM LOCAL POINT LIGHTS (<= 6 GPU BUDGET)
    #    Undercroft (-4m) & Tavern Interior stay warmly lit at 13:00 daylight for dramatic contrast!
    # =========================================================================
    lights = [
        # 1. Tavern 1F Interior Hearth (warm golden fire contrasting against cool 13:00 daylight at Cam E!)
        {"position": {"x": 11.4, "y": 3.2, "z": -1.8}, "color": "#ff9e4a", "intensity": 10.5, "distance": 14.0, "alwaysOn": True},
        # 2. Sub-Level Undercroft South Vault Torches (damp stone specular glint at -4.0m!)
        {"position": {"x": -12.5, "y": -1.6, "z": -11.5}, "color": "#ff8d38", "intensity": 12.0, "distance": 16.0, "alwaysOn": True},
        # 3. Sub-Level Undercroft North Vault Torches
        {"position": {"x": -12.5, "y": -1.6, "z": -21.5}, "color": "#ff8d38", "intensity": 12.0, "distance": 16.0, "alwaysOn": True},
        # 4. South Gatehouse Archway Braziers
        {"position": {"x": 0.0, "y": 4.6, "z": 13.8}, "color": "#ffb25a", "intensity": 8.0, "distance": 17.0},
        # 5. Market North Bastion Shrine & Fountain Warm Accent
        {"position": {"x": 0.0, "y": 5.8, "z": -48.2}, "color": "#ffaa4f", "intensity": 7.5, "distance": 16.0},
        # 6. +19.5m Summit Watchtower Brazier Beacon
        {"position": {"x": 0.0, "y": 21.4, "z": -63.8}, "color": "#ff923b", "intensity": 11.0, "distance": 18.0, "alwaysOn": True},
    ]

    # =========================================================================
    # 6. DATA-DRIVEN LORE & MUNICIPAL INTERACTABLES ACROSS ALL 4 LAYERS
    # =========================================================================
    lore_interactables = [
        {
            "id": "lore:ashenhold_charter",
            "label": "阅读：灰烬城宪章与四层城防图 [E]",
            "title": "灰烬城山堡宪章与四层立体防线",
            "body": "灰烬城依断崖岩骨筑成四重立体防线：地底（-4米）为黑石排水暗渠，可隐秘往返贸易街与市集；底层（0至+3.5米）为南城门、曲折商街、余烬酒馆与拱廊市集；中层（+7.5至+9.5米）由北堡垒平台、西城墙步道与跨街哥特石桥贯通酒馆二层与南门卫塔；顶层（+19.5米）则为悬崖外梯直达的北瞭望塔台。",
            "position": {"x": -6.2, "y": 4.8, "z": -23.4},
            "radius": 3.5,
            "meshKind": "board",
        },
        {
            "id": "lore:undercroft_journal",
            "label": "检查：暗渠石匠的潮湿日志 [E]",
            "title": "黑石排水暗渠修筑志",
            "body": "旧历二一四年，城防石匠在西城墙之下凿出黑石拱顶暗渠，以泄山洪并设铁栅过滤碎石。城破之时，守军曾借此道绕过过街石桥的封锁，直抵中央市集西南石阶。",
            "position": {"x": -13.8, "y": -3.1, "z": -16.8},
            "radius": 3.4,
            "meshKind": "book",
        },
        {
            "id": "lore:tavern_ledger",
            "label": "翻阅：余烬与酒杯旅店住客名册 [E]",
            "title": "余烬与酒杯旅店 · 二层城墙密道记事",
            "body": "二楼北门外的橡木廊桥直通跨街哥特石桥与西城墙步道，原为战时向守城弓手递送热汤与箭矢的捷径。旅人亦可登楼俯瞰整条灰石商街。",
            "position": {"x": 10.8, "y": 2.72, "z": -6.1},
            "radius": 3.0,
            "meshKind": "book",
        },
        {
            "id": "lore:summit_beacon",
            "label": "检视：+19.5米北瞭望塔烽火志 [E]",
            "title": "灰烬边堡最高烽火台",
            "body": "立于+19.5米悬崖堡垒之巅，整座灰烬城的四层防御体系尽收眼底：脚下是拱廊市集与双折石阶，南望可见跨街石桥与南门双塔。烽火燃起时，三十里外的溪谷村亦能望见黑烟。",
            "position": {"x": 0.0, "y": 20.6, "z": -64.2},
            "radius": 3.6,
            "meshKind": "board",
        },
    ]

    return {
        "bounds": {
            "explorable": {"minX": -24, "maxX": 24, "minZ": -70, "maxZ": 22},
            "verticalLayers": [-4.0, 0.0, 3.5, 7.5, 9.5, 19.5],
        },
        "spawnPoint": {"x": 0.0, "y": 0.45, "z": 18.4},
        "spawnYaw": 0.0,
        "portals": PHASE1_CFG["portals"],
        "architecture": architecture,
        "propBatches": prop_batches,
        "lights": lights,
        "loreInteractables": lore_interactables,
    }


def main() -> None:
    layout = build_layout()
    out_path = ROOT / "src/data/cityLayout.json"
    out_path.write_text(json.dumps(layout, indent=2, ensure_ascii=False), encoding="utf-8")
    explorable = sum(1 for a in layout["architecture"] if a.get("tier") != "decorative")
    decorative = sum(1 for a in layout["architecture"] if a.get("tier") == "decorative")
    prop_total = sum(len(v) for v in layout["propBatches"].values())
    print(
        f"[build_v3_layout] Wrote {out_path}: {explorable} explorable + {decorative} decorative architecture entries, "
        f"{prop_total} props across {len(layout['propBatches'])} batches, {len(layout['lights'])} lights, "
        f"{len(layout['loreInteractables'])} lore points."
    )


if __name__ == "__main__":
    main()
