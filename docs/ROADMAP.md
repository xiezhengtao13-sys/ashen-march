# 开发路线图 (ROADMAP) — Ashen March：灰烬边境

## Stage 0：工程初始化
- [x] 检查本地 Git、Node.js、npm 与 GitHub CLI 认证状态
- [x] 创建 GitHub 私有仓库 `ashen-march`
- [x] 初始化项目目录、配置（TypeScript / Vite / Vitest / ESLint-free strict TS）与核心文档
- [x] 完成 Stage 0 骨架代码、核心工具单元测试并通过首次构建与推送

## Stage 1：可探索世界与第一人称物理控制
- [x] 实现确定性 512×512m 地形生成器与 5 大区域生物群系着色
- [x] 构建溪谷村（含可进入村长长屋）、灰木森林、废弃哨塔（可攀登进入）、河谷区域与古代墓穴外门
- [x] 接入 Rapier 3D 物理引擎，实现地形、建筑墙壁（带门洞）、树木、岩石的真实碰撞
- [x] 实现第一人称 WASD + Shift 奔跑 + Space 跳跃 + PointerLock/拖拽视角 + E 交互系统
- [x] 单元测试验证地形确定性与物理碰撞，提交并推送 Stage 1

## Stage 2：战斗、魔法、敌人 AI 与背包系统
- [x] 实现 `items.json` 与 `InventorySystem`（堆叠、装备穿脱、属性计算、药水使用、丢弃生成世界拾取包）
- [x] 实现单手剑近战攻击（`AnimationMixer` 挥砍、范围与扇形判定）与火球术（MP 消耗、弹体碰撞、爆炸特效）
- [x] 实现 `enemies.json` 与 `EnemyAI`（哥布林、骷髅战士、墓穴守卫关节模型 + 7 状态机）
- [x] 实现玩家受伤、死亡与溪谷村复活流程
- [x] 单元测试验证战斗命中、AI 状态转移与背包系统，提交并推送 Stage 2

## Stage 3：NPC、条件对话、任务系统与商店
- [x] 创建 3 名核心 NPC（村长奥尔德林、铁匠商人葛伦、猎人莱拉）及专属 3D 模型
- [x] 实现条件驱动对话引擎 `DialogueSystem`
- [x] 实现数据驱动任务引擎 `QuestSystem`：主线《失落的守望者》（含双结局）与两条支线
- [x] 实现商人购买/出售交易系统与玩家经验升级系统
- [x] 单元测试验证任务流转、剧情分支、商店交易与升级计算，提交并推送 Stage 3

## Stage 4：古代墓穴地下城与 IndexedDB 存档系统
- [x] 实现独立地下城《古代墓穴》场景、石壁火把、机关宝箱与 Boss 战
- [x] 实现带版本号与迁移机制（`v1 -> v2`）的 IndexedDB `SaveSystem`
- [x] 支持完整保存与恢复玩家位置、区域、属性、背包、任务、剧情标记、宝箱、敌人死亡与已发现地点
- [x] 单元测试验证存档读写、Schema 迁移与地下城切换状态持久化，提交并推送 Stage 4

## Stage 5：视听体验优化、完整 UI 与端到端浏览器验证
- [x] 完善昼夜循环光照、天空雾效、粒子特效与 WebAudio 程序化音效
- [x] 完善全部 RPG UI（HUD、对话、商店、背包、任务日志、2D 世界地图、系统菜单）
- [x] 启动游戏并运行 Vitest + 生产构建 + Playwright 端到端浏览器验证
- [x] 更新全部文档，记录实测结果与待人工验收项，提交并推送最终版本

## Visual Overhaul (`feature/visual-overhaul`)：全面美术与 UI 重制
- [x] Phase A：基线审查、截图对比采集与 `VISUAL_AUDIT.md`
- [x] Phase B：程序化 PBR 材质库 (`MaterialLibrary`) 与 Low/Medium/High 三档画质系统 (`QualityManager`)
- [x] Phase C：中世纪木桁架建筑群与村庄环境叙事重制 (`ArchitectureBuilder`)
- [x] Phase D：极简探索 HUD、三栏背包、下三分之一电影化对话、分栏日志与羊皮纸地图 (`UIManager`, `IconRegistry`)
- [x] Phase E：`InstancedMesh` 多树种森林生态 (`VegetationBuilder`)、GLSL 天空穹顶着色器、角色/敌人/武器/墓穴精细升级
- [x] Phase F：回归测试、实测截图与性能对比、提交 Pull Request 至 `main`（待审阅合并）

## Ashenhold — 灰烬城：中世纪奇幻城市高密度重制
- [x] **Phase 1：城门与一条主街样板区（~40×60m 高品质垂直切片）**
  - [x] 建立 C99 + Python PBR 材质管线 (`scripts/city/texgen.c`, `generate_textures.py`)，生成 44 张无缝 512/1024 Albedo/Normal/Roughness 贴图与纹章招牌
  - [x] 建立 Blender 4.0 Python Headless GLB 建模管线 (`scripts/city/generate_models.py`)，含倒角 (`bmesh.ops.bevel`)、米制三平面 UV 与 BVH 光线投射顶点 AO (`COLOR_0`)，导出 20 个原创中世纪建筑与道具 `.glb` 模型
  - [x] 构建南城门 (`gatehouse.glb`)、八角侧翼防御塔 (`bastion_tower.glb`)、带木制悬楼的城墙 (`curtain_wall.glb`)、铁闸门、铆钉橡木大门、守卫与旗帜
  - [x] 构建门卫主街 (`Gateward Street`) 4 栋非对称中世纪建筑：南门卫戍营房（**可进入室内**，含壁炉燃木、铁吊灯、防御日志）、铁锚药剂与织物行（双层悬挑木骨结构 + 红白条纹遮阳篷 + 药商伊琳娜）、《余烬与酒壶》转角酒馆（**可进入室内**，含柱廊、凸窗、橡木吧台、酒桶架、壁炉燃木、吊灯与酒馆账簿）、铜炉与军需行会（弗拉芒阶梯山墙、拱门通道、二楼铁艺阳台与吊货梁）
  - [x] 实现带路拱、排水沟、花岗岩路缘、泥土碎石过渡与局部积水反射 (`onBeforeCompile` 四通道顶点混合着色器) 的城市地面 (`CityGroundBuilder`, `CityMaterialLibrary`)
  - [x] 实现 `GLTFLoader` + `InstancedMesh` 静态合批加载器 (`CityAssetLoader`, `CityPhase1Builder`)、完整 Rapier 物理碰撞（含室内门洞与阶梯）、局部暖光街灯/壁炉点光源与炊烟粒子
  - [x] 封闭街巷侧翼石墙与次级建筑、北端跨街木拱廊与远景领主主堡 (`Ashenhold Citadel Keep`) 天际线，保留原有开放世界并通过 `?zone=city` / 系统菜单 / 溪谷村传送路牌无缝切换
  - [x] 通过 Vitest 单元测试、生产构建与 Playwright 真实浏览器多视角截图及遥测验收
- [x] **Phase 2：光照重修与中央市集 / 200×240m 城市骨架 (`feature/ashenhold-phase2-market`)**
  - [x] 修复城市画面偏暗问题：接入球谐天空环境光探针 (`CityLighting` SH9)、分离顶点 AO 仅遮蔽间接光、金属/窗玻璃/水面专属 PMREM 反射、正午中性色调映射切换与 10:00 / 13:00 / 17:00 / 22:00 分时段光照调优
  - [x] 将城市骨架重规划为约 200×240 米带围合外城墙的可探索道路网络 (`CityRoadNetwork` + `cityLayout.json`)，明确区分实际可探索城区、闭锁的 Phase 3 领主内堡与墙外装饰远景，并可在城内 `[M]` 舆图实时查看
  - [x] 打造中央市集广场：10 座独立设计商摊、双层凤凰铁砧石质喷泉、市政宪章碑、圣伊格尼斯钟楼圣堂、石匠拱廊与 6 栋风格各异的环广场商铺立面
  - [x] 打通两条可选择探索环道（西线【铁匠工坊区】与东线【织坊居民高地】）及捷径小巷，含新增 5 名市集/工坊/高地/前庭 NPC、新商品与商店交易
  - [x] 实现分块地面、墙体实例化与按区静态材质合批 (`mergeGeometries`)，通过 Vitest、Playwright 连续穿城/交易/壁垒回归验收
- [ ] **Phase 3：领主城堡 (Lord's Citadel)**
  - [ ] 在既有高地石砌主堡、瞭望塔与瓮城前庭基础上，开启铁闸并构建城堡内庭院、守卫巡逻与可进入城堡大厅
- [ ] **Phase 4：居民与商业街区细节深化 (District Interiors & Expansion)**
  - [ ] 在既有东西街巷骨架上继续补充可进入的铁匠铺/酒馆分厅与室内生活设施
- [ ] **Phase 5：光照与天气 (Lighting & Weather States)**
  - [ ] 在已验证的 10:00/13:00/17:00/22:00 光照体系上深化雨天/雨后积水漫射等动态天气状态
- [ ] **Phase 6：场景整合 (World & Gameplay Integration)**
  - [ ] 完整整合城市 NPC 日程、城市支线任务线与跨城区剧情联动

## Ashenhold — 灰烬城紧凑型依山立体主城重设计 (`feature/ashenhold-hillside-redesign`)
- [x] **Redesign Phase 1：空间总规划与蓝图确认**（104×144m 五重台地 `0m → +3.5m → +7.5m → +12.2m → +18.0m`、A 类 8 栋 + B 类 12 栋分级室内清单、三环六捷径）
- [x] **Redesign Phase 2：紧凑依山高品质样板区**
  - [x] 重建 5 级山体台地地形 (`CityRoadNetwork`, `CityGroundBuilder`) 与 14 个山城定制 GLB 资产 (`scripts/city/hillside_kit.py`)
  - [x] 实现 Tier 0 南城门、S 形贸易街、A1 南门卫戍室（室内）、A2 双层余烬旅店（实机内梯上二楼观景阳台）、B1 商队货仓、B2 车夫歇脚棚
  - [x] 实现 Tier 0→1 门卫石阶与市集木石廊桥拱门、Tier 1 紧凑中央市集（凤凰喷泉 + 6 彩篷摊位 + A3 铁锚药剂堂完整室内与伊琳娜柜台）
  - [x] 实现北侧 4.2m 挡土石墙双折礼仪大石阶（Rapier `addStaticOrientedBox` 平滑斜坡碰撞）直抵 `+7.5m` 观景台，并呈现 Tier 2/3/4 依山天际线与 `< 28m` 内饰距离剔除
- [ ] **Redesign Phase 3：核心东西两翼（西工匠区 A5/B5–B7 + 东居民高地 A4/A6/B8–B11 屋顶连廊 + 酒馆二楼天桥与 +7.5m 悬空拱桥）**
- [ ] **Redesign Phase 4：高地圣堂与城堡区（A7 圣伊格尼斯圣堂/公会大厅与钟楼观景廊 + B12 抄本室 + 王道阶梯与 A8 城堡瓮城前厅）**
- [ ] **Redesign Phase 5：全功能 RPG 整合、双模式等高线舆图与最终发布验证**

## Ashenhold — Visual Fidelity V3 (`feature/ashenhold-art-direction-v3`)：史东薇尔式山城美术与四层立体关卡重制
- [x] **Stage A**：源码审计 `saltline-fable-5.2` 真实渲染机制（区分验证事实与原创迁移）、固定 6 机位 A–F 基线采集、编写 [ART_DIRECTION_V3.md](ART_DIRECTION_V3.md)
- [x] **Stage B**：重写 6 套无黑描边 Packed ORM PBR 山城材质 (`scripts/city/texgen_v3.c`, `generate_textures_v3.py`)；升级 `CityMaterialLibrary.ts`（世界空间双频宏观风化、竖直雨痕、顶面青苔、墙脚/暗渠湿润、近距微粒、6 档实时诊断模式）；新增线性 HDR Khronos Neutral ToneMapping + FXAA + 对比度自适应锐化 + 抖动单 Pass 后处理 (`CityPostFX.ts`)；编写 `scripts/city/stormveil_kit.py` 导出 12 个逐块 3D 凹凸砌石、阶梯扶壁、尖拱与残破垛口 Hero GLB
- [x] **Stage C**：重建四层零传送全步行贯通立体样板区（`-4.0m` 黑石拱顶排水暗渠 → `0.0m` 南门与曲街 → `+1.7/+5.2m` 透光双层酒馆 → `+3.5m` 哥特拱廊市集 → `+7.5m` 北堡垒观景台 → `+9.5m` 西城墙步道与跨街哥特石桥 → `+19.5m` 悬崖外梯直达北瞭望塔顶）
- [x] **Stage D & E**：全套 6 机位 Before vs After 截图、6 档材质/后处理诊断图、3 张四层立体机位图、Vitest 9/9（含全路径零传送 4 层物理连通测试）与 Playwright E2E 零传送实机验收
- [x] **Stage F**：同步文档与独立 PR 发布（不覆盖 `feature/ashenhold-hillside-redesign`，不合并 `main`）

## Ashenhold — Visual Polish V4 (`feature/ashenhold-visual-polish-v4`)：高品质环境美术精修与渲染质量提升
- [x] **Step 1 基线审计**：基于 V3 固定 8 组近景/中景机位（`Cam A–H`, `13:00`, `1280×720`, `High`）采集实机基线图与分离三通道遥测（`Main Pass` / `Shadow Pass` / `Post-FX Pass`），编写 [VISUAL_POLISH_V4.md](VISUAL_POLISH_V4.md)
- [x] **Step 2 多尺度 1024/512 PBR 贴图与 BMesh 雕刻重构**：编写 `scripts/city/texgen_v4.c` 生成 7 套 1024/512 双尺度法线 + 8 向 HBAO Packed ORM 材质（彻底消除整石假砖缝、灯芯绒斜纹与油亮细胞板岩，补齐 `iron_forged_v4` 锤击金属度贴图）；编写 `scripts/city/v4_sculpt_helpers.py`（`O(1)` 缺角倒棱条石、草边凸肚石、28° 层理裂解山崖、哥特十字肋拱、劈柴火盆与锻铁六角笼灯）导出 23 个精修 GLB
- [x] **Step 3 & 4 两轮可追踪实机视觉迭代与可见性裁剪**：完成 `Iteration 1 → 挑刺复盘 → Iteration 2` 全流程；实现 40° 西南斜射日光、36m 紧致阴影视锥、世界空间室内天光遮蔽、台地垂壁三平面投影、`-4m` 地底暗渠入口裁剪、室内静态合并与南北道具批次拆分（总面数与 Draw Calls 较 V3 下降 12%–30%）
- [x] **Step 5–7 管线四阶段验证、全量自动化测试与独立 PR 预览发布**：输出 `Raw → Tonemap → Tonemap+FXAA → Final` 四阶段与 PBR 通道诊断图、8 维度 1–5 诚实评分表，通过 TypeScript / Vitest 10 套件 / Vite Build / Playwright E2E 全量验证并发布独立分支预览与 PR

## Ashenhold — Interconnected City V5 (`feature/ashenhold-interconnected-city-v5`)：八大互联箱庭完整关卡建设与沉浸感升级
- [x] **Stage A — 八箱庭与 21 门户可见性架构 (`cityCells.json`, `cityPortals.json`, `CityPortalVisibility.ts`, `CityCellManager.ts`)**：实现带迟滞防抖（Hysteresis）、双门户共线深度裁剪、高处受控远景（Vista Mode）、6 点光源动态池与 `setCellDebug(true/false)` 3D 线框诊断的完整箱庭系统
- [x] **Stage B — 八大高密度箱庭几何、双层室内捷径与零传送立体连通 (`v5_interconnected_kit.py`, `build_v5_layout.py`, `CityGroundBuilder.ts`)**：保留 V4 美术品质，建成 `Cell 01` 折轴南门瓮城与双层东防御塔、`Cell 02` 曲街药剂堂/货仓后院/酒窖梯、`Cell 03` 双层行会商铺（1F→2F 通东翼）、`Cell 04` 双层铁炉大师锻坊（1F→2F 通西城墙）与木匠院、`Cell 05` 双层织坊跨巷天桥与水井内院、`Cell 06` 圣伊格尼斯大圣堂/四层可攀登钟楼（`+24.2m` 青铜大钟）/`+19.5m` 高架廊桥/公会馆、`Cell 07` 全开放领主城堡外庭/军械库四折悬崖秘梯（`+18m↔-4m`）/双层领主议事大殿/`+30.5m` 内堡塔冠、`Cell 08` 90m 地底暗渠网络与王室秘库
- [x] **Stage C — 程序化空间音频、室内混响与六材质脚步声 (`AmbientAudioManager.ts`, `SpatialAudioEmitter.ts`, `FootstepAudioSystem.ts`)**：实现 8 区域音床平滑淡变、8 类室内外混响切换、18 个带门户跨墙低通遮挡的 3D 声源、6 类地面材质脚步/跳跃/落地合成及 `[Esc]` 四通道混音器
- [x] **Stage D–F — 城市生活 NPC、跨箱庭任务、全路径无传送测试与独立 PR 发布**：配置 16 名鲜活 NPC、9 处文献、5 座持久化宝箱、支线《灰烬城宪章与秘道》与 `[M]` 八箱庭舆图；通过 `tsc`、Vitest 11 套件（31/31，含全 8 箱庭 `-4m↔+30.5m` 零传送闭环步行测试）、Playwright E2E（2/2）与 12 张实机截图验收，并创建独立分支预览与 PR（保留 V4 基线、不合并 `main`）

