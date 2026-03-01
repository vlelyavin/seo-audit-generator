import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { Ubuntu, Geist_Mono } from "next/font/google";
import { routing } from "@/i18n/routing";
import { SessionProvider } from "@/providers/session-provider";
import { Toaster } from "sonner";
import "../globals.css";

const ubuntu = Ubuntu({
  variable: "--font-ubuntu",
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SEO Audit & Indexing Tool — seo.lvdev.co",
  description: "Professional SEO audit and indexing platform. Crawl websites, analyze 20+ SEO metrics, and submit pages for faster Google indexing.",
  icons: {
    icon: { url: "/favicon.svg", type: "image/svg+xml" },
  },
  openGraph: {
    title: "SEO Audit & Indexing Tool — seo.lvdev.co",
    description: "Professional SEO audit and indexing platform. Crawl websites, analyze 20+ SEO metrics, and submit pages for faster Google indexing.",
    url: "https://seo.lvdev.co",
    type: "website",
  },
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning className="dark">
      <body
        className={`${ubuntu.variable} ${geistMono.variable} antialiased bg-black text-white`}
      >
        <SessionProvider>
          <NextIntlClientProvider messages={messages}>
            {children}
            <Toaster
              closeButton
              theme="dark"
              position="bottom-right"
              toastOptions={{
                style: {
                  background: "#0a0a0a",
                  border: "1px solid #404040",
                  color: "#fafafa",
                },
              }}
            />
          </NextIntlClientProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
