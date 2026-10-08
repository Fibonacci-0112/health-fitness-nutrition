/**
 * usda-search request handling, with its I/O injected so it can be unit-tested.
 *
 * POST { action: "search", query: string, page?: number }
 *   -> { items: SearchItem[], totalHits, page, totalPages }   (nothing is stored)
 * POST { action: "import", fdcId: number }
 *   -> { foodId }  (fetches the food, normalizes it, and stores it once in the
 *                   shared catalog via the service role)
 *
 * Callers must be signed in. The USDA API key never leaves the server.
 */
import { normalizeDetail, normalizeSearch, type CatalogFood, type CatalogServing } from "../_shared/usda.ts";

export interface Deps {
  /** GET an FDC API path (e.g. "/foods/search") with query params; the key is added by the caller's implementation. */
  fdcGet(path: string, params: Record<string, string>): Promise<{ status: number; body: unknown }>;
  /** Resolve the signed-in user from the request, or null. */
  getUserId(req: Request): Promise<string | null>;
  /** Store a normalized catalog food (idempotent) and return its id. */
  importFood(food: CatalogFood, servings: CatalogServing[]): Promise<string>;
}

export const DATA_TYPES = "Foundation,SR Legacy,Branded";
const PAGE_SIZE = 25;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function upstreamError(status: number): Response {
  if (status === 429) return json(429, { error: "The USDA food database is busy. Try again in a few minutes." });
  if (status === 404) return json(404, { error: "That food is no longer in the USDA database." });
  return json(502, { error: "The USDA food database didn't respond. Try again." });
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json(405, { error: "Use POST." });

    const userId = await deps.getUserId(req);
    if (!userId) return json(401, { error: "Sign in to search foods." });

    let input: Record<string, unknown>;
    try {
      input = (await req.json()) as Record<string, unknown>;
    } catch {
      return json(400, { error: "Invalid JSON body." });
    }

    try {
      if (input.action === "search") {
        const query = typeof input.query === "string" ? input.query.trim() : "";
        if (query.length < 2 || query.length > 100) return json(400, { error: "Search for 2 to 100 characters." });
        const page = Number.isInteger(input.page) ? (input.page as number) : 1;
        if (page < 1 || page > 20) return json(400, { error: "Page must be between 1 and 20." });

        const res = await deps.fdcGet("/foods/search", {
          query,
          dataType: DATA_TYPES,
          pageSize: String(PAGE_SIZE),
          pageNumber: String(page),
        });
        if (res.status !== 200) return upstreamError(res.status);
        const body = res.body as { totalHits?: number; totalPages?: number };
        return json(200, {
          items: normalizeSearch(res.body),
          totalHits: body.totalHits ?? 0,
          page,
          totalPages: body.totalPages ?? 1,
        });
      }

      if (input.action === "import") {
        const fdcId = input.fdcId;
        if (!Number.isInteger(fdcId) || (fdcId as number) <= 0) return json(400, { error: "Invalid fdcId." });
        const res = await deps.fdcGet(`/food/${fdcId}`, {});
        if (res.status !== 200) return upstreamError(res.status);
        const normalized = normalizeDetail(res.body);
        if (!normalized) return json(502, { error: "The USDA response couldn't be read." });
        const foodId = await deps.importFood(normalized.food, normalized.servings);
        return json(200, { foodId });
      }

      return json(400, { error: 'Unknown action. Use "search" or "import".' });
    } catch (e) {
      console.error("usda-search failed", e);
      return json(500, { error: "Something went wrong. Try again." });
    }
  };
}
