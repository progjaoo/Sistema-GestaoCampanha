import { useCallback, useEffect, useMemo, useState } from "react";

const SNAPSHOT_VERSION = 1;

type SnapshotEnvelope<T> = {
  version: number;
  savedAt: string;
  data: T;
};

function snapshotKey(scope: string, params: Record<string, unknown>) {
  return `ea2026:snapshot:${scope}:${encodeURIComponent(JSON.stringify(params))}`;
}

function readSnapshot<T>(key: string): SnapshotEnvelope<T> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SnapshotEnvelope<T>>;
    if (parsed.version !== SNAPSHOT_VERSION || typeof parsed.savedAt !== "string" || !("data" in parsed)) return null;
    return parsed as SnapshotEnvelope<T>;
  } catch {
    return null;
  }
}

export function useConnectivity() {
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const markOnline = () => setIsOffline(false);
    const markOffline = () => setIsOffline(true);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  return { isOffline };
}

export function useOfflineSnapshot<T>(scope: string, params: Record<string, unknown>) {
  const key = useMemo(() => snapshotKey(scope, params), [scope, params]);
  const [snapshot, setSnapshot] = useState<SnapshotEnvelope<T> | null>(null);

  useEffect(() => {
    setSnapshot(readSnapshot<T>(key));
  }, [key]);

  const saveSnapshot = useCallback((data: T) => {
    const next: SnapshotEnvelope<T> = { version: SNAPSHOT_VERSION, savedAt: new Date().toISOString(), data };
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
      setSnapshot(next);
    } catch {
      // A full or disabled storage must not interrupt the live request.
    }
  }, [key]);

  return {
    data: snapshot?.data ?? null,
    savedAt: snapshot?.savedAt ?? null,
    saveSnapshot,
  };
}

export function formatLastUpdated(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}