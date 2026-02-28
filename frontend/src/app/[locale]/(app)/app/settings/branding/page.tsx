"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Save, Lock, ImageOff, ImageIcon } from "lucide-react";

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
  const [isDragOver, setIsDragOver] = useState(false);

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

  async function uploadFile(file: File) {
    setPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });

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
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return null;
        });
        setLogoVersion(Date.now());
        setMessage(t("logoUploaded"));
      } else {
        const data = await res.json();
        setUploadError(data.error || t("uploadFailed"));
        setPreviewUrl((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return null;
        });
      }
    } catch {
      setUploadError(t("networkError"));
      setPreviewUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const fileInput = e.currentTarget;
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    uploadFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      uploadFile(file);
    }
  }

  async function handleRemoveLogo() {
    try {
      const res = await fetch("/api/settings/branding/logo", { method: "DELETE" });
      if (res.ok) {
        setLogoUrl("");
        setPreviewUrl((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return null;
        });
        setImageError(false);
      }
    } catch { /* ignore */ }
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
      {message && (
        <div className="rounded-lg border border-gray-800 bg-gray-950 px-4 py-2 text-sm text-gray-300">
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="rounded-xl border border-gray-800 bg-gray-950 p-6 space-y-5">
        <h2 className="mb-4 text-lg font-semibold text-white">{t("title")}</h2>

        <div className="max-w-[30rem] space-y-5">
        <div>
          <label className="mb-0.5 block text-sm font-medium text-gray-300">
            {t("companyName")}
          </label>
          <p className="mb-1.5 text-xs text-gray-500">{t("companyNameDescription")}</p>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder={t("companyNamePlaceholder")}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-base md:text-sm text-white outline-none placeholder-gray-500 transition-colors focus:border-copper focus:ring-2 focus:ring-copper/20"
          />
        </div>

        <div>
          <label className="mb-0.5 block text-sm font-medium text-gray-300">
            {t("logo")}
          </label>
          <p className="mb-1.5 text-xs text-gray-500">{t("logoDescription")}</p>

          {/* Drop zone */}
          <label
            className={`group relative flex h-[180px] w-[250px] cursor-pointer flex-col items-center justify-center rounded-xl border bg-gray-900 transition-colors ${
              isDragOver
                ? "border-copper ring-2 ring-copper/20"
                : "border-gray-700 hover:border-copper hover:ring-2 hover:ring-copper/20"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
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

            {logoSrc && !imageError ? (
              <>
                <img
                  src={logoSrc}
                  alt={t("logoAlt")}
                  className="max-h-full max-w-full object-contain p-3"
                  onError={() => setImageError(true)}
                />
                <div className="absolute inset-x-0 bottom-3 flex justify-center opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="rounded-md bg-gray-900/90 px-3 py-1 text-xs font-medium text-gray-300">
                    {t("replaceLogo")}
                  </span>
                </div>
              </>
            ) : imageError && logoSrc ? (
              <div className="flex flex-col items-center gap-2">
                <ImageOff className="h-8 w-8 text-gray-500" />
                <span className="text-xs text-gray-400">{t("failedToLoad")}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <ImageIcon className="h-8 w-8 text-gray-500" />
                <span className="text-sm text-gray-400">{t("uploadPrompt")}</span>
                <span className="text-xs text-gray-500">{t("uploadInstruction")}</span>
              </div>
            )}

            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
              </div>
            )}
          </label>

          {(logoUrl || previewUrl) && !uploading && (
            <button
              type="button"
              onClick={handleRemoveLogo}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors mt-1"
            >
              {t("removeLogo")}
            </button>
          )}

          {uploadError && (
            <p className="mt-2 text-sm text-red-400">{uploadError}</p>
          )}
        </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-gradient-to-r from-copper to-copper-light px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "..." : t("saveSettings")}
        </button>
      </form>
    </div>
  );
}
