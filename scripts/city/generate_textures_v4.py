#!/usr/bin/env python3
"""
Compiles scripts/city/texgen_v4.c with -O3 and converts the 21 raw 1024x1024 / 512x512
multi-scale PBR textures (Albedo, Tangent Normal, HBAO Packed ORM) into optimized PNGs
in public/assets/city/textures/.
"""
import subprocess
import tempfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
C_SRC = ROOT / "scripts/city/texgen_v4.c"
OUT_DIR = ROOT / "public/assets/city/textures"

SPECS = [
    ("limestone_weathered", 1024),
    ("citadel_masonry", 1024),
    ("damp_slate_stone", 512),
    ("aged_oak_timber", 512),
    ("broken_flagstone", 1024),
    ("mountain_crag_rock", 1024),
    ("iron_forged_v4", 512),
]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        bin_path = Path(tmp) / "texgen_v4"
        subprocess.run(
            ["gcc", "-O3", "-Wall", "-Wextra", str(C_SRC), "-lm", "-o", str(bin_path)],
            check=True,
        )
        subprocess.run([str(bin_path), tmp], check=True)

        for name, size in SPECS:
            for suffix in ("albedo", "normal", "orm"):
                raw_path = Path(tmp) / f"{name}_{suffix}.raw"
                data = raw_path.read_bytes()
                img = Image.frombytes("RGB", (size, size), data)
                out_png = OUT_DIR / f"{name}_{suffix}.png"
                img.save(out_png, format="PNG", compress_level=5)
                print(f"Saved {out_png.name} ({size}x{size}, {out_png.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
