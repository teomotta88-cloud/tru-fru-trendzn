import { createFileRoute } from "@tanstack/react-router";
import trendsData from "@/data/trends.json";

export const Route = createFileRoute("/api/public/hooks/trends-json")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return Response.json(trendsData, {
            headers: { "Cache-Control": "public, max-age=60" },
          });
        } catch (err) {
          return Response.json({ error: String(err).slice(0, 200) }, { status: 500 });
        }
      },
    },
  },
});
