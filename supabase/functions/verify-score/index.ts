import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WIKI_API = "https://tr.wikipedia.org/w/api.php";
const MAX_BODY_BYTES = 32_768;
const MAX_ROUTE_EDGES = 50;
const SESSION_RATE_LIMIT_MS = 3_000;

type RouteEdge = {
  from: string;
  linkTitle: string;
  to: string;
};

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;

  try {
    const url = new URL(origin);
    if (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      url.protocol === "http:"
    ) {
      return true;
    }
  } catch {
    return false;
  }

  const configured = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return configured.includes(origin);
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}

function jsonResponse(
  origin: string | null,
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin),
  });
}

function cleanText(value: unknown, min: number, max: number): string {
  if (typeof value !== "string") throw new HttpError(422, "INVALID_INPUT");
  const cleaned = value.replace(/\s+/gu, " ").trim();
  if (
    cleaned.length < min ||
    cleaned.length > max ||
    /[\u0000-\u001F\u007F]/u.test(cleaned)
  ) {
    throw new HttpError(422, "INVALID_INPUT");
  }
  return cleaned;
}

function foldTitle(value: string): string {
  return value.replace(/_/gu, " ").replace(/\s+/gu, " ").trim()
    .toLocaleLowerCase("tr-TR");
}

function parseRouteProof(value: unknown): RouteEdge[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ROUTE_EDGES) {
    throw new HttpError(422, "INVALID_ROUTE");
  }

  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new HttpError(422, "INVALID_ROUTE");
    }
    const edge = item as Record<string, unknown>;
    return {
      from: cleanText(edge.from, 1, 255),
      linkTitle: cleanText(edge.linkTitle, 1, 255),
      to: cleanText(edge.to, 1, 255),
    };
  });
}

async function wikiQuery(params: Record<string, string>): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    ...params,
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${WIKI_API}?${query}`, {
      headers: {
        "Api-User-Agent": "VikiRota/1.0 (score verification)",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (response.ok) return await response.json();
    if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      continue;
    }
    throw new HttpError(502, "WIKI_UNAVAILABLE");
  }

  throw new HttpError(502, "WIKI_UNAVAILABLE");
}

async function verifyEdge(edge: RouteEdge): Promise<boolean> {
  const linksResult = await wikiQuery({
    prop: "links",
    titles: edge.from,
    plnamespace: "0",
    pltitles: edge.linkTitle,
    pllimit: "10",
    redirects: "1",
  });
  const linkPages = (linksResult.query as { pages?: Array<{ links?: Array<{ title?: string }> }> })
    ?.pages || [];
  const hasLink = linkPages.some((page) =>
    (page.links || []).some((link) =>
      typeof link.title === "string" &&
      foldTitle(link.title) === foldTitle(edge.linkTitle)
    )
  );
  if (!hasLink) return false;

  const targetResult = await wikiQuery({
    titles: edge.linkTitle,
    redirects: "1",
  });
  const targetPages = (targetResult.query as { pages?: Array<{ title?: string; missing?: boolean }> })
    ?.pages || [];
  const resolvedTarget = targetPages.find((page) => !page.missing)?.title;
  return typeof resolvedTarget === "string" &&
    foldTitle(resolvedTarget) === foldTitle(edge.to);
}

function validateStartPayload(body: Record<string, unknown>) {
  const difficultyId = cleanText(body.difficultyId, 4, 6);
  if (!["easy", "medium", "hard"].includes(difficultyId)) {
    throw new HttpError(422, "INVALID_INPUT");
  }

  let requestedMode = "normal";
  if (body.gameMode === "daily") requestedMode = "daily";
  if (body.gameMode === "weekly") requestedMode = "weekly";

  const dailyKey = requestedMode === "daily"
    ? cleanText(body.dailyKey, 10, 10)
    : null;
  if (dailyKey && !/^\d{4}-\d{2}-\d{2}$/u.test(dailyKey)) {
    throw new HttpError(422, "INVALID_INPUT");
  }

  const weeklyKey = requestedMode === "weekly"
    ? cleanText(body.weeklyKey, 8, 8)
    : null;
  if (weeklyKey && !/^\d{4}-W\d{2}$/u.test(weeklyKey)) {
    throw new HttpError(422, "INVALID_INPUT");
  }

  const startTitle = cleanText(body.startTitle, 2, 255);
  const targetTitle = cleanText(body.targetTitle, 2, 255);
  if (foldTitle(startTitle) === foldTitle(targetTitle)) {
    throw new HttpError(422, "INVALID_INPUT");
  }

  return {
    player_name: cleanText(body.playerName, 2, 24),
    category_id: cleanText(body.categoryId, 2, 32),
    difficulty_id: difficultyId,
    game_mode: requestedMode,
    daily_key: dailyKey,
    weekly_key: weeklyKey,
    start_title: startTitle,
    target_title: targetTitle,
  };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");

  if (!isAllowedOrigin(origin)) {
    return jsonResponse(null, 403, { error: "ORIGIN_NOT_ALLOWED" });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return jsonResponse(origin, 405, { error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const contentLength = Number(request.headers.get("Content-Length") || "0");
    if (contentLength > MAX_BODY_BYTES) throw new HttpError(413, "PAYLOAD_TOO_LARGE");

    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      throw new HttpError(401, "UNAUTHORIZED");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new HttpError(500, "SERVER_NOT_CONFIGURED");
    }

    const token = authorization.slice(7);
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) throw new HttpError(401, "UNAUTHORIZED");

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      throw new HttpError(413, "PAYLOAD_TOO_LARGE");
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new HttpError(400, "INVALID_JSON");
    }

    if (body.action === "start") {
      const payload = validateStartPayload(body);
      const now = new Date();

      await service
        .from("game_sessions")
        .update({ status: "expired" })
        .eq("user_id", userData.user.id)
        .eq("status", "active")
        .lt("expires_at", now.toISOString());

      const { data: latest } = await service
        .from("game_sessions")
        .select("created_at")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (
        latest?.created_at &&
        now.getTime() - Date.parse(latest.created_at) < SESSION_RATE_LIMIT_MS
      ) {
        throw new HttpError(429, "TOO_MANY_REQUESTS");
      }

      const { data: session, error } = await service
        .from("game_sessions")
        .insert({ ...payload, user_id: userData.user.id })
        .select("id, started_at, expires_at")
        .single();
      if (error || !session) throw new HttpError(500, "SESSION_CREATE_FAILED");

      return jsonResponse(origin, 201, {
        sessionId: session.id,
        startedAt: session.started_at,
        expiresAt: session.expires_at,
      });
    }

    if (body.action === "finish") {
      const sessionId = cleanText(body.sessionId, 36, 36);
      const clientRecordId = cleanText(body.clientRecordId, 8, 100);
      const steps = Number(body.steps);
      const routeProof = parseRouteProof(body.routeProof);
      if (!Number.isInteger(steps) || steps < routeProof.length || steps > 1_000) {
        throw new HttpError(422, "INVALID_SCORE");
      }

      const { data: session, error } = await service
        .from("game_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("user_id", userData.user.id)
        .single();
      if (error || !session) throw new HttpError(404, "SESSION_NOT_FOUND");
      if (session.status === "finished" && session.client_record_id === clientRecordId) {
        const { data: existing } = await service
          .from("leaderboard_entries")
          .select("id, time_ms, steps")
          .eq("user_id", userData.user.id)
          .eq("client_record_id", clientRecordId)
          .single();
        return jsonResponse(origin, 200, {
          verified: true,
          entryId: existing?.id,
          timeMs: existing?.time_ms,
          steps: existing?.steps,
        });
      }
      if (session.status !== "active" || Date.parse(session.expires_at) <= Date.now()) {
        throw new HttpError(409, "SESSION_NOT_ACTIVE");
      }

      let expectedFrom = session.start_title as string;
      for (const edge of routeProof) {
        if (foldTitle(edge.from) !== foldTitle(expectedFrom)) {
          throw new HttpError(422, "INVALID_ROUTE");
        }
        if (!(await verifyEdge(edge))) {
          await service.from("game_sessions")
            .update({ status: "rejected", finished_at: new Date().toISOString() })
            .eq("id", sessionId)
            .eq("status", "active");
          throw new HttpError(422, "INVALID_ROUTE");
        }
        expectedFrom = edge.to;
      }
      if (foldTitle(expectedFrom) !== foldTitle(session.target_title)) {
        throw new HttpError(422, "INVALID_ROUTE");
      }

      const serverElapsedMs = Date.now() - Date.parse(session.started_at);
      if (serverElapsedMs < 500 || serverElapsedMs > 86_400_000) {
        throw new HttpError(422, "INVALID_SCORE");
      }

      const routeHistory = [session.start_title, ...routeProof.map((edge) => edge.to)];
      const { data: entryId, error: finalizeError } = await service.rpc(
        "finalize_verified_score",
        {
          p_session_id: sessionId,
          p_user_id: userData.user.id,
          p_client_record_id: clientRecordId,
          p_route_history: routeHistory,
          p_steps: steps,
          p_time_ms: Math.round(serverElapsedMs),
        },
      );
      if (finalizeError) throw new HttpError(409, "SCORE_FINALIZE_FAILED");

      return jsonResponse(origin, 200, {
        verified: true,
        entryId,
        timeMs: Math.round(serverElapsedMs),
        steps,
      });
    }

    throw new HttpError(422, "INVALID_ACTION");
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(origin, error.status, { error: error.code });
    }
    console.error("verify-score unexpected error", error);
    return jsonResponse(origin, 500, { error: "INTERNAL_ERROR" });
  }
});
