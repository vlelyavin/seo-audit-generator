import { useTranslations } from "next-intl";

const sections = [
  "introduction",
  "serviceDescription",
  "accounts",
  "billing",
  "freeTier",
  "noWarranty",
  "liability",
  "acceptableUse",
  "dataPrivacy",
  "intellectualProperty",
  "refundPolicy",
  "changesToTerms",
  "termination",
  "governingLaw",
  "contact",
] as const;

const sectionIds: Partial<Record<(typeof sections)[number], string>> = {
  refundPolicy: "refund-policy",
};

export default function TermsPage() {
  const t = useTranslations("marketing.terms");

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold text-white">{t("title")}</h1>
      <p className="mt-2 text-sm text-gray-500">{t("lastUpdated")}</p>

      <div className="mt-10 space-y-8">
        {sections.map((section, i) => (
          <div key={section} id={sectionIds[section]}>
            <h2 className="text-xl font-semibold text-white">
              {i + 1}. {t(`sections.${section}.heading`)}
            </h2>
            <p className="mt-3 leading-relaxed text-gray-300 whitespace-pre-line">
              {t(`sections.${section}.body`)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
