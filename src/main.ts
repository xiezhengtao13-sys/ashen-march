import * as THREE from 'three';
import { GameState } from './core/GameState';
import './style.css';

function bootstrapStage0(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui-root');
  if (!canvas || !uiRoot) return;

  const state = new GameState();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x88a2bc);
  scene.fog = new THREE.FogExp2(0x88a2bc, 0.008);

  const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / Math.max(1, window.innerHeight),
    0.1,
    600,
  );
  camera.position.set(state.player.position.x, state.player.position.y + 1.65, state.player.position.z);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const hemi = new THREE.HemisphereLight(0xdbe8f5, 0x3b3528, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d6, 1.3);
  sun.position.set(60, 90, 40);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(512, 512, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0x4f6342, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 4;
  scene.add(ground);

  const banner = document.createElement('div');
  banner.className = 'hud-banner';
  banner.textContent = 'Ashen March — 灰烬边境 | 溪谷村 (Stage 0 Init)';
  uiRoot.appendChild(banner);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const animate = (): void => {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  };
  animate();
}

bootstrapStage0();
