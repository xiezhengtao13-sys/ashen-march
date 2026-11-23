# 开发日志 (DEVELOPMENT_LOG)

## 2026-11-23 — Stage 0: 工程初始化启动
- 完成环境工具校验：`git 2.54.0`、`node v24.14.1`、`npm 11.11.0`、`gh 2.104.0`（账号 `xiezhengtao13-sys`）。
- 创建私有 GitHub 仓库：`https://github.com/xiezhengtao13-sys/ashen-march`。
- 初始化工程目录结构、TypeScript/Vite/Vitest 配置以及 GDD、ARCHITECTURE、ROADMAP、AGENTS 文档。
- 完成 Stage 0：编写 `EventBus`、`SeededRandom`、`GameState`、静态数据配置 (`src/data/*.json`) 与初始 WebGL2 Three.js 场景入口。
- 测试验证：`npm run typecheck` 通过，`npm test` 3/3 通过，`npm run build` 打包成功。
- 下一步：进入 Stage 1（可探索世界、地形生成器、Rapier 3D 物理碰撞与第一人称角色控制）。
