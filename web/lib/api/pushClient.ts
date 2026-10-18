import { Capacitor } from "@capacitor/core";
import { requestJson } from "@/lib/api/jsonRequest";

export type NotificationPreferences = {
  pushEnabled: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  timezone: "Asia/Shanghai";
  version: number;
};

export type PublicPushSubscription = {
  id: string;
  provider: string;
  deviceLabel: string;
  status: "active" | "expired";
  failureCount: number;
  expiresAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  createdAt: string;
};

export type PushPublicState = {
  publicKey: string;
  preferences: NotificationPreferences;
  subscriptions: PublicPushSubscription[];
};

export class PushClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PushClientError";
  }
}

async function pushRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return requestJson(path, init, { error: ({ message, code, status }) => new PushClientError(message, code, status) });
}

export function getPushState(): Promise<PushPublicState> {
  return pushRequest("/api/v1/push/config");
}

export function saveBrowserSubscription(
  subscription: PushSubscriptionJSON,
  deviceLabel: string,
): Promise<PublicPushSubscription> {
  return pushRequest("/api/v1/push/subscriptions", {
    method: "POST",
    body: JSON.stringify({ subscription, deviceLabel }),
  });
}

export function updateNotificationPreferences(
  preferences: Omit<NotificationPreferences, "timezone" | "version"> & {
    expectedVersion: number;
  },
): Promise<NotificationPreferences> {
  return pushRequest("/api/v1/push/preferences", {
    method: "PATCH",
    body: JSON.stringify(preferences),
  });
}

export function deletePushSubscription(id: string): Promise<void> {
  return pushRequest(`/api/v1/push/subscriptions/${id}`, { method: "DELETE" });
}

export function supportsWebPush(): boolean {
  return (
    typeof window !== "undefined" &&
    !Capacitor.isNativePlatform() &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export function browserDeviceLabel(userAgent = navigator.userAgent): string {
  const platform = /iPhone|iPad|iPod/i.test(userAgent)
    ? "iPhone/iPad"
    : /Android/i.test(userAgent)
      ? "Android"
      : /Windows/i.test(userAgent)
        ? "Windows"
        : /Macintosh/i.test(userAgent)
          ? "macOS"
          : "浏览器设备";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /CriOS|Chrome\//.test(userAgent)
      ? "Chrome"
      : /Safari\//.test(userAgent)
        ? "Safari"
        : "Browser";
  return `${browser} · ${platform}`;
}

async function serializeSubscription(
  subscription: PushSubscription,
): Promise<PushSubscriptionJSON> {
  const serialized = subscription.toJSON();
  if (
    !serialized.endpoint ||
    !serialized.keys?.p256dh ||
    !serialized.keys.auth
  ) {
    throw new PushClientError("浏览器返回了不完整的 Push 订阅。", "PUSH_SUBSCRIPTION_INVALID", 0);
  }
  return {
    endpoint: serialized.endpoint,
    expirationTime: serialized.expirationTime ?? null,
    keys: {
      p256dh: serialized.keys.p256dh,
      auth: serialized.keys.auth,
    },
  };
}

export async function enableWebPush(
  publicKey: string,
): Promise<{ browserSubscription: PushSubscription; serverSubscription: PublicPushSubscription }> {
  if (!supportsWebPush()) {
    throw new PushClientError(
      "当前浏览器环境不支持 Web Push；请使用 HTTPS，iPhone/iPad 请先添加到主屏幕。",
      "PUSH_UNSUPPORTED",
      0,
    );
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new PushClientError(
      permission === "denied"
        ? "通知权限已被拒绝，请在系统设置中重新允许。"
        : "没有获得通知权限。",
      "PUSH_PERMISSION_NOT_GRANTED",
      0,
    );
  }
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const browserSubscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(publicKey),
  });
  const serverSubscription = await saveBrowserSubscription(
    await serializeSubscription(browserSubscription),
    browserDeviceLabel(),
  );
  return { browserSubscription, serverSubscription };
}

export async function removeCurrentWebPushSubscription(
  serverSubscriptionId: string,
): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await subscription.unsubscribe();
  await deletePushSubscription(serverSubscriptionId);
}
