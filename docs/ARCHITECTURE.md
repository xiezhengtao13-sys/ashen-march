# 技术架构文档 (ARCHITECTURE)

## 1. 技术选型与工程决策

| 模块 | 选型 | 决策理由 |
| --- | --- | --- |
| 开发语言 | TypeScript (Strict) | 提供强类型约束，保障事件总线、JSON 配置与存档结构长期可维护 |
| 渲染与动画 | Three.js + WebGL2 + `AnimationMixer` | 生态成熟、体积可控，配合程序化几何体与顶点色可在无重型模型下载的情况下构建丰富场景与骨骼/关节动画 |
| 物理引擎 | `@dimforge/rapier3d-compat` | 高性能 WASM 刚体/静态碰撞体与内置 `KinematicCharacterController`，支持地形高度、斜坡、台阶与真实墙体阻挡 |
| 构建工具 | Vite | 极速冷启动、HMR 与原生 ESM / WASM 打包能力 |
| 本地持久化 | IndexedDB（原生 API） | 浏览器端大容量异步结构化存储，适合保存完整世界、背包、任务与实体状态 |
| 测试框架 | Vitest + jsdom + `fake-indexeddb` + Playwright | 兼顾纯逻辑快速回归测试与真实浏览器 WebGL 端到端验证 |

> **说明**：相较原默认列表，物理采用 `@dimforge/rapier3d-compat`（浏览器零配置加载 WASM，无需额外 bundler 插件），数据定义以 TypeScript 强类型导入 `src/data/*.json` 实现编译期校验。

## 2. 分层架构设计

```text
src/
├── core/        # EventBus、SeededRandom、统一 GameState 与全局类型定义
├── data/        # 静态 JSON 配置（世界、灰烬城 Phase 1/2 (`cityLayout.json`)、物品、敌人、NPC、对话、任务）
├── engine/      # Three.js 场景/WebGLRenderer、Rapier PhysicsWorld、ParticleSystem、AudioSystem
├── world/       # 确定性地形生成器、植被/建筑构建、WorldSpawner、古代墓穴地下城、昼夜循环
│   └── city/    # Ashenhold (灰烬城)：CityLighting (SH 探针)、CityRoadNetwork、CityGroundBuilder (分块地形)、CityMaterialLibrary、CityAssetLoader (按区合批+实例化)、CityPhase1Builder
├── player/      # 第一人称角色控制器、视角锁定/拖拽、手持武器与施法动画
├── combat/      # 近战命中判定、火球术弹体物理/碰撞、伤害结算与复活流程
├── ai/          # 敌人实体、关节动画剪辑与状态机 AI (IDLE/PATROL/DETECT/CHASE/ATTACK/HURT/DEAD)
├── npc/         # NPC 生成、朝向、交互注册（支持多区域与自定义地面高度）
├── dialogue/    # 条件求值与动作触发式对话状态机
├── quests/      # 任务阶段流转、杀敌/采集监听与奖励发放
├── inventory/   # 背包堆叠、装备穿脱、属性聚合、物品使用与世界掉落
├── save/        # IndexedDB 读写封装与 Schema 版本迁移 (v1 -> v2)
├── ui/          # HUD、模态窗口（对话/商店/背包/任务/双模式世界及灰烬城舆图/系统菜单）与自动化桥接
└── GameApp.ts   # 主游戏循环编排、三区域切换与调试桥接 (`window.__ASHEN_MARCH__`)
```

同时，`scripts/city/` 提供离线资产生成管线与城市规划文档 ([ASHENHOLD_MASTER_PLAN.md](ASHENHOLD_MASTER_PLAN.md))：`texgen.c` + `generate_textures.py` 生成 54 张 PBR 贴图至 `public/assets/city/textures/`，`generate_models.py` 与 `building_kit.py` 通过 Blender 4.0 Python `bmesh` 导出带倒角、持久 `custom_uv` 面层三平面 UV 与光线投射顶点 AO 的 67 个 `.glb` 模型至 `public/assets/city/models/`，`build_city_layout.py` 将 200×240m 规划编译为 `src/data/cityLayout.json`。

## 3. 核心数据流与唯一 ID 规范

1. **统一状态中心 (`GameState`)**：
   - 所有可变运行时数据（玩家属性、当前区域 `overworld` / `ancient_crypt` / `ashenhold_city`、背包与装备栏、任务进度、剧情标记 `storyFlags`、已开启宝箱 `openedChestIds`、已击败重要/固定敌人 `defeatedEnemyIds`、已拾取物 `collectedPickupIds`、已发现地点 `discoveredLocations`、游戏内时间 `timeOfDay`）全部集中于 `GameState`。
2. **稳定实体 ID 规范**：
   - 世界宝箱：`chest_elder_house`, `chest_forest_camp`, `chest_watchtower_top`, `chest_river_cove`, `crypt_treasury_chest`, `crypt_relic_chest`
   - 世界拾取物：`pickup_watchers_journal`, `pickup_herb_1..5`
   - 固定敌人：`enemy_goblin_1..4`, `enemy_skeleton_1..2`, `enemy_crypt_guardian`
   - 开放世界 NPC：`elder_aldrin`, `merchant_garrick`, `hunter_lyra`
   - 灰烬城 NPC（Phase 1 + Phase 2）：`city_gate_captain`（南门卫队长瓦伦）, `city_apothecary_elina`（药商伊琳娜）, `city_guard_east`（灰烬城门卫）, `city_baker_marta`（面包师玛尔塔）, `city_merchant_thorne`（干货行商索恩）, `city_smith_brennan`（铸匠布伦南）, `city_weaver_claire`（织坊主克莱尔）, `city_citadel_warden`（内堡守备官）
3. **事件驱动解耦 (`EventBus`)**：
   - 系统间通过强类型事件通信：`enemy:killed`、`item:collected`、`item:removed`、`location:discovered`、`quest:updated`、`player:leveled_up`、`zone:changed`、`hud:notify`。
4. **物理三区空间隔离方案 (`overworld` / `ancient_crypt` / `ashenhold_city`)**：
   - 主世界 (`overworld`：`y ∈ [-10, 120]`)、古代墓穴地下城 (`ancient_crypt`：`y = -500`) 与灰烬城 (`ashenhold_city`：`y = 500`，支持约 200×240m 扩展城市边界) 采用独立的空间偏移平面与各自独立的 `THREE.Group` 渲染根节点，城市外部装饰远景与未开放的 Phase 3 领主内堡均在碰撞与 `[M]` 舆图中明确界分。
   - 进入/离开不同区域时，瞬间切换对应渲染组 `visible` 属性、雾效密度、曝光/ToneMapping（城市 `NeutralToneMapping` 独立于野外 `ACESFilmicToneMapping`）、阴影视锥范围与 NPC 可见性，并将 Rapier `KinematicCharacterController` 传送至目标区域出生点。此方式无需销毁重建 Rapier 物理世界，完整保留原有开放世界与地下城状态，且零碰撞串扰。

