"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Save, Upload, Lock } from "lucide-react";

export default function BrandingPage() {
  const t = useTranslations("branding");
  const { data: session } = useSession();
  const [companyName, setCompanyName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [accentColor, setAccentColor] = useState("#7c3aed");
  const [logoUrl, setLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  const isPro = session?.user?.planId === "pro" || session?.user?.planId === "agency";

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/branding");
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setCompanyName(data.companyName || "");
            setPrimaryColor(data.primaryColor || "#2563eb");
            setAccentColor(data.accentColor || "#7c3aed");
            setLogoUrl(data.logoUrl || "");
          }
        }
      } catch { /* ignore */ }
    }
    if (isPro) load();
  }, [isPro]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/settings/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, primaryColor, accentColor, logoUrl }),
      });

      if (res.ok) {
        setMessage("Branding settings saved");
      } else {
        const data = await res.json();
        setMessage(data.error || "Failed to save");
      }
    } catch {
      setMessage("Error saving");
    }
    setSaving(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview immediately using FileReader
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Clear previous errors and start upload
    setUploadError("");
    setImageError(false);
    setUploading(true);

    const formData = new FormData();
    formData.append("logo", file);

    try {
      const res = await fetch("/api/upload/logo", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setLogoUrl(data.url);
        setMessage("Logo uploaded successfully");
      } else {
        const data = await res.json();
        setUploadError(data.error || "Upload failed");
        setPreviewUrl(null); // Clear preview on error
      }
    } catch (error) {
      setUploadError("Network error. Please try again.");
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  }

  if (!isPro) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <Lock className="mx-auto mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {t("proRequired")}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        {t("title")}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t("description")}
      </p>

      {message && (
        <div className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-900 dark:bg-[#1a1a1a] dark:text-white">
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="rounded-xl border bg-white p-6 dark:border-gray-800 dark:bg-gray-900 space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("companyName")}
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Your Company"
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-white dark:focus:ring-white/20"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("logo")}
          </label>
          <div className="flex items-center gap-3">
            {(previewUrl || logoUrl) && !imageError && (
              <div className="relative">
                <img
                  src={previewUrl || logoUrl}
                  alt="Logo"
                  className="h-16 w-16 rounded border object-contain dark:border-gray-700"
                  onError={() => {
                    console.error("Failed to load logo image:", previewUrl || logoUrl);
                    setImageError(true);
                  }}
                />
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded bg-black/50">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white dark:border-white border-t-transparent dark:border-t-transparent" />
                  </div>
                )}
              </div>
            )}
            {imageError && (logoUrl || previewUrl) && (
              <div className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                <span className="text-xs text-gray-400">Failed to load</span>
              </div>
            )}
            <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              uploading
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
            } text-gray-700 dark:border-gray-700 dark:text-gray-300`}>
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading..." : t("uploadLogo")}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>
          {uploadError && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{uploadError}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("primaryColor")}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border dark:border-gray-700"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1 rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("accentColor")}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border dark:border-gray-700"
              />
              <input
                type="text"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="flex-1 rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 px-4 py-2 text-sm font-medium dark:bg-white dark:text-black dark:hover:bg-gray-200 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "..." : "Save"}
        </button>
      </form>
    </div>
  );
}
