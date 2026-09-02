import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Trendzn × trüfrü — Trend social & canali inspo" },
      {
        name: "description",
        content:
          "Esplora trend social real time, trend attuali e canali di ispirazione, filtrabili per industry, piattaforma e categoria.",
      },
      { property: "og:title", content: "Trendzn × trüfrü — Trend social & canali inspo" },
      {
        property: "og:description",
        content:
          "Esplora trend social real time, trend attuali e canali di ispirazione, filtrabili per industry, piattaforma e categoria.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Trendzn × trüfrü — Trend social & canali inspo" },
      {
        name: "twitter:description",
        content:
          "Esplora trend social real time, trend attuali e canali di ispirazione, filtrabili per industry, piattaforma e categoria.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen">
        <Navbar />
        <main className="mx-auto w-full max-w-[1400px] px-4 pb-20 pt-6 sm:px-6 lg:px-10">
          <Outlet />
        </main>
      </div>
    </QueryClientProvider>
  );
}

const NAV_ITEMS = [
  { to: "/", label: "Home" },
  { to: "/trend-real-time", label: "Trend to Act" },
  { to: "/trend-attuali", label: "Trend to Adapt" },
  { to: "/trend-evergreen", label: "Cultural Formats" },
  { to: "/influencer", label: "Talent Monitoring" },
  { to: "/piano-editoriale", label: "Piano Editoriale" },
];

function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-4 py-3 sm:px-6 lg:px-10">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <img src="/brand/logo-full-v2.png" alt="Trendzn" className="h-7 w-auto" />
          <span className="font-display text-sm font-semibold text-muted-foreground">x</span>
          <img src="/brand/trufru-logo.svg" alt="trüfrü" className="h-6 w-auto" />
        </Link>

        {/* Desktop nav */}
        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              activeOptions={{ exact: it.to === "/" }}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-secondary-foreground"
            >
              {it.label}
            </Link>
          ))}
        </nav>

        {/* Hamburger (mobile) */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground md:hidden"
          aria-label={open ? "Chiudi menu" : "Apri menu"}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-border bg-background md:hidden">
          <nav className="flex flex-col px-4 py-3 gap-1">
            {NAV_ITEMS.map((it) => (
              <Link
                key={it.to}
                to={it.to}
                activeOptions={{ exact: it.to === "/" }}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-secondary hover:text-secondary-foreground data-[status=active]:bg-secondary data-[status=active]:text-secondary-foreground"
              >
                {it.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
