"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ProgressEvent } from "@/types/audit";

const MAX_SSE_RETRIES = 2;
const SSE_RETRY_DELAY = 2000; // 2 seconds
const POLL_INTERVAL = 2000; // 2 seconds

export function useAuditProgress(fastApiId: string | null) {
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startPolling = useCallback(() => {
    if (!fastApiId || isPolling) return;

    console.log('[SSE] Falling back to polling');
    setIsPolling(true);

    const poll = async () => {
      try {
        const res = await fetch(`/api/audit/${fastApiId}/progress`);
        if (res.ok) {
          const data: ProgressEvent = await res.json();
          setProgress(data);
          setConnected(true);

          if (data.status === "completed" || data.status === "failed") {
            setDone(true);
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }
        } else {
          console.error('[Polling] Failed to fetch progress:', res.status);
          setConnected(false);
        }
      } catch (error) {
        console.error('[Polling] Error:', error);
        setConnected(false);
      }
    };

    // Poll immediately, then every 2 seconds
    poll();
    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL);
  }, [fastApiId, isPolling]);

  const connect = useCallback(() => {
    if (!fastApiId || isPolling) return;

    const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://127.0.0.1:8000";
    console.log('[SSE] Attempting connection to:', `${fastapiUrl}/api/audit/${fastApiId}/status`);
    const es = new EventSource(`${fastapiUrl}/api/audit/${fastApiId}/status`);
    esRef.current = es;

    es.onopen = () => {
      console.log('[SSE] Connection established');
      setConnected(true);
      setConnectionAttempts(0); // Reset on successful connection
    };

    es.addEventListener("progress", (event) => {
      try {
        const data: ProgressEvent = JSON.parse(event.data);
        setProgress(data);

        if (data.status === "completed" || data.status === "failed") {
          setDone(true);
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    });

    es.onerror = () => {
      console.error('[SSE] Connection error, attempt:', connectionAttempts + 1);
      setConnected(false);
      es.close();

      if (connectionAttempts >= MAX_SSE_RETRIES) {
        console.log('[SSE] Max retries reached, falling back to polling');
        startPolling();
      } else {
        setConnectionAttempts(prev => prev + 1);
        setTimeout(() => connect(), SSE_RETRY_DELAY);
      }
    };
  }, [fastApiId, connectionAttempts, isPolling, startPolling]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [connect]);

  return { progress, connected, done };
}
