// Supabase Edge Function: search USDA FoodData Central and import foods into
// the shared catalog. Secrets: USDA_API_KEY (set with `supabase secrets set`).
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided
// by the platform.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createHandler } from "./handler.ts";

const FDC_BASE = Deno.env.get("USDA_API_BASE") ?? "https://api.nal.usda.gov/fdc/v1";
const apiKey = Deno.env.get("USDA_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

Deno.serve(
  createHandler({
    async fdcGet(path, params) {
      if (!apiKey) throw new Error("USDA_API_KEY is not set");
      const url = new URL(FDC_BASE + path);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      url.searchParams.set("api_key", apiKey);
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const body = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
      return { status: res.status, body };
    },

    async getUserId(req) {
      const auth = req.headers.get("Authorization") ?? "";
      const token = auth.replace(/^Bearer\s+/i, "");
      if (!token) return null;
      const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
      const { data, error } = await client.auth.getUser(token);
      return error ? null : (data.user?.id ?? null);
    },

    async importFood(food, servings) {
      const { data, error } = await admin.rpc("import_catalog_food", { p_food: food, p_servings: servings });
      if (error) throw error;
      return data as string;
    },
  }),
);
