#!/usr/bin/env python3
"""
Blender 4.0+ headless Python asset generator for Ashenhold (灰烬城) Phase 1.
Generates beveled, UV-mapped, vertex-AO-baked modular medieval architecture
and street props as .glb files in public/assets/city/models/.

Run via:
  blender --background --python scripts/city/generate_models.py
"""
import math
import random
from pathlib import Path
import bpy
import bmesh
from mathutils import Matrix, Vector, Euler
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "public" / "assets" / "city" / "models"

# Material definitions matching CityMaterialLibrary keys in TypeScript.
# Base colors act as readable fallbacks; CityAssetLoader replaces by material name.
MATERIAL_SPECS = {
    "limestone_weathered": ((0.56, 0.53, 0.48, 1.0), 0.84, 0.02, 2.6),
    "citadel_masonry":     ((0.49, 0.47, 0.44, 1.0), 0.86, 0.02, 2.4),
    "damp_slate_stone":    ((0.36, 0.37, 0.38, 1.0), 0.72, 0.04, 2.2),
    "aged_oak_timber":     ((0.26, 0.18, 0.12, 1.0), 0.80, 0.02, 1.8),
    "broken_flagstone":    ((0.46, 0.44, 0.41, 1.0), 0.82, 0.02, 2.6),
    "mountain_crag_rock":  ((0.38, 0.36, 0.34, 1.0), 0.90, 0.02, 3.2),
    "stone_ashlar":   ((0.48, 0.46, 0.42, 1.0), 0.85, 0.04, 2.2),
    "stone_trim":     ((0.36, 0.36, 0.37, 1.0), 0.80, 0.06, 2.0),
    "brick_medieval": ((0.52, 0.30, 0.24, 1.0), 0.84, 0.02, 2.0),
    "timber_oak":     ((0.24, 0.16, 0.10, 1.0), 0.82, 0.02, 1.6),
    "planks_oak":     ((0.38, 0.25, 0.15, 1.0), 0.80, 0.02, 1.6),
    "plaster_cream":  ((0.76, 0.70, 0.60, 1.0), 0.90, 0.00, 2.2),
    "plaster_ochre":  ((0.72, 0.58, 0.38, 1.0), 0.90, 0.00, 2.2),
    "plaster_sage":   ((0.55, 0.59, 0.50, 1.0), 0.90, 0.00, 2.2),
    "plaster_terracotta": ((0.68, 0.48, 0.38, 1.0), 0.90, 0.00, 2.2),
    "roof_slate":     ((0.24, 0.27, 0.31, 1.0), 0.74, 0.05, 1.8),
    "roof_clay":      ((0.49, 0.24, 0.17, 1.0), 0.78, 0.03, 1.8),
    "iron_forged":    ((0.22, 0.23, 0.26, 1.0), 0.44, 0.86, 1.0),
    "brass_aged":     ((0.68, 0.52, 0.25, 1.0), 0.34, 0.88, 1.0),
    "window_leaded":  ((0.46, 0.38, 0.26, 1.0), 0.22, 0.10, 1.0),
    "banner_ashenhold": ((0.50, 0.12, 0.12, 1.0), 0.88, 0.00, 1.0),
    "awning_striped": ((0.65, 0.30, 0.22, 1.0), 0.88, 0.00, 1.0),
    "awning_navy":    ((0.26, 0.36, 0.54, 1.0), 0.88, 0.00, 1.0),
    "awning_emerald": ((0.28, 0.46, 0.32, 1.0), 0.88, 0.00, 1.0),
    "awning_ochre":   ((0.70, 0.52, 0.24, 1.0), 0.88, 0.00, 1.0),
    "awning_plum":    ((0.48, 0.26, 0.36, 1.0), 0.88, 0.00, 1.0),
    "cloth_crimson":  ((0.54, 0.20, 0.16, 1.0), 0.90, 0.00, 1.2),
    "cloth_navy":     ((0.20, 0.30, 0.46, 1.0), 0.90, 0.00, 1.2),
    "cloth_emerald":  ((0.24, 0.42, 0.28, 1.0), 0.90, 0.00, 1.2),
    "cloth_ochre":    ((0.68, 0.50, 0.22, 1.0), 0.90, 0.00, 1.2),
    "cloth_linen":    ((0.78, 0.72, 0.62, 1.0), 0.90, 0.00, 1.2),
    "sign_tavern":    ((0.45, 0.32, 0.18, 1.0), 0.72, 0.04, 1.0),
    "sign_apothecary": ((0.42, 0.34, 0.22, 1.0), 0.72, 0.04, 1.0),
    "sign_bakery":    ((0.52, 0.36, 0.20, 1.0), 0.72, 0.04, 1.0),
    "sign_smithy":    ((0.38, 0.34, 0.28, 1.0), 0.72, 0.04, 1.0),
    "sign_market":    ((0.46, 0.36, 0.22, 1.0), 0.72, 0.04, 1.0),
    "fabric_sack":    ((0.52, 0.43, 0.30, 1.0), 0.92, 0.00, 1.2),
    "ceramic_clay":   ((0.58, 0.34, 0.22, 1.0), 0.55, 0.04, 1.0),
    "foliage_leaf":   ((0.22, 0.36, 0.18, 1.0), 0.82, 0.00, 1.2),
    "glow_warm":      ((1.00, 0.76, 0.42, 1.0), 0.35, 0.00, 1.0),
    "ember_forge":    ((1.00, 0.35, 0.08, 1.0), 0.45, 0.00, 1.0),
}

MAT_CACHE = {}


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MAT_CACHE.clear()
    for name, (rgba, rough, metal, _uv) in MATERIAL_SPECS.items():
        mat = bpy.data.materials.new(name=name)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        bsdf = nodes.get("Principled BSDF")
        if bsdf:
            vc = nodes.new("ShaderNodeVertexColor")
            vc.layer_name = "Col"
            links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
            bsdf.inputs["Roughness"].default_value = rough
            bsdf.inputs["Metallic"].default_value = metal
            if name in ("glow_warm", "window_leaded"):
                em_col = (1.0, 0.68, 0.30, 1.0) if name == "glow_warm" else (0.95, 0.68, 0.32, 1.0)
                em_str = 1.6 if name == "glow_warm" else 0.45
                if "Emission Color" in bsdf.inputs:
                    bsdf.inputs["Emission Color"].default_value = em_col
                    bsdf.inputs["Emission Strength"].default_value = em_str
        MAT_CACHE[name] = mat


class MeshBuilder:
    def __init__(self, name: str, seed: int = 42):
        self.name = name
        self.rng = random.Random(seed)
        self.bm = bmesh.new()
        self.mat_names: list[str] = []
        self.mat_map: dict[str, int] = {}
        self.uv_layer = self.bm.loops.layers.uv.new("UVMap")
        self.custom_uv_layer = self.bm.faces.layers.int.new("custom_uv")

    def mat_idx(self, mat_name: str) -> int:
        if mat_name not in self.mat_map:
            self.mat_map[mat_name] = len(self.mat_names)
            self.mat_names.append(mat_name)
        return self.mat_map[mat_name]

    def _transform_verts(self, verts, xform: Matrix | None):
        if xform is not None:
            bmesh.ops.transform(self.bm, matrix=xform, verts=verts)

    def add_box(
        self,
        mat_name: str,
        center: tuple[float, float, float],
        size: tuple[float, float, float],
        bevel: float = 0.0,
        rot: tuple[float, float, float] | None = None,
        mark_custom_uv: bool = False,
    ) -> list:
        sx, sy, sz = size
        m = Matrix.Identity(4)
        if rot is not None:
            m = Euler(rot, "XYZ").to_matrix().to_4x4()
        m.translation = Vector(center)

        ret = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = ret["verts"]
        for v in verts:
            v.co.x *= sx
            v.co.y *= sy
            v.co.z *= sz

        faces_set = set()
        for v in verts:
            for f in v.link_faces:
                faces_set.add(f)

        mi = self.mat_idx(mat_name)
        for f in faces_set:
            f.material_index = mi

        if bevel > 0.001:
            edges = list({e for f in faces_set if f.is_valid for e in f.edges})
            b_ret = bmesh.ops.bevel(
                self.bm,
                geom=edges,
                offset=min(bevel, min(sx, sy, sz) * 0.25),
                segments=1,
                affect="EDGES",
                clamp_overlap=True,
            )
            faces_set = {f for f in faces_set if f.is_valid}
            for f in b_ret.get("faces", []):
                if f.is_valid:
                    f.material_index = mi
                    faces_set.add(f)
            verts = list({v for f in faces_set if f.is_valid for v in f.verts})

        self._transform_verts(verts, m)
        if mark_custom_uv:
            for f in faces_set:
                if f.is_valid:
                    f[self.custom_uv_layer] = 1
        return [f for f in faces_set if f.is_valid]

    def add_planar_quad(
        self,
        mat_name: str,
        p0: tuple[float, float, float],
        p1: tuple[float, float, float],
        p2: tuple[float, float, float],
        p3: tuple[float, float, float],
        double_sided: bool = False,
    ):
        mi = self.mat_idx(mat_name)
        vs = [self.bm.verts.new(p) for p in (p0, p1, p2, p3)]
        f = self.bm.faces.new(vs)
        f.material_index = mi
        uvs = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
        for loop, uv in zip(f.loops, uvs):
            loop[self.uv_layer].uv = uv
        f[self.custom_uv_layer] = 1
        if double_sided:
            vs2 = [self.bm.verts.new(p) for p in (p3, p2, p1, p0)]
            f2 = self.bm.faces.new(vs2)
            f2.material_index = mi
            uvs2 = [(0.0, 1.0), (1.0, 1.0), (1.0, 0.0), (0.0, 0.0)]
            for loop, uv in zip(f2.loops, uvs2):
                loop[self.uv_layer].uv = uv
            f2[self.custom_uv_layer] = 1

    def add_cylinder(
        self,
        mat_name: str,
        center: tuple[float, float, float],
        r_bottom: float,
        r_top: float,
        height: float,
        segs: int = 12,
        bevel: float = 0.0,
        rot: tuple[float, float, float] | None = None,
    ):
        mi = self.mat_idx(mat_name)
        ret = bmesh.ops.create_cone(
            self.bm,
            cap_ends=True,
            cap_tris=False,
            segments=segs,
            radius1=r_bottom,
            radius2=r_top,
            depth=height,
        )
        verts = ret["verts"]
        faces_set = {f for v in verts for f in v.link_faces}
        for f in faces_set:
            f.material_index = mi
            f.smooth = segs >= 10
        if bevel > 0.001:
            cap_edges = [
                e for e in {e for f in faces_set if f.is_valid for e in f.edges}
                if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4
            ]
            b_ret = bmesh.ops.bevel(
                self.bm, geom=cap_edges, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True
            )
            faces_set = {f for f in faces_set if f.is_valid}
            for f in b_ret.get("faces", []):
                if f.is_valid:
                    f.material_index = mi
                    f.smooth = segs >= 10
                    faces_set.add(f)
            verts = list({v for f in faces_set if f.is_valid for v in f.verts})
        m = Matrix.Identity(4)
        if rot is not None:
            m = Euler(rot, "XYZ").to_matrix().to_4x4()
        m.translation = Vector(center)
        self._transform_verts(verts, m)

    def add_lathe_profile(
        self,
        mat_name: str,
        profile: list[tuple[float, float]],
        segs: int = 14,
        center: tuple[float, float, float] = (0, 0, 0),
        rot: tuple[float, float, float] | None = None,
        smooth: bool = True,
    ):
        """Revolve (radius, z) profile around local Z axis."""
        mi = self.mat_idx(mat_name)
        rings = []
        for r, z in profile:
            if r <= 1e-4:
                v = self.bm.verts.new((0.0, 0.0, z))
                rings.append([v])
            else:
                ring = []
                for s in range(segs):
                    a = (s / segs) * math.tau
                    ring.append(self.bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
                rings.append(ring)

        created_faces = []
        for i in range(len(rings) - 1):
            r0 = rings[i]
            r1 = rings[i + 1]
            if len(r0) == 1 and len(r1) > 1:
                for s in range(segs):
                    ns = (s + 1) % segs
                    f = self.bm.faces.new((r0[0], r1[s], r1[ns]))
                    created_faces.append(f)
            elif len(r0) > 1 and len(r1) == 1:
                for s in range(segs):
                    ns = (s + 1) % segs
                    f = self.bm.faces.new((r0[s], r1[0], r0[ns]))
                    created_faces.append(f)
            elif len(r0) > 1 and len(r1) > 1:
                for s in range(segs):
                    ns = (s + 1) % segs
                    f = self.bm.faces.new((r0[s], r0[ns], r1[ns], r1[s]))
                    created_faces.append(f)

        for f in created_faces:
            f.material_index = mi
            f.smooth = smooth

        all_verts = list({v for ring in rings for v in ring})
        m = Matrix.Identity(4)
        if rot is not None:
            m = Euler(rot, "XYZ").to_matrix().to_4x4()
        m.translation = Vector(center)
        self._transform_verts(all_verts, m)

    def add_wedge_block(
        self,
        mat_name: str,
        pts_xz: list[tuple[float, float]],
        y_center: float,
        depth: float,
        bevel: float = 0.015,
        rot: tuple[float, float, float] | None = None,
        offset: tuple[float, float, float] = (0, 0, 0),
    ):
        """Extrude a 2D polygon in XZ along Y (depth) for voussoirs, gables, curved braces."""
        mi = self.mat_idx(mat_name)
        hy = depth * 0.5
        front = [self.bm.verts.new((px, y_center - hy, pz)) for px, pz in pts_xz]
        back = [self.bm.verts.new((px, y_center + hy, pz)) for px, pz in pts_xz]
        n = len(pts_xz)
        faces = [
            self.bm.faces.new(front),
            self.bm.faces.new(list(reversed(back))),
        ]
        for i in range(n):
            ni = (i + 1) % n
            faces.append(self.bm.faces.new((front[ni], front[i], back[i], back[ni])))

        for f in faces:
            f.material_index = mi

        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        faces_set = set(faces)
        if bevel > 0.001:
            edges = list({e for f in faces_set if f.is_valid for e in f.edges})
            b_ret = bmesh.ops.bevel(
                self.bm, geom=edges, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True
            )
            faces_set = {f for f in faces_set if f.is_valid}
            for f in b_ret.get("faces", []):
                if f.is_valid:
                    f.material_index = mi
                    faces_set.add(f)
        verts = list({v for f in faces_set if f.is_valid for v in f.verts})
        m = Matrix.Identity(4)
        if rot is not None:
            m = Euler(rot, "XYZ").to_matrix().to_4x4()
        m.translation = Vector(offset)
        self._transform_verts(verts, m)

    def add_stone_arch(
        self,
        mat_name: str,
        center: tuple[float, float, float],
        radius: float,
        depth: float,
        ring_thickness: float = 0.36,
        num_voussoirs: int = 11,
        facing_axis: str = "Y",
    ):
        """True semicircular arch composed of beveled wedge voussoirs + oversized keystone."""
        cx, cy, cz = center
        mid = num_voussoirs // 2
        for i in range(num_voussoirs):
            a0 = (i / num_voussoirs) * math.pi + 0.015
            a1 = ((i + 1) / num_voussoirs) * math.pi - 0.015
            is_key = i == mid
            r_out = radius + ring_thickness + (0.09 if is_key else 0.0)
            r_in = radius - (0.04 if is_key else 0.0)
            d = depth + (0.10 if is_key else 0.04)

            p0 = (math.cos(a1) * r_in, math.sin(a1) * r_in)
            p1 = (math.cos(a0) * r_in, math.sin(a0) * r_in)
            p2 = (math.cos(a0) * r_out, math.sin(a0) * r_out)
            p3 = (math.cos(a1) * r_out, math.sin(a1) * r_out)

            if facing_axis == "Y":
                self.add_wedge_block(mat_name, [p0, p1, p2, p3], 0.0, d, bevel=0.018, offset=(cx, cy, cz))
            else:
                self.add_wedge_block(
                    mat_name, [p0, p1, p2, p3], 0.0, d, bevel=0.018, rot=(0, 0, math.pi / 2), offset=(cx, cy, cz)
                )

    def add_stone_quoins(
        self,
        mat_name: str,
        corner_x: float,
        corner_y: float,
        z0: float,
        z1: float,
        sign_x: float,
        sign_y: float,
        course_h: float = 0.44,
    ):
        """Alternating long-and-short projecting beveled corner stone quoins."""
        z = z0 + course_h * 0.5
        idx = 0
        while z + course_h * 0.45 <= z1:
            long_x = (idx % 2 == 0)
            lx = 0.56 if long_x else 0.34
            ly = 0.34 if long_x else 0.56
            cx = corner_x + sign_x * (lx * 0.5 - 0.04)
            cy = corner_y + sign_y * (ly * 0.5 - 0.04)
            self.add_box(mat_name, (cx, cy, z), (lx, ly, course_h - 0.03), bevel=0.018)
            z += course_h
            idx += 1

    def add_jetty_brace(
        self,
        mat_name: str,
        base_pos: tuple[float, float, float],
        direction: tuple[float, float],
        reach: float = 0.42,
        height: float = 0.72,
        thickness: float = 0.14,
    ):
        """Curved chamfered oak knee brace supporting cantilevered upper floor."""
        dx, dy = direction
        rot_z = math.atan2(dx, -dy)
        # Build arched brace polygon in YZ, rotate around Z
        pts = [
            (0.0, 0.0),
            (0.11, 0.0),
            (0.18, height * 0.45),
            (reach, height - 0.12),
            (reach, height),
            (0.0, height),
            (0.0, height - 0.14),
            (reach * 0.55, height * 0.72),
            (0.09, height * 0.35),
        ]
        # Convert YZ pts -> XZ pts then rotate around Z by rot_z + pi/2
        self.add_wedge_block(
            mat_name,
            pts,
            0.0,
            thickness,
            bevel=0.012,
            rot=(0.0, 0.0, math.atan2(dy, dx)),
            offset=base_pos,
        )

    def add_recessed_window(
        self,
        center: tuple[float, float, float],
        width: float,
        height: float,
        facing_normal: tuple[float, float],
        frame_mat: str = "timber_oak",
        sill_mat: str = "stone_trim",
        shutter_mat: str = "planks_oak",
        with_shutters: bool = True,
        with_flowerbox: bool = False,
        glow: bool = True,
    ):
        """Recessed multi-part casement window with sill, frame, mullions, glass, shutters, flower box."""
        nx, ny = facing_normal
        yaw = math.atan2(ny, nx) - math.pi / 2  # +X normal -> -pi/2, -Y normal -> pi
        # Build local frame along local X=width, local Y=outward (-normal vs +normal), Z=height
        # Wait: let local +Y be outward normal, so yaw = atan2(ny, nx) - pi/2?
        # Check: local (0, 1, 0) rotated by yaw around Z: (-sin(yaw), cos(yaw), 0)
        # Want (-sin(yaw), cos(yaw)) = (nx, ny) => yaw = atan2(-nx, ny)
        yaw = math.atan2(-nx, ny)
        cx, cy, cz = center

        def place_box(mat, lx, ly, lz, sx, sy, sz, bev=0.008, extra_rz=0.0):
            ca, sa = math.cos(yaw), math.sin(yaw)
            wx = cx + lx * ca - ly * sa
            wy = cy + lx * sa + ly * ca
            wz = cz + lz
            self.add_box(mat, (wx, wy, wz), (sx, sy, sz), bevel=bev, rot=(0.0, 0.0, yaw + extra_rz))

        # Recessed dark backing glass plane inside wall recess
        glass_mat = "glow_warm" if glow else "window_leaded"
        place_box("window_leaded", 0.0, -0.06, 0.0, width - 0.14, 0.04, height - 0.14, bev=0.0)
        if glow:
            # Soft glowing interior pane slightly behind leaded cames
            place_box("glow_warm", 0.0, -0.09, 0.0, width - 0.18, 0.02, height - 0.18, bev=0.0)

        # Outer timber/stone frame jambs (standing proud +0.06m)
        fw = 0.11
        place_box(frame_mat, -width * 0.5 + fw * 0.5, 0.02, 0.0, fw, 0.18, height, bev=0.012)
        place_box(frame_mat, width * 0.5 - fw * 0.5, 0.02, 0.0, fw, 0.18, height, bev=0.012)
        # Projecting top lintel / drip hood
        place_box(sill_mat, 0.0, 0.06, height * 0.5 + 0.05, width + 0.24, 0.26, 0.14, bev=0.016)
        # Sloped projecting stone/wood sill
        place_box(sill_mat, 0.0, 0.07, -height * 0.5 - 0.05, width + 0.22, 0.28, 0.13, bev=0.016)

        # Center mullion & transom bars
        place_box(frame_mat, 0.0, -0.01, 0.0, 0.065, 0.09, height - 0.12, bev=0.006)
        place_box(frame_mat, 0.0, -0.01, 0.05, width - 0.12, 0.09, 0.065, bev=0.006)

        if with_shutters:
            sw = (width - 0.14) * 0.5
            sh = height - 0.16
            ang_l = self.rng.uniform(0.22, 0.42)
            ang_r = -self.rng.uniform(0.20, 0.40)
            place_box(shutter_mat, -width * 0.5 - sw * 0.48, 0.08, 0.0, sw, 0.055, sh, bev=0.008, extra_rz=ang_l)
            place_box(shutter_mat, width * 0.5 + sw * 0.48, 0.08, 0.0, sw, 0.055, sh, bev=0.008, extra_rz=ang_r)
            # Iron hinge straps
            place_box("iron_forged", -width * 0.5 - sw * 0.46, 0.105, sh * 0.3, sw * 0.85, 0.02, 0.05, bev=0.004, extra_rz=ang_l)
            place_box("iron_forged", -width * 0.5 - sw * 0.46, 0.105, -sh * 0.3, sw * 0.85, 0.02, 0.05, bev=0.004, extra_rz=ang_l)
            place_box("iron_forged", width * 0.5 + sw * 0.46, 0.105, sh * 0.3, sw * 0.85, 0.02, 0.05, bev=0.004, extra_rz=ang_r)
            place_box("iron_forged", width * 0.5 + sw * 0.46, 0.105, -sh * 0.3, sw * 0.85, 0.02, 0.05, bev=0.004, extra_rz=ang_r)

        if with_flowerbox:
            bw = width + 0.06
            place_box("timber_oak", 0.0, 0.16, -height * 0.5 - 0.14, bw, 0.24, 0.22, bev=0.01)
            # Lush green shrub clusters in planter box
            num_leaves = max(4, int(bw * 4))
            for k in range(num_leaves):
                lx = -bw * 0.4 + (k / max(1, num_leaves - 1)) * bw * 0.8 + self.rng.uniform(-0.04, 0.04)
                lz = -height * 0.5 + 0.02 + self.rng.uniform(-0.03, 0.05)
                ly = 0.17 + self.rng.uniform(-0.04, 0.04)
                place_box("foliage_leaf", lx, ly, lz, 0.18, 0.18, 0.16, bev=0.04, extra_rz=self.rng.uniform(0, 1.5))

    def add_pitched_tiled_roof(
        self,
        roof_mat: str,
        trim_mat: str,
        center: tuple[float, float, float],
        length: float,
        half_span: float,
        rise: float,
        along_axis: str = "Y",
        overhang: float = 0.55,
        eave_rafters: bool = True,
        with_3d_tiles: bool = True,
    ):
        """Steep pitched roof with sheathing, bargeboards, exposed rafter tails, ridge cap & 3D tile courses."""
        cx, cy, cz = center
        total_span = half_span + overhang
        slope_len = math.hypot(total_span, rise * (total_span / half_span))
        slope_ang = math.atan2(rise, half_span)
        ridge_z = cz + rise
        total_len = length + overhang * 2.0

        for side in (-1, 1):
            ang = side * slope_ang
            mid_d = side * total_span * 0.5
            mid_z = ridge_z - (total_span * 0.5) * math.tan(slope_ang)

            if along_axis == "Y":
                # Roof sheathing running along Y, sloping in X
                self.add_box(
                    roof_mat, (cx + mid_d, cy, mid_z), (slope_len, total_len, 0.14), bevel=0.015, rot=(0.0, ang, 0.0)
                )
                # Gable bargeboards at both ends (+Y and -Y)
                for end_s in (-1, 1):
                    by = cy + end_s * (total_len * 0.5 - 0.06)
                    self.add_box(
                        trim_mat, (cx + mid_d, by, mid_z - 0.06), (slope_len + 0.08, 0.12, 0.24), bevel=0.015, rot=(0.0, ang, 0.0)
                    )
                # 3D overlapping shingle/tile courses along slope
                if with_3d_tiles:
                    courses = max(5, int(slope_len / 0.44))
                    cols = max(6, int(total_len / 0.52))
                    for r in range(courses):
                        t = (r + 0.4) / courses
                        dist_down = t * (slope_len - 0.18)
                        tz = ridge_z - dist_down * math.sin(slope_ang) + 0.09
                        tx = cx + side * dist_down * math.cos(slope_ang)
                        for c in range(cols):
                            stagger = 0.24 if (r % 2 == 1) else 0.0
                            ty = cy - total_len * 0.48 + ((c + 0.5) / cols) * (total_len * 0.96) + stagger * 0.2
                            if abs(ty - cy) > total_len * 0.48:
                                continue
                            jitter_p = self.rng.uniform(-0.025, 0.025)
                            self.add_box(
                                roof_mat,
                                (tx, ty, tz),
                                (0.44, total_len / cols - 0.025, 0.045),
                                bevel=0.0,
                                rot=(0.0, ang - side * 0.055 + jitter_p, 0.0),
                            )
            else:
                # Roof sheathing running along X, sloping in Y
                self.add_box(
                    roof_mat, (cx, cy + mid_d, mid_z), (total_len, slope_len, 0.14), bevel=0.015, rot=(-ang, 0.0, 0.0)
                )
                for end_s in (-1, 1):
                    bx = cx + end_s * (total_len * 0.5 - 0.06)
                    self.add_box(
                        trim_mat, (bx, cy + mid_d, mid_z - 0.06), (0.12, slope_len + 0.08, 0.24), bevel=0.015, rot=(-ang, 0.0, 0.0)
                    )
                if with_3d_tiles:
                    courses = max(5, int(slope_len / 0.44))
                    cols = max(6, int(total_len / 0.52))
                    for r in range(courses):
                        t = (r + 0.4) / courses
                        dist_down = t * (slope_len - 0.18)
                        tz = ridge_z - dist_down * math.sin(slope_ang) + 0.09
                        ty = cy + side * dist_down * math.cos(slope_ang)
                        for c in range(cols):
                            tx = cx - total_len * 0.48 + ((c + 0.5) / cols) * (total_len * 0.96)
                            jitter_p = self.rng.uniform(-0.025, 0.025)
                            self.add_box(
                                roof_mat,
                                (tx, ty, tz),
                                (total_len / cols - 0.025, 0.44, 0.045),
                                bevel=0.0,
                                rot=(-ang + side * 0.055 + jitter_p, 0.0, 0.0),
                            )

        # Exposed carved rafter tails under eaves
        if eave_rafters:
            num_rafters = max(4, int(total_len / 0.85))
            for k in range(num_rafters):
                off = -total_len * 0.46 + (k / max(1, num_rafters - 1)) * (total_len * 0.92)
                for side in (-1, 1):
                    ang = side * slope_ang
                    rx = side * (half_span + overhang * 0.45)
                    rz = cz - overhang * 0.45 * math.tan(slope_ang) - 0.08
                    if along_axis == "Y":
                        self.add_box(trim_mat, (cx + rx, cy + off, rz), (overhang * 1.15, 0.11, 0.15), bevel=0.01, rot=(0.0, ang, 0.0))
                    else:
                        self.add_box(trim_mat, (cx + off, cy + rx, rz), (0.11, overhang * 1.15, 0.15), bevel=0.01, rot=(-ang, 0.0, 0.0))

        # Carved Ridge Pole & Terracotta/Stone Ridge Cresting
        if along_axis == "Y":
            self.add_box(trim_mat, (cx, cy, ridge_z + 0.06), (0.28, total_len + 0.12, 0.22), bevel=0.03)
        else:
            self.add_box(trim_mat, (cx, cy, ridge_z + 0.06), (total_len + 0.12, 0.28, 0.22), bevel=0.03)

    def add_chimney(self, stone_mat: str, trim_mat: str, center_xy: tuple[float, float], z0: float, z1: float, width: float = 0.95):
        cx, cy = center_xy
        h = z1 - z0
        self.add_box(stone_mat, (cx, cy, z0 + h * 0.5), (width, width, h), bevel=0.025)
        self.add_box(trim_mat, (cx, cy, z0 + h * 0.65), (width + 0.14, width + 0.14, 0.22), bevel=0.02)
        self.add_box(trim_mat, (cx, cy, z1 + 0.1), (width + 0.24, width + 0.24, 0.22), bevel=0.025)
        # Octagonal clay chimney pot
        self.add_cylinder("roof_clay", (cx, cy, z1 + 0.42), 0.18, 0.15, 0.44, segs=8, bevel=0.015)

    def finalize_and_export(self, filepath: Path, bake_ao: bool = True, basal_height: float = 0.85):
        self.bm.normal_update()

        # Apply World-Metric Triplanar UVs for faces without explicit planar UVs
        for f in self.bm.faces:
            if f[self.custom_uv_layer] == 1:
                continue
            mat_name = self.mat_names[f.material_index]
            uv_scale = MATERIAL_SPECS.get(mat_name, (None, 0.8, 0, 2.0))[3]
            n = f.normal
            ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
            for loop in f.loops:
                co = loop.vert.co
                if mat_name.startswith("awning_"):
                    u, v = co.y / 1.15, co.x / 1.15
                elif az >= ax and az >= ay:
                    u, v = co.x / uv_scale, co.y / uv_scale
                elif ax >= ay:
                    u, v = co.y / uv_scale, co.z / uv_scale
                else:
                    u, v = co.x / uv_scale, co.z / uv_scale
                loop[self.uv_layer].uv = (u, v)

        # Compute fast BVH Vertex Ambient Occlusion + Basal Dampness
        color_layer = self.bm.loops.layers.color.new("Col")
        if bake_ao and len(self.bm.faces) > 0:
            bvh = BVHTree.FromBMesh(self.bm)
            # Precompute 12 golden-spiral hemisphere vectors
            dirs = []
            golden = math.pi * (3.0 - math.sqrt(5.0))
            n_rays = 12
            for k in range(n_rays):
                y = (k + 0.5) / n_rays
                r = math.sqrt(max(0.0, 1.0 - y * y))
                phi = golden * k
                dirs.append(Vector((math.cos(phi) * r, math.sin(phi) * r, y)))

            vert_ao = {}
            for v in self.bm.verts:
                vn = v.normal
                if vn.length_squared < 1e-6:
                    vert_ao[v.index] = 1.0
                    continue
                vn = vn.normalized()
                # Build tangent basis around vn
                up = Vector((0, 0, 1)) if abs(vn.z) < 0.92 else Vector((1, 0, 0))
                tx = vn.cross(up).normalized()
                ty = vn.cross(tx).normalized()
                origin = v.co + vn * 0.035

                occ = 0.0
                for d in dirs:
                    world_d = (tx * d.x + ty * d.y + vn * d.z).normalized()
                    hit_loc, _hn, _hi, hit_dist = bvh.ray_cast(origin, world_d, 1.45)
                    if hit_loc is not None:
                        occ += (1.0 - hit_dist / 1.45)
                ao = 1.0 - (occ / n_rays) * 0.72
                # Ground basal dampness/dirt gradient
                if basal_height > 0.05 and v.co.z < basal_height:
                    t = max(0.0, min(1.0, v.co.z / basal_height))
                    ao *= (0.76 + 0.24 * t)
                vert_ao[v.index] = max(0.32, min(1.0, ao))

            for f in self.bm.faces:
                for loop in f.loops:
                    c = vert_ao.get(loop.vert.index, 1.0)
                    # Slight warm tint on bright areas, slightly cooler/earthy in deep crevices
                    loop[color_layer] = (c, c * (0.985 + 0.015 * c), c * (0.96 + 0.04 * c), 1.0)
        else:
            for f in self.bm.faces:
                for loop in f.loops:
                    loop[color_layer] = (1.0, 1.0, 1.0, 1.0)

        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()

        if len(mesh.color_attributes) > 0:
            mesh.color_attributes.active_color_index = 0
            mesh.color_attributes.render_color_index = 0

        for mname in self.mat_names:
            mesh.materials.append(MAT_CACHE[mname])

        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

        filepath.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=str(filepath),
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_texcoords=True,
            export_normals=True,
            export_colors=True,
            export_attributes=True,
            export_materials="EXPORT",
            export_yup=True,
        )
        print(f"Exported {filepath.name}: {len(mesh.polygons)} polys, {len(self.mat_names)} mats")


# =============================================================================
# HERO ARCHITECTURAL ASSETS
# =============================================================================

def build_gatehouse():
    """
    Ashenhold Monumental Stone Gatehouse:
    Width X: [-5.2, +5.2] (10.4m), Depth Y: [-3.2, +3.2] (6.4m), Height Z: 0..16.2m.
    Clear walkable arched tunnel in X: [-2.2, +2.2], Height Z: 0..4.95m.
    """
    b = MeshBuilder("gatehouse", seed=101)

    # Lower stone piers flanking the 4.4m wide gate passage
    for sx in (-1, 1):
        px = sx * 3.7
        # Battered outer plinth base
        b.add_box("stone_trim", (px, 0.0, 0.65), (3.25, 6.7, 1.3), bevel=0.04)
        # Main stone pier body
        b.add_box("stone_ashlar", (px, 0.0, 3.25), (3.0, 6.4, 4.1), bevel=0.03)
        # Outer & inner buttresses
        b.add_box("stone_trim", (sx * 4.95, -3.35, 3.2), (0.85, 0.65, 6.4), bevel=0.03)
        b.add_box("stone_trim", (sx * 2.35, -3.32, 2.7), (0.65, 0.55, 5.4), bevel=0.03)
        b.add_stone_quoins("stone_trim", sx * 5.2, -3.2, 1.3, 5.4, -sx, 1.0)
        b.add_stone_quoins("stone_trim", sx * 5.2, 3.2, 1.3, 5.4, -sx, -1.0)

        # Open studded oak double gate doors tucked cleanly inside tunnel side recesses
        door_x = sx * 2.02
        b.add_box("planks_oak", (door_x, -0.8, 2.05), (0.18, 2.15, 3.95), bevel=0.015)
        for hz in (0.65, 2.0, 3.35):
            b.add_box("iron_forged", (door_x - sx * 0.08, -0.8, hz), (0.04, 2.12, 0.14), bevel=0.008)
        b.add_cylinder("iron_forged", (door_x - sx * 0.12, -1.55, 1.65), 0.11, 0.11, 0.05, segs=10, rot=(0, math.pi / 2, 0))

    # True Semicircular Stone Voussoir Arches (Front -Y, Middle, Back +Y) & Tunnel Vault
    for ay in (-3.15, 0.0, 3.15):
        b.add_stone_arch("stone_trim", (0.0, ay, 3.05), radius=2.18, depth=0.68, ring_thickness=0.45, num_voussoirs=13)
    # Barrel-vault stone ribs inside gate tunnel
    for ry in (-2.0, -1.0, 1.0, 2.0):
        b.add_stone_arch("stone_trim", (0.0, ry, 3.05), radius=2.22, depth=0.32, ring_thickness=0.22, num_voussoirs=11)

    # Raised Forged Iron Portcullis Grille at outer slot (y = -2.55)
    for px in (-1.75, -1.16, -0.58, 0.0, 0.58, 1.16, 1.75):
        b.add_box("iron_forged", (px, -2.55, 4.75), (0.09, 0.09, 1.85), bevel=0.01)
        # Forged spear spike at bottom of portcullis bar
        b.add_cylinder("iron_forged", (px, -2.55, 3.72), 0.005, 0.065, 0.22, segs=4)
    for pz in (4.05, 4.55, 5.05):
        b.add_box("iron_forged", (0.0, -2.55, pz), (4.3, 0.10, 0.08), bevel=0.008)

    # Spandrel masonry above arch & Upper Gatehouse Hall (z = 5.2 .. 9.6)
    b.add_box("stone_trim", (0.0, 0.0, 5.45), (10.6, 6.75, 0.36), bevel=0.03)
    b.add_box("stone_ashlar", (0.0, 0.0, 7.55), (10.1, 6.1, 4.1), bevel=0.03)
    b.add_stone_quoins("stone_trim", -5.05, -3.05, 5.65, 9.6, 1.0, 1.0)
    b.add_stone_quoins("stone_trim", 5.05, -3.05, 5.65, 9.6, -1.0, 1.0)

    # Carved Heraldic Stone Shield Crest above Gate Arch (front face y = -3.12)
    b.add_box("stone_trim", (0.0, -3.14, 6.65), (1.35, 0.24, 1.65), bevel=0.035)
    b.add_box("brass_aged", (0.0, -3.26, 6.65), (0.72, 0.08, 0.92), bevel=0.02)

    # Recessed Upper Gatehouse Mullioned Windows (front & back)
    for wx in (-2.7, 2.7):
        b.add_recessed_window((wx, -3.05, 7.65), 1.35, 1.65, (0.0, -1.0), frame_mat="stone_trim", with_shutters=False, glow=True)
        b.add_recessed_window((wx, 3.05, 7.65), 1.35, 1.65, (0.0, 1.0), frame_mat="stone_trim", with_shutters=False, glow=True)

    # Corbeled Machicolation Gallery & Crenellated Battlements (z = 9.6 .. 11.7)
    for mx in range(-5, 6):
        cx = mx * 0.96
        for sy in (-1, 1):
            b.add_box("stone_trim", (cx, sy * 3.16, 9.55), (0.28, 0.45, 0.36), bevel=0.02)
            b.add_box("stone_trim", (cx, sy * 3.28, 9.85), (0.30, 0.65, 0.32), bevel=0.02)
    b.add_box("stone_ashlar", (0.0, 0.0, 10.35), (10.8, 6.8, 0.95), bevel=0.03)
    # Merlons along front & back parapet
    for mx in (-4.6, -2.75, -0.92, 0.92, 2.75, 4.6):
        for sy in (-1, 1):
            b.add_box("stone_ashlar", (mx, sy * 3.15, 11.3), (1.15, 0.52, 1.05), bevel=0.02)
            b.add_box("stone_trim", (mx, sy * 3.15, 11.88), (1.28, 0.62, 0.16), bevel=0.02)

    # Steep Slate Pitched Roof & Timber Watch Bell Cupola
    b.add_pitched_tiled_roof("roof_slate", "timber_oak", (0.0, 0.0, 10.85), length=9.4, half_span=2.85, rise=3.05, along_axis="X", overhang=0.55)
    # Central Bell Cupola
    for sx in (-0.7, 0.7):
        for sy in (-0.7, 0.7):
            b.add_box("timber_oak", (sx, sy, 14.35), (0.18, 0.18, 1.75), bevel=0.015)
    b.add_pitched_tiled_roof("roof_slate", "timber_oak", (0.0, 0.0, 15.15), length=1.6, half_span=0.9, rise=1.05, along_axis="X", overhang=0.28, eave_rafters=False, with_3d_tiles=False)
    b.add_lathe_profile("brass_aged", [(0.0, 0.0), (0.30, 0.0), (0.24, 0.18), (0.20, 0.44), (0.08, 0.56), (0.0, 0.60)], segs=12, center=(0.0, 0.0, 14.25))

    # Flanking Iron Banner Crossbars & Woven Ashenhold Heraldic Banners
    for sx in (-1, 1):
        bx = sx * 3.7
        b.add_box("iron_forged", (bx, -3.55, 8.65), (1.35, 0.08, 0.08), bevel=0.01)
        b.add_cylinder("brass_aged", (bx - 0.68, -3.55, 8.65), 0.07, 0.02, 0.14, segs=8, rot=(0, -math.pi / 2, 0))
        b.add_cylinder("brass_aged", (bx + 0.68, -3.55, 8.65), 0.07, 0.02, 0.14, segs=8, rot=(0, math.pi / 2, 0))
        b.add_planar_quad("banner_ashenhold", (bx - 0.56, -3.55, 6.25), (bx + 0.56, -3.55, 6.25), (bx + 0.56, -3.55, 8.60), (bx - 0.56, -3.55, 8.60), double_sided=True)

    b.finalize_and_export(OUT_DIR / "gatehouse.glb")


def build_bastion_tower():
    """Flanking 12-sided stone Bastion Tower with battered plinth, arrow slits, corbels & conical 3D slate roof."""
    b = MeshBuilder("bastion_tower", seed=102)
    segs = 12
    # Battered stone base + main shaft
    b.add_cylinder("stone_trim", (0, 0, 1.15), 3.38, 2.95, 2.3, segs=segs, bevel=0.04)
    b.add_cylinder("stone_ashlar", (0, 0, 6.55), 2.92, 2.86, 8.5, segs=segs, bevel=0.03)
    # Chamfered stone stringcourse rings
    b.add_cylinder("stone_trim", (0, 0, 2.38), 3.06, 3.04, 0.24, segs=segs, bevel=0.02)
    b.add_cylinder("stone_trim", (0, 0, 6.45), 3.02, 3.00, 0.24, segs=segs, bevel=0.02)

    # Splayed arrow slits around outer tower face
    for ang_deg in (-120, -90, -60, 0, 90):
        a = math.radians(ang_deg)
        rx, ry = math.cos(a) * 2.82, math.sin(a) * 2.82
        for az in (4.4, 8.2):
            b.add_box("stone_trim", (rx, ry, az), (0.56, 0.34, 1.35), bevel=0.02, rot=(0, 0, a + math.pi / 2))
            b.add_box("iron_forged", (rx * 1.02, ry * 1.02, az), (0.12, 0.24, 1.05), bevel=0.0, rot=(0, 0, a + math.pi / 2))

    # Stepped Corbels & Projecting Battlement Parapet
    for k in range(segs):
        a = (k / segs) * math.tau
        cx, cy = math.cos(a) * 2.95, math.sin(a) * 2.95
        b.add_box("stone_trim", (cx, cy, 10.65), (0.42, 0.62, 0.55), bevel=0.02, rot=(0, 0, a + math.pi / 2))
    b.add_cylinder("stone_ashlar", (0, 0, 11.45), 3.22, 3.24, 1.25, segs=segs, bevel=0.03)
    for k in range(segs):
        a = (k / segs) * math.tau
        mx, my = math.cos(a) * 3.02, math.sin(a) * 3.02
        b.add_box("stone_ashlar", (mx, my, 12.55), (0.95, 0.48, 0.98), bevel=0.02, rot=(0, 0, a + math.pi / 2))
        b.add_box("stone_trim", (mx, my, 13.10), (1.06, 0.58, 0.14), bevel=0.02, rot=(0, 0, a + math.pi / 2))

    # Conical 3D Shingled Roof & Finial Spire
    b.add_cylinder("roof_slate", (0, 0, 14.35), 3.52, 0.15, 4.15, segs=segs, bevel=0.02)
    # Layered conical roof tile rings for genuine stepped silhouette
    for ring_i in range(6):
        t = ring_i / 6.0
        r_ring = 3.45 * (1.0 - t * 0.84)
        z_ring = 12.45 + t * 3.55
        count = max(8, int(20 * (1.0 - t * 0.6)))
        for c in range(count):
            a = (c / count) * math.tau + (ring_i % 2) * (math.pi / count)
            tx = math.cos(a) * r_ring
            ty = math.sin(a) * r_ring
            b.add_box(
                "roof_slate",
                (tx, ty, z_ring),
                (0.54, 0.62, 0.06),
                bevel=0.01,
                rot=(0.74, 0.0, a - math.pi / 2),
            )
    b.add_cylinder("iron_forged", (0, 0, 16.65), 0.07, 0.02, 1.1, segs=8)
    b.add_cylinder("brass_aged", (0, 0, 16.35), 0.16, 0.16, 0.22, segs=10)

    b.finalize_and_export(OUT_DIR / "bastion_tower.glb")


def build_curtain_wall():
    """Modular 12m Fortified City Curtain Wall with battered base, buttresses, battlements & rear timber hoarding."""
    b = MeshBuilder("curtain_wall", seed=103)
    b.add_box("stone_trim", (0, 0, 0.8), (12.0, 2.95, 1.6), bevel=0.04)
    b.add_box("stone_ashlar", (0, 0, 4.7), (12.0, 2.45, 6.2), bevel=0.03)
    b.add_box("stone_trim", (0, 0, 7.95), (12.0, 2.68, 0.34), bevel=0.03)
    # Stone pilasters on outer face
    for px in (-4.2, 0.0, 4.2):
        b.add_box("stone_trim", (px, -1.32, 4.1), (0.88, 0.45, 7.6), bevel=0.03)
    # Crenellated merlons along front & back
    for mx in (-5.0, -3.0, -1.0, 1.0, 3.0, 5.0):
        b.add_box("stone_ashlar", (mx, -1.05, 8.65), (1.18, 0.52, 1.08), bevel=0.02)
        b.add_box("stone_trim", (mx, -1.05, 9.25), (1.30, 0.62, 0.15), bevel=0.02)
    # Rear city-side timber defensive hoarding gallery (y = +1.4..+2.3)
    for px in (-4.8, -2.4, 0.0, 2.4, 4.8):
        b.add_box("timber_oak", (px, 1.55, 6.3), (0.24, 0.95, 0.24), bevel=0.015)
        b.add_jetty_brace("timber_oak", (px, 1.22, 5.5), (0.0, 1.0), reach=0.68, height=0.72, thickness=0.18)
        b.add_box("timber_oak", (px, 1.92, 7.4), (0.18, 0.18, 2.1), bevel=0.012)
    b.add_box("planks_oak", (0, 1.65, 6.48), (12.0, 1.1, 0.14), bevel=0.012)
    b.add_box("planks_oak", (0, 1.98, 7.1), (12.0, 0.12, 1.15), bevel=0.01)
    b.add_box("roof_slate", (0, 1.68, 8.65), (12.0, 1.45, 0.14), bevel=0.012, rot=(-0.42, 0, 0))

    b.finalize_and_export(OUT_DIR / "curtain_wall.glb")


def build_guardhouse():
    """
    Phase 1 Building 1: Gate Guardhouse & Armory (Enterable ground floor!).
    Oriented with Front Facade at local +X (facing Gateward Street at x = -8.4 -> door at x = -5.0).
    Footprint: X in [-3.4, +3.4] (6.8m deep), Y in [-4.4, +4.4] (8.8m street frontage).
    Doorway on +X face at X=+3.2, Y in [-1.1, +1.1], Z in [0, 2.65].
    """
    b = MeshBuilder("bldg_guardhouse", seed=201)

    # Flagstone plinth & raised interior oak plank floor (walkable at z = 0.14)
    b.add_box("stone_trim", (0.0, 0.0, -0.06), (7.1, 9.1, 0.28), bevel=0.03)
    b.add_box("planks_oak", (-0.1, 0.0, 0.11), (6.1, 8.2, 0.12), bevel=0.01)
    # Stone Front Stoop Step outside doorway (+X)
    b.add_box("stone_trim", (3.85, 0.0, -0.02), (0.95, 2.9, 0.24), bevel=0.025)

    # Ground-Floor Masonry Walls leaving 2.2m open doorway on +X
    b.add_box("stone_ashlar", (-3.15, 0.0, 1.85), (0.52, 8.8, 3.7), bevel=0.025)   # Back wall
    b.add_box("stone_ashlar", (0.0, -4.15, 1.85), (6.8, 0.52, 3.7), bevel=0.025)   # South side wall
    b.add_box("stone_ashlar", (0.0, 4.15, 1.85), (6.8, 0.52, 3.7), bevel=0.025)    # North side wall
    # Front +X wall split around Y in [-1.1, +1.1]
    b.add_box("stone_ashlar", (3.15, -2.75, 1.85), (0.52, 3.3, 3.7), bevel=0.025)
    b.add_box("stone_ashlar", (3.15, 2.75, 1.85), (0.52, 3.3, 3.7), bevel=0.025)
    b.add_box("stone_ashlar", (3.15, 0.0, 3.22), (0.52, 2.2, 0.96), bevel=0.02)
    # Stone Voussoir Archway framing front doorway (+X)
    b.add_stone_arch("stone_trim", (3.22, 0.0, 1.65), radius=1.08, depth=0.64, ring_thickness=0.30, num_voussoirs=9, facing_axis="X")
    # Open heavy oak door swung inward cleanly against south jamb
    b.add_box("planks_oak", (2.45, -1.04, 1.38), (1.15, 0.12, 2.52), bevel=0.012)
    b.add_box("iron_forged", (2.45, -0.97, 0.80), (1.05, 0.03, 0.1), bevel=0.004)
    b.add_box("iron_forged", (2.45, -0.97, 2.00), (1.05, 0.03, 0.1), bevel=0.004)

    # Corner stone quoins & splayed ground-floor windows
    b.add_stone_quoins("stone_trim", 3.4, -4.4, 0.0, 3.7, -1.0, 1.0)
    b.add_stone_quoins("stone_trim", 3.4, 4.4, 0.0, 3.7, -1.0, -1.0)
    b.add_recessed_window((3.38, -2.7, 1.9), 1.15, 1.35, (1.0, 0.0), frame_mat="stone_trim", with_shutters=False, glow=True)
    b.add_recessed_window((3.38, 2.7, 1.9), 1.15, 1.35, (1.0, 0.0), frame_mat="stone_trim", with_shutters=False, glow=True)
    b.add_recessed_window((0.4, -4.38, 1.9), 1.15, 1.25, (0.0, -1.0), frame_mat="stone_trim", with_shutters=True, glow=True)

    # Interior Guardroom Ceiling Beams, Stone Hearth Fireplace & Oak Council Table
    for by in (-2.6, 0.0, 2.6):
        b.add_box("timber_oak", (0.0, by, 3.55), (6.2, 0.24, 0.28), bevel=0.015)
    b.add_box("planks_oak", (0.0, 0.0, 3.72), (6.6, 8.6, 0.14), bevel=0.01)
    # Stone Hearth Fireplace with Recessed Firebox, Andirons, Logs & Glowing Embers
    b.add_box("stone_trim", (-2.55, -0.85, 1.15), (0.85, 0.45, 2.1), bevel=0.025)
    b.add_box("stone_trim", (-2.55, 0.85, 1.15), (0.85, 0.45, 2.1), bevel=0.025)
    b.add_box("stone_trim", (-2.55, 0.0, 1.85), (0.85, 1.3, 0.7), bevel=0.025)
    b.add_box("timber_oak", (-2.42, 0.0, 2.28), (1.05, 2.4, 0.18), bevel=0.015)
    b.add_cylinder("timber_oak", (-2.42, 0.0, 0.34), 0.10, 0.09, 0.95, segs=8, rot=(0.82, 0.0, 0.15))
    b.add_cylinder("timber_oak", (-2.36, 0.0, 0.38), 0.09, 0.08, 0.88, segs=8, rot=(-0.78, 0.0, -0.2))
    b.add_box("glow_warm", (-2.42, 0.0, 0.24), (0.35, 0.78, 0.14), bevel=0.03)
    # Wrought-iron ceiling chandelier ring
    b.add_cylinder("iron_forged", (-0.2, 0.0, 3.22), 0.03, 0.03, 0.65, segs=6)
    b.add_cylinder("iron_forged", (-0.2, 0.0, 2.90), 0.56, 0.56, 0.08, segs=12)
    for ca_i in range(4):
        ca = ca_i * (math.pi / 2)
        b.add_cylinder("glow_warm", (-0.2 + math.cos(ca) * 0.52, math.sin(ca) * 0.52, 3.02), 0.05, 0.04, 0.18, segs=6)
    # Interior guard table & bench
    b.add_box("planks_oak", (-0.4, 2.1, 0.92), (1.3, 2.2, 0.12), bevel=0.012)
    for lx in (-0.9, 0.1):
        for ly in (1.2, 3.0):
            b.add_box("timber_oak", (lx, ly, 0.50), (0.12, 0.12, 0.78), bevel=0.01)

    # Cantilevered Jettied Upper Half-Timbered Story (overhangs +0.42m toward street!)
    b.add_box("timber_oak", (0.2, 0.0, 3.85), (7.5, 9.2, 0.26), bevel=0.02)
    for jy in (-4.2, -2.1, 0.0, 2.1, 4.2):
        b.add_box("timber_oak", (3.65, jy, 3.82), (0.75, 0.20, 0.24), bevel=0.015)
        b.add_jetty_brace("timber_oak", (3.40, jy, 3.05), (1.0, 0.0), reach=0.45, height=0.72, thickness=0.16)

    # Upper Plaster Walls & Exposed Timber Studs/Cross-Braces (z = 3.95 .. 6.85)
    b.add_box("plaster_cream", (0.22, 0.0, 5.4), (7.3, 9.0, 2.9), bevel=0.02)
    # Projecting oak half-timber frame
    for tz in (4.0, 5.45, 6.82):
        b.add_box("timber_oak", (0.22, 0.0, tz), (7.48, 9.18, 0.18), bevel=0.015)
    for py in (-4.52, -2.2, 0.0, 2.2, 4.52):
        b.add_box("timber_oak", (3.86, py, 5.4), (0.18, 0.18, 2.95), bevel=0.012)
    for px in (-3.42, -1.2, 1.2, 3.82):
        b.add_box("timber_oak", (px, -4.52, 5.4), (0.18, 0.18, 2.95), bevel=0.012)
        b.add_box("timber_oak", (px, 4.52, 5.4), (0.18, 0.18, 2.95), bevel=0.012)

    # Upper Recessed Windows with Shutters & Flower Box
    for wy in (-3.3, -1.1, 1.1, 3.3):
        b.add_recessed_window((3.88, wy, 5.35), 1.18, 1.38, (1.0, 0.0), with_shutters=True, with_flowerbox=(wy in (-1.1, 1.1)), glow=True)
    b.add_recessed_window((0.2, -4.52, 5.35), 1.2, 1.35, (0.0, -1.0), with_shutters=True, glow=True)

    # Gable End Triangles (South & North) + Steep Slate Roof + Front Dormer + Stone Chimney
    b.add_wedge_block("plaster_cream", [(-3.45, 6.85), (3.88, 6.85), (0.22, 10.1)], -4.4, 0.25, bevel=0.015)
    b.add_wedge_block("plaster_cream", [(-3.45, 6.85), (3.88, 6.85), (0.22, 10.1)], 4.4, 0.25, bevel=0.015)
    b.add_pitched_tiled_roof("roof_slate", "timber_oak", (0.22, 0.0, 6.85), length=9.1, half_span=3.7, rise=3.3, along_axis="Y", overhang=0.58)

    # Front Gabled Dormer Window protruding through roof
    b.add_box("plaster_cream", (2.15, 0.0, 8.15), (1.6, 1.55, 1.45), bevel=0.015)
    b.add_pitched_tiled_roof("roof_slate", "timber_oak", (2.15, 0.0, 8.85), length=1.7, half_span=0.85, rise=0.85, along_axis="X", overhang=0.25, eave_rafters=False, with_3d_tiles=False)
    b.add_recessed_window((2.96, 0.0, 8.12), 0.95, 1.05, (1.0, 0.0), with_shutters=False, glow=True)

    b.add_chimney("stone_ashlar", "stone_trim", (-2.2, -2.5), 6.5, 11.4, width=1.05)

    # Attached Timber Porch Lean-to Shelter beside doorway (Y = +1.8..+4.2)
    b.add_box("timber_oak", (4.35, 2.0, 1.55), (0.18, 0.18, 3.1), bevel=0.012)
    b.add_box("timber_oak", (4.35, 4.1, 1.55), (0.18, 0.18, 3.1), bevel=0.012)
    b.add_box("roof_slate", (3.95, 3.05, 3.15), (1.45, 2.55, 0.12), bevel=0.01, rot=(0.0, 0.28, 0.0))

    b.finalize_and_export(OUT_DIR / "bldg_guardhouse.glb")


def build_apothecary():
    """
    Phase 1 Building 2: 3-Story Double-Jettied Apothecary & Clothier Townhouse.
    Oriented with Front Facade at local -X (facing Gateward Street from +X side).
    Tall narrow medieval silhouette (height 12.8m) with striped market awning, counter shelf, clay tile roof.
    """
    b = MeshBuilder("bldg_apothecary", seed=202)

    # Stone Plinth & Ground-Floor Shopfront
    b.add_box("stone_trim", (0.0, 0.0, -0.08), (6.7, 7.6, 0.26), bevel=0.03)
    b.add_box("stone_ashlar", (0.0, 0.0, 1.8), (6.4, 7.3, 3.6), bevel=0.03)
    b.add_stone_quoins("stone_trim", -3.2, -3.65, 0.0, 3.6, 1.0, 1.0)
    b.add_stone_quoins("stone_trim", -3.2, 3.65, 0.0, 3.6, 1.0, -1.0)

    # Recessed Arched Shop Doorway & Display Shop Window on -X face
    b.add_box("planks_oak", (-3.12, -1.65, 1.3), (0.18, 1.3, 2.55), bevel=0.015)
    b.add_stone_arch("stone_trim", (-3.18, -1.65, 1.75), radius=0.72, depth=0.35, ring_thickness=0.22, num_voussoirs=7, facing_axis="X")
    b.add_recessed_window((-3.20, 1.35, 1.85), 2.35, 1.55, (-1.0, 0.0), frame_mat="timber_oak", with_shutters=False, glow=True)

    # Exterior Merchant Display Counter Shelf & Striped Market Awning (-X overhang!)
    b.add_box("planks_oak", (-3.62, 1.35, 0.92), (0.85, 2.6, 0.10), bevel=0.012)
    b.add_box("timber_oak", (-3.85, 0.35, 0.45), (0.14, 0.14, 0.9), bevel=0.01)
    b.add_box("timber_oak", (-3.85, 2.35, 0.45), (0.14, 0.14, 0.9), bevel=0.01)
    # Colorful apothecary bottles & fabric bolts on counter
    for idx, by in enumerate((0.55, 0.85, 1.15, 1.85, 2.15)):
        b.add_cylinder("ceramic_clay", (-3.65, by, 1.12), 0.11, 0.07, 0.32, segs=8)
    # Striped Canvas Awning supported by iron stays
    b.add_box("awning_striped", (-4.05, 0.8, 3.05), (1.75, 4.4, 0.06), bevel=0.008, rot=(0.0, -0.34, 0.0))
    for ay in (-1.1, 0.8, 2.7):
        b.add_box("iron_forged", (-3.95, ay, 2.95), (1.55, 0.06, 0.06), bevel=0.006, rot=(0.0, -0.34, 0.0))

    # 2nd Floor Double-Jettied Story (overhangs -0.40m into street!)
    b.add_box("timber_oak", (-0.2, 0.0, 3.72), (6.85, 7.6, 0.24), bevel=0.018)
    for jy in (-3.4, -1.1, 1.1, 3.4):
        b.add_jetty_brace("timber_oak", (-3.22, jy, 2.95), (-1.0, 0.0), reach=0.45, height=0.72, thickness=0.15)
    b.add_box("plaster_ochre", (-0.22, 0.0, 5.25), (6.85, 7.45, 2.9), bevel=0.02)
    for tz in (3.85, 5.25, 6.65):
        b.add_box("timber_oak", (-0.22, 0.0, tz), (7.02, 7.62, 0.16), bevel=0.012)
    for py in (-3.74, -1.8, 0.0, 1.8, 3.74):
        b.add_box("timber_oak", (-3.65, py, 5.25), (0.18, 0.18, 2.9), bevel=0.012)
    # Diagonal St. Andrew cross timber braces on front panels
    for cy_p in (-2.75, 2.75):
        b.add_box("timber_oak", (-3.64, cy_p, 4.55), (0.14, 1.65, 0.12), bevel=0.008, rot=(0.68, 0.0, 0.0))
        b.add_box("timber_oak", (-3.64, cy_p, 4.55), (0.14, 1.65, 0.12), bevel=0.008, rot=(-0.68, 0.0, 0.0))

    b.add_recessed_window((-3.66, -0.9, 5.25), 1.15, 1.45, (-1.0, 0.0), with_shutters=True, with_flowerbox=True, glow=True)
    b.add_recessed_window((-3.66, 0.9, 5.25), 1.15, 1.45, (-1.0, 0.0), with_shutters=True, with_flowerbox=True, glow=True)

    # 3rd Floor Jetty Gable Facing Street (-X) -> Dramatic Vertical Medieval Townhouse!
    b.add_box("timber_oak", (-0.4, 0.0, 6.78), (7.25, 7.75, 0.24), bevel=0.018)
    for jy in (-3.2, 0.0, 3.2):
        b.add_jetty_brace("timber_oak", (-3.65, jy, 6.02), (-1.0, 0.0), reach=0.42, height=0.70, thickness=0.15)
    b.add_box("plaster_ochre", (-0.42, 0.0, 8.1), (7.22, 7.6, 2.5), bevel=0.02)
    for tz in (6.92, 9.3):
        b.add_box("timber_oak", (-0.42, 0.0, tz), (7.4, 7.78, 0.16), bevel=0.012)
    for py in (-3.82, -1.6, 1.6, 3.82):
        b.add_box("timber_oak", (-4.03, py, 8.1), (0.18, 0.18, 2.5), bevel=0.012)
    b.add_recessed_window((-4.04, 0.0, 8.15), 1.35, 1.4, (-1.0, 0.0), with_shutters=True, with_flowerbox=True, glow=True)

    # Steep Clay Terracotta Roof Facing Street as Towering Gable (-X)!
    b.add_wedge_block("plaster_ochre", [(-3.8, 9.35), (3.8, 9.35), (0.0, 12.65)], -3.95, 0.25, bevel=0.015, rot=(0, 0, math.pi / 2), offset=(-0.42, 0, 0))
    b.add_wedge_block("plaster_ochre", [(-3.8, 9.35), (3.8, 9.35), (0.0, 12.65)], 3.95, 0.25, bevel=0.015, rot=(0, 0, math.pi / 2), offset=(-0.42, 0, 0))
    # King post & gable framing on front (-X) gable peak
    b.add_box("timber_oak", (-4.05, 0.0, 10.95), (0.18, 0.20, 3.15), bevel=0.012)
    b.add_pitched_tiled_roof("roof_clay", "timber_oak", (-0.42, 0.0, 9.35), length=7.3, half_span=3.85, rise=3.35, along_axis="X", overhang=0.55)
    b.add_chimney("stone_ashlar", "stone_trim", (1.6, -2.2), 9.2, 13.3, width=0.95)

    # Scrolled Iron Bracket & Hanging Painted Apothecary Sign projecting at X = -4.55
    b.add_box("iron_forged", (-4.25, -2.55, 4.35), (1.35, 0.07, 0.07), bevel=0.008)
    b.add_box("iron_forged", (-3.95, -2.55, 4.05), (0.85, 0.06, 0.06), bevel=0.006, rot=(0, 0.65, 0))
    b.add_box("timber_oak", (-4.48, -2.55, 3.82), (0.92, 0.08, 0.86), bevel=0.01)
    b.add_planar_quad("sign_apothecary", (-4.90, -2.60, 3.44), (-4.06, -2.60, 3.44), (-4.06, -2.60, 4.20), (-4.90, -2.60, 4.20), double_sided=True)
    b.add_planar_quad("sign_apothecary", (-4.06, -2.50, 3.44), (-4.90, -2.50, 3.44), (-4.90, -2.50, 4.20), (-4.06, -2.50, 4.20), double_sided=False)

    b.finalize_and_export(OUT_DIR / "bldg_apothecary.glb")


def build_tavern():
    """
    Phase 1 Building 3: "The Ember & Flagon" Corner Tavern (Enterable Taproom!).
    Front Facade faces +X (toward Gateward Street).
    Footprint: X in [-3.8, +3.6], Y in [-5.0, +5.0] (10.0m street frontage).
    Open Arched Doorway at X = +3.5, Y in [-1.1, +1.1].
    """
    b = MeshBuilder("bldg_tavern", seed=203)

    # Heavy Stone Plinth & Raised Plank Interior Taproom Floor (z = 0.12)
    b.add_box("stone_trim", (-0.1, 0.0, -0.06), (7.8, 10.3, 0.28), bevel=0.03)
    b.add_box("planks_oak", (-0.1, 0.0, 0.12), (6.8, 9.4, 0.14), bevel=0.01)
    # Stone Stoop Step outside front doorway (+X)
    b.add_box("stone_trim", (4.05, 0.0, -0.02), (1.05, 3.2, 0.24), bevel=0.025)

    # Ground-Floor Stone Walls leaving 2.2m open arched taproom doorway at Y in [-1.1, +1.1]
    b.add_box("stone_ashlar", (-3.55, 0.0, 1.9), (0.55, 10.0, 3.8), bevel=0.025)  # Back wall
    b.add_box("stone_ashlar", (-0.1, -4.75, 1.9), (7.4, 0.55, 3.8), bevel=0.025)  # South wall
    b.add_box("stone_ashlar", (-0.1, 4.75, 1.9), (7.4, 0.55, 3.8), bevel=0.025)   # North wall
    # Front wall split around doorway
    b.add_box("stone_ashlar", (3.35, -3.05, 1.9), (0.55, 3.9, 3.8), bevel=0.025)
    b.add_box("stone_ashlar", (3.35, 3.05, 1.9), (0.55, 3.9, 3.8), bevel=0.025)
    b.add_box("stone_ashlar", (3.35, 0.0, 3.30), (0.55, 2.2, 1.0), bevel=0.02)
    b.add_stone_arch("stone_trim", (3.42, 0.0, 1.72), radius=1.1, depth=0.66, ring_thickness=0.30, num_voussoirs=9, facing_axis="X")
    # Open studded tavern door swung inward
    b.add_box("planks_oak", (2.60, 1.04, 1.40), (1.2, 0.12, 2.6), bevel=0.015)

    # Ground-Floor Mullioned Tavern Bay Window (south of doorway, glowing warmly!)
    b.add_box("stone_trim", (3.78, -2.95, 0.65), (0.75, 2.25, 1.3), bevel=0.025)
    b.add_recessed_window((4.08, -2.95, 1.95), 1.95, 1.45, (1.0, 0.0), frame_mat="timber_oak", with_shutters=False, glow=True)
    b.add_box("roof_slate", (3.85, -2.95, 2.95), (0.95, 2.45, 0.14), bevel=0.015, rot=(0.0, 0.42, 0.0))
    b.add_recessed_window((3.62, 2.85, 1.95), 1.5, 1.35, (1.0, 0.0), frame_mat="timber_oak", with_shutters=True, glow=True)

    # Interior Taproom Furnishings: Timber Beams, Recessed Stone Hearth, Chandelier, Oak Bar Counter & Tap Kegs
    for by in (-3.2, -1.0, 1.2, 3.4):
        b.add_box("timber_oak", (-0.1, by, 3.65), (6.6, 0.24, 0.28), bevel=0.015)
    b.add_box("planks_oak", (-0.1, 0.0, 3.82), (7.0, 9.6, 0.14), bevel=0.01)
    # Recessed Stone Hearth with jamb piers, mantel beam, crossed burning logs & glowing embers
    b.add_box("stone_trim", (-2.80, -2.55, 1.35), (0.95, 0.50, 2.5), bevel=0.03)
    b.add_box("stone_trim", (-2.80, -0.65, 1.35), (0.95, 0.50, 2.5), bevel=0.03)
    b.add_box("stone_trim", (-2.80, -1.60, 2.15), (0.95, 1.45, 0.9), bevel=0.03)
    b.add_box("timber_oak", (-2.65, -1.60, 2.68), (1.18, 2.65, 0.22), bevel=0.02)
    b.add_cylinder("timber_oak", (-2.68, -1.60, 0.36), 0.11, 0.09, 1.05, segs=8, rot=(0.82, 0.0, 0.18))
    b.add_cylinder("timber_oak", (-2.62, -1.60, 0.40), 0.10, 0.09, 0.98, segs=8, rot=(-0.76, 0.0, -0.22))
    b.add_box("glow_warm", (-2.65, -1.60, 0.26), (0.38, 0.92, 0.14), bevel=0.03)
    # Wrought-iron ceiling chandelier wheel inside Taproom
    b.add_cylinder("iron_forged", (-0.2, -0.2, 3.30), 0.03, 0.03, 0.72, segs=6)
    b.add_cylinder("iron_forged", (-0.2, -0.2, 2.95), 0.68, 0.68, 0.09, segs=12)
    for ca_i in range(6):
        ca = ca_i * (math.tau / 6)
        b.add_cylinder("glow_warm", (-0.2 + math.cos(ca) * 0.62, -0.2 + math.sin(ca) * 0.62, 3.08), 0.055, 0.045, 0.20, segs=6)
    # Carved Oak Bar Counter along North interior half
    b.add_box("timber_oak", (-0.75, 2.55, 0.60), (0.85, 3.2, 0.98), bevel=0.02)
    b.add_box("planks_oak", (-0.72, 2.55, 1.14), (1.08, 3.45, 0.12), bevel=0.015)
    # Ceramic tankards on bar counter
    for ty in (1.45, 1.85, 3.15):
        b.add_cylinder("ceramic_clay", (-0.55, ty, 1.28), 0.07, 0.06, 0.18, segs=8)
    # Ale tap kegs behind bar
    for ky in (1.7, 2.55, 3.4):
        b.add_cylinder("planks_oak", (-2.55, ky, 1.22), 0.34, 0.34, 0.85, segs=12, bevel=0.02, rot=(0, math.pi / 2, 0))
        b.add_box("timber_oak", (-2.55, ky, 0.50), (0.75, 0.52, 0.82), bevel=0.015)

    # Cantilevered Timber Colonnade Porch Over Sidewalk (+X = 4.65)
    for py in (-4.4, -1.45, 1.45, 4.4):
        b.add_box("stone_trim", (4.72, py, 0.22), (0.44, 0.44, 0.44), bevel=0.02)
        b.add_box("timber_oak", (4.72, py, 1.85), (0.22, 0.22, 3.05), bevel=0.015)
        b.add_jetty_brace("timber_oak", (4.72, py, 2.85), (0.0, 1.0 if py < 0 else -1.0), reach=0.45, height=0.58, thickness=0.14)
    b.add_box("timber_oak", (4.72, 0.0, 3.48), (0.28, 9.4, 0.26), bevel=0.015)
    b.add_box("roof_slate", (4.15, 0.0, 3.72), (1.65, 9.6, 0.14), bevel=0.012, rot=(0.0, 0.24, 0.0))

    # Jettied 2nd Story & Twin-Gabled Slate Roof
    b.add_box("timber_oak", (0.15, 0.0, 3.92), (7.95, 10.3, 0.26), bevel=0.02)
    for jy in (-4.4, -2.2, 0.0, 2.2, 4.4):
        b.add_jetty_brace("timber_oak", (3.55, jy, 3.15), (1.0, 0.0), reach=0.46, height=0.72, thickness=0.16)
    b.add_box("plaster_cream", (0.18, 0.0, 5.48), (7.85, 10.1, 2.95), bevel=0.02)
    for tz in (4.08, 5.5, 6.95):
        b.add_box("timber_oak", (0.18, 0.0, tz), (8.02, 10.28, 0.18), bevel=0.014)
    for py in (-5.05, -2.55, 0.0, 2.55, 5.05):
        b.add_box("timber_oak", (4.10, py, 5.48), (0.18, 0.18, 2.95), bevel=0.012)
    for wy in (-3.8, -1.3, 1.3, 3.8):
        b.add_recessed_window((4.12, wy, 5.45), 1.18, 1.35, (1.0, 0.0), with_shutters=True, with_flowerbox=(abs(wy) < 2.0), glow=True)
    b.add_recessed_window((0.4, -5.05, 5.45), 1.25, 1.35, (0.0, -1.0), with_shutters=True, glow=True)

    # Main Roof & Cross-Gable Wing Facing Street!
    b.add_wedge_block("plaster_cream", [(-3.75, 6.95), (4.12, 6.95), (0.18, 10.45)], -5.0, 0.25, bevel=0.015)
    b.add_wedge_block("plaster_cream", [(-3.75, 6.95), (4.12, 6.95), (0.18, 10.45)], 5.0, 0.25, bevel=0.015)
    b.add_pitched_tiled_roof("roof_slate", "timber_oak", (0.18, 0.0, 6.95), length=10.2, half_span=3.95, rise=3.5, along_axis="Y", overhang=0.58)
    # Cross-gable projecting over tavern entrance (Y in [-2.3, +2.3])
    b.add_wedge_block("plaster_cream", [(-2.2, 6.95), (2.2, 6.95), (0.0, 9.85)], 0.0, 0.25, bevel=0.015, rot=(0, 0, math.pi / 2), offset=(4.12, 0.0, 0.0))
    b.add_pitched_tiled_roof("roof_slate", "timber_oak", (2.5, 0.0, 6.95), length=3.8, half_span=2.3, rise=2.9, along_axis="X", overhang=0.45)

    # Tall Twin-Flue Stone Chimney
    b.add_chimney("stone_ashlar", "stone_trim", (-2.6, -1.6), 6.5, 11.9, width=1.25)

    # Wrought-Iron Hanging Tavern Sign ("The Ember & Flagon") projecting into street (+X = 5.25)
    b.add_box("iron_forged", (4.65, -0.1, 4.35), (1.75, 0.08, 0.08), bevel=0.008)
    b.add_box("iron_forged", (4.25, -0.1, 4.02), (1.05, 0.06, 0.06), bevel=0.006, rot=(0, -0.62, 0))
    b.add_box("timber_oak", (5.02, -0.1, 3.78), (1.04, 0.09, 0.96), bevel=0.012)
    b.add_planar_quad("sign_tavern", (4.54, -0.16, 3.35), (5.50, -0.16, 3.35), (5.50, -0.16, 4.22), (4.54, -0.16, 4.22), double_sided=False)
    b.add_planar_quad("sign_tavern", (5.50, -0.04, 3.35), (4.54, -0.04, 3.35), (4.54, -0.04, 4.22), (5.50, -0.04, 4.22), double_sided=False)

    b.finalize_and_export(OUT_DIR / "bldg_tavern.glb")


def build_guildhouse():
    """
    Phase 1 Building 4: Provisioner & Brazier Guildhouse (Right-Mid of Street, facing -X).
    Distinct Flemish/Northern European Stepped Stone Gable + Covered Cart Arch Alley + 2nd-floor Iron Balcony!
    """
    b = MeshBuilder("bldg_guildhouse", seed=204)

    b.add_box("stone_trim", (0.0, 0.0, -0.08), (7.4, 9.6, 0.26), bevel=0.03)
    # Main ground floor masonry leaving south cart-alley arch at Y in [-4.5, -2.0]
    b.add_box("stone_ashlar", (0.15, 1.35, 2.2), (6.7, 6.7, 4.4), bevel=0.03)
    # Alley outer pier at Y = -4.55 and upper wall over alley arch
    b.add_box("stone_ashlar", (-1.55, -4.45, 2.2), (3.3, 0.65, 4.4), bevel=0.03)
    b.add_box("stone_ashlar", (0.15, -3.2, 3.95), (6.7, 2.6, 1.15), bevel=0.025)
    b.add_stone_arch("stone_trim", (-3.18, -3.2, 1.95), radius=1.18, depth=0.65, ring_thickness=0.32, num_voussoirs=11, facing_axis="X")
    # Guild door & windows
    b.add_box("planks_oak", (-3.18, 0.4, 1.35), (0.18, 1.5, 2.65), bevel=0.015)
    b.add_stone_arch("stone_trim", (-3.22, 0.4, 1.8), radius=0.82, depth=0.40, ring_thickness=0.25, num_voussoirs=7, facing_axis="X")
    b.add_recessed_window((-3.22, 2.9, 2.0), 1.45, 1.55, (-1.0, 0.0), frame_mat="stone_trim", with_shutters=False, glow=True)

    # 2nd Story in Sage Plaster + Timber Frame + Front Wrought-Iron Balcony!
    b.add_box("plaster_sage", (0.0, 0.0, 5.75), (7.0, 9.3, 3.1), bevel=0.025)
    b.add_box("stone_trim", (-3.5, 0.0, 4.35), (0.45, 9.5, 0.25), bevel=0.02)
    b.add_stone_quoins("stone_trim", -3.5, -4.65, 0.0, 7.3, 1.0, 1.0)
    b.add_stone_quoins("stone_trim", -3.5, 4.65, 0.0, 7.3, 1.0, -1.0)
    for py in (-4.6, -1.6, 1.6, 4.6):
        b.add_box("timber_oak", (-3.52, py, 5.75), (0.18, 0.18, 3.0), bevel=0.012)
    b.add_recessed_window((-3.52, -3.0, 5.75), 1.35, 1.55, (-1.0, 0.0), with_shutters=True, with_flowerbox=True, glow=True)
    b.add_recessed_window((-3.52, 0.2, 5.85), 1.45, 1.75, (-1.0, 0.0), with_shutters=False, glow=True)
    b.add_recessed_window((-3.52, 3.1, 5.75), 1.35, 1.55, (-1.0, 0.0), with_shutters=True, with_flowerbox=True, glow=True)

    # 2nd-Floor Corbeled Stone & Wrought-Iron Balcony (-X = -3.85, Y in [-1.1, +1.5])
    for by in (-0.95, 0.2, 1.35):
        b.add_box("stone_trim", (-3.72, by, 4.02), (0.75, 0.26, 0.34), bevel=0.02)
    b.add_box("stone_trim", (-3.95, 0.2, 4.26), (0.98, 2.75, 0.16), bevel=0.02)
    b.add_box("iron_forged", (-4.38, 0.2, 5.18), (0.08, 2.72, 0.08), bevel=0.008)
    for ry in (-1.12, 1.52):
        b.add_box("iron_forged", (-3.95, ry, 5.18), (0.92, 0.08, 0.08), bevel=0.008)
    for bi in range(11):
        by = -1.05 + bi * 0.25
        b.add_box("iron_forged", (-4.38, by, 4.72), (0.05, 0.05, 0.88), bevel=0.005)

    # Flemish Stepped Stone Gable Facing Street (-X) + Slate Roof + Cargo Hoist Beam
    b.add_wedge_block("stone_ashlar", [(-4.65, 7.3), (4.65, 7.3), (0.0, 11.4)], 0.0, 0.45, bevel=0.02, rot=(0, 0, math.pi / 2), offset=(-3.38, 0.0, 0.0))
    b.add_wedge_block("stone_ashlar", [(-4.65, 7.3), (4.65, 7.3), (0.0, 11.4)], 0.0, 0.45, bevel=0.02, rot=(0, 0, math.pi / 2), offset=(3.32, 0.0, 0.0))
    # Stepped gable tiers on front (-X)
    for step in range(5):
        half_w = 4.5 - step * 0.85
        sz = 7.45 + step * 0.78
        for sy in (-1, 1):
            b.add_box("stone_ashlar", (-3.42, sy * half_w, sz), (0.56, 0.92, 0.84), bevel=0.02)
            b.add_box("stone_trim", (-3.42, sy * half_w, sz + 0.46), (0.68, 1.04, 0.12), bevel=0.015)
    b.add_box("stone_trim", (-3.42, 0.0, 11.55), (0.68, 1.25, 0.75), bevel=0.025)
    b.add_recessed_window((-3.62, 0.0, 8.85), 1.15, 1.45, (-1.0, 0.0), frame_mat="timber_oak", with_shutters=True, glow=True)
    # Cargo Hoisting Beam jutting from top gable + iron hook
    b.add_box("timber_oak", (-4.1, 0.0, 10.65), (1.5, 0.20, 0.22), bevel=0.015)
    b.add_cylinder("iron_forged", (-4.68, 0.0, 10.22), 0.025, 0.025, 0.75, segs=6)

    b.add_pitched_tiled_roof("roof_slate", "timber_oak", (-0.05, 0.0, 7.3), length=6.6, half_span=4.65, rise=4.05, along_axis="X", overhang=0.45)
    b.add_chimney("stone_ashlar", "stone_trim", (1.8, 2.8), 7.2, 12.1, width=1.0)

    b.finalize_and_export(OUT_DIR / "bldg_guildhouse.glb")


def build_skyline_distant():
    """
    Phase 1 Horizon Frame, Side Courtyard Enclosure & Distant City Silhouette:
    - Side Courtyard Stone Walls & Secondary Timber Houses enclosing street gaps (Blender Y = -11 .. +18)
    - North Street Bend Timber Archway Bridge & Corner Facades (Blender Y = +23 .. +32)
    - Mid-distance clustered Slate/Clay Rooftops & Chapel Belltower Spire (Blender Y = +36 .. +58)
    - Elevated Ashenhold Citadel Keep & Flanking Watchtowers on rocky terrace (Blender Y = +68 .. +82)
    Note: Model placed at origin (0, 0, 0) in city space -> Blender Y = -ThreeJS Z!
    """
    b = MeshBuilder("skyline_distant", seed=301)

    # 0. Side Courtyard Stone Walls & Secondary Gabled Houses closing all side gaps between main street buildings!
    # Gap A: Between Gate Curtain Wall (Blender Y = -13.6) and Guardhouse/Apothecary (Blender Y = -1.5)
    for sx in (-1, 1):
        # Connecting stone courtyard wall with slate coping & arched oak postern gate
        wx = sx * 6.8
        b.add_box("stone_ashlar", (wx, -8.2, 1.9), (0.65, 6.2, 3.8), bevel=0.025)
        b.add_box("stone_trim", (wx, -8.2, 3.92), (0.82, 6.4, 0.22), bevel=0.02)
        b.add_box("planks_oak", (wx - sx * 0.12, -8.2, 1.25), (0.55, 1.35, 2.4), bevel=0.015)
        b.add_stone_arch("stone_trim", (wx - sx * 0.22, -8.2, 1.65), radius=0.72, depth=0.38, ring_thickness=0.24, num_voussoirs=7, facing_axis="X")
        # Secondary courtyard storehouse behind the courtyard wall
        bx = sx * 13.8
        b.add_box("stone_ashlar", (bx, -7.8, 2.2), (6.8, 7.5, 4.4), bevel=0.03)
        b.add_box("plaster_cream" if sx < 0 else "plaster_sage", (bx, -7.8, 5.9), (7.0, 7.7, 3.0), bevel=0.025)
        b.add_pitched_tiled_roof("roof_slate" if sx < 0 else "roof_clay", "timber_oak", (bx, -7.8, 7.4), length=7.8, half_span=3.6, rise=3.0, along_axis="Y", eave_rafters=False, with_3d_tiles=False)

        # Gap B: Between Guardhouse/Apothecary (Blender Y = -1.5) and Tavern/Guildhouse (Blender Y = +12)
        b.add_box("stone_ashlar", (sx * 6.9, 5.2, 2.0), (0.65, 5.2, 4.0), bevel=0.025)
        b.add_box("stone_trim", (sx * 6.9, 5.2, 4.12), (0.82, 5.4, 0.22), bevel=0.02)
        b.add_box("stone_ashlar", (sx * 14.5, 5.5, 2.4), (6.5, 8.2, 4.8), bevel=0.03)
        b.add_box("plaster_ochre", (sx * 14.5, 5.5, 6.2), (6.7, 8.4, 2.8), bevel=0.025)
        b.add_pitched_tiled_roof("roof_clay" if sx < 0 else "roof_slate", "timber_oak", (sx * 14.5, 5.5, 7.6), length=8.5, half_span=3.4, rise=2.9, along_axis="Y", eave_rafters=False, with_3d_tiles=False)

    # 1. Street-bend Bridge Arch House (spanning road curve at Blender Y = +25.5, X shifted +2.8)
    b.add_box("stone_ashlar", (-3.2, 25.5, 3.0), (5.2, 4.8, 6.2), bevel=0.03)
    b.add_box("stone_ashlar", (8.8, 25.5, 3.0), (5.6, 4.8, 6.2), bevel=0.03)
    b.add_stone_arch("stone_trim", (2.7, 23.1, 2.4), radius=2.6, depth=0.65, ring_thickness=0.38, num_voussoirs=11, facing_axis="Y")
    b.add_box("plaster_ochre", (2.7, 25.5, 6.95), (14.8, 4.6, 3.3), bevel=0.025)
    b.add_box("timber_oak", (2.7, 23.15, 5.35), (14.9, 0.25, 0.22), bevel=0.015)
    for tx in (-2.5, 0.2, 2.7, 5.2, 7.9):
        b.add_box("timber_oak", (tx, 23.15, 6.95), (0.18, 0.18, 3.2), bevel=0.012)
    for wx in (0.6, 2.7, 4.8):
        b.add_recessed_window((wx, 23.12, 7.0), 1.1, 1.35, (0.0, -1.0), with_shutters=True, glow=True)
    b.add_pitched_tiled_roof("roof_slate", "timber_oak", (2.7, 25.5, 8.6), length=15.0, half_span=2.5, rise=2.6, along_axis="X", overhang=0.45, with_3d_tiles=False)

    # Corner flank buildings blocking side horizon at Y = +20..+24
    b.add_box("plaster_sage", (-9.5, 22.0, 5.4), (7.5, 7.5, 10.8), bevel=0.03)
    b.add_pitched_tiled_roof("roof_clay", "timber_oak", (-9.5, 22.0, 10.8), length=7.6, half_span=3.9, rise=3.2, along_axis="Y", with_3d_tiles=False)
    b.add_box("plaster_cream", (12.5, 20.5, 5.6), (7.8, 7.8, 11.2), bevel=0.03)
    b.add_pitched_tiled_roof("roof_slate", "timber_oak", (12.5, 20.5, 11.2), length=7.9, half_span=4.0, rise=3.4, along_axis="X", with_3d_tiles=False)

    # 2. Mid-Distance Clustered City Rooftops & Chapel Spire (Y = +38 .. +58)
    rooftops = [
        (-16, 40, 8, 9, 10, "plaster_cream", "roof_slate", "Y"),
        (-6, 44, 9, 8, 11.5, "plaster_ochre", "roof_clay", "X"),
        (6, 42, 8.5, 8.5, 10.5, "stone_ashlar", "roof_slate", "Y"),
        (17, 44, 9, 8, 11, "plaster_sage", "roof_clay", "X"),
        (-14, 54, 10, 9, 12.5, "stone_ashlar", "roof_slate", "X"),
        (14, 54, 10, 9, 12, "plaster_cream", "roof_slate", "Y"),
    ]
    for rx, ry, rw, rd, rh, wall_m, roof_m, axis in rooftops:
        b.add_box(wall_m, (rx, ry, rh * 0.5), (rw, rd, rh), bevel=0.03)
        b.add_pitched_tiled_roof(roof_m, "timber_oak", (rx, ry, rh), length=(rd if axis == "Y" else rw), half_span=(rw if axis == "Y" else rd) * 0.5, rise=3.2, along_axis=axis, eave_rafters=False, with_3d_tiles=False)

    # Tall Chapel Belltower Spire at (-7.5, 52, z=0..28)
    b.add_box("stone_ashlar", (-7.5, 52.0, 9.5), (4.8, 4.8, 19.0), bevel=0.04)
    b.add_box("stone_trim", (-7.5, 52.0, 19.2), (5.2, 5.2, 0.55), bevel=0.03)
    b.add_recessed_window((-7.5, 49.55, 16.5), 1.35, 2.4, (0.0, -1.0), frame_mat="stone_trim", with_shutters=False, glow=True)
    b.add_cylinder("roof_slate", (-7.5, 52.0, 23.8), 2.85, 0.12, 9.0, segs=4, bevel=0.02, rot=(0, 0, math.pi / 4))
    b.add_cylinder("brass_aged", (-7.5, 52.0, 28.9), 0.12, 0.02, 1.4, segs=8)

    # 3. Elevated Ashenhold Citadel Keep & Flanking Watchtowers (Y = +68 .. +82, Z base = +7.0)
    b.add_box("stone_trim", (8.0, 74.0, 4.5), (38.0, 18.0, 9.0), bevel=0.08)
    b.add_box("stone_ashlar", (8.0, 72.0, 15.5), (20.0, 12.0, 14.0), bevel=0.05)
    # Central High Keep Tower rising to Z = 38m with stringcourses, lancet windows & crenellated battlements!
    b.add_box("stone_ashlar", (8.0, 74.0, 25.0), (9.5, 9.5, 21.0), bevel=0.05)
    b.add_box("stone_trim", (8.0, 74.0, 22.5), (10.1, 10.1, 0.55), bevel=0.03)
    b.add_box("stone_trim", (8.0, 74.0, 29.5), (10.1, 10.1, 0.55), bevel=0.03)
    b.add_box("stone_trim", (8.0, 74.0, 35.2), (10.4, 10.4, 0.65), bevel=0.03)
    for wx in (5.6, 8.0, 10.4):
        b.add_recessed_window((wx, 69.2, 26.2), 1.25, 2.8, (0.0, -1.0), frame_mat="stone_trim", with_shutters=False, glow=True)
        b.add_recessed_window((wx, 69.2, 32.2), 1.25, 2.4, (0.0, -1.0), frame_mat="stone_trim", with_shutters=False, glow=True)
    for mx in (4.0, 6.0, 8.0, 10.0, 12.0):
        b.add_box("stone_ashlar", (mx, 69.0, 36.1), (1.1, 0.6, 1.2), bevel=0.02)
    for tx in (3.3, 12.7):
        for ty in (69.3, 78.7):
            b.add_cylinder("stone_trim", (tx, ty, 24.5), 1.9, 1.75, 23.0, segs=8, bevel=0.03)
            b.add_cylinder("roof_slate", (tx, ty, 38.5), 2.25, 0.1, 5.2, segs=8, bevel=0.02)
    b.add_pitched_tiled_roof("roof_slate", "stone_trim", (8.0, 74.0, 35.6), length=9.2, half_span=4.6, rise=4.8, along_axis="X", eave_rafters=False, with_3d_tiles=False)
    # Flanking Citadel Curtain Towers
    for cx in (-7.5, 23.5):
        b.add_cylinder("stone_ashlar", (cx, 69.0, 17.0), 3.4, 3.2, 17.0, segs=10, bevel=0.04)
        b.add_cylinder("roof_slate", (cx, 69.0, 27.8), 3.75, 0.15, 4.8, segs=10, bevel=0.02)

    b.finalize_and_export(OUT_DIR / "skyline_distant.glb", bake_ao=False)


# =============================================================================
# SCULPTED STREET PROPS (For InstancedMesh Batching & Street Density)
# =============================================================================

def build_props():
    # 1. Bulging 14-Stave Oak Barrel with Forged Iron Hoops & Bung
    b = MeshBuilder("prop_barrel", seed=401)
    profile = [
        (0.0, 0.02), (0.31, 0.02), (0.32, 0.05), (0.36, 0.24),
        (0.385, 0.46), (0.36, 0.68), (0.32, 0.87), (0.31, 0.90),
        (0.28, 0.90), (0.28, 0.85), (0.0, 0.85),
    ]
    b.add_lathe_profile("planks_oak", profile, segs=14, smooth=False)
    for hz, hr in ((0.12, 0.345), (0.28, 0.375), (0.64, 0.375), (0.80, 0.345)):
        b.add_cylinder("iron_forged", (0, 0, hz), hr, hr, 0.045, segs=14, bevel=0.005)
    b.add_cylinder("timber_oak", (0.38, 0, 0.46), 0.032, 0.032, 0.06, segs=8, rot=(0, math.pi / 2, 0))
    b.finalize_and_export(OUT_DIR / "prop_barrel.glb")

    # 2. Framed Braced Timber Cargo Crate
    b = MeshBuilder("prop_crate", seed=402)
    b.add_box("planks_oak", (0, 0, 0.44), (0.84, 0.84, 0.84), bevel=0.01)
    # Recessed faces via projecting edge frame battens + diagonal cross-brace
    for sx in (-1, 1):
        b.add_box("timber_oak", (sx * 0.42, 0, 0.44), (0.06, 0.88, 0.10), bevel=0.006)
        b.add_box("timber_oak", (sx * 0.42, 0, 0.06), (0.06, 0.88, 0.10), bevel=0.006)
        b.add_box("timber_oak", (sx * 0.42, 0, 0.82), (0.06, 0.88, 0.10), bevel=0.006)
        b.add_box("timber_oak", (sx * 0.42, 0, 0.44), (0.05, 0.96, 0.09), bevel=0.006, rot=(0.78, 0, 0))
    for sy in (-1, 1):
        b.add_box("timber_oak", (0, sy * 0.42, 0.06), (0.88, 0.06, 0.10), bevel=0.006)
        b.add_box("timber_oak", (0, sy * 0.42, 0.82), (0.88, 0.06, 0.10), bevel=0.006)
        b.add_box("timber_oak", (0, sy * 0.42, 0.44), (0.96, 0.05, 0.09), bevel=0.006, rot=(0, 0.78, 0))
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.add_box("timber_oak", (sx * 0.41, sy * 0.41, 0.44), (0.10, 0.10, 0.88), bevel=0.008)
            b.add_box("iron_forged", (sx * 0.43, sy * 0.43, 0.83), (0.12, 0.12, 0.08), bevel=0.004)
    b.finalize_and_export(OUT_DIR / "prop_crate.glb")

    # 3. Slumped Burlap Grain Sack with Tied Neck
    b = MeshBuilder("prop_sack", seed=403)
    profile_s = [
        (0.0, 0.0), (0.24, 0.01), (0.29, 0.14), (0.27, 0.34),
        (0.21, 0.50), (0.08, 0.58), (0.13, 0.67), (0.06, 0.70), (0.0, 0.68),
    ]
    b.add_lathe_profile("fabric_sack", profile_s, segs=12, smooth=True)
    b.add_cylinder("timber_oak", (0, 0, 0.57), 0.09, 0.09, 0.04, segs=12)
    b.finalize_and_export(OUT_DIR / "prop_sack.glb")

    # 4. Ceramic Terracotta Amphora
    b = MeshBuilder("prop_amphora", seed=404)
    profile_a = [
        (0.0, 0.0), (0.13, 0.01), (0.23, 0.24), (0.24, 0.42),
        (0.14, 0.56), (0.08, 0.64), (0.11, 0.72), (0.09, 0.74), (0.06, 0.72), (0.0, 0.68),
    ]
    b.add_lathe_profile("ceramic_clay", profile_a, segs=12, smooth=True)
    for sx in (-1, 1):
        b.add_box("ceramic_clay", (sx * 0.15, 0, 0.54), (0.05, 0.05, 0.20), bevel=0.012, rot=(0, sx * 0.38, 0))
    b.finalize_and_export(OUT_DIR / "prop_amphora.glb")

    # 5. Medieval Wooden Handcart with Dished Spoked Wheels & Iron Rims
    b = MeshBuilder("prop_cart", seed=405)
    b.add_box("planks_oak", (0, 0, 0.58), (1.36, 2.25, 0.12), bevel=0.012)
    for sx in (-1, 1):
        b.add_box("timber_oak", (sx * 0.64, 0, 0.90), (0.09, 2.25, 0.52), bevel=0.01)
        b.add_box("timber_oak", (sx * 0.52, -1.52, 0.52), (0.09, 1.05, 0.09), bevel=0.01, rot=(0.24, 0, 0))
        # Spoked wheel at X = ±0.78
        wx = sx * 0.78
        b.add_cylinder("iron_forged", (wx, 0.05, 0.54), 0.14, 0.14, 0.16, segs=10, rot=(0, math.pi / 2, 0))
        # 10 wheel rim segments + spokes
        num_spokes = 10
        r_wheel = 0.52
        for k in range(num_spokes):
            a = (k / num_spokes) * math.tau
            b.add_box("timber_oak", (wx, 0.05 + math.cos(a) * 0.28, 0.54 + math.sin(a) * 0.28), (0.05, 0.42, 0.05), bevel=0.006, rot=(-a, 0, 0))
            a_mid = ((k + 0.5) / num_spokes) * math.tau
            seg_len = 2 * r_wheel * math.sin(math.pi / num_spokes) + 0.03
            b.add_box("timber_oak", (wx, 0.05 + math.cos(a_mid) * r_wheel, 0.54 + math.sin(a_mid) * r_wheel), (0.09, 0.09, seg_len), bevel=0.008, rot=(-a_mid, 0, 0))
            b.add_box("iron_forged", (wx, 0.05 + math.cos(a_mid) * (r_wheel + 0.045), 0.54 + math.sin(a_mid) * (r_wheel + 0.045)), (0.095, 0.03, seg_len + 0.01), bevel=0.004, rot=(-a_mid, 0, 0))
    b.add_box("timber_oak", (0, 1.08, 0.90), (1.32, 0.09, 0.52), bevel=0.01)
    # Support leg at front tongue
    b.add_box("timber_oak", (0, -1.18, 0.28), (0.10, 0.10, 0.52), bevel=0.01)
    b.finalize_and_export(OUT_DIR / "prop_cart.glb")

    # 6. Scrolled Wall Lantern (+Y projection from wall face at Y=0)
    b = MeshBuilder("prop_lantern_wall", seed=406)
    b.add_box("iron_forged", (0, 0.04, 0), (0.14, 0.06, 0.48), bevel=0.01)
    b.add_box("iron_forged", (0, 0.34, 0.18), (0.06, 0.62, 0.06), bevel=0.008)
    b.add_box("iron_forged", (0, 0.22, 0.04), (0.05, 0.36, 0.05), bevel=0.006, rot=(0.68, 0, 0))
    # Hexagonal lantern body hanging at Y = 0.60
    b.add_cylinder("iron_forged", (0, 0.60, 0.08), 0.02, 0.02, 0.16, segs=6)
    b.add_cylinder("iron_forged", (0, 0.60, -0.02), 0.20, 0.04, 0.15, segs=6, bevel=0.006)
    b.add_cylinder("glow_warm", (0, 0.60, -0.20), 0.11, 0.14, 0.26, segs=6)
    b.add_cylinder("iron_forged", (0, 0.60, -0.35), 0.07, 0.13, 0.07, segs=6, bevel=0.005)
    b.finalize_and_export(OUT_DIR / "prop_lantern_wall.glb", basal_height=0.0)

    # 7. Timber & Stone Street Lantern Post
    b = MeshBuilder("prop_lantern_post", seed=407)
    b.add_box("stone_trim", (0, 0, 0.25), (0.48, 0.48, 0.50), bevel=0.03)
    b.add_box("timber_oak", (0, 0, 1.85), (0.20, 0.20, 2.85), bevel=0.015)
    b.add_box("timber_oak", (0.36, 0, 3.12), (0.85, 0.14, 0.14), bevel=0.012)
    b.add_box("timber_oak", (0.22, 0, 2.82), (0.52, 0.10, 0.10), bevel=0.008, rot=(0, -0.78, 0))
    b.add_cylinder("iron_forged", (0.72, 0, 2.95), 0.02, 0.02, 0.24, segs=6)
    b.add_cylinder("iron_forged", (0.72, 0, 2.82), 0.21, 0.04, 0.16, segs=6, bevel=0.006)
    b.add_cylinder("glow_warm", (0.72, 0, 2.63), 0.12, 0.15, 0.26, segs=6)
    b.add_cylinder("iron_forged", (0.72, 0, 2.47), 0.07, 0.13, 0.07, segs=6, bevel=0.005)
    b.finalize_and_export(OUT_DIR / "prop_lantern_post.glb")

    # 8. Heavy Oak Trestle Bench
    b = MeshBuilder("prop_bench", seed=408)
    b.add_box("planks_oak", (0, 0, 0.46), (1.75, 0.44, 0.07), bevel=0.01)
    for sx in (-0.65, 0.65):
        b.add_box("timber_oak", (sx, 0, 0.22), (0.10, 0.38, 0.42), bevel=0.01)
    b.add_box("timber_oak", (0, 0, 0.18), (1.42, 0.07, 0.07), bevel=0.008)
    b.finalize_and_export(OUT_DIR / "prop_bench.glb")

    # 9. Carved Stone Watering Trough
    b = MeshBuilder("prop_trough", seed=409)
    for sx in (-0.7, 0.7):
        b.add_box("stone_trim", (sx, 0, 0.14), (0.34, 0.75, 0.28), bevel=0.02)
    b.add_box("stone_ashlar", (0, 0, 0.34), (1.85, 0.85, 0.14), bevel=0.02)
    for sy in (-0.36, 0.36):
        b.add_box("stone_ashlar", (0, sy, 0.62), (1.85, 0.13, 0.46), bevel=0.02)
    for sx in (-0.86, 0.86):
        b.add_box("stone_ashlar", (sx, 0, 0.62), (0.13, 0.85, 0.46), bevel=0.02)
    b.finalize_and_export(OUT_DIR / "prop_trough.glb")

    # 10. Chamfered Octagonal Granite Street Bollard
    b = MeshBuilder("prop_bollard", seed=410)
    b.add_cylinder("stone_trim", (0, 0, 0.38), 0.22, 0.17, 0.76, segs=8, bevel=0.03)
    b.add_cylinder("stone_trim", (0, 0, 0.82), 0.17, 0.09, 0.14, segs=8, bevel=0.015)
    b.finalize_and_export(OUT_DIR / "prop_bollard.glb")

    # 11. Half-Barrel Wooden Planter with Leafy Shrubs
    b = MeshBuilder("prop_planter", seed=411)
    b.add_cylinder("planks_oak", (0, 0, 0.26), 0.36, 0.42, 0.52, segs=12, bevel=0.015)
    b.add_cylinder("iron_forged", (0, 0, 0.14), 0.38, 0.39, 0.04, segs=12)
    b.add_cylinder("iron_forged", (0, 0, 0.42), 0.42, 0.43, 0.04, segs=12)
    for k in range(10):
        a = (k / 10) * math.tau
        r = 0.18 if k % 2 == 0 else 0.09
        b.add_box(
            "foliage_leaf",
            (math.cos(a) * r, math.sin(a) * r, 0.60 + (k % 3) * 0.06),
            (0.24, 0.16, 0.22),
            bevel=0.04,
            rot=(0.3 * math.sin(a), 0.3 * math.cos(a), a),
        )
    b.finalize_and_export(OUT_DIR / "prop_planter.glb")

    # 12. Loose Cobble & Curb Weed Cluster (for ground transition scatter)
    b = MeshBuilder("prop_debris_cluster", seed=412)
    for i, (px, py, sx, sy, sz) in enumerate((
        (0.0, 0.0, 0.24, 0.18, 0.10),
        (0.24, 0.12, 0.16, 0.14, 0.08),
        (-0.20, 0.16, 0.14, 0.12, 0.07),
    )):
        b.add_box("stone_trim", (px, py, sz * 0.42), (sx, sy, sz), bevel=0.025, rot=(0.08, -0.05, i * 0.9))
    for i in range(5):
        a = (i / 5) * math.tau + 0.3
        b.add_box("foliage_leaf", (math.cos(a) * 0.16, math.sin(a) * 0.16, 0.14), (0.08, 0.04, 0.28), bevel=0.01, rot=(0.28, 0.22, a))
    b.finalize_and_export(OUT_DIR / "prop_debris_cluster.glb", basal_height=0.0)


def main():
    reset_scene()
    build_gatehouse()
    build_bastion_tower()
    build_curtain_wall()
    build_guardhouse()
    build_apothecary()
    build_tavern()
    build_guildhouse()
    build_skyline_distant()
    build_props()
    print(f"All Blender GLB assets exported successfully to {OUT_DIR}")


if __name__ == "__main__":
    main()
