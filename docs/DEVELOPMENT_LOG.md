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
- 下一步：进入 Stage 2（战斗系统、火球法术、敌人 AI 状态机、背包与装备系统）。
