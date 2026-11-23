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

## 2026-11-23 — Stage 4: 古代墓穴地下城与 IndexedDB 存档系统
- 实现 `DungeonBuilder` (`src/world/DungeonBuilder.ts`)：在独立空间平面 (`y = -500`) 构建古代墓穴入口大厅、柱廊长廊、侧翼藏宝室与圣坛 Boss 室，接入完整 Rapier 碰撞体与地面/墓穴传送门。
- 实现 `WorldSpawner` (`src/world/WorldSpawner.ts`)：统一生成配置宝箱与拾取物，落实 Boss 击败前置锁定逻辑（击败墓穴守卫·阿卡索尔前圣物箱不可开启）以及世界掉落与读档状态同步。
- 实现 `SaveSystem` (`src/save/SaveSystem.ts`)：基于浏览器原生 IndexedDB 实现多槽位保存与读取，支持完整玩家/背包/任务/世界标记恢复，并内建 `v1 -> v2` Schema 迁移。
- 测试验证：`npm run typecheck` 通过，`npm test` 14/14 通过（含 `fake-indexeddb` 端到端存档校验），`npm run build` 成功。

## 2026-11-23 — Stage 5: 视听表现、完整 UI、GameApp 整合与浏览器 E2E 验收
- 实现 `DayNightCycle`（24 小时昼夜太阳/月亮光照与天空雾效、墓穴地下城独立暗雾切换）、`ParticleSystem`（近战火花、火球爆炸、升级光粒）及 `AudioSystem`（WebAudio 程序化音效与静音开关）。
- 实现 `UIManager` 与 `GameApp`：统一 HUD（指南针/区域/时间、任务追踪、HP/MP/Stamina/XP 条、交互提示、提示吐司）及全部模态窗口（对话、商店、背包与属性、任务日志、2D 世界地图 Canvas、文献阅读、重伤复活、IndexedDB 存档系统菜单）。
- 修复并优化：`index.html` 内置 SVG favicon 消除浏览器 `/favicon.ico` 404 控制台错误；提升地下城环境光照可见度。
- 实测验证结果：
  - `npm run typecheck` (`tsc --noEmit`) 通过（0 错误）。
  - `npm test` (Vitest) 5 个测试套件共 14 项单元测试全部通过。
  - `npm run build` (`vite build`) 构建成功。
  - `npm run test:e2e` (Playwright + Chrome SwiftShader WebGL2) 端到端测试通过（1/1 通过，0 控制台错误、0 未捕获异常）：验证 3D 渲染、WASD 移动与贴地碰撞、与村长对话接取主线、商人购买药水、背包/任务/世界地图界面、火球术施放与耗蓝、进入古代墓穴地下城、以及 IndexedDB 存档后刷新页面读档恢复。
- 待人工验收项：
  - 真实桌面显示器上的 Pointer Lock 鼠标视角灵敏度与近战/火球战斗手感；
  - 30–60 分钟完整探索节奏、主线双结局与双支线全流程游玩平衡性调优。

## 2026-11-23 — Visual Overhaul (`feature/visual-overhaul`): 全面视觉与 UI 重制
- **Phase A（基线审查）**：采集 7 组 `main` 基线截图与软件渲染性能（2 FPS），编写 [VISUAL_AUDIT.md](VISUAL_AUDIT.md)。
- **Phase B（PBR 材质库与画质档位）**：实现 `MaterialLibrary`（生成 Albedo + Sobel 切线法线 + Roughness 的平铺 PBR 纹理）及 `QualityManager`（Low / Medium / High 三档画质与实时 Draw Calls/Triangles/FPS 遥测）。
- **Phase C（中世纪建筑重制）**：实现 `ArchitectureBuilder`，彻底替换溪谷村素色方块建筑，为村长议事厅、铁匠铺与露天锻炉、猎人林屋、村井、木轮货车、路牌街灯、河谷桥墩、废弃哨塔与墓穴哥特入口添加真实建筑结构与环境叙事细节。
- **Phase D（RPG UI/UX 重构）**：新增 `IconRegistry` SVG 图标体系，全面重做极简探索 HUD（滑动罗盘带、精简状态条、4 槽快捷栏）、三栏背包、下三分之一电影化对话、分栏冒险日志、羊皮纸等高线舆图及系统菜单。
- **Phase E（生态、天空、角色与地下城升级）**：实现 `VegetationBuilder`（`InstancedMesh` 多树种森林与地表灌木草簇）、`DayNightCycle` 自定义 GLSL 天空穹顶着色器、地形坡度岩石混合、NPC 多层中世纪服饰、骷髅肋骨/哥布林/Boss 重甲造型、动态切换的第一人称剑模以及古代墓穴肋拱石棺场景。
- **Phase F（验证与 PR）**：`npm run typecheck` 通过，`npm test` 6 个套件共 16 项单元测试通过，`npm run build` 成功，`npm run test:e2e` Playwright 全流程验证通过（0 控制台/页面错误，SwiftShader 下提升至 22–60 FPS / 503 Draw Calls）。已保留 `main` 分支稳定版本，向 `main` 提交 Pull Request 等待审阅。
