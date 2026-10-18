import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("Capacitor current local client", () => {
  it("only packages mobile-dist and retains notification configuration", async () => {
    const { default: config } = await import("../capacitor.config");
    expect(config.appId).toBe("com.ghostzero.aistudycompanion");
    expect(config.webDir).toBe("mobile-dist");
    expect(config.plugins.LocalNotifications).toEqual({ smallIcon: "ic_stat_ai_reminder", iconColor: "#2563EB" });
    expect(config).not.toHaveProperty("server");
  });
  it("cannot reactivate the retired remote shell through stale environment variables", async () => {
    vi.stubEnv("CAPACITOR_BUILD_PROFILE", "spike");
    vi.stubEnv("CAPACITOR_SERVER_URL", "https://retired.example/chat");
    vi.resetModules();
    const { default: config } = await import("../capacitor.config");
    expect(config.webDir).toBe("mobile-dist");
    expect(config).not.toHaveProperty("server");
  });
});
