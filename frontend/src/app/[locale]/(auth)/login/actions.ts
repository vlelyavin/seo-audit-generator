"use server";

import { signIn } from "@/lib/auth";

export async function signInWithGoogle(formData: FormData) {
  const locale = (formData.get("locale") as string) || "en";
  await signIn("google", { redirectTo: `/${locale}/dashboard` });
}
