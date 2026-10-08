// Dependency-rule check for src/domain (docs/domain-design.md §5 "Keeping it honest").
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const DOMAIN = resolve('src/domain')
// Bounded-context rules: context → contexts it must not import (docs/domain-design.md §1, §5).
// Channel is upstream of both; Sharing is upstream of Reporting; Reporting receives Sharing data via snapshots.
const FORBIDDEN = { channel: ['revenue-sharing', 'reporting'], 'revenue-sharing': ['reporting'], reporting: ['revenue-sharing'] }
const contextOf = (p) => relative(DOMAIN, p).split(sep)[0]
const BANNED = [/\bDate\.now\b/, /\bnew\s+Date\s*\(/, /\bMath\.random\b/, /\bcrypto\b/, /\bwindow\b/,
  /\bdocument\b/, /\bprocess\b/, /\bimport\.meta\b/]
const IMPORT_RE = /\b(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/g

const files = readdirSync(DOMAIN, { recursive: true }).map((f) => join(DOMAIN, f))
  .filter((f) => /\.(ts|tsx|js|mjs)$/.test(f))
const errors = []
for (const file of files) {
  const rel = relative(process.cwd(), file)
  const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  for (const m of code.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3]
    const target = spec.startsWith('.') ? resolve(dirname(file), spec) : null
    if (!target || !(target + sep).startsWith(DOMAIN + sep)) errors.push(`${rel}: imports "${spec}" from outside src/domain`)
    else {
      const from = contextOf(file)
      const to = contextOf(target)
      if (FORBIDDEN[from]?.includes(to)) errors.push(`${rel}: ${from}/ must not import ${to}/ ("${spec}")`)
    }
  }
  if (/\.test\.ts$|test-fixtures\.ts$/.test(file)) continue
  const strip = code.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""')
  for (const re of BANNED) if (re.test(strip)) errors.push(`${rel}: uses banned global ${re.source}`)
}
if (errors.length) {
  console.error(`check:deps failed:\n  ${errors.join('\n  ')}`)
  process.exit(1)
}
console.log(`check:deps ok (${files.length} domain files)`)
