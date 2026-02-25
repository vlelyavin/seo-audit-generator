"use server";

import { signIn } from "@/lib/auth";
import { localePath } from "@/i18n/navigation";

export async function signInWithGoogle(formData: FormData) {
  const locale = (formData.get("locale") as string) || "en";
  await signIn("google", { redirectTo: localePath(locale, "/dashboard") });
}
