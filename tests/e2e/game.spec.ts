import { expect, test } from '@playwright/test';

interface Snapshot {
  position: { x: number; y: number; z: number };
  zone: string;
  region: string;
  stats: { hp: number; mp: number; gold: number; level: number };
  quests: Record<string, { status: string; currentStageId: string | null }>;
  activeModal: string | null;
  activePrompt: string | null;
}

interface Telemetry {
  preset: string;
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

const ARTIFACT_DIR = 'test-results/screenshots';

test.describe('Ashen March Visual Overhaul End-to-End Verification', () => {
  test('renders overhauled 3D world & UI, captures comparison screenshots, verifies gameplay, quality tiers & IndexedDB save/load', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(`console.error: ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err.message}`);
    });

    await page.goto('/');
    await page.waitForFunction(() => Boolean((window as unknown as { __ASHEN_MARCH__?: unknown }).__ASHEN_MARCH__), {
      timeout: 20_000,
    });
    await page.waitForTimeout(900);

    // 1. Verify WebGL canvas and HUD + capture Overhauled Village Panorama
    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(800);
    expect(box?.height).toBeGreaterThan(500);
    await expect(page.getByTestId('hud-compass')).toContainText('溪谷村');
    await page.screenshot({ path: `${ARTIFACT_DIR}/overhaul_01_village.png` });

    // Measure telemetry across quality presets (High -> Medium -> Low)
    for (const preset of ['high', 'medium', 'low'] as const) {
      await page.evaluate((p) => {
        (window as unknown as { __ASHEN_MARCH__: { setQuality: (q: string) => void } }).__ASHEN_MARCH__.setQuality(p);
      }, preset);
      await page.waitForTimeout(750);
      const tel: Telemetry = await page.evaluate(() =>
        (window as unknown as { __ASHEN_MARCH__: { getTelemetry: () => Telemetry } }).__ASHEN_MARCH__.getTelemetry(),
      );
      console.log(`TELEMETRY_${preset.toUpperCase()}:`, JSON.stringify(tel));
    }
    // Restore High quality for visual inspection screenshots
    await page.evaluate(() => {
      (window as unknown as { __ASHEN_MARCH__: { setQuality: (q: string) => void } }).__ASHEN_MARCH__.setQuality('high');
    });
    await page.waitForTimeout(350);

    // 2. Verify WASD movement & terrain grounding
    const beforeMove: Snapshot = await page.evaluate(() =>
      (window as unknown as { __ASHEN_MARCH__: { getSnapshot: () => Snapshot } }).__ASHEN_MARCH__.getSnapshot(),
    );
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(400);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.keyboard.up('KeyW');
    const afterMove: Snapshot = await page.evaluate(() =>
      (window as unknown as { __ASHEN_MARCH__: { getSnapshot: () => Snapshot } }).__ASHEN_MARCH__.getSnapshot(),
    );
    expect(afterMove.position.z).toBeLessThan(beforeMove.position.z - 0.8);
    expect(afterMove.position.y).toBeGreaterThan(3.5);
    expect(afterMove.position.y).toBeLessThan(4.6);

    // 2b. Exploration screenshot at River Valley bridge
    await page.evaluate(() => {
      const api = (window as unknown as {
        __ASHEN_MARCH__: { teleport: (x: number, y: number, z: number) => void; setLook: (yaw: number, pitch: number) => void };
      }).__ASHEN_MARCH__;
      api.teleport(72, 3.2, 55);
      api.setLook(-1.45, -0.05);
    });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${ARTIFACT_DIR}/overhaul_02_explore.png` });

    // 3. Ashwood Forest screenshot
    await page.evaluate(() => {
      const api = (window as unknown as {
        __ASHEN_MARCH__: { teleport: (x: number, y: number, z: number) => void; setLook: (yaw: number, pitch: number) => void };
      }).__ASHEN_MARCH__;
      api.teleport(-95, 7.5, -18);
      api.setLook(0.6, -0.05);
    });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${ARTIFACT_DIR}/overhaul_03_forest.png` });

    // 4. Talk to Elder Aldrin via [E] (Lower-Third Cinematic Dialogue) & accept Main Quest
    await page.evaluate(() => {
      const api = (window as unknown as {
        __ASHEN_MARCH__: { teleport: (x: number, y: number, z: number) => void; setLook: (yaw: number, pitch: number) => void };
      }).__ASHEN_MARCH__;
      api.teleport(0, 4.1, 33.4);
      api.setLook(0, -0.05);
    });
    await page.waitForTimeout(200);
    await expect(page.getByTestId('hud-interact-prompt')).toContainText('村长奥尔德林');
    await page.keyboard.press('KeyE');
    await expect(page.getByTestId('modal-dialogue')).toBeVisible();
    await page.screenshot({ path: `${ARTIFACT_DIR}/overhaul_06_dialogue.png` });

    await page.locator('.choice-btn').first().click();
    await page.locator('.choice-btn').first().click();
    await expect(page.getByTestId('hud-quest-tracker')).toContainText('失落的守望者');

    // 5. Open Redesigned 3-Column Inventory [I], Quest Log [J], Cartographic Map [M]
    await page.keyboard.press('KeyI');
    await expect(page.getByTestId('modal-inventory')).toBeVisible();
    await page.screenshot({ path: `${ARTIFACT_DIR}/overhaul_05_inventory.png` });
    await page.keyboard.press('KeyI');

    await page.keyboard.press('KeyJ');
    await expect(page.getByTestId('modal-quests')).toBeVisible();
    await expect(page.locator('#modal-panel')).toContainText('失落的守望者');
    await page.screenshot({ path: `${ARTIFACT_DIR}/overhaul_08_quests_log.png` });
    await page.keyboard.press('KeyJ');

    await page.keyboard.press('KeyM');
    await expect(page.getByTestId('modal-map')).toBeVisible();
    await page.screenshot({ path: `${ARTIFACT_DIR}/overhaul_07_map_quests.png` });
    await page.keyboard.press('KeyM');

    // 6. Open Merchant Garrick Shop and purchase potion
    await page.evaluate(() => {
      const api = (window as unknown as {
        __ASHEN_MARCH__: { teleport: (x: number, y: number, z: number) => void; setLook: (yaw: number, pitch: number) => void };
      }).__ASHEN_MARCH__;
      api.teleport(-11.4, 4.1, 38);
      api.setLook(Math.PI / 2, 0);
    });
    await page.waitForTimeout(180);
    await expect(page.getByTestId('hud-interact-prompt')).toContainText('铁匠商人葛伦');
    await page.keyboard.press('KeyE');
    await expect(page.getByTestId('modal-dialogue')).toBeVisible();
    await page.locator('.choice-btn').first().click();
    await expect(page.getByTestId('modal-shop')).toBeVisible();
    const goldBeforeShop = (
      await page.evaluate(() =>
        (window as unknown as { __ASHEN_MARCH__: { getSnapshot: () => Snapshot } }).__ASHEN_MARCH__.getSnapshot(),
      )
    ).stats.gold;
    await page.locator('[data-buy-id="minor_health_potion"]').click();
    const goldAfterShop = (
      await page.evaluate(() =>
        (window as unknown as { __ASHEN_MARCH__: { getSnapshot: () => Snapshot } }).__ASHEN_MARCH__.getSnapshot(),
      )
    ).stats.gold;
    expect(goldAfterShop).toBe(goldBeforeShop - 20);
    await page.keyboard.press('Escape');

    // 7. Cast Fireball & verify MP consumption
    const mpBefore = (
      await page.evaluate(() =>
        (window as unknown as { __ASHEN_MARCH__: { getSnapshot: () => Snapshot } }).__ASHEN_MARCH__.getSnapshot(),
      )
    ).stats.mp;
    await page.mouse.click(640, 360, { button: 'right' });
    await page.waitForTimeout(150);
    const mpAfter = (
      await page.evaluate(() =>
        (window as unknown as { __ASHEN_MARCH__: { getSnapshot: () => Snapshot } }).__ASHEN_MARCH__.getSnapshot(),
      )
    ).stats.mp;
    expect(mpAfter).toBeLessThan(mpBefore);

    // 8. Enter Ancient Crypt Dungeon via portal + capture screenshot
    await page.evaluate(() => {
      const api = (window as unknown as {
        __ASHEN_MARCH__: { teleport: (x: number, y: number, z: number) => void; setLook: (yaw: number, pitch: number) => void };
      }).__ASHEN_MARCH__;
      api.teleport(0, 12.2, -171.8);
      api.setLook(0, 0);
    });
    await page.waitForTimeout(200);
    await expect(page.getByTestId('hud-interact-prompt')).toContainText('古代墓穴');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(350);

    const cryptSnap: Snapshot = await page.evaluate(() =>
      (window as unknown as { __ASHEN_MARCH__: { getSnapshot: () => Snapshot } }).__ASHEN_MARCH__.getSnapshot(),
    );
    expect(cryptSnap.zone).toBe('ancient_crypt');
    await expect(page.getByTestId('hud-compass')).toContainText('古代墓穴');
    await page.screenshot({ path: `${ARTIFACT_DIR}/overhaul_04_dungeon.png` });

    // 9. Save to IndexedDB slot_1, switch quality via UI menu, reload page, and restore slot_1
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('modal-menu')).toBeVisible();
    await page.locator('[data-quality="medium"]').click();
    await page.locator('[data-save-slot="slot_1"]').click();
    await page.waitForTimeout(350);

    await page.reload();
    await page.waitForFunction(() => Boolean((window as unknown as { __ASHEN_MARCH__?: unknown }).__ASHEN_MARCH__), {
      timeout: 20_000,
    });

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('modal-menu')).toBeVisible();
    await page.locator('[data-load-slot="slot_1"]').click();
    await page.waitForTimeout(350);

    const restoredSnap: Snapshot = await page.evaluate(() =>
      (window as unknown as { __ASHEN_MARCH__: { getSnapshot: () => Snapshot } }).__ASHEN_MARCH__.getSnapshot(),
    );
    expect(restoredSnap.zone).toBe('ancient_crypt');
    expect(restoredSnap.quests.main_lost_watchers?.status).toBe('active');

    expect(errors).toEqual([]);
  });

  test('loads Ashenhold V3 (?zone=city) and walks continuously WITHOUT teleport across all 4 vertical layers (0m Gate -> -4m Undercroft -> +3.5m Market -> +7.5m Overlook -> +19.5m Summit), trades & verifies Map', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    // 640x360 keeps SwiftShader CPU rasterization 4x faster during the 180m zero-teleport real KeyW walk
    await page.setViewportSize({ width: 640, height: 360 });
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err.message}`);
    });

    await page.goto('/?zone=city');
    await page.waitForFunction(
      () => Boolean((window as unknown as { __ASHEN_MARCH__?: unknown }).__ASHEN_MARCH__),
      null,
      { timeout: 90_000 },
    );
    await page.waitForTimeout(500);

    await expect(page.getByTestId('hud-compass')).toContainText('灰烬城 · 南城门');

    // Use low preset + bypass PostFX during SwiftShader CPU walk ticks so physics steps smoothly (re-enabled in Step 7)
    await page.evaluate(() => {
      const api = (window as unknown as {
        __ASHEN_MARCH__: {
          setQuality: (q: string) => void;
          setTimeOfDay: (h: number) => void;
          setPostFX: (o: { enabled: boolean }) => void;
        };
      }).__ASHEN_MARCH__;
      api.setQuality('low');
      api.setPostFX({ enabled: false });
      api.setTimeOfDay(13.0);
    });

    const getSnap = async (): Promise<Snapshot> =>
      page.evaluate(() =>
        (window as unknown as { __ASHEN_MARCH__: { getSnapshot: () => Snapshot } }).__ASHEN_MARCH__.getSnapshot(),
      );

    // Real continuous zero-teleport walking helper using ONLY setLook + KeyW (no sprint overshoot on SwiftShader!)
    const walkTo = async (tx: number, tz: number, maxTicks = 18): Promise<Snapshot> => {
      await page.keyboard.down('KeyW');
      let snap = await getSnap();
      let prevDist = Math.hypot(tx - snap.position.x, tz - snap.position.z);
      for (let i = 0; i < maxTicks; i++) {
        const dx = tx - snap.position.x;
        const dz = tz - snap.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.85) break;
        const yaw = Math.atan2(-dx, -dz);
        await page.evaluate((y) => {
          (window as unknown as { __ASHEN_MARCH__: { setLook: (yaw: number, pitch: number) => void } }).__ASHEN_MARCH__.setLook(y, 0);
        }, yaw);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
        snap = await getSnap();
        const nextDist = Math.hypot(tx - snap.position.x, tz - snap.position.z);
        if (nextDist < 1.85 || (nextDist > prevDist + 0.2 && prevDist < 3.2)) break;
        prevDist = nextDist;
      }
      await page.keyboard.up('KeyW');
      return snap;
    };

    // 1. Walk continuously North from South Gate spawn (0.0m, z=18.4) -> through Gate Arch -> Trade Alley -> South Undercroft Portal
    let snap = await walkTo(0.0, 6.0, 14);
    expect(snap.zone).toBe('ashenhold_city');
    expect(snap.position.z).toBeLessThan(9.0);

    snap = await walkTo(0.0, -7.0, 14);
    snap = await walkTo(-3.2, -7.0, 6);
    // 2. Descend South Undercroft Stone Stair continuously to -4.0m Vaulted Stone Cistern! (ZERO TELEPORT)
    snap = await walkTo(-12.3, -7.0, 14);
    console.log('E2E_LAYER1_UNDERCROFT:', JSON.stringify(snap.position));
    expect(snap.position.x).toBeLessThan(-10.5);
    expect(snap.position.y).toBeLessThan(-3.0);

    // 3. Walk North through the -4.0m Damp Vaulted Cistern -> climb North Undercroft Stairway into +3.5m Market Plaza!
    snap = await walkTo(-12.1, -24.5, 18);
    expect(snap.position.y).toBeLessThan(-3.0);
    snap = await walkTo(-9.3, -39.2, 20);
    console.log('E2E_LAYER2_MARKET:', JSON.stringify(snap.position));
    expect(snap.position.y).toBeGreaterThan(3.0);
    await expect(page.getByTestId('hud-compass')).toContainText('灰烬城 · 中央市集');

    // 4. Step cleanly North-East to Merchant Thorne (-6.6, -41.4) in Market Plaza and perform real shop transaction
    snap = await walkTo(-7.8, -41.0, 10);
    await page.evaluate(() => {
      (window as unknown as { __ASHEN_MARCH__: { setLook: (yaw: number, pitch: number) => void } }).__ASHEN_MARCH__.setLook(-1.35, -0.02);
    });
    await page.waitForTimeout(200);
    await expect(page.getByTestId('hud-interact-prompt')).toContainText('商会总管索恩');
    await page.keyboard.press('KeyE');
    await expect(page.getByTestId('modal-dialogue')).toBeVisible();
    await page.locator('.choice-btn').first().click();
    await expect(page.getByTestId('modal-shop')).toBeVisible();
    const goldBefore = (await getSnap()).stats.gold;
    await page.locator('[data-buy-id="mana_potion"]').click();
    const goldAfter = (await getSnap()).stats.gold;
    expect(goldAfter).toBeLessThan(goldBefore);
    await page.keyboard.press('Escape');

    // 5. Step East into open plaza (clearing Thorne at -6.6,-41.4 & stall_06 at -8.0,-43.0) -> West Switchback Stair -> +7.5m Overlook!
    snap = await walkTo(-4.8, -39.5, 8);
    snap = await walkTo(-4.8, -46.5, 10);
    snap = await walkTo(-11.6, -46.8, 10);
    snap = await walkTo(-11.6, -49.35, 6);
    snap = await walkTo(-3.6, -49.35, 14);
    snap = await walkTo(-3.6, -54.5, 10);
    console.log('E2E_LAYER3_OVERLOOK:', JSON.stringify(snap.position));
    expect(snap.position.y).toBeGreaterThan(7.1);

    // 6. Climb Cliffside Outer Stairway Flight 1 (+7.5m -> +13.5m) & Flight 2 (+13.5m -> +19.5m Watchtower Summit)!
    snap = await walkTo(10.6, -55.0, 12);
    snap = await walkTo(10.6, -57.2, 6);
    snap = await walkTo(-10.8, -57.2, 22);
    expect(snap.position.y).toBeGreaterThan(12.8);
    snap = await walkTo(-10.8, -61.2, 8);
    snap = await walkTo(9.0, -61.2, 22);
    expect(snap.position.y).toBeGreaterThan(18.8);
    snap = await walkTo(9.0, -64.8, 8);
    snap = await walkTo(0.0, -64.8, 12);
    console.log('E2E_LAYER4_SUMMIT:', JSON.stringify(snap.position));
    expect(snap.position.y).toBeGreaterThan(19.0);

    // 7. Verify live Material Diagnostic Mode API + V3 4-Layer Map Modal [M]
    await page.evaluate(() => {
      const api = (window as unknown as { __ASHEN_MARCH__: { setDebugMode: (m: string) => void } }).__ASHEN_MARCH__;
      api.setDebugMode('albedo');
      api.setDebugMode('final');
    });
    await page.keyboard.press('KeyM');
    await expect(page.getByTestId('modal-map')).toBeVisible();
    await expect(page.getByTestId('modal-map')).toContainText('灰烬城山堡舆图 · Ashenhold V3');
    await page.keyboard.press('KeyM');

    expect(errors).toEqual([]);
  });
});
