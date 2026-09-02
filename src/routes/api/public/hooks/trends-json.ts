import { createFileRoute } from "@tanstack/react-router";
import { decodeBase64Utf8 } from "@/lib/base64";

const GITHUB_REPO = "teomotta88-cloud/nostromo-trendzn";
const TRENDS_PATH = "src/data/trends.json";

// Il repo è privato: raw.githubusercontent.com non serve mai il contenuto di
// un repo privato a richieste non autenticate (torna 404 anche con l'URL
// corretto). Questo endpoint fa da proxy server-side usando GITHUB_TOKEN (già
// configurato per gli altri hook) e legge trends.json via GitHub Contents
// API, che invece funziona anche su repo privati. Tutte le pagine che prima
// facevano fetch diretto a raw.githubusercontent.com devono chiamare questo
// endpoint invece.
export const Route = createFileRoute("/api/public/hooks/trends-json")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const token = process.env.GITHUB_TOKEN;
          if (!token) {
            return Response.json({ error: "GITHUB_TOKEN non configurato" }, { status: 500 });
          }

          const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${TRENDS_PATH}`, {
            headers: {
              Authorization: `token ${token}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "nostromo-trendzn-bot",
            },
          });

          if (!res.ok) {
            const text = await res.text();
            return Response.json(
              { error: `github_read_failed_${res.status}: ${text.slice(0, 200)}` },
              { status: 502 },
            );
          }

          const file = await res.json();
          const trends = JSON.parse(decodeBase64Utf8(file.content.replace(/\n/g, "")));

          return Response.json(trends, {
            headers: { "Cache-Control": "public, max-age=60" },
          });
        } catch (err) {
          return Response.json({ error: String(err).slice(0, 200) }, { status: 500 });
        }
      },
    },
  },
});
