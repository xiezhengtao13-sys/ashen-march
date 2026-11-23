// Usage: node tools/capture.mjs <shots.json> <outDir> [port]
// shots.json: [{ name, zone?, time, pos:[x,y,z], yaw, pitch, width?, height? }]
// Captures real in-game screenshots via headless Chrome (SwiftShader unless GPU is present).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const [shotsFile, outDir, portArg] = process.argv.slice(2);
const port = portArg || '4180';
fs.mkdirSync(outDir, { recursive: true });
const shots = JSON.parse(fs.readFileSync(shotsFile, 'utf8'));

const server = spawn('npx', ['vite', 'preview', '--port', port, '--host', '127.0.0.1', '--strictPort'], {
  stdio: 'pipe',
  detached: true,
});
await new Promise((r) => {
  const t = setTimeout(r, 6000);
  server.stdout.on('data', (d) => {
    if (d.toString().includes(port)) {
      clearTimeout(t);
      r();
    }
  });
});

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(e.message));

const t0 = Date.now();
const initZone = shots[0]?.zone ?? 'city';
await page.goto(`http://127.0.0.1:${port}/?zone=${initZone}`);
try {
  await page.waitForFunction(() => Boolean(window.__ASHEN_MARCH__), null, { timeout: 120000 });
} catch (err) {
  console.error('LOAD TIMEOUT after', Date.now() - t0, 'ms; ERRORS:', JSON.stringify(errors));
  throw err;
}
console.log('BOOT_MS', Date.now() - t0);
await page.waitForTimeout(800);

const raf = (n) =>
  page.evaluate(
    (n) => new Promise((res) => {
      let c = 0;
      const step = () => (++c >= n ? res() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    }),
    n,
  );

for (const s of shots) {
  if (s.width && s.height) {
    await page.setViewportSize({ width: s.width, height: s.height });
  }
  await page.evaluate((s) => {
    const api = window.__ASHEN_MARCH__;
    if (s.time !== undefined) api.setTimeOfDay(s.time);
    api.teleport(...s.pos);
    api.setLook(s.yaw, s.pitch);
  }, s);
  if (s.pressKey) {
    await page.keyboard.press(s.pressKey);
    await page.waitForTimeout(200);
  }
  await raf(3);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${outDir}/${s.name}.png`, timeout: 90000 });
  if (s.pressKey) {
    await page.keyboard.press(s.pressKey);
    await page.waitForTimeout(100);
  }
  const tel = await page.evaluate(() => window.__ASHEN_MARCH__.getTelemetry?.());
  console.log('shot', s.name, tel ? JSON.stringify(tel) : '');
}

console.log('ERRORS', JSON.stringify(errors));
await browser.close();
try {
  process.kill(-server.pid, 'SIGKILL');
} catch {
  server.kill('SIGKILL');
}
process.exit(errors.length > 0 ? 1 : 0);
