"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const locale = useLocale();

  useEffect(() => {
    signIn("google", { callbackUrl: `/${locale}/dashboard` });
  }, [locale]);

  return null;
}
