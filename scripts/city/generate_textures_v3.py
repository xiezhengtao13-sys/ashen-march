#!/usr/bin/env python3
"""
Compiles and runs texgen_v3.c to produce 6 original Grounded Gothic Mountain Citadel
multi-scale PBR texture sets (Albedo, Tangent Normal, and Packed ORM: R=AO, G=Roughness, B=Metal)
in public/assets/city/textures/.
"""
import subprocess
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "scripts/city/texgen_v3.c"
BIN = Path("/tmp/texgen_v3")
RAW_DIR = Path("/tmp/tex_v3_raw")
OUT_DIR = ROOT / "public/assets/city/textures"

NAMES = [
    "limestone_weathered",
    "citadel_masonry",
    "damp_slate_stone",
    "aged_oak_timber",
    "broken_flagstone",
    "mountain_crag_rock",
]


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    subprocess.run(["gcc", "-O3", str(SRC), "-o", str(BIN), "-lm"], check=True)
    subprocess.run([str(BIN), str(RAW_DIR)], check=True)

    S = 512
    for name in NAMES:
        for ch in ("albedo", "normal", "orm"):
            raw = (RAW_DIR / f"{name}_{ch}.raw").read_bytes()
            img = Image.frombytes("RGB", (S, S), raw)
            img.save(OUT_DIR / f"{name}_{ch}.png", optimize=True)
    print(f"Saved {len(NAMES) * 3} V3 PBR PNG maps -> {OUT_DIR}")


if __name__ == "__main__":
    main()
