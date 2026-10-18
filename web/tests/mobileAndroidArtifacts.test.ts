import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FIRST_PARTY_PLUGIN_ACTIVITIES } from "@/lib/plugins/activityRegistry";

const webRoot = process.cwd();
const projectRoot = path.resolve(webRoot, "..");

async function readWebFile(relativePath: string) {
  return readFile(path.join(webRoot, relativePath), "utf8");
}

async function readProjectFile(relativePath: string) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

describe("Capacitor Android project artifacts", () => {
  it("keeps the native identity and supported Android SDK range stable", async () => {
    const [appBuild, variables, manifest] = await Promise.all([
      readWebFile("android/app/build.gradle"),
      readWebFile("android/variables.gradle"),
      readWebFile("android/app/src/main/AndroidManifest.xml"),
    ]);

    expect(appBuild).toContain(
      'namespace = "com.ghostzero.aistudycompanion"',
    );
    expect(appBuild).toContain(
      'applicationId "com.ghostzero.aistudycompanion"',
    );
    expect(variables).toContain("minSdkVersion = 24");
    expect(variables).toContain("compileSdkVersion = 36");
    expect(variables).toContain("targetSdkVersion = 36");
    expect(manifest).toContain("android.permission.INTERNET");
    expect(manifest).toContain("LocalNotificationRestoreReceiver");
    expect(manifest).toContain("android.intent.action.TIME_SET");
    expect(manifest).toContain("android.intent.action.TIMEZONE_CHANGED");
    expect(manifest).toContain("android.intent.action.MY_PACKAGE_REPLACED");
  });

  it("tracks all required Capacitor packages and repeatable build commands", async () => {
    const [packageContents, mobileApp, workspaceNavigation] = await Promise.all([
      readWebFile("package.json"),
      readWebFile("mobile/MobileApp.tsx"),
      readWebFile("lib/platform/workspaceNavigation.ts"),
    ]);
    const packageJson = JSON.parse(packageContents) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };

    for (const dependency of [
      "@capacitor/android",
      "@capacitor/app",
      "@capacitor/core",
      "@capacitor/filesystem",
      "@capacitor/local-notifications",
      "@capacitor/preferences",
      "@capacitor/share",
    ]) {
      expect(packageJson.dependencies).toHaveProperty(dependency);
    }
    expect(packageJson.devDependencies).toHaveProperty("@capacitor/cli");
    expect(packageJson.scripts["mobile:client:build"]).toContain("vite build");
    expect(packageJson.scripts["mobile:sync"]).toContain("mobile:client:build");
    expect(packageJson.scripts["mobile:sync"]).toContain("cap sync android");
    expect(packageJson.scripts["mobile:build:debug"]).toContain(
      "gradlew.bat assembleDebug",
    );
    expect(mobileApp).toContain('"/reading": lazy');
    expect(mobileApp).toContain('"/entertainment": lazy');
    expect(workspaceNavigation).toContain('href: "/entertainment"');
    expect(mobileApp).toContain('"/study": lazy');
    expect(mobileApp).toContain('"/": lazy');
    for (const activity of FIRST_PARTY_PLUGIN_ACTIVITIES) {
      if (!activity.platforms.includes("android")) continue;
      expect(mobileApp).toContain(`"${activity.route}": lazy`);
    }
  });

  it("does not commit generated APKs, local SDK paths, or injected server URLs", async () => {
    const [androidGitignore, sourceConfig] = await Promise.all([
      readWebFile("android/.gitignore"),
      readWebFile("capacitor.config.ts"),
    ]);

    expect(androidGitignore).toContain("*.apk");
    expect(androidGitignore).toContain("local.properties");
    expect(androidGitignore).toContain("app/src/main/assets/public");
    expect(androidGitignore).toContain(
      "app/src/main/assets/capacitor.config.json",
    );
    expect(sourceConfig).not.toMatch(
      /https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.ts\.net/i,
    );
    expect(sourceConfig).not.toContain("process.env.CAPACITOR_SERVER_URL");
    expect(sourceConfig).toContain('webDir: "mobile-dist"');
  });

  it("builds local-client APKs with an explicit HTTPS API origin", async () => {
    const buildScript = await readProjectFile("scripts/mobile-build-debug.ps1");

    expect(buildScript).toContain("[ValidatePattern('^https://')]");
    expect(buildScript).toContain("$env:VITE_API_BASE_URL = $expectedApiBaseUrl");
    expect(buildScript).toContain("npm run mobile:sync");
    expect(buildScript).toContain("npm run mobile:build:debug");
    expect(buildScript).toContain("Assert-LocalCapacitorConfig");
    expect(buildScript).toContain("assets/capacitor.config.json");
    expect(buildScript).toContain("assets/public/index.html");
    expect(buildScript).toContain("unexpectedly contains Capacitor server.url");
    expect(buildScript).toContain("finally {");
  });
});
