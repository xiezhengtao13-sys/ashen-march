import * as THREE from 'three';
import { EnemySystem } from './ai/EnemyAI';
import { CombatSystem } from './combat/CombatSystem';
import { GameState } from './core/GameState';
import type { Vec3, ZoneId } from './core/types';
import worldConfig from './data/worldConfig.json';
import { DialogueSystem } from './dialogue/DialogueSystem';
import { AudioSystem } from './engine/AudioSystem';
import { MaterialLibrary } from './engine/MaterialLibrary';
import { ParticleSystem } from './engine/ParticleSystem';
import { PhysicsWorld } from './engine/PhysicsWorld';
import { QualityManager, type QualityPreset } from './engine/QualityManager';
import { SceneEngine } from './engine/SceneEngine';
import { InventorySystem } from './inventory/InventorySystem';
import { NPCSystem } from './npc/NPCSystem';
import { PlayerController } from './player/PlayerController';
import { QuestSystem } from './quests/QuestSystem';
import { applySavePayloadToState, SaveSystem } from './save/SaveSystem';
import { UIManager } from './ui/UIManager';
import { DayNightCycle } from './world/DayNightCycle';
import { buildAncientCrypt } from './world/DungeonBuilder';
import { InteractableRegistry } from './world/InteractableRegistry';
import { getRegionAt, getRegionDisplayName, getTerrainHeight } from './world/TerrainGenerator';
import { buildOverworld } from './world/WorldBuilder';
import { WorldSpawner } from './world/WorldSpawner';
import type { VegetationController } from './world/VegetationBuilder';

export class GameApp {
  readonly state = new GameState();
  readonly engine: SceneEngine;
  readonly materials = new MaterialLibrary();
  readonly quality = new QualityManager();
  readonly physics = new PhysicsWorld();
  readonly dayNight: DayNightCycle;
  readonly particles: ParticleSystem;
  readonly audio = new AudioSystem();
  readonly registry = new InteractableRegistry();
  readonly inventory: InventorySystem;
  readonly enemies: EnemySystem;
  readonly combat: CombatSystem;
  readonly npcs = new NPCSystem();
  readonly quests: QuestSystem;
  readonly dialogue: DialogueSystem;
  readonly saveSystem = new SaveSystem();
  readonly spawner: WorldSpawner;
  readonly player: PlayerController;
  readonly ui: UIManager;

  private readonly clock = new THREE.Clock();
  private overworldUpdate: (elapsed: number, dt?: number) => void = () => {};
  private cryptUpdate: (elapsed: number) => void = () => {};
  private vegetation: VegetationController | null = null;
  private activeInteractable: ReturnType<InteractableRegistry['findBestInteractable']> = null;
  private rafId = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.engine = new SceneEngine(canvas);
    this.dayNight = new DayNightCycle(this.engine.scene);
    this.particles = new ParticleSystem(this.engine.scene);

    this.inventory = new InventorySystem(this.state);
    this.enemies = new EnemySystem(this.state, this.inventory);
    this.quests = new QuestSystem(this.state, this.inventory);
    this.dialogue = new DialogueSystem(this.state, this.quests, this.inventory);
    this.spawner = new WorldSpawner(this.state, this.inventory, this.registry);

    this.inventory.setDropSpawner((itemDef, qty) => {
      const look = this.player.getLookDirection();
      const dropPos: Vec3 = {
        x: this.state.player.position.x + look.x * 1.4,
        y: this.state.player.position.y,
        z: this.state.player.position.z + look.z * 1.4,
      };
      this.spawner.spawnDroppedItem(
        itemDef,
        qty,
        dropPos,
        this.state.player.currentZone,
        this.engine.overworldGroup,
        this.engine.cryptGroup,
      );
    });

    this.combat = new CombatSystem(this.state, this.inventory, this.enemies, this.engine.scene, this.physics, {
      onSwingVisual: () => {
        this.player.playSwingAnimation();
        this.audio.playSwordSwing();
      },
      onCastVisual: () => {
        this.player.playCastAnimation();
        this.audio.playFireballCast();
      },
      onHitEffect: (pos, _damage, isMagic) => {
        this.particles.spawnBurst(pos, isMagic ? 0xff7b29 : 0xe05252, 12, 4.0, 0.45);
        this.audio.playHit(isMagic);
      },
      onExplosionEffect: (pos) => {
        this.particles.spawnBurst(pos, 0xff5a1f, 22, 6.2, 0.65);
        this.audio.playExplosion();
      },
      onPlayerDamaged: () => {
        this.ui.flashDamage();
        this.audio.playPlayerHurt();
      },
      onPlayerRespawn: () => {
        this.applyZoneVisibility('overworld');
        this.player.syncCameraFromState();
      },
    });

    this.ui = new UIManager(uiRoot, this.state, this.inventory, this.quests, this.dialogue, this.npcs, {
      onRespawn: () => this.combat.respawnPlayer(),
      onSaveSlot: async (slotId) => {
        await this.saveSystem.saveSlot(slotId, this.state, getRegionDisplayName(this.state.player.currentRegion));
        this.ui.pushToast(`已保存至槽位 ${slotId}`, 'quest');
      },
      onLoadSlot: async (slotId) => {
        await this.loadFromSlot(slotId);
      },
      onDeleteSlot: async (slotId) => {
        await this.saveSystem.deleteSlot(slotId);
        this.ui.pushToast(`已删除存档 ${slotId}`, 'info');
      },
      listSaveSlots: () => this.saveSystem.listSlots(),
      onToggleMute: () => this.audio.toggleMute(),
      onReleasePointerLock: () => this.player.releasePointerLock(),
      onEquipmentChanged: () => this.player.setEquippedWeapon(this.state.equipped.weapon),
      onQuickPotion: (kind) => this.useQuickPotion(kind),
      onSetQuality: (preset) => this.setQualityPreset(preset),
      getQualityPreset: () => this.quality.getPreset(),
      getTelemetry: () => this.quality.getTelemetry(this.engine.renderer),
    });

    this.player = new PlayerController(this.engine.camera, this.physics, this.state, canvas, {
      onInteract: () => {
        this.activeInteractable?.onInteract();
      },
      onMeleeAttack: () => {
        this.combat.performMeleeAttack(this.physics.getPlayerEyePosition(), this.player.getLookDirection());
      },
      onCastSpell: () => {
        this.combat.castFireball(this.physics.getPlayerEyePosition(), this.player.getLookDirection());
      },
      onQuickPotion: (kind) => this.useQuickPotion(kind),
      onToggleUI: (panel) => {
        if (panel === 'menu' && this.ui.isModalOpen()) {
          this.ui.closeModal();
          this.player.clearInputs();
          return;
        }
        this.player.clearInputs();
        this.ui.togglePanel(panel);
      },
      isModalOpen: () => this.ui.isModalOpen(),
    });

    this.bindAudioEvents();
  }

  private bindAudioEvents(): void {
    this.state.events.on('item:collected', () => this.audio.playLoot());
    this.state.events.on('player:leveled_up', () => {
      this.audio.playLevelUp();
      this.particles.spawnBurst(
        {
          x: this.state.player.position.x,
          y: this.state.player.position.y + 1.2,
          z: this.state.player.position.z,
        },
        0xf2cf88,
        24,
        5.0,
        0.9,
      );
    });
    this.state.events.on('quest:updated', ({ status }) => {
      if (status === 'completed') this.audio.playQuestComplete();
    });
  }

  async start(): Promise<void> {
    await this.physics.init(this.state.player.position);

    const overworldBuilt = buildOverworld(
      this.engine.overworldGroup,
      this.physics,
      this.registry,
      {
        onEnterCrypt: () => this.enterCrypt(),
        onLoreRead: (title, body) => this.ui.openLore(title, body),
      },
      this.materials,
    );
    this.overworldUpdate = overworldBuilt.update;
    this.vegetation = overworldBuilt.vegetation;

    const cryptBuilt = buildAncientCrypt(
      this.engine.cryptGroup,
      this.physics,
      this.registry,
      {
        onExitCrypt: () => this.exitCrypt(),
      },
      this.materials,
    );
    this.cryptUpdate = cryptBuilt.update;

    this.npcs.spawnAll(this.engine.overworldGroup, this.physics, this.registry, (npcId) => {
      this.player.clearInputs();
      this.ui.openDialogue(npcId);
    });

    this.spawner.spawnConfiguredProps(this.engine.overworldGroup, this.engine.cryptGroup, (pos) => {
      this.particles.spawnBurst({ x: pos.x, y: pos.y + 0.5, z: pos.z }, 0xf2cf88, 12, 3.5, 0.5);
    });

    this.enemies.spawnAll(this.engine.overworldGroup, this.engine.cryptGroup);

    this.applyZoneVisibility(this.state.player.currentZone);
    this.physics.teleportPlayer(this.state.player.position);
    this.player.syncCameraFromState();
    this.setQualityPreset('high');
    this.dayNight.update(0, this.state, this.quality.getConfig().fogMultiplier);

    this.ui.pushToast('欢迎来到灰烬边境！按 [E] 与溪谷村长老对话开启冒险。', 'quest');
    this.exposeDebugBridge();
    this.loop();
  }

  setQualityPreset(preset: QualityPreset): void {
    this.quality.applyPreset(
      preset,
      this.engine.renderer,
      this.engine.camera,
      this.dayNight.sunLight,
      (density) => this.vegetation?.setDensity(density),
    );
  }

  useQuickPotion(kind: 'health' | 'mana'): void {
    if (this.state.isDead || this.ui.isModalOpen()) return;
    if (kind === 'health') {
      if (this.inventory.hasItem('minor_health_potion', 1)) {
        this.inventory.useItem('minor_health_potion');
      } else if (this.inventory.hasItem('greater_health_potion', 1)) {
        this.inventory.useItem('greater_health_potion');
      } else {
        this.ui.pushToast('背包中没有治疗药水', 'warning');
      }
    } else {
      if (this.inventory.hasItem('mana_potion', 1)) {
        this.inventory.useItem('mana_potion');
      } else {
        this.ui.pushToast('背包中没有法力药水', 'warning');
      }
    }
    this.ui.refreshHUD();
  }

  private applyZoneVisibility(zone: ZoneId): void {
    this.engine.overworldGroup.visible = zone === 'overworld';
    this.engine.cryptGroup.visible = zone === 'ancient_crypt';
  }

  enterCrypt(): void {
    const target = worldConfig.portals.cryptEntrance.targetPosition;
    this.switchZone('ancient_crypt', target, worldConfig.portals.cryptEntrance.targetYaw);
    this.state.markLocationDiscovered('ancient_crypt', '古代墓穴');
    this.state.setFlag('entered_crypt', true);
    this.ui.pushToast('已进入地下城：【古代墓穴】', 'quest');
  }

  exitCrypt(): void {
    const p = worldConfig.portals.cryptExit.targetPosition;
    const y = getTerrainHeight(p.x, p.z) + 0.25;
    this.switchZone('overworld', { x: p.x, y, z: p.z }, worldConfig.portals.cryptExit.targetYaw);
    this.ui.pushToast('已返回灰烬边境地面', 'info');
  }

  switchZone(to: ZoneId, pos: Vec3, yaw: number): void {
    const from = this.state.player.currentZone;
    this.state.player.currentZone = to;
    this.state.player.position = { ...pos };
    this.state.player.yaw = yaw;
    this.state.player.pitch = 0;

    this.applyZoneVisibility(to);
    this.physics.teleportPlayer(pos);
    this.player.syncCameraFromState();
    this.state.events.emit('zone:changed', { from, to });
  }

  async loadFromSlot(slotId: string): Promise<boolean> {
    const payload = await this.saveSystem.loadSlot(slotId);
    if (!payload) {
      this.ui.pushToast(`未找到存档 ${slotId}`, 'warning');
      return false;
    }

    applySavePayloadToState(payload, this.state);
    this.applyZoneVisibility(this.state.player.currentZone);
    this.physics.teleportPlayer(this.state.player.position);
    this.player.syncCameraFromState();
    this.spawner.syncFromState();
    this.enemies.applySavedDefeatedIds();
    this.player.setEquippedWeapon(this.state.equipped.weapon);
    this.ui.refreshHUD();
    this.ui.pushToast(`已读取存档：${slotId}`, 'quest');
    return true;
  }

  private loop = (): void => {
    this.rafId = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;
    this.quality.recordFrame(dt);

    this.player.update(dt);
    this.dayNight.update(dt, this.state, this.quality.getConfig().fogMultiplier);

    if (this.state.player.currentZone === 'overworld') {
      this.overworldUpdate(elapsed, dt);
      const region = getRegionAt(this.state.player.position.x, this.state.player.position.z);
      if (region !== this.state.player.currentRegion) {
        this.state.player.currentRegion = region;
        this.state.markLocationDiscovered(region, getRegionDisplayName(region));
      }
    } else {
      this.cryptUpdate(elapsed);
      this.state.player.currentRegion = 'ancient_crypt';
    }

    this.npcs.update(elapsed);
    this.enemies.update(
      dt,
      this.state.player.position,
      this.state.player.currentZone,
      this.state.isPaused || this.state.isDead,
      (hit) => this.combat.applyDamageToPlayer(hit.damage, hit.enemyName),
    );
    this.combat.update(dt);
    this.particles.update(dt);

    this.activeInteractable = this.registry.findBestInteractable(
      this.physics.getPlayerEyePosition(),
      this.player.getLookDirection(),
      this.state.player.currentZone,
    );
    this.ui.setInteractPrompt(this.activeInteractable?.label ?? null);
    this.ui.refreshHUD();

    this.engine.render();
  };

  private exposeDebugBridge(): void {
    (window as unknown as Record<string, unknown>).__ASHEN_MARCH__ = {
      getSnapshot: () => ({
        position: { ...this.state.player.position },
        yaw: this.state.player.yaw,
        pitch: this.state.player.pitch,
        zone: this.state.player.currentZone,
        region: this.state.player.currentRegion,
        stats: { ...this.state.player.stats },
        computedStats: this.inventory.getComputedStats(),
        inventory: [...this.state.inventory],
        equipped: { ...this.state.equipped },
        quests: JSON.parse(JSON.stringify(this.state.quests)),
        discoveredLocations: [...this.state.world.discoveredLocations],
        activeModal: this.ui.getActiveModal(),
        activePrompt: this.activeInteractable?.id ?? null,
      }),
      teleport: (x: number, y: number, z: number, zone?: ZoneId) => {
        if (zone && zone !== this.state.player.currentZone) {
          this.switchZone(zone, { x, y, z }, this.state.player.yaw);
        } else {
          this.state.player.position = { x, y, z };
          this.physics.teleportPlayer({ x, y, z });
          this.player.syncCameraFromState();
        }
        this.activeInteractable = this.registry.findBestInteractable(
          this.physics.getPlayerEyePosition(),
          this.player.getLookDirection(),
          this.state.player.currentZone,
        );
        this.ui.setInteractPrompt(this.activeInteractable?.label ?? null);
      },
      setLook: (yaw: number, pitch: number) => {
        this.player.setLook(yaw, pitch);
        this.activeInteractable = this.registry.findBestInteractable(
          this.physics.getPlayerEyePosition(),
          this.player.getLookDirection(),
          this.state.player.currentZone,
        );
        this.ui.setInteractPrompt(this.activeInteractable?.label ?? null);
      },
      interact: (id?: string) => {
        if (id) {
          this.registry.get(id)?.onInteract();
        } else {
          this.activeInteractable?.onInteract();
        }
      },
      melee: () =>
        this.combat.performMeleeAttack(this.physics.getPlayerEyePosition(), this.player.getLookDirection()),
      fireball: () =>
        this.combat.castFireball(this.physics.getPlayerEyePosition(), this.player.getLookDirection()),
      save: (slotId: string) =>
        this.saveSystem.saveSlot(slotId, this.state, getRegionDisplayName(this.state.player.currentRegion)),
      load: (slotId: string) => this.loadFromSlot(slotId),
      setQuality: (preset: QualityPreset) => this.setQualityPreset(preset),
      getTelemetry: () => this.quality.getTelemetry(this.engine.renderer),
    };
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.player.dispose();
    this.physics.dispose();
    this.engine.dispose();
  }
}
