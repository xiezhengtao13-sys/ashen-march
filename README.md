# Ashen March — 灰烬边境

> 一款运行于桌面浏览器的原创 3D 西方奇幻单人动作角色扮演游戏（ARPG）框架，受《上古卷轴》系列开放探索与系统驱动设计理念启发，采用程序化生成、轻量化渲染与纯客户端数据驱动架构构建。

## ▶ 一键在线游玩（浏览器直玩）

[![立即在线游玩 - Ashen March](https://img.shields.io/badge/▶_立即在线游玩-Ashen_March_灰烬边境-d9a043?style=for-the-badge)](https://xiezhengtao13-sys.github.io/ashen-march/)
[![一键试玩 - 灰烬城 Interconnected City V5 完整八箱庭版](https://img.shields.io/badge/▶_最新试玩_灰烬城_V5-八大互联箱庭完整主城-4a1d15?style=for-the-badge)](https://xiezhengtao13-sys.github.io/ashen-march/preview/ashenhold-interconnected-city-v5/?zone=city)
[![一键试玩 - 灰烬城 Visual Polish V4 环境精修基线](https://img.shields.io/badge/▶_对比基线_灰烬城_V4-高品质环境美术精修版-6b2218?style=for-the-badge)](https://xiezhengtao13-sys.github.io/ashen-march/preview/ashenhold-visual-polish-v4/?zone=city)
[![一键试玩 - 灰烬城 Visual Fidelity V3 基线](https://img.shields.io/badge/▶_对比基线_灰烬城_V3-史东薇尔式四层山堡-8f2d1f?style=for-the-badge)](https://xiezhengtao13-sys.github.io/ashen-march/preview/ashenhold-art-direction-v3/?zone=city)
[![一键试玩 - 灰烬城山城重设计 Phase 2 基线](https://img.shields.io/badge/▶_灰烬城基线-Phase_2_依山样板区-b54524?style=for-the-badge)](https://xiezhengtao13-sys.github.io/ashen-march/preview/ashenhold-hillside-redesign/?zone=city)

- **开放世界试玩入口（溪谷村出生点）**：https://xiezhengtao13-sys.github.io/ashen-march/
- **最新入口 — 灰烬城 Interconnected City V5 (`feature/ashenhold-interconnected-city-v5` · 八大互联箱庭完整关卡与空间音频升级)**：
  - **一键在线试玩（完整保留 V4 雕刻材质品质，建成 Cell 01–08 八大高墙围合箱庭、折轴南门瓮城、双层室内穿行捷径、+24.2m 可敲钟大钟楼、+30.5m 可自由探索领主城堡与议事大殿、+18m↔-4m 四折悬崖秘梯与王室秘库、Cell & Portal 裁剪及 WebAudio 空间音频/六材质脚步声）**：https://xiezhengtao13-sys.github.io/ashen-march/preview/ashenhold-interconnected-city-v5/?zone=city
  - **V4 环境美术精修基线预览**：https://xiezhengtao13-sys.github.io/ashen-march/preview/ashenhold-visual-polish-v4/?zone=city
  - **V3 基线对比预览**：https://xiezhengtao13-sys.github.io/ashen-march/preview/ashenhold-art-direction-v3/?zone=city
  - **Phase 2 山城基线对比预览**：https://xiezhengtao13-sys.github.io/ashen-march/preview/ashenhold-hillside-redesign/?zone=city
  - **调试与诊断接口**：打开浏览器控制台可调用 `window.__ASHEN_MARCH__.setCellDebug(true | false)` 查看 3D 箱庭包围盒与门户开闭线框、`getCellTelemetry()` / `getAudioDiagnostics()` 查看分箱庭裁剪与空间音频状态，以及 `setDebugMode('albedo' | 'normal' | 'roughness' | 'no_ao' | 'no_post' | 'final')` 检查 PBR 通道。
- **零安装直玩**：由 GitHub Actions 自动构建并托管于 GitHub Pages，点击上方按钮即可在桌面浏览器（支持 WebGL2）中直接运行，存档自动保存于浏览器本地 IndexedDB。

## 核心特性

- **灰烬城 Interconnected City V5（八大互联箱庭完整主城）**：在完整保留 V4 1024/512 HBAO Packed ORM 材质与 BMesh 雕刻几何品质的基础上，建成 **8 个相互连接的高密度箱庭（`-4.0m` 地底暗渠秘库 → `0m` 折轴瓮城 → `+1.6m` 曲折贸易街 → `+3.5m` 拱廊市集 → `+7m` 双层铁匠工坊 → `+7.5m/+11m` 阶梯居民区与跨巷天桥 → `+12.2m/+24.2m` 圣堂与四层大钟楼 → `+18m/+30.5m` 可进入领主城堡议事大殿）**，配套 `CityPortalVisibility` 门户裁剪、程序化 WebAudio 空间声源遮挡与六材质脚步声、16 名鲜活城市 NPC 及跨箱庭支线《灰烬城宪章与秘道》（详情见 [INTERCONNECTED_CITY_V5.md](docs/INTERCONNECTED_CITY_V5.md) 与 [VISUAL_POLISH_V4.md](docs/VISUAL_POLISH_V4.md)）。
- **第一人称 3D 自由探索**：真实 Rapier 3D 物理碰撞、重力、斜坡行走与可进入建筑/地下城。
- **五个特色区域（512 × 512 米固定种子世界，完整保留）**：
  - **溪谷村 (Ravendale Village)**：玩家出生点、可进入的村长长屋、铁匠铺、猎人小屋与水井广场。
  - **灰木森林 (Ashwood Forest)**：程序化多层松树/橡树/枯木林、哥布林营地、草药与隐秘祭坛。
  - **废弃哨塔 (Ruined Watchtower)**：高地石砌遗迹，可沿阶梯攀登探索，燃起的信号火盆与守望者日志线索。
  - **古代墓穴 (Ancient Crypt)**：独立地下城区域，石砌走廊、壁挂火把、骷髅战士、墓穴守卫 Boss 与守望者圣物。
  - **河谷区域 (River Valley)**：雕刻河道、木桥、河谷乱石、草药采集点与隐藏宝箱。
- **实时战斗与魔法**：单手剑近战挥砍（`AnimationMixer` 动画、范围与扇形判定）、火球术法术投射与爆炸粒子。
- **完整 RPG 系统**：生命/法力/耐力/经验/等级成长、金币、武器/护甲/饰品穿戴、药水使用、物品丢弃拾取、商人交易。
- **条件驱动对话与分支任务**：主线任务《失落的守望者》（含交还圣物 / 保留圣物双结局选择）与两条完整支线。
- **昼夜循环、环境氛围与程序化音效**：实时太阳/月亮光照、指数雾效、火把闪烁与 Web Audio API 音效。
- **本地存档系统**：基于 IndexedDB 的多槽位版本化存档与迁移机制（`v1 -> v2`）。

## 技术栈

- **语言与构建**：TypeScript + Vite
- **3D 渲染与动画**：Three.js (`WebGL2`, `THREE.AnimationMixer`, `GLTFLoader`)
- **离线资产管线**：Blender 4.0 Python (`bmesh`) + C99 / Pillow PBR 纹理生成器（`scripts/city/`）
- **物理引擎**：Rapier 3D (`@dimforge/rapier3d-compat`)
- **持久化存储**：IndexedDB
- **测试框架**：Vitest + jsdom + fake-indexeddb / Playwright

## 快速启动

```bash
# 安装依赖
npm install

# 启动开发服务器
# - 原开放世界入口: http://127.0.0.1:5173/
# - 灰烬城 Phase 2 直达入口: http://127.0.0.1:5173/?zone=city
npm run dev

# 类型检查
npm run typecheck

# 运行单元测试
npm test

# 构建生产版本
npm run build

# 运行 Playwright 端到端测试（需先安装浏览器或使用已有环境）
npm run test:e2e
```

## 默认操作键位

| 按键 | 功能 |
| --- | --- |
| `W / A / S / D` | 移动 |
| `鼠标` | 视角旋转（点击画面锁定指针，或按住左键拖拽） |
| `Shift` | 奔跑 |
| `Space` | 跳跃 |
| `鼠标左键` | 近战挥砍 |
| `鼠标右键` | 施放火球术 |
| `E` | 交互（对话、开箱、拾取、进出建筑/墓穴/城门传送） |
| `I` | 打开/关闭背包与装备界面 |
| `J` | 打开/关闭任务日志 |
| `M` | 打开/关闭地图（在开放世界显示大地图，在灰烬城显示街道与边界舆图） |
| `Esc` | 系统菜单（存档/读档/画质切换/一键前往灰烬城） |

## 项目文档

- [游戏设计文档 (GDD)](docs/GDD.md)
- [灰烬城 V5 互联箱庭与空间音频实录 (INTERCONNECTED_CITY_V5)](docs/INTERCONNECTED_CITY_V5.md)
- [灰烬城 V4 环境美术精修报告 (VISUAL_POLISH_V4)](docs/VISUAL_POLISH_V4.md)
- [灰烬城总规划 (ASHENHOLD_MASTER_PLAN)](docs/ASHENHOLD_MASTER_PLAN.md)
- [技术架构文档 (ARCHITECTURE)](docs/ARCHITECTURE.md)
- [开发路线图 (ROADMAP)](docs/ROADMAP.md)
- [开发日志 (DEVELOPMENT_LOG)](docs/DEVELOPMENT_LOG.md)

## 当前验证状态

- `npm run typecheck`: 通过 (`tsc --noEmit`，0 错误)
- `npm test`: **11 个测试套件共 31 项单元测试全部通过**（含 V5 八大箱庭 120+ 路点无传送物理闭环、21 门户裁剪/迟滞/声学跨墙遮挡、六材质脚步与室内混响、跨箱庭任务流转、V4 Packed ORM 与 IndexedDB 存档迁移）
- `npm run build`: 生产包构建通过 (`vite build`)
- `npm run test:e2e`: **2 项 Playwright + Chrome WebGL2 端到端测试全部通过**（1. 开放世界主线/战斗/墓穴/画质/IndexedDB 存档；2. 灰烬城 V5 南外门弯折瓮城裁剪校验 → 无传送连续步行穿越 `Cell 01→02→08(-4m)→03→04→06→07(+21m)` → 商店交易 → 3D 门户调试线框 → `[M]` 八箱庭舆图 → `[Esc]` 四通道混音器，0 控制台/页面错误）
- **性能实测说明（CPU SwiftShader vs 硬件 GPU）**：本云端验证环境运行于 headless Chrome `SwiftShader (CPU Software)` 软件光栅化；在全城规模较 V4 扩展逾 3 倍的前提下，依靠 Cell & Portal 裁剪，`1280×720 High` 档下各箱庭主通道（`Main Pass`）稳定控制在 `33–280 Draw Calls / 81k–381k Triangles`（如南瓮城 `201 DC / 210k Tris`、双层铁匠工坊 `101 DC / 81k Tris`、居民巷 `45 DC / 155k Tris`、领主大殿室内 `49 DC / 109k Tris`、地底秘库 `33 DC / 123k Tris`）。桌面硬件 GPU（WebGL2）上的 1080p 60 FPS 实际帧率待真机确认。
