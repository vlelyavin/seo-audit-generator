"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const FAQ_COUNT = 7;

export function IndexingFaqSection() {
  const t = useTranslations("marketing.indexingLanding.faq");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="border-t border-gray-800 bg-black py-24">
      <div className="mx-auto max-w-3xl px-4 lg:px-6">
        <p className="mb-4 text-center text-sm font-medium italic text-copper">
          {t("sectionLabel")}
        </p>
        <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
          {t("title")}
        </h2>

        <div className="mt-12 space-y-4">
          {Array.from({ length: FAQ_COUNT }, (_, i) => i + 1).map((i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                className="rounded-xl border border-gray-800 bg-gray-950"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex w-full items-center justify-between px-6 py-5 text-left"
                >
                  <span className="text-sm font-medium text-white">
                    {t(`q${i}`)}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 shrink-0 text-gray-500 transition-transform",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-gray-800 px-6 pb-5 pt-4">
                    <p className="text-sm leading-relaxed text-gray-400">
                      {t(`a${i}`)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
