import { createFileRoute } from "@tanstack/react-router";

type ScrapedProfile = {
  avatarUrl: string | null;
  displayName: string | null;
  bio: string | null;
  followersCount: string | null;
  followingCount: string | null;
  postsCount: string | null;
};

function extractHandle(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/instagram\.com$/i.test(u.hostname.replace(/^www\./, ""))) return null;
    const handle = u.pathname.replace(/^\/+|\/+$/g, "").split("/")[0];
    return handle || null;
  } catch {
    return null;
  }
}

function matchMeta(html: string, property: string): string | null {
  const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, "i");
  const m = html.match(re);
  return m ? m[1] : null;
}

// Instagram non espone un'API pubblica senza login: leggiamo i meta tag Open
// Graph (stabili, presenti su ogni pagina profilo pubblica) per avatar, nome
// e conteggi. La bio reale non è nei meta OG (sono un template fisso "N
// Followers, M Following, K Posts..."): proviamo un'estrazione best-effort
// dal JSON incorporato nella pagina, che Instagram può rimuovere in
// qualsiasi momento senza preavviso — se manca, semplicemente non l'abbiamo.
async function scrapeInstagramProfile(url: string): Promise<ScrapedProfile | null> {
  const handle = extractHandle(url);
  if (!handle) return null;

  let html: string;
  try {
    const res = await fetch(`https://www.instagram.com/${handle}/`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  const avatarUrl = matchMeta(html, "og:image");
  const title = matchMeta(html, "og:title");
  const description = matchMeta(html, "og:description");

  let displayName: string | null = null;
  if (title) {
    const m = title.match(/^(.*?)\s*\(@[^)]+\)/);
    displayName = (m ? m[1] : title).trim() || null;
  }

  let followersCount: string | null = null;
  let followingCount: string | null = null;
  let postsCount: string | null = null;
  if (description) {
    const m = description.match(
      /^([\d.,]+\s*[KMB]?)\s+Followers,\s*([\d.,]+\s*[KMB]?)\s+Following,\s*([\d.,]+\s*[KMB]?)\s+Posts/i,
    );
    if (m) {
      followersCount = m[1].trim();
      followingCount = m[2].trim();
      postsCount = m[3].trim();
    }
  }

  let bio: string | null = null;
  const bioMatch = html.match(/"biography":"((?:[^"\\]|\\.)*)"/);
  if (bioMatch) {
    try {
      bio = JSON.parse(`"${bioMatch[1]}"`) || null;
    } catch {
      bio = null;
    }
  }

  if (!avatarUrl && !displayName && !followersCount) return null;

  return { avatarUrl, displayName, bio, followersCount, followingCount, postsCount };
}

export const Route = createFileRoute("/api/public/hooks/scrape-instagram-profile")({
  server: {
    handlers: {
      // Scraping one-shot: chiamato una sola volta da addClientChannel() subito
      // dopo la creazione di un canale cliente Instagram, non su uno schedule.
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { channelId?: string; url?: string };
          const channelId = body.channelId?.trim();
          const url = body.url?.trim();

          if (!channelId || !url) {
            return Response.json(
              { ok: false, error: "channelId e url sono obbligatori" },
              { status: 400 },
            );
          }

          const scraped = await scrapeInstagramProfile(url);
          if (!scraped) {
            return Response.json({ ok: true, scraped: false });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as any;
          const { data, error } = await db
            .from("editorial_client_channels")
            .update({
              avatar_url: scraped.avatarUrl,
              display_name: scraped.displayName,
              bio: scraped.bio,
              followers_count: scraped.followersCount,
              following_count: scraped.followingCount,
              posts_count: scraped.postsCount,
              scraped_at: new Date().toISOString(),
            })
            .eq("id", channelId)
            .select("*")
            .single();

          if (error) {
            return Response.json({ ok: false, error: error.message.slice(0, 200) }, { status: 500 });
          }

          return Response.json({ ok: true, scraped: true, channel: data });
        } catch (err) {
          return Response.json({ ok: false, error: String(err).slice(0, 200) }, { status: 500 });
        }
      },
    },
  },
});
