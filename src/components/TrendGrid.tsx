import { useMemo, useState } from "react";

function decodeHtmlEntities(str: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = str;
  return textarea.value;
}
import type { TrendItem } from "@/lib/trends";
import { detectPlatform, extractUsername } from "@/lib/trends";
import { SocialEmbed, PlatformIcon } from "./SocialEmbed";
import { Search, X, Trash2, Star } from "lucide-react";

type Props = {
  items: TrendItem[];
  dbIds?: Record<string, string>; // url → supabase id
  onDelete?: (url: string) => void;
  onScoreChange?: (url: string, score: number | null) => void;
  showScore?: boolean;
  hideCategoryFilter?: boolean;
};

type SortKey = "date-desc" | "date-asc" | "score-desc" | "score-asc";

const SCORE_LEGEND: { score: number; text: string }[] = [
  { score: 1, text: "Trend virale, ma da valutare se adattare al brand" },
  { score: 2, text: "Trend del settore, adattabile al brand" },
  { score: 3, text: "Trend 100% affine al brand, da non perdere" },
];

function unique(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter((v): v is string => !!v && v.trim().length > 0))).sort();
}

function StarRating({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5" title={`Score ${score}/3`}>
      {Array.from({ length: 3 }).map((_, i) => (
        <Star
          key={i}
          className={`size-3.5 ${i < score ? "fill-primary text-primary" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

// Score editabile a click per i contenuti salvati su Supabase: clic su una
// stella imposta quel valore, clic sulla stella già attiva la azzera.
function ScorePicker({
  score,
  saving,
  onSetScore,
}: {
  score: number | null | undefined;
  saving: boolean;
  onSetScore: (score: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-0.5" title={typeof score === "number" ? `Score ${score}/3` : "Imposta score"}>
      {Array.from({ length: 3 }).map((_, i) => {
        const starValue = i + 1;
        const filled = typeof score === "number" && starValue <= score;
        return (
          <button
            key={i}
            type="button"
            disabled={saving}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSetScore(score === starValue ? null : starValue);
            }}
            className="disabled:opacity-50"
            title={`Imposta score ${starValue}`}
          >
            <Star
              className={`size-3.5 transition ${filled ? "fill-primary text-primary" : "text-muted-foreground/30 hover:text-primary/60"}`}
            />
          </button>
        );
      })}
    </div>
  );
}

export function TrendGrid({
  items,
  dbIds = {},
  onDelete,
  onScoreChange,
  showScore = false,
  hideCategoryFilter = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [industry, setIndustry] = useState<string>("");
  const [platform, setPlatform] = useState<string>("");
  const [scoreFilter, setScoreFilter] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("date-desc");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [savingScore, setSavingScore] = useState<string | null>(null);

  const categories = useMemo(() => unique(items.map((i) => i.category)), [items]);
  const industries = useMemo(() => unique(items.map((i) => i.industry)), [items]);
  const platforms = useMemo(() => unique(items.flatMap((i) => i.links.map(detectPlatform))), [items]);

  const filtered = items.filter((i) => {
    if (category && i.category !== category) return false;
    if (industry && i.industry !== industry) return false;
    if (platform && !i.links.some((l) => detectPlatform(l) === platform)) return false;
    if (scoreFilter && String(i.score ?? "") !== scoreFilter) return false;
    if (query) {
      const hay = [
        i.nome_trend,
        i.descrizione,
        i.applicazione,
        i.canali,
        i.industry,
        i.category,
        i.rawEmail,
        ...(i.tags ?? []),
        ...i.links.map(extractUsername),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  });

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sort) {
        case "score-desc":
          return (b.score ?? 0) - (a.score ?? 0);
        case "score-asc":
          return (a.score ?? 0) - (b.score ?? 0);
        case "date-asc":
          return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
        case "date-desc":
        default:
          return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
      }
    });
    return arr;
  }, [filtered, sort]);

  const hasFilters = !!(query || category || industry || platform || scoreFilter);

  async function handleDelete(url: string) {
    const id = dbIds[url];
    if (!id) return;
    if (!window.confirm("Eliminare questo contenuto?")) return;
    setDeleting(url);
    try {
      const res = await fetch("/api/public/hooks/delete-trend-submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        onDelete?.(url);
      } else {
        window.alert("Errore durante l'eliminazione. Riprova.");
      }
    } catch {
      window.alert("Errore di rete. Riprova.");
    } finally {
      setDeleting(null);
    }
  }

  async function handleSetScore(url: string, score: number | null) {
    const id = dbIds[url];
    if (!id) return;
    setSavingScore(url);
    try {
      const res = await fetch("/api/public/hooks/update-trend-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, score }),
      });
      if (res.ok) {
        onScoreChange?.(url, score);
      } else {
        window.alert("Errore durante l'aggiornamento dello score. Riprova.");
      }
    } catch {
      window.alert("Errore di rete. Riprova.");
    } finally {
      setSavingScore(null);
    }
  }

  return (
    <div className="space-y-6">
      {showScore && (
        <div className="rounded-2xl border border-border bg-card/50 p-4 backdrop-blur">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Legenda Score</p>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-6">
            {SCORE_LEGEND.map(({ score, text }) => (
              <div key={score} className="flex items-center gap-2 text-xs text-muted-foreground">
                <StarRating score={score} />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/50 p-4 backdrop-blur">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per nome, descrizione, caption, username, mail…"
            className="w-full rounded-lg border border-border bg-background/60 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        {!hideCategoryFilter && <Select label="Categoria" value={category} onChange={setCategory} options={categories} />}
        <Select label={hideCategoryFilter ? "Categoria" : "Industry"} value={industry} onChange={setIndustry} options={industries} />
        <Select label="Piattaforma" value={platform} onChange={setPlatform} options={platforms} />
        {showScore && <Select label="Score" value={scoreFilter} onChange={setScoreFilter} options={["1", "2", "3"]} />}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="date-desc">Data: più recenti</option>
          <option value="date-asc">Data: meno recenti</option>
          {showScore && <option value="score-desc">Score: più alto</option>}
          {showScore && <option value="score-asc">Score: più basso</option>}
        </select>
        {hasFilters && (
          <button
            onClick={() => {
              setQuery("");
              setCategory("");
              setIndustry("");
              setPlatform("");
              setScoreFilter("");
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" /> Reset
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} / {items.length}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Nessun trend trovato con i filtri selezionati.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {sorted.map((item, idx) => {
            const url = item.links[0];
            const isDb = !!dbIds[url];
            return (
              <article
                key={idx}
                className="group relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-primary/60"
              >
                {isDb && (
                  <button
                    onClick={() => handleDelete(url)}
                    disabled={deleting === url}
                    className="absolute right-3 top-3 z-10 hidden rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:border-destructive hover:text-destructive group-hover:flex"
                    title="Elimina"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
                <div className="space-y-2 px-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.category && (
                      <span className="inline-block rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        {item.category}
                      </span>
                    )}
                    {showScore &&
                      (isDb ? (
                        <ScorePicker
                          score={item.score}
                          saving={savingScore === url}
                          onSetScore={(s) => handleSetScore(url, s)}
                        />
                      ) : typeof item.score === "number" ? (
                        <StarRating score={item.score} />
                      ) : null)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {item.industry && (
                      <span className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                        {item.industry}
                      </span>
                    )}
                    {item.links.map((l, i) => (
                      <a
                        key={i}
                        href={l}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground hover:bg-primary hover:text-primary-foreground"
                      >
                        <PlatformIcon platform={detectPlatform(l)} className="size-3" />
                        {detectPlatform(l)}
                      </a>
                    ))}
                  </div>
                </div>
                <SocialEmbed url={url} />
                <div className="space-y-2 px-1 pb-2">
                  <h3 className="font-display text-base font-semibold leading-snug text-foreground">
                    {item.nome_trend ? decodeHtmlEntities(item.nome_trend) : "—"}
                  </h3>
                  {item.descrizione && <p className="text-xs text-muted-foreground line-clamp-3">{decodeHtmlEntities(item.descrizione)}</p>}
                  {item.applicazione && (
                    <p className="text-xs text-foreground/80">
                      <span className="text-muted-foreground">Applicazione:</span> {item.applicazione}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  if (options.length === 0) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
    >
      <option value="">{label}: tutti</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
