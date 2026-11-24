import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AmbientAudioManager } from '../../src/audio/AmbientAudioManager';
import { FootstepAudioSystem } from '../../src/audio/FootstepAudioSystem';
import { GameState } from '../../src/core/GameState';
import cityConfig from '../../src/data/cityPhase1Config.json';
import npcsData from '../../src/data/npcs.json';
import questsData from '../../src/data/quests.json';
import { PhysicsWorld } from '../../src/engine/PhysicsWorld';
import { InventorySystem } from '../../src/inventory/InventorySystem';
import { QuestSystem } from '../../src/quests/QuestSystem';
import { getCityGroundHeight } from '../../src/world/city/CityGroundBuilder';
import { buildAshenholdCity, getCityRegionAt } from '../../src/world/city/CityPhase1Builder';
import { CityPortalVisibility } from '../../src/world/city/CityPortalVisibility';
import { InteractableRegistry } from '../../src/world/InteractableRegistry';

/**
 * Walks the Rapier player capsule smoothly along a sequence of (tx, tz) waypoints
 * without teleporting, returning the final feet position.
 */
function walkWaypoints(
  physics: PhysicsWorld,
  waypoints: Array<[number, number]>,
  maxStepsPerLeg = 360,
  stepSize = 0.11,
): { x: number; y: number; z: number } {
  let pos = physics.getPlayerFeetPosition();
  for (const [tx, tz] of waypoints) {
    for (let i = 0; i < maxStepsPerLeg; i++) {
      const dx = tx - pos.x;
      const dz = tz - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.28) break;
      const s = Math.min(stepSize, dist);
      pos = physics.movePlayer({ x: (dx / dist) * s, y: 0, z: (dz / dist) * s }, false, 1 / 60).position;
    }
  }
  return pos;
}

describe('Ashenhold V5 Interconnected 8-Cell City, Portal Visibility, Spatial Audio & Full Rapier Loops', () => {
  it('enforces 8-cell portal culling, bent-axis short sightlines, hysteresis, vista mode, and acoustic occlusion', () => {
    const pv = new CityPortalVisibility();
    expect(pv.cells.length).toBe(8);
    expect(pv.portals.length).toBeGreaterThanOrEqual(20);

    const dbgParent = new THREE.Group();
    const dbgGroup = pv.attachDebugGroup(dbgParent);
    expect(dbgGroup.visible).toBe(false);
    pv.setDebugEnabled(true);
    expect(dbgGroup.visible).toBe(true);

    // 1. Standing at Outer Barbican Spawn (-6.2, 0.35, 34.8) looking North:
    //    Bent-axis Outer Gate & Traverse Wall prevent seeing Market (Cell 03), Temple (Cell 06), or Castle (Cell 07)!
    const atOuterGate = pv.evaluate({ x: -6.2, y: 0.35, z: 34.8 }, { x: 0, y: 0, z: -1 });
    expect(atOuterGate.activeCellId).toBe('cell_01_barbican_gate');
    expect(atOuterGate.visibleCellIds.has('cell_01_barbican_gate')).toBe(true);
    expect(atOuterGate.visibleCellIds.has('cell_03_market_plaza')).toBe(false);
    expect(atOuterGate.visibleCellIds.has('cell_06_temple_acropolis')).toBe(false);
    expect(atOuterGate.visibleCellIds.has('cell_07_lord_castle')).toBe(false);

    // 2. Hysteresis prevents cell-ID thrashing across the Cell 01 / Cell 02 border at z = 9.0 (±0.75m band)
    const inCell01 = pv.evaluate({ x: 0, y: 0.2, z: 10.2 }, { x: 0, y: 0, z: -1 });
    expect(inCell01.activeCellId).toBe('cell_01_barbican_gate');
    const stepJustAcross = pv.evaluate({ x: 0, y: 0.2, z: 8.4 }, { x: 0, y: 0, z: -1 });
    expect(stepJustAcross.activeCellId).toBe('cell_01_barbican_gate'); // Held by hysteresis band!
    const deepInCell02 = pv.evaluate({ x: 0, y: 0.4, z: 5.0 }, { x: 0, y: 0, z: -1 });
    expect(deepInCell02.activeCellId).toBe('cell_02_trade_street');
    const stepSlightlySouth = pv.evaluate({ x: 0, y: 0.25, z: 9.6 }, { x: 0, y: 0, z: 1 });
    expect(stepSlightlySouth.activeCellId).toBe('cell_02_trade_street'); // Held in Cell 02 without oscillating!

    // 3. Deep in Cell 08 Undercroft (-4.0m) away from stair mouths: surface cells are culled
    const inDeepVault = pv.evaluate({ x: 2.0, y: -4.0, z: -70.0 }, { x: 0, y: 0, z: -1 });
    expect(inDeepVault.activeCellId).toBe('cell_08_undercroft_cellars');
    expect(inDeepVault.visibleCellIds.size).toBe(1);

    // 4. High Overlook atop Cell 06 Bell Tower (+24.2m) activates city-wide vista silhouettes
    const atopBelfry = pv.evaluate({ x: -22.1, y: 24.2, z: -92.8 }, { x: 0.3, y: -0.2, z: 0.9 });
    expect(atopBelfry.activeCellId).toBe('cell_06_temple_acropolis');
    expect(atopBelfry.isOverlookActive).toBe(true);
    expect(atopBelfry.vistaCellIds.has('cell_07_lord_castle')).toBe(true);
    expect(atopBelfry.vistaCellIds.has('cell_03_market_plaza')).toBe(true);

    // 5. Portal-aware acoustic wall occlusion: Forge Anvil (-33.5, 8.0, -34.8 in Cell 04)
    const anvilPos = { x: -33.5, y: 8.0, z: -34.8 };
    const occInsideForge = pv.computeAcousticOcclusion('cell_04_artisan_quarter', { x: -30.0, y: 7.1, z: -34.8 }, 'cell_04_artisan_quarter', anvilPos);
    const occFromMarket = pv.computeAcousticOcclusion('cell_03_market_plaza', { x: -5.0, y: 3.5, z: -35.2 }, 'cell_04_artisan_quarter', anvilPos);
    const occFromEastRes = pv.computeAcousticOcclusion('cell_05_residential_heights', { x: 30.0, y: 7.5, z: -35.2 }, 'cell_04_artisan_quarter', anvilPos);
    expect(occInsideForge).toBe(0);
    expect(occFromMarket).toBeGreaterThan(0.1);
    expect(occFromEastRes).toBeGreaterThan(0.85);

    pv.setDebugEnabled(false);
    expect(dbgGroup.visible).toBe(false);
    pv.dispose();
  });

  it('classifies all 6 footstep surfaces and switches ambient audio + interior reverb overrides cleanly', () => {
    const ambient = new AmbientAudioManager();
    const footsteps = new FootstepAudioSystem(ambient);

    expect(footsteps.classifySurface('ashenhold_city', { x: 0.0, y: 3.5, z: -30.0 })).toBe('stone_flagstone');
    expect(footsteps.classifySurface('ashenhold_city', { x: -20.0, y: 5.2, z: -35.2 })).toBe('stone_stair');
    expect(footsteps.classifySurface('ashenhold_city', { x: 11.5, y: 1.6, z: -3.2 })).toBe('wood_plank');
    expect(footsteps.classifySurface('ashenhold_city', { x: 0.0, y: 3.9, z: -35.0 })).toBe('shallow_water');
    expect(footsteps.classifySurface('ashenhold_city', { x: -12.5, y: -4.0, z: -15.0 })).toBe('shallow_water');
    expect(footsteps.classifySurface('overworld', { x: 0.0, y: 5.0, z: 58.0 })).toBe('dirt');
    expect(footsteps.classifySurface('overworld', { x: 24.0, y: 5.0, z: 58.0 })).toBe('grass');

    ambient.setVolume('ambient', 0.62);
    ambient.setVolume('sfx', 0.74);
    expect(ambient.getVolumes().ambient).toBeCloseTo(0.62, 2);
    expect(ambient.getVolumes().sfx).toBeCloseTo(0.74, 2);

    // Outdoor Market -> Timber Tavern -> Cathedral Stone -> Sovereign Great Hall -> Damp Undercroft
    ambient.update(0.1, 'ashenhold_city', 'amb_market_plaza', 'outdoor_courtyard', { x: 5.0, y: 3.5, z: -35.0 }, 13.0);
    expect(ambient.getActiveZoneId()).toBe('amb_market_plaza');
    expect(ambient.getActiveReverb()).toBe('outdoor_courtyard');

    ambient.update(0.1, 'ashenhold_city', 'amb_trade_street', 'outdoor_alley', { x: 11.5, y: 1.6, z: -3.2 }, 13.0);
    expect(ambient.getActiveZoneId()).toBe('amb_tavern_interior');
    expect(ambient.getActiveReverb()).toBe('timber_tavern');

    ambient.update(0.1, 'ashenhold_city', 'amb_temple_acropolis', 'outdoor_courtyard', { x: -11.7, y: 12.3, z: -86.8 }, 13.0);
    expect(ambient.getActiveReverb()).toBe('cathedral_stone');

    ambient.update(0.1, 'ashenhold_city', 'amb_lord_castle', 'outdoor_courtyard', { x: 0.0, y: 21.1, z: -135.0 }, 13.0);
    expect(ambient.getActiveReverb()).toBe('great_hall_stone');

    ambient.update(0.1, 'ashenhold_city', 'amb_undercroft', 'damp_undercroft_tunnel', { x: -12.1, y: -4.0, z: -15.0 }, 13.0);
    expect(ambient.getActiveReverb()).toBe('damp_undercroft_tunnel');
  });

  it('registers V5 multi-cell quest side_city_citadel_accord and living city NPCs across all districts', () => {
    const cityNpcs = npcsData.npcs.filter((n) => n.zone === 'ashenhold_city');
    expect(cityNpcs.length).toBeGreaterThanOrEqual(15);
    const movingNpcs = cityNpcs.filter((n) => Array.isArray((n as { waypoints?: unknown[] }).waypoints));
    expect(movingNpcs.length).toBeGreaterThanOrEqual(3);
    const artisanNpcs = cityNpcs.filter((n) => {
      const b = (n as { behavior?: string }).behavior;
      return b === 'smith_hammer' || b === 'carpenter_work' || b === 'scholar_read';
    });
    expect(artisanNpcs.length).toBeGreaterThanOrEqual(3);

    const citadelQuest = questsData.quests.find((q) => q.id === 'side_city_citadel_accord');
    expect(citadelQuest).toBeDefined();

    const state = new GameState();
    const inv = new InventorySystem(state);
    const quests = new QuestSystem(state, inv);
    expect(quests.startQuest('side_city_citadel_accord')).toBe(true);
    expect(state.quests.side_city_citadel_accord.currentStageId).toBe('audience_with_steward');
    state.events.emit('dialogue:talked', { npcId: 'city_lord_steward' });
    expect(state.quests.side_city_citadel_accord.currentStageId).toBe('report_archivist');
    expect(quests.completeQuest('side_city_citadel_accord')).toBe(true);
    expect(state.quests.side_city_citadel_accord.status).toBe('completed');
  });

  it('walks continuously WITHOUT teleport across all 8 Cells, 2F indoor shortcuts, Bell Tower (+24.2m), Castle Keep (+30.5m), and 4-flight Secret Vault Shaft (+18m -> -4m -> 0m)', async () => {
    const physics = new PhysicsWorld();
    await physics.init({ ...cityConfig.spawnPoint });

    const registry = new InteractableRegistry();
    const cityGroup = new THREE.Group();
    const built = await buildAshenholdCity(
      cityGroup,
      physics,
      registry,
      { onExitCity: () => {}, onLoreRead: () => {} },
      { skipAssetFetch: true },
    );
    physics.setActiveZone('ashenhold_city');

    // =========================================================================
    // LOOP 1: Outer Barbican Gate (Cell 01) -> Bent-Axis Courtyard -> East Tower (+9.5m)
    //         -> Inner Gate Rampart -> Overhead Bridge (+9.5m) -> Smithy 2F Loft (+10.5m)
    //         -> Smithy 1F (+7.0m, Cell 04) -> Market Plaza (+3.5m, Cell 03)
    // =========================================================================
    physics.teleportPlayer({
      x: cityConfig.spawnPoint.x,
      y: getCityGroundHeight(cityConfig.spawnPoint.x, cityConfig.spawnPoint.z) + 0.3,
      z: cityConfig.spawnPoint.z,
    });

    // Walk North through Outer Gate (-6.2, 31.2), turn East along z=23.2 between Traverse Wall & Guardhouse, enter 1F West Guardhouse!
    let pos = walkWaypoints(physics, [
      [-6.2, 31.0],
      [-6.2, 23.2],
      [-3.0, 23.2],
      [-3.0, 18.8],
      [-6.8, 18.8], // Inside Cell 01 West Gate Guardhouse!
    ]);
    expect(pos.x).toBeLessThan(-5.8);
    expect(getCityRegionAt(pos.x, pos.z, pos.y)).toBe('ashenhold_gate');

    // Walk across Barbican Courtyard into East Defense Tower 1F -> climb 2-flight indoor stair to +9.5m Rampart!
    pos = walkWaypoints(physics, [
      [-3.0, 18.8],
      [6.6, 22.6],
      [6.8, 25.4],
      [10.2, 25.4], // Inside East Defense Tower 1F
      [9.4, 27.6],
      [14.5, 27.6], // Up Flight 1 -> +4.8m Mid-Landing
      [14.6, 23.3],
      [9.1, 23.3], // Up Flight 2 -> +9.5m Tower Roof Deck!
      [8.9, 18.6],
      [8.9, 14.5], // Through new SE Rampart Doorway into sv_hero_gate_tower (+9.5m)!
    ]);
    expect(pos.y).toBeGreaterThan(9.1);

    // Walk West across South Gatehouse Battlement (+9.5m) -> around West Drum Tower (z=9.30) -> North along West Rampart -> Smithy 2F Loft (+10.5m)!
    pos = walkWaypoints(physics, [
      [8.9, 12.2],
      [-10.2, 12.2],
      [-10.2, 9.30],
      [-13.5, 9.30],
      [-13.5, -14.5],
      [0.0, -14.5], // Midpoint of Overhead Bridge (+9.5m)
      [-13.5, -14.5],
      [-13.5, -30.0],
      [-28.8, -30.0], // Across West Rampart Catwalk into Ironforge Smithy 2F Loft (+10.5m)!
      [-36.8, -30.0],
      [-36.8, -38.8],
      [-29.8, -38.8], // Down indoor Smithy stair to 1F (+7.04m)!
      [-26.5, -35.2], // Step outside into Cell 04 Artisan Quarter!
    ]);
    expect(pos.y).toBeGreaterThan(6.7);
    expect(pos.y).toBeLessThan(7.6);
    expect(getCityRegionAt(pos.x, pos.z, pos.y)).toBe('ashenhold_artisan_quarter');

    // Walk East down P11 Artisan Steps into Cell 03 Market Plaza (+3.5m), stepping around North Undercroft Stairwell!
    pos = walkWaypoints(physics, [
      [-24.5, -35.2],
      [-14.2, -35.2],
      [-13.8, -39.5],
      [-4.0, -39.5],
      [4.0, -31.0],
    ]);
    expect(pos.y).toBeGreaterThan(3.1);
    expect(pos.y).toBeLessThan(4.0);
    expect(getCityRegionAt(pos.x, pos.z, pos.y)).toBe('ashenhold_market_plaza');

    // =========================================================================
    // LOOP 2: Market Plaza (+3.5m) -> Market Guild Emporium 1F -> 2F Indoor Stair
    //         -> Exit East into Cell 05 Residential (+7.5m) -> Weaver Townhouse 1F -> 2F (+11m)
    //         -> Overhead Alley Skybridge (+11m) -> Hidden Well Courtyard & Cottage
    //         -> North Residential Cliff Stairs -> Cell 06 Cathedral & +24.2m Bell Tower!
    // =========================================================================
    pos = walkWaypoints(physics, [
      [10.5, -31.0],
      [10.5, -27.1],
      [13.2, -27.1], // Inside Market Guild/Bakery Emporium 1F (+3.52m)
      [12.5, -30.7],
      [17.6, -30.7], // Climb indoor stair to 2F (+7.52m)!
      [17.4, -26.5],
      [24.5, -26.5], // Exit 2F East Doorway directly onto Cell 05 Residential Lane (+7.5m)!
    ]);
    expect(pos.y).toBeGreaterThan(7.2);
    expect(getCityRegionAt(pos.x, pos.z, pos.y)).toBe('ashenhold_residential_quarter');

    // Enter Weaver Townhouse 1F -> climb to 2F (+11.0m) -> cross Overhead Alley Skybridge -> descend to Hidden Well Courtyard & Citizen Cottage!
    pos = walkWaypoints(physics, [
      [25.5, -27.8],
      [28.2, -27.8], // Inside Weaver Townhouse 1F
      [27.6, -31.0],
      [32.8, -31.0], // Climb indoor stair to 2F (+11.0m)!
      [32.6, -27.5],
      [40.8, -27.5], // Cross Overhead Alley Skybridge onto +11.0m Upper Residential Terrace!
    ]);
    expect(pos.y).toBeGreaterThan(10.6);

    pos = walkWaypoints(physics, [
      [40.8, -38.8],
      [40.8, -44.6], // Descend Terrace Stair into Hidden Well Courtyard (+7.54m)
      [38.8, -48.6],
      [42.0, -48.6], // Inside Citizen Cottage!
      [38.8, -48.6],
      [35.2, -45.5],
      [25.0, -45.5], // Out through narrow vaulted alley arch to Residential Lane
      [25.0, -61.2],
      [18.5, -76.8], // Climb North Residential Cliff Stairs into Cell 06 Temple Acropolis (+12.2m)!
    ]);
    expect(pos.y).toBeGreaterThan(11.9);
    expect(getCityRegionAt(pos.x, pos.z, pos.y)).toBe('ashenhold_temple_acropolis');

    // Enter Guildhall (East), then cross Forecourt into Cathedral of St. Ignis (West) -> climb 4-tier Bell Tower to +24.2m Belfry!
    pos = walkWaypoints(physics, [
      [5.5, -86.8],
      [11.0, -86.8], // Inside Guildhall & Archive
      [0.0, -86.8],
      [-11.7, -86.8], // Inside Cathedral of St. Ignis Nave
      [-16.5, -91.2],
      [-20.5, -91.2], // Enter Cathedral Bell Tower base (+12.26m)
      [-18.9, -89.2],
      [-24.5, -89.2], // Up Flight 1 -> +16.0m
      [-24.5, -93.6],
      [-19.0, -93.6], // Up Flight 2 -> +19.5m Mid-Gallery
      [-19.0, -89.2],
      [-24.6, -89.2], // Up Flight 3 -> +24.2m Open Belfry!
      [-22.1, -92.8], // Stand beneath the Great Cast-Bronze Bell (+24.2m)!
    ]);
    expect(pos.y).toBeGreaterThan(23.8);
    expect(registry.get('bell:cathedral_belfry')).toBeDefined();

    // Descend Bell Tower from +24.2m to +19.5m -> walk North & East across High Stone Viaduct (+19.5m) -> climb to Cell 07 Castle Battlements (+23.5m) & descend to Outer Bailey (+18.0m)!
    pos = walkWaypoints(physics, [
      [-24.6, -89.2],
      [-19.0, -89.2],
      [-19.2, -93.6], // Back at +19.5m Mid-Gallery
      [-19.2, -97.0],
      [2.5, -97.0], // Walk East across Cathedral High Viaduct Spur (+19.5m)!
      [2.5, -104.5],
      [-6.2, -104.5], // Climb orthogonal Viaduct-to-Castle Battlement Stair (+23.5m)!
      [-6.2, -108.5],
      [-9.8, -108.5],
      [-9.8, -113.0],
      [-9.8, -121.8], // Descend West Courtyard Stair into Cell 07 Castle Outer Bailey (+18.0m)!
    ]);
    expect(pos.y).toBeGreaterThan(17.7);
    expect(pos.y).toBeLessThan(18.6);
    expect(getCityRegionAt(pos.x, pos.z, pos.y)).toBe('ashenhold_castle_approach');

    // =========================================================================
    // LOOP 3: Cell 07 Sovereign Great Hall (+21m -> +25.5m -> +30.5m Keep Crown)
    //         -> East Castle Armory -> 4-Flight Secret Cliff Shaft (+18m -> -4m)
    //         -> Cell 08 Royal Treasury Vault & 90m Drainage Tunnel -> Cell 01 Barbican!
    // =========================================================================
    pos = walkWaypoints(physics, [
      [0.0, -121.8],
      [0.0, -128.0],
      [0.0, -133.0], // Inside Sovereign Great Hall (+21.04m)!
      [8.2, -129.2],
      [8.2, -138.4], // Climb indoor Great Hall stair to 2F Gallery (+25.5m)
      [8.2, -140.6],
      [-8.4, -140.6],
      [-8.4, -136.0],
      [-13.5, -136.0], // Step onto West Keep Watchtower (+25.5m)
      [-11.5, -133.2],
      [-16.7, -133.2], // Climb Exterior Keep Stair to +30.5m Keep Crown!
      [-14.2, -137.0],
    ]);
    expect(pos.y).toBeGreaterThan(30.1);

    // Walk back down from +30.5m Keep Crown -> +25.5m Watchtower & Gallery -> +21.0m Great Hall -> +18.0m Outer Bailey -> Enter East Castle Armory!
    pos = walkWaypoints(physics, [
      [-16.7, -133.2],
      [-12.4, -133.2],
      [-12.4, -136.0],
      [-8.4, -136.0],
      [-8.4, -140.6],
      [8.2, -140.6],
      [8.2, -129.2],
      [0.0, -129.2],
      [0.0, -119.5], // Out Grand Portal & down Keep Steps to Outer Bailey (+18.0m)
      [9.5, -117.6],
      [12.7, -117.6], // Enter East Castle Armory (+18.04m)!
      [12.7, -122.0],
      [15.4, -122.0], // Step onto top of 4-Flight Secret Cliff Switchback Shaft!
    ]);
    expect(pos.y).toBeGreaterThan(17.7);

    // Descend all 4 switchback flights inside the cliff (+18.04m -> +12.5m -> +7.0m -> +1.5m -> -4.0m)!
    pos = walkWaypoints(physics, [
      [15.4, -121.1],
      [15.4, -114.2], // Flight 1 -> +12.5m South Landing
      [18.4, -114.2],
      [18.4, -122.0], // Flight 2 -> +7.0m North Landing
      [15.4, -122.0],
      [15.4, -114.2], // Flight 3 -> +1.5m South Landing
      [18.4, -114.2],
      [18.4, -121.2], // Flight 4 -> -4.0m Bottom Landing!
      [8.5, -121.0], // Step West into Cell 08 Secret Royal Treasury Vault (-4.0m)!
    ]);
    expect(pos.y).toBeLessThan(-3.5);
    expect(getCityRegionAt(pos.x, pos.z, pos.y)).toBe('ashenhold_undercroft');
    expect(registry.get('chest:royal_secret_vault')).toBeDefined();

    // Walk South through the 90m Northern Castle Drainage Tunnel -> Central Cistern -> Barbican Tunnel -> Climb West Barbican Stair (-4m -> 0m) back to Cell 01!
    pos = walkWaypoints(
      physics,
      [
        [2.0, -121.0],
        [2.0, -70.0],
        [2.0, -21.0],
        [-12.1, -21.0], // Back in Central Vaulted Cistern (-4.0m)
        [-12.5, -5.0],
        [-12.5, 16.5], // Through South Barbican Tunnel
        [-12.5, 27.6], // Climb West Barbican Stairway (-4.0m -> 0.0m) out to Cell 01 Barbican Courtyard!
      ],
      550,
    );
    expect(pos.y).toBeGreaterThan(-0.3);
    expect(pos.z).toBeGreaterThan(26.8);
    expect(getCityRegionAt(pos.x, pos.z, pos.y)).toBe('ashenhold_gate');

    built.dispose();
    physics.dispose();
  });
});
