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

  test('loads Ashenhold V5 (?zone=city), verifies bent-axis gate culling, walks continuously WITHOUT teleport across Cells 01->02->08->03->04->06->07 (-4m to +21m), trades, and verifies V5 Map & Audio Mixer', async ({
    page,
  }) => {
    test.setTimeout(540_000);
    // 320x180 keeps SwiftShader CPU pixel rasterization 4x faster during the long multi-cell zero-teleport KeyW walk
    await page.setViewportSize({ width: 320, height: 180 });
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

    // Verify bent-axis Outer Gate culling: standing at Outer Gate 1 does NOT render Market/Temple/Castle
    const gateCellTel = await page.evaluate(() =>
      (window as unknown as {
        __ASHEN_MARCH__: { getCellTelemetry: () => { activeCellId: string; activeCells: string[]; debugEnabled: boolean } };
      }).__ASHEN_MARCH__.getCellTelemetry(),
    );
    expect(gateCellTel.activeCellId).toBe('cell_01_barbican_gate');
    expect(gateCellTel.activeCells).not.toContain('cell_03_market_plaza');
    expect(gateCellTel.activeCells).not.toContain('cell_07_lord_castle');

    // Use low preset + bypass PostFX during SwiftShader CPU walk ticks so physics steps smoothly
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

    // Real continuous zero-teleport walking helper using ONLY setLook + KeyW (+ ShiftLeft sprint when stamina available)
    const walkTo = async (tx: number, tz: number, maxTicks = 20): Promise<Snapshot> => {
      await page.keyboard.down('ShiftLeft');
      await page.keyboard.down('KeyW');
      let snap = await getSnap();
      let prevDist = Math.hypot(tx - snap.position.x, tz - snap.position.z);
      for (let i = 0; i < maxTicks; i++) {
        const dx = tx - snap.position.x;
        const dz = tz - snap.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.65) break;
        const yaw = Math.atan2(-dx, -dz);
        await page.evaluate((y) => {
          (window as unknown as { __ASHEN_MARCH__: { setLook: (yaw: number, pitch: number) => void } }).__ASHEN_MARCH__.setLook(y, 0);
        }, yaw);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
        snap = await getSnap();
        const nextDist = Math.hypot(tx - snap.position.x, tz - snap.position.z);
        if (nextDist < 1.65 || (nextDist > prevDist + 0.25 && prevDist < 2.8)) break;
        prevDist = nextDist;
      }
      await page.keyboard.up('KeyW');
      await page.keyboard.up('ShiftLeft');
      return snap;
    };

    // 1. Cell 01 Outer Barbican (-6.2, 34.8) -> Bent-Axis Courtyard -> Inner Gate -> Cell 02 Trade Street!
    let snap = await walkTo(-6.2, 23.2, 20);
    snap = await walkTo(0.0, 22.0, 14);
    snap = await walkTo(0.0, 6.0, 22);
    expect(snap.zone).toBe('ashenhold_city');
    expect(snap.position.z).toBeLessThan(8.5);
    await expect(page.getByTestId('hud-compass')).toContainText('贸易街');

    // 2. Cell 02 Trade Street -> Descend South Undercroft Stair continuously to Cell 08 (-4.0m Cistern)!
    snap = await walkTo(0.0, -7.0, 18);
    snap = await walkTo(-3.2, -7.0, 8);
    snap = await walkTo(-12.3, -7.0, 18);
    console.log('E2E_CELL08_UNDERCROFT:', JSON.stringify(snap.position));
    expect(snap.position.x).toBeLessThan(-10.2);
    expect(snap.position.y).toBeLessThan(-3.0);
    await expect(page.getByTestId('hud-compass')).toContainText('地下暗渠');

    // 3. Cell 08 Vaulted Cistern -> Climb North Undercroft Stair into Cell 03 Market Plaza (+3.5m)!
    snap = await walkTo(-12.1, -24.5, 22);
    expect(snap.position.y).toBeLessThan(-3.0);
    snap = await walkTo(-9.3, -39.2, 24);
    console.log('E2E_CELL03_MARKET:', JSON.stringify(snap.position));
    expect(snap.position.y).toBeGreaterThan(3.0);
    await expect(page.getByTestId('hud-compass')).toContainText('灰烬城 · 中央市集');

    // 4. Trade with Merchant Thorne (-6.6, -41.4) in Market Plaza
    snap = await walkTo(-7.8, -41.0, 10);
    await page.evaluate(() => {
      (window as unknown as { __ASHEN_MARCH__: { setLook: (yaw: number, pitch: number) => void } }).__ASHEN_MARCH__.setLook(-1.35, -0.02);
    });
    await page.waitForTimeout(200);
    await expect(page.getByTestId('hud-interact-prompt')).toContainText('商会总管索恩');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.keyboard.press('KeyE');
    await expect(page.getByTestId('modal-dialogue')).toBeVisible();
    await page.locator('.choice-btn').first().click();
    await expect(page.getByTestId('modal-shop')).toBeVisible();
    const goldBefore = (await getSnap()).stats.gold;
    await page.locator('[data-buy-id="mana_potion"]').click();
    const goldAfter = (await getSnap()).stats.gold;
    expect(goldAfter).toBeLessThan(goldBefore);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 320, height: 180 });

    // 5. Walk West through West Arcade Archway up into Cell 04 Artisan Quarter (+7.0m)!
    snap = await walkTo(-13.8, -39.5, 12);
    snap = await walkTo(-14.5, -35.2, 10);
    snap = await walkTo(-25.8, -35.2, 18);
    console.log('E2E_CELL04_ARTISAN:', JSON.stringify(snap.position));
    expect(snap.position.y).toBeGreaterThan(6.6);
    await expect(page.getByTestId('hud-compass')).toContainText('西侧工匠区');

    // 6. Return to Market -> +7.5m Overlook -> Climb Ceremonial Stair to Cell 06 Temple Acropolis (+12.2m) -> Royal Causeway -> Cell 07 Castle Great Hall (+21.0m)!
    snap = await walkTo(-14.2, -35.2, 18);
    snap = await walkTo(-13.8, -39.5, 10);
    snap = await walkTo(-11.6, -46.8, 12);
    snap = await walkTo(-11.6, -49.35, 8);
    snap = await walkTo(-3.6, -49.35, 14);
    snap = await walkTo(-3.6, -54.5, 10);
    expect(snap.position.y).toBeGreaterThan(7.1);

    snap = await walkTo(-15.5, -55.8, 16);
    snap = await walkTo(-15.5, -74.0, 26);
    console.log('E2E_CELL06_TEMPLE:', JSON.stringify(snap.position));
    expect(snap.position.y).toBeGreaterThan(11.8);
    await expect(page.getByTestId('hud-compass')).toContainText('圣堂与钟楼高地');

    snap = await walkTo(0.0, -76.0, 20);
    snap = await walkTo(0.0, -96.5, 24);
    snap = await walkTo(0.0, -112.0, 22);
    expect(snap.position.y).toBeGreaterThan(17.6);
    await expect(page.getByTestId('hud-compass')).toContainText('领主城堡');

    snap = await walkTo(0.0, -122.0, 16);
    snap = await walkTo(0.0, -133.5, 18);
    console.log('E2E_CELL07_GREAT_HALL:', JSON.stringify(snap.position));
    expect(snap.position.y).toBeGreaterThan(20.6);

    // 7. Verify Cell/Portal Debug Mode, Interior Reverb Override, V5 8-Cell Map [M], and 4-Channel Audio Mixer [Esc]
    const diagAfter = await page.evaluate(() => {
      const api = (window as unknown as {
        __ASHEN_MARCH__: {
          setDebugMode: (m: string) => void;
          setCellDebug: (b: boolean) => void;
          getCellTelemetry: () => { debugEnabled: boolean; activeCellId: string };
          getAudioDiagnostics: () => { reverb: string; emitters: unknown[] };
        };
      }).__ASHEN_MARCH__;
      api.setDebugMode('albedo');
      api.setDebugMode('final');
      api.setCellDebug(true);
      const debugOn = api.getCellTelemetry().debugEnabled;
      api.setCellDebug(false);
      const debugOff = api.getCellTelemetry().debugEnabled;
      const audio = api.getAudioDiagnostics();
      return { debugOn, debugOff, activeCellId: api.getCellTelemetry().activeCellId, reverb: audio.reverb, emitterCount: audio.emitters.length };
    });
    expect(diagAfter.debugOn).toBe(true);
    expect(diagAfter.debugOff).toBe(false);
    expect(diagAfter.activeCellId).toBe('cell_07_lord_castle');
    expect(diagAfter.reverb).toBe('great_hall_stone');
    expect(diagAfter.emitterCount).toBeGreaterThanOrEqual(10);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.keyboard.press('KeyM');
    await expect(page.getByTestId('modal-map')).toBeVisible();
    await expect(page.getByTestId('modal-map')).toContainText('灰烬城山堡舆图 · Ashenhold V5');
    await page.keyboard.press('KeyM');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('modal-menu')).toBeVisible();
    await expect(page.getByTestId('audio-mixer')).toBeVisible();
    await expect(page.locator('[data-audio-slider]')).toHaveCount(4);
    await page.keyboard.press('Escape');

    expect(errors).toEqual([]);
  });
});
