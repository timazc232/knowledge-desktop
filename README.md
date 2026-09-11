# Knowledge Desktop（桌面知识库工作台）

本地优先的 **知识库 + 内置浏览器工作台**：录入后自动向量化，支持搜索/浏览；多标签打开 ChatGPT / Grok / Gemini 等；应用内划词入库，并支持导出到另一台电脑导入。

> 当前仓库阶段：**设计文档**（路线 A，不 fork Cherry Studio）。实现代码将按 `docs/仓库目录.md` 落地。

## 文档

| 文档 | 说明 |
|------|------|
| [docs/完整方案.md](docs/完整方案.md) | 产品与架构完整方案 v1.3 |
| [docs/仓库目录.md](docs/仓库目录.md) | 目标代码结构 |
| [docs/schema.sql](docs/schema.sql) | SQLite 表结构 |
| [docs/ipc.md](docs/ipc.md) | IPC 与本地快录 API |
| [docs/backup-format.md](docs/backup-format.md) | 导入导出 `knowledge-backup-v1` |
| [docs/技术评审.md](docs/技术评审.md) | 实施前完整技术评审与里程碑重切 |

## 技术选型（摘要）

- Electron + React/TypeScript
- SQLite + FTS5 + sqlite-vec（失败则 LanceDB）
- WebContentsView 多标签（含休眠）
- MIT 许可方向；不引入 AGPL 代码

## 状态

- [x] 路线选择与完整方案
- [x] 自评修订（休眠 / 划词兜底 / 向量备选）
- [x] 导入导出规格
- [ ] Electron 脚手架
- [ ] MVP 实现

## License

Documentation and forthcoming code intended as MIT（以仓库 LICENSE 为准）。
