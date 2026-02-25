"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Globe } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

const localeLabels: Record<string, string> = {
  en: "EN",
  ru: "RU",
  uk: "UA",
};

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function switchLocale(newLocale: string) {
    router.replace(pathname, { locale: newLocale });
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-white hover:bg-gray-900"
      >
        <Globe className="h-4 w-4" />
        {localeLabels[locale]}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-gray-700 bg-black py-1 shadow-lg">
          {routing.locales.map((loc) => (
            <button
              key={loc}
              onClick={() => switchLocale(loc)}
              className={cn(
                "block w-full whitespace-nowrap px-3 py-2.5 text-left text-sm",
                loc === locale
                  ? "bg-gray-900 text-white"
                  : "text-white hover:bg-gray-900"
              )}
            >
              {localeLabels[loc]} — {loc === "en" ? "English" : loc === "ru" ? "Русский" : "Українська"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
