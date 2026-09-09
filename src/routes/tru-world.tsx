import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { trendAttuali } from "@/lib/trends";
import type { TrendItem } from "@/lib/trends";
import { TrendGrid } from "@/components/TrendGrid";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/tru-world")({
  head: () => ({
    meta: [{ title: "TRÜ WORLD — Trü Frü" }],
  }),
  component: Page,
});

type DbRow = {
  id: string;
  url: string;
  title: string | null;
  category: string | null;
  industry: string | null;
  tags: string[] | null;
  score: number | null;
  created_at: string | null;
  raw_email: string | null;
};

function rowToTrendItem(row: DbRow): TrendItem {
  return {
    category: row.category ?? "Trend to Adapt",
    links: [row.url],
    descrizione: null,
    nome_trend: row.title ?? null,
    industry: row.industry ?? null,
    applicazione: null,
    canali: null,
    score: row.score ?? null,
    createdAt: row.created_at ?? null,
    rawEmail: row.raw_email ?? null,
    tags: row.tags ?? null,
  };
}

function Page() {
  const [dbRows, setDbRows] = useState<DbRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(() => {
    supabase
      .from("trend_submissions")
      .select("id, url, title, category, industry, tags, score, created_at, raw_email")
      .eq("section", "trend-attuali")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setDbRows(data as DbRow[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleDelete = useCallback((url: string) => {
    setDbRows((prev) => prev.filter((r) => r.url !== url));
  }, []);

  const handleScoreChange = useCallback((url: string, score: number | null) => {
    setDbRows((prev) => prev.map((r) => (r.url === url ? { ...r, score } : r)));
  }, []);

  const dbIds: Record<string, string> = Object.fromEntries(dbRows.map((r) => [r.url, r.id]));
  const allItems: TrendItem[] = [...dbRows.map(rowToTrendItem), ...trendAttuali];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">TRÜ WORLD</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Un universo visivo che valorizza l'iconico pack Trü Frü e tutto ciò che rappresenta: qualità premium, ingredienti reali ed esperienza indulgente. Il brand diventa protagonista, simbolo di piacere autentico e distintivo.
        </p>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Caricamento…</div>
      ) : (
        <TrendGrid items={allItems} dbIds={dbIds} onDelete={handleDelete} onScoreChange={handleScoreChange} showScore hideCategoryFilter hideCategory hideScoreFilter />
      )}
    </div>
  );
}
