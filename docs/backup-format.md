# knowledge-backup-v1

## Zip 布局

```
manifest.json
items.jsonl
chunks.jsonl      # optional
embeddings.jsonl  # optional: { "chunk_id", "vector": [float, ...] }
bookmarks.jsonl   # optional
README.txt
```

## manifest.json 示例

```json
{
  "format": "knowledge-backup-v1",
  "exported_at": "2026-09-11T01:00:00.000Z",
  "app_version": "0.1.0",
  "item_count": 42,
  "chunk_count": 180,
  "has_embeddings": true,
  "embedding_model": "BAAI/bge-m3",
  "vector_dim": 1024,
  "vector_backend_hint": "sqlite-vec",
  "includes_secrets": false
}
```

## 规则

- **禁止**写入 API Key、local token
- `items.jsonl` 每行一个 item 对象，字段对齐 `knowledge_items`
- 换机后模型/dim 不一致时：忽略 embeddings，重建向量
