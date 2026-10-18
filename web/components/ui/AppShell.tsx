"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppLink } from "@/components/platform/AppLink";
import { WORKSPACE_SECTIONS, MODULE_LINKS, workspaceOwner, isWorkspaceRouteActive } from "@/lib/platform/workspaceNavigation";
import { useAppQuery } from "@/components/platform/useAppQuery";
import { Drawer } from "./Drawer";

export function AppShell({ route, title, description, children, actions, chat = false }: {
  route: string; title: string; description: string; children: ReactNode; actions?: ReactNode; chat?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const params = useAppQuery();
  const owner = workspaceOwner(route);
  const localLinks = owner ? MODULE_LINKS[owner] : [];
  const currentUrl = `${route}${params.size ? `?${params}` : ""}`;
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("hashchange", close);
    return () => window.removeEventListener("hashchange", close);
  }, []);
  const navigation = (mobile: boolean) => <div className="workspace-nav-body">
    <div className="workspace-brand">
      <AppLink href="/" className="workspace-brand-link"><span className="workspace-logo" aria-hidden="true">知</span><span>知伴<small>AI 学习伴侣</small></span></AppLink>
      {mobile && <button type="button" className="workspace-icon-button" aria-label="关闭模式与导航" onClick={() => setOpen(false)}>×</button>}
    </div>
    <nav aria-label="主导航" className="workspace-nav-groups">
      {WORKSPACE_SECTIONS.map((section) => <section key={section.label}>
        <h2>{section.label}</h2>
        {section.items.map((item) => <AppLink key={item.href} href={item.href} aria-current={isWorkspaceRouteActive(route, item.href) ? "page" : undefined} className="workspace-nav-link" title={item.description}>
          <span className="workspace-nav-mark" aria-hidden="true">{item.mark}</span><span>{item.label}</span>
        </AppLink>)}
      </section>)}
    </nav>
    <p className="workspace-nav-note">专业地回答，自然地陪伴。<br />模式各自独立，数据由你掌控。</p>
  </div>;
  return <div className={`workspace ${chat ? "workspace-chat" : ""}`}>
    <a className="workspace-skip" href="#workspace-content" onClick={(event) => { event.preventDefault(); const content = document.getElementById("workspace-content"); content?.focus(); content?.scrollIntoView({ block: "nearest" }); }}>跳至主要内容</a>
    <aside className="workspace-sidebar">{navigation(false)}</aside>
    <div className="workspace-body">
      <header className="workspace-header">
        <button type="button" className="workspace-icon-button workspace-menu-button" aria-label="打开模式与导航" aria-expanded={open} aria-controls="workspace-navigation" onClick={() => setOpen(true)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div className="workspace-heading"><h1>{title}</h1><p>{description}</p></div>
        {actions && <div className="workspace-actions">{actions}</div>}
      </header>
      {owner && <details className="module-navigation" key={currentUrl}>
        <summary>{owner === "chat" ? "对话内导航" : "本模块导航"}<span className="ml-2 text-xs font-normal text-[var(--workspace-muted)]">返回首页 / 打开功能子页</span></summary>
        <nav aria-label="模块内导航" className="flex flex-wrap gap-2 p-3">{localLinks.map((link) => <AppLink key={link.href} href={link.href} aria-current={currentUrl === link.href ? "page" : undefined} className="module-local-link">{link.label}</AppLink>)}</nav>
      </details>}
      {chat ? <div id="workspace-content" tabIndex={-1} className="workspace-chat-content">{children}</div> : <main id="workspace-content" tabIndex={-1} className="workspace-page-content">{children}</main>}
    </div>
    {open && <Drawer id="workspace-navigation" label="模式与导航" onClose={() => setOpen(false)}>{navigation(true)}</Drawer>}
  </div>;
}
