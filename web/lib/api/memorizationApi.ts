import { z, ZodError } from "zod";
import {
  PluginCapabilityGatewayError,
  getPluginCapabilityGateway,
} from "@/lib/plugins/capabilityGateway";
import { PluginCapabilityRepositoryError } from "@/lib/repositories/pluginCapabilityRepository";
import { PluginStorageRepositoryError } from "@/lib/repositories/pluginStorageRepository";
import {
  createMemorizationService,
  MemorizationServiceError,
  type MemorizationGatewayPort,
} from "@/lib/memorization/service";

const idSchema = z.string().uuid();

function response(requestId: string, body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-request-id": requestId },
  });
}

function statusFor(error: unknown): number {
  const code = error instanceof Error && "code" in error
    ? String((error as Error & { code: unknown }).code)
    : "";
  if (code === "PLUGIN_NOT_FOUND" || code === "UNIT_NOT_FOUND") return 404;
  if (
    code === "PLUGIN_DISABLED" ||
    code === "CAPABILITY_NOT_GRANTED" ||
    code === "PLUGIN_UPDATE_REVIEW_REQUIRED" ||
    code === "CAPABILITY_REVIEW_REQUIRED"
  ) return 403;
  if (code.includes("VERSION_CONFLICT") || code === "MATERIAL_LIMIT_REACHED") return 409;
  if (
    error instanceof ZodError ||
    code === "CAPABILITY_INPUT_INVALID" ||
    code === "CAPABILITY_CONTEXT_INVALID"
  ) return 400;
  return 500;
}

function publicError(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof ZodError) {
    return { code: "INVALID_REQUEST", message: "请求内容不符合背书活动格式。", retryable: false };
  }
  if (
    error instanceof PluginCapabilityGatewayError ||
    error instanceof PluginCapabilityRepositoryError ||
    error instanceof PluginStorageRepositoryError ||
    error instanceof MemorizationServiceError
  ) {
    return { code: error.code, message: error.message, retryable: false };
  }
  return { code: "INTERNAL_ERROR", message: "服务端无法完成背书活动请求。", retryable: true };
}

async function body(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ZodError([{ code: "custom", path: [], message: "Invalid JSON" }]);
  }
}

export function createMemorizationApi(
  gatewayOrFactory: MemorizationGatewayPort | (() => MemorizationGatewayPort),
  now: () => Date = () => new Date(),
) {
  const service = createMemorizationService(gatewayOrFactory, now);
  const handle = async (operation: (requestId: string) => Promise<Response>) => {
    const requestId = crypto.randomUUID();
    try {
      return await operation(requestId);
    } catch (error) {
      const status = statusFor(error);
      const safe = publicError(error);
      if (status === 500) {
        console.error(`[api:${requestId}] Memorization API failed`, {
          name: error instanceof Error ? error.name : "UnknownError",
        });
      }
      return response(requestId, { error: { ...safe, requestId } }, status);
    }
  };

  return {
    list: () => handle(async (requestId) => response(requestId, { data: await service.list() })),
    create: (request: Request) =>
      handle(async (requestId) =>
        response(requestId, { data: await service.create(await body(request)) }, 201),
      ),
    get: (id: string) =>
      handle(async (requestId) => {
        const result = await service.get(idSchema.parse(id));
        return result
          ? response(requestId, { data: result })
          : response(requestId, {
              error: {
                code: "MATERIAL_NOT_FOUND",
                message: "背书材料不存在。",
                retryable: false,
                requestId,
              },
            }, 404);
      }),
    update: (id: string, request: Request) => handle(async (requestId) => {
      const result = await service.update(idSchema.parse(id), await body(request));
      return result ? response(requestId, { data: result }) : response(requestId, { error: { code: "MATERIAL_NOT_FOUND", message: "背书材料不存在。", retryable: false, requestId } }, 404);
    }),
    delete: (id: string, request: Request) =>
      handle(async (requestId) => {
        await service.delete(idSchema.parse(id), await body(request));
        return new Response(null, {
          status: 204,
          headers: { "cache-control": "no-store", "x-request-id": requestId },
        });
      }),
    review: (id: string, request: Request) =>
      handle(async (requestId) => {
        const result = await service.review(idSchema.parse(id), await body(request));
        return result
          ? response(requestId, { data: result })
          : response(requestId, {
              error: {
                code: "MATERIAL_NOT_FOUND",
                message: "背书材料不存在。",
                retryable: false,
                requestId,
              },
            }, 404);
      }),
  };
}

export function getMemorizationApi() {
  return createMemorizationApi(() => getPluginCapabilityGateway());
}
