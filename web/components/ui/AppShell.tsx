"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppLink } from "@/components/platform/AppLink";
import { WORKSPACE_SECTIONS, MODULE_LINKS, isWorkspaceRouteActive, workspaceLocation, moduleLinkGroups } from "@/lib/platform/workspaceNavigation";
import { workspaceOwner } from "@/lib/platform/appRoutes";
import { useAppQuery } from "@/components/platform/useAppQuery";
import { Drawer } from "./Drawer";
import { LiveModelUsage } from "@/components/config/LiveModelUsage";
import { WorkspaceIcon } from "./WorkspaceIcon";
import type { WorkspaceOwner } from "@/lib/platform/appRoutes";

export function AppShell({ route, title, description, children, actions, chat = false }: {
  route: string; title: string; description: string; children: ReactNode; actions?: ReactNode; chat?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [moduleOpen, setModuleOpen] = useState(false);
  const params = useAppQuery();
  const owner = workspaceOwner(route);
  const localLinks = owner ? MODULE_LINKS[owner] : [];
  const currentUrl = `${route}${params.size ? `?${params}` : ""}`;
  const location = workspaceLocation(route, params, title);
  useEffect(() => {
    const close = () => { setOpen(false); setModuleOpen(false); };
    window.addEventListener("hashchange", close);
    return () => window.removeEventListener("hashchange", close);
  }, []);
  useEffect(() => {
    const menus = () => [...document.querySelectorAll<HTMLDetailsElement>(".workspace details.ui-more[open]")];
    const outside = (event: PointerEvent) => {
      if (document.querySelector("dialog[open]")) return;
      for (const menu of menus()) if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
      const active = document.activeElement;
      for (const menu of menus()) {
        menu.open = false;
        if (active && menu.contains(active)) menu.querySelector("summary")?.focus();
      }
    };
    const exclusive = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLDetailsElement) || !target.matches(".ui-more") || !target.open) return;
      for (const menu of menus()) if (menu !== target) menu.open = false;
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    document.addEventListener("toggle", exclusive, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("toggle", exclusive, true);
    };
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
          <span className="workspace-nav-mark" aria-hidden="true"><WorkspaceIcon name={item.href.slice(1) as WorkspaceOwner} /></span><span>{item.label}</span>
        </AppLink>)}
      </section>)}
    </nav>
    <p className="workspace-nav-note">专业地回答，自然地陪伴。<br />模式各自独立，数据由你掌控。</p>
  </div>;
  return <div className={`workspace ${chat ? "workspace-chat" : ""}`} data-workspace={owner ?? "home"}>
    <a className="workspace-skip" href="#workspace-content" onClick={(event) => { event.preventDefault(); const content = document.getElementById("workspace-content"); content?.focus(); content?.scrollIntoView({ block: "nearest" }); }}>跳至主要内容</a>
    <aside className="workspace-sidebar">{navigation(false)}</aside>
    <div className="workspace-body">
      <header className="workspace-header">
        <button type="button" className="workspace-icon-button workspace-menu-button" aria-label="打开模式与导航" aria-expanded={open} aria-controls="workspace-navigation" onClick={() => setOpen(true)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div className="workspace-heading"><h1>{title}</h1><p>{description}</p></div>
        {actions && <div className="workspace-actions">{actions}</div>}
        {owner && localLinks.length > 1 && <button type="button" className="ui-button workspace-functions-button" aria-label="打开本模块功能" aria-expanded={moduleOpen} aria-controls="module-functions" onClick={() => setModuleOpen(true)}>本页导航 <span aria-hidden="true">☷</span></button>}
      </header>
      {location.parent && <nav className="workspace-location" aria-label="页面层级"><AppLink href={location.parent.href} aria-label={`返回${location.parent.label}`} className="workspace-back"><span aria-hidden="true">←</span> 返回{location.parent.label}</AppLink><span className="workspace-location-current" aria-current="page">{location.label}</span></nav>}
      {owner && <LiveModelUsage scope={owner} />}
      {chat ? <div id="workspace-content" tabIndex={-1} className="workspace-chat-content">{children}</div> : <main id="workspace-content" tabIndex={-1} className="workspace-page-content">{children}</main>}
    </div>
    {open && <Drawer id="workspace-navigation" label="模式与导航" onClose={() => setOpen(false)}>{navigation(true)}</Drawer>}
    {moduleOpen && owner && <Drawer id="module-functions" label="本模块功能" variant="panel" onClose={() => setModuleOpen(false)}><nav className="module-nav-panel" aria-label="模块内导航">
      <header className="module-nav-header"><div><small>当前空间</small><h2>{title}</h2></div><button type="button" className="workspace-icon-button" aria-label="关闭本模块功能" onClick={() => setModuleOpen(false)}>×</button></header>
      <div className="module-nav-links"><AppLink className="module-nav-home" href={localLinks[0].href} aria-label={localLinks[0].label} aria-current={currentUrl === localLinks[0].href ? "page" : undefined} onClick={() => setModuleOpen(false)}><WorkspaceIcon name={owner} /><span>{localLinks[0].label}</span><span aria-hidden="true">↗</span></AppLink>
      {moduleLinkGroups(owner).map((group) => <section key={group.label}><h3>{group.label}</h3>{group.links.map((link) => <AppLink key={link.href} href={link.href} aria-label={link.label} aria-current={currentUrl === link.href ? "page" : undefined} onClick={() => setModuleOpen(false)}><span>{link.label}{link.description && <small>{link.description}</small>}</span><span aria-hidden="true">→</span></AppLink>)}</section>)}</div>
    </nav></Drawer>}
  </div>;
}
