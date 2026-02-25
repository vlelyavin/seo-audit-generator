"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { signIn } from "next-auth/react";
import { localePath } from "@/i18n/navigation";

export default function LoginPage() {
  const locale = useLocale();

  useEffect(() => {
    signIn("google", { callbackUrl: localePath(locale, "/dashboard") });
  }, [locale]);

  return null;
}
