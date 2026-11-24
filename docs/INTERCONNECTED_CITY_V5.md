# Ashenhold V5 — 互联箱庭城市、完整关卡建设与沉浸感升级设计实录

## 1. 设计目标与开发重心转移

在 **Ashenhold Visual Polish V4** 完成 BMesh 雕刻条石/断崖、1024/512 多尺度 HBAO Packed ORM 材质与线性 HDR 后处理管线后，**Ashenhold V5 (`feature/ashenhold-interconnected-city-v5`)** 完整保留 V4 美术资产与着色器成果，将重心转向 **完整 RPG 主城关卡建设、多箱庭互联（Cell & Portal）、垂直室内探索、空间音频与城市生活沉浸感**。

核心设计参考：
- **Elden Ring — Stormveil Castle**：多层立体路线、城墙垛道、建筑内部穿行捷径与悬崖秘梯。
- **Dark Souls III — High Wall of Lothric**：利用折轴瓮城、挡墙、拱门与街角切割视距，实现高密度箱庭互联。
- **Dishonored 2**：双层商铺/住宅穿行、二楼跨街天桥、阳台与屋顶横向连接。
- **Saltline**：短视距精细局部场景与程序化空间环境音营造的沉浸感。

---

## 2. 八大互联箱庭（Cells 01–08）与 21 道门户（Portals P01–P21）

全城划分为 **8 个由高墙、断崖与建筑围合的箱庭（Cells）**，普通街道视距严格控制在 `18–52m`，仅在圣堂前庭、钟楼顶层（`+24.2m`）与城堡塔冠（`+30.5m`）开放受控远景（Vista Mode）：

| Cell ID | 区域名称 | 标高范围 | 核心可进入建筑与立体路线 |
| --- | --- | --- | --- |
| `cell_01_barbican_gate` | 南城门与曲轴瓮城 | `0.0m → +9.5m` | 折轴南外门（`x=-6.2, z=31.2`）+ 瓮城迎面照壁挡墙（阻断直视城内）+ 内城门 + **可进入西卫兵室（1F）** + **可进入东防御塔（1F → +4.8m → +9.5m 城墙步道）** + 西侧暗渠石阶口（`P03`） |
| `cell_02_trade_street` | 贸易街与余烬酒馆 | `+0.2m → +9.5m` | S 形曲街 + **可进入双层余烬酒馆** + **可进入西侧三层悬挑药剂堂** + **可进入东侧商队货仓与后院** + 酒窖石阶（`P07`）+ 跨街哥特石桥（`+9.5m`）及东西翼天桥（`P08 / P10`） |
| `cell_03_market_plaza` | 中央市集广场 | `+3.5m → +7.5m` | 哥特拱廊围合广场 + 八角石喷泉 + 6 座商摊 + **可进入双层市集行会烘焙商铺（1F 市集进 → 室内木梯 → 2F 东门直通 Cell 05 居民高地！）** + 4 向立体门户 |
| `cell_04_artisan_quarter` | 西翼工匠与铁匠高地 | `+7.0m → +10.5m` | **可进入双层铁炉大师锻坊（1F 双烟囱红热熔炉与铁砧 → 室内木梯上 2F 阁楼直通西城墙步道 `P10`！）** + 半开放木匠与制桶作业院 + 北崖石阶通圣堂（`P16`） |
| `cell_05_residential_heights` | 东翼居民阶梯街区 | `+7.5m → +11.0m` | 狭窄阶梯民居巷 + **可进入双层织坊住宅（1F 织机厅 → 2F 跨巷木天桥直达 `+11.0m` 上层露台！）** + 拱门暗巷与水井内院 + **可进入居民小屋** + 晾衣绳生活细节 + 北石阶通圣堂（`P17`） |
| `cell_06_temple_acropolis` | 圣堂与钟楼高地 | `+12.2m → +24.2m` | 圣堂观景前庭 + **可进入圣伊格尼斯大圣堂（十字肋拱中殿）** + **可攀登四层大钟楼（`+12.2m → +16.0m → +19.5m 高架石廊桥 → +24.2m 敞轩钟楼顶层可敲响青铜大钟`）** + **可进入市政公会抄本馆** + 王道礼仪大石阶（`P18`） |
| `cell_07_lord_castle` | 领主城堡外庭与主殿 | `+18.0m → +30.5m` | **真正可自由探索城堡区**：外瓮城门楼与 `+23.5m` 雉堞步道 + 外庭院 + **可进入西近卫营房** + **可进入东军械库（内藏 `+18m ↔ -4m` 四折悬崖秘梯直通地底王室秘库！）** + **可进入双层领主议事大殿（`+21m → +25.5m 回廊`）** + **可攀登西内堡瞭望塔冠（`+30.5m`）** |
| `cell_08_undercroft_cellars` | 地下暗渠、酒窖与秘库 | `-4.0m` | 中央黑石拱顶蓄水暗渠 + 南瓮城暗道 + 东酒馆橡木桶酒窖 + 90m 北向城堡排水暗道 + **王室地底秘库**（全城共 **5 处真实石阶非传送出入口**） |

---

## 3. Cell & Portal 可见性裁剪与渲染预算控制

- **门户图遍历 (`src/world/city/CityPortalVisibility.ts`)**：
  - 当前所在 Cell 含 `0.75–2.5m` 迟滞带（Hysteresis），彻底避免边界抖动。
  - 一阶门户（Depth-1）按相机视锥角与 `maxSightDist` 判定开闭；二阶门户（Depth-2）要求双门户视线共线（`align >= 0.52`），转角与折轴自动遮挡。
  - 高处俯瞰点（`y >= overlookMinY`）自动开启受控远景轮廓（Vista Cells），地底暗渠深处自动裁剪全部地表建筑。
- **按箱庭动态管理 (`src/world/city/CityCellManager.ts`)**：
  - 按帧驱动建筑外壳、`<28m` 室内家具包、区域道具实例、NPC 可见性与固定 **6 盏 GPU 点光源池**平滑分配。
  - 支持控制台实时调用 `window.__ASHEN_MARCH__.setCellDebug(true | false)` 开启 3D 彩色 Cell 包围盒与绿/红门户线框诊断视图。

---

## 4. 程序化空间音频、混响与六材质脚步声系统

完全基于原生 WebAudio API 零外部音频文件合成：
- **`src/audio/AmbientAudioManager.ts`**：8 大区域环境音床平滑交叉淡入淡出（1.4s）+ 室内包围盒优先混响切换（`outdoor_alley` / `outdoor_courtyard` / `semi_open_yard` / `high_cliff` / `timber_tavern` / `cathedral_stone` / `great_hall_stone` / `damp_undercroft_tunnel`）+ 四通道音量控制（主音量 / 环境音 / 音效 / UI，集成于 `[Esc]` 菜单）。
- **`src/audio/SpatialAudioEmitter.ts`**：18 个 3D 空间声源（铁砧锻打、熔炉轰鸣、木匠锯木、市集喷泉、酒馆喧哗与鲁特琴、火盆噼啪、圣堂低吟、钟楼大钟余韵、暗渠滴水），结合门户图计算跨墙低通滤波遮挡（`computeAcousticOcclusion`）。
- **`src/audio/FootstepAudioSystem.ts`**：实时识别脚下 **6 类材质**（`stone_flagstone` 石板、`stone_stair` 石阶、`wood_plank` 室内木地板、`dirt` 泥土、`grass` 草地、`shallow_water` 喷泉/暗渠浅水），区分行走、奔跑、起跳与落地声学包络。

---

## 5. 城市生活气息与完整 RPG 闭环

- **鲜活 NPC 行为 (`src/npc/NPCSystem.ts`, `src/data/npcs.json`)**：全城配置 16 名 NPC，包含巡逻卫兵、市集漫步市民、挥锤打铁的布伦南、拉锯作业的木匠霍尔特、公会抄本学者欧文与城堡总管瓦伦，并对玩家保持非阻塞礼让。
- **跨箱庭城市支线 (`side_city_citadel_accord`)**：《灰烬城宪章与秘道》串联南门、贸易街、高地公会与领主大殿。
- **探索奖励与文献**：全城布置 **9 处可读文献/公告板** 与 **5 座持久化宝箱**（东防御塔军需箱、铁匠二楼秘藏箱、居民内院传家箱、暗渠蓄水池铁箱、王室秘库金饰箱），状态完整写入 IndexedDB 存档。

---

## 6. 八箱庭实机渲染遥测表（`1280×720`, `High`, `SwiftShader CPU Software`）

> **渲染后端透明说明**：以下数据采集自云服务器无独立显卡环境下的 Headless Chrome WebGL2（`SwiftShader (CPU Software)`）。在整座城市规模较 V4 扩展逾 3 倍的前提下，依靠 Cell & Portal 裁剪，绝大多数箱庭的 `Main Pass` 保持在 `33–280 Draw Calls / 80k–380k Triangles`。

| 实机截图 | 所在箱庭 (`activeCellId`) | 可见箱庭数 | Shadow Pass (DC / Tris) | Main Pass (DC / Tris) | Total (DC / Tris) | 音频混响 (`reverb`) |
| --- | --- | --- | --- | --- | --- | --- |
| `v5_cell01_barbican.png` | `cell_01_barbican_gate` | 2 | `70 / 144,676` | `201 / 209,635` | `272 / 354,313` | `outdoor_courtyard` |
| `v5_cell02_trade_street.png` | `cell_02_trade_street` | 4 | `124 / 213,186` | `404 / 321,615` | `529 / 534,803` | `outdoor_alley` |
| `v5_cell03_market_plaza.png` | `cell_03_market_plaza` | 5 | `152 / 255,144` | `280 / 380,947` | `433 / 636,093` | `outdoor_courtyard` |
| `v5_cell04_artisan_forge.png` | `cell_04_artisan_quarter` | 1 | `40 / 48,246` | `101 / 80,935` | `142 / 129,183` | `semi_open_yard` |
| `v5_cell05_residential_heights.png` | `cell_05_residential_heights` | 2 | `98 / 119,262` | `45 / 155,299` | `144 / 274,563` | `outdoor_alley` |
| `v5_cell06_temple_acropolis.png` | `cell_06_temple_acropolis` | 3 | `76 / 233,996` | `95 / 246,292` | `172 / 480,290` | `high_cliff` |
| `v5_cell06_belfry_overlook.png` (`+24.2m` 全景) | `cell_06_temple_acropolis` | 7 (Vista) | `82 / 282,430` | `533 / 585,967` | `616 / 868,399` | `cathedral_stone` |
| `v5_cell07_lord_castle.png` | `cell_07_lord_castle` | 1 | `31 / 97,512` | `61 / 118,596` | `93 / 216,110` | `high_cliff` |
| `v5_cell07_great_hall_interior.png` | `cell_07_lord_castle` | 1 | `31 / 97,512` | `49 / 109,484` | `81 / 206,998` | `great_hall_stone` |
| `v5_cell08_undercroft_vault.png` (`-4.0m`) | `cell_08_undercroft_cellars` | 2 | `32 / 97,524` | `33 / 123,196` | `66 / 220,722` | `damp_undercroft_tunnel` |
