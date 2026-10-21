"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { appHref } from "@/lib/platform/appNavigation";
import { requestNavigationPermission } from "@/lib/platform/navigationGuard";

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children: ReactNode;
};

export function AppLink({ href, children, onClick, ...props }: AppLinkProps) {
  return (
    <a href={appHref(href)} {...props} onClick={(event) => {
      onClick?.(event);
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || props.target === "_blank" || !href.startsWith("/")) return;
      if (!requestNavigationPermission(undefined, href)) event.preventDefault();
    }}>
      {children}
    </a>
  );
}
