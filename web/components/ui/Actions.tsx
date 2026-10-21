"use client";
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Drawer } from "./Drawer";
import { getModelCredentialStatus } from "@/lib/api/modelCredentialClient";

export const fieldClass = "ui-field";
export const buttonClass = "ui-button";
export function Button({ variant = "secondary", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" | "danger" }) {
  return <button type={type} className={`${buttonClass} ui-button-${variant} ${className}`} {...props} />;
}

type Confirmation = { title: string; description: ReactNode; confirmLabel?: string; danger?: boolean; modelCall?: boolean };
function ModelIdentity() {
  const [label, setLabel] = useState("读取当前模型…");
  useEffect(() => { let active = true; void getModelCredentialStatus().then((status) => { if (active) setLabel(status.configured && status.model ? `当前模型：${status.model}（${status.provider ?? "兼容服务"}）` : "尚未配置完整模型，请先到设置保存。"); }).catch(() => { if (active) setLabel("暂时无法读取模型名称；将使用服务端当前配置。"); }); return () => { active = false; }; }, []);
  return <p className="mt-3 text-sm text-[var(--workspace-muted)]">{label}</p>;
}
/** Local, explicit confirmations only. Navigation/unload retains the existing guard. */
export function useConfirmAction() {
  const [request, setRequest] = useState<Confirmation | null>(null);
  const resolve = useRef<((confirmed: boolean) => void) | null>(null);
  const id = useId();
  useEffect(() => () => { resolve.current?.(false); resolve.current = null; }, []);
  const finish = (confirmed: boolean) => { const done = resolve.current; resolve.current = null; setRequest(null); done?.(confirmed); };
  const confirm = (options: Confirmation) => new Promise<boolean>((done) => {
    resolve.current?.(false); resolve.current = done; setRequest(options);
  });
  const confirmation = request && <Drawer id={id} label={request.title} variant="sheet" onClose={() => finish(false)}>
    <section className="ui-confirm" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{request.title}</h2>
      <div className="ui-confirm-description">{request.description}{request.modelCall && <ModelIdentity />}</div>
      <div className="ui-confirm-actions"><Button autoFocus onClick={() => finish(false)}>取消</Button><Button variant={request.danger ? "danger" : "primary"} onClick={() => finish(true)}>{request.confirmLabel ?? "确认操作"}</Button></div>
    </section>
  </Drawer>;
  return { confirm, confirmation };
}

export function Feedback({ error, notice }: { error?: string | null; notice?: string | null }) {
  return <>{error && <p role="alert" className="ui-feedback ui-feedback-error">{error}</p>}{notice && <p role="status" className="ui-feedback">{notice}</p>}</>;
}
