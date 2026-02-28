import type { Metadata } from "next";
import { AuditorHeroSection } from "@/components/landing/auditor-hero-section";
import { AuditorHowItWorks } from "@/components/landing/auditor-how-it-works";
import { AuditorFeaturesSection } from "@/components/landing/auditor-features-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { AuditorFaqSection } from "@/components/landing/auditor-faq-section";

export const metadata: Metadata = {
  title: "Professional SEO Audits, Ready to Send — seo.lvdev.co",
  description:
    "Get a client-ready SEO report in one click. 21 analyzers, beautiful PDF export, white-label branding. Free plan available.",
  openGraph: {
    title: "Professional SEO Audits, Ready to Send — seo.lvdev.co",
    description:
      "Get a client-ready SEO report in one click. 21 analyzers, beautiful PDF export, white-label branding. Free plan available.",
    url: "https://seo.lvdev.co/auditor",
    type: "website",
  },
};

export default function AuditorLandingPage() {
  return (
    <>
      <AuditorHeroSection />
      <AuditorHowItWorks />
      <AuditorFeaturesSection />
      <PricingSection />
      <AuditorFaqSection />
    </>
  );
}
