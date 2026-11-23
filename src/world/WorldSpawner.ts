import * as THREE from 'three';
import type { GameState } from '../core/GameState';
import type { ItemDefinition, Vec3, ZoneId } from '../core/types';
import worldConfig from '../data/worldConfig.json';
import type { InventorySystem } from '../inventory/InventorySystem';
import type { InteractableRegistry } from './InteractableRegistry';
import { createChestMesh, createPickupMesh } from './PropFactory';
import { getTerrainHeight } from './TerrainGenerator';

interface ChestEntry {
  id: string;
  mesh: THREE.Group;
  name: string;
}

interface PickupEntry {
  id: string;
  mesh: THREE.Group;
}

export class WorldSpawner {
  private readonly chests: ChestEntry[] = [];
  private readonly pickups: PickupEntry[] = [];
  private dropCounter = 0;

  private readonly state: GameState;
  private readonly inventory: InventorySystem;
  private readonly registry: InteractableRegistry;

  constructor(state: GameState, inventory: InventorySystem, registry: InteractableRegistry) {
    this.state = state;
    this.inventory = inventory;
    this.registry = registry;
  }

  spawnConfiguredProps(
    overworldGroup: THREE.Group,
    cryptGroup: THREE.Group,
    onLootEffect?: (pos: Vec3) => void,
  ): void {
    // 1. Chests
    for (const c of worldConfig.chests) {
      const zone = c.zone as ZoneId;
      const parent = zone === 'ancient_crypt' ? cryptGroup : overworldGroup;
      const y = zone === 'overworld' && c.position.y === 0 ? getTerrainHeight(c.position.x, c.position.z) : c.position.y;
      const pos: Vec3 = { x: c.position.x, y, z: c.position.z };

      const mesh = createChestMesh(
        parent,
        c.id,
        c.name,
        zone,
        pos,
        this.state,
        this.registry,
        () => {
          if (this.state.isChestOpened(c.id)) return;
          const reqEnemy = (c as { requiresDefeatedEnemyId?: string }).requiresDefeatedEnemyId;
          if (reqEnemy && !this.state.isEnemyDefeated(reqEnemy)) {
            this.state.events.emit('hud:notify', {
              text: '圣物祭坛被亡灵封印，请先击败墓穴守卫·阿卡索尔！',
              kind: 'warning',
            });
            return;
          }

          this.state.markChestOpened(c.id);
          const lid = mesh.getObjectByName('ChestLid');
          if (lid) {
            lid.rotation.x = -0.88;
          }
          this.registry.setEnabled(`chest:${c.id}`, false);
          this.registry.setLabel(`chest:${c.id}`, `${c.name} (已开启)`);

          if (c.gold > 0) {
            this.state.player.stats.gold += c.gold;
            this.state.events.emit('hud:notify', { text: `从 ${c.name} 获得 ${c.gold} 金币`, kind: 'loot' });
          }
          for (const item of c.items) {
            this.inventory.addItem(item.itemId, item.quantity, c.id);
          }
          onLootEffect?.(pos);
        },
        c.id === 'crypt_relic_chest' || c.id === 'chest_hidden_shrine',
      );

      this.chests.push({ id: c.id, mesh, name: c.name });
    }

    // 2. Pickups
    for (const p of worldConfig.pickups) {
      const zone = p.zone as ZoneId;
      const parent = zone === 'ancient_crypt' ? cryptGroup : overworldGroup;
      const y = zone === 'overworld' && p.position.y === 0 ? getTerrainHeight(p.position.x, p.position.z) : p.position.y;
      const pos: Vec3 = { x: p.position.x, y, z: p.position.z };
      const def = this.inventory.getItemDef(p.itemId);
      const kind = p.itemId === 'ashen_herb' ? 'herb' : p.itemId === 'watchers_journal' ? 'journal' : 'pouch';

      const mesh = createPickupMesh(
        parent,
        p.id,
        p.label,
        zone,
        pos,
        def?.color ?? '#d9b166',
        this.state.isPickupCollected(p.id),
        this.registry,
        () => {
          if (this.state.isPickupCollected(p.id)) return;
          this.state.markPickupCollected(p.id);
          mesh.visible = false;
          this.registry.setEnabled(`pickup:${p.id}`, false);
          this.inventory.addItem(p.itemId, p.quantity, p.id);
          onLootEffect?.(pos);
        },
        kind,
      );

      this.pickups.push({ id: p.id, mesh });
    }
  }

  spawnDroppedItem(
    itemDef: ItemDefinition,
    quantity: number,
    pos: Vec3,
    zone: ZoneId,
    overworldGroup: THREE.Group,
    cryptGroup: THREE.Group,
  ): void {
    const id = `drop_${++this.dropCounter}`;
    const parent = zone === 'ancient_crypt' ? cryptGroup : overworldGroup;
    const y = zone === 'overworld' ? getTerrainHeight(pos.x, pos.z) : -500;
    const dropPos: Vec3 = { x: pos.x, y, z: pos.z };

    const mesh = createPickupMesh(
      parent,
      id,
      itemDef.name,
      zone,
      dropPos,
      itemDef.color,
      false,
      this.registry,
      () => {
        mesh.visible = false;
        parent.remove(mesh);
        this.registry.remove(`pickup:${id}`);
        this.inventory.addItem(itemDef.id, quantity, id);
      },
      'pouch',
    );
  }

  syncFromState(): void {
    for (const c of this.chests) {
      const opened = this.state.isChestOpened(c.id);
      this.registry.setEnabled(`chest:${c.id}`, !opened);
      this.registry.setLabel(`chest:${c.id}`, opened ? `${c.name} (已开启)` : `开启 ${c.name}`);
      const lid = c.mesh.getObjectByName('ChestLid');
      if (lid) {
        lid.rotation.x = opened ? -0.88 : 0;
      }
    }

    for (const p of this.pickups) {
      const collected = this.state.isPickupCollected(p.id);
      p.mesh.visible = !collected;
      this.registry.setEnabled(`pickup:${p.id}`, !collected);
    }
  }
}
