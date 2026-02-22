"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Save, Upload, Lock, ImageOff } from "lucide-react";

function normalizeLogoUrl(url: string): string {
  if (!url) return "";
  try {
    const pathname = new URL(url, "https://placeholder.local").pathname;
    if (pathname.startsWith("/uploads/")) {
      return pathname;
    }
    if (pathname.startsWith("/api/upload/logo/")) {
      return `/uploads/${pathname.slice("/api/upload/logo/".length)}`;
    }
  } catch {
    return "";
  }
  return "";
}

export default function BrandingPage() {
  const t = useTranslations("branding");
  const tCommon = useTranslations("common");
  const { data: session } = useSession();
  const [companyName, setCompanyName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [logoVersion, setLogoVersion] = useState<number>(0);

  const isAgency = session?.user?.planId === "agency";

  // Reset image error state when logoUrl changes (e.g., after loading from API)
  useEffect(() => {
    setImageError(false);
    setLogoVersion(Date.now());
  }, [logoUrl]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/branding");
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setCompanyName(data.companyName || "");
            setLogoUrl(normalizeLogoUrl(data.logoUrl || ""));
          }
        }
      } catch { /* ignore */ }
    }
    if (isAgency) load();
  }, [isAgency]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/settings/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, logoUrl }),
      });

      if (res.ok) {
        setMessage(t("brandingSaved"));
      } else {
        const data = await res.json();
        setMessage(data.error || t("errorSaving"));
      }
    } catch {
      setMessage(t("errorSaving"));
    }
    setSaving(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const fileInput = e.currentTarget;
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;

    // Show preview immediately with a blob URL.
    setPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) {
        URL.revokeObjectURL(prev);
      }
      return URL.createObjectURL(file);
    });

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
        setLogoUrl(normalizeLogoUrl(data.url));
        setPreviewUrl((prev) => {
          if (prev?.startsWith("blob:")) {
            URL.revokeObjectURL(prev);
          }
          return null;
        });
        setLogoVersion(Date.now());
        setMessage(t("logoUploaded"));
      } else {
        const data = await res.json();
        setUploadError(data.error || "Upload failed");
        setPreviewUrl((prev) => {
          if (prev?.startsWith("blob:")) {
            URL.revokeObjectURL(prev);
          }
          return null;
        });
      }
    } catch {
      setUploadError(t("networkError"));
      setPreviewUrl((prev) => {
        if (prev?.startsWith("blob:")) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
    } finally {
      setUploading(false);
    }
  }

  const logoSrc = previewUrl || (logoUrl ? `${logoUrl}?v=${logoVersion}` : "");

  if (!isAgency) {
    return (
      <div className="py-12 text-center">
        <Lock className="mx-auto mb-4 h-12 w-12 text-gray-600" />
        <p className="text-sm text-gray-400">
          {t("proRequired")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        {t("description")}
      </p>

      {message && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-2 text-sm text-gray-300">
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-300">
            {t("companyName")}
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder={t("companyNamePlaceholder")}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none placeholder-gray-500 transition-colors focus:border-copper focus:ring-2 focus:ring-copper/20"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-300">
            {t("logo")}
          </label>
          <div className="flex items-center gap-3">
            {logoSrc && !imageError && (
              <div className="relative">
                <img
                  src={logoSrc}
                  alt="Logo"
                  className="h-16 w-16 rounded border border-gray-700 object-contain"
                  onError={() => {
                    console.error("Failed to load logo image:", logoSrc);
                    setImageError(true);
                  }}
                />
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded bg-black/50">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  </div>
                )}
              </div>
            )}
            {imageError && logoSrc && (
              <div className="flex h-16 items-center gap-2 rounded border border-dashed border-gray-700 bg-gray-800 px-3">
                <ImageOff className="h-4 w-4 text-gray-500" />
                <span className="text-xs text-gray-400">
                  {t("failedToLoad")}
                </span>
              </div>
            )}
            <label className={`flex cursor-pointer items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 transition-colors ${
              uploading
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-gray-800'
            }`}>
              <Upload className="h-4 w-4" />
              {uploading ? t("uploading") : t("uploadLogo")}
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.gif,.webp,.svg,image/*"
                onChange={handleLogoUpload}
                onClick={(event) => {
                  event.currentTarget.value = "";
                }}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>
          {uploadError && (
            <p className="mt-1 text-sm text-red-400">{uploadError}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-gradient-to-r from-copper to-copper-light px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "..." : tCommon("save")}
        </button>
      </form>
    </div>
  );
}
