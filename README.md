# Knowledge Desktop（桌面知识库工作台）

本地优先的 **知识库 + 内置浏览器工作台**（路线 A，MIT）。MVP core（PR #17）已合并。

Local-first **knowledge base + in-app browser workbench**. MIT.

## 文档 / Docs

| 文档 | 说明 |
|------|------|
| [docs/完整方案.md](docs/完整方案.md) | 产品与架构完整方案 v1.3 |
| [docs/技术评审.md](docs/技术评审.md) | 实施前完整技术评审 |
| [docs/仓库目录.md](docs/仓库目录.md) | 目标代码结构 |
| [docs/schema.sql](docs/schema.sql) | SQLite 表结构 |
| [docs/ipc.md](docs/ipc.md) | IPC 与本地快录 API |
| [docs/backup-format.md](docs/backup-format.md) | 导入导出 `knowledge-backup-v1` |

## 快速开始 / Run

需要 Node 20+ 与 [pnpm](https://pnpm.io)。

```bash
git clone https://github.com/timazc232/knowledge-desktop.git
cd knowledge-desktop
pnpm i
pnpm --filter @knowledge-desktop/desktop dev
# 或根脚本: pnpm dev
```

### 设置嵌入 API / Embed settings

打开 **设置**：配置 OpenAI-compatible Embedding API。

- 默认：`https://api.siliconflow.cn/v1` + 模型 `BAAI/bge-m3`
- 填入 API Key → **测试嵌入** → 成功后可自动补齐待嵌入条目
- 未配置 Key 时仍可用关键词（FTS）搜索；向量检索不可用

### 快捷键 / Hotkey

- **Ctrl+Shift+S**（macOS: Cmd+Shift+S）：从系统剪贴板快录入库

### 冒烟 / Smoke

```bash
pnpm --filter @knowledge-desktop/desktop knowledge:smoke
# 或: pnpm knowledge:smoke
```

另有：`pnpm db:smoke`、`pnpm vector:smoke`。

### 原生模块 / Native (Electron ABI)

`better-sqlite3` 需针对当前运行时编译：

- Node 冒烟（`knowledge:smoke` / `db:smoke`）：`pnpm rebuild better-sqlite3`
- Electron 窗口：`pnpm electron:rebuild`（内部 `@electron/rebuild`）

### 构建 / Build

```bash
pnpm --filter @knowledge-desktop/desktop build
# 或: pnpm build
```

### 打包 / Package

`apps/desktop/electron-builder.yml` 已存在（NSIS 目标）。完整 Windows NSIS 安装包仍见 **Issue #13**。

```bash
# 配置就绪后（Windows 宿主或 CI）:
pnpm --filter @knowledge-desktop/desktop build:win
```

## Issues

M0–M4 见 [Issues](https://github.com/timazc232/knowledge-desktop/issues)。

## License

MIT
