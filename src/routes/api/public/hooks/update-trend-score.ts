import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/update-trend-score")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { id?: string; score?: number | null };
          const { id } = body;
          const score = body.score === undefined ? null : body.score;

          if (!id) {
            return Response.json({ ok: false, error: "id mancante" }, { status: 400 });
          }
          if (score !== null && (!Number.isInteger(score) || score < 1 || score > 3)) {
            return Response.json({ ok: false, error: "score deve essere 1, 2, 3 o null" }, { status: 400 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin
            .from("trend_submissions")
            .update({ score })
            .eq("id", id);

          if (error) {
            return Response.json({ ok: false, error: error.message.slice(0, 200) }, { status: 500 });
          }

          return Response.json({ ok: true });
        } catch (err) {
          return Response.json({ ok: false, error: String(err).slice(0, 200) }, { status: 500 });
        }
      },
    },
  },
});
