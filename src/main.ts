import * as THREE from 'three';
import { GameState } from './core/GameState';
import { PhysicsWorld } from './engine/PhysicsWorld';
import { SceneEngine } from './engine/SceneEngine';
import { PlayerController } from './player/PlayerController';
import { InteractableRegistry } from './world/InteractableRegistry';
import { getRegionAt, getRegionDisplayName } from './world/TerrainGenerator';
import { buildOverworld } from './world/WorldBuilder';
import './style.css';

async function bootstrapStage1(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui-root');
  if (!canvas || !uiRoot) return;

  const state = new GameState();
  const engine = new SceneEngine(canvas);
  const physics = new PhysicsWorld();
  await physics.init(state.player.position);

  const registry = new InteractableRegistry();

  const hemi = new THREE.HemisphereLight(0xdbe8f5, 0x3b3528, 0.75);
  engine.scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d6, 1.4);
  sun.position.set(70, 110, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 320;
  const d = 140;
  sun.shadow.camera.left = -d;
  sun.shadow.camera.right = d;
  sun.shadow.camera.top = d;
  sun.shadow.camera.bottom = -d;
  engine.scene.add(sun);

  const banner = document.createElement('div');
  banner.className = 'hud-banner';
  banner.textContent = 'Ashen March — 灰烬边境 | 溪谷村';
  uiRoot.appendChild(banner);

  const promptEl = document.createElement('div');
  promptEl.className = 'hud-banner';
  promptEl.style.top = 'auto';
  promptEl.style.bottom = '110px';
  promptEl.style.display = 'none';
  uiRoot.appendChild(promptEl);

  const builtWorld = buildOverworld(engine.overworldGroup, physics, registry, {
    onEnterCrypt: () => {
      banner.textContent = '古代墓穴入口（将在 Stage 4 开放地下城）';
    },
    onLoreRead: (title) => {
      banner.textContent = `已阅读：${title}`;
    },
  });

  let activePromptTarget: ReturnType<InteractableRegistry['findBestInteractable']> = null;

  const player = new PlayerController(engine.camera, physics, state, canvas, {
    onInteract: () => {
      activePromptTarget?.onInteract();
    },
    onMeleeAttack: () => player.playSwingAnimation(),
    onCastSpell: () => player.playCastAnimation(),
    onToggleUI: () => {},
    isModalOpen: () => false,
  });

  const clock = new THREE.Clock();
  const loop = (): void => {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;

    player.update(dt);
    builtWorld.update(elapsed);

    const region = getRegionAt(state.player.position.x, state.player.position.z);
    if (region !== state.player.currentRegion) {
      state.player.currentRegion = region;
      state.markLocationDiscovered(region, getRegionDisplayName(region));
    }
    banner.textContent = `灰烬边境 | ${getRegionDisplayName(region)} (${state.player.position.x.toFixed(0)}, ${state.player.position.z.toFixed(0)})`;

    activePromptTarget = registry.findBestInteractable(
      physics.getPlayerEyePosition(),
      player.getLookDirection(),
      state.player.currentZone,
    );
    if (activePromptTarget) {
      promptEl.style.display = 'block';
      promptEl.textContent = `[E] ${activePromptTarget.label}`;
    } else {
      promptEl.style.display = 'none';
    }

    engine.render();
  };
  loop();
}

void bootstrapStage1();
