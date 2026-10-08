import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { foodKeys } from "./foods";

/** One USDA search hit (nutrients per 100 g or 100 ml; null = not reported). */
export interface UsdaSearchItem {
  fdcId: number;
  name: string;
  brand: string | null;
  dataType: string;
  nutrient_basis: "per_100g" | "per_100ml";
  serving: string | null;
  energy_kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

interface SearchResponse {
  items: UsdaSearchItem[];
  totalHits: number;
  page: number;
  totalPages: number;
}

/** Turn an Edge Function error into the message the function returned, if any. */
async function functionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === "string") return new Error(body.error);
    } catch {
      // fall through
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

export function useUsdaSearch(query: string, page = 1) {
  const q = query.trim();
  return useQuery({
    queryKey: ["usda", "search", q.toLowerCase(), page],
    enabled: q.length >= 2,
    staleTime: 10 * 60 * 1000,
    // Search results are transient; don't persist them in the offline cache.
    meta: { persist: false },
    queryFn: async (): Promise<SearchResponse> => {
      const { data, error } = await supabase.functions.invoke<SearchResponse>("usda-search", {
        body: { action: "search", query: q, page },
      });
      if (error) throw await functionError(error);
      return data!;
    },
  });
}

/** Store the USDA food in the shared catalog (once) and return its food id. */
export function useImportUsdaFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fdcId: number): Promise<string> => {
      const { data, error } = await supabase.functions.invoke<{ foodId: string }>("usda-search", {
        body: { action: "import", fdcId },
      });
      if (error) throw await functionError(error);
      return data!.foodId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: foodKeys.all }),
  });
}
