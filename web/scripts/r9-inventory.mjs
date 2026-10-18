// Read-only, offline inventory. stdout only; no imports of application code or environment files.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim();
// Track the committed file set; ignored build output / local private files are never source inputs.
const files = git("ls-tree", "-r", "--name-only", "HEAD").split("\n").filter(Boolean);
const fileSet = new Set(files);
const code = files.filter((file) => file.startsWith("web/") && /\.(?:ts|tsx|js|mjs)$/u.test(file) && !file.endsWith(".d.ts"));
const texts = new Map(code.map((file) => [file, readFileSync(path.join(root, file), "utf8")]));
const incoming = new Map(code.map((file) => [file, []]));
const outgoing = new Map(code.map((file) => [file, []]));
const external = new Map(); const unresolved = [];
const internalPath = (from, specifier) => {
  const base = specifier.startsWith("@/") ? `web/${specifier.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  return [base, ...[".ts", ".tsx", ".js", ".mjs", ".json"].map((ext) => base + ext), ...[".ts", ".tsx", ".js", ".mjs"].map((ext) => `${base}/index${ext}`)].find((file) => fileSet.has(file));
};
for (const [file, text] of texts) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const record = (specifier, typeOnly) => {
    if (specifier.startsWith(".") || specifier.startsWith("@/")) {
      const target = internalPath(file, specifier);
      if (target && texts.has(target)) {
        const edge = { from: file, to: target, typeOnly };
        outgoing.get(file).push(edge); incoming.get(target).push(edge);
      } else if (!target && !/\.(?:css|svg|png|woff2?)$/u.test(specifier)) unresolved.push({ from: file, specifier });
    } else if (!specifier.startsWith("node:")) {
      const dependency = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
      if (!external.has(dependency)) external.set(dependency, new Set());
      external.get(dependency).add(file);
    }
  };
  const walk = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = ts.isImportDeclaration(node) ? node.importClause : null;
      const named = clause?.namedBindings;
      const typeOnly = Boolean(node.isTypeOnly || clause?.isTypeOnly || (clause && !clause.name && named && ts.isNamedImports(named) && named.elements.length && named.elements.every((entry) => entry.isTypeOnly)));
      record(node.moduleSpecifier.text, typeOnly);
    }
    if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) record(node.arguments[0].text, false);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) record(node.argument.literal.text, true);
    ts.forEachChild(node, walk);
  };
  walk(source);
}
const productionRoots = code.filter((file) => /^web\/app\/.*\/(?:page|layout|route|error|loading|not-found)\.tsx?$/u.test(file) || /^web\/app\/(?:page|layout|error|not-found|manifest|robots|sitemap)\.tsx?$/u.test(file) || ["web/proxy.ts", "web/mobile/main.tsx", "web/scripts/reminder-worker.ts"].includes(file));
function reach(roots, runtimeOnly = false) {
  const visited = new Set(); const stack = [...roots];
  while (stack.length) {
    const file = stack.pop(); if (visited.has(file)) continue; visited.add(file);
    for (const edge of outgoing.get(file) ?? []) if (!runtimeOnly || !edge.typeOnly) stack.push(edge.to);
  }
  return visited;
}
const production = reach(productionRoots); const runtime = reach(productionRoots, true);
const projectSource = code.filter((file) => /^web\/(?:app|components|lib|mobile)\//u.test(file));
function cycles(runtimeOnly) {
  const active = new Set(), indexes = new Map(), low = new Map(), stack = [], groups = []; let index = 0;
  const visit = (file) => {
    indexes.set(file, index); low.set(file, index++); active.add(file); stack.push(file);
    for (const edge of outgoing.get(file) ?? []) {
      if (runtimeOnly && edge.typeOnly) continue;
      if (!indexes.has(edge.to)) { visit(edge.to); low.set(file, Math.min(low.get(file), low.get(edge.to))); }
      else if (active.has(edge.to)) low.set(file, Math.min(low.get(file), indexes.get(edge.to)));
    }
    if (low.get(file) === indexes.get(file)) {
      const group = []; let item;
      do { item = stack.pop(); active.delete(item); group.push(item); } while (item !== file);
      if (group.length > 1) groups.push(group.sort());
    }
  };
  projectSource.forEach((file) => { if (!indexes.has(file)) visit(file); });
  return groups.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}
const clientRoots = code.filter((file) => texts.get(file).match(/^\s*["']use client["']/u) || file === "web/mobile/main.tsx");
const clientRuntime = reach(clientRoots, true);
const metrics = (file) => ({ file, lines: texts.get(file).split(/\r?\n/u).filter((line) => line.trim()).length, bytes: Buffer.byteLength(texts.get(file)), incomingFiles: new Set(incoming.get(file).map((edge) => edge.from)).size });
const packageJson = JSON.parse(readFileSync(path.join(root, "web/package.json"), "utf8"));
const group = (prefix, suffix = "") => files.filter((file) => file.startsWith(prefix) && (!suffix || file.endsWith(suffix)));
const artifactSize = (relative) => {
  const directory = path.join(root, relative); if (!existsSync(directory)) return null;
  const walk = (target) => readdirSync(target, { withFileTypes: true }).reduce((sum, entry) => sum + (entry.isDirectory() ? walk(path.join(target, entry.name)) : statSync(path.join(target, entry.name)).size), 0);
  return walk(directory);
};
const report = {
  schemaVersion: 1, baselineCommit: git("rev-parse", "HEAD"),
  method: "Committed file set, current tracked contents; TS AST static import/export/dynamic-string-import graph (type edges included separately). No application execution, network, database, or private env reads.",
  limitations: ["Not a bundler, symbol liveness proof, CPU/complexity profiler or authorization audit.", "CLI, framework routes, native registration, dynamic non-literal imports and external callers need manual verification.", "Physical nonblank lines are a size signal; dense JSX may have few lines but many responsibilities.", "Build byte counts describe existing ignored local output, not a fresh build; timestamps and previous test durations are recorded separately."],
  counts: { trackedFiles: files.length, codeFiles: code.length, productSourceFiles: projectSource.length, productNonblankLines: projectSource.reduce((sum, file) => sum + metrics(file).lines, 0), pages: group("web/app/").filter((file) => file.endsWith("/page.tsx")).length, apiRouteFiles: group("web/app/api/", "/route.ts").length, unitTestFiles: code.filter((file) => /^web\/tests\/.*\.test\.tsx?$/u.test(file)).length, e2eSpecFiles: group("web/e2e/", ".spec.ts").length, dependencies: Object.keys(packageJson.dependencies).length, devDependencies: Object.keys(packageJson.devDependencies).length, npmScripts: Object.keys(packageJson.scripts).length, upMigrations: files.filter((file) => /^web\/drizzle\/[^/]+\.sql$/u.test(file)).length, rollbackMigrations: group("web/drizzle/rollback/", ".sql").length, markdownDocs: group("docs/", ".md").length, promptBaselineFiles: files.filter((file) => /^web\/evals\/r3\/baseline[^/]*\.json$/u.test(file)).length },
  largestProductFiles: projectSource.map(metrics).sort((a, b) => b.lines - a.lines).slice(0, 15),
  productionRoots, graph: { edges: [...outgoing.values()].flat().length, typeOnlyEdges: [...outgoing.values()].flat().filter((edge) => edge.typeOnly).length, reachableIncludingTypes: projectSource.filter((file) => production.has(file)).length, runtimeReachable: projectSource.filter((file) => runtime.has(file)).length, unresolvedInternalSpecifiers: unresolved },
  typeOnlyProductFiles: projectSource.filter((file) => production.has(file) && !runtime.has(file)),
  cycles: { runtime: cycles(true), includingTypes: cycles(false) },
  clientRuntimeServerFiles: [...clientRuntime].filter((file) => /^web\/lib\/(?:db|repositories|ai\/server)\//u.test(file)).sort(),
  notReachedFromProductionRoots: projectSource.filter((file) => !production.has(file)).map((file) => ({ ...metrics(file), importers: [...new Set(incoming.get(file).map((edge) => edge.from))] })),
  dependencies: [...Object.keys(packageJson.dependencies), ...Object.keys(packageJson.devDependencies)].map((name) => ({ name, kind: name in packageJson.dependencies ? "runtime" : "development", importingFiles: external.get(name)?.size ?? 0 })),
  npmScripts: packageJson.scripts,
  existingLocalArtifactBytes: { mobileDist: artifactSize("web/mobile-dist"), nextStatic: artifactSize("web/.next/static") },
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
