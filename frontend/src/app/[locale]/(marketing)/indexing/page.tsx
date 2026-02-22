import type { Metadata } from "next";
import { IndexingHeroSection } from "@/components/landing/indexing-hero-section";
import { IndexingHowItWorks } from "@/components/landing/indexing-how-it-works";
import { IndexingFeaturesSection } from "@/components/landing/indexing-features-section";
import { IndexingPricingSection } from "@/components/landing/indexing-pricing-section";
import { IndexingFaqSection } from "@/components/landing/indexing-faq-section";
import { IndexingCtaSection } from "@/components/landing/indexing-cta-section";

export const metadata: Metadata = {
  title: "Get Your Pages Indexed by Google in Hours — SEO Audit Online",
  description:
    "Submit your URLs to Google, Bing, and Yandex for faster indexing. Monitor your index coverage with Google Search Console integration. Credit-based pricing, no subscription required.",
  openGraph: {
    title: "Get Your Pages Indexed by Google in Hours — SEO Audit Online",
    description:
      "Submit your URLs to Google, Bing, and Yandex for faster indexing. Monitor your index coverage with Google Search Console integration. Credit-based pricing, no subscription required.",
    type: "website",
  },
};

export default function IndexingLandingPage() {
  return (
    <>
      <IndexingHeroSection />
      <IndexingHowItWorks />
      <IndexingFeaturesSection />
      <IndexingPricingSection />
      <IndexingFaqSection />
      <IndexingCtaSection />
    </>
  );
}
