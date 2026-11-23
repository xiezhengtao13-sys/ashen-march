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
├── data/        # 静态 JSON 配置（世界、物品、敌人、NPC、对话、任务）
├── engine/      # Three.js 场景/WebGLRenderer、Rapier PhysicsWorld、ParticleSystem、AudioSystem
├── world/       # 确定性地形生成器、植被/建筑构建、古代墓穴地下城、昼夜循环
├── player/      # 第一人称角色控制器、视角锁定/拖拽、手持武器与施法动画
├── combat/      # 近战命中判定、火球弹体物理/碰撞、伤害结算与复活流程
├── ai/          # 敌人实体、关节动画剪辑与状态机 AI (IDLE/PATROL/DETECT/CHASE/ATTACK/HURT/DEAD)
├── npc/         # NPC 生成、朝向、交互注册
├── dialogue/    # 条件求值与动作触发式对话状态机
├── quests/      # 任务阶段流转、杀敌/采集监听与奖励发放
├── inventory/   # 背包堆叠、装备穿脱、属性聚合、物品使用与世界掉落
├── save/        # IndexedDB 读写封装与 Schema 版本迁移 (v1 -> v2)
└── ui/          # HUD、模态窗口（对话/商店/背包/任务/地图/系统菜单）与自动化桥接
```

## 3. 核心数据流与唯一 ID 规范

1. **统一状态中心 (`GameState`)**：
   - 所有可变运行时数据（玩家属性、当前区域 `overworld` / `ancient_crypt`、背包与装备栏、任务进度、剧情标记 `storyFlags`、已开启宝箱 `openedChestIds`、已击败重要/固定敌人 `defeatedEnemyIds`、已拾取物 `collectedPickupIds`、已发现地点 `discoveredLocations`、游戏内时间 `timeOfDay`）全部集中于 `GameState`。
2. **稳定实体 ID 规范**：
   - 世界宝箱：`chest_elder_house`, `chest_forest_camp`, `chest_watchtower_top`, `chest_river_cove`, `crypt_treasury_chest`, `crypt_relic_chest`
   - 世界拾取物：`pickup_watchers_journal`, `pickup_herb_1..5`
   - 固定敌人：`enemy_goblin_1..4`, `enemy_skeleton_1..2`, `enemy_crypt_guardian`
   - NPC：`elder_aldrin`, `merchant_garrick`, `hunter_lyra`
3. **事件驱动解耦 (`EventBus`)**：
   - 系统间通过强类型事件通信：`enemy:killed`、`item:collected`、`item:removed`、`location:discovered`、`quest:updated`、`player:leveled_up`、`zone:changed`、`hud:notify`。
4. **物理双区隔离方案**：
   - 主世界 (`overworld`) 与地下城 (`ancient_crypt`) 使用独立的碰撞体组或空间隔离坐标偏移（主世界位于 `y ∈ [-10, 120]`，地下城物理与渲染组位于 `y = -500` 空间平面，或通过启用/禁用 Rapier Collider 组切换），确保切换场景瞬间完成且永不穿模串扰。
   - **选定方案**：将 `ancient_crypt` 物理碰撞体与渲染组独立放置于世界偏移原点 `(0, -500, 0)`，进入/离开地下城时切换场景可见性、雾效与光照配置，并瞬间将角色控制器传送至目标出生点。此方式无需销毁重建 Rapier 物理世界，稳定性极高。
