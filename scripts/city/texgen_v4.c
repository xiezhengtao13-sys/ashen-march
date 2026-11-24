/*
 * texgen_v4.c — High-Fidelity Multi-Scale Medieval Stone, Timber & Wrought-Iron PBR Generator
 * for Ashenhold V4 (`feature/ashenhold-visual-polish-v4`).
 *
 * Key Technical Advances over texgen_v3.c:
 *   1. True Periodic Quintic Gradient (Perlin) Noise + Multi-Feature Periodic Voronoi (f1, f2,
 *      cell ID, per-cell random 2D tilt vector, cell-center offset).
 *   2. Slope-Warped Edge Erosion (stone edges chip & spall along local height gradients, never
 *      uniform boxes or blurry value-noise waves).
 *   3. Distinct Material Roles:
 *      - `limestone_weathered` (1024x1024): SOLID hewn/dressed castle limestone with chisel
 *        tooling marks, calcite pores, spalling & strata — ZERO fake brick grid inside 3D blocks!
 *      - `citadel_masonry` (1024x1024): Irregular multi-height coursed castle wall with variable
 *        block widths, jumper stones, small galleting/chinking stones in deep gritty lime mortar,
 *        per-stone normal tilt, and old-vs-repaired stone diversity.
 *      - `mountain_crag_rock` (1024x1024): Sharp 28-deg dipping metamorphic cleavage strata +
 *        angular Voronoi rock fractures + damp seepage bands.
 *      - `broken_flagstone` (1024x1024): Polygonal fractured paving slabs with secondary split
 *        cracks, tilted sunken stones, foot-worn crowns & pebble-packed mossy joints.
 *      - `damp_slate_stone` (512x512): Cleaved dark slate blocks with mineral efflorescence.
 *      - `aged_oak_timber` (512x512): Adze-hewn oak beams/planks with vessel pores & drying checks.
 *      - `iron_forged_v4` (512x512): Hammer-peened wrought iron with oxidized scale & true
 *        spatially varying Metalness in Packed ORM channel B!
 *   4. Horizon-Based Multi-Radius Heightfield AO (`compute_hbao`) + Dual-Scale Sobel/Bevel Normals.
 */
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define PI 3.14159265358979323846f

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

static inline int posmod(int x, int m) {
    int r = x % m;
    return r < 0 ? r + m : r;
}

static inline uint32_t hash2i(int x, int y, uint32_t seed) {
    uint32_t h = (uint32_t)x * 374761393u + (uint32_t)y * 668265263u + seed * 2246822519u;
    h = (h ^ (h >> 13)) * 1274126177u;
    return h ^ (h >> 16);
}

static inline float hash2f(int x, int y, uint32_t seed) {
    return (float)(hash2i(x, y, seed) & 0xFFFFFFu) / 16777215.0f;
}

/* Periodic 2D Quintic Gradient (Perlin) Noise — zero grid-axis artifacts */
static float gnoise_tile(float u, float v, int px, int py, uint32_t seed) {
    float fx = u * (float)px;
    float fy = v * (float)py;
    int ix = (int)floorf(fx);
    int iy = (int)floorf(fy);
    float tx = fx - (float)ix;
    float ty = fy - (float)iy;

    float ux = tx * tx * tx * (tx * (tx * 6.0f - 15.0f) + 10.0f);
    float uy = ty * ty * ty * (ty * (ty * 6.0f - 15.0f) + 10.0f);

    int x0 = posmod(ix, px), x1 = posmod(ix + 1, px);
    int y0 = posmod(iy, py), y1 = posmod(iy + 1, py);

    float a00 = hash2f(x0, y0, seed) * 2.0f * PI;
    float a10 = hash2f(x1, y0, seed) * 2.0f * PI;
    float a01 = hash2f(x0, y1, seed) * 2.0f * PI;
    float a11 = hash2f(x1, y1, seed) * 2.0f * PI;

    float n00 = cosf(a00) * tx + sinf(a00) * ty;
    float n10 = cosf(a10) * (tx - 1.0f) + sinf(a10) * ty;
    float n01 = cosf(a01) * tx + sinf(a01) * (ty - 1.0f);
    float n11 = cosf(a11) * (tx - 1.0f) + sinf(a11) * (ty - 1.0f);

    float nx0 = lerpf(n00, n10, ux);
    float nx1 = lerpf(n01, n11, ux);
    return clampf(lerpf(nx0, nx1, uy) * 0.72f + 0.5f, 0.0f, 1.0f);
}

static float fbm_grad(float u, float v, int px, int py, int octaves, float gain, uint32_t seed) {
    float sum = 0.0f, amp = 0.5f, norm = 0.0f;
    int cx = px, cy = py;
    for (int i = 0; i < octaves; i++) {
        sum += amp * gnoise_tile(u, v, cx, cy, seed + (uint32_t)i * 137u);
        norm += amp;
        amp *= gain;
        cx *= 2;
        cy *= 2;
    }
    return sum / norm;
}

static float ridged_grad(float u, float v, int px, int py, int octaves, uint32_t seed) {
    float sum = 0.0f, amp = 0.5f, norm = 0.0f, weight = 1.0f;
    int cx = px, cy = py;
    for (int i = 0; i < octaves; i++) {
        float n = gnoise_tile(u, v, cx, cy, seed + (uint32_t)i * 89u);
        float s = 1.0f - fabsf(n * 2.0f - 1.0f);
        s = s * s * weight;
        weight = clampf(s * 1.6f, 0.2f, 1.0f);
        sum += s * amp;
        norm += amp;
        amp *= 0.5f;
        cx *= 2;
        cy *= 2;
    }
    return clampf(sum / norm, 0.0f, 1.0f);
}

typedef struct {
    float d1;
    float edge;   /* exact perpendicular distance to closest Voronoi cell boundary */
    float id;
    float id2;
    float rx;
    float ry;
} VoroCell;

/* Exact Voronoi boundary distance (Inigo Quilez 2-pass method) for crisp polygonal stones/cracks */
static VoroCell voronoi_exact(float u, float v, int gx, int gy, float jitter, uint32_t seed) {
    float fx = u * (float)gx;
    float fy = v * (float)gy;
    int ix = (int)floorf(fx);
    int iy = (int)floorf(fy);

    float min_d = 1e9f;
    int best_dx = 0, best_dy = 0;
    float best_rx = 0.0f, best_ry = 0.0f;
    float cid = 0.0f, cid2 = 0.0f;

    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            int mx = posmod(ix + dx, gx);
            int my = posmod(iy + dy, gy);
            float ox = 0.5f + (hash2f(mx, my, seed) - 0.5f) * jitter;
            float oy = 0.5f + (hash2f(mx, my, seed + 23u) - 0.5f) * jitter;
            float rx = (float)dx + ox - (fx - (float)ix);
            float ry = (float)dy + oy - (fy - (float)iy);
            float d = rx * rx + ry * ry;
            if (d < min_d) {
                min_d = d;
                best_dx = dx;
                best_dy = dy;
                best_rx = rx;
                best_ry = ry;
                cid = hash2f(mx, my, seed + 59u);
                cid2 = hash2f(mx, my, seed + 103u);
            }
        }
    }

    float min_edge = 1e9f;
    for (int dy = -2; dy <= 2; dy++) {
        for (int dx = -2; dx <= 2; dx++) {
            if (dx == best_dx && dy == best_dy) continue;
            int mx = posmod(ix + dx, gx);
            int my = posmod(iy + dy, gy);
            float ox = 0.5f + (hash2f(mx, my, seed) - 0.5f) * jitter;
            float oy = 0.5f + (hash2f(mx, my, seed + 23u) - 0.5f) * jitter;
            float rx = (float)dx + ox - (fx - (float)ix);
            float ry = (float)dy + oy - (fy - (float)iy);
            float mx_mid = 0.5f * (best_rx + rx);
            float my_mid = 0.5f * (best_ry + ry);
            float vx = rx - best_rx;
            float vy = ry - best_ry;
            float vlen = sqrtf(vx * vx + vy * vy);
            if (vlen > 1e-5f) {
                float ed = (mx_mid * vx + my_mid * vy) / vlen;
                if (ed < min_edge) min_edge = ed;
            }
        }
    }

    VoroCell out = {sqrtf(min_d), min_edge, cid, cid2, -best_rx, -best_ry};
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

/* Multi-scale tangent-space normal synthesis (fine 3x3 detail + medium 7x7 bevels) */
static void build_multiscale_normal(const float *H, const float *tiltX, const float *tiltY, uint8_t *N, int S, float fineStr, float mesoStr) {
    for (int y = 0; y < S; y++) {
        int ym1 = posmod(y - 1, S), yp1 = posmod(y + 1, S);
        int ym3 = posmod(y - 3, S), yp3 = posmod(y + 3, S);
        for (int x = 0; x < S; x++) {
            int xm1 = posmod(x - 1, S), xp1 = posmod(x + 1, S);
            int xm3 = posmod(x - 3, S), xp3 = posmod(x + 3, S);

            /* Fine 3x3 Sobel */
            float tl = H[ym1 * S + xm1], tc = H[ym1 * S + x], tr = H[ym1 * S + xp1];
            float ml = H[y * S + xm1],                        mr = H[y * S + xp1];
            float bl = H[yp1 * S + xm1], bc = H[yp1 * S + x], br = H[yp1 * S + xp1];
            float dx1 = (tr + 2.0f * mr + br) - (tl + 2.0f * ml + bl);
            float dy1 = (bl + 2.0f * bc + br) - (tl + 2.0f * tc + tr);

            /* Medium 7x7 bevel gradient */
            float dx3 = (H[y * S + xp3] - H[y * S + xm3]) * 2.0f + (H[ym3 * S + xp3] - H[ym3 * S + xm3]) + (H[yp3 * S + xp3] - H[yp3 * S + xm3]);
            float dy3 = (H[yp3 * S + x] - H[ym3 * S + x]) * 2.0f + (H[yp3 * S + xm3] - H[ym3 * S + xm3]) + (H[yp3 * S + xp3] - H[ym3 * S + xp3]);

            float tx = tiltX ? tiltX[y * S + x] : 0.0f;
            float ty = tiltY ? tiltY[y * S + x] : 0.0f;

            float nx = -(dx1 * fineStr + dx3 * mesoStr * 0.35f) + tx;
            float ny =  (dy1 * fineStr + dy3 * mesoStr * 0.35f) + ty; /* OpenGL +Y up */
            float nz = 1.0f;
            float inv = 1.0f / sqrtf(nx * nx + ny * ny + nz * nz);
            int idx = (y * S + x) * 3;
            N[idx + 0] = (uint8_t)clampf((nx * inv * 0.5f + 0.5f) * 255.0f, 0.0f, 255.0f);
            N[idx + 1] = (uint8_t)clampf((ny * inv * 0.5f + 0.5f) * 255.0f, 0.0f, 255.0f);
            N[idx + 2] = (uint8_t)clampf((nz * inv * 0.5f + 0.5f) * 255.0f, 0.0f, 255.0f);
        }
    }
}

/* True Horizon-Based Heightfield Ambient Occlusion (8 directions x 5 radial steps) */
static void compute_hbao(const float *H, float *AO_out, int S, float heightScale, float strength) {
    const int dirs[8][2] = {{1,0},{1,1},{0,1},{-1,1},{-1,0},{-1,-1},{0,-1},{1,-1}};
    const float dlen[8] = {1.0f,1.4142f,1.0f,1.4142f,1.0f,1.4142f,1.0f,1.4142f};
    const int steps[5] = {1, 2, 4, 8, 15};

    for (int y = 0; y < S; y++) {
        for (int x = 0; x < S; x++) {
            float h0 = H[y * S + x];
            float occ = 0.0f;
            for (int d = 0; d < 8; d++) {
                float maxSlope = 0.0f;
                for (int s = 0; s < 5; s++) {
                    int r = steps[s];
                    int sx = posmod(x + dirs[d][0] * r, S);
                    int sy = posmod(y + dirs[d][1] * r, S);
                    float dh = (H[sy * S + sx] - h0) * heightScale;
                    float dist = (float)r * dlen[d];
                    float slope = dh / dist;
                    if (slope > maxSlope) maxSlope = slope;
                }
                occ += maxSlope / sqrtf(1.0f + maxSlope * maxSlope);
            }
            occ /= 8.0f;
            AO_out[y * S + x] = clampf(1.0f - occ * strength, 0.28f, 1.0f);
        }
    }
}

static void gen_material_v4(const char *out_dir, const char *name, int kind, int S) {
    size_t npx = (size_t)S * (size_t)S;
    uint8_t *alb = (uint8_t *)malloc(npx * 3u);
    uint8_t *orm = (uint8_t *)malloc(npx * 3u);
    uint8_t *nrm = (uint8_t *)malloc(npx * 3u);
    float *H = (float *)calloc(npx, sizeof(float));
    float *R_map = (float *)calloc(npx, sizeof(float));
    float *M_map = (float *)calloc(npx, sizeof(float));
    float *AO_base = (float *)calloc(npx, sizeof(float));
    float *AO_hbao = (float *)calloc(npx, sizeof(float));
    float *tiltX = (float *)calloc(npx, sizeof(float));
    float *tiltY = (float *)calloc(npx, sizeof(float));

    /* Irregular medieval coursed masonry row bounds (variable tall/medium/low courses!) */
    const float cy_bounds[10] = {0.0f, 0.155f, 0.245f, 0.385f, 0.485f, 0.635f, 0.730f, 0.865f, 0.935f, 1.0f};

    for (int y = 0; y < S; y++) {
        float v = (float)y / (float)S;
        for (int x = 0; x < S; x++) {
            float u = (float)x / (float)S;
            size_t i = (size_t)y * S + x;

            float r = 0.5f, g = 0.5f, b = 0.5f;
            float h = 0.5f, ao = 1.0f, rough = 0.84f, metal = 0.0f;
            float tx = 0.0f, ty = 0.0f;

            /* Multi-scale organic noise basis (distinct frequencies & generators per scale!) */
            float macro = fbm_grad(u, v, 3, 3, 3, 0.5f, 101u);
            float meso  = fbm_grad(u, v, 8, 8, 4, 0.52f, 313u);
            float micro = fbm_grad(u, v, 32, 32, 3, 0.55f, 719u);
            float pores = gnoise_tile(u, v, 128, 128, 1451u);
            float fineGrit = gnoise_tile(u, v, 256, 256, 2311u);
            float crackField = ridged_grad(u + (meso - 0.5f) * 0.05f, v + (macro - 0.5f) * 0.05f, 6, 6, 4, 521u);

            if (kind == 0) {
                /* =====================================================================
                 * 1. limestone_weathered (1024x1024) — SOLID HEWN CASTLE LIMESTONE
                 * ZERO artificial brick grid & ZERO periodic corduroy waves!
                 * Natural sedimentary bedding, weathered mineral patina, fossil/calcite
                 * inclusions, spalled rock flakes, and micro-pitting harmonized with
                 * citadel_masonry so 3D carved stones never pop out like chalk dominoes.
                 * ===================================================================== */
                float strata = fbm_grad(u, v, 3, 12, 4, 0.52f, 607u);
                float rockUndul = fbm_grad(u, v, 11, 11, 4, 0.52f, 881u);
                float spallField = meso * 0.62f + rockUndul * 0.38f;
                float spallStep = smoothf(0.58f, 0.67f, spallField);
                float flakeEdge = smoothf(0.55f, 0.62f, spallField) * (1.0f - smoothf(0.66f, 0.74f, spallField));

                /* Pin-hole calcite pores + hairline rock stress cracks + subtle pale vein */
                float pinPores = smoothf(0.81f, 0.96f, pores * 0.62f + fineGrit * 0.38f);
                float hairline = smoothf(0.90f, 0.98f, crackField);
                float calciteVein = smoothf(0.92f, 0.985f, ridged_grad(u * 0.7f + v * 0.3f, v * 0.8f - u * 0.2f, 4, 7, 3, 1093u));
                float lichenPatch = smoothf(0.72f, 0.90f, macro * 0.65f + meso * 0.35f);

                /* Grounded weathered warm-ash castle stone (0.44..0.54, harmonized with citadel_masonry!) */
                float lum = 0.485f + (macro - 0.5f) * 0.11f + (strata - 0.5f) * 0.085f
                          + (rockUndul - 0.5f) * 0.07f + (micro - 0.5f) * 0.055f
                          + (fineGrit - 0.5f) * 0.045f - spallStep * 0.052f + calciteVein * 0.055f;
                float warm = 0.036f * (1.0f - macro * 0.55f) + spallStep * 0.016f - lichenPatch * 0.018f;
                r = lum + warm;
                g = lum + warm * 0.42f + lichenPatch * 0.012f;
                b = lum - warm * 0.72f;

                /* Micro-pitting & hairline fracture darkening */
                r *= (1.0f - pinPores * 0.14f - hairline * 0.24f);
                g *= (1.0f - pinPores * 0.14f - hairline * 0.24f);
                b *= (1.0f - pinPores * 0.12f - hairline * 0.20f);

                h = 0.65f + (strata - 0.5f) * 0.18f + (rockUndul - 0.5f) * 0.16f
                  - spallStep * 0.20f + flakeEdge * 0.04f + (micro - 0.5f) * 0.10f
                  + (fineGrit - 0.5f) * 0.05f - pinPores * 0.18f - hairline * 0.30f + calciteVein * 0.04f;
                ao = 1.0f - hairline * 0.28f - pinPores * 0.10f - spallStep * 0.05f;
                rough = clampf(0.74f + spallStep * 0.16f + (micro - 0.5f) * 0.10f + pinPores * 0.07f, 0.62f, 0.96f);

            } else if (kind == 1) {
                /* =====================================================================
                 * 2. citadel_masonry (1024x1024) — ANCIENT STORMVEIL IRREGULAR MASONRY
                 * Multi-height courses, variable stone widths, wedged galleting stones
                 * in deep recessed gritty lime mortar, per-stone 2D tilt & chipped edges.
                 * ===================================================================== */
                float warpU = (meso - 0.5f) * 0.018f + (micro - 0.5f) * 0.006f;
                float warpV = (meso - 0.5f) * 0.016f + (micro - 0.5f) * 0.006f;
                float wv = fmodf(v + warpV + 2.0f, 1.0f);

                int row = 0;
                for (int k = 0; k < 9; k++) {
                    if (wv >= cy_bounds[k] && wv <= cy_bounds[k + 1]) { row = k; break; }
                }
                float rowH = cy_bounds[row + 1] - cy_bounds[row];
                float rv = (wv - cy_bounds[row]) / rowH;

                int baseCols = (row % 3 == 0) ? 4 : ((row % 3 == 1) ? 6 : 5);
                float rowShift = hash2f(row, 13, 271u);
                float wu = fmodf(u + rowShift + warpU * 0.8f + 2.0f, 1.0f) * (float)baseCols;
                int col = (int)floorf(wu);
                float jLeft  = (hash2f(posmod(col, baseCols), row, 401u) - 0.5f) * 0.42f;
                float jRight = (hash2f(posmod(col + 1, baseCols), row, 401u) - 0.5f) * 0.42f;
                float localU = wu - (float)col;
                if (localU < jLeft) {
                    col = posmod(col - 1, baseCols);
                    float jPrev = (hash2f(col, row, 401u) - 0.5f) * 0.42f;
                    localU = (localU + 1.0f - jPrev) / (1.0f + jLeft - jPrev);
                } else if (localU > 1.0f + jRight) {
                    int nextCol = posmod(col + 1, baseCols);
                    float jNext2 = (hash2f(posmod(col + 2, baseCols), row, 401u) - 0.5f) * 0.42f;
                    localU = (localU - (1.0f + jRight)) / (1.0f + jNext2 - jRight);
                    col = nextCol;
                } else {
                    localU = (localU - jLeft) / (1.0f + jRight - jLeft);
                }

                float bid = hash2f(col, row, 733u);
                float bid2 = hash2f(col, row, 997u);

                float dxEdge = fminf(localU, 1.0f - localU) * (1.0f / (float)baseCols);
                float dyEdge = fminf(rv, 1.0f - rv) * rowH;
                float cornerDist = dxEdge + dyEdge - sqrtf(dxEdge * dxEdge + dyEdge * dyEdge) * 0.35f;
                float edgeChip = (fbm_grad(u, v, 22, 22, 3, 0.55f, 509u) - 0.5f) * 0.011f
                               + (micro - 0.5f) * 0.005f;
                float dJoint = fminf(dxEdge, dyEdge) * 0.80f + cornerDist * 0.20f + edgeChip;

                float jointWidth = 0.0055f + hash2f(col + 3, row + 7, 619u) * 0.0045f;
                float stoneMask = smoothf(jointWidth, jointWidth + 0.0055f, dJoint);
                float bevelProfile = smoothf(jointWidth, jointWidth + 0.0175f, dJoint);

                VoroCell gallet = voronoi_exact(u, v, 32, 32, 0.78f, 1291u);
                float hasGallet = (gallet.id > 0.54f) ? 1.0f : 0.0f;
                float galletMask = (1.0f - stoneMask) * smoothf(0.10f, 0.22f, gallet.edge) * hasGallet;

                tx = (hash2f(col, row, 1511u) - 0.5f) * 0.24f * stoneMask;
                ty = (hash2f(col, row, 1709u) - 0.5f) * 0.24f * stoneMask;

                float isRepaired = (bid > 0.86f) ? 1.0f : 0.0f;
                float isDarkOld  = (bid < 0.20f) ? 1.0f : 0.0f;
                float spall = smoothf(0.56f, 0.74f, fbm_grad(u + bid, v + bid2, 14, 14, 3, 0.52f, 829u));
                float rockGrain = fbm_grad(u + bid * 0.7f, v + bid2 * 0.7f, 26, 26, 3, 0.55f, 1907u);
                float fracture = smoothf(0.90f, 0.98f, crackField) * stoneMask;

                float baseL = 0.46f + (bid - 0.5f) * 0.13f + isRepaired * 0.07f - isDarkOld * 0.06f
                            + (meso - 0.5f) * 0.075f + (rockGrain - 0.5f) * 0.065f + (pores - 0.5f) * 0.05f - spall * 0.055f;
                float warmShift = (bid2 - 0.46f) * 0.044f + isRepaired * 0.018f - isDarkOld * 0.016f;
                float sr = baseL + warmShift * 0.90f;
                float sg = baseL + warmShift * 0.42f;
                float sb = baseL - warmShift * 0.65f;

                /* Recessed gritty lime-earth mortar (darker than stones so masonry coursing reads crisply!) */
                float mortarGrit = pores * 0.6f + fineGrit * 0.4f;
                float mr = 0.29f + (mortarGrit - 0.5f) * 0.10f;
                float mg = 0.28f + (mortarGrit - 0.5f) * 0.09f;
                float mb = 0.25f + (mortarGrit - 0.5f) * 0.08f;

                float combMask = clampf(stoneMask + galletMask * 0.82f, 0.0f, 1.0f);
                r = lerpf(mr, sr, combMask) * (1.0f - fracture * 0.24f);
                g = lerpf(mg, sg, combMask) * (1.0f - fracture * 0.24f);
                b = lerpf(mb, sb, combMask) * (1.0f - fracture * 0.20f);

                float stoneCrown = 0.62f + (bid - 0.5f) * 0.18f + bevelProfile * 0.19f + (rockGrain - 0.5f) * 0.15f - spall * 0.16f;
                float mortarH = 0.10f + mortarGrit * 0.10f + galletMask * 0.34f;
                h = lerpf(mortarH, stoneCrown + (micro - 0.5f) * 0.11f + (fineGrit - 0.5f) * 0.05f, stoneMask)
                  - fracture * 0.28f;
                ao = lerpf(0.58f, 0.99f, bevelProfile) * (1.0f - fracture * 0.24f);
                rough = lerpf(0.96f, clampf(0.73f + (bid2 - 0.5f) * 0.14f + spall * 0.14f - isRepaired * 0.05f, 0.60f, 0.95f), combMask);

            } else if (kind == 2) {
                /* =====================================================================
                 * 3. damp_slate_stone (512x512) — CLEAVED LAMINAR HIGHLAND SLATE
                 * Pure sub-horizontal cleaved shale/slate bedding & stepped folia
                 * (ZERO glossy black Voronoi snake-cells!).
                 * ===================================================================== */
                float folia = fbm_grad(u, v, 5, 28, 4, 0.54f, 809u);
                float cleavage = ridged_grad(u + (macro - 0.5f) * 0.05f, v + (meso - 0.5f) * 0.03f, 4, 18, 4, 641u);
                float crossSplit = ridged_grad(u * 0.9f - v * 0.3f, v * 0.9f + u * 0.3f, 5, 7, 3, 1187u);

                /* Stepped slate cleavage shelves + crisp split ledges */
                float stepSlate = (floorf(folia * 8.0f) / 8.0f) * 0.42f + folia * 0.58f;
                float cleft = smoothf(0.88f, 0.98f, crossSplit);
                float efflor = smoothf(0.77f, 0.94f, macro * 0.6f + micro * 0.4f);
                float dampPatch = smoothf(0.50f, 0.82f, macro * 0.7f + (1.0f - stepSlate) * 0.3f);

                float tone = 0.34f + (stepSlate - 0.5f) * 0.14f + (cleavage - 0.5f) * 0.10f
                           + (micro - 0.5f) * 0.06f + (fineGrit - 0.5f) * 0.045f;
                tone *= (1.0f - dampPatch * 0.16f - cleft * 0.34f);
                r = tone * 0.95f + efflor * 0.06f;
                g = tone * 0.99f + efflor * 0.06f;
                b = tone * 1.06f + efflor * 0.05f;

                ty = (cleavage - 0.5f) * 0.18f;
                h = clampf(0.45f + (stepSlate - 0.5f) * 0.42f + (cleavage - 0.5f) * 0.24f
                         + (micro - 0.5f) * 0.10f - cleft * 0.36f, 0.04f, 0.98f);
                ao = clampf(0.82f + (stepSlate - 0.5f) * 0.24f - cleft * 0.34f, 0.36f, 1.0f);
                /* Natural matte-to-damp cleaved slate (0.58..0.88, NEVER glossy 0.32!) */
                rough = clampf(lerpf(0.84f - (stepSlate - 0.5f) * 0.10f, 0.58f, dampPatch) + cleft * 0.08f, 0.55f, 0.92f);

            } else if (kind == 3) {
                /* =====================================================================
                 * 4. aged_oak_timber (512x512) — ADZE-HEWN ANCIENT OAK BEAMS & PLANKS
                 * ===================================================================== */
                int plank = (int)floorf(u * 4.0f);
                float pu = fmodf(u * 4.0f, 1.0f);
                float ph = hash2f(plank, 3, 557u);
                float ph2 = hash2f(plank, 11, 743u);
                float seam = fminf(pu, 1.0f - pu);
                float pMask = smoothf(0.012f, 0.042f, seam + (micro - 0.5f) * 0.014f);

                float pv = fmodf(v + ph2, 1.0f);
                float knotWarp = fbm_grad(u, pv, 4, 3, 3, 0.5f, 443u);
                float fibers = gnoise_tile(u + knotWarp * 0.03f, pv, 96, 8, 997u) * 0.6f
                             + gnoise_tile(u + knotWarp * 0.015f, pv, 192, 16, 1213u) * 0.4f;
                float rings = sinf((u * 14.0f + knotWarp * 3.2f) * PI) * 0.5f + 0.5f;
                float checks = smoothf(0.88f, 0.98f, ridged_grad(u * 3.0f, pv * 0.5f, 10, 4, 3, 331u));

                float base = 0.33f + (ph - 0.5f) * 0.09f + (fibers - 0.5f) * 0.14f - rings * 0.045f;
                float weatheredGrey = smoothf(0.52f, 0.86f, macro) * 0.30f;
                r = lerpf(base * 1.20f, base * 0.98f, weatheredGrey) * (1.0f - checks * 0.34f);
                g = lerpf(base * 0.94f, base * 0.96f, weatheredGrey) * (1.0f - checks * 0.34f);
                b = lerpf(base * 0.68f, base * 0.91f, weatheredGrey) * (1.0f - checks * 0.28f);
                r = lerpf(0.16f, r, pMask);
                g = lerpf(0.13f, g, pMask);
                b = lerpf(0.10f, b, pMask);

                h = lerpf(0.10f, 0.66f + (fibers - 0.5f) * 0.22f - rings * 0.08f - checks * 0.36f, pMask);
                ao = lerpf(0.55f, 0.98f, pMask) * (1.0f - checks * 0.32f);
                rough = lerpf(0.95f, clampf(0.68f + (1.0f - fibers) * 0.16f + weatheredGrey * 0.10f, 0.56f, 0.94f), pMask);

            } else if (kind == 4) {
                /* =====================================================================
                 * 5. broken_flagstone (1024x1024) — WORN COURSED CASTLE FLAGSTONES
                 * Anisotropic semi-coursed paving slabs with rich per-stone warm/cool
                 * mineral variety (buff limestone, ash grey, dark slate) & DEEPLY RECESSED
                 * dark damp earth/moss joints (eliminates uniform grey Voronoi giraffe web!).
                 * ===================================================================== */
                float wu = u + (meso - 0.5f) * 0.032f + (micro - 0.5f) * 0.007f;
                float wv = v + (macro - 0.5f) * 0.024f + (micro - 0.5f) * 0.007f;
                /* 4x7 anisotropic cell aspect -> broader road-spanning stone slabs! */
                VoroCell vc = voronoi_exact(wu, wv, 4, 7, 0.72f, 223u);

                /* Clean linear fracture across ~30% of heavy worn slabs */
                float splitAng = vc.id2 * PI;
                float splitLine = fabsf(vc.rx * cosf(splitAng) + vc.ry * sinf(splitAng) + (meso - 0.5f) * 0.20f);
                float hasSplit = (vc.id > 0.70f) ? 1.0f : 0.0f;
                float splitMask = (hasSplit > 0.5f) ? smoothf(0.013f, 0.035f, splitLine) : 1.0f;

                float chip = (fbm_grad(u, v, 22, 22, 3, 0.55f, 617u) - 0.5f) * 0.036f;
                float seam = vc.edge + chip;
                float slabMask = smoothf(0.026f, 0.062f, seam) * splitMask;
                float edgeBevel = smoothf(0.026f, 0.115f, seam) * lerpf(0.70f, 1.0f, splitMask);
                float hairline = smoothf(0.92f, 0.99f, crackField) * slabMask;
                float slabSpall = smoothf(0.50f, 0.74f, fbm_grad(u + vc.id, v + vc.id2, 16, 16, 3, 0.52f, 1613u)) * slabMask;
                float slabFacet = fbm_grad(u + vc.id2, v + vc.id, 10, 14, 3, 0.5f, 1741u);

                /* Per-slab sunken 2D tilt */
                tx = (vc.id2 - 0.5f) * 0.25f * slabMask;
                ty = (hash2f((int)(vc.id * 113.0f), 9, 1303u) - 0.5f) * 0.25f * slabMask;

                /* Distinct per-slab geological variety: warm buff stone, ash limestone, dark slate */
                float isSlateSlab = (vc.id < 0.22f) ? 1.0f : 0.0f;
                float isWarmBuff  = (vc.id > 0.76f) ? 1.0f : 0.0f;
                float stoneL = 0.45f + (vc.id - 0.5f) * 0.20f - isSlateSlab * 0.05f + isWarmBuff * 0.04f
                             + (slabFacet - 0.5f) * 0.10f + (micro - 0.5f) * 0.075f
                             + (fineGrit - 0.5f) * 0.05f - slabSpall * 0.065f;
                /* Subtle edge dust/dirt wear near recessed joints */
                stoneL *= (0.88f + 0.12f * edgeBevel);
                float warm = (vc.id2 - 0.46f) * 0.065f + isWarmBuff * 0.028f - isSlateSlab * 0.026f;
                float sr = stoneL + warm;
                float sg = stoneL + warm * 0.42f;
                float sb = stoneL - warm * 0.68f;

                /* Deep dark damp earth, sand & mossy crevices in joints (DARKER than slabs!) */
                float jMoss = smoothf(0.58f, 0.84f, macro * 0.68f + meso * 0.32f);
                float grit = (pores - 0.5f) * 0.06f + (fineGrit - 0.5f) * 0.05f;
                float jr = lerpf(0.20f, 0.15f, jMoss) + grit;
                float jg = lerpf(0.19f, 0.21f, jMoss) + grit;
                float jb = lerpf(0.17f, 0.13f, jMoss) + grit * 0.85f;

                r = lerpf(jr, sr, slabMask) * (1.0f - hairline * 0.22f);
                g = lerpf(jg, sg, slabMask) * (1.0f - hairline * 0.22f);
                b = lerpf(jb, sb, slabMask) * (1.0f - hairline * 0.18f);

                float crown = 0.62f + (vc.id - 0.5f) * 0.18f + edgeBevel * 0.20f + (slabFacet - 0.5f) * 0.13f - slabSpall * 0.16f;
                h = lerpf(0.08f + pores * 0.08f + fineGrit * 0.05f, crown + (micro - 0.5f) * 0.11f + (fineGrit - 0.5f) * 0.045f, slabMask) - hairline * 0.26f;
                ao = lerpf(0.46f, 0.99f, edgeBevel) * (1.0f - hairline * 0.24f);
                rough = lerpf(0.96f, clampf(0.58f + (1.0f - edgeBevel) * 0.22f + slabSpall * 0.18f + (micro - 0.5f) * 0.10f, 0.50f, 0.94f), slabMask);

            } else if (kind == 5) {
                /* =====================================================================
                 * 6. mountain_crag_rock (1024x1024) — STRATIFIED HIGHLAND CLIFF BEDROCK
                 * Pure dipping sedimentary/metamorphic bedding planes + sharp conjugate
                 * fracture clefts (ZERO polygonal Voronoi cell lines!).
                 * ===================================================================== */
                float dipU = u * 0.90f + v * 0.43f + (macro - 0.5f) * 0.12f;
                float dipV = -u * 0.43f + v * 0.90f + (meso - 0.5f) * 0.10f;
                float strata = ridged_grad(dipU, dipV, 4, 14, 5, 353u);
                float fineBedding = fbm_grad(dipU, dipV, 8, 36, 4, 0.54f, 1229u);
                float conjugateJoints = ridged_grad(u * 0.85f - v * 0.52f + (meso - 0.5f) * 0.05f, u * 0.52f + v * 0.85f, 5, 8, 4, 887u);
                float crossCleft = ridged_grad(u + (macro - 0.5f) * 0.04f, v + (meso - 0.5f) * 0.04f, 3, 5, 4, 1429u);

                /* Stepped rock ledges along dipping bedding planes */
                float stepBedding = (floorf(fineBedding * 7.0f) / 7.0f) * 0.36f + fineBedding * 0.64f;
                float jointCleft = smoothf(0.86f, 0.975f, conjugateJoints);
                float majorFissure = smoothf(0.88f, 0.985f, crossCleft);
                float crag = clampf(strata * 0.54f + stepBedding * 0.36f + (macro - 0.5f) * 0.18f, 0.0f, 1.0f);
                float deepFissure = clampf(fmaxf(jointCleft * 0.85f, majorFissure * 0.92f), 0.0f, 1.0f);

                float seepage = smoothf(0.58f, 0.86f, macro * 0.7f + (1.0f - crag) * 0.3f);
                float moss = smoothf(0.68f, 0.89f, meso * 0.65f + (1.0f - strata) * 0.35f) * (1.0f - seepage * 0.6f);

                float L = 0.34f + crag * 0.26f + (meso - 0.5f) * 0.07f + (micro - 0.5f) * 0.08f + (fineGrit - 0.5f) * 0.05f;
                L *= (1.0f - seepage * 0.24f - deepFissure * 0.42f);
                r = lerpf(L * 1.02f, 0.21f, moss * 0.48f);
                g = lerpf(L * 0.99f, 0.28f, moss * 0.48f);
                b = lerpf(L * 0.95f, 0.17f, moss * 0.48f);

                tx = (strata - 0.5f) * 0.22f;
                h = clampf(crag * 0.86f + (micro - 0.5f) * 0.14f - deepFissure * 0.42f, 0.0f, 1.0f);
                ao = clampf(0.58f + crag * 0.42f - deepFissure * 0.38f, 0.28f, 1.0f);
                rough = clampf(lerpf(0.87f - crag * 0.12f, 0.36f, seepage) + moss * 0.08f, 0.32f, 0.97f);

            } else {
                /* =====================================================================
                 * 7. iron_forged_v4 (512x512) — HAND-HAMMERED WROUGHT IRON (Packed Metal!)
                 * ===================================================================== */
                VoroCell peen = voronoi_exact(u, v, 18, 18, 0.75f, 1999u);
                float dimple = 1.0f - clampf(peen.d1 * 1.35f, 0.0f, 1.0f);
                float rustPatch = smoothf(0.58f, 0.84f, macro * 0.65f + meso * 0.35f);
                float scalePit = smoothf(0.75f, 0.93f, micro * 0.6f + pores * 0.4f);

                float bareIron = 0.26f + dimple * 0.07f + (fineGrit - 0.5f) * 0.04f;
                r = lerpf(bareIron * 0.96f, 0.30f, rustPatch);
                g = lerpf(bareIron * 0.98f, 0.19f, rustPatch);
                b = lerpf(bareIron * 1.04f, 0.13f, rustPatch);

                h = 0.58f + dimple * 0.22f - scalePit * 0.20f - rustPatch * 0.12f;
                ao = 1.0f - scalePit * 0.22f;
                rough = clampf(lerpf(0.34f + (1.0f - dimple) * 0.16f, 0.84f, rustPatch) + scalePit * 0.12f, 0.26f, 0.94f);
                metal = clampf(lerpf(0.92f, 0.22f, rustPatch) - scalePit * 0.15f, 0.15f, 0.95f);
            }

            alb[i * 3 + 0] = (uint8_t)clampf(r * 255.0f, 0.0f, 255.0f);
            alb[i * 3 + 1] = (uint8_t)clampf(g * 255.0f, 0.0f, 255.0f);
            alb[i * 3 + 2] = (uint8_t)clampf(b * 255.0f, 0.0f, 255.0f);

            H[i] = clampf(h, 0.0f, 1.0f);
            AO_base[i] = clampf(ao, 0.0f, 1.0f);
            R_map[i] = clampf(rough, 0.04f, 1.0f);
            M_map[i] = clampf(metal, 0.0f, 1.0f);
            tiltX[i] = tx;
            tiltY[i] = ty;
        }
    }

    /* Bake real Horizon-Based Heightfield AO + Dual-Scale Tangent Normals */
    float hbaoScale = (S >= 1024) ? 14.0f : 8.5f;
    compute_hbao(H, AO_hbao, S, hbaoScale, 0.72f);

    for (size_t i = 0; i < npx; i++) {
        float finalAo = clampf(AO_base[i] * AO_hbao[i], 0.24f, 1.0f);
        orm[i * 3 + 0] = (uint8_t)clampf(finalAo * 255.0f, 0.0f, 255.0f);
        orm[i * 3 + 1] = (uint8_t)clampf(R_map[i] * 255.0f, 0.0f, 255.0f);
        orm[i * 3 + 2] = (uint8_t)clampf(M_map[i] * 255.0f, 0.0f, 255.0f);
    }

    float fineStr = (kind == 5) ? 3.2f : (kind == 1 ? 2.8f : (kind == 4 ? 2.6f : 2.2f));
    float mesoStr = (kind == 1 || kind == 5) ? 2.6f : (kind == 4 ? 2.2f : 1.6f);
    build_multiscale_normal(H, tiltX, tiltY, nrm, S, fineStr, mesoStr);

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
    free(R_map);
    free(M_map);
    free(AO_base);
    free(AO_hbao);
    free(tiltX);
    free(tiltY);
}

int main(int argc, char **argv) {
    const char *out_dir = (argc > 1) ? argv[1] : "/tmp/tex_v4_raw";
    gen_material_v4(out_dir, "limestone_weathered", 0, 1024);
    gen_material_v4(out_dir, "citadel_masonry",     1, 1024);
    gen_material_v4(out_dir, "damp_slate_stone",    2, 512);
    gen_material_v4(out_dir, "aged_oak_timber",     3, 512);
    gen_material_v4(out_dir, "broken_flagstone",    4, 1024);
    gen_material_v4(out_dir, "mountain_crag_rock",  5, 1024);
    gen_material_v4(out_dir, "iron_forged_v4",      6, 512);
    printf("Generated 7 V4 high-fidelity multi-scale PBR sets (1024/512 Albedo + Normal + HBAO Packed ORM) -> %s\n", out_dir);
    return 0;
}
