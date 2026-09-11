/**
 * Smoke: createVectorBackend, upsert one vector, knn retrieve.
 * Run: pnpm vector:smoke
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createVectorBackend } from './vector-backend.js'

async function main() {
  const dim = 8
  const tmpRoot = path.join(os.tmpdir(), `kd-vec-smoke-${Date.now()}`)
  fs.mkdirSync(tmpRoot, { recursive: true })

  const backend = await createVectorBackend({
    dim,
    dbPath: path.join(tmpRoot, 'vec.sqlite'),
    lanceDir: path.join(tmpRoot, 'lance'),
  })

  const embedding = Array.from({ length: dim }, (_, i) => (i === 0 ? 1 : 0))
  await backend.upsert([{ id: 'v1', embedding }])
  const hits = await backend.knn(embedding, 3)
  console.log('[vector:smoke] backend=', backend.name, 'hits=', hits)

  await backend.close()
  fs.rmSync(tmpRoot, { recursive: true, force: true })

  if (!hits.length || hits[0]?.id !== 'v1') {
    console.error('[vector:smoke] FAIL')
    process.exit(1)
  }
  console.log('[vector:smoke] OK')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
