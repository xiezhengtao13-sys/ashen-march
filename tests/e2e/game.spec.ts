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

  test('loads Ashenhold City (?zone=city), traverses South Gate -> Market Plaza, trades in Market, explores West/East routes, checks Citadel barrier & City Map', async ({
    page,
  }) => {
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
    await page.waitForTimeout(800);

    await expect(page.getByTestId('hud-compass')).toContainText('灰烬城 · 南城门');

    // 1. Walk north continuously through South Gatehouse tunnel into Gateward Main Street
    await page.evaluate(() => {
      const api = (window as unknown as {
        __ASHEN_MARCH__: { teleport: (x: number, y: number, z: number) => void; setLook: (yaw: number, pitch: number) => void };
      }).__ASHEN_MARCH__;
      api.teleport(0, 0.25, 16.5);
      api.setLook(0, 0);
    });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(450);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.keyboard.up('KeyW');

    const streetSnap: Snapshot = await page.evaluate(() =>
      (window as unknown as { __ASHEN_MARCH__: { getSnapshot: () => Snapshot } }).__ASHEN_MARCH__.getSnapshot(),
    );
    expect(streetSnap.zone).toBe('ashenhold_city');
    expect(streetSnap.position.z).toBeLessThan(15.2);

    // 2. Talk to South Gate Captain Marcus
    await page.evaluate(() => {
      const api = (window as unknown as {
        __ASHEN_MARCH__: { teleport: (x: number, y: number, z: number) => void; setLook: (yaw: number, pitch: number) => void };
      }).__ASHEN_MARCH__;
      api.teleport(1.8, 0.2, 20.4);
      api.setLook(-0.55, -0.04);
    });
    await page.waitForTimeout(200);
    await expect(page.getByTestId('hud-interact-prompt')).toContainText('守门队长马库斯');
    await page.keyboard.press('KeyE');
    await expect(page.getByTestId('modal-dialogue')).toBeVisible();
    await page.keyboard.press('Escape');

    // 3. Enter Ember & Flagon Tavern and read Tavern Ledger
    await page.evaluate(() => {
      const api = (window as unknown as {
        __ASHEN_MARCH__: { teleport: (x: number, y: number, z: number) => void; setLook: (yaw: number, pitch: number) => void };
      }).__ASHEN_MARCH__;
      api.teleport(-8.5, 0.42, -13.8);
      api.setLook(1.15, -0.06);
    });
    await page.waitForTimeout(200);
    await expect(page.getByTestId('hud-interact-prompt')).toContainText('余烬酒馆账簿');
    await page.keyboard.press('KeyE');
    await expect(page.getByTestId('modal-lore')).toBeVisible();
    await page.keyboard.press('Escape');

    // 4. Continuous traversal north through Market Gate Arch -> Central Market Plaza
    await page.evaluate(() => {
      const api = (window as unknown as {
        __ASHEN_MARCH__: { teleport: (x: number, y: number, z: number) => void; setLook: (yaw: number, pitch: number) => void };
      }).__ASHEN_MARCH__;
      api.teleport(3.6, 1.5, -26.5);
      api.setLook(-0.04, 0);
    });
    await page.keyboard.down('KeyW');
    for (let k = 0; k < 4; k++) {
      await page.waitForTimeout(280);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    await page.keyboard.up('KeyW');
    const afterArchSnap: Snapshot = await page.evaluate(() =>
      (window as unknown as { __ASHEN_MARCH__: { getSnapshot: () => Snapshot } }).__ASHEN_MARCH__.getSnapshot(),
    );
    expect(afterArchSnap.position.z).toBeLessThan(-32.5);

    // 5. Explore Central Market Plaza & Trade with Baker Marta (real shop & gold deduction)
    await page.evaluate(() => {
      const api = (window as unknown as {
        __ASHEN_MARCH__: { teleport: (x: number, y: number, z: number) => void; setLook: (yaw: number, pitch: number) => void };
      }).__ASHEN_MARCH__;
      api.teleport(-11.0, 2.7, -53.6);
      api.setLook(0.85, -0.02);
    });
    await page.waitForTimeout(200);
    await expect(page.getByTestId('hud-compass')).toContainText('灰烬城 · 中央市集');
    await expect(page.getByTestId('hud-interact-prompt')).toContainText('烘焙娘玛尔塔');
    await page.keyboard.press('KeyE');
    await expect(page.getByTestId('modal-dialogue')).toBeVisible();
    await page.locator('.choice-btn').first().click();
    await expect(page.getByTestId('modal-shop')).toBeVisible();
    const goldBefore = (
      await page.evaluate(() =>
        (window as unknown as { __ASHEN_MARCH__: { getSnapshot: () => Snapshot } }).__ASHEN_MARCH__.getSnapshot(),
      )
    ).stats.gold;
    await page.locator('[data-buy-id="hearth_bread"]').click();
    const goldAfter = (
      await page.evaluate(() =>
        (window as unknown as { __ASHEN_MARCH__: { getSnapshot: () => Snapshot } }).__ASHEN_MARCH__.getSnapshot(),
      )
    ).stats.gold;
    expect(goldAfter).toBe(goldBefore - 12);
    await page.keyboard.press('Escape');

    // 6. Visit West Artisan Quarter (Route A) & East Weavers' Hill Overlook (Route B)
    await page.evaluate(() => {
      const api = (window as unknown as {
        __ASHEN_MARCH__: { teleport: (x: number, y: number, z: number) => void; setLook: (yaw: number, pitch: number) => void };
      }).__ASHEN_MARCH__;
      api.teleport(-42.5, 3.1, -73.0);
      api.setLook(0.75, 0);
    });
    await page.waitForTimeout(180);
    await expect(page.getByTestId('hud-compass')).toContainText('铁匠工坊区');

    await page.evaluate(() => {
      const api = (window as unknown as {
        __ASHEN_MARCH__: { teleport: (x: number, y: number, z: number) => void; setLook: (yaw: number, pitch: number) => void };
      }).__ASHEN_MARCH__;
      api.teleport(47.2, 4.3, -70.2);
      api.setLook(-0.85, 0);
    });
    await page.waitForTimeout(180);
    await expect(page.getByTestId('hud-compass')).toContainText('织坊居民高地');

    // 7. Verify Citadel Barbican Portcullis Barrier (Phase 3 Boundary)
    await page.evaluate(() => {
      const api = (window as unknown as {
        __ASHEN_MARCH__: { teleport: (x: number, y: number, z: number) => void; setLook: (yaw: number, pitch: number) => void };
      }).__ASHEN_MARCH__;
      api.teleport(4.0, 10.1, -166.5);
      api.setLook(0, 0.04);
    });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(350);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.keyboard.up('KeyW');
    const citadelSnap: Snapshot = await page.evaluate(() =>
      (window as unknown as { __ASHEN_MARCH__: { getSnapshot: () => Snapshot } }).__ASHEN_MARCH__.getSnapshot(),
    );
    expect(citadelSnap.position.z).toBeGreaterThan(-170.5);
    await expect(page.getByTestId('hud-compass')).toContainText('城堡大道');

    // 8. Open In-Game Ashenhold Parchment City Map [M]
    await page.keyboard.press('KeyM');
    await expect(page.getByTestId('modal-map')).toBeVisible();
    await expect(page.getByTestId('modal-map')).toContainText('灰烬城舆图');
    await page.keyboard.press('KeyM');

    expect(errors).toEqual([]);
  });
});
