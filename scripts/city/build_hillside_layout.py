#!/usr/bin/env python3
"""
Builds src/data/cityLayout.json for the Ashenhold (灰烬城) Compact Terraced Hillside Redesign
(Phase 2 Sample Slice: ~104m x 144m, 5 Vertical Tiers 0m -> +21m, 3 Full A-Class Interiors
including 2-Story Walkable Tavern + Balcony, 2 B-Class Walkable Structures, Market Bridge Arch,
4.2m North Retaining Wall & Twin Switchback Grand Staircase to +7.5m Overlook, and Mountain Skyline).
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT / "public/assets/city/models"
PHASE1_CFG = json.loads((ROOT / "src/data/cityPhase1Config.json").read_text(encoding="utf-8"))
KIT_MANIFEST = json.loads((MODELS_DIR / "kit_manifest.json").read_text(encoding="utf-8"))
HILLSIDE_MANIFEST = json.loads((MODELS_DIR / "hillside_manifest.json").read_text(encoding="utf-8"))

PHASE1_COLLIDERS: dict[str, dict] = {}
for a in PHASE1_CFG["architecture"]:
    PHASE1_COLLIDERS[a["model"]] = {
        "colliders": a.get("colliders", []),
        "cylinderColliders": a.get("cylinderColliders", []),
        "orientedColliders": [],
    }


def get_colliders(model: str) -> dict:
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
    cull_dist: float = 135.0,
    building_class: str = "C",
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
    # 1. TIER 0 (0.0m -> +1.7m): SOUTH GATEHOUSE & S-CURVED GATEWARD TRADE WARD
    # =========================================================================
    architecture.extend([
        arch("south_gatehouse", "gatehouse.glb", 0.0, 0.0, 14.0, 0.0, "ashenhold_gate", cull_dist=260, building_class="A"),
        arch("bastion_west", "bastion_tower.glb", -12.6, 0.0, 14.3, 0.0, "ashenhold_gate", cull_dist=260),
        arch("bastion_east", "bastion_tower.glb", 12.6, 0.0, 14.3, 0.0, "ashenhold_gate", cull_dist=260),
        # South Perimeter Curtain Walls sealing Tier 0 flanks out to x = ±51
        arch("wall_south_w1", "perimeter_curtain_wall.glb", -27.5, 0.5, 14.4, 0.0, "ashenhold_gate", cull_dist=260),
        arch("wall_south_w2", "perimeter_curtain_wall.glb", -45.5, 1.8, 14.4, 0.0, "ashenhold_gate", cull_dist=260),
        arch("wall_south_e1", "perimeter_curtain_wall.glb", 27.5, 0.5, 14.4, 0.0, "ashenhold_gate", cull_dist=260),
        arch("wall_south_e2", "perimeter_curtain_wall.glb", 45.5, 1.8, 14.4, 0.0, "ashenhold_gate", cull_dist=260),

        # A1: South Gate Guardhouse (Full Walkable Interior, West of Trade Street, faces East yaw=+HP)
        arch("a1_guardhouse", "hillside_guardhouse_a1.glb", -7.4, 0.65, 5.5, HP, "ashenhold_main_street", building_class="A"),
        # B1: South Gate Caravan Warehouse (B-Class Walkable Cargo Hall, West side, faces East yaw=+HP)
        arch("b1_warehouse", "hillside_warehouse_b1.glb", -8.4, 1.56, -4.5, HP, "ashenhold_main_street", building_class="B"),
        # B2: Carter Rain Shelter & Repair Shed (B-Class Open Shelter, East side, faces West yaw=-HP)
        arch("b2_carter_shed", "hillside_carter_shed_b2.glb", 7.8, 0.55, 6.8, -HP, "ashenhold_main_street", building_class="B"),
        # A2: Ember & Flagon Double-Story Inn & Tavern (2-Floor Walkable Interior + Street Balcony!)
        arch("a2_tavern_shell", "hillside_tavern_a2.glb", 8.8, 1.56, -3.2, -HP, "ashenhold_main_street", building_class="A"),
        arch("a2_tavern_interior", "hillside_tavern_a2_interior.glb", 8.8, 1.56, -3.2, -HP, "ashenhold_main_street", cull_dist=28, building_class="A", is_interior=True),

        # Compact C-Class Framing Houses tucking tightly along Tier 0/1 transition flanks
        arch("c_trade_nw", "hillside_c_narrow_a.glb", -9.2, 1.65, -12.6, 0.52, "ashenhold_main_street"),
        arch("c_trade_ne", "hillside_c_narrow_b.glb", 9.4, 1.65, -12.4, -0.52, "ashenhold_main_street"),
        # Steep retaining flank walls framing behind Tier 0 buildings up toward Tier 2 wings
        arch("retain_t0_west", "hillside_terrace_wall_16m.glb", -16.5, 1.0, 2.0, HP, "ashenhold_main_street"),
        arch("retain_t0_east", "hillside_terrace_wall_16m.glb", 16.8, 1.0, 2.0, -HP, "ashenhold_main_street"),
    ])

    # =========================================================================
    # 2. TIER 0 -> TIER 1 VERTICAL PORTAL: MARKET COVERED BRIDGE-ARCH
    # =========================================================================
    architecture.append(
        arch("market_bridge_arch", "hillside_market_bridge_arch.glb", 0.0, 1.72, -15.0, 0.0, "ashenhold_market_plaza", cull_dist=200, building_class="A")
    )

    # =========================================================================
    # 3. TIER 1 (+3.5m): COMPACT CENTRAL MARKET TERRACE (26m x 28m)
    # =========================================================================
    architecture.extend([
        # Centerpiece Landmark Fountain (+3.85m dais) + Municipal Charter Pillar
        arch("landmark_market_fountain", "landmark_market_fountain.glb", 0.0, 3.85, -35.0, 0.0, "ashenhold_market_plaza", cull_dist=220),
        arch("landmark_market_pillar", "landmark_market_pillar.glb", -7.2, 3.50, -23.6, 0.35, "ashenhold_market_plaza", cull_dist=180),

        # A3: Iron Anchor Apothecary & Alchemy Hall (Full Walkable Interior, Market SW, faces East!)
        arch("a3_apothecary_shell", "hillside_apothecary_a3.glb", -14.6, 3.50, -28.0, HP, "ashenhold_market_plaza", building_class="A"),
        arch("a3_apothecary_interior", "hillside_apothecary_a3_interior.glb", -14.6, 3.50, -28.0, HP, "ashenhold_market_plaza", cull_dist=28, building_class="A", is_interior=True),

        # Compact Perimeter Shops & Narrow Terraced Houses tightly enclosing Market Terrace
        arch("bldg_market_bakery", "bldg_bakery.glb", 15.6, 3.50, -27.5, -HP, "ashenhold_market_plaza", building_class="A"),
        arch("c_market_w_north", "hillside_c_narrow_b.glb", -15.4, 3.50, -40.5, HP, "ashenhold_market_plaza"),
        arch("c_market_e_north", "hillside_c_narrow_c.glb", 15.4, 3.50, -40.5, -HP, "ashenhold_market_plaza"),
        arch("c_market_sw_corner", "hillside_c_narrow_c.glb", -13.6, 3.50, -19.8, 0.65, "ashenhold_market_plaza"),
        arch("c_market_se_corner", "hillside_c_narrow_a.glb", 13.6, 3.50, -19.8, -0.65, "ashenhold_market_plaza"),

        # 6 Distinct Compact Market Stalls arranged around the Phoenix Fountain
        arch("stall_01_bakery", "stall_01_bakery.glb", 9.6, 3.50, -27.4, -HP, "ashenhold_market_plaza", building_class="B"),
        arch("stall_02_produce", "stall_02_produce.glb", -9.2, 3.50, -35.6, HP, "ashenhold_market_plaza", building_class="B"),
        arch("stall_04_pottery", "stall_04_pottery.glb", 9.6, 3.50, -35.6, -HP, "ashenhold_market_plaza", building_class="B"),
        arch("stall_06_spices", "stall_06_spices.glb", -8.4, 3.50, -42.4, HP * 0.65, "ashenhold_market_plaza", building_class="B"),
        arch("stall_07_drapery", "stall_07_drapery.glb", 8.4, 3.50, -42.4, -HP * 0.65, "ashenhold_market_plaza", building_class="B"),
        arch("stall_08_jeweler", "stall_08_jeweler.glb", -4.6, 3.50, -24.2, 0.25, "ashenhold_market_plaza", building_class="B"),
    ])

    # =========================================================================
    # 4. TIER 1 -> TIER 2: 4.2m NORTH RETAINING WALL & TWIN GRAND STAIRCASE (+3.5m -> +7.5m!)
    # =========================================================================
    architecture.extend([
        arch("market_north_retaining_stairs", "hillside_retaining_staircase.glb", 0.0, 3.50, -51.5, 0.0, "ashenhold_market_plaza", cull_dist=240, building_class="A"),
        # Stepped ashlar terrace retaining walls elevating Tier 2 West & East wings +4m above Market!
        arch("retain_market_west_s", "hillside_terrace_wall_16m.glb", -20.5, 3.50, -26.0, HP, "ashenhold_artisan_quarter", cull_dist=200),
        arch("retain_market_west_n", "hillside_terrace_wall_16m.glb", -20.5, 3.50, -42.0, HP, "ashenhold_artisan_quarter", cull_dist=200),
        arch("retain_market_east_s", "hillside_terrace_wall_16m.glb", 20.5, 3.50, -26.0, -HP, "ashenhold_residential_quarter", cull_dist=200),
        arch("retain_market_east_n", "hillside_terrace_wall_16m.glb", 20.5, 3.50, -42.0, -HP, "ashenhold_residential_quarter", cull_dist=200),

        # Clean Medieval Guard Barricades on the +7.5m Overlook Terrace marking Phase 3/4 expansion gates
        arch("barricade_west_artisan", "hillside_guard_barricade.glb", -16.2, 7.50, -56.5, HP, "ashenhold_market_plaza", tier="phase3_gate"),
        arch("barricade_east_residential", "hillside_guard_barricade.glb", 16.2, 7.50, -56.5, -HP, "ashenhold_market_plaza", tier="phase3_gate"),
        arch("barricade_north_acropolis", "hillside_guard_barricade.glb", 0.0, 7.50, -61.8, 0.0, "ashenhold_market_plaza", tier="phase4_gate"),
        # Low stone retaining curbs enclosing +7.5m Overlook back wall up to Tier 3 (+12.2m)
        arch("retain_t3_center", "hillside_terrace_wall_16m.glb", 0.0, 7.80, -68.5, 0.0, "ashenhold_temple_acropolis", cull_dist=240),
        arch("retain_t3_west", "hillside_terrace_wall_16m.glb", -16.0, 7.80, -68.5, 0.0, "ashenhold_temple_acropolis", cull_dist=240),
        arch("retain_t3_east", "hillside_terrace_wall_16m.glb", 16.0, 7.80, -68.5, 0.0, "ashenhold_temple_acropolis", cull_dist=240),
    ])

    # =========================================================================
    # 5. TIER 2 UPPER WINGS (+7.0m WEST ARTISAN / +7.5m EAST RESIDENTIAL SKYLINE)
    #    Visible terraced rooftops, brick chimneys & plaster balconies towering over Market!
    # =========================================================================
    architecture.extend([
        # West Wing (+7.0m): Dark Stone + Red Brick Chimneys Artisan Silhouette
        arch("wing_w_smithy", "bldg_smithy.glb", -28.5, 7.0, -44.0, HP * 0.85, "ashenhold_artisan_quarter", tier="phase3_preview", cull_dist=180),
        arch("wing_w_cooperage", "bldg_cooperage.glb", -27.5, 7.0, -29.0, HP, "ashenhold_artisan_quarter", tier="phase3_preview", cull_dist=180),
        arch("wing_w_tannery", "bldg_tannery.glb", -32.0, 7.2, -59.0, 0.35, "ashenhold_artisan_quarter", tier="phase3_preview", cull_dist=180),
        arch("wing_w_row_a", "bldg_artisan_row_a.glb", -41.0, 7.4, -36.0, HP, "ashenhold_artisan_quarter", tier="phase3_preview", cull_dist=180),
        arch("wing_w_narrow", "hillside_c_narrow_b.glb", -26.0, 7.0, -14.0, 0.45, "ashenhold_artisan_quarter", tier="phase3_preview", cull_dist=180),

        # East Wing (+7.5m): Bright Cream/Sage Plaster + Balconies + Clay Roofs Residential Heights
        arch("wing_e_weaver", "bldg_weaver_hall.glb", 28.5, 7.5, -44.0, -HP * 0.85, "ashenhold_residential_quarter", tier="phase3_preview", cull_dist=180),
        arch("wing_e_res_tall", "bldg_res_tall_a.glb", 27.5, 7.5, -28.0, -HP, "ashenhold_residential_quarter", tier="phase3_preview", cull_dist=180),
        arch("wing_e_narrow_1", "hillside_c_narrow_a.glb", 32.0, 8.0, -58.0, -0.35, "ashenhold_residential_quarter", tier="phase3_preview", cull_dist=180),
        arch("wing_e_narrow_2", "hillside_c_narrow_c.glb", 40.5, 8.2, -38.0, -HP, "ashenhold_residential_quarter", tier="phase3_preview", cull_dist=180),
        arch("wing_e_narrow_3", "hillside_c_narrow_a.glb", 26.0, 7.2, -14.0, -0.45, "ashenhold_residential_quarter", tier="phase3_preview", cull_dist=180),
    ])

    # =========================================================================
    # 6. TIER 3 TEMPLE ACROPOLIS (+12.2m) & TIER 4 CITADEL KEEP (+18m -> +53m!)
    # =========================================================================
    architecture.extend([
        # Tier 3 Acropolis Landmarks (+12.2m — St. Ignis Bell-Tower Temple + Guild Hall)
        arch("acropolis_temple_a7", "bldg_market_chapel.glb", -5.2, 12.2, -82.0, 0.08, "ashenhold_temple_acropolis", tier="phase4_preview", cull_dist=320, building_class="A"),
        arch("acropolis_guild_wing", "bldg_mason_hall.glb", 11.8, 12.2, -84.0, -0.18, "ashenhold_temple_acropolis", tier="phase4_preview", cull_dist=320),
        arch("acropolis_west_flank", "bldg_castle_flank_west.glb", -21.5, 12.2, -86.0, 0.28, "ashenhold_temple_acropolis", tier="phase4_preview", cull_dist=280),
        # Tier 3 -> Tier 4 High Retaining Wall (+12.2m -> +18.0m)
        arch("retain_t4_center", "hillside_terrace_wall_16m.glb", 0.0, 13.8, -104.0, 0.0, "ashenhold_castle_approach", cull_dist=320),
        arch("retain_t4_west", "hillside_terrace_wall_16m.glb", -16.0, 13.8, -104.0, 0.0, "ashenhold_castle_approach", cull_dist=320),
        arch("retain_t4_east", "hillside_terrace_wall_16m.glb", 16.0, 13.8, -104.0, 0.0, "ashenhold_castle_approach", cull_dist=320),

        # Tier 4 Citadel Barbican (+18.0m) & Sovereign High Keep (+21.0m -> +53m peak!)
        arch("castle_barbican_gate", "castle_barbican_gate.glb", 0.0, 18.0, -114.0, 0.0, "ashenhold_castle_approach", tier="landmark_closed", cull_dist=360, building_class="A"),
        arch("castle_citadel_keep", "castle_citadel_keep.glb", 0.0, 21.0, -132.0, 0.0, "ashenhold_castle_approach", tier="landmark_closed", cull_dist=420),
    ])

    # =========================================================================
    # 7. COMPACT PERIMETER CURTAIN WALLS (104m x 144m) & OUTER MOUNTAIN HORIZON
    # =========================================================================
    for idx, wz in enumerate((-2.0, -26.0, -50.0, -74.0, -98.0)):
        wy = 4.0 + idx * 2.4
        architecture.append(arch(f"wall_west_{idx}", "perimeter_curtain_wall.glb", -51.0, wy, wz, HP, "ashenhold_artisan_quarter", cull_dist=280))
        architecture.append(arch(f"wall_east_{idx}", "perimeter_curtain_wall.glb", 51.0, wy, wz, -HP, "ashenhold_residential_quarter", cull_dist=280))
    for idx, wx in enumerate((-38.0, -19.0, 19.0, 38.0)):
        architecture.append(arch(f"wall_north_{idx}", "perimeter_curtain_wall.glb", wx, 15.5, -114.0, 0.0, "ashenhold_castle_approach", cull_dist=320))

    # Decorative outer mountain silhouettes (clearly outside walls)
    for idx, (ox, oy, oz, oyaw) in enumerate([
        (-66.0, 11.0, -32.0, 0.4),
        (-68.0, 15.0, -76.0, 0.9),
        (66.0, 11.5, -32.0, -0.4),
        (68.0, 15.5, -76.0, -0.9),
        (-36.0, 23.0, -142.0, 0.2),
        (36.0, 23.0, -142.0, -0.2),
    ]):
        architecture.append(arch(f"outer_horizon_{idx}", "outer_decorative_horizon.glb", ox, oy, oz, oyaw, "ashenhold_castle_approach", tier="decorative", cull_dist=360))

    # =========================================================================
    # 8. HIGH-DENSITY LIVED-IN PROPS (Instanced Batches across Tier 0, Tier 1 & +7.5m Overlook)
    # =========================================================================
    prop_batches: dict[str, list[dict]] = {
        "prop_cart.glb": [
            {"x": 4.2, "z": 6.4, "yaw": -0.28, "scale": 1.0, "collider": True},   # Outside B2 Carter Shed
            {"x": -4.6, "z": -5.8, "yaw": 0.35, "scale": 0.96, "collider": True},  # Outside B1 Warehouse
            {"x": 6.8, "z": -21.8, "yaw": -0.75, "scale": 0.95, "collider": True}, # Market SE delivery cart
        ],
        "prop_trough.glb": [
            {"x": 4.0, "z": 8.6, "yaw": HP, "scale": 1.0, "collider": True},
        ],
        "prop_lantern_post.glb": [
            # Tier 0 S-curve street warm rhythm
            {"x": -3.4, "z": 9.2, "yaw": 0.0, "scale": 1.0},
            {"x": 4.4, "z": 2.4, "yaw": PI, "scale": 1.0},
            {"x": -4.2, "z": -1.5, "yaw": 0.0, "scale": 1.0},
            {"x": 3.8, "z": -8.8, "yaw": PI, "scale": 1.0},
            # Tier 1 Compact Market Plaza perimeter lanterns
            {"x": -5.6, "z": -21.2, "yaw": 0.3, "scale": 1.0},
            {"x": 5.6, "z": -21.2, "yaw": PI - 0.3, "scale": 1.0},
            {"x": -10.8, "z": -31.8, "yaw": 0.0, "scale": 1.0},
            {"x": 11.0, "z": -31.8, "yaw": PI, "scale": 1.0},
            {"x": -6.8, "z": -46.8, "yaw": 0.4, "scale": 1.0},
            {"x": 6.8, "z": -46.8, "yaw": PI - 0.4, "scale": 1.0},
            # +7.5m Mid-Terrace Overlook lanterns
            {"x": -8.2, "z": -54.5, "yaw": 0.0, "scale": 1.0},
            {"x": 8.2, "z": -54.5, "yaw": PI, "scale": 1.0},
        ],
        "prop_barrel.glb": [
            {"x": -3.8, "z": 3.4, "yaw": 0.4, "scale": 1.0, "collider": True},
            {"x": -4.3, "z": 2.8, "yaw": 1.2, "scale": 0.92},
            {"x": 4.4, "z": -1.2, "yaw": 0.8, "scale": 1.0, "collider": True},
            {"x": 4.9, "z": -0.6, "yaw": 2.1, "scale": 0.94},
            {"x": -4.6, "z": -7.8, "yaw": 0.5, "scale": 1.0, "collider": True},
            {"x": -11.4, "z": -32.8, "yaw": 0.6, "scale": 0.95},
            {"x": 11.4, "z": -32.6, "yaw": 1.8, "scale": 0.95},
            {"x": -11.8, "z": -44.2, "yaw": 0.2, "scale": 1.0, "collider": True},
            {"x": 11.8, "z": -44.2, "yaw": 1.1, "scale": 1.0, "collider": True},
        ],
        "prop_crate.glb": [
            {"x": -4.4, "z": -2.4, "yaw": 0.18, "scale": 1.0, "collider": True},
            {"x": -5.1, "z": -2.1, "yaw": 0.55, "scale": 0.85},
            {"x": 4.6, "z": 4.2, "yaw": -0.25, "scale": 0.95, "collider": True},
            {"x": 11.2, "z": -24.5, "yaw": 0.22, "scale": 0.95, "collider": True},
            {"x": -11.2, "z": -38.8, "yaw": -0.15, "scale": 0.92},
            {"x": 10.6, "z": -39.2, "yaw": 0.42, "scale": 0.92},
        ],
        "prop_sack.glb": [
            {"x": -4.2, "z": -6.8, "yaw": 0.4, "scale": 1.0},
            {"x": 10.4, "z": -25.4, "yaw": -0.5, "scale": 0.95},
            {"x": -9.8, "z": -33.2, "yaw": 0.9, "scale": 0.95},
            {"x": -7.2, "z": -44.4, "yaw": 0.2, "scale": 0.92},
        ],
        "prop_bench.glb": [
            {"x": -5.2, "z": -31.8, "yaw": -0.55, "scale": 1.0, "collider": True},
            {"x": 5.2, "z": -31.8, "yaw": 0.55, "scale": 1.0, "collider": True},
            {"x": -5.2, "z": -38.4, "yaw": -2.55, "scale": 1.0, "collider": True},
            {"x": 5.2, "z": -38.4, "yaw": 2.55, "scale": 1.0, "collider": True},
            {"x": -6.2, "z": -56.2, "yaw": 0.0, "scale": 1.0, "collider": True},
            {"x": 6.2, "z": -56.2, "yaw": 0.0, "scale": 1.0, "collider": True},
        ],
        "prop_planter.glb": [
            {"x": -3.2, "z": 7.8, "yaw": 0.0, "scale": 1.0},
            {"x": 4.2, "z": -6.4, "yaw": 0.2, "scale": 1.0},
            {"x": -4.4, "z": -19.2, "yaw": 0.0, "scale": 1.05},
            {"x": 4.4, "z": -19.2, "yaw": 0.0, "scale": 1.05},
            {"x": -4.2, "z": -48.2, "yaw": 0.0, "scale": 1.05},
            {"x": 4.2, "z": -48.2, "yaw": 0.0, "scale": 1.05},
            {"x": -3.6, "z": -55.2, "yaw": 0.0, "scale": 1.0},
            {"x": 3.6, "z": -55.2, "yaw": 0.0, "scale": 1.0},
        ],
        "prop_bollard.glb": [
            {"x": -3.4, "z": 11.4, "yaw": 0.0, "scale": 1.0, "collider": True},
            {"x": 3.4, "z": 11.4, "yaw": 0.0, "scale": 1.0, "collider": True},
            {"x": -3.2, "z": -11.5, "yaw": 0.0, "scale": 1.0, "collider": True},
            {"x": 3.2, "z": -11.5, "yaw": 0.0, "scale": 1.0, "collider": True},
        ],
        "prop_amphora.glb": [
            {"x": -10.8, "z": -25.6, "yaw": 0.2, "scale": 1.0},
            {"x": 10.6, "z": -33.6, "yaw": 1.1, "scale": 1.05},
            {"x": 7.6, "z": -40.8, "yaw": 0.7, "scale": 1.0},
        ],
        "prop_debris_cluster.glb": [
            {"x": -3.9, "z": 1.2, "yaw": 0.4, "scale": 0.9},
            {"x": 4.1, "z": -7.2, "yaw": 1.3, "scale": 0.9},
            {"x": -12.6, "z": -34.2, "yaw": 2.0, "scale": 1.0},
            {"x": 12.4, "z": -38.0, "yaw": 0.8, "scale": 1.0},
        ],
        "prop_banner_pole.glb": [
            {"x": -3.8, "z": 18.2, "yaw": 0.0, "scale": 1.0},
            {"x": 3.8, "z": 18.2, "yaw": PI, "scale": 1.0},
            {"x": -11.5, "z": -54.5, "yaw": 0.0, "scale": 1.05},
            {"x": 11.5, "z": -54.5, "yaw": PI, "scale": 1.05},
        ],
    }

    # =========================================================================
    # 9. LOCAL WARM POINT LIGHTS (<= 6 GPU Budget: Interiors + Bridge Arch + Plaza)
    # =========================================================================
    lights = [
        {"position": {"x": -7.8, "y": 2.6, "z": 7.8}, "color": "#ff9844", "intensity": 5.5, "distance": 14},     # A1 Guardhouse Hearth
        {"position": {"x": 8.6, "y": 3.1, "z": -3.2}, "color": "#ff9e4a", "intensity": 6.8, "distance": 16},     # A2 Tavern 1F Chandelier & Hearth
        {"position": {"x": 8.6, "y": 6.6, "z": -3.2}, "color": "#ffaa5c", "intensity": 4.2, "distance": 13},     # A2 Tavern 2F Guest Gallery
        {"position": {"x": 0.0, "y": 5.0, "z": -15.0}, "color": "#ffba68", "intensity": 5.0, "distance": 16},    # Market Bridge Arch Tunnel
        {"position": {"x": -14.6, "y": 5.4, "z": -28.0}, "color": "#ffc074", "intensity": 5.2, "distance": 14},  # A3 Apothecary Interior
        {"position": {"x": 0.0, "y": 10.2, "z": -53.5}, "color": "#ffaa54", "intensity": 5.2, "distance": 18},   # +7.5m Overlook Terrace
    ]

    # =========================================================================
    # 10. DATA-DRIVEN LORE & MUNICIPAL NOTICE INTERACTABLES
    # =========================================================================
    lore_interactables = [
        {
            "id": "lore:city_guardhouse_log",
            "label": "翻阅《南门卫戍室防务日志》",
            "title": "《灰烬城 · 南门防务日志》",
            "body": "【灰烬历 312 年 · 山城整修纪要】\n灰烬城依山而建，共分五重高台：\n• 底层（0m）：南城门、卫戍室、商队货仓与双层【余烬旅店】（可沿内梯登上二楼观景廊）；\n• 中层（+3.5m）：穿【市集廊桥拱门】拾级而上，即达凤凰喷泉中央市集与【铁锚药剂堂】；\n• 上层两翼（+7.5m）：登市集北墙双折大石阶可抵达中段观景台，东西工匠区与居民高地将于 Phase 3 启封；\n• 高地与顶层（+12.2m / +18m）：圣伊格尼斯圣堂与领主城堡前庭高踞山巅，将于 Phase 4 开放通行。",
            "position": {"x": -8.0, "y": 1.56, "z": 4.3},
            "radius": 3.4,
            "meshKind": "book",
        },
        {
            "id": "lore:city_tavern_ledger",
            "label": "翻阅《余烬旅店吧台账簿》",
            "title": "《余烬与酒壶旅店账簿》",
            "body": "1. 溪谷村铁匠葛伦订购黑麦麦芽酒 3 桶 —— 已结清 18 金币。\n2. 旅店二楼观景阳台新换橡木栏杆，客人可上二楼俯瞰贸易主街与山巅城堡。\n3. 中央市集药商伊琳娜的新铺【铁锚药剂堂】今日开门迎客，就在市集西南角。",
            "position": {"x": 8.6, "y": 2.66, "z": -0.6},
            "radius": 3.4,
            "meshKind": "book",
        },
        {
            "id": "lore:city_warehouse_manifest",
            "label": "查验《南门商队货仓清单》",
            "title": "《商队货仓入城清册》",
            "body": "• 灰木林橡木桶 24 只 —— 待送往西翼工匠区制桶坊；\n• 南境肉桂与藏红花 12 袋 —— 已拨付中央市集香料商索恩；\n• 精炼铁锭 40 块 —— 记入灰砧铁匠铺铸匠布伦南名下。",
            "position": {"x": -8.4, "y": 2.05, "z": -4.5},
            "radius": 3.6,
            "meshKind": "book",
        },
        {
            "id": "lore:city_apothecary_notes",
            "label": "阅读《铁锚炼金手记》",
            "title": "《伊琳娜的药剂与草药手记》",
            "body": "河谷清晨采得的银叶草配上灰烬山泉水，可大幅增强治疗药水效用。旅人若需补给，可直接与柜台旁的我交易。",
            "position": {"x": -15.6, "y": 4.62, "z": -29.5},
            "radius": 2.4,
            "meshKind": "book",
        },
        {
            "id": "lore:city_notice_board",
            "label": "查看《灰烬城山城导览与市集告示》",
            "title": "《灰烬城 · 五重山城导览告示》",
            "body": "欢迎来到依山而筑的灰烬城！\n• 往南下阶可返【城门贸易街】与可进入的【余烬双层旅店】；\n• 广场西南角【铁锚药剂堂】已开放完整室内与药剂交易；\n• 沿广场北侧【双折礼仪大石阶】向上，可登临 +7.5m 中段观景平台俯瞰全城并遥望山巅圣堂与城堡！",
            "position": {"x": 5.8, "y": 3.50, "z": -23.6},
            "radius": 3.6,
            "meshKind": "board",
        },
        {
            "id": "lore:city_overlook_banner_sign",
            "label": "查看《上层城区整修布告 (Phase 3 / 4)》",
            "title": "《上层两翼与山巅高地开放预告》",
            "body": "您已登临 +7.5 米中段观景露台！\n• 西翼【铁匠工坊区】（+7.0m）与东翼【居民高地与屋顶连廊】（+7.5~10.2m）正在按山城重设计计划进入 Phase 3 施工；\n• 北巅【圣伊格尼斯圣堂高地】（+12.2m）与【城堡前庭与瓮城前厅】（+18.0m）将于 Phase 4 正式启封。",
            "position": {"x": 0.0, "y": 7.50, "z": -60.2},
            "radius": 3.8,
            "meshKind": "board",
        },
    ]

    return {
        "name": "Ashenhold Compact Hillside Citadel (Phase 2 Sample Slice)",
        "bounds": {
            "explorable": {"minX": -52, "maxX": 52, "minZ": -124, "maxZ": 26},
            "sampleSlice": {"minX": -18, "maxX": 18, "minZ": -61, "maxZ": 24},
            "decorativeEnvelope": {"minX": -92, "maxX": 92, "minZ": -166, "maxZ": 48},
        },
        "spawn": {"position": {"x": 0.0, "y": 0.15, "z": 19.5}, "yaw": 0.0},
        "portals": {
            "toRavendale": {
                "position": {"x": 0.0, "y": 0.1, "z": 21.6},
                "targetPosition": {"x": 0.0, "y": 2.0, "z": 31.0},
                "targetYaw": 0.0,
                "label": "返回溪谷村（原开放世界）",
            }
        },
        "architecture": architecture,
        "propBatches": prop_batches,
        "lights": lights,
        "loreInteractables": lore_interactables,
    }


def main() -> None:
    out_path = ROOT / "src/data/cityLayout.json"
    data = build_layout()
    out_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    n_arch = len(data["architecture"])
    n_props = sum(len(v) for v in data["propBatches"].values())
    print(f"Wrote Hillside Redesign Phase-2 layout -> {out_path} ({n_arch} structures, {n_props} instanced props)")


if __name__ == "__main__":
    main()
