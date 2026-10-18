import type { ReactNode } from "react";

/** Folding retains mounted children and their drafts, without triggering requests. */
export function Disclosure({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return <details className="module-disclosure" open={open}><summary>{title}</summary><div className="mt-4 min-w-0">{children}</div></details>;
}
