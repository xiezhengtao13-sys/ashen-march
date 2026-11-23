#!/usr/bin/env python3
"""
Deterministic PBR texture & heraldic sign generator for Ashenhold (灰烬城).
Outputs optimized PNG maps under public/assets/city/textures/.
"""
import os
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "public" / "assets" / "city" / "textures"
TEXGEN_SRC = Path(__file__).resolve().parent / "texgen.c"

TEXTURE_SPECS = [
    ("stone_ashlar", 512),
    ("stone_trim", 512),
    ("brick_medieval", 512),
    ("cobble_street", 1024),
    ("dirt_gravel", 512),
    ("timber_oak", 512),
    ("planks_oak", 512),
    ("plaster_cream", 512),
    ("plaster_ochre", 512),
    ("plaster_sage", 512),
    ("roof_slate", 512),
    ("roof_clay", 512),
    ("iron_forged", 512),
    ("brass_aged", 512),
]


def convert_raw_to_png(raw_dir: Path, out_dir: Path) -> None:
    for name, size in TEXTURE_SPECS:
        for suffix in ("albedo", "normal", "roughness"):
            raw_path = raw_dir / f"{name}_{suffix}.raw"
            out_path = out_dir / f"{name}_{suffix}.png"
            data = raw_path.read_bytes()
            img = Image.frombytes("RGBA", (size, size), data)
            if suffix == "roughness":
                img = img.convert("L")
            else:
                img = img.convert("RGB")
            img.save(out_path, optimize=True)


def add_fabric_weave(img: Image.Image) -> Image.Image:
    w, h = img.size
    px = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            weave = ((x ^ y) & 1) * 10 - 5 + (((x // 2) + (y // 2)) % 3 - 1) * 4
            hem_dirt = max(0, (y / h - 0.72) / 0.28)
            dr = int(max(0, min(255, r + weave - hem_dirt * 32)))
            dg = int(max(0, min(255, g + weave - hem_dirt * 34)))
            db = int(max(0, min(255, b + weave - hem_dirt * 36)))
            px[x, y] = (dr, dg, db)
    return img


def generate_banners_and_signs(out_dir: Path) -> None:
    # 1. Ashenhold Heraldic Banner (Crimson + Gold Phoenix/Anvil Shield + Trim)
    w, h = 256, 512
    banner = Image.new("RGB", (w, h), (118, 28, 28))
    d = ImageDraw.Draw(banner)
    # Dark outer hem & antique gold border
    d.rectangle([0, 0, w - 1, h - 1], outline=(58, 14, 14), width=8)
    d.rectangle([16, 16, w - 17, h - 28], outline=(198, 156, 72), width=6)
    d.rectangle([28, 28, w - 29, h - 40], outline=(136, 98, 42), width=2)
    # Gold chevron bands
    d.polygon([(16, 360), (128, 420), (240, 360), (240, 386), (128, 446), (16, 386)], fill=(198, 156, 72))
    # Central dark charcoal heater shield
    d.polygon([(74, 118), (182, 118), (182, 224), (128, 294), (74, 224)], fill=(34, 34, 38), outline=(212, 170, 82), width=5)
    # Stylized golden anvil & ember flame emblem inside shield
    d.polygon([(98, 188), (158, 188), (146, 206), (110, 206)], fill=(214, 174, 88))
    d.rectangle([114, 206, 142, 228], fill=(186, 146, 68))
    d.polygon([(102, 228), (154, 228), (160, 240), (96, 240)], fill=(214, 174, 88))
    d.polygon([(128, 134), (144, 164), (128, 180), (112, 164)], fill=(224, 108, 42))
    d.polygon([(128, 144), (136, 162), (128, 172), (120, 162)], fill=(246, 208, 108))
    banner = add_fabric_weave(banner)
    banner.save(out_dir / "banner_ashenhold.png", optimize=True)

    # 2. Striped Market Awning Fabric (Warm Terracotta & Unbleached Linen)
    aw = Image.new("RGB", (256, 256), (208, 194, 166))
    ad = ImageDraw.Draw(aw)
    for x in range(0, 256, 64):
        ad.rectangle([x, 0, x + 31, 255], fill=(134, 54, 42))
    aw = add_fabric_weave(aw)
    aw.save(out_dir / "awning_striped.png", optimize=True)

    # 3. Painted Wooden Tavern Sign ("The Ember & Flagon")
    plank_bg = Image.open(out_dir / "planks_oak_albedo.png").resize((256, 256)).copy()
    sd = ImageDraw.Draw(plank_bg)
    sd.rectangle([10, 10, 245, 245], outline=(210, 172, 88), width=6)
    sd.rectangle([20, 20, 235, 235], outline=(62, 42, 24), width=3)
    # Painted flagon tankard + golden foam + glowing ember motif
    sd.polygon([(84, 96), (154, 96), (148, 198), (90, 198)], fill=(188, 144, 68), outline=(44, 28, 16), width=3)
    sd.arc([146, 112, 188, 176], start=-90, end=90, fill=(188, 144, 68), width=10)
    sd.ellipse([80, 74, 158, 106], fill=(238, 224, 192))
    sd.ellipse([106, 128, 132, 164], fill=(224, 92, 34))
    plank_bg = plank_bg.filter(ImageFilter.SMOOTH_MORE)
    plank_bg.save(out_dir / "sign_tavern.png", optimize=True)

    # 4. Painted Apothecary Sign (Mortar & Herb Leaf)
    ap_bg = Image.open(out_dir / "planks_oak_albedo.png").resize((256, 256)).copy()
    apd = ImageDraw.Draw(ap_bg)
    apd.rectangle([10, 10, 245, 245], outline=(168, 186, 142), width=6)
    apd.polygon([(78, 134), (178, 134), (156, 196), (100, 196)], fill=(154, 148, 132), outline=(42, 36, 28), width=3)
    apd.line([(122, 134), (158, 86)], fill=(186, 176, 154), width=12)
    apd.polygon([(112, 74), (132, 108), (114, 130), (96, 104)], fill=(86, 148, 76))
    ap_bg.save(out_dir / "sign_apothecary.png", optimize=True)

    # 5. Leaded Glass Window Texture (Dark charcoal lead cames + subtle warm interior tint)
    gw = Image.new("RGB", (256, 256), (48, 44, 38))
    gd = ImageDraw.Draw(gw)
    for y in range(0, 256, 32):
        for x in range(0, 256, 32):
            # diamond / leaded quarrels with subtle warm amber glass variation
            shade = ((x * 7 + y * 13) % 24) - 12
            c = (max(0, min(255, 118 + shade)), max(0, min(255, 96 + shade)), max(0, min(255, 68 + shade // 2)))
            gd.polygon([(x + 16, y + 2), (x + 30, y + 16), (x + 16, y + 30), (x + 2, y + 16)], fill=c, outline=(28, 28, 30))
    gw.save(out_dir / "window_leaded.png", optimize=True)

    # 6. Additional Market Striped & Dyed Awning Fabrics
    def make_awning(filename: str, base_rgb: tuple[int, int, int], stripe_rgb: tuple[int, int, int]) -> None:
        img = Image.new("RGB", (256, 256), base_rgb)
        draw = ImageDraw.Draw(img)
        for sx in range(0, 256, 64):
            draw.rectangle([sx, 0, sx + 31, 255], fill=stripe_rgb)
        img = add_fabric_weave(img)
        img.save(out_dir / filename, optimize=True)

    make_awning("awning_navy.png",    (206, 194, 168), (44, 68, 108))
    make_awning("awning_emerald.png", (204, 194, 164), (54, 96, 62))
    make_awning("awning_ochre.png",   (212, 198, 168), (176, 128, 46))
    make_awning("awning_plum.png",    (206, 190, 164), (108, 48, 72))

    # 7. Additional Painted Wooden Market Shop Signs
    def make_shop_sign(filename: str, border_rgb: tuple[int, int, int], draw_motif) -> None:
        bg = Image.open(out_dir / "planks_oak_albedo.png").resize((256, 256)).copy()
        dr = ImageDraw.Draw(bg)
        dr.rectangle([10, 10, 245, 245], outline=border_rgb, width=6)
        dr.rectangle([20, 20, 235, 235], outline=(58, 40, 22), width=3)
        draw_motif(dr)
        bg = bg.filter(ImageFilter.SMOOTH_MORE)
        bg.save(out_dir / filename, optimize=True)

    make_shop_sign(
        "sign_bakery.png",
        (214, 168, 86),
        lambda dr: (
            dr.ellipse([66, 98, 190, 168], fill=(196, 134, 62), outline=(72, 42, 18), width=4),
            dr.line([(92, 106), (112, 152)], fill=(236, 196, 122), width=6),
            dr.line([(128, 102), (146, 152)], fill=(236, 196, 122), width=6),
            dr.line([(160, 108), (174, 148)], fill=(236, 196, 122), width=6),
        ),
    )
    make_shop_sign(
        "sign_smithy.png",
        (178, 136, 78),
        lambda dr: (
            dr.polygon([(66, 124), (192, 124), (168, 154), (88, 154)], fill=(78, 84, 94), outline=(30, 32, 36), width=3),
            dr.rectangle([102, 154, 154, 188], fill=(66, 70, 78)),
            dr.polygon([(80, 188), (176, 188), (186, 204), (70, 204)], fill=(78, 84, 94)),
            dr.rectangle([120, 62, 136, 118], fill=(116, 78, 44)),
            dr.rectangle([96, 54, 160, 78], fill=(112, 118, 128), outline=(36, 38, 42), width=3),
        ),
    )
    make_shop_sign(
        "sign_market.png",
        (206, 172, 92),
        lambda dr: (
            dr.line([(128, 66), (128, 196)], fill=(192, 156, 76), width=8),
            dr.line([(72, 94), (184, 94)], fill=(192, 156, 76), width=7),
            dr.polygon([(56, 152), (88, 152), (72, 174)], fill=(192, 156, 76)),
            dr.polygon([(168, 152), (200, 152), (184, 174)], fill=(192, 156, 76)),
            dr.line([(72, 94), (58, 152)], fill=(166, 134, 66), width=3),
            dr.line([(72, 94), (86, 152)], fill=(166, 134, 66), width=3),
            dr.line([(184, 94), (170, 152)], fill=(166, 134, 66), width=3),
            dr.line([(184, 94), (198, 152)], fill=(166, 134, 66), width=3),
        ),
    )



def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        bin_path = tmp_path / "texgen"
        subprocess.run(
            ["gcc", "-O3", str(TEXGEN_SRC), "-lm", "-o", str(bin_path)],
            check=True,
        )
        subprocess.run([str(bin_path), str(tmp_path)], check=True)
        convert_raw_to_png(tmp_path, OUT_DIR)
    generate_banners_and_signs(OUT_DIR)
    print(f"All textures written to {OUT_DIR}")


if __name__ == "__main__":
    main()
