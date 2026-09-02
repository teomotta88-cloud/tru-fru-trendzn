import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { PlatformIcon } from "@/components/SocialEmbed";
import { ManualSubmitDialog } from "@/components/ManualSubmitDialog";
import { Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/influencer/")({
  head: () => ({
    meta: [
      { title: "Talent Monitoring — Nostromo" },
      {
        name: "description",
        content: "Profili influencer monitorati automaticamente, organizzati per cliente.",
      },
    ],
  }),
  component: InfluencerPage,
});

const TRENDS_JSON_URL = "/api/public/hooks/trends-json";

const GITHUB_SYNC_ENDPOINT = "/api/public/hooks/trigger-sync-canali-feed";

function detectPlatform(url: string): "instagram" | "tiktok" | "youtube" | "web" {
  if (/instagram\.com/.test(url)) return "instagram";
  if (/tiktok\.com/.test(url)) return "tiktok";
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  return "web";
}

function extractHandle(url: string): string {
  try {
    const clean = url.replace(/\/$/, "").split("?")[0];
    const parts = clean.split("/");
    return parts[parts.length - 1].replace(/^@/, "") || url;
  } catch {
    return url;
  }
}

type Tab = "profili" | "feed";

// Toggle a pillola condiviso tra la vista profili e la vista feed: stesso
// pattern del toggle "Canali Inspo / Feed" della pagina Canali Inspo, così
// Talent Monitoring resta un'unica pagina con due tab invece di due route separate.
function InfluencerToggle({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div className="inline-flex gap-1 rounded-full border border-border bg-card/50 p-1">
      {(["profili", "feed"] as const).map((t) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
            tab === t
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t === "profili" ? "Talent Monitoring" : "Feed"}
        </button>
      ))}
    </div>
  );
}

function InfluencerPage() {
  const [tab, setTab] = useState<Tab>("profili");
  return tab === "profili" ? (
    <InfluencerView tab={tab} setTab={setTab} />
  ) : (
    <InfluencerFeedView tab={tab} setTab={setTab} />
  );
}

// ---------------------------------------------------------------------------
// Tab "profili": griglia dei profili influencer monitorati
// ---------------------------------------------------------------------------

type InfluencerProfile = {
  id: string;
  name: string;
  cliente: string | null;
  target: string | null;
  urls: string[];
  descrizione: string | null;
  accounts: { platform: string; handle: string; url: string; date?: string | null; caption?: string | null }[];
};

type DbRow = {
  id: string;
  url: string;
  title: string | null; // cliente
  industry: string | null; // nome influencer
  category: string | null;
  tags: string[] | null; // target/segment (es. Young, Family, Wellness)
};

function rowToProfile(row: DbRow): InfluencerProfile {
  const platform = detectPlatform(row.url);
  const handle = extractHandle(row.url);
  return {
    id: row.id,
    name: row.industry ?? handle,
    cliente: row.title ?? null,
    target: row.tags && row.tags.length > 0 ? row.tags.join(", ") : null,
    urls: [row.url],
    descrizione: null,
    accounts: [{ platform, handle, url: row.url }],
  };
}

function InfluencerView({ tab, setTab }: { tab?: Tab; setTab?: (t: Tab) => void }) {
  const [q, setQ] = useState("");
  const [plat, setPlat] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [dbRows, setDbRows] = useState<DbRow[]>([]);
  const [jsonProfiles, setJsonProfiles] = useState<InfluencerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchJson = useCallback(() => {
    return fetch(TRENDS_JSON_URL)
      .then((r) => r.json())
      .then((decoded) => {
        setJsonProfiles(decoded.influencer_profiles || []);
      })
      .catch((e) => console.error("Errore caricamento trends.json:", e));
  }, []);

  const fetchDb = useCallback(() => {
    return supabase
      .from("trend_submissions")
      .select("id, url, title, industry, category, tags")
      .eq("section", "influencer")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setDbRows(data as DbRow[]);
      });
  }, []);

  useEffect(() => {
    Promise.all([fetchJson(), fetchDb()]).finally(() => setLoading(false));
  }, [fetchJson, fetchDb]);

  // Dopo un inserimento manuale, il profilo finisce su Supabase E (se non è
  // duplicato) viene subito sincronizzato su GitHub: ricarichiamo entrambe le fonti.
  const handleManualSuccess = useCallback(() => {
    fetchDb();
    setTimeout(fetchJson, 1500);
  }, [fetchDb, fetchJson]);

  const handleToDbId = useMemo(() => {
    const map = new Map<string, string>();
    dbRows.forEach((r) => {
      const handle = extractHandle(r.url).toLowerCase();
      if (!map.has(handle)) map.set(handle, r.id);
    });
    return map;
  }, [dbRows]);

  const handleDeleteSupabase = useCallback(async (dbId: string) => {
    if (!window.confirm("Eliminare questo profilo?")) return;
    setDeleting(dbId);
    try {
      const res = await fetch("/api/public/hooks/delete-trend-submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dbId }),
      });
      if (res.ok) {
        setDbRows((prev) => prev.filter((r) => r.id !== dbId));
      } else {
        window.alert("Errore durante l'eliminazione. Riprova.");
      }
    } catch {
      window.alert("Errore di rete. Riprova.");
    } finally {
      setDeleting(null);
    }
  }, []);

  const jsonHandles = useMemo(
    () => new Set(jsonProfiles.flatMap((c) => c.accounts.map((a) => a.handle.toLowerCase()))),
    [jsonProfiles],
  );

  const dbProfiles = useMemo(
    () =>
      dbRows
        .map(rowToProfile)
        .filter((c) => !c.accounts.some((a) => jsonHandles.has(a.handle.toLowerCase()))),
    [dbRows, jsonHandles],
  );

  const allProfiles = useMemo(() => [...dbProfiles, ...jsonProfiles], [dbProfiles, jsonProfiles]);
  const dbIds = useMemo(() => new Set(dbRows.map((r) => r.id)), [dbRows]);

  const platforms = useMemo(
    () => Array.from(new Set(allProfiles.flatMap((c) => c.accounts.map((a) => a.platform)))).sort(),
    [allProfiles],
  );

  const targets = useMemo(
    () =>
      Array.from(
        new Set(allProfiles.flatMap((c) => (c.target ? c.target.split(", ") : []))),
      ).sort(),
    [allProfiles],
  );

  const filtered = useMemo(
    () =>
      allProfiles.filter((c) => {
        if (plat && !c.accounts.some((a) => a.platform === plat)) return false;
        if (targetFilter && !(c.target ?? "").split(", ").includes(targetFilter)) return false;
        if (q) {
          const hay = (
            c.name +
            " " +
            (c.cliente ?? "") +
            " " +
            (c.target ?? "") +
            " " +
            c.accounts.map((a) => a.handle).join(" ")
          ).toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [allProfiles, q, plat, targetFilter],
  );

  if (loading)
    return (
      <div className="space-y-8">
        <header className="space-y-2">
          <h1 className="font-display text-3xl font-bold sm:text-4xl">Talent Monitoring</h1>
        </header>
        <div className="text-sm text-muted-foreground">Caricamento profili…</div>
      </div>
    );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-bold sm:text-4xl">Talent Monitoring</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Profili influencer monitorati automaticamente, organizzati per cliente.
          </p>
        </div>
        <ManualSubmitDialog section="influencer" onSuccess={handleManualSuccess} />
      </header>

      {tab !== undefined && setTab && (
        <div className="flex">
          <InfluencerToggle tab={tab} setTab={setTab} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/50 p-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca influencer, cliente o account…"
            className="w-full rounded-lg border border-border bg-background/60 py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <select
          value={plat}
          onChange={(e) => setPlat(e.target.value)}
          className="rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">Tutte le piattaforme</option>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {targets.length > 0 && (
          <select
            value={targetFilter}
            onChange={(e) => setTargetFilter(e.target.value)}
            className="rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">Tutti i target</option>
            {targets.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} / {allProfiles.length}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {filtered.map((c) => {
          const main = c.accounts[0];
          const initial =
            c.name
              .replace(/[^a-zA-Z0-9]/g, "")
              .charAt(0)
              .toUpperCase() || "•";

          const isDb = dbIds.has(c.id);
          const isJsonProfile = jsonProfiles.some((j) => j.id === c.id);

          const dbIdForProfile =
            isDb
              ? c.id
              : c.accounts
                  .map((a) => handleToDbId.get(a.handle.toLowerCase()))
                  .find(Boolean) ?? null;

          const canDelete = !!dbIdForProfile;
          const deletingThis = deleting === dbIdForProfile;

          return (
            <div key={c.id} className="group relative">
              {canDelete && (
                <button
                  onClick={() => handleDeleteSupabase(dbIdForProfile!)}
                  disabled={deletingThis}
                  className="absolute right-2 top-2 z-10 hidden rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:border-destructive hover:text-destructive group-hover:flex"
                  title="Elimina"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
              {(() => {
                const cardContent = (
                  <>
                    <div className="relative mx-auto flex aspect-square w-full max-w-[120px] items-center justify-center rounded-full bg-gradient-to-br from-primary/40 via-accent/30 to-primary/10">
                      <div className="flex size-[88%] items-center justify-center rounded-full bg-card font-display text-3xl font-bold">
                        {initial}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="truncate font-display text-sm font-semibold">
                        @{main.handle}
                      </div>
                      <div className="mt-1 flex items-center justify-center gap-1.5 text-muted-foreground">
                        {c.accounts.map((a, i) => (
                          <PlatformIcon key={i} platform={a.platform} className="size-3.5" />
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
                        {c.cliente && (
                          <span className="inline-block rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                            {c.cliente}
                          </span>
                        )}
                        {c.target && (
                          <span className="inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {c.target}
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                );

                const cardClassName =
                  "flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-primary";

                if (isJsonProfile) {
                  return (
                    <Link
                      to="/influencer/$id"
                      params={{ id: c.id }}
                      className={cardClassName}
                    >
                      {cardContent}
                    </Link>
                  );
                }

                return (
                  <a href={main.url} target="_blank" rel="noreferrer" className={cardClassName}>
                    {cardContent}
                  </a>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab "feed": griglia dei post recenti (ex pagina /influencer-feed, ora
// annidata qui — stesso schema della pagina Canali Inspo con toggle "Feed").
// ---------------------------------------------------------------------------

interface FeedAccount {
  platform: string;
  handle: string;
  url: string;
  date?: string | null;
  caption?: string | null;
}

interface FeedInfluencerProfile {
  id: string;
  name: string;
  cliente: string | null;
  accounts: FeedAccount[];
}

interface TrendsData {
  influencer_profiles?: FeedInfluencerProfile[];
}

interface Post {
  url: string;
  handle: string;
  platform: string;
  influencerName: string;
  cliente: string | null;
  date: string | null;
  caption: string | null;
}

function decodeHtmlEntities(str: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = str;
  return textarea.value;
}

function isPostUrl(url: string): boolean {
  return /\/p\/|\/reel\/|\/reels\/|\/video\/|\/photo\/|\/watch\/|\/tv\//.test(url);
}

function getPlatform(url: string): string {
  if (/instagram\.com/.test(url)) return "instagram";
  if (/tiktok\.com/.test(url)) return "tiktok";
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  return "web";
}

function getEmbedUrl(url: string): string | null {
  const ig = url.match(/instagram\.com\/(p|reel|reels|tv)\/([^/?#]+)/);
  if (ig) return `https://www.instagram.com/${ig[1]}/${ig[2]}/embed/`;
  const tt = url.match(/tiktok\.com\/@[^/]+\/(?:video|photo)\/(\d+)/);
  if (tt) return `https://www.tiktok.com/embed/v2/${tt[1]}`;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&/?#]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  return null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Intl.DateTimeFormat("it-IT", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(dateStr));
  } catch {
    return "";
  }
}

function PlatformBadge({ platform }: { platform: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    instagram: { bg: "#f0e6f6", text: "#7c3aed" },
    tiktok: { bg: "#e8f0fe", text: "#1a73e8" },
    youtube: { bg: "#fce8e8", text: "#d93025" },
    web: { bg: "#f0f4f8", text: "#64748b" },
  };
  const c = colors[platform] || colors.web;
  const labels: Record<string, string> = {
    instagram: "Instagram",
    tiktok: "TikTok",
    youtube: "YouTube",
    web: "Web",
  };
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        padding: "2px 8px",
        borderRadius: 99,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
        textTransform: "uppercase",
      }}
    >
      {labels[platform] || platform}
    </span>
  );
}

function LazyEmbed({ embedUrl, height }: { embedUrl: string; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", background: "#f8f9fa", minHeight: height }}>
      {!loaded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f8f9fa",
            color: "#94a3b8",
            fontSize: 13,
          }}
        >
          Caricamento…
        </div>
      )}
      {visible && (
        <iframe
          src={embedUrl}
          width="100%"
          height={height}
          frameBorder={0}
          allowFullScreen
          scrolling="no"
          loading="lazy"
          style={{ display: "block", border: "none", position: "relative" }}
          onLoad={() => setLoaded(true)}
        />
      )}
    </div>
  );
}

function PostCard({ post }: { post: Post }) {
  const embedUrl = getEmbedUrl(post.url);
  const platform = getPlatform(post.url);
  const heights: Record<string, number> = { instagram: 480, tiktok: 560, youtube: 315 };
  const h = heights[platform] || 400;
  const dateStr = formatDate(post.date);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.06)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid #f1f1f1",
        }}
      >
        <PlatformBadge platform={platform} />
        <span
          style={{
            fontSize: 12,
            color: "#94a3b8",
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 110,
          }}
        >
          {post.influencerName}
        </span>
        {post.cliente && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#ea580c",
              background: "#fff7ed",
              padding: "1px 6px",
              borderRadius: 99,
              whiteSpace: "nowrap",
            }}
          >
            {post.cliente}
          </span>
        )}
        {dateStr && (
          <span style={{ fontSize: 11, color: "#cbd5e1", marginLeft: "auto", whiteSpace: "nowrap" }}>
            {dateStr}
          </span>
        )}
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Apri il post"
          style={{
            marginLeft: dateStr ? 8 : "auto",
            display: "flex",
            alignItems: "center",
            color: "#94a3b8",
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <path d="M15 3h6v6" />
            <path d="M10 14L21 3" />
          </svg>
        </a>
      </div>

      {embedUrl ? (
        <LazyEmbed embedUrl={embedUrl} height={h} />
      ) : (
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            padding: "20px 14px",
            color: "#3b82f6",
            fontSize: 13,
            textDecoration: "none",
            wordBreak: "break-all",
          }}
        >
          {post.url}
        </a>
      )}

      {post.caption && (
        <p
          style={{
            margin: 0,
            padding: "10px 14px",
            fontSize: 12,
            lineHeight: 1.5,
            color: "#475569",
            borderTop: "1px solid #f1f1f1",
            maxHeight: 80,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {decodeHtmlEntities(post.caption)}
        </p>
      )}
    </div>
  );
}

function FeedFilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-secondary text-secondary-foreground"
          : "border border-border bg-background/50 text-muted-foreground hover:border-primary"
      }`}
    >
      {label}
    </button>
  );
}

type FeedSyncStatus = "idle" | "loading" | "success" | "error";
type SortOrder = "recenti" | "meno_recenti";
type DatePreset = "tutto" | "7g" | "30g" | "90g" | "custom";

function SyncButton({ endpoint, label: idleLabel }: { endpoint: string; label: string }) {
  const [status, setStatus] = useState<FeedSyncStatus>("idle");

  const handleSync = async () => {
    setStatus("loading");
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "manual" }),
      });
      setStatus("success");
      setTimeout(() => setStatus("idle"), 4000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4000);
    }
  };

  const label: Record<FeedSyncStatus, string> = {
    idle: idleLabel,
    loading: "Sincronizzazione…",
    success: "✓ Avviato",
    error: "Errore — riprova",
  };

  return (
    <button
      onClick={handleSync}
      disabled={status === "loading"}
      className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        status === "success"
          ? "bg-green-600/15 text-green-700"
          : status === "error"
            ? "bg-destructive/15 text-destructive"
            : "border border-border bg-background/50 text-muted-foreground hover:border-primary"
      }`}
    >
      {label[status]}
    </button>
  );
}

function DateRangeFilter({
  preset,
  setPreset,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
}: {
  preset: DatePreset;
  setPreset: (p: DatePreset) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
}) {
  const presets: { key: DatePreset; label: string }[] = [
    { key: "tutto", label: "Tutto" },
    { key: "7g", label: "Ultima settimana" },
    { key: "30g", label: "Ultimo mese" },
    { key: "90g", label: "Ultimi 3 mesi" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <FeedFilterPill key={p.key} label={p.label} active={preset === p.key} onClick={() => setPreset(p.key)} />
      ))}
      <FeedFilterPill label="Personalizzato" active={preset === "custom"} onClick={() => setPreset("custom")} />
      {preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-lg border border-border bg-background/60 px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-lg border border-border bg-background/60 px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
          />
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 12;

function InfluencerFeedView({ tab, setTab }: { tab?: Tab; setTab?: (t: Tab) => void }) {
  const [data, setData] = useState<TrendsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState("tutti");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("recenti");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [datePreset, setDatePreset] = useState<DatePreset>("tutto");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    fetch(TRENDS_JSON_URL)
      .then((r) => r.json())
      .then((decoded) => {
        setData(decoded);
      })
      .catch(() => setError("Impossibile caricare il feed."));
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [platformFilter, search, sortOrder, datePreset, customFrom, customTo]);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (datePreset === "tutto") return null;
    if (datePreset === "custom") {
      const from = customFrom ? new Date(customFrom) : null;
      const to = customTo ? new Date(customTo + "T23:59:59") : null;
      if (!from && !to) return null;
      return { from, to };
    }
    const days = datePreset === "7g" ? 7 : datePreset === "30g" ? 30 : 90;
    const from = new Date(now);
    from.setDate(from.getDate() - days);
    return { from, to: now };
  }, [datePreset, customFrom, customTo]);

  const header = (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Talent Monitoring</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Post recenti dagli influencer monitorati su Instagram e TikTok.
        </p>
      </div>
      <SyncButton endpoint={GITHUB_SYNC_ENDPOINT} label="↻ Sincronizza ora" />
    </header>
  );

  const toggle = tab !== undefined && setTab && (
    <div className="flex">
      <InfluencerToggle tab={tab} setTab={setTab} />
    </div>
  );

  if (error)
    return (
      <div className="space-y-8">
        {header}
        {toggle}
        <div className="py-16 text-center text-sm text-destructive">{error}</div>
      </div>
    );
  if (!data)
    return (
      <div className="space-y-8">
        {header}
        {toggle}
        <div className="py-16 text-center text-sm text-muted-foreground">Caricamento feed…</div>
      </div>
    );

  const allPosts: Post[] = [];
  for (const profile of data.influencer_profiles || []) {
    const name = profile.name || profile.id || "";
    for (const account of profile.accounts || []) {
      if (isPostUrl(account.url)) {
        allPosts.push({
          url: account.url,
          handle: account.handle,
          platform: account.platform || getPlatform(account.url),
          influencerName: name,
          cliente: profile.cliente ?? null,
          date: account.date ?? null,
          caption: account.caption ?? null,
        });
      }
    }
  }

  const sorted = [...allPosts].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return sortOrder === "recenti" ? db - da : da - db;
  });

  const filtered = sorted.filter((p) => {
    const matchPlatform = platformFilter === "tutti" || p.platform === platformFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      p.handle?.toLowerCase().includes(q) ||
      p.influencerName?.toLowerCase().includes(q) ||
      p.cliente?.toLowerCase().includes(q) ||
      p.caption?.toLowerCase().includes(q);

    let matchDate = true;
    if (dateRange) {
      if (!p.date) {
        matchDate = false;
      } else {
        const d = new Date(p.date);
        if (dateRange.from && d < dateRange.from) matchDate = false;
        if (dateRange.to && d > dateRange.to) matchDate = false;
      }
    }

    return matchPlatform && matchSearch && matchDate;
  });

  const visiblePosts = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const platforms = ["tutti", ...new Set(allPosts.map((p) => p.platform))];

  return (
    <div className="space-y-8">
      {header}
      {toggle}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/50 p-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Cerca influencer, cliente, account o caption…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background/60 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {platforms.map((p) => (
            <FeedFilterPill
              key={p}
              label={p === "tutti" ? `Tutti (${allPosts.length})` : p}
              active={platformFilter === p}
              onClick={() => setPlatformFilter(p)}
            />
          ))}
        </div>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          className="rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="recenti">Più recenti</option>
          <option value="meno_recenti">Meno recenti</option>
        </select>
        <DateRangeFilter
          preset={datePreset}
          setPreset={setDatePreset}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
        />
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} post</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Nessun post trovato.
        </div>
      ) : (
        <>
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {visiblePosts.map((post, i) => (
              <PostCard key={`${post.url}-${i}`} post={post} />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="rounded-full border border-border bg-card px-6 py-2.5 text-sm font-medium text-foreground transition hover:border-primary"
              >
                Carica altri ({filtered.length - visibleCount} rimanenti)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
