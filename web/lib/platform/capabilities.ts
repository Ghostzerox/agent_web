export type ClientPlatformId =
  | "web"
  | "capacitor-android"
  | "harmony-arkweb";

export type PromptExportArtifact = {
  filename: string;
  mediaType: "application/json" | "text/markdown" | "text/plain";
  content: string;
  directory?: string;
  shareTitle?: string;
  shareText?: string;
  dialogTitle?: string;
};

export type ExportResult = {
  method: "download" | "share" | "save-picker";
  uri?: string;
};

export interface FileExportAdapter {
  export(artifact: PromptExportArtifact): Promise<ExportResult>;
}

export type SpeechRequest = {
  text: string;
  voiceProfileId: string;
  language?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
};

export type SpeechVoiceOption = {
  id: string;
  name: string;
  language: string;
  local: boolean;
  default: boolean;
};

export interface SpeechOutputAdapter {
  readonly provider: "system";
  isSupported(): boolean;
  listVoices(): Promise<SpeechVoiceOption[]>;
  speak(request: SpeechRequest): Promise<void>;
  stop(): Promise<void>;
}

export type LocalReminderSnapshot = {
  taskId: string;
  occurrenceId: string;
  title: string;
  body: string | null;
  scheduledAt: string;
  deepLink: string;
  recurrence?:
    | { type: "daily"; hour: number; minute: number }
    | { type: "weekly"; weekday: number; hour: number; minute: number };
};

export type LocalNotificationSyncResult = {
  scheduled: number;
  cancelled: number;
  pending: number;
  warning?: string;
};

export interface LocalNotificationAdapter {
  reconcile(
    reminders: readonly LocalReminderSnapshot[],
  ): Promise<LocalNotificationSyncResult>;
  checkPermission(): Promise<"granted" | "denied" | "prompt">;
  requestPermission(): Promise<"granted" | "denied">;
}

export type NativePushRegistration = {
  provider: "huawei-push";
  token: string;
  deviceLabel: string;
};

export interface NativePushAdapter {
  register(): Promise<NativePushRegistration>;
  unregister(): Promise<void>;
}

export type ClientPlatformAdapters = {
  platform: ClientPlatformId;
  files: FileExportAdapter;
  speech: SpeechOutputAdapter;
  localNotifications?: LocalNotificationAdapter;
  nativePush?: NativePushAdapter;
};
