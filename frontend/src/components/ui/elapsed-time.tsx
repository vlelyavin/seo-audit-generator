"use client";

import { useState, useEffect } from "react";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function ElapsedTime({ startedAt, stoppedAt }: { startedAt: string; stoppedAt?: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (stoppedAt) return;

    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stoppedAt]);

  const start = new Date(startedAt).getTime();
  const end = stoppedAt ? new Date(stoppedAt).getTime() : now;
  const elapsed = end - start;

  return (
    <span className="shrink-0 text-xs tabular-nums text-gray-400">{formatElapsed(elapsed)}</span>
  );
}
