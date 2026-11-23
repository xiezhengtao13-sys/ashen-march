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
- [ ] **Phase 2：中央市集 (Central Market)**
  - [ ] 扩展主街北端拱门后的可探索中央市集广场
  - [ ] 增加多品类商铺摊位（布篷、陶器、布料、食物、木箱木桶）、中央喷泉/雕像、排水沟与市集商人 NPC
- [ ] **Phase 3：领主城堡 (Lord's Citadel)**
  - [ ] 构建城市高地天际线核心：石砌主堡、瞭望塔、扶壁、拱门、石阶、内庭院与可进入城堡大厅
- [ ] **Phase 4：居民与商业街区 (Residential & Commercial Districts)**
  - [ ] 扩展 15～25 栋不同高度、屋顶与立面构造的街巷建筑（铁匠铺、普通住宅、杂货店、曲折窄巷与更多可进入室内）
- [ ] **Phase 5：光照与天气 (Lighting & Weather States)**
  - [ ] 在精致白天场景基础上，开发黄昏、夜晚与雨后积水反射视觉状态
- [ ] **Phase 6：场景整合 (World & Gameplay Integration)**
  - [ ] 完整整合城市 NPC 日程、物理碰撞、多区域按需加载、城市支线任务与 IndexedDB 存档

