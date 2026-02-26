import { IndexingHeroSection } from "@/components/landing/indexing-hero-section";
import { IndexingHowItWorks } from "@/components/landing/indexing-how-it-works";
import { IndexingFeaturesSection } from "@/components/landing/indexing-features-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { IndexingFaqSection } from "@/components/landing/indexing-faq-section";

export default function LandingPage() {
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
