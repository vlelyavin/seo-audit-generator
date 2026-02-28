import type { Metadata } from "next";
import { IndexingHeroSection } from "@/components/landing/indexing-hero-section";
import { IndexingHowItWorks } from "@/components/landing/indexing-how-it-works";
import { IndexingFeaturesSection } from "@/components/landing/indexing-features-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { IndexingFaqSection } from "@/components/landing/indexing-faq-section";

export const metadata: Metadata = {
  title: "Get Your Pages Indexed by Google in Hours — seo.lvdev.co",
  description:
    "Submit your URLs to Google, Bing, and Yandex for faster indexing. Monitor your index coverage with Google Search Console integration. Free plan available.",
  openGraph: {
    title: "Get Your Pages Indexed by Google in Hours — seo.lvdev.co",
    description:
      "Submit your URLs to Google, Bing, and Yandex for faster indexing. Monitor your index coverage with Google Search Console integration. Free plan available.",
    url: "https://seo.lvdev.co/indexator",
    type: "website",
  },
};

export default function IndexingLandingPage() {
  return (
    <>
      <IndexingHeroSection />
      <IndexingHowItWorks />
      <IndexingFeaturesSection />
      <PricingSection />
      <IndexingFaqSection />
    </>
  );
}
