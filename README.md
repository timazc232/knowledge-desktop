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

- **Ctrl/Cmd+K**：聚焦知识首页搜索框（在浏览页会先切回知识）
- **Ctrl+Shift+S**（macOS: Cmd+Shift+S）：从系统剪贴板打开快录 Modal（不离开当前页）；侧栏「快录」同效。全局注册失败时窗口内 `before-input-event` / 渲染进程仍可用。

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

### 打包 / Package（Windows NSIS）

配置见 `apps/desktop/electron-builder.yml`（可改安装目录、桌面/开始菜单快捷方式；`schema.sql` 经 `extraResources` + `copy-assets` 打入包内；`better-sqlite3` / `sqlite-vec` 走 `asarUnpack`）。

```bash
# 校验配置（任意 OS，不产出安装包）:
pnpm --filter @knowledge-desktop/desktop pack:config-check

# 产出 NSIS 安装包（需 Windows 宿主，或 Linux + Wine）:
pnpm --filter @knowledge-desktop/desktop build:win
# 产物: apps/desktop/dist/Knowledge Desktop-<version>-setup.exe

# 仅解包目录（调试用，仍需 Windows 目标工具链）:
pnpm --filter @knowledge-desktop/desktop build:win:dir
```

> **Linux CI 说明**：本仓库的 Linux 环境通常没有 Wine，无法完成 NSIS 安装包链接（`spawn wine ENOENT`）。`electron-builder` 仍可校验配置并产出 `dist/win-unpacked/`（含 `Knowledge Desktop.exe` + `resources/schema.sql`），但 **完整 `*-setup.exe` 请在 Windows 10/11 上** 运行 `build:win`。务必在 Windows 宿主打包，以便装上 `sqlite-vec-windows-x64`（Linux 交叉打包会带错平台扩展）。未签名安装包可能触发 SmartScreen，属预期。

## Issues

M0–M4 见 [Issues](https://github.com/timazc232/knowledge-desktop/issues)。

## License

MIT
