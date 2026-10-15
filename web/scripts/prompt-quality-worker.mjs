// Temporary Docker-side bridge: credentials never leave the running server.
import { resolveModelProviderConfig } from "/app/lib/ai/server/modelCredentialService.ts";
import { OpenAICompatibleProvider } from "/app/lib/ai/server/modelProvider.ts";
import { inputTextCharacters } from "/app/lib/ai/server/tokenBudget.ts";
import https from "node:https";
import { Readable } from "node:stream";
import { isIP } from "node:net";

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const { request, maxOutputTokens, resolvedAddress } = JSON.parse(input);
  if (resolvedAddress && isIP(resolvedAddress) !== 4) throw new Error("INVALID_RESOLVED_ADDRESS");
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 4096 || !Array.isArray(request.messages) || request.messages.some((message) => typeof message.content !== "string") || inputTextCharacters(request.messages) > 20000) throw new Error("INVALID_EVALUATION_REQUEST");
  const config = await resolveModelProviderConfig();
  const origin = new URL(config.baseUrl);
  if (origin.origin !== "https://api.deepseek.com" || config.model !== "deepseek-flash") throw new Error("UNREVIEWED_MODEL_OR_PRICE");
  let telemetry = null;
  let actualModel = null;
  const network = { acceptedResponses: 0, dnsFailures: 0 };
  let observedResponse;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    const [url, init] = args;
    // Controlled comparison only; do not change the application's default generation settings.
    const body = JSON.parse(init.body);
    body.thinking = { type: "disabled" };
    let response;
    try {
      if (resolvedAddress) {
        // Test-only DNS fallback. URL/Host/SNI and normal TLS certificate validation stay official.
        response = await new Promise((resolve, reject) => {
          const req = https.request(url, { method: init.method, headers: init.headers, signal: init.signal,
            lookup: (_name, options, callback) => options.all ? callback(null, [{ address: resolvedAddress, family: 4 }]) : callback(null, resolvedAddress, 4),
          }, (res) => resolve(new Response(Readable.toWeb(res), { status: res.statusCode, headers: Object.fromEntries(Object.entries(res.headers).filter(([, value]) => value !== undefined).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value])) })));
          req.on("error", reject);
          req.end(JSON.stringify(body));
        });
      } else response = await originalFetch(url, { ...init, body: JSON.stringify(body) });
    }
    catch (error) { if (error?.cause?.code === "EAI_AGAIN") network.dnsFailures++; throw error; }
    network.acceptedResponses++;
    if (response.ok) observedResponse = response.clone().text().then((body) => {
      for (const line of body.split(/\r?\n/u)) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        try { const value = JSON.parse(line.slice(6)); if (typeof value.model === "string") actualModel = value.model; } catch { /* SSE keepalives are not response objects. */ }
      }
    });
    return response;
  };
  let content = "";
  let errorCode = null;
  try {
    const provider = new OpenAICompatibleProvider(config, async (call) => { telemetry = call; });
    for await (const event of provider.stream({ ...request, generationBudget: { maxOutputTokens, tokenParameter: "max_tokens", inputCharacterLimit: 20000 } }, AbortSignal.timeout(60000))) if (event.type === "delta") content += event.text;
  } catch (error) { errorCode = typeof error?.code === "string" ? error.code : "EVALUATION_PROVIDER_FAILED"; }
  await observedResponse?.catch(() => undefined);
  return { content, errorCode, actualModel, telemetry, network };
}
main().then((result) => { console.log(JSON.stringify(result)); process.exit(0); }).catch(() => { console.log(JSON.stringify({ content: "", errorCode: "EVALUATION_SETUP_FAILED", actualModel: null, telemetry: null })); process.exit(1); });
