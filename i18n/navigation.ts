import * as React from "react";
import NextLink from "next/link";
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

const nav = createNavigation(routing);

export const { redirect, usePathname, useRouter, getPathname } = nav;

export type NavigationLinkProps = React.ComponentPropsWithoutRef<typeof nav.Link>;

export const Link = React.forwardRef<HTMLAnchorElement, NavigationLinkProps>(
  function Link(props, ref) {
    let hasIntl = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, react-hooks/rules-of-hooks
      const { useLocale } = require("use-intl");
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useLocale();
    } catch {
      hasIntl = false;
    }

    if (!hasIntl) {
      return React.createElement(NextLink, { ref, ...(props as any) });
    }

    return React.createElement(nav.Link, { ref, ...props });
  }
);
