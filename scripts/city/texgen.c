#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static inline float clamp01(float x) { return x < 0.0f ? 0.0f : (x > 1.0f ? 1.0f : x); }
static inline float lerpf(float a, float b, float t) { return a + (b - a) * t; }
static inline float smoothstep(float e0, float e1, float x) {
    float t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3.0f - 2.0f * t);
}

static inline uint32_t hash2u(int ix, int iy, uint32_t seed) {
    uint32_t h = (uint32_t)ix * 374761393u + (uint32_t)iy * 668265263u + seed * 1442695041u;
    h = (h ^ (h >> 13)) * 1274126177u;
    return h ^ (h >> 16);
}

static inline float hash2f(int ix, int iy, uint32_t seed) {
    return (float)(hash2u(ix, iy, seed) & 0x00FFFFFFu) / 16777216.0f;
}

static float tile_noise(float u, float v, int period, uint32_t seed) {
    float x = u * (float)period;
    float y = v * (float)period;
    int ix0 = ((int)floorf(x) % period + period) % period;
    int iy0 = ((int)floorf(y) % period + period) % period;
    int ix1 = (ix0 + 1) % period;
    int iy1 = (iy0 + 1) % period;
    float fx = x - floorf(x);
    float fy = y - floorf(y);
    float ux = fx * fx * (3.0f - 2.0f * fx);
    float uy = fy * fy * (3.0f - 2.0f * fy);
    float a = hash2f(ix0, iy0, seed);
    float b = hash2f(ix1, iy0, seed);
    float c = hash2f(ix0, iy1, seed);
    float d = hash2f(ix1, iy1, seed);
    return lerpf(lerpf(a, b, ux), lerpf(c, d, ux), uy);
}

static float tile_fbm(float u, float v, int base_period, uint32_t seed, int octaves) {
    float sum = 0.0f, amp = 0.5f, norm = 0.0f;
    int p = base_period;
    for (int i = 0; i < octaves; i++) {
        sum += amp * tile_noise(u, v, p, seed + (uint32_t)i * 131u);
        norm += amp;
        p *= 2;
        amp *= 0.5f;
    }
    return sum / norm;
}

// Tileable cellular Voronoi returning F1, edge distance (F2 - F1), and cell hash
static void tile_voronoi(float u, float v, int cells_x, int cells_y, uint32_t seed,
                         float jitter, float *out_f1, float *out_edge, float *out_id) {
    float gx = u * (float)cells_x;
    float gy = v * (float)cells_y;
    int cx = (int)floorf(gx);
    int cy = (int)floorf(gy);

    float d1 = 1e9f, d2 = 1e9f;
    float best_id = 0.0f;

    for (int oy = -1; oy <= 1; oy++) {
        for (int ox = -1; ox <= 1; ox++) {
            int nx = cx + ox;
            int ny = cy + oy;
            int wx = (nx % cells_x + cells_x) % cells_x;
            int wy = (ny % cells_y + cells_y) % cells_y;
            float jx = (hash2f(wx, wy, seed + 17u) - 0.5f) * jitter + 0.5f;
            float jy = (hash2f(wx, wy, seed + 53u) - 0.5f) * jitter + 0.5f;
            float px = (float)nx + jx;
            float py = (float)ny + jy;
            float dx = px - gx;
            float dy = py - gy;
            float dist = sqrtf(dx * dx + dy * dy);
            if (dist < d1) {
                d2 = d1;
                d1 = dist;
                best_id = hash2f(wx, wy, seed + 97u);
            } else if (dist < d2) {
                d2 = dist;
            }
        }
    }
    *out_f1 = d1;
    *out_edge = d2 - d1;
    *out_id = best_id;
}

static void save_raw(const char *path, int size, const uint8_t *rgba) {
    FILE *f = fopen(path, "wb");
    if (!f) {
        fprintf(stderr, "Failed to open %s\n", path);
        exit(1);
    }
    fwrite(rgba, 1, (size_t)size * (size_t)size * 4u, f);
    fclose(f);
}

static void emit_normal_from_height(const char *path, int size, const float *h, float strength) {
    uint8_t *out = (uint8_t *)malloc((size_t)size * (size_t)size * 4u);
    for (int y = 0; y < size; y++) {
        int ym = (y - 1 + size) % size;
        int yp = (y + 1) % size;
        for (int x = 0; x < size; x++) {
            int xm = (x - 1 + size) % size;
            int xp = (x + 1) % size;
            float tl = h[ym * size + xm], t = h[ym * size + x], tr = h[ym * size + xp];
            float l = h[y * size + xm], r = h[y * size + xp];
            float bl = h[yp * size + xm], b = h[yp * size + x], br = h[yp * size + xp];

            float dx = (tr + 2.0f * r + br) - (tl + 2.0f * l + bl);
            float dy = (bl + 2.0f * b + br) - (tl + 2.0f * t + tr);
            float nx = -dx * strength;
            float ny = dy * strength; // OpenGL Y-up normal convention (+Y = up)
            float nz = 1.0f;
            float inv = 1.0f / sqrtf(nx * nx + ny * ny + nz * nz);
            nx *= inv; ny *= inv; nz *= inv;

            size_t idx = ((size_t)y * (size_t)size + (size_t)x) * 4u;
            out[idx + 0] = (uint8_t)clamp01(nx * 0.5f + 0.5f) * 255.0f;
            out[idx + 1] = (uint8_t)clamp01(ny * 0.5f + 0.5f) * 255.0f;
            out[idx + 2] = (uint8_t)clamp01(nz * 0.5f + 0.5f) * 255.0f;
            // fix integer truncation:
            out[idx + 0] = (uint8_t)(clamp01(nx * 0.5f + 0.5f) * 255.0f + 0.5f);
            out[idx + 1] = (uint8_t)(clamp01(ny * 0.5f + 0.5f) * 255.0f + 0.5f);
            out[idx + 2] = (uint8_t)(clamp01(nz * 0.5f + 0.5f) * 255.0f + 0.5f);
            out[idx + 3] = 255;
        }
    }
    save_raw(path, size, out);
    free(out);
}

static void write_pbr_set(const char *dir, const char *name, int size,
                          const uint8_t *albedo, const float *height, const uint8_t *rough,
                          float normal_strength) {
    char buf[512];
    snprintf(buf, sizeof(buf), "%s/%s_albedo.raw", dir, name);
    save_raw(buf, size, albedo);
    snprintf(buf, sizeof(buf), "%s/%s_normal.raw", dir, name);
    emit_normal_from_height(buf, size, height, normal_strength);
    snprintf(buf, sizeof(buf), "%s/%s_roughness.raw", dir, name);
    save_raw(buf, size, rough);
}

// 1. Variable-course Medieval Ashlar Stone Wall (realistic irregular lengths + weathered limestone/sandstone)
static void gen_ashlar_stone(const char *dir, const char *name, int size, uint32_t seed,
                             float base_r, float base_g, float base_b, float moss_amt, float normal_str) {
    uint8_t *alb = malloc((size_t)size * size * 4);
    uint8_t *rgh = malloc((size_t)size * size * 4);
    float *h = malloc((size_t)size * size * sizeof(float));

    const int rows = 8;
    for (int y = 0; y < size; y++) {
        float v = (float)y / size;
        for (int x = 0; x < size; x++) {
            float u = (float)x / size;
            float warp_u = (tile_fbm(u, v, 8, seed + 11, 4) - 0.5f) * 0.016f;
            float warp_v = (tile_fbm(u, v, 8, seed + 29, 4) - 0.5f) * 0.018f;
            float wu = fmodf(u + warp_u + 1.0f, 1.0f);
            float wv = fmodf(v + warp_v + 1.0f, 1.0f);

            float fy = wv * rows;
            int row = (int)floorf(fy) % rows;
            float rf = fy - floorf(fy);

            // Variable block width per row (4..6 blocks)
            int cols = (row % 2 == 0) ? 4 : 5;
            float row_shift = hash2f(row, 1, seed + 300) * 0.7f;
            float fx = wu * cols + row_shift;
            int col = ((int)floorf(fx) % cols + cols) % cols;
            float cf = fx - floorf(fx);

            // Slight individual block height jitter
            float block_id = hash2f(col, row, seed + 500);
            float grain = tile_fbm(u, v, 12, seed + 71, 5);
            float fine = tile_fbm(u, v, 48, seed + 199, 3);
            float pit = tile_fbm(u, v, 24, seed + 313, 3);

            float edge_x = fminf(cf, 1.0f - cf) * ((float)rows / (float)cols);
            float edge_y = fminf(rf, 1.0f - rf);
            float edge = fminf(edge_x, edge_y) + (fine - 0.5f) * 0.045f;

            float mortar_mask = 1.0f - smoothstep(0.035f, 0.085f, edge);
            float bevel = smoothstep(0.05f, 0.19f, edge);

            float chip = smoothstep(0.66f, 0.85f, pit) * (1.0f - bevel) * 0.16f;
            float hv = lerpf(0.28f + bevel * 0.45f + grain * 0.22f + fine * 0.08f - chip,
                             0.07f + fine * 0.07f, mortar_mask);
            h[y * size + x] = hv;

            // Stone block color tint (warm ochre vs cool grey mineral shifts)
            float warm_shift = (block_id - 0.5f) * 32.0f;
            float cool_shift = (hash2f(col + 7, row + 3, seed + 611) - 0.5f) * 20.0f;
            float streak = tile_fbm(u * 1.4f, v * 0.25f, 6, seed + 888, 3);
            float ao = lerpf(0.68f, 1.0f, bevel) * (1.0f - mortar_mask * 0.35f);

            float sr = (base_r + warm_shift - cool_shift * 0.4f + (grain - 0.5f) * 34.0f + (fine - 0.5f) * 18.0f) * ao;
            float sg = (base_g + warm_shift * 0.82f + (grain - 0.5f) * 30.0f + (fine - 0.5f) * 16.0f) * ao;
            float sb = (base_b + warm_shift * 0.55f + cool_shift * 0.6f + (grain - 0.5f) * 28.0f + (fine - 0.5f) * 16.0f) * ao;

            // Subtle rain grime streak
            float grime = smoothstep(0.55f, 0.85f, streak) * 0.18f;
            sr *= (1.0f - grime);
            sg *= (1.0f - grime * 0.96f);
            sb *= (1.0f - grime * 0.9f);

            // Mortar sandy-lime color
            float mr = 94.0f + (fine - 0.5f) * 24.0f;
            float mg = 88.0f + (fine - 0.5f) * 22.0f;
            float mb = 78.0f + (fine - 0.5f) * 20.0f;

            float r = lerpf(sr, mr, mortar_mask);
            float g = lerpf(sg, mg, mortar_mask);
            float b = lerpf(sb, mb, mortar_mask);

            // Subtle moss in damp joints
            if (moss_amt > 0.01f) {
                float moss_n = tile_fbm(u, v, 10, seed + 999, 4);
                float moss = smoothstep(0.52f, 0.78f, moss_n) * (mortar_mask * 0.7f + (1.0f - bevel) * 0.45f) * moss_amt;
                r = lerpf(r, 56.0f + fine * 18.0f, moss);
                g = lerpf(g, 76.0f + fine * 22.0f, moss);
                b = lerpf(b, 42.0f + fine * 14.0f, moss);
            }

            size_t idx = ((size_t)y * size + x) * 4;
            alb[idx + 0] = (uint8_t)clamp01(r / 255.0f) * 255;
            alb[idx + 0] = (uint8_t)(clamp01(r / 255.0f) * 255.0f + 0.5f);
            alb[idx + 1] = (uint8_t)(clamp01(g / 255.0f) * 255.0f + 0.5f);
            alb[idx + 2] = (uint8_t)(clamp01(b / 255.0f) * 255.0f + 0.5f);
            alb[idx + 3] = 255;

            float rv = lerpf(0.84f - grain * 0.18f + chip * 0.3f, 0.96f, mortar_mask);
            uint8_t rb = (uint8_t)(clamp01(rv) * 255.0f + 0.5f);
            rgh[idx + 0] = rgh[idx + 1] = rgh[idx + 2] = rb;
            rgh[idx + 3] = 255;
        }
    }
    write_pbr_set(dir, name, size, alb, h, rgh, normal_str);
    free(alb); free(rgh); free(h);
}

// 2. Rounded Organic Cobblestone Street Paving (domain-warped Voronoi + worn polished crowns)
static void gen_cobble_street(const char *dir, const char *name, int size, uint32_t seed) {
    uint8_t *alb = malloc((size_t)size * size * 4);
    uint8_t *rgh = malloc((size_t)size * size * 4);
    float *h = malloc((size_t)size * size * sizeof(float));

    for (int y = 0; y < size; y++) {
        float v = (float)y / size;
        for (int x = 0; x < size; x++) {
            float u = (float)x / size;
            float wu = fmodf(u + (tile_fbm(u, v, 8, seed + 13, 3) - 0.5f) * 0.024f + 1.0f, 1.0f);
            float wv = fmodf(v + (tile_fbm(u, v, 8, seed + 37, 3) - 0.5f) * 0.024f + 1.0f, 1.0f);

            float f1, edge, cid;
            tile_voronoi(wu, wv, 10, 12, seed + 101, 0.65f, &f1, &edge, &cid);

            float grain = tile_fbm(u, v, 20, seed + 211, 4);
            float micro = tile_fbm(u, v, 64, seed + 401, 2);

            // Smoothly domed cobble profile
            float gap = 1.0f - smoothstep(0.055f, 0.16f, edge + (micro - 0.5f) * 0.04f);
            float dome = sqrtf(clamp01(1.0f - f1 * f1 * 1.15f));
            float hv = lerpf(0.25f + dome * 0.58f + grain * 0.14f, 0.06f + micro * 0.06f, gap);
            h[y * size + x] = hv;

            // Natural granite/basalt/ochre-quartzite cobble palette
            float tone_sel = cid;
            float cr, cg, cb;
            if (tone_sel < 0.35f) {
                // Cool blue-grey granite
                cr = 104.0f; cg = 108.0f; cb = 114.0f;
            } else if (tone_sel < 0.72f) {
                // Warm weathered sandstone-grey
                cr = 124.0f; cg = 116.0f; cb = 104.0f;
            } else if (tone_sel < 0.90f) {
                // Darker basalt cobble
                cr = 84.0f; cg = 84.0f; cb = 86.0f;
            } else {
                // Warm ochre quartz cobble accent
                cr = 138.0f; cg = 122.0f; cb = 98.0f;
            }

            float ao = lerpf(0.62f, 1.03f, smoothstep(0.05f, 0.35f, edge));
            float sr = (cr + (grain - 0.5f) * 28.0f + (micro - 0.5f) * 14.0f) * ao;
            float sg = (cg + (grain - 0.5f) * 26.0f + (micro - 0.5f) * 14.0f) * ao;
            float sb = (cb + (grain - 0.5f) * 24.0f + (micro - 0.5f) * 14.0f) * ao;

            // Gritty dark-loam mortar bed
            float dr = 68.0f + (micro - 0.5f) * 18.0f;
            float dg = 62.0f + (micro - 0.5f) * 16.0f;
            float db = 53.0f + (micro - 0.5f) * 14.0f;

            float r = lerpf(sr, dr, gap);
            float g = lerpf(sg, dg, gap);
            float b = lerpf(sb, db, gap);

            // Subtle moss in sheltered cobble gaps
            float moss_n = tile_fbm(u, v, 8, seed + 777, 3);
            float moss = gap * smoothstep(0.56f, 0.80f, moss_n) * 0.55f;
            r = lerpf(r, 58.0f, moss);
            g = lerpf(g, 76.0f, moss);
            b = lerpf(b, 44.0f, moss);

            size_t idx = ((size_t)y * size + x) * 4;
            alb[idx + 0] = (uint8_t)(clamp01(r / 255.0f) * 255.0f + 0.5f);
            alb[idx + 1] = (uint8_t)(clamp01(g / 255.0f) * 255.0f + 0.5f);
            alb[idx + 2] = (uint8_t)(clamp01(b / 255.0f) * 255.0f + 0.5f);
            alb[idx + 3] = 255;

            // Worn smooth cobble tops (roughness ~0.48) vs gritty sandy mortar (~0.94)
            float rv = lerpf(0.68f - dome * 0.22f + (micro - 0.5f) * 0.12f, 0.94f, gap);
            uint8_t rb = (uint8_t)(clamp01(rv) * 255.0f + 0.5f);
            rgh[idx + 0] = rgh[idx + 1] = rgh[idx + 2] = rb;
            rgh[idx + 3] = 255;
        }
    }
    write_pbr_set(dir, name, size, alb, h, rgh, 3.2f);
    free(alb); free(rgh); free(h);
}

// 3. Packed Earth, Gravel & Muddy Shoulder
static void gen_dirt_gravel(const char *dir, const char *name, int size, uint32_t seed) {
    uint8_t *alb = malloc((size_t)size * size * 4);
    uint8_t *rgh = malloc((size_t)size * size * 4);
    float *h = malloc((size_t)size * size * sizeof(float));

    for (int y = 0; y < size; y++) {
        float v = (float)y / size;
        for (int x = 0; x < size; x++) {
            float u = (float)x / size;
            float macro = tile_fbm(u, v, 6, seed, 5);
            float grit = tile_fbm(u, v, 32, seed + 123, 3);
            float f1, edge, pid;
            tile_voronoi(u, v, 22, 22, seed + 555, 0.85f, &f1, &edge, &pid);
            float pebble = (pid > 0.72f) ? (1.0f - smoothstep(0.18f, 0.34f, f1)) : 0.0f;

            h[y * size + x] = macro * 0.45f + grit * 0.25f + pebble * 0.32f;

            float dr = 96.0f + (macro - 0.5f) * 32.0f + (grit - 0.5f) * 18.0f;
            float dg = 80.0f + (macro - 0.5f) * 28.0f + (grit - 0.5f) * 16.0f;
            float db = 60.0f + (macro - 0.5f) * 22.0f + (grit - 0.5f) * 14.0f;

            float pr = 118.0f + (pid - 0.7f) * 50.0f;
            float pg = 114.0f + (pid - 0.7f) * 45.0f;
            float pb = 104.0f + (pid - 0.7f) * 40.0f;

            float r = lerpf(dr, pr, pebble);
            float g = lerpf(dg, pg, pebble);
            float b = lerpf(db, pb, pebble);

            size_t idx = ((size_t)y * size + x) * 4;
            alb[idx + 0] = (uint8_t)(clamp01(r / 255.0f) * 255.0f + 0.5f);
            alb[idx + 1] = (uint8_t)(clamp01(g / 255.0f) * 255.0f + 0.5f);
            alb[idx + 2] = (uint8_t)(clamp01(b / 255.0f) * 255.0f + 0.5f);
            alb[idx + 3] = 255;

            float rv = lerpf(0.92f - macro * 0.1f, 0.74f, pebble);
            uint8_t rb = (uint8_t)(clamp01(rv) * 255.0f + 0.5f);
            rgh[idx + 0] = rgh[idx + 1] = rgh[idx + 2] = rb;
            rgh[idx + 3] = 255;
        }
    }
    write_pbr_set(dir, name, size, alb, h, rgh, 2.2f);
    free(alb); free(rgh); free(h);
}

// 4. Aged Hewn Oak Timber / Planks
static void gen_oak_timber(const char *dir, const char *name, int size, int planks,
                           float br, float bg, float bb, uint32_t seed) {
    uint8_t *alb = malloc((size_t)size * size * 4);
    uint8_t *rgh = malloc((size_t)size * size * 4);
    float *h = malloc((size_t)size * size * sizeof(float));

    for (int y = 0; y < size; y++) {
        float v = (float)y / size;
        for (int x = 0; x < size; x++) {
            float u = (float)x / size;
            float fu = u * planks;
            int p_idx = ((int)floorf(fu) % planks + planks) % planks;
            float pf = fu - floorf(fu);
            float seam = (planks > 1) ? (1.0f - smoothstep(0.015f, 0.045f, fminf(pf, 1.0f - pf))) : 0.0f;

            float p_tone = (hash2f(p_idx, 3, seed) - 0.5f) * 18.0f;
            float grain = tile_fbm(u * 2.5f, v * 0.35f, 8, seed + (uint32_t)p_idx * 19u, 4);
            float fine = tile_fbm(u * 6.0f, v * 0.6f, 16, seed + 409, 3);
            float wave = sinf((u * 38.0f + grain * 6.5f + p_idx * 2.1f) * 3.14159f) * 0.5f + 0.5f;

            float hv = lerpf(0.45f + wave * 0.25f + fine * 0.16f, 0.05f, seam);
            h[y * size + x] = hv;

            float tone = p_tone + (wave - 0.5f) * 22.0f + (grain - 0.5f) * 16.0f + (fine - 0.5f) * 10.0f;
            float ao = lerpf(1.0f, 0.36f, seam);
            float r = (br + tone) * ao;
            float g = (bg + tone * 0.82f) * ao;
            float b = (bb + tone * 0.62f) * ao;

            size_t idx = ((size_t)y * size + x) * 4;
            alb[idx + 0] = (uint8_t)(clamp01(r / 255.0f) * 255.0f + 0.5f);
            alb[idx + 1] = (uint8_t)(clamp01(g / 255.0f) * 255.0f + 0.5f);
            alb[idx + 2] = (uint8_t)(clamp01(b / 255.0f) * 255.0f + 0.5f);
            alb[idx + 3] = 255;

            float rv = lerpf(0.78f + wave * 0.14f, 0.95f, seam);
            uint8_t rb = (uint8_t)(clamp01(rv) * 255.0f + 0.5f);
            rgh[idx + 0] = rgh[idx + 1] = rgh[idx + 2] = rb;
            rgh[idx + 3] = 255;
        }
    }
    write_pbr_set(dir, name, size, alb, h, rgh, 2.4f);
    free(alb); free(rgh); free(h);
}

// 5. Weathered Tudor Limewash Plaster
static void gen_plaster(const char *dir, const char *name, int size,
                        float br, float bg, float bb, uint32_t seed) {
    uint8_t *alb = malloc((size_t)size * size * 4);
    uint8_t *rgh = malloc((size_t)size * size * 4);
    float *h = malloc((size_t)size * size * sizeof(float));

    for (int y = 0; y < size; y++) {
        float v = (float)y / size;
        for (int x = 0; x < size; x++) {
            float u = (float)x / size;
            float broad = tile_fbm(u, v, 4, seed, 4);
            float trowel = tile_fbm(u * 1.3f, v * 0.8f, 8, seed + 88, 3);
            float grit = tile_fbm(u, v, 32, seed + 222, 3);
            float crack_n = fabsf(tile_fbm(u, v, 6, seed + 511, 4) - 0.5f);
            float crack = (1.0f - smoothstep(0.008f, 0.022f, crack_n)) * smoothstep(0.45f, 0.72f, broad) * 0.45f;

            h[y * size + x] = trowel * 0.55f + grit * 0.3f - crack * 0.35f;

            float mod = (broad - 0.5f) * 32.0f + (trowel - 0.5f) * 20.0f + (grit - 0.5f) * 12.0f;
            float r = (br + mod) * (1.0f - crack * 0.32f);
            float g = (bg + mod * 0.94f) * (1.0f - crack * 0.32f);
            float b = (bb + mod * 0.84f) * (1.0f - crack * 0.32f);

            size_t idx = ((size_t)y * size + x) * 4;
            alb[idx + 0] = (uint8_t)(clamp01(r / 255.0f) * 255.0f + 0.5f);
            alb[idx + 1] = (uint8_t)(clamp01(g / 255.0f) * 255.0f + 0.5f);
            alb[idx + 2] = (uint8_t)(clamp01(b / 255.0f) * 255.0f + 0.5f);
            alb[idx + 3] = 255;

            float rv = 0.89f + (grit - 0.5f) * 0.14f;
            uint8_t rb = (uint8_t)(clamp01(rv) * 255.0f + 0.5f);
            rgh[idx + 0] = rgh[idx + 1] = rgh[idx + 2] = rb;
            rgh[idx + 3] = 255;
        }
    }
    write_pbr_set(dir, name, size, alb, h, rgh, 1.6f);
    free(alb); free(rgh); free(h);
}

// 6. Overlapping Roof Tiles (Slate or Terracotta Clay)
static void gen_roof_tiles(const char *dir, const char *name, int size,
                           float br, float bg, float bb, float moss_amt, uint32_t seed) {
    uint8_t *alb = malloc((size_t)size * size * 4);
    uint8_t *rgh = malloc((size_t)size * size * 4);
    float *h = malloc((size_t)size * size * sizeof(float));

    const int rows = 8, cols = 8;
    for (int y = 0; y < size; y++) {
        float v = (float)y / size;
        float fy = v * rows;
        int r = ((int)floorf(fy) % rows + rows) % rows;
        float rf = fy - floorf(fy);
        float stagger = (r % 2) * 0.5f;

        for (int x = 0; x < size; x++) {
            float u = (float)x / size;
            float fx = u * cols + stagger;
            int c = ((int)floorf(fx) % cols + cols) % cols;
            float cf = fx - floorf(fx);

            float grain = tile_fbm(u, v, 16, seed + 44, 4);
            float tint = (hash2f(c, r, seed + 12) - 0.5f) * 26.0f;
            float gap_x = 1.0f - smoothstep(0.02f, 0.06f, fminf(cf, 1.0f - cf));
            float lap_shadow = 1.0f - smoothstep(0.0f, 0.16f, rf);

            // Curved shingle / slate lap slope
            float hv = lerpf(0.25f + (1.0f - rf) * 0.55f + grain * 0.14f, 0.10f, gap_x);
            h[y * size + x] = hv;

            float ao = lerpf(1.0f, 0.52f, fmaxf(gap_x, lap_shadow * 0.72f));
            float cr = (br + tint + (grain - 0.5f) * 22.0f) * ao;
            float cg = (bg + tint * 0.88f + (grain - 0.5f) * 20.0f) * ao;
            float cb = (bb + tint * 0.82f + (grain - 0.5f) * 20.0f) * ao;

            float moss_n = tile_fbm(u, v, 8, seed + 777, 4);
            float moss = smoothstep(0.55f, 0.80f, moss_n) * moss_amt * (0.4f + lap_shadow * 0.6f);
            cr = lerpf(cr, 62.0f, moss);
            cg = lerpf(cg, 84.0f, moss);
            cb = lerpf(cb, 46.0f, moss);

            size_t idx = ((size_t)y * size + x) * 4;
            alb[idx + 0] = (uint8_t)(clamp01(cr / 255.0f) * 255.0f + 0.5f);
            alb[idx + 1] = (uint8_t)(clamp01(cg / 255.0f) * 255.0f + 0.5f);
            alb[idx + 2] = (uint8_t)(clamp01(cb / 255.0f) * 255.0f + 0.5f);
            alb[idx + 3] = 255;

            float rv = lerpf(0.68f + grain * 0.18f, 0.92f, gap_x);
            uint8_t rb = (uint8_t)(clamp01(rv) * 255.0f + 0.5f);
            rgh[idx + 0] = rgh[idx + 1] = rgh[idx + 2] = rb;
            rgh[idx + 3] = 255;
        }
    }
    write_pbr_set(dir, name, size, alb, h, rgh, 3.0f);
    free(alb); free(rgh); free(h);
}

// 7. Hammered Forged Iron / Aged Brass
static void gen_forged_metal(const char *dir, const char *name, int size,
                             float br, float bg, float bb, uint32_t seed) {
    uint8_t *alb = malloc((size_t)size * size * 4);
    uint8_t *rgh = malloc((size_t)size * size * 4);
    float *h = malloc((size_t)size * size * sizeof(float));

    for (int y = 0; y < size; y++) {
        float v = (float)y / size;
        for (int x = 0; x < size; x++) {
            float u = (float)x / size;
            float f1, edge, cid;
            tile_voronoi(u, v, 14, 14, seed, 0.85f, &f1, &edge, &cid);
            float dimple = 1.0f - clamp01(f1 * 1.1f);
            float grain = tile_fbm(u * 0.5f, v * 3.0f, 12, seed + 55, 3);
            h[y * size + x] = dimple * 0.45f + grain * 0.35f;

            float mod = (grain - 0.5f) * 24.0f + (dimple - 0.5f) * 18.0f;
            size_t idx = ((size_t)y * size + x) * 4;
            alb[idx + 0] = (uint8_t)(clamp01((br + mod) / 255.0f) * 255.0f + 0.5f);
            alb[idx + 1] = (uint8_t)(clamp01((bg + mod) / 255.0f) * 255.0f + 0.5f);
            alb[idx + 2] = (uint8_t)(clamp01((bb + mod) / 255.0f) * 255.0f + 0.5f);
            alb[idx + 3] = 255;

            float rv = 0.32f + (1.0f - dimple) * 0.22f + grain * 0.14f;
            uint8_t rb = (uint8_t)(clamp01(rv) * 255.0f + 0.5f);
            rgh[idx + 0] = rgh[idx + 1] = rgh[idx + 2] = rb;
            rgh[idx + 3] = 255;
        }
    }
    write_pbr_set(dir, name, size, alb, h, rgh, 1.5f);
    free(alb); free(rgh); free(h);
}


// 8. Weathered Flemish Red-Clay Medieval Brick Masonry (running bond with lime mortar)
static void gen_medieval_brick(const char *dir, const char *name, int size, uint32_t seed) {
    uint8_t *alb = malloc((size_t)size * size * 4);
    uint8_t *rgh = malloc((size_t)size * size * 4);
    float *h = malloc((size_t)size * size * sizeof(float));

    const int rows = 14;
    const int cols = 7;
    for (int y = 0; y < size; y++) {
        float v = (float)y / size;
        for (int x = 0; x < size; x++) {
            float u = (float)x / size;
            float fy = v * rows;
            int row = ((int)floorf(fy) % rows + rows) % rows;
            float rf = fy - floorf(fy);

            float fx = u * cols + ((row & 1) ? 0.5f : 0.0f);
            int col = ((int)floorf(fx) % cols + cols) % cols;
            float cf = fx - floorf(fx);

            float bid = hash2f(col, row, seed + 17u);
            float grain = tile_fbm(u, v, 18, seed + 71u, 4);
            float fine = tile_fbm(u, v, 64, seed + 193u, 3);

            float ex = fminf(cf, 1.0f - cf) * ((float)rows / (float)cols);
            float ey = fminf(rf, 1.0f - rf);
            float edge = fminf(ex, ey) + (fine - 0.5f) * 0.055f;

            float mortar = 1.0f - smoothstep(0.055f, 0.125f, edge);
            float bevel = smoothstep(0.08f, 0.22f, edge);
            float soot = smoothstep(0.58f, 0.85f, tile_fbm(u * 0.8f, v * 0.4f, 5, seed + 409u, 3)) * 0.22f;

            h[y * size + x] = lerpf(0.32f + bevel * 0.42f + grain * 0.18f + fine * 0.08f, 0.09f + fine * 0.06f, mortar);

            float warm = (bid - 0.5f) * 38.0f;
            float br = (146.0f + warm + (grain - 0.5f) * 32.0f + (fine - 0.5f) * 16.0f) * lerpf(0.76f, 1.0f, bevel) * (1.0f - soot);
            float bg = (82.0f  + warm * 0.55f + (grain - 0.5f) * 20.0f) * lerpf(0.76f, 1.0f, bevel) * (1.0f - soot);
            float bb = (66.0f  + warm * 0.35f + (grain - 0.5f) * 18.0f) * lerpf(0.76f, 1.0f, bevel) * (1.0f - soot * 0.9f);

            float mr = 148.0f + (fine - 0.5f) * 22.0f;
            float mg = 138.0f + (fine - 0.5f) * 20.0f;
            float mb = 122.0f + (fine - 0.5f) * 18.0f;

            float r = lerpf(br, mr, mortar);
            float g = lerpf(bg, mg, mortar);
            float b = lerpf(bb, mb, mortar);

            size_t idx = ((size_t)y * size + x) * 4;
            alb[idx + 0] = (uint8_t)(clamp01(r / 255.0f) * 255.0f + 0.5f);
            alb[idx + 1] = (uint8_t)(clamp01(g / 255.0f) * 255.0f + 0.5f);
            alb[idx + 2] = (uint8_t)(clamp01(b / 255.0f) * 255.0f + 0.5f);
            alb[idx + 3] = 255;

            uint8_t rb = (uint8_t)(clamp01(lerpf(0.84f - grain * 0.15f, 0.95f, mortar)) * 255.0f + 0.5f);
            rgh[idx + 0] = rgh[idx + 1] = rgh[idx + 2] = rb;
            rgh[idx + 3] = 255;
        }
    }
    write_pbr_set(dir, name, size, alb, h, rgh, 2.5f);
    free(alb); free(rgh); free(h);
}

int main(int argc, char **argv) {
    if (argc < 2) return 1;
    const char *dir = argv[1];
    int tex_size = 512;
    int ground_size = 1024;

    gen_ashlar_stone(dir, "stone_ashlar", tex_size, 1001, 134, 128, 118, 0.35f, 2.8f);
    gen_ashlar_stone(dir, "stone_trim",   tex_size, 2002, 104, 102, 100, 0.22f, 2.6f);
    gen_medieval_brick(dir, "brick_medieval", tex_size, 2505);
    gen_cobble_street(dir, "cobble_street", ground_size, 3003);
    gen_dirt_gravel(dir, "dirt_gravel", tex_size, 4004);
    gen_oak_timber(dir, "timber_oak",   tex_size, 3, 82, 55, 36, 5005);
    gen_oak_timber(dir, "planks_oak",   tex_size, 6, 116, 82, 52, 5055);
    gen_plaster(dir, "plaster_cream", tex_size, 206, 194, 170, 6006);
    gen_plaster(dir, "plaster_ochre", tex_size, 196, 166, 118, 6016);
    gen_plaster(dir, "plaster_sage",  tex_size, 158, 166, 146, 6026);
    gen_roof_tiles(dir, "roof_slate", tex_size, 74, 80, 90, 0.32f, 7007);
    gen_roof_tiles(dir, "roof_clay",  tex_size, 136, 76, 56, 0.28f, 7017);
    gen_forged_metal(dir, "iron_forged", tex_size, 72, 76, 84, 8008);
    gen_forged_metal(dir, "brass_aged",  tex_size, 184, 145, 82, 8018);

    printf("Generated all raw PBR textures cleanly.\n");
    return 0;
}
