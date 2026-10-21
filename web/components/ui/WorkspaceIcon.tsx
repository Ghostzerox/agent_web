import type { WorkspaceOwner } from "@/lib/platform/appRoutes";

const paths: Record<WorkspaceOwner, string> = {
  chat: "M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z M8 9h8M8 13h5",
  tasks: "M8 6H5v15h14V6h-3M9 3h6v5H9ZM8 14l2 2 5-5",
  study: "M12 6C8 3 4 4 2 5v14c4-2 7-1 10 1 3-2 6-3 10-1V5c-4-2-7-1-10 1Zm0 0v14",
  entertainment: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z",
  content: "M4 3h16v18H4ZM8 7h8M8 11h8M8 15h3M8 18h8",
  inbox: "M4 4h16l2 13v4H2v-4L4 4Zm-1 11h5l2 3h4l2-3h5",
  settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
};

export function WorkspaceIcon({ name, size = 20 }: { name: WorkspaceOwner; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
