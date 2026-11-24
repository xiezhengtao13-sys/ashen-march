#!/usr/bin/env python3
"""
Blender 4.0+ Sculpted 8-Cell Interconnected City Asset Generator for Ashenhold V5
(`feature/ashenhold-interconnected-city-v5`).

Preserves 100% of V4's sculpted BMesh stone/timber craft (`v4_sculpt_helpers.py`) and
1024px HBAO Packed-ORM PBR material palette while constructing all 8 interconnected
pocket-box Cells (`Cell 01` .. `Cell 08`), multi-story enterable interiors, climbable
Bell Tower (+24.2m), truly explorable Lord's Castle (+18m..+30.5m), and city-wide
-4.0m Undercroft & Secret Vault network.

Run via:
  blender --background --python scripts/city/v5_interconnected_kit.py
"""
import json
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from generate_models import MATERIAL_SPECS, MeshBuilder, OUT_DIR, reset_scene  # noqa: E402
from stormveil_kit import (  # noqa: E402
    add_broken_crenellations,
    add_gothic_pointed_arch,
    add_iron_brazier,
    add_sculpted_masonry_face,
    add_stepped_buttress,
    add_stone_stair_flight,
    add_wall_vines,
    bl_box,
    bl_ramp,
)
from v4_sculpt_helpers import (  # noqa: E402
    add_gothic_cage_lantern,
    add_hewn_stone_block,
    add_ribbed_groin_vault,
    add_stratified_cliff_crag,
)

V5_MANIFEST: dict[str, dict] = {}


def export_v5_model(
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
    V5_MANIFEST[f"{model_name}.glb"] = {
        "colliders": colliders or [],
        "cylinderColliders": cylinders or [],
        "orientedColliders": oriented or [],
    }


class WorldMeshAdapter:
    """
    Authoring helper that accepts Three.js world coordinates (wx, wy, wz) relative to an
    asset's world placement origin (ox, oy, oz) with yaw = 0, converting automatically to
    Blender local coordinates:
      bx = wx - ox
      by = oz - wz
      bz = wy - oy
    Eliminates Y/Z sign inversions and guarantees 1:1 mesh-to-collider registration.
    """

    def __init__(self, name: str, origin: tuple[float, float, float], seed: int = 2001) -> None:
        self.b = MeshBuilder(name, seed=seed)
        self.ox, self.oy, self.oz = origin
        self.cols: list[dict] = []
        self.cyls: list[dict] = []
        self.oriented: list[dict] = []

    def pt(self, wx: float, wy: float, wz: float) -> tuple[float, float, float]:
        return (wx - self.ox, self.oz - wz, wy - self.oy)

    def sz(self, sx: float, sy: float, sz: float) -> tuple[float, float, float]:
        return (sx, sz, sy)

    def solid_box(
        self,
        mat: str,
        center_w: tuple[float, float, float],
        size_w: tuple[float, float, float],
        bevel: float = 0.025,
        collide: bool = True,
    ) -> None:
        bx, by, bz = self.pt(*center_w)
        sx, sy, sz = size_w
        self.b.add_box(mat, (bx, by, bz), (sx, sz, sy), bevel=bevel)
        if collide:
            self.cols.append(bl_box(bx, by, bz, sx, sz, sy))

    def hewn_block(
        self,
        mat: str,
        center_w: tuple[float, float, float],
        size_w: tuple[float, float, float],
        chip_amp: float = 0.032,
        taper: float = 0.04,
        seed: int = 1,
        collide: bool = False,
    ) -> None:
        bx, by, bz = self.pt(*center_w)
        sx, sy, sz = size_w
        add_hewn_stone_block(self.b, mat, (bx, by, bz), (sx, sz, sy), chip_amp=chip_amp, taper=taper, seed=seed)
        if collide:
            self.cols.append(bl_box(bx, by, bz, sx, sz, sy))

    def sculpted_wall(
        self,
        mat: str,
        center_w: tuple[float, float, float],
        size_w: tuple[float, float, float],
        face_dir: str = "+Z",
        seed: int = 10,
        collide: bool = True,
        with_courses: bool = True,
    ) -> None:
        """Builds a solid battered-plinth masonry wall with 3D bossage stone courses on its visible face."""
        wx, wy, wz = center_w
        sx, sy, sz = size_w
        self.solid_box(mat, center_w, size_w, bevel=0.03, collide=collide)
        # Battered slate base plinth
        plinth_h = min(1.1, sy * 0.28)
        self.hewn_block(
            "damp_slate_stone",
            (wx, wy - sy * 0.5 + plinth_h * 0.5, wz),
            (sx + 0.22, plinth_h, sz + 0.22),
            chip_amp=0.03,
            taper=0.06,
            seed=seed,
            collide=False,
        )
        if not with_courses or sy < 1.6:
            return
        bx, by, bz = self.pt(wx, wy - sy * 0.5 + plinth_h, wz)
        ch = sy - plinth_h - 0.15
        if face_dir == "+Z":  # World South -> Blender -Y
            add_sculpted_masonry_face(self.b, (bx, by - sz * 0.5 - 0.01, bz), max(0.8, sx - 0.4), ch, "Y", -1, seed=seed)
        elif face_dir == "-Z":  # World North -> Blender +Y
            add_sculpted_masonry_face(self.b, (bx, by + sz * 0.5 + 0.01, bz), max(0.8, sx - 0.4), ch, "Y", 1, seed=seed)
        elif face_dir == "+X":  # World East -> Blender +X
            add_sculpted_masonry_face(self.b, (bx + sx * 0.5 + 0.01, by, bz), max(0.8, sz - 0.4), ch, "X", 1, seed=seed)
        elif face_dir == "-X":  # World West -> Blender -X
            add_sculpted_masonry_face(self.b, (bx - sx * 0.5 - 0.01, by, bz), max(0.8, sz - 0.4), ch, "X", -1, seed=seed)

    def stair(
        self,
        p0_w: tuple[float, float, float],
        p1_w: tuple[float, float, float],
        width: float,
        steps: int,
        parapet_left: bool = False,
        parapet_right: bool = False,
        solid_under: bool = True,
        mat_tread: str = "broken_flagstone",
        mat_wall: str = "citadel_masonry",
        seed: int = 55,
    ) -> None:
        c, o = add_stone_stair_flight(
            self.b,
            self.pt(*p0_w),
            self.pt(*p1_w),
            width=width,
            step_count=steps,
            parapet_left=parapet_left,
            parapet_right=parapet_right,
            solid_under=solid_under,
            mat_tread=mat_tread,
            mat_wall=mat_wall,
            seed=seed,
        )
        self.cols.extend(c)
        self.oriented.extend(o)

    def gothic_arch(
        self,
        base_center_w: tuple[float, float, float],
        half_span: float,
        spring_h: float,
        apex_rise: float,
        depth: float,
        along_world_axis: str = "Z",
        ring_thick: float = 0.36,
    ) -> None:
        """along_world_axis='Z' means passage runs N-S (Blender axis='Y'); 'X' means passage runs E-W (Blender axis='X')."""
        bx, by, bz = self.pt(*base_center_w)
        bl_axis = "Y" if along_world_axis == "Z" else "X"
        add_gothic_pointed_arch(
            self.b,
            (bx, by, bz),
            half_span=half_span,
            spring_z=spring_h,
            apex_rise=apex_rise,
            depth=depth,
            ring_thick=ring_thick,
            segments_per_side=6,
            axis=bl_axis,
        )

    def crenellations(
        self,
        start_w: tuple[float, float, float],
        length: float,
        run_axis: str = "+X",
        seed: int = 301,
        collide: bool = True,
    ) -> None:
        sx, sy, sz = self.pt(*start_w)
        if run_axis == "+X":
            add_broken_crenellations(self.b, (sx, sy, sz), length, axis="X", seed=seed)
            if collide:
                self.cols.append(bl_box(sx + length * 0.5, sy, sz + 0.65, length, 0.56, 1.3))
        else:
            # run_axis == "-Z" corresponds to Blender +Y!
            add_broken_crenellations(self.b, (sx, sy, sz), length, axis="Y", seed=seed)
            if collide:
                self.cols.append(bl_box(sx, sy + length * 0.5, sz + 0.65, 0.56, length, 1.3))

    def crag(
        self,
        center_w: tuple[float, float, float],
        size_w: tuple[float, float, float],
        dip: float = 0.48,
        seed: int = 77,
        collide: bool = True,
    ) -> None:
        bx, by, bz = self.pt(*center_w)
        sx, sy, sz = size_w
        add_stratified_cliff_crag(self.b, (bx, by, bz), (sx, sz, sy), dip_angle=dip, subdivisions=2, seed=seed)
        if collide:
            self.cols.append(bl_box(bx, by, bz, sx * 0.88, sz * 0.88, sy * 0.9))

    def brazier(self, pos_w: tuple[float, float, float], scale: float = 1.0) -> None:
        add_iron_brazier(self.b, self.pt(*pos_w), scale=scale)

    def lantern(self, pos_w: tuple[float, float, float], scale: float = 0.95) -> None:
        add_gothic_cage_lantern(self.b, self.pt(*pos_w), scale=scale)

    def pitched_roof(
        self,
        eave_center_w: tuple[float, float, float],
        ridge_along_world: str,
        length: float,
        half_span: float,
        rise: float,
        mat_roof: str = "roof_slate",
        with_tiles: bool = False,
    ) -> None:
        bx, by, bz = self.pt(*eave_center_w)
        bl_axis = "X" if ridge_along_world == "X" else "Y"
        self.b.add_pitched_tiled_roof(
            mat_roof,
            "aged_oak_timber",
            (bx, by, bz),
            length=length,
            half_span=half_span,
            rise=rise,
            along_axis=bl_axis,
            overhang=0.55,
            eave_rafters=True,
            with_3d_tiles=with_tiles,
        )


# =============================================================================
# CELL 01: BENT-AXIS OUTER BARBICAN, DOUBLE GATE, DEFENSE TOWER & GUARDHOUSE
# Origin: (0.0, 0.0, 23.0)
# =============================================================================
def build_cell01_barbican() -> None:
    w = WorldMeshAdapter("v5_cell01_barbican", origin=(0.0, 0.0, 23.0), seed=2101)

    # 1. Outer Southern Curtain Wall at z = 31.2 (height 12.5m) with Bent-Axis Outer Gate at x = -6.2!
    # West Outer Wall Pier: x in [-19.5, -9.2]
    w.sculpted_wall("citadel_masonry", (-14.35, 6.2, 31.2), (10.3, 12.4, 3.6), "+Z", seed=2102)
    # East Massive Outer Bastion Wall: x in [-3.2, +19.5] (blocks direct view of Inner Gate at x=0!)
    w.sculpted_wall("citadel_masonry", (8.15, 6.4, 31.2), (22.7, 12.8, 3.8), "+Z", seed=2103)
    w.sculpted_wall("citadel_masonry", (8.15, 6.4, 31.2), (22.7, 12.8, 3.8), "-Z", seed=2104, collide=False)
    # Bridge span over Outer Gate Archway (x in [-9.2, -3.2], clear height y = 0..5.4m)
    w.sculpted_wall("citadel_masonry", (-6.2, 9.2, 31.2), (6.4, 6.8, 3.8), "+Z", seed=2105)
    w.gothic_arch((-6.2, 0.0, 33.0), half_span=2.85, spring_h=3.1, apex_rise=2.3, depth=0.8, along_world_axis="Z", ring_thick=0.46)
    w.gothic_arch((-6.2, 0.0, 29.4), half_span=2.85, spring_h=3.1, apex_rise=2.3, depth=0.8, along_world_axis="Z", ring_thick=0.46)
    add_ribbed_groin_vault(w.b, w.pt(-6.2, 0.0, 31.2), half_span=2.82, y_length=3.6, spring_z=3.1, apex_rise=2.25, bays=1, seed=2106)
    # Outer Gate Raised Iron Portcullis
    for px in (-8.2, -7.4, -6.6, -5.8, -5.0, -4.2):
        w.solid_box("iron_forged", (px, 4.9, 32.2), (0.08, 1.4, 0.08), bevel=0.005, collide=False)
    w.solid_box("iron_forged", (-6.2, 4.5, 32.2), (4.8, 0.10, 0.10), bevel=0.005, collide=False)
    w.crenellations((-19.0, 12.6, 32.8), 38.0, "+X", seed=2107)
    for bx in (-12.5, -2.5, 4.0, 11.5):
        add_stepped_buttress(w.b, w.pt(bx, 0.0, 33.1), 1.35, 1.35, 11.8, "Y", -1, stages=3)
    w.brazier((-10.0, 0.0, 34.2), scale=1.05)
    w.brazier((-2.4, 0.0, 34.2), scale=1.05)

    # 2. Sightline-Baffling Traverse Shield Wall inside Barbican (x in [-2.4, +5.8], z = 25.8, height 8.2m)
    # Forces a true medieval 90-deg bent-axis turn after entering Outer Gate (-6.2, 31.2) while keeping (0, 22.0) open!
    w.sculpted_wall("citadel_masonry", (1.7, 4.1, 25.8), (8.2, 8.2, 1.6), "+Z", seed=2110)
    w.sculpted_wall("citadel_masonry", (1.7, 4.1, 25.8), (8.2, 8.2, 1.6), "-X", seed=2111, collide=False)
    w.crenellations((-2.3, 8.2, 25.8), 8.0, "+X", seed=2112)
    w.lantern((-2.6, 3.2, 25.8), scale=1.0)

    # 3. West Barbican Curtain Wall & Flanking Cliff Crags + Barbican Undercroft Stairwell Parapets
    w.sculpted_wall("citadel_masonry", (-17.2, 5.5, 23.2), (2.4, 11.0, 16.5), "+X", seed=2115)
    w.crag((-21.5, 5.5, 25.0), (8.5, 13.0, 12.0), dip=0.46, seed=2116)
    w.crag((21.5, 5.8, 25.0), (8.5, 13.5, 12.0), dip=-0.46, seed=2117)
    # Sunken West Barbican Undercroft Stairway (P03: (-12.5, 0.0, 27.2) -> (-12.5, -4.0, 16.5))
    w.stair((-12.5, 0.0, 27.2), (-12.5, -4.0, 16.5), width=2.3, steps=18, parapet_left=True, parapet_right=True, solid_under=True, mat_tread="damp_slate_stone", seed=2118)
    w.gothic_arch((-12.5, -4.0, 16.5), half_span=1.35, spring_h=1.7, apex_rise=1.2, depth=0.8, along_world_axis="Z")
    w.lantern((-10.8, 1.6, 27.2), scale=0.9)

    # 4. Enterable 2-Story East Barbican Defense Tower (x in [8.4, 16.0], z in [21.6, 29.2], climbs 0m -> +4.8m -> +9.5m!)
    # Floor 1 slab
    w.solid_box("broken_flagstone", (12.2, 0.06, 25.4), (7.4, 0.16, 7.4))
    # Tower North (z=21.8, open above +9.4m on West x in [8.4, 10.6] for Rampart exit!), East (x=15.8), South (z=29.0) walls
    w.sculpted_wall("citadel_masonry", (9.5, 4.7, 21.8), (2.2, 9.4, 0.65), "-Z", seed=2120)
    w.sculpted_wall("citadel_masonry", (13.3, 5.2, 21.8), (5.4, 10.4, 0.65), "-Z", seed=2120)
    w.sculpted_wall("citadel_masonry", (15.8, 5.2, 25.4), (0.65, 10.4, 7.6), "+X", seed=2121)
    w.sculpted_wall("citadel_masonry", (12.2, 5.2, 29.0), (7.6, 10.4, 0.65), "+Z", seed=2122)
    # West Front Wall (x=8.6) with 2.8m Gothic Doorway at z in [24.0, 26.8] (North jamb capped at +9.4m for Rampart!)
    w.sculpted_wall("citadel_masonry", (8.6, 4.7, 22.8), (0.65, 9.4, 2.4), "-X", seed=2123)
    w.sculpted_wall("citadel_masonry", (8.6, 5.2, 28.0), (0.65, 10.4, 2.4), "-X", seed=2124)
    w.sculpted_wall("citadel_masonry", (8.6, 6.8, 25.4), (0.65, 7.2, 2.8), "-X", seed=2125)
    w.gothic_arch((8.55, 0.0, 25.4), half_span=1.35, spring_h=1.85, apex_rise=1.15, depth=0.75, along_world_axis="X")
    # Indoor 2-Flight Switchback Stairs (0.08m -> +4.80m -> +9.50m) with flush non-overlapping landings
    w.stair((9.5, 0.08, 27.6), (13.8, 4.80, 27.6), width=1.65, steps=15, solid_under=False, mat_tread="aged_oak_timber", mat_wall="aged_oak_timber", seed=2126)
    w.solid_box("aged_oak_timber", (14.7, 4.74, 25.4), (1.8, 0.18, 6.4))  # Mid-landing at +4.8m (x in [13.8, 15.6])
    w.stair((13.8, 4.80, 23.3), (9.8, 9.50, 23.3), width=1.65, steps=15, solid_under=False, mat_tread="aged_oak_timber", mat_wall="aged_oak_timber", seed=2127)
    # +9.50m Tower Roof Deck (leaves stairwell opening at x in [9.8, 14.0], z in [22.2, 24.5]) & Rampart Walk to Inner Gatehouse!
    w.solid_box("broken_flagstone", (12.2, 9.42, 26.8), (7.4, 0.22, 4.6))
    w.solid_box("broken_flagstone", (8.95, 9.42, 23.2), (1.7, 0.22, 2.8))
    # Continuous +9.5m East Barbican Rampart Walk (x = 8.9, z = 21.8 -> 15.3) connecting onto sv_hero_gate_tower!
    w.sculpted_wall("citadel_masonry", (8.9, 4.7, 18.6), (3.0, 9.4, 6.6), "-X", seed=2128)
    w.solid_box("broken_flagstone", (8.9, 9.42, 18.6), (3.2, 0.22, 6.8))
    w.crenellations((7.4, 9.5, 21.8), 6.4, "-Z", seed=2129)
    w.crenellations((15.7, 9.5, 29.0), 7.4, "-Z", seed=2130)
    w.crenellations((8.6, 9.5, 29.0), 7.2, "+X", seed=2131)

    # 5. Enterable 1F East Gate Guardhouse tucked beside Rampart (x in [10.4, 16.0], z in [15.8, 21.2], y = 0.0m)
    # Open Gothic Archway through the Rampart Support Pier at (x = 8.9, z = 18.5, y = 0..3.2m)?
    # Even simpler: enter Guardhouse directly from Courtyard North-East corner at (x = 7.2, z = 18.5)? Wait: Rampart wall is at x in [7.4, 10.4]!
    # So let's place the Enterable 1F Gate Guardhouse on the WEST Courtyard side at x in [-9.8, -4.4], z in [16.4, 21.2]!
    # Check West Courtyard at x in [-9.8, -4.4], z in [16.4, 21.2]:
    #   - Clear of Inner Gate road (x in [-3.5, +3.5])!
    #   - Clear of Barbican Undercroft Stair (x in [-14.2, -10.8])!
    #   - Clear of Outer Gate lane (x = -6.2, z in [22.0, 31.2] -> turns East at z = 22.0)!
    w.solid_box("aged_oak_timber", (-7.1, 0.06, 18.8), (5.2, 0.14, 4.6))
    w.sculpted_wall("citadel_masonry", (-7.1, 2.0, 16.4), (5.4, 4.0, 0.48), "-Z", seed=2132)
    w.sculpted_wall("citadel_masonry", (-9.7, 2.0, 18.8), (0.48, 4.0, 4.8), "-X", seed=2133)
    w.sculpted_wall("citadel_masonry", (-7.1, 2.0, 21.2), (5.4, 4.0, 0.48), "+Z", seed=2134)
    # East Doorway facing Courtyard (x = -4.5, z = 18.8)
    w.sculpted_wall("citadel_masonry", (-4.5, 2.0, 17.1), (0.48, 4.0, 1.4), "+X", seed=2135)
    w.sculpted_wall("citadel_masonry", (-4.5, 2.0, 20.5), (0.48, 4.0, 1.4), "+X", seed=2136)
    w.sculpted_wall("citadel_masonry", (-4.5, 3.3, 18.8), (0.48, 1.4, 2.0), "+X", seed=2137)
    w.pitched_roof((-7.1, 4.0, 18.8), "Z", length=5.2, half_span=2.8, rise=1.75)

    export_v5_model(w.b, "v5_cell01_barbican", colliders=w.cols, oriented=w.oriented)

    # Interior props for Cell 01 Guardhouse & Defense Tower
    wi = WorldMeshAdapter("v5_cell01_barbican_interior", origin=(0.0, 0.0, 23.0), seed=2140)
    # Guardhouse table, bunk, lantern & weapon rack
    wi.solid_box("planks_oak", (-7.4, 0.84, 18.2), (1.7, 0.10, 0.95), collide=False)
    wi.solid_box("aged_oak_timber", (-7.4, 0.42, 18.2), (1.4, 0.76, 0.7), collide=False)
    wi.solid_box("aged_oak_timber", (-8.6, 0.45, 20.1), (1.8, 0.55, 0.95), collide=False)
    wi.solid_box("cloth_crimson", (-8.6, 0.76, 20.1), (1.7, 0.12, 0.88), collide=False)
    wi.lantern((-5.4, 2.4, 18.8), scale=0.85)
    # Defense Tower 1F armor crates & brazier
    wi.brazier((12.2, 0.12, 25.4), scale=0.92)
    wi.solid_box("aged_oak_timber", (14.2, 0.55, 23.2), (1.1, 0.9, 1.1), collide=False)
    export_v5_model(wi.b, "v5_cell01_barbican_interior", colliders=[], bake_ao=True)


# =============================================================================
# CELL 02: TRADE STREET APOTHECARY, WAREHOUSE COURTYARD, CELLAR STAIR & BRIDGES
# Origin: (0.0, 0.0, 0.0)
# =============================================================================
def build_cell02_trade_annex() -> None:
    w = WorldMeshAdapter("v5_cell02_trade_annex", origin=(0.0, 0.0, 0.0), seed=2201)

    # 1. Enterable West Trade Street Apothecary & 3-Story Half-Timbered Facade (x in [-11.4, -5.2], z in [-0.2, 6.2], y=0.55m)
    fy = 0.55
    w.solid_box("aged_oak_timber", (-8.3, fy + 0.05, 3.0), (6.0, 0.14, 6.2))
    w.sculpted_wall("citadel_masonry", (-8.3, fy + 1.9, -0.1), (6.2, 3.8, 0.46), "-Z", seed=2202)
    w.sculpted_wall("citadel_masonry", (-11.3, fy + 1.9, 3.0), (0.46, 3.8, 6.4), "-X", seed=2203)
    w.sculpted_wall("citadel_masonry", (-8.3, fy + 1.9, 6.1), (6.2, 3.8, 0.46), "+Z", seed=2204)
    # East Shopfront on Trade Street (x = -5.3, doorway at z = 3.0)
    w.sculpted_wall("citadel_masonry", (-5.3, fy + 1.9, 0.9), (0.46, 3.8, 2.0), "+X", seed=2205)
    w.sculpted_wall("citadel_masonry", (-5.3, fy + 1.9, 5.1), (0.46, 3.8, 2.0), "+X", seed=2206)
    w.sculpted_wall("citadel_masonry", (-5.3, fy + 3.25, 3.0), (0.46, 1.1, 2.2), "+X", seed=2207)
    w.gothic_arch((-5.25, fy, 3.0), half_span=1.1, spring_h=1.65, apex_rise=0.95, depth=0.55, along_world_axis="X")
    # Overhanging 2F & 3F Medieval Half-Timbered Stories (enclosing West Trade Alley up to +11.8m!)
    w.solid_box("plaster_cream", (-8.1, fy + 6.2, 3.0), (6.6, 4.8, 6.8))
    for tz in (0.0, 1.5, 3.0, 4.5, 6.0):
        w.solid_box("aged_oak_timber", (-4.75, fy + 6.2, tz), (0.16, 4.8, 0.18), collide=False)
    w.pitched_roof((-8.1, fy + 8.6, 3.0), "Z", length=7.0, half_span=3.5, rise=2.6, with_tiles=True)
    w.lantern((-4.6, fy + 2.6, 1.8), scale=0.9)

    # 2. Enterable East Caravan Warehouse & Back Courtyard (x in [6.8, 16.2], z in [2.6, 8.6], y = 0.25m)
    wy = 0.25
    w.solid_box("broken_flagstone", (9.8, wy + 0.04, 5.8), (5.8, 0.14, 5.6))
    w.sculpted_wall("citadel_masonry", (9.8, wy + 2.2, 8.5), (6.0, 4.4, 0.5), "+Z", seed=2210)
    w.sculpted_wall("citadel_masonry", (9.8, wy + 2.2, 3.1), (5.6, 4.4, 0.5), "-Z", seed=2211)
    # West Cargo Archway facing Trade Street (x = 7.0, z = 5.8) & East Courtyard Archway (x = 12.6, z = 5.8) to Cellar Stair!
    for xw in (7.0, 12.5):
        w.sculpted_wall("citadel_masonry", (xw, wy + 2.2, 3.9), (0.5, 4.4, 1.6), "-X" if xw < 9 else "+X", seed=2212 + int(xw))
        w.sculpted_wall("citadel_masonry", (xw, wy + 2.2, 7.7), (0.5, 4.4, 1.6), "-X" if xw < 9 else "+X", seed=2213 + int(xw))
        w.sculpted_wall("citadel_masonry", (xw, wy + 3.6, 5.8), (0.5, 1.6, 2.2), "-X", seed=2214 + int(xw))
    w.pitched_roof((9.8, wy + 4.4, 5.8), "Z", length=5.8, half_span=3.0, rise=2.0)
    # Courtyard East Enclosure Wall & Wine Cellar Stone Stairway (P07: (13.6, 0.35, 2.8) -> (13.6, -4.0, 11.4))
    w.sculpted_wall("citadel_masonry", (15.8, 2.8, 6.8), (0.8, 5.6, 9.6), "-X", seed=2216)
    w.stair((13.6, 0.35, 2.8), (13.6, -4.0, 11.4), width=2.1, steps=16, parapet_left=True, parapet_right=False, solid_under=True, mat_tread="damp_slate_stone", seed=2218)
    w.lantern((12.4, 2.2, 3.2), scale=0.88)

    # 3. East Back-Alley Stepped Shortcut to Cell 05 Residential Quarter (P09: (14.2, 1.15, -6.5) -> (23.5, 7.50, -16.0))
    w.stair((14.2, 1.15, -6.5), (23.5, 7.50, -16.0), width=2.2, steps=20, parapet_left=True, parapet_right=True, solid_under=True, seed=2220)

    # 4. East Overhead Bridge-to-Residential Skybridge (P08: (12.0, 9.50, -14.5) -> (18.2, 9.50, -14.5) -> (24.2, 7.50, -18.5))
    w.solid_box("broken_flagstone", (15.2, 9.44, -14.5), (6.6, 0.24, 3.2))
    w.crenellations((12.0, 9.5, -13.0), 6.2, "+X", seed=2222)
    w.crenellations((12.0, 9.5, -16.0), 6.2, "+X", seed=2223)
    w.solid_box("broken_flagstone", (18.8, 9.44, -15.2), (2.4, 0.24, 3.2))
    w.stair((18.8, 9.50, -16.2), (24.2, 7.50, -19.5), width=2.2, steps=10, parapet_left=True, parapet_right=True, solid_under=True, seed=2224)

    # 5. West Rampart-to-Smithy-2F Loft Catwalk (P10: (-15.2, 9.50, -30.0) -> (-28.5, 10.50, -30.0))
    w.stair((-15.2, 9.50, -30.0), (-28.5, 10.50, -30.0), width=2.2, steps=12, parapet_left=True, parapet_right=True, solid_under=False, mat_tread="aged_oak_timber", mat_wall="aged_oak_timber", seed=2226)

    export_v5_model(w.b, "v5_cell02_trade_annex", colliders=w.cols, oriented=w.oriented)

    wi = WorldMeshAdapter("v5_cell02_trade_annex_interior", origin=(0.0, 0.0, 0.0), seed=2230)
    # Apothecary counter, potion shelves & ceramic jars
    wi.solid_box("aged_oak_timber", (-8.8, fy + 0.55, 2.2), (2.4, 0.95, 0.75), collide=False)
    wi.solid_box("planks_oak", (-10.6, fy + 1.4, 3.0), (0.45, 2.2, 3.8), collide=False)
    for jz in (1.8, 2.6, 3.4, 4.2):
        wi.b.add_cylinder("ceramic_clay", wi.pt(-10.5, fy + 1.65, jz), 0.12, 0.09, 0.34, segs=8)
    # Warehouse stacked crates
    wi.solid_box("aged_oak_timber", (9.8, wy + 0.6, 7.2), (1.3, 1.0, 1.2), collide=False)
    export_v5_model(wi.b, "v5_cell02_trade_annex_interior", colliders=[], bake_ao=True)


# =============================================================================
# CELL 03: 2-STORY MARKET GUILD/BAKERY SHOP & EAST/WEST WING PORTAL ARCHES
# Origin: (0.0, 0.0, 0.0)
# =============================================================================
def build_cell03_market_guildshop() -> None:
    w = WorldMeshAdapter("v5_cell03_market_guildshop", origin=(0.0, 0.0, 0.0), seed=2301)

    # 1. Enterable 2-Story Market Guild & Bakery Emporium (x in [11.8, 18.6], z in [-32.2, -23.0], 1F +3.52m -> 2F +7.52m)
    y1, y2 = 3.52, 7.52
    w.solid_box("broken_flagstone", (15.2, y1 + 0.04, -27.6), (6.8, 0.14, 9.2))
    # South (z=-23.1) & North (z=-32.1) stone gable walls
    w.sculpted_wall("citadel_masonry", (15.2, y1 + 4.0, -23.1), (6.8, 8.0, 0.5), "+Z", seed=2302)
    w.sculpted_wall("citadel_masonry", (15.2, y1 + 4.0, -32.1), (6.8, 8.0, 0.5), "-Z", seed=2303)
    # West 1F Facade facing Market Plaza (x=11.9, open Gothic shop doorway at z=-27.2!)
    w.sculpted_wall("citadel_masonry", (11.9, y1 + 2.0, -24.4), (0.5, 4.0, 2.6), "-X", seed=2304)
    w.sculpted_wall("citadel_masonry", (11.9, y1 + 2.0, -30.3), (0.5, 4.0, 3.4), "-X", seed=2305)
    w.sculpted_wall("citadel_masonry", (11.9, y1 + 3.4, -27.1), (0.5, 1.2, 3.0), "-X", seed=2306)
    w.gothic_arch((11.85, y1, -27.1), half_span=1.45, spring_h=1.8, apex_rise=1.1, depth=0.6, along_world_axis="X")
    # East 1F Retaining Back Wall (solid at 1F against +7.5m residential hillside!)
    w.sculpted_wall("citadel_masonry", (18.4, y1 + 2.0, -27.6), (0.6, 4.0, 9.0), "+X", seed=2307)

    # Indoor 1F -> 2F Oak Stairway along North bay: (12.8, 3.58, -30.7) -> (17.0, 7.52, -30.7)
    w.stair((12.8, y1 + 0.06, -30.7), (17.0, y2, -30.7), width=1.65, steps=15, solid_under=False, mat_tread="aged_oak_timber", mat_wall="aged_oak_timber", seed=2308)
    # 2F Timber Floor Deck (leaves stairwell cutout at x in [12.8, 17.0], z in [-31.8, -29.5]) + Flush East Top Landing + West Balcony!
    w.solid_box("aged_oak_timber", (17.7, y2 - 0.06, -30.7), (1.4, 0.18, 2.6))
    w.solid_box("aged_oak_timber", (15.2, y2 - 0.06, -26.3), (6.8, 0.18, 6.4))
    w.solid_box("aged_oak_timber", (10.9, y2 - 0.06, -26.3), (2.0, 0.18, 6.2))
    w.solid_box("aged_oak_timber", (10.0, y2 + 0.55, -26.3), (0.18, 1.1, 6.2))
    # 2F Upper Walls (West doorway to balcony, East doorway P13 at z=-26.5 straight out to Cell 05 Residential Quarter!)
    w.solid_box("plaster_cream", (11.9, y2 + 1.8, -23.9), (0.42, 3.6, 1.8))
    w.solid_box("plaster_cream", (11.9, y2 + 1.8, -30.4), (0.42, 3.6, 3.2))
    w.solid_box("plaster_cream", (18.4, y2 + 1.8, -24.1), (0.42, 3.6, 2.2))
    w.solid_box("plaster_cream", (18.4, y2 + 1.8, -29.8), (0.42, 3.6, 4.2))
    # Walkable East 2F Bridge Deck connecting (18.4, 7.52, -26.5) -> (23.8, 7.52, -26.5) into Cell 05!
    w.solid_box("broken_flagstone", (21.1, y2 - 0.06, -26.5), (5.6, 0.22, 3.2))
    w.pitched_roof((15.2, y2 + 3.6, -27.6), "Z", length=9.6, half_span=3.7, rise=2.7, with_tiles=True)

    # 2. Portal P11: Market West Arcade Bay 2 -> Cell 04 Artisan Quarter Stairway (-15.3, 3.50, -35.2 -> -24.5, 7.00, -35.2)
    w.stair((-15.3, 3.50, -35.2), (-24.5, 7.00, -35.2), width=2.8, steps=14, parapet_left=True, parapet_right=True, solid_under=True, seed=2312)
    w.gothic_arch((-23.8, 7.00, -35.2), half_span=1.65, spring_h=2.1, apex_rise=1.35, depth=0.9, along_world_axis="X")
    w.brazier((-16.5, 4.2, -33.2), scale=0.88)

    # 3. Portal P12: Market East Weaver's Steps -> Cell 05 Residential Quarter (14.8, 3.50, -35.2 -> 24.5, 7.50, -35.2)
    w.stair((14.8, 3.50, -35.2), (24.5, 7.50, -35.2), width=2.8, steps=16, parapet_left=True, parapet_right=True, solid_under=True, seed=2315)
    w.gothic_arch((15.6, 3.50, -35.2), half_span=1.65, spring_h=2.1, apex_rise=1.35, depth=0.9, along_world_axis="X")
    w.gothic_arch((23.8, 7.50, -35.2), half_span=1.65, spring_h=2.1, apex_rise=1.35, depth=0.9, along_world_axis="X")

    export_v5_model(w.b, "v5_cell03_market_guildshop", colliders=w.cols, oriented=w.oriented)

    wi = WorldMeshAdapter("v5_cell03_market_guildshop_interior", origin=(0.0, 0.0, 0.0), seed=2320)
    # Brick bread oven, warm coals, spice counter & 2F ledger desk
    wi.hewn_block("citadel_masonry", (17.2, y1 + 1.35, -24.8), (1.8, 2.7, 1.6), seed=2321)
    wi.solid_box("ember_forge", (16.5, y1 + 0.85, -24.8), (0.6, 0.35, 0.9), collide=False)
    wi.solid_box("aged_oak_timber", (14.8, y1 + 0.55, -26.8), (1.2, 0.95, 2.8), collide=False)
    wi.solid_box("planks_oak", (15.0, y2 + 0.82, -25.2), (1.8, 0.12, 1.0), collide=False)
    wi.lantern((13.2, y1 + 2.5, -27.1), scale=0.88)
    export_v5_model(wi.b, "v5_cell03_market_guildshop_interior", colliders=[], bake_ao=True)


# =============================================================================
# CELL 04: WEST ARTISAN & FORGE QUARTER (+7.0m Terrace & +10.5m Forge Loft)
# Origin: (-32.0, 7.0, -42.0)
# =============================================================================
def build_cell04_artisan() -> None:
    w = WorldMeshAdapter("v5_cell04_artisan", origin=(-32.0, 7.0, -42.0), seed=2401)

    # 1. Western Sheer Stratified Cliff Crags & Retaining Bastion Walls (short sightline enclosure!)
    for cz, seed_c in ((-22.0, 2402), (-35.0, 2403), (-48.0, 2404), (-62.0, 2405)):
        w.crag((-46.8, 14.5, cz), (9.5, 16.5, 15.0), dip=0.50, seed=seed_c)
    w.sculpted_wall("citadel_masonry", (-32.0, 11.2, -16.5), (22.0, 8.4, 2.0), "-Z", seed=2406)
    w.crenellations((-42.5, 15.4, -16.5), 21.0, "+X", seed=2407)

    # 2. Enterable 2-Story Ironforge Master Smithy (x in [-41.5, -28.5], z in [-40.5, -28.5], 1F +7.04m, 2F +10.50m)
    sy1, sy2 = 7.04, 10.50
    w.solid_box("broken_flagstone", (-35.0, sy1, -34.5), (13.0, 0.14, 12.0))
    w.sculpted_wall("citadel_masonry", (-41.2, sy1 + 3.6, -34.5), (0.7, 7.2, 12.0), "+X", seed=2410)
    w.sculpted_wall("citadel_masonry", (-35.0, sy1 + 3.6, -28.8), (13.0, 7.2, 0.7), "-Z", seed=2411)
    w.sculpted_wall("citadel_masonry", (-35.0, sy1 + 3.6, -40.2), (13.0, 7.2, 0.7), "+Z", seed=2412)
    # Open Wide East Forge Frontage (x = -28.8, big central arch at z = -34.8 + 2F Loft Door at z = -30.0!)
    w.sculpted_wall("citadel_masonry", (-28.8, sy1 + 1.8, -30.4), (0.65, 3.6, 3.2), "+X", seed=2413)
    w.sculpted_wall("citadel_masonry", (-28.8, sy1 + 1.8, -38.8), (0.65, 3.6, 2.8), "+X", seed=2414)
    w.gothic_arch((-28.8, sy1, -34.8), half_span=2.4, spring_h=2.1, apex_rise=1.35, depth=0.75, along_world_axis="X")
    # Twin Massive Stone Forge Chimneys soaring to +22.5m (iconic Artisan skyline!)
    w.hewn_block("citadel_masonry", (-39.2, 14.8, -33.0), (2.4, 15.6, 2.4), taper=0.05, seed=2415, collide=True)
    w.hewn_block("citadel_masonry", (-39.2, 14.0, -36.5), (2.1, 14.0, 2.1), taper=0.05, seed=2416, collide=True)
    # Indoor Stair to 2F Forge Loft: (-30.2, 7.10, -38.8) -> (-37.4, 10.50, -38.8) + Flush West Top Landing!
    w.stair((-30.2, sy1 + 0.06, -38.8), (-37.4, sy2, -38.8), width=1.65, steps=14, solid_under=False, mat_tread="aged_oak_timber", mat_wall="aged_oak_timber", seed=2417)
    w.solid_box("aged_oak_timber", (-39.2, sy2 - 0.06, -38.8), (3.6, 0.18, 2.6))
    w.solid_box("aged_oak_timber", (-34.8, sy2 - 0.06, -33.2), (12.4, 0.18, 8.8))
    w.solid_box("aged_oak_timber", (-27.8, sy2 - 0.06, -30.0), (2.2, 0.18, 3.0))  # Connects flush to P10 Catwalk!
    w.pitched_roof((-35.0, sy2 + 3.4, -34.5), "Z", length=12.6, half_span=6.6, rise=3.2, with_tiles=True)
    w.brazier((-27.2, 7.0, -32.2), scale=1.0)
    w.brazier((-27.2, 7.0, -38.0), scale=1.0)

    # 3. Semi-Open Carpenter & Cooperage Yard (x in [-41.0, -29.5], z in [-56.0, -45.5], y = +7.04m)
    w.solid_box("aged_oak_timber", (-35.2, 7.06, -50.8), (11.2, 0.14, 10.2))
    w.sculpted_wall("citadel_masonry", (-40.6, 9.2, -50.8), (0.6, 4.4, 10.2), "+X", seed=2420)
    w.sculpted_wall("citadel_masonry", (-35.2, 9.2, -55.7), (11.2, 4.4, 0.6), "+Z", seed=2421)
    for px in (-39.5, -35.0, -30.2):
        w.solid_box("aged_oak_timber", (px, 9.2, -46.0), (0.26, 4.3, 0.26))
    w.pitched_roof((-35.2, 11.4, -50.8), "Z", length=10.6, half_span=5.8, rise=2.4)

    # 4. North Artisan-to-Temple Cliff Stairway (P16: (-25.0, 7.00, -61.5) -> (-18.5, 12.20, -76.5))
    w.stair((-25.0, 7.00, -61.5), (-18.5, 12.20, -76.5), width=2.8, steps=22, parapet_left=True, parapet_right=True, solid_under=True, seed=2425)
    w.gothic_arch((-24.5, 7.00, -62.5), half_span=1.65, spring_h=2.1, apex_rise=1.35, depth=0.9, along_world_axis="Z")

    export_v5_model(w.b, "v5_cell04_artisan", colliders=w.cols, oriented=w.oriented)

    wi = WorldMeshAdapter("v5_cell04_artisan_interior", origin=(-32.0, 7.0, -42.0), seed=2430)
    # Roaring Twin Forge Hearth, Forged Iron Anvil on Oak Stump, Water Quench Trough & Cooper Barrels
    wi.hewn_block("damp_slate_stone", (-38.8, sy1 + 0.75, -34.6), (2.4, 1.5, 4.8), seed=2431)
    wi.solid_box("ember_forge", (-38.2, sy1 + 1.15, -34.6), (1.4, 0.35, 3.6), collide=False)
    wi.b.add_cylinder("glow_warm", wi.pt(-38.0, sy1 + 1.38, -33.8), 0.25, 0.08, 0.32, segs=6)
    wi.b.add_cylinder("aged_oak_timber", wi.pt(-33.5, sy1 + 0.42, -34.8), 0.44, 0.48, 0.84, segs=10)
    wi.solid_box("iron_forged", (-33.5, sy1 + 0.98, -34.8), (0.48, 0.34, 0.96), collide=False)
    wi.solid_box("damp_slate_stone", (-33.5, sy1 + 0.45, -32.4), (0.85, 0.82, 1.65), collide=False)
    # Cooperage sawbuck & oak barrels
    wi.solid_box("planks_oak", (-34.2, 7.95, -50.2), (1.2, 0.12, 2.8), collide=False)
    for bz in (-53.5, -52.2, -48.0):
        wi.b.add_cylinder("aged_oak_timber", wi.pt(-37.8, 7.6, bz), 0.42, 0.38, 0.96, segs=10)
    export_v5_model(wi.b, "v5_cell04_artisan_interior", colliders=[], bake_ao=True)


# =============================================================================
# CELL 05: EAST RESIDENTIAL HEIGHTS (+7.5m Lanes, 2F Townhouse Skybridge & Hidden Well Yard)
# Origin: (32.0, 7.5, -42.0)
# =============================================================================
def build_cell05_residential() -> None:
    w = WorldMeshAdapter("v5_cell05_residential", origin=(32.0, 7.5, -42.0), seed=2501)

    # 1. Eastern Mountain Cliff Crags & Tenement Enclosure
    for cz, seed_c in ((-20.0, 2502), (-34.0, 2503), (-48.0, 2504), (-62.0, 2505)):
        w.crag((47.2, 15.0, cz), (9.0, 17.0, 15.0), dip=-0.48, seed=seed_c)

    # 2. Enterable 2-Story Weaver's Townhouse (x in [26.8, 33.8], z in [-32.5, -23.5], 1F +7.54m -> 2F +11.00m)
    ry1, ry2 = 7.54, 11.00
    w.solid_box("aged_oak_timber", (30.3, ry1, -28.0), (7.0, 0.14, 9.0))
    w.sculpted_wall("citadel_masonry", (30.3, ry1 + 3.6, -23.6), (7.0, 7.2, 0.48), "+Z", seed=2510)
    w.sculpted_wall("citadel_masonry", (30.3, ry1 + 3.6, -32.4), (7.0, 7.2, 0.48), "-Z", seed=2511)
    w.sculpted_wall("citadel_masonry", (33.7, ry1 + 1.8, -28.0), (0.48, 3.6, 8.8), "+X", seed=2512)
    # West 1F Lane Doorway (x = 26.9, z = -27.8)
    w.sculpted_wall("citadel_masonry", (26.9, ry1 + 1.8, -24.8), (0.48, 3.6, 2.6), "-X", seed=2513)
    w.sculpted_wall("citadel_masonry", (26.9, ry1 + 1.8, -30.8), (0.48, 3.6, 3.0), "-X", seed=2514)
    w.sculpted_wall("citadel_masonry", (26.9, ry1 + 3.1, -27.8), (0.48, 1.0, 2.8), "-X", seed=2515)
    # Indoor Stair to 2F: (28.0, 7.60, -31.0) -> (32.1, 11.00, -31.0) + Flush East Top Landing!
    w.stair((28.0, ry1 + 0.06, -31.0), (32.1, ry2, -31.0), width=1.55, steps=14, solid_under=False, mat_tread="aged_oak_timber", mat_wall="aged_oak_timber", seed=2516)
    w.solid_box("aged_oak_timber", (32.85, ry2 - 0.06, -31.0), (1.5, 0.18, 2.8))
    w.solid_box("aged_oak_timber", (30.3, ry2 - 0.06, -26.6), (7.0, 0.18, 6.2))
    # 2F Plaster & Timber Walls (East 2F Doorway at z = -27.5 leading onto Overhead Alley Skybridge!)
    w.solid_box("plaster_cream", (26.9, ry2 + 1.7, -28.0), (0.38, 3.4, 8.8))
    w.solid_box("plaster_cream", (33.7, ry2 + 1.7, -24.6), (0.38, 3.4, 2.4))
    w.solid_box("plaster_cream", (33.7, ry2 + 1.7, -30.6), (0.38, 3.4, 3.4))
    w.pitched_roof((30.3, ry2 + 3.4, -28.0), "Z", length=9.4, half_span=3.8, rise=2.6, with_tiles=True)
    w.lantern((26.2, ry1 + 2.5, -26.2), scale=0.88)

    # 3. Overhead Alley Skybridge & +11.0m Upper Residential Terrace -> Descending to Hidden Well Courtyard!
    w.solid_box("aged_oak_timber", (35.8, ry2 - 0.06, -27.5), (4.2, 0.20, 2.6))
    w.solid_box("aged_oak_timber", (35.8, ry2 + 0.55, -26.3), (4.2, 1.0, 0.16))
    w.solid_box("aged_oak_timber", (35.8, ry2 + 0.55, -28.7), (4.2, 1.0, 0.16))
    # Upper Residential Stone Terrace (x in [37.8, 43.8], z in [-39.0, -23.0], y = +11.0m)
    w.sculpted_wall("citadel_masonry", (40.8, 9.2, -31.0), (6.0, 3.5, 16.0), "-X", seed=2518)
    w.solid_box("broken_flagstone", (40.8, ry2 - 0.06, -31.0), (6.2, 0.20, 16.2))
    w.crenellations((37.8, ry2, -23.0), 3.0, "-Z", seed=2519)
    w.crenellations((37.8, ry2, -29.0), 9.5, "-Z", seed=2519)
    # South Residential Bastion & Half-Timbered Gable closing off East Alley South horizon (z = -22.2, x in [28.6, 44.2])
    w.sculpted_wall("citadel_masonry", (36.4, 10.6, -22.2), (15.6, 6.4, 1.4), "-Z", seed=2521)
    w.solid_box("plaster_cream", (35.8, 15.2, -21.2), (7.6, 3.2, 3.4))
    w.pitched_roof((35.8, 16.8, -21.2), "X", length=8.0, half_span=2.0, rise=2.1, with_tiles=True)
    w.lantern((35.6, 10.2, -22.95), scale=0.92)
    # Outdoor Terrace Stair descending South into Hidden Well Courtyard: (40.8, 11.00, -39.0) -> (40.8, 7.54, -44.2)
    w.stair((40.8, ry2, -39.0), (40.8, 7.54, -44.2), width=2.1, steps=14, parapet_left=True, parapet_right=True, solid_under=True, seed=2520)

    # 4. Narrow Vaulted Alley Arch & Hidden Well Courtyard + Enterable Citizen Cottage (x in [34.5, 44.5], z in [-52.5, -43.5])
    # Framing building over the Hidden Courtyard entrance tunnel (x in [27.0, 33.8], z in [-48.5, -38.5], open arch at z=-45.5!)
    w.sculpted_wall("citadel_masonry", (30.4, 9.4, -41.2), (6.8, 3.8, 5.2), "-X", seed=2522)
    w.sculpted_wall("citadel_masonry", (30.4, 9.4, -48.6), (6.8, 3.8, 2.8), "-X", seed=2523)
    w.solid_box("plaster_cream", (30.4, 13.0, -44.2), (7.0, 3.6, 11.4))
    w.pitched_roof((30.4, 14.8, -44.2), "Z", length=11.8, half_span=3.8, rise=2.5, with_tiles=True)
    # Octagonal Stone Well in Hidden Courtyard (37.2, 7.50, -47.2)
    w.b.add_cylinder("citadel_masonry", w.pt(37.2, 7.95, -47.2), 1.05, 1.0, 0.9, segs=8)
    w.cyls.append({"center": [round(37.2 - w.ox, 3), round(7.95 - w.oy, 3), round(-47.2 - w.oz, 3)], "halfHeight": 0.55, "radius": 1.08})
    # Enterable Citizen Cottage at back of Hidden Courtyard (x in [39.4, 44.6], z in [-52.8, -46.8], y = +7.56m)
    w.solid_box("aged_oak_timber", (42.0, 7.56, -49.8), (5.0, 0.14, 5.8))
    w.sculpted_wall("citadel_masonry", (42.0, 9.4, -52.6), (5.2, 3.7, 0.45), "-Z", seed=2525)
    w.sculpted_wall("citadel_masonry", (44.5, 9.4, -49.8), (0.45, 3.7, 5.8), "+X", seed=2526)
    w.sculpted_wall("citadel_masonry", (42.0, 9.4, -47.0), (5.2, 3.7, 0.45), "+Z", seed=2527)
    w.sculpted_wall("citadel_masonry", (39.5, 9.4, -51.4), (0.45, 3.7, 2.4), "-X", seed=2528)
    w.sculpted_wall("citadel_masonry", (39.5, 10.7, -48.6), (0.45, 1.1, 3.2), "-X", seed=2529)
    w.pitched_roof((42.0, 11.25, -49.8), "Z", length=6.2, half_span=2.9, rise=2.1)

    # 5. Neighborhood Provision Shop (x in [27.0, 33.2], z in [-58.5, -52.8]) + Overhead Clotheslines/Banners
    w.sculpted_wall("citadel_masonry", (30.1, 9.5, -55.6), (6.0, 4.0, 5.4), "-X", seed=2531)
    w.solid_box("awning_emerald", (26.2, 9.8, -55.6), (1.8, 0.08, 4.6), collide=False)
    w.pitched_roof((30.1, 11.5, -55.6), "Z", length=5.8, half_span=3.3, rise=2.2)
    for lz in (-25.0, -31.0, -45.5):
        w.solid_box("aged_oak_timber", (24.5, 11.2, lz), (4.8, 0.06, 0.06), collide=False)
        w.solid_box("cloth_linen", (24.0, 10.7, lz), (0.8, 0.85, 0.04), collide=False)
        w.solid_box("cloth_ochre", (25.1, 10.7, lz), (0.75, 0.80, 0.04), collide=False)

    # 6. North Residential-to-Temple Stairs (P17: (25.0, 7.50, -61.5) -> (18.5, 12.20, -76.5))
    w.stair((25.0, 7.50, -61.5), (18.5, 12.20, -76.5), width=2.8, steps=20, parapet_left=True, parapet_right=True, solid_under=True, seed=2535)
    w.gothic_arch((24.5, 7.50, -62.5), half_span=1.65, spring_h=2.1, apex_rise=1.35, depth=0.9, along_world_axis="Z")

    export_v5_model(w.b, "v5_cell05_residential", colliders=w.cols, cylinders=w.cyls, oriented=w.oriented)

    wi = WorldMeshAdapter("v5_cell05_residential_interior", origin=(32.0, 7.5, -42.0), seed=2540)
    # Weaver's oak loom, cloth bolts & Citizen Cottage heirloom chest + table
    wi.solid_box("aged_oak_timber", (31.8, ry1 + 0.9, -26.0), (1.4, 1.6, 1.8), collide=False)
    wi.solid_box("cloth_crimson", (31.8, ry1 + 1.1, -26.0), (0.12, 1.1, 1.4), collide=False)
    wi.solid_box("planks_oak", (29.8, ry1 + 0.82, -28.8), (1.5, 0.10, 0.95), collide=False)
    wi.solid_box("aged_oak_timber", (43.2, 8.0, -50.8), (0.9, 0.72, 1.25), collide=False)
    wi.solid_box("iron_forged", (43.2, 8.12, -50.8), (0.94, 0.08, 1.29), collide=False)
    export_v5_model(wi.b, "v5_cell05_residential_interior", colliders=[], bake_ao=True)


# =============================================================================
# CELL 06: CATHEDRAL OF ST. IGNIS, CLIMBABLE BELL TOWER (+24.2m), GUILDHALL & VIADUCT
# Origin: (0.0, 12.2, -86.0)
# =============================================================================
def build_cell06_temple() -> None:
    w = WorldMeshAdapter("v5_cell06_temple", origin=(0.0, 12.2, -86.0), seed=2601)
    ty = 12.24

    # 1. Twin Flanking Ceremonial Stairs from +7.5m Mid-Overlook to +12.2m Temple Forecourt
    w.stair((-15.5, 7.50, -56.0), (-15.5, 12.20, -73.0), width=2.6, steps=20, parapet_left=True, parapet_right=True, solid_under=True, seed=2602)
    w.stair((15.5, 7.50, -56.0), (15.5, 12.20, -73.0), width=2.6, steps=20, parapet_left=True, parapet_right=True, solid_under=True, seed=2603)
    # Scenic Overlook Balustrades on West & East edges of Temple Acropolis (+12.2m)
    w.crenellations((-24.5, 12.2, -74.0), 22.0, "-Z", seed=2604)
    w.crenellations((24.5, 12.2, -74.0), 22.0, "-Z", seed=2605)
    w.brazier((-4.8, 12.2, -76.5), scale=1.05)
    w.brazier((4.8, 12.2, -76.5), scale=1.05)

    # 2. Enterable Cathedral of St. Ignis (x in [-18.4, -5.0], z in [-95.5, -78.0], floor +12.26m, nave height 9.6m!)
    w.solid_box("broken_flagstone", (-11.7, ty, -86.8), (13.4, 0.16, 17.4))
    # South (-78.1), North Altar Wall (-95.4), and West (-18.3, leaving Bell Tower arch at z=-91.4!)
    w.sculpted_wall("citadel_masonry", (-11.7, ty + 4.8, -78.1), (13.4, 9.6, 0.75), "+Z", seed=2610)
    w.sculpted_wall("citadel_masonry", (-11.7, ty + 4.8, -95.4), (13.4, 9.6, 0.85), "-Z", seed=2611)
    w.sculpted_wall("citadel_masonry", (-18.3, ty + 4.8, -83.6), (0.75, 9.6, 11.0), "-X", seed=2612)
    w.sculpted_wall("citadel_masonry", (-18.3, ty + 4.8, -94.2), (0.75, 9.6, 2.4), "-X", seed=2613)
    w.sculpted_wall("citadel_masonry", (-18.3, ty + 7.2, -91.2), (0.75, 4.8, 3.6), "-X", seed=2614)
    # Grand East Forecourt Facade (x = -5.1, monumental Gothic portal at z = -86.8!)
    w.sculpted_wall("citadel_masonry", (-5.1, ty + 4.8, -81.2), (0.8, 9.6, 6.2), "+X", seed=2615)
    w.sculpted_wall("citadel_masonry", (-5.1, ty + 4.8, -92.4), (0.8, 9.6, 6.2), "+X", seed=2616)
    w.sculpted_wall("citadel_masonry", (-5.1, ty + 7.4, -86.8), (0.8, 4.4, 5.2), "+X", seed=2617)
    w.gothic_arch((-4.95, ty, -86.8), half_span=2.35, spring_h=2.8, apex_rise=2.1, depth=1.1, along_world_axis="X", ring_thick=0.46)
    for bz in (-79.5, -84.0, -89.6, -94.0):
        add_stepped_buttress(w.b, w.pt(-4.7, ty, bz), 1.1, 1.0, 9.2, "X", 1, stages=3)
    # Ribbed Vaulted Nave Roof & Steep Cathedral Slate Roof
    add_ribbed_groin_vault(w.b, w.pt(-11.7, ty, -86.8), half_span=5.8, y_length=16.2, spring_z=5.6, apex_rise=3.4, bays=3, seed=2618)
    w.pitched_roof((-11.7, ty + 9.6, -86.8), "Z", length=17.8, half_span=7.0, rise=4.8, with_tiles=True)

    # 3. Climbable 4-Tier Cathedral Bell Tower (x in [-25.8, -18.4], z in [-95.5, -87.5], climbs +12.26m -> +19.50m -> +24.20m!)
    w.solid_box("broken_flagstone", (-22.1, ty, -91.5), (7.4, 0.18, 8.0))
    w.sculpted_wall("citadel_masonry", (-25.6, 18.2, -91.5), (0.7, 12.0, 8.0), "-X", seed=2620)
    w.sculpted_wall("citadel_masonry", (-22.1, 18.2, -87.7), (7.4, 12.0, 0.7), "+Z", seed=2621)
    # North Bell Tower Wall (z = -95.3): open +19.5m High Viaduct Doorway at x in [-20.4, -18.2]!
    w.sculpted_wall("citadel_masonry", (-23.1, 18.2, -95.3), (5.4, 12.0, 0.7), "-Z", seed=2622)
    w.sculpted_wall("citadel_masonry", (-19.4, 15.8, -95.3), (2.0, 7.2, 0.7), "-Z", seed=2622)
    w.sculpted_wall("citadel_masonry", (-19.4, 23.3, -95.3), (2.0, 1.8, 0.7), "-Z", seed=2622)
    # Tower East wall above Cathedral doorway
    w.sculpted_wall("citadel_masonry", (-18.5, 17.2, -91.2), (0.65, 3.8, 3.6), "+X", seed=2623)
    w.sculpted_wall("citadel_masonry", (-18.5, 21.8, -91.5), (0.65, 4.6, 7.8), "+X", seed=2624)

    # Switchback Flight 1 (South lane z=-89.2): (-19.2, 12.30, -89.2) -> (-23.6, 16.00, -89.2)
    w.stair((-19.2, ty + 0.04, -89.2), (-23.6, 16.00, -89.2), width=1.65, steps=14, solid_under=False, mat_tread="aged_oak_timber", mat_wall="aged_oak_timber", seed=2625)
    w.solid_box("aged_oak_timber", (-24.5, 15.94, -91.5), (1.8, 0.18, 6.8))  # West Landing 1 (+16.0m, x in [-25.4, -23.6])
    # Switchback Flight 2 (North lane z=-93.6): (-23.6, 16.00, -93.6) -> (-19.9, 19.50, -93.6)
    w.stair((-23.6, 16.00, -93.6), (-19.9, 19.50, -93.6), width=1.65, steps=14, solid_under=False, mat_tread="aged_oak_timber", mat_wall="aged_oak_timber", seed=2626)
    w.solid_box("broken_flagstone", (-19.0, 19.44, -91.5), (1.8, 0.18, 6.8))  # East Mid-Gallery (+19.5m, x in [-19.9, -18.1])
    # Switchback Flight 3 (South lane z=-89.2, 7.2m above Flight 1!): (-19.9, 19.50, -89.2) -> (-23.8, 24.20, -89.2)
    w.stair((-19.9, 19.50, -89.2), (-23.8, 24.20, -89.2), width=1.65, steps=16, solid_under=False, mat_tread="aged_oak_timber", mat_wall="aged_oak_timber", seed=2627)

    # +24.20m Open Gothic Belfry Deck (leaves stairwell opening at x in [-23.8, -19.8], z in [-90.4, -88.0])
    w.solid_box("broken_flagstone", (-22.1, 24.14, -92.8), (7.2, 0.22, 4.8))
    w.solid_box("broken_flagstone", (-24.65, 24.14, -89.2), (1.7, 0.22, 2.6))
    for cx_p, cz_p in ((-25.1, -88.2), (-19.1, -88.2), (-25.1, -94.8), (-19.1, -94.8)):
        w.hewn_block("citadel_masonry", (cx_p, 26.4, cz_p), (1.1, 4.4, 1.1), seed=2628, collide=True)
    w.crenellations((-25.5, 24.2, -95.2), 6.8, "+X", seed=2629)
    w.crenellations((-25.5, 24.2, -87.8), 6.8, "+X", seed=2630)
    w.crenellations((-25.5, 24.2, -87.8), 7.2, "-Z", seed=2631)
    w.crenellations((-18.7, 24.2, -87.8), 7.2, "-Z", seed=2632)
    # Cast-Bronze Great Bell & Spire (+24.2m -> +31.5m!)
    w.solid_box("aged_oak_timber", (-22.1, 27.6, -92.2), (4.2, 0.28, 0.32), collide=False)
    w.b.add_cylinder("brass_aged", w.pt(-22.1, 26.6, -92.2), 1.05, 0.58, 1.55, segs=12, bevel=0.03)
    w.b.add_cylinder("roof_slate", w.pt(-22.1, 30.8, -91.5), 4.2, 0.16, 4.8, segs=4, rot=(0.0, 0.0, math.pi * 0.25))

    # 4. High Stone Viaduct (+19.50m): Links Watchtower Summit (2.5, 19.5, -69.5) <-> Bell Tower (-18.2, 19.5, -93.6) <-> Castle Ramparts (2.5, 19.5, -105.5)!
    w.solid_box("broken_flagstone", (2.5, 19.42, -87.5), (3.2, 0.24, 36.2))
    w.crenellations((4.0, 19.5, -69.5), 36.0, "-Z", seed=2635)
    w.crenellations((1.0, 19.5, -69.5), 25.5, "-Z", seed=2636)  # Opens West at z in [-98.5, -95.0] for Bell Tower spur!
    for vz in (-74.0, -82.0, -90.0, -98.0):
        w.hewn_block("citadel_masonry", (2.5, 15.8, vz), (2.2, 7.2, 1.8), taper=0.06, seed=2637 + int(abs(vz)), collide=True)
    # East-West Viaduct Spur north of Cathedral gable (z = -97.0, x = -18.8 -> +2.5, y = +19.50m)
    w.solid_box("broken_flagstone", (-8.2, 19.42, -97.0), (21.8, 0.24, 2.8))
    w.solid_box("broken_flagstone", (-18.4, 19.42, -95.2), (2.6, 0.24, 4.4))
    w.crenellations((-19.0, 19.5, -98.4), 19.8, "+X", seed=2639)

    # 5. Enterable Guildhall & Archive Scriptorium (x in [7.2, 18.8], z in [-94.0, -79.5], y = +12.26m)
    w.solid_box("aged_oak_timber", (13.0, ty, -86.8), (11.6, 0.16, 14.4))
    w.sculpted_wall("citadel_masonry", (13.0, ty + 3.4, -79.6), (11.6, 6.8, 0.65), "+Z", seed=2641)
    w.sculpted_wall("citadel_masonry", (13.0, ty + 3.4, -94.0), (11.6, 6.8, 0.65), "-Z", seed=2642)
    w.sculpted_wall("citadel_masonry", (18.7, ty + 3.4, -86.8), (0.65, 6.8, 14.4), "+X", seed=2643)
    w.sculpted_wall("citadel_masonry", (7.3, ty + 3.4, -82.2), (0.65, 6.8, 5.2), "-X", seed=2644)
    w.sculpted_wall("citadel_masonry", (7.3, ty + 3.4, -91.4), (0.65, 6.8, 5.2), "-X", seed=2645)
    w.sculpted_wall("citadel_masonry", (7.3, ty + 5.4, -86.8), (0.65, 2.8, 4.0), "-X", seed=2646)
    w.gothic_arch((7.25, ty, -86.8), half_span=1.8, spring_h=2.2, apex_rise=1.4, depth=0.8, along_world_axis="X")
    w.pitched_roof((13.0, ty + 6.8, -86.8), "Z", length=14.8, half_span=6.1, rise=3.6, with_tiles=True)

    # 6. Royal Causeway Ceremonial Stairs to Cell 07 Lord's Castle (P18: (0.0, 12.20, -96.5) -> (0.0, 18.00, -107.8))
    w.stair((0.0, 12.20, -96.5), (0.0, 18.00, -107.8), width=5.6, steps=22, parapet_left=True, parapet_right=True, solid_under=True, seed=2650)

    export_v5_model(w.b, "v5_cell06_temple", colliders=w.cols, oriented=w.oriented)

    wi = WorldMeshAdapter("v5_cell06_temple_interior", origin=(0.0, 12.2, -86.0), seed=2660)
    # Cathedral Nave Columns, Oak Pews, High Altar, Crimson Runner & Candelabras
    wi.solid_box("cloth_crimson", (-11.7, ty + 0.09, -86.8), (2.2, 0.03, 14.2), collide=False)
    for pz in (-82.5, -86.8, -91.0):
        for px in (-14.8, -8.6):
            wi.b.add_cylinder("limestone_weathered", wi.pt(px, ty + 3.8, pz), 0.46, 0.42, 7.4, segs=8)
    for pew_z in (-81.5, -84.0, -88.5, -90.5):
        for pew_x in (-13.6, -9.8):
            wi.solid_box("aged_oak_timber", (pew_x, ty + 0.48, pew_z), (2.1, 0.82, 0.55), collide=False)
    # High Stone Altar at (-11.7, ty, -93.6)
    wi.hewn_block("limestone_weathered", (-11.7, ty + 0.65, -93.6), (3.4, 1.15, 1.35), seed=2662)
    wi.solid_box("cloth_crimson", (-11.7, ty + 1.24, -93.6), (1.8, 0.06, 1.4), collide=False)
    wi.b.add_cylinder("brass_aged", wi.pt(-11.7, ty + 1.45, -93.6), 0.14, 0.10, 0.36, segs=8)
    wi.lantern((-9.6, ty + 2.2, -93.2), scale=1.0)
    wi.lantern((-13.8, ty + 2.2, -93.2), scale=1.0)
    # Guildhall Archive Bookshelves & Reading Tables
    for sx_b in (16.8, 17.8):
        for sz_b in (-82.5, -86.8, -91.0):
            wi.solid_box("aged_oak_timber", (sx_b, ty + 1.8, sz_b), (0.55, 3.4, 3.2), collide=False)
    wi.solid_box("planks_oak", (12.2, ty + 0.85, -86.8), (1.8, 0.12, 3.6), collide=False)
    export_v5_model(wi.b, "v5_cell06_temple_interior", colliders=[], bake_ao=True)


# =============================================================================
# CELL 07: TRULY EXPLORABLE LORD'S CASTLE (+18m Bailey, Barracks, Armory+Shaft, Great Hall & +30.5m Tower)
# Origin: (0.0, 18.0, -124.0)
# =============================================================================
def build_cell07_castle() -> None:
    w = WorldMeshAdapter("v5_cell07_castle", origin=(0.0, 18.0, -124.0), seed=2701)

    # 1. Castle Outer Gatehouse & +23.5m Battlement Curtain Wall at z = -108.5
    w.sculpted_wall("citadel_masonry", (-12.8, 20.8, -108.5), (19.2, 5.6, 3.4), "+Z", seed=2702)
    w.sculpted_wall("citadel_masonry", (12.8, 20.8, -108.5), (19.2, 5.6, 3.4), "+Z", seed=2703)
    w.sculpted_wall("citadel_masonry", (0.0, 22.4, -108.5), (6.6, 2.4, 3.4), "+Z", seed=2704)
    w.gothic_arch((0.0, 18.0, -106.8), half_span=3.0, spring_h=2.8, apex_rise=2.0, depth=0.85, along_world_axis="Z", ring_thick=0.46)
    w.gothic_arch((0.0, 18.0, -110.2), half_span=3.0, spring_h=2.8, apex_rise=2.0, depth=0.85, along_world_axis="Z", ring_thick=0.46)
    # Walkable +23.5m Castle Battlement Deck + Orthogonal West Stair down to +19.5m High Viaduct!
    w.solid_box("broken_flagstone", (0.0, 23.44, -108.5), (44.0, 0.24, 3.6))
    w.crenellations((-21.5, 23.5, -106.8), 13.2, "+X", seed=2705)
    w.crenellations((-4.2, 23.5, -106.8), 25.5, "+X", seed=2706)
    w.stair((0.9, 19.50, -104.5), (-4.8, 23.50, -104.5), width=2.4, steps=15, parapet_left=False, parapet_right=False, solid_under=False, seed=2707)
    w.solid_box("broken_flagstone", (-6.2, 23.44, -106.2), (2.8, 0.24, 5.4))
    # Twin Castle Gate Octagonal Drum Towers
    w.b.add_cylinder("citadel_masonry", w.pt(-5.6, 23.8, -108.0), 2.8, 2.5, 11.6, segs=8)
    w.b.add_cylinder("roof_slate", w.pt(-5.6, 31.4, -108.0), 3.0, 0.15, 4.2, segs=8)
    w.b.add_cylinder("citadel_masonry", w.pt(14.5, 23.8, -108.0), 2.8, 2.5, 11.6, segs=8)
    w.b.add_cylinder("roof_slate", w.pt(14.5, 31.4, -108.0), 3.0, 0.15, 4.2, segs=8)
    w.brazier((-3.8, 18.0, -106.2), scale=1.1)
    w.brazier((3.8, 18.0, -106.2), scale=1.1)

    # 2. Outer Bailey Perimeter Curtain Walls & Mountain Crags + Keep Ascent Steps (+18m -> +21m)
    w.sculpted_wall("citadel_masonry", (-22.5, 21.5, -124.0), (2.4, 7.2, 32.0), "+X", seed=2710)
    w.sculpted_wall("citadel_masonry", (22.5, 21.5, -124.0), (2.4, 7.2, 32.0), "-X", seed=2711)
    w.crag((-28.5, 25.0, -126.0), (11.0, 18.0, 26.0), dip=0.48, seed=2712)
    w.crag((28.5, 25.0, -126.0), (11.0, 18.0, 26.0), dip=-0.48, seed=2713)
    w.stair((0.0, 18.00, -122.0), (0.0, 21.04, -127.4), width=6.0, steps=14, parapet_left=True, parapet_right=True, solid_under=True, seed=2714)

    # 3. Enterable West Guard Barracks (x in [-20.5, -11.5], z in [-121.5, -112.0], y = +18.04m) + Rampart Stair!
    by = 18.04
    w.solid_box("broken_flagstone", (-16.0, by, -116.8), (9.0, 0.14, 9.4))
    w.sculpted_wall("citadel_masonry", (-16.0, by + 2.7, -112.2), (9.0, 5.4, 0.6), "+Z", seed=2720)
    w.sculpted_wall("citadel_masonry", (-16.0, by + 2.7, -121.4), (9.0, 5.4, 0.6), "-Z", seed=2721)
    w.sculpted_wall("citadel_masonry", (-20.4, by + 2.7, -116.8), (0.6, 5.4, 9.4), "-X", seed=2722)
    w.sculpted_wall("citadel_masonry", (-11.6, by + 2.7, -113.8), (0.6, 5.4, 3.2), "+X", seed=2723)
    w.sculpted_wall("citadel_masonry", (-11.6, by + 2.7, -119.8), (0.6, 5.4, 3.2), "+X", seed=2724)
    w.sculpted_wall("citadel_masonry", (-11.6, by + 4.4, -116.8), (0.6, 2.0, 3.0), "+X", seed=2725)
    # Walkable Barracks Roof Deck (+23.5m) connected flush to Outer Gate Battlement & Courtyard Stair!
    w.solid_box("broken_flagstone", (-16.0, 23.44, -115.6), (9.4, 0.24, 12.2))
    w.solid_box("broken_flagstone", (-10.2, 23.44, -111.5), (3.2, 0.24, 3.0))
    w.stair((-9.8, 18.00, -121.5), (-9.8, 23.50, -113.0), width=2.1, steps=18, parapet_left=False, parapet_right=True, solid_under=True, seed=2726)

    # 4. Enterable East Castle Armory & 4-Flight Secret Cliff Vault Stairway (+18.04m -> -4.00m!)
    # Armory Front Hall: x in [10.8, 14.6], z in [-122.8, -112.5], Rear Secret Shaft: x in [14.6, 20.4], z in [-122.8, -113.4]
    w.solid_box("broken_flagstone", (12.7, by, -117.6), (3.8, 0.16, 10.2))
    # Bridge landing to Flight 1 top at (15.4, 18.04, -121.6)
    w.solid_box("broken_flagstone", (15.4, by, -122.0), (2.2, 0.18, 1.8))
    w.sculpted_wall("citadel_masonry", (15.6, by + 2.8, -112.6), (9.6, 5.6, 0.65), "+Z", seed=2730)
    w.sculpted_wall("citadel_masonry", (15.6, by + 2.8, -122.9), (9.6, 5.6, 0.65), "-Z", seed=2731)
    w.sculpted_wall("citadel_masonry", (20.3, 10.0, -118.0), (0.8, 28.0, 10.6), "+X", seed=2732)
    w.sculpted_wall("damp_slate_stone", (17.2, 6.8, -113.3), (6.4, 22.5, 0.7), "+Z", seed=2733)
    w.sculpted_wall("damp_slate_stone", (17.2, 6.8, -122.9), (6.4, 22.5, 0.7), "-Z", seed=2734)
    # Leave 2.6m West Vault Doorway at z in [-122.5, -119.9] at bottom (-4.0m) AND open top (>17.0m)!
    w.sculpted_wall("damp_slate_stone", (13.8, 6.2, -116.6), (0.7, 21.5, 6.4), "-X", seed=2735)
    # West Bailey Doorway to Armory (x = 10.9, z = -117.6)
    w.sculpted_wall("citadel_masonry", (10.9, by + 2.8, -114.3), (0.6, 5.6, 3.4), "-X", seed=2736)
    w.sculpted_wall("citadel_masonry", (10.9, by + 2.8, -120.9), (0.6, 5.6, 3.4), "-X", seed=2737)
    w.sculpted_wall("citadel_masonry", (10.9, by + 4.5, -117.6), (0.6, 2.2, 3.2), "-X", seed=2738)
    w.pitched_roof((15.6, by + 5.6, -117.6), "Z", length=10.8, half_span=5.1, rise=2.6, with_tiles=True)

    # 4-Flight 2-Lane Switchback Cliff Stairway (+18.04m <-> -4.00m, 10.4m vertical headroom between stacked flights!)
    # Flight 1 (West lane x=15.4, going South): (15.4, 18.04, -121.1) -> (15.4, 12.50, -115.1)
    w.stair((15.4, 18.04, -121.1), (15.4, 12.50, -115.1), width=1.8, steps=18, solid_under=False, mat_tread="damp_slate_stone", seed=2741)
    w.solid_box("damp_slate_stone", (17.0, 12.42, -114.2), (5.2, 0.20, 1.8))  # South Landing 1 (+12.5m, z in [-115.1, -113.3])
    # Flight 2 (East lane x=18.4, going North): (18.4, 12.50, -115.1) -> (18.4, 7.00, -121.1)
    w.stair((18.4, 12.50, -115.1), (18.4, 7.00, -121.1), width=1.8, steps=18, solid_under=False, mat_tread="damp_slate_stone", seed=2742)
    w.solid_box("damp_slate_stone", (17.0, 6.92, -122.0), (5.2, 0.20, 1.8))  # North Landing 2 (+7.0m, z in [-122.9, -121.1])
    # Flight 3 (West lane x=15.4, going South): (15.4, 7.00, -121.1) -> (15.4, 1.50, -115.1)
    w.stair((15.4, 7.00, -121.1), (15.4, 1.50, -115.1), width=1.8, steps=18, solid_under=False, mat_tread="damp_slate_stone", seed=2743)
    w.solid_box("damp_slate_stone", (17.0, 1.42, -114.2), (5.2, 0.20, 1.8))  # South Landing 3 (+1.5m, z in [-115.1, -113.3])
    # Flight 4 (East lane x=18.4, going North): (18.4, 1.50, -115.1) -> (18.4, -4.00, -120.2)
    w.stair((18.4, 1.50, -115.1), (18.4, -4.00, -120.2), width=1.8, steps=18, solid_under=False, mat_tread="damp_slate_stone", seed=2744)
    # Bottom Landing (-4.0m, z in [-122.8, -120.2]) opening West at z=-121.2 into Cell 08 Secret Treasury Vault!
    w.solid_box("damp_slate_stone", (16.2, -4.08, -121.5), (6.8, 0.22, 2.6))
    w.lantern((15.4, 19.8, -121.5), scale=0.9)
    w.lantern((17.0, 9.2, -122.0), scale=0.85)
    w.lantern((17.0, -1.8, -121.4), scale=0.88)

    # 5. Enterable 2-Story Sovereign Great Hall & Climbable Keep Watchtower (+21.04m -> +25.50m -> +30.50m, Spire +43.5m!)
    ky, ky2 = 21.04, 25.50
    w.solid_box("broken_flagstone", (0.0, ky, -135.5), (22.0, 0.18, 16.0))
    # Keep North (-143.2), East (10.8), West (-10.8, leaving 2F Watchtower door!) & South Portal Wall (-127.6)
    w.sculpted_wall("citadel_masonry", (0.0, ky + 6.5, -143.2), (22.4, 13.0, 1.2), "-Z", seed=2750)
    w.sculpted_wall("citadel_masonry", (10.8, ky + 6.5, -135.5), (1.1, 13.0, 16.0), "+X", seed=2751)
    w.sculpted_wall("citadel_masonry", (-10.8, ky + 2.2, -135.5), (1.1, 4.4, 16.0), "-X", seed=2752)
    w.sculpted_wall("citadel_masonry", (-10.8, ky2 + 4.2, -130.6), (1.1, 8.4, 6.2), "-X", seed=2753)
    w.sculpted_wall("citadel_masonry", (-10.8, ky2 + 4.2, -140.8), (1.1, 8.4, 5.0), "-X", seed=2754)
    # South Great Hall Facade (z = -127.6, grand portal at x = 0!)
    w.sculpted_wall("citadel_masonry", (-6.8, ky + 6.5, -127.6), (8.4, 13.0, 1.2), "+Z", seed=2755)
    w.sculpted_wall("citadel_masonry", (6.8, ky + 6.5, -127.6), (8.4, 13.0, 1.2), "+Z", seed=2756)
    w.sculpted_wall("citadel_masonry", (0.0, ky + 9.2, -127.6), (5.4, 7.6, 1.2), "+Z", seed=2757)
    w.gothic_arch((0.0, ky, -127.0), half_span=2.55, spring_h=3.0, apex_rise=2.2, depth=1.3, along_world_axis="Z", ring_thick=0.48)
    for kbx in (-8.5, -4.0, 4.0, 8.5):
        add_stepped_buttress(w.b, w.pt(kbx, ky, -127.0), 1.35, 1.35, 12.5, "Y", -1, stages=3)
    w.pitched_roof((0.0, ky + 13.0, -135.5), "X", length=22.8, half_span=8.4, rise=5.2, with_tiles=True)
    # Soaring Decorative Keep Crown Turret (+34m..+43.5m visible from entire lower city!)
    w.b.add_cylinder("citadel_masonry", w.pt(7.5, 33.5, -140.0), 3.6, 3.2, 12.0, segs=8)
    w.b.add_cylinder("roof_slate", w.pt(7.5, 42.5, -140.0), 3.8, 0.16, 6.2, segs=8)

    # Indoor Great Hall Stair to 2F Minstrel/Archer Gallery (+21.08m -> +25.50m, flush with North Gallery z=-138.3!)
    w.stair((8.2, ky + 0.06, -129.5), (8.2, ky2, -138.3), width=1.9, steps=16, solid_under=False, mat_tread="aged_oak_timber", mat_wall="aged_oak_timber", seed=2760)
    w.solid_box("aged_oak_timber", (0.0, ky2 - 0.06, -140.6), (20.4, 0.20, 4.6))  # North 2F Gallery (z in [-142.9, -138.3])
    w.solid_box("aged_oak_timber", (-8.4, ky2 - 0.06, -134.5), (3.8, 0.20, 12.0))  # West 2F Gallery

    # Climbable West Sovereign Keep Watchtower (x in [-17.6, -10.8], z in [-140.0, -132.0], climbs +25.50m -> +30.50m Crown!)
    # Base tower masonry strictly below +25.4m (y=18.0..25.4m) so +25.5m deck is 100% open!
    w.sculpted_wall("citadel_masonry", (-14.2, 21.7, -136.0), (6.8, 7.4, 8.0), "+Z", seed=2762)
    w.solid_box("broken_flagstone", (-14.2, ky2 - 0.06, -136.0), (6.8, 0.22, 8.0))
    # Exterior Stone Stair along South-West Watchtower climbing +25.50m -> +30.50m Keep Crown Parapet!
    w.stair((-11.8, ky2, -133.2), (-15.8, 30.50, -133.2), width=1.85, steps=16, parapet_left=True, parapet_right=False, solid_under=False, seed=2764)
    # +30.50m Keep Crown Deck (leaves stairwell opening at x in [-15.8, -11.4], z in [-134.4, -132.0]) + Flush West Top Landing!
    w.solid_box("broken_flagstone", (-14.2, 30.44, -137.2), (7.0, 0.24, 5.6))
    w.solid_box("broken_flagstone", (-16.7, 30.44, -133.2), (1.8, 0.24, 2.6))
    w.crenellations((-17.5, 30.5, -139.8), 6.6, "+X", seed=2765)
    w.crenellations((-17.5, 30.5, -134.4), 5.4, "-Z", seed=2766)
    w.brazier((-14.2, 30.5, -137.5), scale=1.15)
    # Link West 2F Watchtower Deck (+25.5m) South-East down to West Barracks Roof Battlement (+23.5m)!
    w.stair((-14.2, ky2, -132.0), (-14.5, 23.50, -121.6), width=2.2, steps=12, parapet_left=True, parapet_right=True, solid_under=True, seed=2768)

    export_v5_model(w.b, "v5_cell07_castle", colliders=w.cols, oriented=w.oriented)

    wi = WorldMeshAdapter("v5_cell07_castle_interior", origin=(0.0, 18.0, -124.0), seed=2770)
    # Great Hall Pillars, Blazing War-Hearth, Council Table & Lord's Throne Dais!
    for gz in (-131.5, -135.5, -139.5):
        for gx in (-5.6, 5.6):
            wi.b.add_cylinder("limestone_weathered", wi.pt(gx, ky + 4.4, gz), 0.52, 0.46, 8.6, segs=8)
    wi.solid_box("cloth_crimson", (0.0, ky + 0.10, -134.5), (2.6, 0.03, 12.0), collide=False)
    wi.hewn_block("damp_slate_stone", (0.0, ky + 0.30, -134.0), (2.6, 0.44, 3.6), seed=2771)
    wi.solid_box("iron_forged", (-0.62, ky + 0.58, -134.0), (0.12, 0.22, 2.5), collide=False)
    wi.solid_box("iron_forged", (0.62, ky + 0.58, -134.0), (0.12, 0.22, 2.5), collide=False)
    for lz, rot_z in ((-133.2, 0.22), (-134.0, -0.18), (-134.8, 0.15)):
        wi.b.add_cylinder("aged_oak_timber", wi.pt(0.0, ky + 0.64, lz), 0.13, 0.11, 1.35, segs=7, rot=(0.0, 1.57, rot_z))
    wi.brazier((0.0, ky + 0.48, -133.2), scale=0.88)
    wi.brazier((0.0, ky + 0.48, -134.8), scale=0.88)
    # Lord's Throne Dais & High Seat at (0.0, ky, -140.5)
    wi.hewn_block("limestone_weathered", (0.0, ky + 0.32, -140.5), (5.2, 0.55, 3.2), seed=2772)
    wi.solid_box("aged_oak_timber", (0.0, ky + 1.45, -141.2), (1.35, 1.85, 0.95), collide=False)
    wi.solid_box("cloth_crimson", (0.0, ky + 1.45, -141.1), (1.05, 1.65, 0.12), collide=False)
    # Barracks bunks & Armory racks
    for bkz in (-114.5, -118.5):
        wi.solid_box("aged_oak_timber", (-18.5, by + 0.45, bkz), (2.0, 0.6, 1.1), collide=False)
    wi.solid_box("aged_oak_timber", (12.6, by + 0.85, -115.2), (0.9, 1.5, 2.2), collide=False)
    export_v5_model(wi.b, "v5_cell07_castle_interior", colliders=[], bake_ao=True)


# =============================================================================
# CELL 08: CITY-WIDE -4.0m UNDERCROFT EXTENSION (Barbican Tunnel, Wine Cellar & Castle Secret Vault)
# Origin: (0.0, -4.0, 0.0)
# Note: All ceiling slabs sit at world y = -0.82m (clear height 3.0m) -> 100% underneath y = 0.0m surface!
# =============================================================================
def build_cell08_undercroft_ext() -> None:
    w = WorldMeshAdapter("v5_cell08_undercroft_ext", origin=(0.0, -4.0, 0.0), seed=2801)

    def add_tunnel_ns(cx: float, z_south: float, z_north: float, open_east_z: tuple[float, float] | None = None, open_west_z: tuple[float, float] | None = None) -> None:
        z_mid = (z_south + z_north) * 0.5
        length = abs(z_south - z_north)
        # Floor & Roof (-4.0m floor, -0.82m roof -> 3.0m clear headroom)
        w.solid_box("damp_slate_stone", (cx, -4.12, z_mid), (3.8, 0.24, length + 0.4))
        w.solid_box("citadel_masonry", (cx, -0.82, z_mid), (4.2, 0.36, length + 0.4))
        # West wall (x = cx - 1.9)
        if open_west_z is None:
            w.solid_box("damp_slate_stone", (cx - 1.9, -2.45, z_mid), (0.45, 3.2, length + 0.4))
        else:
            za, zb = min(open_west_z), max(open_west_z)
            if za > z_north + 0.2:
                w.solid_box("damp_slate_stone", (cx - 1.9, -2.45, (z_north + za) * 0.5), (0.45, 3.2, za - z_north))
            if z_south > zb + 0.2:
                w.solid_box("damp_slate_stone", (cx - 1.9, -2.45, (zb + z_south) * 0.5), (0.45, 3.2, z_south - zb))
        # East wall (x = cx + 1.9)
        if open_east_z is None:
            w.solid_box("damp_slate_stone", (cx + 1.9, -2.45, z_mid), (0.45, 3.2, length + 0.4))
        else:
            za, zb = min(open_east_z), max(open_east_z)
            if za > z_north + 0.2:
                w.solid_box("damp_slate_stone", (cx + 1.9, -2.45, (z_north + za) * 0.5), (0.45, 3.2, za - z_north))
            if z_south > zb + 0.2:
                w.solid_box("damp_slate_stone", (cx + 1.9, -2.45, (zb + z_south) * 0.5), (0.45, 3.2, z_south - zb))
        # Stone ribs & cage lanterns every ~9m
        n_ribs = max(1, int(length / 9.0))
        for k in range(n_ribs):
            rz = z_south - (k + 0.5) * (length / n_ribs)
            w.gothic_arch((cx, -4.0, rz), half_span=1.62, spring_h=1.75, apex_rise=1.1, depth=0.45, along_world_axis="Z", ring_thick=0.26)
            if k % 2 == 0:
                w.lantern((cx - 1.45, -1.75, rz), scale=0.82)

    def add_tunnel_ew(cz: float, x_west: float, x_east: float) -> None:
        x_mid = (x_west + x_east) * 0.5
        length = abs(x_east - x_west)
        w.solid_box("damp_slate_stone", (x_mid, -4.12, cz), (length + 0.4, 0.24, 3.8))
        w.solid_box("citadel_masonry", (x_mid, -0.82, cz), (length + 0.4, 0.36, 4.2))
        w.solid_box("damp_slate_stone", (x_mid, -2.45, cz + 1.9), (length + 0.4, 3.2, 0.45))
        w.solid_box("damp_slate_stone", (x_mid, -2.45, cz - 1.9), (length + 0.4, 3.2, 0.45))
        n_ribs = max(1, int(length / 8.0))
        for k in range(n_ribs):
            rx = x_west + (k + 0.5) * (length / n_ribs)
            w.gothic_arch((rx, -4.0, cz), half_span=1.62, spring_h=1.75, apex_rise=1.1, depth=0.45, along_world_axis="X", ring_thick=0.26)

    # 1. South Barbican Tunnel: x = -12.5, z = +16.6 -> -5.1 (opens East at z in [11.2, 14.8] for Tavern Cellar Cross-Tunnel!)
    add_tunnel_ns(-12.5, 16.6, -5.1, open_east_z=(11.2, 14.8))

    # 2. Tavern Wine Cellar Room (x in [10.4, 15.6], z in [11.2, 16.2]) & Cross-Tunnel along z = 13.0 (x = -10.8 -> +10.6)
    add_tunnel_ew(13.0, -10.8, 10.6)
    w.solid_box("damp_slate_stone", (13.0, -4.12, 13.7), (5.4, 0.24, 5.2))
    w.solid_box("citadel_masonry", (13.0, -0.82, 15.0), (5.6, 0.36, 2.8))  # Leave z in [11.2, 13.6] open overhead for stair!
    w.solid_box("damp_slate_stone", (15.6, -2.45, 13.7), (0.5, 3.2, 5.2))
    w.solid_box("damp_slate_stone", (13.0, -2.45, 16.2), (5.4, 3.2, 0.5))
    # Wine Cellar Oak Casks & Lantern
    for kz in (14.4, 15.4):
        w.b.add_cylinder("aged_oak_timber", w.pt(11.6, -3.45, kz), 0.44, 0.40, 1.02, segs=10)
    w.lantern((14.6, -1.85, 14.8), scale=0.88)

    # 3. Northern Castle Drainage Tunnel & Secret Treasury Vault!
    # East Connector from Cistern East Arch (-9.7, -4.0, -21.0) -> (+2.0, -4.0, -21.0)
    add_tunnel_ew(-21.0, -9.8, 0.3)
    # Corner Junction Chamber at (+2.0, -4.0, -21.0)
    w.solid_box("damp_slate_stone", (2.0, -4.12, -21.0), (4.0, 0.24, 4.0))
    w.solid_box("citadel_masonry", (2.0, -0.82, -21.0), (4.2, 0.36, 4.2))
    w.solid_box("damp_slate_stone", (2.0, -2.45, -19.1), (4.0, 3.2, 0.45))
    w.solid_box("damp_slate_stone", (3.9, -2.45, -21.0), (0.45, 3.2, 4.0))
    # Main North Spine Tunnel: x = +2.0, z = -22.8 -> -119.2
    add_tunnel_ns(2.0, -22.8, -119.2)
    # North Corner Junction at (+2.0, -4.0, -121.0) turning East into Castle Secret Treasury Vault (x = +3.8 -> +13.2, z = -121.0)!
    w.solid_box("damp_slate_stone", (2.0, -4.12, -121.0), (4.0, 0.24, 4.0))
    w.solid_box("citadel_masonry", (2.0, -0.82, -121.0), (4.2, 0.36, 4.2))
    w.solid_box("damp_slate_stone", (0.1, -2.45, -121.0), (0.45, 3.2, 4.0))
    w.solid_box("damp_slate_stone", (2.0, -2.45, -122.9), (4.0, 3.2, 0.45))

    # Castle Secret Treasury Vault Hall (x in [3.8, 13.2], z in [-123.5, -118.5], meets Castle Armory Shaft at x=13.2!)
    w.solid_box("damp_slate_stone", (8.5, -4.12, -121.0), (9.8, 0.24, 5.4))
    w.solid_box("citadel_masonry", (8.5, -0.65, -121.0), (9.8, 0.40, 5.6))
    w.solid_box("damp_slate_stone", (8.5, -2.35, -118.4), (9.8, 3.5, 0.5))
    w.solid_box("damp_slate_stone", (8.5, -2.35, -123.6), (9.8, 3.5, 0.5))
    # Seal North & South East-Arch Jambs where Vault (z=-123.6..-118.4) meets Armory Shaft (x=13.8, z=-122.9..-119.8)
    w.solid_box("damp_slate_stone", (13.6, -2.35, -123.1), (1.1, 3.6, 1.5))
    w.solid_box("damp_slate_stone", (13.6, -2.35, -119.0), (1.1, 3.6, 1.6))
    for vx in (5.8, 10.8):
        w.gothic_arch((vx, -4.0, -121.0), half_span=2.1, spring_h=1.85, apex_rise=1.25, depth=0.55, along_world_axis="X")
    # Ornate Royal Vault Chest tucked at (8.5, -4.0, -122.6)
    w.solid_box("aged_oak_timber", (8.5, -3.55, -122.6), (1.35, 0.85, 0.85), collide=False)
    w.solid_box("brass_aged", (8.5, -3.45, -122.6), (1.39, 0.12, 0.89), collide=False)
    w.lantern((8.5, -1.65, -119.2), scale=0.95)

    export_v5_model(w.b, "v5_cell08_undercroft_ext", colliders=w.cols, oriented=w.oriented)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT_DIR / "v5_manifest.json"
    if manifest_path.exists():
        try:
            V5_MANIFEST.update(json.loads(manifest_path.read_text(encoding="utf-8")))
        except Exception:
            pass

    only_filters: list[str] = []
    if "--" in sys.argv:
        only_filters = sys.argv[sys.argv.index("--") + 1 :]

    builders = [
        ("v5_cell01_barbican", build_cell01_barbican),
        ("v5_cell02_trade_annex", build_cell02_trade_annex),
        ("v5_cell03_market_guildshop", build_cell03_market_guildshop),
        ("v5_cell04_artisan", build_cell04_artisan),
        ("v5_cell05_residential", build_cell05_residential),
        ("v5_cell06_temple", build_cell06_temple),
        ("v5_cell07_castle", build_cell07_castle),
        ("v5_cell08_undercroft_ext", build_cell08_undercroft_ext),
    ]
    for label, fn in builders:
        if only_filters and not any(f in label for f in only_filters):
            continue
        print(f"[v5_interconnected_kit] Building {label}...", flush=True)
        fn()

    manifest_path.write_text(json.dumps(V5_MANIFEST, indent=2), encoding="utf-8")
    print(f"[v5_interconnected_kit] Exported {len(V5_MANIFEST)} V5 GLBs + manifest -> {manifest_path}", flush=True)


if __name__ == "__main__":
    main()
