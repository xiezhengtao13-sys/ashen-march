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

## 2026-11-23 — Ashenhold (灰烬城) Phase 1：城门与门卫主街高密度样板区
- **视觉重心战略调整**：借鉴 *Saltline* 对小范围高密度场景的表现策略，在保留原有开放平原、森林、哨塔、古代墓穴与全部任务/存档系统的前提下，新建独立高画质中世纪奇幻城市区域 **Ashenhold — 灰烬城** (`zone = 'ashenhold_city'`)，优先打磨约 40×60 米的 **Phase 1：城门与一条主街样板区**。
- **高分辨率 PBR 纹理生成管线 (`scripts/city/texgen.c`, `scripts/city/generate_textures.py`)**：
  - 使用 C99 多频 FBM/Voronoi 噪声与 Sobel 切线空间法线算法 + Python/Pillow 生成 44 张 `public/assets/city/textures/*.png` 纹理（涵盖玄武岩城墙石砌、风化灰岩、不规则鹅卵石路面、苔藓湿石、老旧橡木梁、抹灰粉墙、天然板岩瓦、赤陶屋瓦、锻铁、湿泥碎石，以及手绘皇家灰烬纹章旗帜、酒馆招牌与药铺招牌）。
- **Blender 4.0 Python 原创 GLB 模型管线 (`scripts/city/generate_models.py`)**：
  - 彻底摒弃运行时 `BoxGeometry` / `ConeGeometry` 简单堆叠，通过 Blender 4.0 Headless `bmesh` 脚本构建并导出 20 个 `.glb` 资产至 `public/assets/city/models/`（总计 65,451 顶点 / 100,906 三角面）。
  - 所有建筑与道具均具备真实构件厚度、斜角削边 (`bmesh.ops.bevel`)、米制三平面 UV 与基于 `BVHTree` 半球光线投射烘焙的顶点环境光遮蔽 (`COLOR_0`)。
  - 包含：南城门主楼 (`gatehouse.glb`，含拱道、铁闸门、开启的铆钉橡木大门、城垛与箭孔)、12 边形侧翼防御塔 (`bastion_tower.glb`)、带木制悬楼的城墙 (`curtain_wall.glb`)、南门卫戍营房 (`bldg_guardhouse.glb`，**可进入室内**，含壁炉燃木、铁艺吊灯与长桌)、铁锚药剂与织物行 (`bldg_apothecary.glb`，三层双悬挑木骨建筑 + 条纹布篷 + 户外药水柜台)、《余烬与酒壶》转角酒馆 (`bldg_tavern.glb`，**可进入室内**，含柱廊、凸窗、橡木吧台、酒桶架、内嵌燃木壁炉与铁吊灯)、铜炉与军需行会 (`bldg_guildhouse.glb`，弗拉芒阶梯山墙、拱门通道、二楼铁艺阳台与吊货滑轮)、封闭街巷侧墙与北端木拱桥及远景领主城堡天际线 (`skyline_distant.glb`)，以及 12 种精雕街道道具 (`prop_*.glb`)。
- **城市场景引擎与地面着色器 (`src/world/city/*`, `src/data/cityPhase1Config.json`)**：
  - `CityGroundBuilder` & `CityMaterialLibrary`：生成带道路中央拱起、两侧下沉排水沟、花岗岩路缘石与向北缓坡的精细街道网格，并通过 `onBeforeCompile` 实现四通道顶点混合（鹅卵石 + 路肩泥土 + 墙根青苔 + 雨后积水镜面天空/阳光反射）。
  - `CityAssetLoader` & `CityPhase1Builder`：使用 `GLTFLoader` 加载建筑模型并绑定共享 PBR 材质库，将 162 个街道道具按材质自动提取合并为 `THREE.InstancedMesh` 批次；构建与门洞/室内匹配的 Rapier 静态碰撞体、6 盏暖色点光源、灯笼光晕精灵与壁炉烟囱炊烟粒子。
  - **NPC、叙事交互与快速入口**：新增南门卫队长瓦伦 (`city_gate_captain`)、药商伊琳娜 (`city_apothecary_elina`，可对话与交易)、城门守卫 (`city_guard_east`)，以及《灰烬城防卫日志》《余烬酒馆账簿》《灰烬城治安布告》3 处可读交互物与返回溪谷村传送门；支持 `?zone=city` URL 参数、`window.__ASHEN_MARCH__.enterCity()`、系统菜单一键传送及溪谷村路牌传送。
- **实测验证与真实浏览器遥测**：
  - `npm run typecheck` 通过（0 错误）。
  - `npm test` 7 个测试套件共 19 项单元测试全部通过（含 `tests/unit/city-phase1.test.ts` 对城门通行、卫戍营房室内与转角酒馆室内碰撞体的专项测试）。
  - `npm run build` 生产构建通过。
  - `npm run test:e2e` Playwright 端到端测试通过（覆盖原开放世界/地下城全流程 + 灰烬城 Phase 1 渲染、街道行走、走入酒馆室内与卫队长交互，0 控制台/页面错误）。
  - 采集 6 张真实浏览器游戏截图 (`city_01_gate_approach.png` 至 `city_06_skyline_vista.png`)：1080p High 档视角下实测 **137 Draw Calls / 158,332 Triangles**（720p 全景视角 236 Draw Calls / 187,332 Triangles / 51 Textures；在无硬件 GPU 的云端 CPU SwiftShader 软件光栅化下帧耗时约 3.1s–5.0s，合批后的 137–236 Draw Calls 与 ~18.7 万三角面在桌面独立/集成硬件 WebGL2 GPU 上完全契合 1080p 60 FPS 预算）。

## 2026-11-23 — Ashenhold (灰烬城) Phase 2 (`feature/ashenhold-phase2-market`)：光照重修、200×240m 双环城区与中央市集
- **画面偏暗系统性修复 (`CityLighting.ts`, `CityMaterialLibrary.ts`, `DayNightCycle.ts`)**：
  - 针对基线版本缺乏天空球谐补光、顶点 AO 与实时阴影双重乘算压暗直接光照、全材质全局挂接 `scene.environment` 以及单一 `ACESFilmicToneMapping` 压缩高光的问题，新增 `CityAmbientProbe`（基于物理太阳方向与天顶/地平散射色的 9 系数 SH 球谐天空探针 `THREE.LightProbe`）。
  - 通过 `injectIndirectAO` 将 GLB 顶点 AO (`COLOR_0`) 分离约束于 `indirectDiffuse` / `indirectSpecular`（直接光仅保留 `0.3` 软折减），仅对锻铁/黄铜/窗玻璃/水面赋予专属 PMREM 环境反射，避免粗糙石面与抹灰墙受暗环境贴图压暗，并随昼夜切换自发光窗玻璃 (`window_leaded`)。
  - 为城市启用 `THREE.NeutralToneMapping`（曝光 `1.0`，高光过渡自然且不靠过度 Bloom 或浓雾遮丑），保持开放世界 `ACESFilmicToneMapping` 不变；阴影相机围绕玩家按 48m 范围纹素对齐锚定 (`DayNightCycle.applyCityLighting`)。
  - 实测亮度统计 (`tools/lum.py`)：同机位南门 13:00 均值 `meanY` 从 `0.038` 提升至 `0.108–0.117`（过暗像素 `<0.02` 由 `63.8%` 降至 `26.8%`），中央市集 10:00 `meanY=0.163` (`dark<0.02=6.5%`)、13:00 `meanY=0.177` (`dark<0.02=9.7%`)、17:00 黄金落日 `meanY=0.045` (`dark<0.02=23.0%`)、城堡前庭 13:00 `meanY=0.224` (`dark<0.02=2.3%`)。
- **200×240m 城市总体规划、道路网与分块地形 (`ASHENHOLD_MASTER_PLAN.md`, `CityRoadNetwork.ts`, `CityGroundBuilder.ts`)**：
  - 建立 `CityRoadNetwork` 连续路线与广场台地体系：保留 Phase 1 南城门主街，向北开启门拱直达 **中央市集广场 (`y=2.45m` / 喷泉台基 `y=2.81m`)**，分支两条可选主要环道——**西环【铁匠工坊区】（铸铁巷 → 制桶坊 → 铜角小巷 + 鞋匠捷径）** 与 **东环【织坊居民高地】（+1.9m 高差石阶观景台 → 提灯古巷 → 东行会车拱 + 面包台阶巷）**——以及通往 **城堡前庭 (`y=9.8m`)** 与 **领主内堡高台 (`y=13.5m`)** 的王道阶梯。
  - 城墙内真实可探索区域、城北闭锁的 **Phase 3 领主内堡** 与墙外装饰天际线在物理围墙、公告牌及 `[M]` 灰烬城羊皮纸舆图上明确区分，绝不以装饰远景冒充可探索区；`PhysicsWorld` 灰烬城边界同步扩展至 `x ∈ [-69, 69]`、`z ∈ [-171, 31]`。
- **扩展材质、47 个 Phase 2 GLB 资产库与 BMesh UV 修复 (`scripts/city/`)**：
  - `texgen.c` / `generate_textures.py` 新增中世纪赤砖 (`brick_medieval`)、4 色条纹遮阳篷布及面包店/铁匠铺/市集手绘招牌，全套城市 PBR 纹理扩充至 **54 张**。
  - 修复 `scripts/city/generate_models.py` 中 `MeshBuilder.custom_uv_faces` 使用易被 CPython GC 复用的 `id(f)` 导致随机石砌面跳过三平面 UV 的长期隐藏漏洞，改用持久 `BMesh` 整型面层 `custom_uv`，重导全量模型后 `gatehouse.glb` 与 `castle_barbican_gate.glb` 的 `bad_uv_big_tris` 分别由 `1219` / `462` 降至 **0**。
  - `building_kit.py` 新增 **47 个 Phase 2 资产**（全城总计 **67 个 `.glb` 模型**），包含 **10 座独立设计商摊 (`stall_01..10`)**、凤凰铁砧双层石喷泉、市政宪章碑、圣伊格尼斯钟楼圣堂、石匠拱廊、铸匠铺、制桶坊、硝皮坊、织坊会堂、多层居民住宅、城堡瓮城（带闭锁铁闸与双圆柱角楼）及主堡天际线，由 `build_city_layout.py` 生成 `src/data/cityLayout.json`（94 栋建筑/拱门/城墙，138 个实例化道具）。
- **分块合批优化、NPC 扩展与双模式 `[M]` 舆图 (`CityAssetLoader.ts`, `CityPhase1Builder.ts`, `UIManager.ts`, `npcs.json`, `items.json`, `dialogues.json`)**：
  - 将 200×240m 地面切分为 23 块分块网格与物理 Trimesh；实作按区块与 `(material, castShadow)` 合批静态几何体 (`createDistrictStaticBatch`) 及围墙自动 `InstancedMesh`，将南城门方向 Draw Calls 由 `725` 压降至 `379`，市集广场 1080p High 档仅 `210` Draw Calls。
  - 新增 5 名交互 NPC（`city_baker_marta`、`city_merchant_thorne`、`city_smith_brennan`、`city_weaver_claire`、`city_citadel_warden`）与 3 件新商品（`hearth_bread`、`forged_guild_halberd`、`weavers_silk_cloak`）；`UIManager` 按区域自动切换开放世界地图与灰烬城双环舆图。
- **全量回归测试、E2E 连续游玩验证与软件渲染诚实报告**：
  - `npm run typecheck` (`tsc --noEmit`) 通过（0 错误）。
  - `npm test` (Vitest) **9 个测试套件共 23 项单元测试**全部通过（新增 `tests/unit/city-lighting.test.ts` 与 `tests/unit/city-phase2-layout.test.ts`，完整覆盖 SH 探针、道路拱门穿越、东西双环与内堡铁闸物理阻挡）。
  - `npm run build` 生产构建通过。
  - `npm run test:e2e` (Playwright + headless Chrome WebGL2，SwiftShader CPU 软件渲染) **2/2 全部通过**（`2 passed / 5.1m`，0 控制台/页面错误）：完整验证原有开放世界/墓穴/IndexedDB 存档无回归，以及从南城门进入主街→与卫队长交互→进入酒馆阅读账簿→穿过市集拱门抵达中央市集→向烘焙娘玛尔塔购买热面包扣减金币→探索西侧铁匠工坊区与东侧织坊高地→受阻于城堡前庭铁闸→打开 `[M]` 灰烬城舆图。
  - **硬件/软件渲染遥测透明披露**：当前云服务器无独立 GPU，所有截图与 E2E 均于 Chrome SwiftShader CPU 软件渲染运行（1080p 中央市集 High 档：**210 Draw Calls / 655,832 Triangles / 398 Geometries / 70 Textures**，CPU 软件单帧 ~9.1s / 0 FPS；720p 中央市集 **210 Draw Calls / 655,828 Triangles**；铁匠工坊区 **113 Draw Calls / 345,750 Triangles**；城堡前庭 **82 Draw Calls / 122,262 Triangles**）。待在实体硬件 GPU 环境下补充真实 60 FPS 帧率测试。

## 2026-11-23 — Ashenhold 紧凑型依山立体主城重设计 (`feature/ashenhold-hillside-redesign`)：Phase 1 蓝图与 Phase 2 样板区
- **Phase 1 空间重设计获批**：放弃平坦 200×240m 铺开式格局，重新规划约 **104×144 m** 的五重台地依山山城（`0m → +3.5m → +7.5m → +12.2m → +18.0m / +21.0m`），确立 A 类 8 栋完整室内 + B 类 12 栋半可进入空间 + C 类外观建筑的三级策略及三环六捷径路线网。
- **Phase 2 高品质紧凑山城样板区实现 (`CityRoadNetwork.ts`, `CityGroundBuilder.ts`, `PhysicsWorld.ts`, `hillside_kit.py`, `build_hillside_layout.py`, `CityPhase1Builder.ts`)**：
  - `PhysicsWorld.ts` 新增 `addStaticOrientedBox`（精确 YXZ 四元数倾斜斜坡碰撞体），为双层旅店内梯与 4.2m 挡土墙石阶提供丝滑攀登手感；城市边界收束至 `104×144m`。
  - `scripts/city/hillside_kit.py` 新增 14 个 Blender 4.0 山城定制 `.glb` 模型（零大面异常 UV）：含 **A1 南门卫戍室（室内）**、**A2 双层余烬旅店（可走橡木楼梯上二楼观景阳台 `+5.1m`）**、**A3 铁锚药剂堂（完整室内与伊琳娜柜台）**、**B1 商队货仓**、**B2 车夫歇脚棚**、**市集木石廊桥拱门**、**4.2m 北侧挡土石墙与双折礼仪大石阶**、模块化山体挡土墙及 3 款高密窄街三层民居。
  - 实装 `< 28m` 室内家具距离剔除 (`CityInterior_*`) 与五重台地等高线 `[M]` 灰烬城舆图 (`UIManager.ts`)。
  - **实测对比与回归**：相比旧版平坦城市，南门与市集同机位视锥三角面分别由 `816k / 656k` 降至 `514k (-37%) / 499k (-24%)`，室内视角仅 `108–113 Draw Calls / 242k–384k Tris`；`npm run typecheck`、`npm test`（9 套件 23 用例，含实机 Rapier 攀登 A2 二楼楼梯与 4.2m 北墙大石阶验证）、`npm run build` 与 `npm run test:e2e`（Playwright 2/2，0 控制台/页面报错）全量通过。

## 2026-11-23 — Ashenhold Visual Fidelity V3 (`feature/ashenhold-art-direction-v3`)：史东薇尔式山城美术与四层无传送立体关卡重制
- **参考技术源码审计与美术定调 (`docs/ART_DIRECTION_V3.md`)**：直接审计 `realcodebear/saltline-fable-5.2/index.html`（只读研究，零复制受保护代码/资产），严格区分已验证技术（Packed ORM、世界空间双频 3D 噪声宏观风化、雨痕/湿润粗糙度响应、连续积水地面梯度、LDR 单 Pass FXAA + 对比度自适应锐化 + 抖动）与 Ashenhold 原创西幻山城迁移方案；确立 *Grounded Gothic Medieval Fantasy — Weathered Mountain Citadel* 风格与晴朗 13:00 日光基调，先采集 `feature/ashenhold-hillside-redesign` 固定六机位 A–F 基线 (`docs/screenshots/v3/before_camA..F.png`)。
- **多尺度无黑描边 PBR 材质、风化着色器与线性 HDR 后处理 (`scripts/city/texgen_v3.c`, `generate_textures_v3.py`, `CityMaterialLibrary.ts`, `CityPostFX.ts`, `GameApp.ts`)**：
  - 生成 6 套无缝 512×512 Packed ORM（`R=AO, G=Roughness, B=Metal`）山城核心 PBR 纹理（18 张 PNG：`limestone_weathered`、`citadel_masonry`、`damp_slate_stone`、`aged_oak_timber`、`broken_flagstone`、`mountain_crag_rock`），彻底消除旧版 Albedo 烘焙粗黑卡通砖缝。
  - `CityMaterialLibrary.ts` 新增 `injectGothicWeathering`（世界空间双频宏观风化、竖直雨痕、向上面苔藓地衣、底层墙脚与 `-4m` 暗渠物理湿润降粗糙度、`<10m` 近距微粒、纯间接光 AO）及 6 档实时诊断模式（`albedo` / `normal` / `roughness` / `no_ao` / `no_post` / `final`）；同步升级 `streetMaterial` 为碎石板 + 山岩 + 连续湿润/积水渐变。
  - 新增 `CityPostFX.ts`：渲染至 `HalfFloatType` 线性 HDR 目标，执行与 Three.js 一致的 Khronos PBR Neutral ToneMapping + Linear-to-sRGB，随后施加可独立开关的 FXAA、强边缘回退对比度自适应微锐化与 8-bit 抖动（`no_post` 与 `final` 曝光色温完全一致）。
- **史东薇尔式逐块 3D 凹凸砌石 Hero Assets 与四层零传送立体样板区 (`scripts/city/stormveil_kit.py`, `build_v3_layout.py`, `CityRoadNetwork.ts`, `CityPhase1Builder.ts`, `npcs.json`, `UIManager.ts`)**：
  - 彻底摒弃重要石墙平盒体拼接，在 Blender 4.0 `bmesh` 中构建并导出 12 个逐块 3D 凹凸错缝砌石、多级阶梯扶壁、风化尖拱、锻铁笼灯、细木常春藤蔓与残破垛口 Hero GLB（含 `bl_ramp` 通用斜坡碰撞体与 `CityRoadNetwork.ts` `-4m` 暗渠与南北梯口精准地形挖槽）：`sv_hero_gate_tower.glb`、`sv_hero_gothic_bridge.glb`、`sv_hero_market_bastion.glb`、`sv_hero_summit_ascent.glb`、`sv_hero_undercroft.glb`、`sv_hero_tavern_v3.glb`（+ `<28m` 距离剔除内饰）及扶壁墙/山岩/碎石/火盆/木脚手架。
  - 实现**四层全程零传送步行贯通**：`-4.0m` 黑石拱顶排水暗渠（铁格栅水沟暖光倒影）→ `0.0m` 南门与曲折石巷 → `+1.7/+5.2m` 真开窗透光双层酒馆 → `+3.5m` 哥特拱廊市集 → `+7.5m` 北堡垒观景台 → `+9.5m` 西城墙步道与实体可通行跨街哥特石桥（连通酒馆二层与南门卫塔）→ `+19.5m` 悬崖外梯直达北瞭望塔顶；`[M]` 地图同步升级为四层立体山堡舆图。
- **全量实机验证与诚实遥测**：
  - `npm run typecheck` 通过（0 错误）；`npm run build` 打包成功。
  - `npm test` (Vitest)：**9/9 套件、23/23 用例全绿**，含 Rapier 全路径零传送四层连续步行测试（`0m → -4.0m → +3.5m → +7.5m → +9.5m 跨街石桥 → +19.5m 瞭望塔顶`）及 6 档诊断模式单测。
  - `npm run test:e2e` (Playwright + headless Chrome WebGL2 SwiftShader)：**2/2 全部通过 (`6.8m`，0 控制台/页面报错)**——完整验证原开放世界/古代墓穴/IndexedDB 存档无回归，以及灰烬城 V3 全程零 `teleport()` 的真实 `KeyW` 连续步行：`0.0m` 南城门 → `-3.93m` 黑石暗渠 → `+3.55m` 拱廊市集（与商会总管索恩真实交易扣减金币）→ `+7.59m` 北堡垒观景台 → `+19.58m` 悬崖瞭望塔顶 → 材质诊断接口与 `[M]` 舆图。
  - 采集并归档全部 15 张实机截图至 `docs/screenshots/v3/`（6 组固定机位 A–F Before/After、6 档材质诊断图、3 张四层垂直补充视图；云端 CPU SwiftShader 1280×720 High 档实测：机位 F `no_post` 主通道仅 `50 DC / 123,044 Tris`，含 2048 阴影 + PostFX 累计 `195 DC / 371,014 Tris`；全城视野 `447–489 DC / 627k–657k Tris / 2.7–6.2s` CPU 软件帧耗时）。




