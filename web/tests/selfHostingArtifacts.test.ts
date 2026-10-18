import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(process.cwd(), "..");

async function readProjectFile(relativePath: string) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

describe("single-user self-hosting artifacts", () => {
  it("ships production dependencies and only the three runtime scripts", async () => {
    const dockerfile = await readProjectFile("web/Dockerfile");
    const manifest = JSON.parse(await readProjectFile("web/package.json"));
    expect(manifest.dependencies.tsx).toBeTruthy();
    expect(manifest.devDependencies.tsx).toBeUndefined();
    expect(manifest.devDependencies["drizzle-kit"]).toBeUndefined();
    expect(manifest.scripts["db:generate"]).toBeUndefined();
    expect(manifest.scripts["db:check"]).toBeUndefined();
    expect(dockerfile).toContain("npm ci --omit=dev");
    expect(dockerfile).toContain("rmSync('node_modules/@electric-sql/pglite'");
    const runner = dockerfile.split("AS runner")[1];
    expect(runner).toContain("COPY --from=production-dependencies");
    expect(runner).not.toContain("/app/scripts ./scripts");
    expect([...runner.matchAll(/\/app\/scripts\/([^ ]+)/gu)].map((match) => match[1]).sort())
      .toEqual(["db-migrate.ts", "db-rollback.ts", "reminder-worker.ts"]);
  });

  it("excludes native artifacts, test fixtures and paid evaluation tools from Docker context", async () => {
    const ignore = await readProjectFile("web/.dockerignore");
    for (const entry of ["android", "mobile-dist", "tests", "e2e", "evals", "scripts/*", "!scripts/db-migrate.ts", "!scripts/db-rollback.ts", "!scripts/reminder-worker.ts"]) {
      expect(ignore.split(/\r?\n/u)).toContain(entry);
    }
  });

  it("keeps generated live-evaluation artifacts out of Git and Docker build contexts", async () => {
    expect(await readProjectFile(".gitignore")).toContain(".r3-eval/");
    expect(await readProjectFile("web/.dockerignore")).toMatch(/^\.r3-eval$/mu);
  });
  it("pins migration SQL to LF so Windows worktrees preserve applied checksums", async () => {
    expect(await readProjectFile(".gitattributes")).toMatch(/^\*\.sql text eol=lf$/mu);
    const entries = await readdir(path.join(projectRoot, "web/drizzle"), { recursive: true });
    const sql = entries.filter((entry) => entry.endsWith(".sql"));
    expect(sql.length).toBeGreaterThan(0);
    for (const relative of sql) {
      expect(await readProjectFile(path.join("web/drizzle", relative)), relative).not.toContain("\r\n");
    }
  });

  it("keeps PostgreSQL private and persists it in a named volume", async () => {
    const compose = await readProjectFile("docker-compose.yml");
    const postgresSection = compose.split("  web:")[0];

    expect(postgresSection).toContain("postgres:16-alpine");
    expect(postgresSection).toContain("postgres-data:/var/lib/postgresql/data");
    expect(postgresSection).toContain("pg_isready");
    expect(postgresSection).not.toMatch(/\n\s+ports:/);
  });

  it("defaults web exposure to localhost and starts only after migrations", async () => {
    const [compose, dockerfile, entrypoint] = await Promise.all([
      readProjectFile("docker-compose.yml"),
      readProjectFile("web/Dockerfile"),
      readProjectFile("web/docker-entrypoint.sh"),
    ]);

    expect(compose).toContain("${APP_BIND_ADDRESS:-127.0.0.1}");
    expect(compose).toContain(
      "${CREDENTIAL_MASTER_KEY:?Set CREDENTIAL_MASTER_KEY in .env.selfhost}",
    );
    expect(compose).toContain("condition: service_healthy");
    expect(compose).toContain("/api/v1/health");
    expect(compose.split("  web:")[1]).not.toContain("POSTGRES_PASSWORD");
    expect(dockerfile).toContain('ENTRYPOINT ["./docker-entrypoint.sh"]');
    expect(entrypoint.indexOf("npm run db:migrate")).toBeLessThan(
      entrypoint.indexOf("exec npm run start"),
    );
  });

  it("runs migration entry scripts without CommonJS top-level await", async () => {
    const [
      migrateScript,
      rollbackScript,
      workerScript,
      workerEntrypoint,
      compose,
      packageJson,
    ] = await Promise.all([
      readProjectFile("web/scripts/db-migrate.ts"),
      readProjectFile("web/scripts/db-rollback.ts"),
      readProjectFile("web/scripts/reminder-worker.ts"),
      readProjectFile("web/worker-entrypoint.sh"),
      readProjectFile("docker-compose.yml"),
      readProjectFile("web/package.json"),
    ]);

    for (const script of [
      migrateScript,
      rollbackScript,
      workerScript,
    ]) {
      expect(script).toContain("async function main(): Promise<void>");
      expect(script).toContain("void main().catch");
    }
    expect(packageJson).not.toContain('"scheduler:claim"');
    expect(packageJson).toContain('"worker:reminders"');
    expect(workerScript).not.toContain("task.prompt");
    expect(workerScript).not.toContain("task.title");
    expect(workerEntrypoint.indexOf("npm run db:migrate")).toBeLessThan(
      workerEntrypoint.indexOf("exec npm run worker:reminders"),
    );
    expect(compose).toContain("  worker:");
    expect(compose).toContain('entrypoint: ["./worker-entrypoint.sh"]');
    const workerSection = compose.split("  worker:")[1].split("volumes:")[0];
    expect(workerSection).toContain(
      "${CREDENTIAL_MASTER_KEY:?Set CREDENTIAL_MASTER_KEY in .env.selfhost}",
    );
    for (const variable of [
      "AI_ALLOW_INSECURE_HTTP",
      "WEB_SEARCH_BASE_URL",
    ]) {
      expect(workerSection).toContain(`${variable}:`);
    }
    for (const retired of ["AI_API_KEY:", "AI_BASE_URL:", "AI_MODEL:"]) expect(compose).not.toContain(retired);
    expect(workerScript).toContain("runNotificationWorker");
    expect(workerScript).toContain("createPersonalBriefingGenerator");
    expect(workerSection).toContain("search:");
  });

  it("ships a visible Push service worker and installable manifest assets", async () => {
    const [serviceWorker, manifest, icon] = await Promise.all([
      readProjectFile("web/public/sw.js"),
      readProjectFile("web/app/manifest.ts"),
      readProjectFile("web/public/icon.svg"),
    ]);

    expect(serviceWorker).toContain('addEventListener("push"');
    expect(serviceWorker).toContain("showNotification");
    expect(serviceWorker).toContain('addEventListener("notificationclick"');
    expect(serviceWorker).not.toContain("endpoint");
    expect(manifest).toContain('display: "standalone"');
    expect(manifest).toContain('start_url: "/inbox"');
    expect(icon).toContain("<svg");
  });

  it("excludes secrets and requires explicit confirmation for restore", async () => {
    const [dockerignore, gitignore, attributes, powershellRestore, shellRestore] =
      await Promise.all([
        readProjectFile("web/.dockerignore"),
        readProjectFile(".gitignore"),
        readProjectFile(".gitattributes"),
        readProjectFile("scripts/selfhost-restore.ps1"),
        readProjectFile("scripts/selfhost-restore.sh"),
      ]);

    expect(dockerignore).toContain(".env.*");
    expect(gitignore).toContain("!.env.selfhost.example");
    expect(gitignore).toContain("backups/");
    expect(attributes).toContain("*.sh text eol=lf");
    expect(powershellRestore).toContain("[switch]$ConfirmRestore");
    expect(powershellRestore).toContain("if (-not $ConfirmRestore)");
    expect(shellRestore).toContain("--confirm-restore");
    expect(powershellRestore.indexOf("stop web worker")).toBeLessThan(
      powershellRestore.indexOf("DROP SCHEMA"),
    );
    expect(shellRestore.indexOf("stop web worker")).toBeLessThan(
      shellRestore.indexOf("DROP SCHEMA"),
    );
    expect(powershellRestore).toContain("start web worker");
    expect(shellRestore).toContain("start web worker");
    expect(powershellRestore).toContain("ON_ERROR_STOP=1");
    expect(shellRestore).toContain("ON_ERROR_STOP=1");
  });
});
