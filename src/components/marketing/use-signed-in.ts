"use client";
import { useSyncExternalStore } from "react";

/**
 * Whether the visitor has a session: null until known (render the signed-out HTML), then true/false.
 * Marketing pages stay static and cacheable; one same-origin request per page load, shared by every component.
 * Documented flash: a signed-in visitor sees the signed-out labels for the first fetch round trip (labels swap, no layout shift).
 */
let state: boolean | null = null;
let started = false;
const listeners = new Set<() => void>();

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  fetch("/api/auth/get-session", { credentials: "same-origin", headers: { accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((s: { user?: unknown } | null) => { state = !!s?.user; })
    .catch(() => { state = false; })
    .finally(() => listeners.forEach((l) => l()));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  start();
  return () => { listeners.delete(cb); };
}

export function useSignedIn(): boolean | null {
  return useSyncExternalStore(subscribe, () => state, () => null);
}
