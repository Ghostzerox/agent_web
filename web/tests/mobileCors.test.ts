import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { allowedMobileOrigins, proxy } from "@/proxy";

describe("mobile API CORS proxy", () => {
  it("uses only the local Capacitor HTTPS origin by default", () => {
    expect([...allowedMobileOrigins(undefined)]).toEqual(["https://localhost"]);
    expect([...allowedMobileOrigins("https://one.example,not-a-url")]).toEqual([
      "https://one.example",
    ]);
  });

  it("answers allowed mobile preflight requests", () => {
    const response = proxy(
      new NextRequest("https://server.example/api/v1/tasks", {
        method: "OPTIONS",
        headers: { origin: "https://localhost" },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://localhost",
    );
    expect(response.headers.get("access-control-allow-methods")).toContain("PATCH");
    expect(response.headers.get("access-control-allow-headers")).toContain("X-Model-Operation-Id");
  });

  it("does not grant CORS access to an unknown website", () => {
    const response = proxy(
      new NextRequest("https://server.example/api/v1/tasks", {
        headers: { origin: "https://evil.example" },
      }),
    );

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
