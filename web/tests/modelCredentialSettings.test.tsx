import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModelCredentialSettings } from "@/components/config/ModelCredentialSettings";

describe("ModelCredentialSettings", () => {
  it("renders editable provider fields without hard-coded values", () => {
    const html = renderToStaticMarkup(<ModelCredentialSettings />);

    expect(html).toContain("模型连接");
    expect(html).toContain("Provider");
    expect(html).toContain("Base URL");
    expect(html).toContain("Model");
    expect(html).toContain("例如：https://api.deepseek.com");
    expect(html).not.toContain('value="OpenAI-compatible"');
    const providerInput = html.match(/Provider<input([^>]*)>/)?.[1];
    expect(providerInput).toBeDefined();
    expect(providerInput).not.toContain("disabled");
    expect(html).toContain('type="password"');
    expect(html).toContain("测试连接");
    expect(html).toContain("保存配置");
    expect(html).toContain("Provider、Base URL和Model按要求明文保存");
    expect(html).toContain('<fieldset disabled=""'); // Do not overwrite edits with a late initial read.
    expect(html).toContain("不写入浏览器存储");
    expect(html).not.toContain("服务端环境变量中配置");
  });
});
