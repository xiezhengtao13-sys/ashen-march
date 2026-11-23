# 开发日志 (DEVELOPMENT_LOG)

## 2026-11-23 — Stage 0: 工程初始化启动
- 完成环境工具校验：`git 2.54.0`、`node v24.14.1`、`npm 11.11.0`、`gh 2.104.0`（账号 `xiezhengtao13-sys`）。
- 创建私有 GitHub 仓库：`https://github.com/xiezhengtao13-sys/ashen-march`。
- 初始化工程目录结构、TypeScript/Vite/Vitest 配置以及 GDD、ARCHITECTURE、ROADMAP、AGENTS 文档。
- 完成 Stage 0：编写 `EventBus`、`SeededRandom`、`GameState`、静态数据配置 (`src/data/*.json`) 与初始 WebGL2 Three.js 场景入口。
- 测试验证：`npm run typecheck` 通过，`npm test` 3/3 通过，`npm run build` 打包成功。

## 2026-11-23 — Stage 1: 可探索世界、Rapier 3D 物理与第一人称控制
- 实现 `TerrainGenerator`：基于确定性噪声与区域平滑遮罩生成 512×512m 地形与生物群系顶点着色，涵盖溪谷村、灰木森林、废弃哨塔高地、河谷河道与北境山麓。
- 实现 `PhysicsWorld`：接入 `@dimforge/rapier3d-compat` 地形三角网格、建筑/树干/岩石静态碰撞体，以及带台阶跨越与贴地吸附的 `KinematicCharacterController`。
- 实现 `WorldBuilder` 与 `PropFactory`：构建可进入村长长屋、铁匠铺、猎人小屋、水井、可攀登斜坡废弃哨塔、木桥水流、哥布林营地、隐秘祭坛与古代墓穴外门。
- 实现 `PlayerController`：WASD 移动、Shift 奔跑消耗耐力、Space 跳跃、PointerLock+拖拽视角以及基于 `AnimationMixer` 的第一人称手持武器/法球动画。
- 测试验证：`npm run typecheck` 通过，`npm test` 6/6 通过（验证重力落体、实墙阻挡与门洞通行），`npm run build` 成功。

## 2026-11-23 — Stage 2: 战斗、火球术、敌人 AI 与背包装备
- 实现 `InventorySystem`：支持堆叠/非堆叠物品管理、武器/护甲/饰品穿脱、消耗品治疗/回蓝、世界物品丢弃、金币交易、XP 升级与属性聚合。
- 实现 `EnemySystem` (`src/ai/EnemyAI.ts`)：构建灰木哥布林、骷髅战士与 Boss 墓穴守卫的多关节 3D 模型和 `AnimationMixer` 动作剪辑，完整实现 `IDLE -> PATROL -> DETECT -> CHASE -> ATTACK -> HURT -> DEAD` 7 状态机及战利品掉落。
- 实现 `CombatSystem`：单手剑近战范围+前向锥角判定、火球术弹体飞行与环境/敌人碰撞结算、法力自然恢复以及玩家死亡后于溪谷村复活机制。
- 测试验证：`npm run typecheck` 通过，`npm test` 8/8 通过，`npm run build` 成功。

## 2026-11-23 — Stage 3: NPC、条件对话、任务系统与商店
- 实现 `NPCSystem`：配置驱动放置村长奥尔德林（法杖）、铁匠商人葛伦（锻锤）、猎人莱拉（斥候装束）专属 3D 模型及静态碰撞与交互注册。
- 实现 `QuestSystem`：事件自动推进主线《失落的守望者》三阶段及双结局（交还圣物/保留圣物），以及《灰木林的威胁》《边境物资筹备》两条完整支线与奖励发放。
- 实现 `DialogueSystem`：支持基于任务阶段、物品持有、剧情标记的条件分支与动作执行（接取任务、交付完成、打开商店）。
- 测试验证：`npm run typecheck` 通过，`npm test` 11/11 通过，`npm run build` 成功。
- 下一步：进入 Stage 4（古代墓穴独立地下城与 IndexedDB 版本化存档系统）。
