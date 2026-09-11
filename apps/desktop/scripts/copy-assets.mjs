import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const src = path.join(root, '../electron/db/schema.sql')
const destDir = path.join(root, '../out/main')
fs.mkdirSync(destDir, { recursive: true })
fs.copyFileSync(src, path.join(destDir, 'schema.sql'))
const dbOut = path.join(destDir, 'db')
fs.mkdirSync(dbOut, { recursive: true })
fs.copyFileSync(src, path.join(dbOut, 'schema.sql'))
console.log('[copy-assets] schema.sql → out/main/')
