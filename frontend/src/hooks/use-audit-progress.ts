"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { ProgressEvent } from "@/types/audit";

const MAX_SSE_RETRIES = 2;
const SSE_RETRY_DELAY = 2000; // 2 seconds
const POLL_INTERVAL = 2000; // 2 seconds
const STALL_TIMEOUT = 120000; // 2 minutes without events = stalled

export function useAuditProgress(fastApiId: string | null, auditId: string | null) {
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const connectionAttemptsRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastEventTimeRef = useRef<number>(Date.now());
  const stallCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectingToastRef = useRef<string | number | null>(null);

  const dismissConnectingToast = useCallback(() => {
    if (connectingToastRef.current !== null) {
      toast.dismiss(connectingToastRef.current);
      connectingToastRef.current = null;
    }
  }, []);

  const checkForStall = useCallback(() => {
    const now = Date.now();
    const timeSinceLastEvent = now - lastEventTimeRef.current;

    if (timeSinceLastEvent > STALL_TIMEOUT) {
      dismissConnectingToast();
      toast.error("Connection lost. The audit may still be running in the background.");
    }
  }, [dismissConnectingToast]);

  const startPolling = useCallback(() => {
    if (!auditId || isPolling) return;

    console.log('[SSE] Falling back to polling');
    setIsPolling(true);

    const poll = async () => {
      try {
        const res = await fetch(`/api/audit/${auditId}/progress`);
        if (res.ok) {
          const data: ProgressEvent = await res.json();
          setProgress(data);
          setConnected(true);
          dismissConnectingToast();
          lastEventTimeRef.current = Date.now();

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
          toast.error(`Polling failed with status ${res.status}`);
        }
      } catch (error) {
        console.error('[Polling] Error:', error);
        setConnected(false);
        toast.error("Failed to fetch progress");
      }
    };

    poll();
    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL);
  }, [auditId, isPolling, dismissConnectingToast]);

  const connect = useCallback(() => {
    if (!fastApiId || isPolling) return;

    if (connectionAttemptsRef.current >= MAX_SSE_RETRIES) {
      console.log('[SSE] Max retries reached, falling back to polling');
      dismissConnectingToast();
      startPolling();
      return;
    }

    const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://127.0.0.1:8000";
    console.log('[SSE] Attempting connection to:', `${fastapiUrl}/api/audit/${fastApiId}/status`);
    const es = new EventSource(`${fastapiUrl}/api/audit/${fastApiId}/status`);
    esRef.current = es;

    es.onopen = () => {
      console.log('[SSE] Connection established');
      setConnected(true);
      dismissConnectingToast();
      connectionAttemptsRef.current = 0;
      lastEventTimeRef.current = Date.now();
    };

    es.addEventListener("progress", (event) => {
      try {
        const data: ProgressEvent = JSON.parse(event.data);
        setProgress(data);
        dismissConnectingToast();
        lastEventTimeRef.current = Date.now();

        if (data.status === "completed" || data.status === "failed") {
          setDone(true);
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener("ping", () => {
      lastEventTimeRef.current = Date.now();
    });

    es.onerror = () => {
      connectionAttemptsRef.current += 1;
      console.error('[SSE] Connection error, attempt:', connectionAttemptsRef.current);
      setConnected(false);
      es.close();
      esRef.current = null;

      if (connectionAttemptsRef.current >= MAX_SSE_RETRIES) {
        console.log('[SSE] Max retries reached, falling back to polling');
        dismissConnectingToast();
        startPolling();
      } else {
        connectingToastRef.current = toast.loading(
          `Connecting... (${connectionAttemptsRef.current}/${MAX_SSE_RETRIES})`
        );
        setTimeout(() => {
          if (!isPolling) {
            connect();
          }
        }, SSE_RETRY_DELAY);
      }
    };
  }, [fastApiId, isPolling, startPolling, dismissConnectingToast]);

  useEffect(() => {
    if (!fastApiId) return;

    connectionAttemptsRef.current = 0;
    lastEventTimeRef.current = Date.now();
    dismissConnectingToast();
    connect();

    stallCheckIntervalRef.current = setInterval(checkForStall, 30000);

    return () => {
      esRef.current?.close();
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (stallCheckIntervalRef.current) {
        clearInterval(stallCheckIntervalRef.current);
        stallCheckIntervalRef.current = null;
      }
      dismissConnectingToast();
    };
  }, [fastApiId, connect, checkForStall, dismissConnectingToast]);

  return { progress, connected, done };
}
