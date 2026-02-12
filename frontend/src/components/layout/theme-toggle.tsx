"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="w-9 h-9" />;

  const items = [
    { value: "light", icon: Sun },
    { value: "dark", icon: Moon },
    { value: "system", icon: Monitor },
  ] as const;

  const handleThemeChange = (newTheme: string) => {
    console.log('[Theme] Changing theme to:', newTheme);
    setTheme(newTheme);

    // Verify theme was applied
    setTimeout(() => {
      const htmlClass = document.documentElement.className;
      console.log('[Theme] HTML classes after change:', htmlClass);
      console.log('[Theme] localStorage theme:', localStorage.getItem('theme'));
    }, 100);
  };

  return (
    <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-900">
      {items.map(({ value, icon: Icon }) => (
        <button
          key={value}
          onClick={() => handleThemeChange(value)}
          className={cn(
            "rounded-md p-1.5 transition-colors",
            theme === value
              ? "bg-white text-gray-900 shadow-sm dark:bg-gray-950 dark:text-white"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
          )}
          title={value}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
