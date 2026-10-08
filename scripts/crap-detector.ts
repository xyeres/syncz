/**
 * CRAP (Change Risk Anti-Patterns) detector.
 *
 *   CRAP(m) = comp(m)^2 * (1 - cov(m)/100)^3 + comp(m)
 *
 * where `comp` is McCabe cyclomatic complexity and `cov` is percent of
 * statements inside the function body that were executed by the test suite.
 *
 * Usage:
 *   pnpm tsx scripts/crap-detector.ts                     # analyze default paths
 *   pnpm tsx scripts/crap-detector.ts --run-tests         # run unit + integration first
 *   pnpm tsx scripts/crap-detector.ts --path "app/lib/users/**\/*.ts"
 *   pnpm tsx scripts/crap-detector.ts --threshold 6 --top 25
 *   pnpm tsx scripts/crap-detector.ts --json
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import * as path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "..");
const UNIT_COVERAGE = path.join(ROOT, "coverage/coverage-final.json");
const INTEGRATION_COVERAGE = path.join(
  ROOT,
  "coverage/integration/coverage-final.json",
);
const DEFAULT_GLOBS = ["app/**/*.ts", "app/**/*.tsx"];
const DEFAULT_EXCLUDES = [
  "**/__tests__/**",
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/node_modules/**",
  "**/prisma/generated/**",
  "**/.next/**",
  "**/coverage/**",
];

type Range = { start: number; end: number };

type CoverageEntry = {
  path: string;
  statementMap: Record<
    string,
    { start: { line: number }; end: { line: number } }
  >;
  s: Record<string, number>;
};

type CoverageByPath = Map<string, CoverageEntry>;

type FunctionReport = {
  file: string;
  name: string;
  line: number;
  complexity: number;
  coverage: number;
  statements: number;
  crap: number;
};

type CliArgs = {
  globs: string[];
  runTests: boolean;
  threshold: number;
  top: number | null;
  json: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    globs: [],
    runTests: false,
    threshold: 6,
    top: null,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--path":
        args.globs.push(argv[++i]);
        break;
      case "--run-tests":
        args.runTests = true;
        break;
      case "--threshold":
        args.threshold = Number(argv[++i]);
        break;
      case "--top":
        args.top = Number(argv[++i]);
        break;
      case "--json":
        args.json = true;
        break;
      case "--help":
      case "-h":
        console.log(
          "Usage: pnpm tsx scripts/crap-detector.ts [--path <glob>]* [--run-tests] [--threshold <n>] [--top <n>] [--json]",
        );
        process.exit(0);
    }
  }
  if (args.globs.length === 0) args.globs = DEFAULT_GLOBS;
  return args;
}

function runTestsWithCoverage(): void {
  log("Running unit tests with coverage …");
  execSync("pnpm jest", { cwd: ROOT, stdio: "inherit" });
  log("Running integration tests with coverage …");
  execSync(
    'pnpm jest --config jest.integration.config.ts --coverage --transformIgnorePatterns "node_modules/(?!.*(@prisma|prisma)[+/])" --runInBand',
    { cwd: ROOT, stdio: "inherit" },
  );
}

function loadCoverage(): CoverageByPath {
  const merged: CoverageByPath = new Map();
  for (const file of [UNIT_COVERAGE, INTEGRATION_COVERAGE]) {
    if (!existsSync(file)) continue;
    const data = JSON.parse(readFileSync(file, "utf8")) as Record<
      string,
      CoverageEntry
    >;
    for (const [absPath, entry] of Object.entries(data)) {
      const existing = merged.get(absPath);
      if (!existing) {
        merged.set(absPath, entry);
        continue;
      }
      // Union hit counts across runs (any run that touched a statement = covered).
      for (const stmtId of Object.keys(entry.s)) {
        existing.s[stmtId] = (existing.s[stmtId] ?? 0) + entry.s[stmtId];
      }
    }
  }
  return merged;
}

/** McCabe cyclomatic complexity for a function body. */
function cyclomaticComplexity(body: ts.Node): number {
  let comp = 1;
  const visit = (node: ts.Node): void => {
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.ConditionalExpression:
        comp++;
        break;
      case ts.SyntaxKind.CaseClause:
        comp++;
        break;
      case ts.SyntaxKind.BinaryExpression: {
        const op = (node as ts.BinaryExpression).operatorToken.kind;
        if (
          op === ts.SyntaxKind.AmpersandAmpersandToken ||
          op === ts.SyntaxKind.BarBarToken ||
          op === ts.SyntaxKind.QuestionQuestionToken
        ) {
          comp++;
        }
        break;
      }
      default:
        break;
    }
    ts.forEachChild(node, visit);
  };
  // Visit the body node itself so an expression-bodied arrow (e.g. `() => a ? b : c`) counts its own branch.
  visit(body);
  return comp;
}

/** Best-effort human-readable name for a function-ish node. */
function functionName(node: ts.Node): string {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node)
  ) {
    const name = node.name;
    const prefix = ts.isGetAccessor(node)
      ? "get "
      : ts.isSetAccessor(node)
        ? "set "
        : "";
    const cls = findEnclosingClassName(node);
    const base =
      ts.isIdentifier(name) || ts.isStringLiteral(name)
        ? name.text
        : "<computed>";
    return cls ? `${cls}.${prefix}${base}` : `${prefix}${base}`;
  }
  if (ts.isConstructorDeclaration(node)) {
    return `${findEnclosingClassName(node) ?? "<anon>"}.constructor`;
  }
  if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name))
      return parent.name.text;
    if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name))
      return parent.name.text;
    if (ts.isPropertyDeclaration(parent) && ts.isIdentifier(parent.name)) {
      const cls = findEnclosingClassName(node);
      return cls ? `${cls}.${parent.name.text}` : parent.name.text;
    }
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const lhs = parent.left;
      if (ts.isIdentifier(lhs)) return lhs.text;
      if (ts.isPropertyAccessExpression(lhs)) return lhs.getText();
    }
    return "<anonymous>";
  }
  return "<unknown>";
}

function findEnclosingClassName(node: ts.Node): string | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isClassDeclaration(current) || ts.isClassExpression(current)) {
      return current.name?.text ?? "<anon class>";
    }
    current = current.parent;
  }
  return null;
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node)
  );
}

function coverageForRange(
  entry: CoverageEntry | undefined,
  range: Range,
): { pct: number; total: number } {
  if (!entry) return { pct: 0, total: 0 };
  let total = 0;
  let hit = 0;
  for (const [id, loc] of Object.entries(entry.statementMap)) {
    if (loc.start.line >= range.start && loc.end.line <= range.end) {
      total++;
      if ((entry.s[id] ?? 0) > 0) hit++;
    }
  }
  if (total === 0) return { pct: 0, total: 0 };
  return { pct: (hit / total) * 100, total };
}

function crapScore(complexity: number, coverage: number): number {
  const uncovered = 1 - coverage / 100;
  return (
    complexity * complexity * uncovered * uncovered * uncovered + complexity
  );
}

function analyzeFile(
  filePath: string,
  coverage: CoverageByPath,
): FunctionReport[] {
  const source = readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    inferScriptKind(filePath),
  );
  const covEntry = coverage.get(filePath);
  const reports: FunctionReport[] = [];

  const visit = (node: ts.Node): void => {
    if (isFunctionLike(node) && node.body) {
      const body = node.body;
      const range: Range = {
        start: sf.getLineAndCharacterOfPosition(body.getStart(sf)).line + 1,
        end: sf.getLineAndCharacterOfPosition(body.getEnd()).line + 1,
      };
      const complexity = cyclomaticComplexity(body);
      const { pct: coveragePct, total } = coverageForRange(covEntry, range);
      reports.push({
        file: path.relative(ROOT, filePath),
        name: functionName(node),
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        complexity,
        coverage: coveragePct,
        statements: total,
        crap: crapScore(complexity, coveragePct),
      });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return reports;
}

function inferScriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".ts")) return ts.ScriptKind.TS;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function collectFiles(globs: string[]): string[] {
  const includeRegexes = globs.map(globToRegex);
  const excludeRegexes = DEFAULT_EXCLUDES.map(globToRegex);
  const roots = new Set<string>(globs.map(rootOfGlob));
  const seen = new Set<string>();
  for (const root of Array.from(roots)) {
    const absRoot = path.resolve(ROOT, root);
    if (!existsSync(absRoot)) continue;
    const entries = readdirSync(absRoot, {
      recursive: true,
      withFileTypes: true,
    });
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      const parent =
        (ent as unknown as { parentPath?: string; path?: string }).parentPath ??
        (ent as unknown as { path?: string }).path ??
        absRoot;
      const abs = path.join(parent, ent.name);
      const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
      if (excludeRegexes.some((re) => re.test(rel))) continue;
      if (!includeRegexes.some((re) => re.test(rel))) continue;
      seen.add(abs);
    }
  }
  return Array.from(seen).sort();
}

/** Return the non-glob prefix directory to walk for a given glob pattern. */
function rootOfGlob(glob: string): string {
  const firstGlob = glob.search(/[*?[]/);
  if (firstGlob === -1) return path.dirname(glob);
  const prefix = glob.slice(0, firstGlob);
  const lastSlash = prefix.lastIndexOf("/");
  return lastSlash === -1 ? "." : prefix.slice(0, lastSlash);
}

function globToRegex(glob: string): RegExp {
  // Minimal ** / * / ? translation — sufficient for the hard-coded excludes above.
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if ("/.()+^$|{}[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

function fmtRow(cols: string[], widths: number[]): string {
  return cols.map((c, i) => c.padEnd(widths[i])).join("  ");
}

function printTable(reports: FunctionReport[], threshold: number): void {
  const widths = [60, 38, 6, 6, 9, 8];
  const header = ["File", "Function", "Line", "Cx", "Cov %", "CRAP"];
  log(fmtRow(header, widths));
  log(
    fmtRow(
      widths.map((w) => "-".repeat(w)),
      widths,
    ),
  );
  for (const r of reports) {
    const flag = r.crap > threshold ? " [RISK]" : "";
    log(
      fmtRow(
        [
          truncate(r.file, widths[0]),
          truncate(r.name, widths[1]),
          String(r.line),
          String(r.complexity),
          r.coverage.toFixed(1),
          r.crap.toFixed(2) + flag,
        ],
        widths,
      ),
    );
  }
}

function truncate(s: string, w: number): string {
  if (s.length <= w) return s;
  return "…" + s.slice(s.length - w + 1);
}

function log(msg: string): void {
  console.log(msg);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.runTests) runTestsWithCoverage();

  const coverage = loadCoverage();
  if (coverage.size === 0) {
    log(
      "No coverage data found. Run `pnpm jest` and/or the integration suite first, or pass --run-tests.",
    );
  }

  const files = collectFiles(args.globs);
  const allReports: FunctionReport[] = [];
  for (const file of files) {
    try {
      allReports.push(...analyzeFile(file, coverage));
    } catch (err) {
      log(
        `! failed to analyze ${path.relative(ROOT, file)}: ${(err as Error).message}`,
      );
    }
  }

  allReports.sort((a, b) => b.crap - a.crap);
  const limited = args.top ? allReports.slice(0, args.top) : allReports;

  if (args.json) {
    log(JSON.stringify(limited, null, 2));
    return;
  }

  printTable(limited, args.threshold);

  const risky = allReports.filter((r) => r.crap > args.threshold);
  log("");
  log(
    `Analyzed ${allReports.length} functions across ${files.length} files. ${risky.length} above CRAP threshold of ${args.threshold}.`,
  );
}

main();
