import { AppLink } from "@/components/platform/AppLink";
import type { ModuleLink } from "@/lib/platform/workspaceNavigation";

export function ModuleDirectory({ title, description, links }: { title: string; description: string; links: readonly ModuleLink[] }) {
  return <section className="module-directory" aria-label={title}>
    <div className="module-intro"><h2 className="text-2xl font-semibold sm:text-3xl">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--workspace-muted)]">{description}</p></div>
    <div className="grid gap-4 sm:grid-cols-2">{links.map((link) => <AppLink key={link.href} href={link.href} aria-label={link.label} className="module-card"><h3 className="font-semibold">{link.label}<span aria-hidden="true" className="float-right text-emerald-600">↗</span></h3>{link.description && <p className="mt-3 text-sm leading-7 text-[var(--workspace-muted)]">{link.description}</p>}</AppLink>)}</div>
  </section>;
}
