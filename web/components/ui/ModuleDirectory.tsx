import { AppLink } from "@/components/platform/AppLink";
import type { ModuleLink } from "@/lib/platform/workspaceNavigation";

export function ModuleDirectory({ title, description, links }: { title: string; description: string; links: readonly ModuleLink[] }) {
  return <section className="module-directory" aria-label={title}>
    <div className="module-intro"><span className="module-intro-line" aria-hidden="true" /><h2 className="text-2xl font-semibold sm:text-3xl">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--workspace-muted)]">{description}</p></div>
    <div className="module-directory-grid">{links.map((link, index) => <AppLink key={link.href} href={link.href} aria-label={link.label} className="module-card"><span className="module-card-number" aria-hidden="true">0{index + 1}</span><h3 className="font-semibold">{link.label}<span aria-hidden="true" className="module-card-arrow">↗</span></h3>{link.description && <p className="mt-3 text-sm leading-7 text-[var(--workspace-muted)]">{link.description}</p>}<span className="module-card-open" aria-hidden="true">进入空间 →</span></AppLink>)}</div>
  </section>;
}
