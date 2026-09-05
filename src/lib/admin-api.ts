"use client";

/** Authenticated fetch — always sends httpOnly session cookie */
export function portalFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.headers || {}),
    },
  });
}

/** @deprecated Headers are no longer trusted for auth — session cookie is authoritative */
export function useSuperAdminHeaders() {
  return {
    "Content-Type": "application/json",
  };
}
