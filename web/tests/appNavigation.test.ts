import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appHref,
  configureAppNavigation,
  currentAppSearchParams,
  replaceCurrentAppPath,
} from "@/lib/platform/appNavigation";

afterEach(() => {
  configureAppNavigation("path");
  vi.unstubAllGlobals();
});

describe("shared app navigation", () => {
  it("replaces a mounted editor section without remounting, preserving host history state", () => {
    const replaceState = vi.fn(), dispatchEvent = vi.fn(); const state = { host: "preserved" };
    vi.stubGlobal("window", { history: { state, replaceState }, dispatchEvent });
    replaceCurrentAppPath("/entertainment?section=region");
    expect(replaceState).toHaveBeenLastCalledWith(state, "", "/entertainment?section=region");
    configureAppNavigation("hash"); replaceCurrentAppPath("/entertainment?section=overview");
    expect(replaceState).toHaveBeenLastCalledWith(state, "", "#/entertainment?section=overview");
    expect(dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual(["companion:replace-route", "companion:replace-route"]);
  });
  it("uses normal paths on the web and hash routes in a local bundle", () => {
    expect(appHref("/tasks?task=1")).toBe("/tasks?task=1");
    configureAppNavigation("hash");
    expect(appHref("/tasks?task=1")).toBe("#/tasks?task=1");
  });

  it("reads deep-link query parameters from a mobile hash route", () => {
    configureAppNavigation("hash");
    const location = {
      search: "",
      hash: "#/tasks?task=task-1",
    } as Location;

    expect(currentAppSearchParams(location).get("task")).toBe("task-1");
  });
});
