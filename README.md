# Ashen March — 灰烬边境

> 一款运行于桌面浏览器的原创 3D 西方奇幻单人动作角色扮演游戏（ARPG）框架，受《上古卷轴》系列开放探索与系统驱动设计理念启发，采用程序化生成、轻量化渲染与纯客户端数据驱动架构构建。

## 核心特性

- **第一人称 3D 自由探索**：真实 Rapier 3D 物理碰撞、重力、斜坡行走与可进入建筑/地下城。
- **五个特色区域（512 × 512 米固定种子世界）**：
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
- **3D 渲染与动画**：Three.js (`WebGL2`, `THREE.AnimationMixer`)
- **物理引擎**：Rapier 3D (`@dimforge/rapier3d-compat`)
- **持久化存储**：IndexedDB
- **测试框架**：Vitest + jsdom + fake-indexeddb / Playwright

## 快速启动

```bash
# 安装依赖
npm install

# 启动开发服务器 (http://127.0.0.1:5173)
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
| `E` | 交互（对话、开箱、拾取、进出建筑/墓穴） |
| `I` | 打开/关闭背包与装备界面 |
| `J` | 打开/关闭任务日志 |
| `M` | 打开/关闭世界地图 |
| `Esc` | 系统菜单（存档/读档/解锁鼠标） |

## 项目文档

- [游戏设计文档 (GDD)](docs/GDD.md)
- [技术架构文档 (ARCHITECTURE)](docs/ARCHITECTURE.md)
- [开发路线图 (ROADMAP)](docs/ROADMAP.md)
- [开发日志 (DEVELOPMENT_LOG)](docs/DEVELOPMENT_LOG.md)
