import { requestJson } from "@/lib/api/jsonRequest";

export type VoiceProfile = {
  userId: string;
  provider: "system";
  voiceId: string | null;
  language: string;
  rate: number;
  pitch: number;
  volume: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type VoiceProfileInput = Omit<
  VoiceProfile,
  "userId" | "version" | "createdAt" | "updatedAt"
> & { expectedVersion: number };

export class VoiceProfileClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "VoiceProfileClientError";
  }
}

async function request<T>(init?: RequestInit): Promise<T> {
  return requestJson("/api/v1/voice-profile", init, { error: ({ message, code, status }) => new VoiceProfileClientError(message, code, status) });
}

export function getVoiceProfile(): Promise<VoiceProfile> {
  return request();
}

export function updateVoiceProfile(input: VoiceProfileInput): Promise<VoiceProfile> {
  return request({ method: "PATCH", body: JSON.stringify(input) });
}
