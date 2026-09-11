#!/usr/bin/env node
/**
 * Validates Windows NSIS packaging config without producing an .exe.
 * Useful on Linux CI boxes where Wine may be unavailable.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const ymlPath = path.join(root, '../electron-builder.yml')
const yml = fs.readFileSync(ymlPath, 'utf8')

const required = [
  [/appId:\s*com\.knowledge\.desktop/, 'appId'],
  [/productName:\s*Knowledge Desktop/, 'productName'],
  [/output:\s*dist/, 'directories.output'],
  [/out\/\*\*\/\*/, 'files out/**/*'],
  [/from:\s*electron\/db\/schema\.sql/, 'extraResources schema.sql'],
  [/oneClick:\s*false/, 'nsis.oneClick false'],
  [/allowToChangeInstallationDirectory:\s*true/, 'nsis.allowToChangeInstallationDirectory'],
  [/createDesktopShortcut:\s*true/, 'nsis.createDesktopShortcut'],
  [/createStartMenuShortcut:\s*true/, 'nsis.createStartMenuShortcut'],
  [/asarUnpack:/, 'asarUnpack'],
  [/better-sqlite3/, 'asarUnpack better-sqlite3'],
  [/sqlite-vec/, 'asarUnpack sqlite-vec'],
  [/target:\s*nsis/, 'win.target nsis'],
]

let failed = false
for (const [re, label] of required) {
  if (!re.test(yml)) {
    console.error('[pack:config-check] MISSING:', label)
    failed = true
  } else {
    console.log('[pack:config-check] OK:', label)
  }
}

const schemaSrc = path.join(root, '../electron/db/schema.sql')
if (!fs.existsSync(schemaSrc)) {
  console.error('[pack:config-check] MISSING source schema:', schemaSrc)
  failed = true
} else {
  console.log('[pack:config-check] OK: electron/db/schema.sql exists')
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, '../package.json'), 'utf8'))
if (!pkg.scripts?.['build:win']) {
  console.error('[pack:config-check] MISSING script build:win')
  failed = true
} else {
  console.log('[pack:config-check] OK: build:win script')
}

if (failed) process.exit(1)
console.log('[pack:config-check] electron-builder.yml ready for Windows NSIS trial builds')
