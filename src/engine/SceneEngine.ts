import * as THREE from 'three';

export class SceneEngine {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly overworldGroup: THREE.Group;
  readonly cryptGroup: THREE.Group;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x88a8c7);
    this.scene.fog = new THREE.FogExp2(0x88a8c7, 0.0046);

    this.camera = new THREE.PerspectiveCamera(
      68,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.12,
      500,
    );
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.overworldGroup = new THREE.Group();
    this.overworldGroup.name = 'OverworldGroup';
    this.scene.add(this.overworldGroup);

    this.cryptGroup = new THREE.Group();
    this.cryptGroup.name = 'AncientCryptGroup';
    this.cryptGroup.visible = false;
    this.scene.add(this.cryptGroup);

    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = (): void => {
    this.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
  }
}
