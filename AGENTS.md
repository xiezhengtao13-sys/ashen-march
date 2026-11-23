# AGENTS.md — Ashen March (灰烬边境) Engineering Guidelines

This file guides AI coding agents and human contributors working in the `ashen-march` repository.

## Project Vision
**Ashen March — 灰烬边境** is an original, modular, single-player 3D Western Fantasy Action RPG running directly in desktop browsers using TypeScript, Three.js (WebGL2), Rapier 3D physics, JSON-driven content, and IndexedDB persistence.

## Directory Structure
- `src/core/`: Event bus, deterministic seeded PRNG, centralized `GameState`, and shared interfaces.
- `src/engine/`: Renderer, WebGL2 setup, Rapier 3D physics wrapper, particle system, and procedural WebAudio engine.
- `src/world/`: Deterministic 512×512m terrain generator, procedural foliage/architecture builders, Ancient Crypt dungeon builder, day/night cycle.
- `src/player/`: First-person controller, pointer lock / fallback drag camera, AnimationMixer weapon/spell viewmodel.
- `src/combat/`: Melee hit detection, fireball projectiles, damage calculations, player death/respawn.
- `src/ai/`: Enemy archetypes, articulated procedural meshes, AnimationMixer clips, and state machine (`IDLE`, `PATROL`, `DETECT`, `CHASE`, `ATTACK`, `HURT`, `DEAD`).
- `src/npc/`: Non-player characters placed from configuration with distinct 3D models and interaction targets.
- `src/dialogue/`: Condition- and action-driven dialogue graph engine.
- `src/quests/`: Data-driven quest stages, event listeners, branching choices, and rewards.
- `src/inventory/`: Item definitions, equipment slots, consumables, world drops, and stat aggregation.
- `src/save/`: Versioned IndexedDB persistence with schema migration hooks.
- `src/ui/`: Western Fantasy dark-gold HUD, Dialogue, Shop, Inventory, Quest Log, 2D World Map, and System Menu.
- `src/data/`: JSON configuration files (`worldConfig.json`, `items.json`, `enemies.json`, `npcs.json`, `dialogues.json`, `quests.json`).
- `tests/`: Unit tests (`tests/unit/*.test.ts`) and Playwright E2E tests (`tests/e2e/*.spec.ts`).
- `docs/`: `GDD.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `DEVELOPMENT_LOG.md`.

## Engineering Rules
1. **No Monolithic Files**: Keep responsibilities cleanly separated across modules.
2. **Data-Driven Design**: Items, enemies, NPCs, dialogues, quests, and landmark placements belong in `src/data/*.json` with stable unique IDs.
3. **Real Physics & Interactions**: Never fake terrain collisions or quest/inventory buttons. Always update central `GameState` and verify side effects.
4. **Deterministic World Seed**: Procedural terrain and foliage must remain reproducible for the configured seed.
5. **Test & Verify Every Milestone**:
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - Live browser / Playwright verification when rendering or UI changes.
6. **Documentation Sync**: Update `docs/ROADMAP.md` and `docs/DEVELOPMENT_LOG.md` after every completed stage.
