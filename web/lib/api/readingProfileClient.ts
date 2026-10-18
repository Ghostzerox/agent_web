import { requestJson } from "@/lib/api/jsonRequest";

export type ReadingDifficulty = "introductory" | "intermediate" | "advanced";
export type ReadingGoal = "beginner" | "systematic" | "broaden" | "literary";

export type ReadingProfile = {
  userId: string;
  topics: string[];
  readBooks: string[];
  wantToReadBooks: string[];
  dislikedBooks: string[];
  difficulty: ReadingDifficulty;
  weeklyMinutes: number;
  goal: ReadingGoal;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ReadingProfileInput = Omit<
  ReadingProfile,
  "userId" | "version" | "createdAt" | "updatedAt"
> & { expectedVersion: number };

export class ReadingProfileClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ReadingProfileClientError";
  }
}

async function request<T>(init?: RequestInit): Promise<T> {
  return requestJson("/api/v1/reading-profile", init, { error: ({ message, code, status }) => new ReadingProfileClientError(message, code, status) });
}

export function getReadingProfile(): Promise<ReadingProfile> {
  return request();
}

export function updateReadingProfile(
  input: ReadingProfileInput,
): Promise<ReadingProfile> {
  return request({ method: "PATCH", body: JSON.stringify(input) });
}
