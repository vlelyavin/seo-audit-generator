"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Save } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const { data: session, update } = useSession();
  const [name, setName] = useState(session?.user?.name || "");
  useEffect(() => {
    if (session?.user?.name) setName(session.user.name);
  }, [session?.user?.name]);
  const [saving, setSaving] = useState(false);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (res.ok) {
        toast.success(t("profileUpdated"));
        await update();
      } else {
        const data = await res.json();
        toast.error(data.error || t("failedToUpdate"));
      }
    } catch {
      toast.error(t("errorSaving"));
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {/* Profile */}
      <form onSubmit={handleSaveProfile} className="rounded-xl border border-gray-800 bg-gray-950 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">
          {t("profile")}
        </h2>

        <div className="max-w-[30rem] space-y-4">
          <div>
            <label className="mb-0.5 block text-sm font-medium text-gray-300">
              Email
            </label>
            <p className="mb-1.5 text-xs text-gray-500">{t("emailDescription")}</p>
            <input
              type="email"
              value={session?.user?.email || ""}
              disabled
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-base md:text-sm text-gray-500"
            />
          </div>

          <div>
            <label className="mb-0.5 block text-sm font-medium text-gray-300">
              {t("name")}
            </label>
            <p className="mb-1.5 text-xs text-gray-500">{t("nameDescription")}</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-base md:text-sm text-white outline-none transition-colors focus:border-copper focus:ring-2 focus:ring-copper/20"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-6 flex items-center gap-2 rounded-md bg-gradient-to-r from-copper to-copper-light px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {t("updateProfile")}
        </button>
      </form>
    </div>
  );
}
