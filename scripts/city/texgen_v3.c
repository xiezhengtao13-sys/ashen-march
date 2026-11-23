/*
 * texgen_v3.c — Multi-Scale Grounded Gothic PBR Generator (Albedo + Normal + Packed ORM)
 * for Ashenhold Visual Fidelity V3 (Weathered Mountain Citadel).
 *
 * Principles (inspired by Saltline's multi-scale PBR pipeline, 100% original C99 implementation):
 *   - ZERO thick black outlines or directional shadows baked into Albedo.
 *   - 3-scale composition inside every texture:
 *       1) Micro: stone pores, sand grit, hairline micro-cracks
 *       2) Meso:  irregular multi-height courses, pale crumbling mortar, chipped edges, wood checks
 *       3) Macro: mineral color drift, lichen/mineral veins, wear variation
 *   - Outputs raw 8-bit RGB files (.raw) for Albedo, Tangent Normal, and Packed ORM (R=AO, G=Roughness, B=Metal).
 */
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define PI 3.14159265358979323846

static inline float clampf(float v, float lo, float hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

static inline float lerpf(float a, float b, float t) {
    return a + (b - a) * t;
}

static inline float smoothf(float e0, float e1, float x) {
    float t = clampf((x - e0) / (e1 - e0), 0.0f, 1.0f);
    return t * t * (3.0f - 2.0f * t);
}

static inline uint32_t hash2i(int x, int y, uint32_t seed) {
    uint32_t h = (uint32_t)(x * 374761393 + y * 668265263) ^ (seed * 2246822519u);
    h = (h ^ (h >> 13)) * 1274126177u;
    return h ^ (h >> 16);
}

static inline float hash2f(int x, int y, uint32_t seed) {
    return (float)(hash2i(x, y, seed) & 0xFFFFFFu) / 16777215.0f;
}

/* Seamless periodic value noise over integer period (px, py) */
static float vnoise_tile(float u, float v, int px, int py, uint32_t seed) {
    float fx = u * (float)px;
    float fy = v * (float)py;
    int ix = (int)floorf(fx);
    int iy = (int)floorf(fy);
    float tx = fx - (float)ix;
    float ty = fy - (float)iy;
    tx = tx * tx * (3.0f - 2.0f * tx);
    ty = ty * ty * (3.0f - 2.0f * ty);

    int x0 = ((ix % px) + px) % px;
    int y0 = ((iy % py) + py) % py;
    int x1 = (x0 + 1) % px;
    int y1 = (y0 + 1) % py;

    float a = hash2f(x0, y0, seed);
    float b = hash2f(x1, y0, seed);
    float c = hash2f(x0, y1, seed);
    float d = hash2f(x1, y1, seed);
    return lerpf(lerpf(a, b, tx), lerpf(c, d, tx), ty);
}

static float fbm_tile(float u, float v, int base_p, int octaves, uint32_t seed) {
    float sum = 0.0f, amp = 0.5f, norm = 0.0f;
    int p = base_p;
    for (int i = 0; i < octaves; i++) {
        sum += amp * vnoise_tile(u, v, p, p, seed + (uint32_t)i * 101u);
        norm += amp;
        amp *= 0.5f;
        p *= 2;
    }
    return sum / norm;
}

static float ridged_tile(float u, float v, int base_p, int octaves, uint32_t seed) {
    float sum = 0.0f, amp = 0.5f, norm = 0.0f;
    int p = base_p;
    for (int i = 0; i < octaves; i++) {
        float n = vnoise_tile(u, v, p, p, seed + (uint32_t)i * 73u);
        float r = 1.0f - fabsf(n * 2.0f - 1.0f);
        sum += amp * r * r;
        norm += amp;
        amp *= 0.5f;
        p *= 2;
    }
    return sum / norm;
}

typedef struct {
    float d1;
    float d2;
    float id;
} VoroOut;

/* Periodic Voronoi for irregular flagstones / rock fractures */
static VoroOut voronoi_tile(float u, float v, int gx, int gy, float jitter, uint32_t seed) {
    float fx = u * (float)gx;
    float fy = v * (float)gy;
    int ix = (int)floorf(fx);
    int iy = (int)floorf(fy);
    float d1 = 1e9f, d2 = 1e9f, cid = 0.0f;
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            int cx = ix + dx;
            int cy = iy + dy;
            int mx = ((cx % gx) + gx) % gx;
            int my = ((cy % gy) + gy) % gy;
            float px = (float)cx + 0.5f + (hash2f(mx, my, seed) - 0.5f) * jitter;
            float py = (float)cy + 0.5f + (hash2f(mx, my, seed + 19u) - 0.5f) * jitter;
            float rx = fx - px;
            float ry = fy - py;
            float d = sqrtf(rx * rx + ry * ry);
            if (d < d1) {
                d2 = d1;
                d1 = d;
                cid = hash2f(mx, my, seed + 47u);
            } else if (d < d2) {
                d2 = d;
            }
        }
    }
    VoroOut out = {d1, d2, cid};
    return out;
}

static void write_raw_rgb(const char *path, const uint8_t *buf, int w, int h) {
    FILE *f = fopen(path, "wb");
    if (!f) {
        fprintf(stderr, "Failed to open %s\n", path);
        exit(1);
    }
    fwrite(buf, 1, (size_t)w * (size_t)h * 3u, f);
    fclose(f);
}

static void build_normal_from_height(const float *H, uint8_t *N, int S, float strength) {
    for (int y = 0; y < S; y++) {
        int ym = (y - 1 + S) % S;
        int yp = (y + 1) % S;
        for (int x = 0; x < S; x++) {
            int xm = (x - 1 + S) % S;
            int xp = (x + 1) % S;
            float tl = H[ym * S + xm], tc = H[ym * S + x], tr = H[ym * S + xp];
            float ml = H[y * S + xm],                      mr = H[y * S + xp];
            float bl = H[yp * S + xm], bc = H[yp * S + x], br = H[yp * S + xp];
            float dx = (tr + 2.0f * mr + br) - (tl + 2.0f * ml + bl);
            float dy = (bl + 2.0f * bc + br) - (tl + 2.0f * tc + tr);
            float nx = -dx * strength;
            float ny = dy * strength; /* OpenGL +Y up */
            float nz = 1.0f;
            float inv = 1.0f / sqrtf(nx * nx + ny * ny + nz * nz);
            int idx = (y * S + x) * 3;
            N[idx + 0] = (uint8_t)clampf((nx * inv * 0.5f + 0.5f) * 255.0f, 0.0f, 255.0f);
            N[idx + 1] = (uint8_t)clampf((ny * inv * 0.5f + 0.5f) * 255.0f, 0.0f, 255.0f);
            N[idx + 2] = (uint8_t)clampf((nz * inv * 0.5f + 0.5f) * 255.0f, 0.0f, 255.0f);
        }
    }
}

static void gen_material(const char *out_dir, const char *name, int kind, int S) {
    uint8_t *alb = (uint8_t *)malloc((size_t)S * S * 3u);
    uint8_t *orm = (uint8_t *)malloc((size_t)S * S * 3u);
    uint8_t *nrm = (uint8_t *)malloc((size_t)S * S * 3u);
    float *H = (float *)malloc((size_t)S * S * sizeof(float));

    /* Variable course heights for Stormveil irregular gothic masonry */
    const float course_y[9] = {0.0f, 0.145f, 0.255f, 0.410f, 0.525f, 0.655f, 0.785f, 0.895f, 1.0f};
    const int course_cols[8] = {4, 6, 5, 7, 4, 6, 5, 7};

    for (int y = 0; y < S; y++) {
        float v = (float)y / (float)S;
        for (int x = 0; x < S; x++) {
            float u = (float)x / (float)S;
            float r = 0.5f, g = 0.5f, b = 0.5f;
            float h = 0.5f, ao = 1.0f, rough = 0.82f, metal = 0.0f;

            float micro = fbm_tile(u, v, 32, 3, 911u);
            float grit = vnoise_tile(u, v, 128, 128, 1777u);
            float meso = fbm_tile(u, v, 8, 4, 307u);
            float crack = ridged_tile(u, v, 6, 4, 521u);

            if (kind == 0) {
                /* 1. weathered_limestone: Pale ancient gothic limestone blocks, crisp warm-grey, fine pitting */
                float wu = u + (meso - 0.5f) * 0.008f;
                float wv = v + (meso - 0.5f) * 0.008f;
                int row = (int)floorf(fmodf(wv + 1.0f, 1.0f) * 4.0f);
                float rv = fmodf((wv + 1.0f) * 4.0f, 1.0f);
                float shift = (row % 2) * 0.37f + hash2f(row, 1, 88u) * 0.2f;
                float cu = fmodf((wu + shift + 2.0f) * 3.0f, 1.0f);
                int col = (int)floorf(fmodf(wu + shift + 2.0f, 1.0f) * 3.0f);
                float bh = hash2f(col, row, 409u);

                float edgeX = fminf(cu, 1.0f - cu);
                float edgeY = fminf(rv, 1.0f - rv);
                float joint = fminf(edgeX * 1.4f, edgeY) + (micro - 0.5f) * 0.025f;
                float stoneMask = smoothf(0.014f, 0.055f, joint);

                /* Fine stone pores + subtle sedimentary strata */
                float strata = fbm_tile(u * 0.5f, v * 2.5f, 6, 3, 613u);
                float pits = smoothf(0.76f, 0.92f, micro * 0.7f + grit * 0.3f);
                float fineCrack = smoothf(0.92f, 0.985f, crack);

                /* Pale weathered limestone base (NO black mortar!) */
                float tone = 0.58f + (bh - 0.5f) * 0.11f + (strata - 0.5f) * 0.08f + (grit - 0.5f) * 0.05f;
                float sr = tone * 1.03f, sg = tone * 1.00f, sb = tone * 0.93f;
                /* Pale sandy mortar inside joints */
                float mr = 0.46f + micro * 0.06f, mg = 0.44f + micro * 0.05f, mb = 0.40f + micro * 0.05f;
                r = lerpf(mr, sr, stoneMask) * (1.0f - pits * 0.10f - fineCrack * 0.14f);
                g = lerpf(mg, sg, stoneMask) * (1.0f - pits * 0.10f - fineCrack * 0.14f);
                b = lerpf(mb, sb, stoneMask) * (1.0f - pits * 0.09f - fineCrack * 0.12f);

                h = lerpf(0.24f, 0.78f + (strata - 0.5f) * 0.12f, stoneMask) - pits * 0.14f - fineCrack * 0.22f + (grit - 0.5f) * 0.04f;
                ao = lerpf(0.64f, 0.98f, stoneMask) * (1.0f - fineCrack * 0.25f - pits * 0.08f);
                rough = lerpf(0.94f, 0.76f + (bh - 0.5f) * 0.10f + micro * 0.08f, stoneMask);

            } else if (kind == 1) {
                /* 2. citadel_masonry: Stormveil-inspired irregular coursed stone wall, chipped faces, pale dusty mortar */
                float wv = fmodf(v + (meso - 0.5f) * 0.012f + 1.0f, 1.0f);
                int row = 0;
                for (int k = 0; k < 8; k++) {
                    if (wv >= course_y[k] && wv <= course_y[k + 1]) { row = k; break; }
                }
                float rv = (wv - course_y[row]) / (course_y[row + 1] - course_y[row]);
                int cols = course_cols[row];
                float rowOff = hash2f(row, 17, 131u) * 0.75f;
                float wu = fmodf(u + rowOff + (micro - 0.5f) * 0.012f + 2.0f, 1.0f);
                int col = (int)floorf(wu * (float)cols);
                float cu = wu * (float)cols - (float)col;
                float bh = hash2f(col, row, 733u);
                float bh2 = hash2f(col, row, 991u);

                /* Chipped eroded stone edges */
                float chip = (fbm_tile(u, v, 16, 3, 211u) - 0.5f) * 0.055f;
                float edgeX = fminf(cu, 1.0f - cu) * (4.8f / (float)cols);
                float edgeY = fminf(rv, 1.0f - rv) * ((course_y[row + 1] - course_y[row]) * 8.0f);
                float dEdge = fminf(edgeX, edgeY) + chip;
                float stoneMask = smoothf(0.032f, 0.115f, dEdge);
                float bevelFace = smoothf(0.05f, 0.24f, dEdge);

                /* Natural geological mineral color diversity (warm buff, cool grey, subtle weathered olive) */
                float baseL = 0.44f + (bh - 0.5f) * 0.18f + (meso - 0.5f) * 0.07f + (grit - 0.5f) * 0.05f;
                float warmShift = (bh2 - 0.5f) * 0.09f;
                float sr = baseL + warmShift * 0.9f;
                float sg = baseL + warmShift * 0.35f + smoothf(0.68f, 0.92f, meso) * 0.025f;
                float sb = baseL - warmShift * 0.75f;
                /* Pale sandy crumbling mortar — NEVER cartoon black! */
                float mr = 0.43f + micro * 0.07f;
                float mg = 0.41f + micro * 0.06f;
                float mb = 0.37f + micro * 0.06f;

                float fracture = smoothf(0.90f, 0.985f, crack) * stoneMask;
                float spall = smoothf(0.72f, 0.92f, micro) * (1.0f - bevelFace * 0.5f);
                r = lerpf(mr, sr, stoneMask) * (1.0f - fracture * 0.18f) + spall * 0.035f;
                g = lerpf(mg, sg, stoneMask) * (1.0f - fracture * 0.18f) + spall * 0.032f;
                b = lerpf(mb, sb, stoneMask) * (1.0f - fracture * 0.15f) + spall * 0.028f;

                float blockRelief = 0.62f + (bh - 0.5f) * 0.24f + bevelFace * 0.18f;
                h = lerpf(0.16f + micro * 0.08f, blockRelief + (micro - 0.5f) * 0.14f, stoneMask) - fracture * 0.24f;
                ao = lerpf(0.56f, 0.98f, smoothf(0.02f, 0.18f, dEdge)) * (1.0f - fracture * 0.25f);
                rough = lerpf(0.95f, 0.72f + (bh2 - 0.5f) * 0.14f + (1.0f - bevelFace) * 0.10f, stoneMask);

            } else if (kind == 2) {
                /* 3. damp_slate_stone: Deep weathered mountain slate / wet undercroft stone */
                float strata = fbm_tile(u * 1.0f, v * 3.0f, 6, 4, 809u);
                float wu = u + (strata - 0.5f) * 0.018f;
                float wv = v + (meso - 0.5f) * 0.015f;
                VoroOut vo = voronoi_tile(wu, wv, 5, 7, 0.42f, 641u);
                float seam = vo.d2 - vo.d1;
                float mask = smoothf(0.03f, 0.095f, seam + (micro - 0.5f) * 0.03f);
                float tone = 0.29f + (vo.id - 0.5f) * 0.11f + (strata - 0.5f) * 0.08f;
                r = lerpf(0.22f, tone * 0.94f, mask);
                g = lerpf(0.24f, tone * 0.99f, mask);
                b = lerpf(0.25f, tone * 1.05f, mask);
                float wetPatch = smoothf(0.45f, 0.78f, meso * 0.7f + strata * 0.3f);
                h = lerpf(0.18f, 0.68f + (strata - 0.5f) * 0.25f + (micro - 0.5f) * 0.10f, mask);
                ao = lerpf(0.52f, 0.96f, mask);
                rough = lerpf(0.84f, 0.36f, wetPatch * mask);

            } else if (kind == 3) {
                /* 4. aged_oak_timber: Ancient weathered oak planks & beams with fine anisotropic wood fibers & splits */
                int plank = (int)floorf(u * 4.0f);
                float pu = fmodf(u * 4.0f, 1.0f);
                float ph = hash2f(plank, 3, 557u);
                float ph2 = hash2f(plank, 11, 743u);
                float seam = fminf(pu, 1.0f - pu);
                float pMask = smoothf(0.010f, 0.036f, seam + (micro - 0.5f) * 0.012f);

                float pv = fmodf(v + ph2, 1.0f);
                float warp = fbm_tile(u * 1.5f, pv * 0.5f, 4, 4, 443u);
                float streak1 = vnoise_tile(u + warp * 0.04f, pv, 64, 6, 997u);
                float streak2 = vnoise_tile(u + warp * 0.02f, pv, 128, 12, 1213u);
                float fibers = streak1 * 0.62f + streak2 * 0.38f;
                float grainRing = fbm_tile(u * 2.5f + warp * 0.25f, pv * 0.35f, 6, 3, 601u);
                float checkCrack = smoothf(0.89f, 0.985f, ridged_tile(u * 4.0f, pv * 0.5f, 8, 3, 331u));

                float base = 0.34f + (ph - 0.5f) * 0.09f + (fibers - 0.5f) * 0.14f + (grainRing - 0.5f) * 0.08f;
                float silver = smoothf(0.50f, 0.85f, meso) * 0.26f;
                r = lerpf(base * 1.18f, base * 0.99f, silver) * (1.0f - checkCrack * 0.28f);
                g = lerpf(base * 0.95f, base * 0.97f, silver) * (1.0f - checkCrack * 0.28f);
                b = lerpf(base * 0.72f, base * 0.92f, silver) * (1.0f - checkCrack * 0.24f);
                r = lerpf(0.20f, r, pMask);
                g = lerpf(0.17f, g, pMask);
                b = lerpf(0.14f, b, pMask);

                h = lerpf(0.18f, 0.64f + (fibers - 0.5f) * 0.22f + (grainRing - 0.5f) * 0.12f - checkCrack * 0.30f, pMask);
                ao = lerpf(0.54f, 0.98f, pMask) * (1.0f - checkCrack * 0.28f);
                rough = lerpf(0.94f, 0.74f + (1.0f - fibers) * 0.14f + silver * 0.08f, pMask);

            } else if (kind == 4) {
                /* 5. broken_flagstone: Irregular fractured gothic paving slabs + earthy mossy joints */
                float wu = u + (meso - 0.5f) * 0.025f;
                float wv = v + (meso - 0.5f) * 0.025f;
                VoroOut vo = voronoi_tile(wu, wv, 4, 4, 0.58f, 223u);
                float seam = (vo.d2 - vo.d1) + (micro - 0.5f) * 0.045f;
                float slab = smoothf(0.035f, 0.095f, seam);
                float edgeWear = smoothf(0.06f, 0.22f, seam);
                float internalCrack = smoothf(0.91f, 0.985f, crack) * slab;

                /* Natural weathered paving limestone/slate tones (NO harsh black seams!) */
                float stoneL = 0.45f + (vo.id - 0.5f) * 0.15f + (micro - 0.5f) * 0.06f + (grit - 0.5f) * 0.04f;
                float warm = (hash2f((int)(vo.id * 97.0f), 5, 811u) - 0.5f) * 0.07f;
                float sr = stoneL + warm;
                float sg = stoneL + warm * 0.4f;
                float sb = stoneL - warm * 0.7f;
                /* Earthy grey-brown packed dirt + subtle crevice moss in joints */
                float jMoss = smoothf(0.42f, 0.78f, meso);
                float jr = lerpf(0.32f, 0.24f, jMoss);
                float jg = lerpf(0.30f, 0.30f, jMoss);
                float jb = lerpf(0.25f, 0.20f, jMoss);

                r = lerpf(jr, sr, slab) * (1.0f - internalCrack * 0.20f);
                g = lerpf(jg, sg, slab) * (1.0f - internalCrack * 0.20f);
                b = lerpf(jb, sb, slab) * (1.0f - internalCrack * 0.18f);

                h = lerpf(0.20f + micro * 0.08f, 0.68f + (vo.id - 0.5f) * 0.14f + edgeWear * 0.12f - internalCrack * 0.24f, slab);
                ao = lerpf(0.60f, 0.98f, smoothf(0.02f, 0.14f, seam)) * (1.0f - internalCrack * 0.28f);
                /* Foot-worn centers slightly smoother (0.60), cracked edges & soil joints rough (0.94) */
                rough = lerpf(0.94f, 0.60f + (1.0f - edgeWear) * 0.22f + micro * 0.08f, slab);

            } else {
                /* 6. mountain_crag_rock: Striated cliff rock with sharp angular fractures & crevice moss */
                float warp = fbm_tile(u, v, 4, 4, 701u);
                float strata = ridged_tile(u * 0.75f + warp * 0.18f, v * 1.6f + warp * 0.12f, 5, 5, 353u);
                float frac = ridged_tile(u * 1.2f, v * 1.2f, 8, 4, 887u);
                float crag = strata * 0.62f + frac * 0.38f;
                float moss = smoothf(0.68f, 0.90f, meso * 0.7f + (1.0f - crag) * 0.4f);

                float L = 0.34f + crag * 0.22f + (grit - 0.5f) * 0.06f;
                r = lerpf(L * 1.01f, 0.24f, moss * 0.45f);
                g = lerpf(L * 0.99f, 0.31f, moss * 0.45f);
                b = lerpf(L * 0.95f, 0.21f, moss * 0.45f);
                h = clampf(crag * 0.85f + micro * 0.15f, 0.0f, 1.0f);
                ao = clampf(0.56f + crag * 0.44f, 0.50f, 1.0f);
                rough = clampf(0.78f + (1.0f - crag) * 0.16f + moss * 0.06f, 0.65f, 0.98f);
            }

            int idx = (y * S + x) * 3;
            alb[idx + 0] = (uint8_t)clampf(r * 255.0f, 0.0f, 255.0f);
            alb[idx + 1] = (uint8_t)clampf(g * 255.0f, 0.0f, 255.0f);
            alb[idx + 2] = (uint8_t)clampf(b * 255.0f, 0.0f, 255.0f);

            /* Packed ORM: R = micro AO, G = Roughness, B = Metalness */
            orm[idx + 0] = (uint8_t)clampf(ao * 255.0f, 0.0f, 255.0f);
            orm[idx + 1] = (uint8_t)clampf(rough * 255.0f, 0.0f, 255.0f);
            orm[idx + 2] = (uint8_t)clampf(metal * 255.0f, 0.0f, 255.0f);

            H[y * S + x] = clampf(h, 0.0f, 1.0f);
        }
    }

    float nrmStrength = (kind == 1 || kind == 5) ? 2.6f : (kind == 4 ? 2.2f : 1.9f);
    build_normal_from_height(H, nrm, S, nrmStrength);

    char pbuf[512];
    snprintf(pbuf, sizeof(pbuf), "%s/%s_albedo.raw", out_dir, name);
    write_raw_rgb(pbuf, alb, S, S);
    snprintf(pbuf, sizeof(pbuf), "%s/%s_orm.raw", out_dir, name);
    write_raw_rgb(pbuf, orm, S, S);
    snprintf(pbuf, sizeof(pbuf), "%s/%s_normal.raw", out_dir, name);
    write_raw_rgb(pbuf, nrm, S, S);

    free(alb);
    free(orm);
    free(nrm);
    free(H);
}

int main(int argc, char **argv) {
    const char *out_dir = (argc > 1) ? argv[1] : "/tmp/tex_v3";
    int S = 512;
    gen_material(out_dir, "limestone_weathered", 0, S);
    gen_material(out_dir, "citadel_masonry", 1, S);
    gen_material(out_dir, "damp_slate_stone", 2, S);
    gen_material(out_dir, "aged_oak_timber", 3, S);
    gen_material(out_dir, "broken_flagstone", 4, S);
    gen_material(out_dir, "mountain_crag_rock", 5, S);
    printf("Generated 6 V3 multi-scale PBR sets (Albedo + Normal + Packed ORM, %dx%d) -> %s\n", S, S, out_dir);
    return 0;
}
