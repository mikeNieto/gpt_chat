"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useSyncExternalStore } from "react";

import { useAppContext } from "@/components/app/app-provider";

function Sidebar({ mounted }: { mounted: boolean }) {
  const pathname = usePathname();
  const { dictionary, threads, loadingBootstrap, models } = useAppContext();
  const modelLabelById = new Map(models.map((model) => [model.id, model.name]));

  if (!mounted) {
    return <aside className="app-sidebar" aria-hidden="true" />;
  }

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__brand">
        <div className="app-sidebar__logo">
          <span className="app-sidebar__glyph">◎</span>
          <span>{dictionary.appName}</span>
        </div>
        <Link
          className="icon-button"
          href="/settings"
          aria-label={dictionary.settings}
        >
          ⚙
        </Link>
      </div>

      <div className="app-sidebar__card" style={{ padding: "0.7rem" }}>
        <Link className="app-sidebar__cta" href="/">
          <span>＋</span>
          <span>{dictionary.newChat}</span>
        </Link>
      </div>

      <div className="app-sidebar__section" style={{ minHeight: 0, flex: 1 }}>
        <div className="app-sidebar__label">{dictionary.yourChats}</div>
        <div
          className="app-sidebar__card app-sidebar__threads"
          style={{
            minHeight: 0,
            flex: 1,
            overflowY: "auto",
            padding: "0.5rem",
          }}
        >
          {loadingBootstrap ? (
            <div className="app-sidebar__item">
              <span>{dictionary.loading}</span>
            </div>
          ) : threads.length ? (
            threads.map((thread) => (
              <Link
                key={thread.id}
                className={`app-sidebar__item ${pathname === `/chat/${thread.id}` ? "is-active" : ""}`}
                href={`/chat/${thread.id}`}
              >
                <div className="app-sidebar__meta">
                  <span className="app-sidebar__title">{thread.title}</span>
                  <span className="app-sidebar__subtitle">
                    {thread.modelId
                      ? modelLabelById.get(thread.modelId) ?? thread.modelId
                      : dictionary.defaultModel}
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <div className="app-sidebar__item">
              <span>{dictionary.noThreads}</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { dictionary, modelsConnection } = useAppContext();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <div className="app-shell">
      <Sidebar mounted={mounted} />
      <section className="app-main">
        <header className="app-header">
          <div className="app-header__cluster">
            <span
              className={`inline-badge ${modelsConnection?.ok ? "is-ok" : ""}`}
            >
              {modelsConnection?.ok
                ? dictionary.connected
                : dictionary.unavailable}
            </span>
          </div>
        </header>
        <div className="page-area">
          <div className="page-panel">{children}</div>
        </div>
      </section>
    </div>
  );
}
