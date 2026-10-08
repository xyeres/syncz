// Dependency-rule check (docs/domain-design.md §5 "Keeping it honest").
//  - domain imports only domain; within it, the bounded-context rules below.
//  - application imports only domain + application (its tests/test-fixtures may also use the
//    in-memory infrastructure as a test composition root). No bare packages.
//  - infrastructure may import application, domain and itself; never ui/app.
//  - domain and application use no time, randomness or host globals (ports provide them).
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const SRC = resolve('src')
const LAYERS = {
  domain: { allow: ['domain'], banGlobals: true },
  application: { allow: ['domain', 'application'], testAllow: ['infrastructure'], banGlobals: true },
  infrastructure: { allow: ['domain', 'application', 'infrastructure', 'package'], banGlobals: false },
}
// Bounded contexts inside the domain: context → contexts it must not import (§1, §5).
const FORBIDDEN = { channel: ['revenue-sharing', 'reporting'], 'revenue-sharing': ['reporting'], reporting: ['revenue-sharing'] }
const BANNED = [/\bDate\.now\b/, /\bnew\s+Date\s*\(/, /\bMath\.random\b/, /\bcrypto\b/, /\bwindow\b/,
  /\bdocument\b/, /\bprocess\b/, /\bimport\.meta\b/]
const IMPORT_RE = /\b(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/g
const isTest = (f) => /\.test\.ts$|test-fixtures\.ts$/.test(f)
const segments = (p, base) => relative(base, p).split(sep)
const targetOf = (file, spec) =>
  spec.startsWith('.') ? resolve(dirname(file), spec) : spec.startsWith('@/') ? join(SRC, spec.slice(2)) : null
const layerOf = (target) => (target ? segments(target, SRC)[0] : 'package')

const errors = []
let count = 0
for (const [layer, rule] of Object.entries(LAYERS)) {
  const root = join(SRC, layer)
  const files = readdirSync(root, { recursive: true }).map((f) => join(root, f)).filter((f) => /\.(ts|tsx|js|mjs)$/.test(f))
  count += files.length
  for (const file of files) {
    const rel = relative(process.cwd(), file)
    const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    const allowed = [...rule.allow, ...(isTest(file) ? rule.testAllow ?? [] : [])]
    for (const m of code.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3]
      const target = targetOf(file, spec)
      const to = layerOf(target)
      if (!allowed.includes(to)) errors.push(`${rel}: ${layer} must not import ${to} ("${spec}")`)
      else if (layer === 'domain' && to === 'domain') {
        const [from, toContext] = [segments(file, root)[0], segments(target, root)[0]]
        if (FORBIDDEN[from]?.includes(toContext)) errors.push(`${rel}: ${from}/ must not import ${toContext}/ ("${spec}")`)
      }
    }
    if (!rule.banGlobals || isTest(file)) continue
    const strip = code.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""')
    for (const re of BANNED) if (re.test(strip)) errors.push(`${rel}: uses banned global ${re.source}`)
  }
}
if (errors.length) {
  console.error(`check:deps failed:\n  ${errors.join('\n  ')}`)
  process.exit(1)
}
console.log(`check:deps ok (${count} files in domain, application, infrastructure)`)
