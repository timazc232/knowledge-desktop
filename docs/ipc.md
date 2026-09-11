# IPC / 本地 API 清单（v1.2）

## Renderer ↔ Main（contextBridge `window.api`）

### 知识
| 通道 | 方向 | 载荷 | 说明 |
|------|------|------|------|
| `knowledge:create` | invoke | `{ title?, body, source_url?, source_type, tags? }` | 创建并入队 |
| `knowledge:update` | invoke | `{ id, title?, body?, tags? }` | 更新；正文变则重向量化 |
| `knowledge:delete` | invoke | `{ id }` | 级联删 chunk/向量 |
| `knowledge:get` | invoke | `{ id }` | 详情 |
| `knowledge:list` | invoke | `{ cursor?, limit?, source_type?, tag? }` | 浏览分页 |
| `knowledge:search` | invoke | `{ query, topK? }` | 混合检索 |
| `knowledge:retryEmbed` | invoke | `{ id } \| { allPending: true }` | 失败/补齐 |
| `knowledge:listTop` | invoke | `{ limit? }` | 常用 TopN（home_pin > open_count > last_opened_at > updated_at） |
| `knowledge:recordOpen` | invoke | `{ id }` | 打开计数 +1，写 last_opened_at |
| `knowledge:setHomePin` | invoke | `{ id, pin }` | 首页置顶 0..3（最多 3） |
| `knowledge:onIngestProgress` | on | `{ jobId, itemId, status, error? }` | 进度事件 |

### 快录
| 通道 | 方向 | 载荷 | 说明 |
|------|------|------|------|
| `clip:fromSelection` | invoke | `{ text, url?, title? }` | 应用内右键 |
| `clip:fromClipboard` | invoke | `{}` | 快捷键；Main 读 clipboard |
| `clip:readText` | invoke | — | 只读剪贴板，不入库 |
| `clip:showDialog` | send/on | 预填内容 | 打开确认弹窗 |
| `clip:shortcutStatus` | on | `{ registered, message? }` | 全局快捷键注册结果 |

### 浏览器标签
| 通道 | 方向 | 载荷 | 说明 |
|------|------|------|------|
| `tabs:list` | invoke | — | |
| `tabs:create` | invoke | `{ url?, pinned? }` | |
| `tabs:close` | invoke | `{ id }` | |
| `tabs:activate` | invoke | `{ id }` | 必要时 wake |
| `tabs:navigate` | invoke | `{ id, url }` | |
| `tabs:back/forward/reload` | invoke | `{ id }` | |
| `tabs:onUpdated` | on | tab DTO | title/url/sleeping |

### 书签
| 通道 | 方向 | 载荷 |
|------|------|------|
| `bookmarks:list/create/update/delete/reorder` | invoke | 常规 CRUD |

### 备份
| 通道 | 方向 | 载荷 | 说明 |
|------|------|------|------|
| `backup:export` | invoke | `{ kind: 'full'\|'text_only', path? }` | 弹保存对话框 |
| `backup:import` | invoke | `{ path, conflict: 'skip'\|'overwrite'\|'copy' }` | |

### 设置
| 通道 | 方向 | 载荷 |
|------|------|------|
| `settings:get/set` | invoke | 含 embedding 配置；secret 经 safeStorage |
| `settings:testEmbedding` | invoke | 冒烟一条向量 |

## Local HTTP（扩展 / 自动化）

- `GET /v1/health` → `{ ok, version }`
- `POST /v1/clip` Header `Authorization: Bearer <token>`  
  Body `{ text: string, url?: string, title?: string }` → `{ itemId }`
- 仅 `127.0.0.1`；端口写入 `%APPDATA%/.../local-api.json` 供扩展读取
