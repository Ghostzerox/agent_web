import { requestJson } from "@/lib/api/jsonRequest";

export type PersonaProfile = {
  userId: string;
  name: string;
  preferredAddress: string | null;
  warmth: number;
  humor: number;
  directness: number;
  verbosity: number;
  initiative: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type PersonaProfileInput = Omit<
  PersonaProfile,
  "userId" | "version" | "createdAt" | "updatedAt"
> & { expectedVersion: number };

export class PersonaProfileClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PersonaProfileClientError";
  }
}

async function request<T>(init?: RequestInit): Promise<T> {
  return requestJson("/api/v1/persona-profile", init, { error: ({ message, code, status }) => new PersonaProfileClientError(message, code, status) });
}

export function getPersonaProfile(): Promise<PersonaProfile> {
  return request();
}

export function updatePersonaProfile(input: PersonaProfileInput): Promise<PersonaProfile> {
  return request({ method: "PATCH", body: JSON.stringify(input) });
}
