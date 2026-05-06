"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const DBG_ENDPOINT =
  "http://127.0.0.1:7243/ingest/9f83cdbc-7a2c-49ee-9246-0ca0a646dfe1";
const DBG_SESSION = "debug-session";

function getRunId(): string {
  try {
    const g = globalThis as any;
    if (g.__DBG_RUN_ID) return String(g.__DBG_RUN_ID);
    const rid = `run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    g.__DBG_RUN_ID = rid;
    return rid;
  } catch {
    return "run_unknown";
  }
}

function dbg(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>
) {
  // #region agent log (ndjson)
  fetch(DBG_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: DBG_SESSION,
      runId: getRunId(),
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion agent log (ndjson)
}

export default function Navigation() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    dbg("H4", "components/Navigation.tsx:mount", "nav mounted", {
      pathname,
    });
  }, []);

  const isActive = (path: string) => {
    if (!mounted || !pathname) return false;
    return pathname === path || pathname.startsWith(path + "/");
  };

  return (
    <nav
      className="bg-white shadow-sm border-b sticky top-0 z-[2147483646]"
      style={{ pointerEvents: "auto", isolation: "isolate" }}
      onClickCapture={(e) => {
        const el = e.target as HTMLElement | null;
        const a = el?.closest?.("a") as HTMLAnchorElement | null;
        if (!a) return;
        dbg("H4", "components/Navigation.tsx:onClickCapture", "nav link click", {
          href: a.getAttribute("href"),
          pathname,
        });
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link
              href="/szs-admin/cockpit"
              className="flex items-center gap-3 cursor-pointer"
              style={{ display: "block", pointerEvents: "auto" }}
            >
              <Image
                src="/szs-admin/cockpit/spitexsolutions-logo.png"
                alt="Spitex Solutions"
                width={160}
                height={40}
                priority
                className="h-10 w-auto"
              />
              <span className="sr-only">Cockpit Reporting Tool</span>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <Link
              href="/szs-admin/cockpit/data-entry"
              className={`px-3 py-2 rounded-md text-sm font-medium transition cursor-pointer ${
                isActive("/szs-admin/cockpit/data-entry")
                  ? "text-blue-600 bg-blue-50"
                  : "text-gray-700 hover:text-gray-900 hover:bg-gray-50"
              }`}
              style={{ display: "block", pointerEvents: "auto" }}
            >
              Dateneingabe
            </Link>
            <Link
              href="/szs-admin/cockpit/reports"
              className={`px-3 py-2 rounded-md text-sm font-medium transition cursor-pointer ${
                isActive("/szs-admin/cockpit/reports")
                  ? "text-blue-600 bg-blue-50"
                  : "text-gray-700 hover:text-gray-900 hover:bg-gray-50"
              }`}
              style={{ display: "block", pointerEvents: "auto" }}
            >
              Reports
            </Link>
            <Link
              href="/szs-admin/cockpit/personaldaten"
              className={`px-3 py-2 rounded-md text-sm font-medium transition cursor-pointer ${
                isActive("/szs-admin/cockpit/personaldaten")
                  ? "text-blue-600 bg-blue-50"
                  : "text-gray-700 hover:text-gray-900 hover:bg-gray-50"
              }`}
              style={{ display: "block", pointerEvents: "auto" }}
            >
              Personaldaten
            </Link>
            <Link
              href="/szs-admin/cockpit/modell"
              className={`px-3 py-2 rounded-md text-sm font-medium transition cursor-pointer ${
                isActive("/szs-admin/cockpit/modell")
                  ? "text-blue-600 bg-blue-50"
                  : "text-gray-700 hover:text-gray-900 hover:bg-gray-50"
              }`}
              style={{ display: "block", pointerEvents: "auto" }}
            >
              Modell
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

