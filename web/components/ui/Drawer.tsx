"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Drawer({ label, id, onClose, children, variant = "side" }: { label: string; id: string; onClose: () => void; children: ReactNode; variant?: "side" | "sheet" | "panel" }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    const back = (event: Event) => { event.preventDefault(); close.current(); };
    window.addEventListener("companion:back", back);
    return () => {
      window.removeEventListener("companion:back", back);
      dialog.close();
      document.body.style.overflow = overflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return <dialog ref={ref} id={id} aria-label={label} className={`workspace-drawer ${variant === "sheet" ? "workspace-sheet" : variant === "panel" ? "workspace-panel" : ""}`} onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const targets = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]')].filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
    if (!targets.length) { event.preventDefault(); return; }
    const current = targets.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    targets[(current + (event.shiftKey ? -1 : 1) + targets.length) % targets.length].focus();
  }} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="workspace-drawer-content">{children}</div>
  </dialog>;
}
