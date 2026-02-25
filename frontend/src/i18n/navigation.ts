import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);

/**
 * Build a locale-aware path string for non-component contexts
 * (middleware redirects, NextAuth callbacks, emails, etc.).
 * Default locale (en) gets no prefix; others get /{locale} prefix.
 */
export function localePath(locale: string, path: string): string {
  if (locale === routing.defaultLocale) return path;
  return `/${locale}${path}`;
}
