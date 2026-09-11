# Knowledge Desktop（桌面知识库工作台）

本地优先的 **知识库 + 内置浏览器工作台**（路线 A，MIT）。

## 文档

| 文档 | 说明 |
|------|------|
| [docs/完整方案.md](docs/完整方案.md) | 产品与架构完整方案 v1.3 |
| [docs/技术评审.md](docs/技术评审.md) | 实施前完整技术评审 |
| [docs/仓库目录.md](docs/仓库目录.md) | 目标代码结构 |
| [docs/schema.sql](docs/schema.sql) | SQLite 表结构 |
| [docs/ipc.md](docs/ipc.md) | IPC 与本地快录 API |
| [docs/backup-format.md](docs/backup-format.md) | 导入导出 `knowledge-backup-v1` |

## 开发（M0）

需要 Node 20+ 与 [pnpm](https://pnpm.io)。

```bash
pnpm install
pnpm db:smoke        # SQLite + FTS 冒烟
pnpm vector:smoke    # 向量后端冒烟（sqlite-vec → lance → memory）
pnpm dev             # 打开 Electron 窗口
```

向量后端优先尝试 `sqlite-vec`，失败则 `@lancedb/lancedb`，再失败则内存后端（仅保证 M0 冒烟不阻塞）。

## Issues

M0–M4 见 [Issues](https://github.com/timazc232/knowledge-desktop/issues)。

## License

MIT
