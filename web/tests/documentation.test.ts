import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("keeps local Markdown document and image links resolvable after archival", () => {
  const root = path.resolve("..");
  const files = ["README.md", "PROJECT.md", "CLAUDE.md", ...readdirSync(path.join(root, "docs"), { recursive: true })
    .map(String).filter((name) => name.endsWith(".md")).map((name) => `docs/${name}`)];
  const broken: string[] = [];
  for (const file of files) {
    const text = readFileSync(path.join(root, file), "utf8").replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gmu, "");
    // Check local inline links, not external websites, code examples or section anchors.
    for (const match of text.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/gu)) {
      const target = match[1].trim().replace(/^<|>$/gu, "");
      if (/^(?:[a-z][a-z\d+.-]*:|#)/iu.test(target)) continue;
      const local = decodeURIComponent(target.split(/[?#]/u, 1)[0]);
      if (local && !existsSync(path.resolve(root, path.dirname(file), local))) broken.push(`${file}: ${target}`);
    }
  }
  expect(broken).toEqual([]);
});
