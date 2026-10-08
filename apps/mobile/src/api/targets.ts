import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Tables, TablesInsert } from "../lib/database.types";
import { supabase } from "../lib/supabase";

export type Target = Tables<"targets">;

export const targetKeys = { all: ["targets"] as const, on: (date: string) => ["targets", date] as const };

/** The target in effect on `date`: the latest one with effective_from on or before it. */
export function useTargetOn(date: string) {
  return useQuery({
    queryKey: targetKeys.on(date),
    queryFn: async (): Promise<Target | null> => {
      const { data, error } = await supabase
        .from("targets")
        .select("*")
        .lte("effective_from", date)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** One target per effective date: saving again on the same date replaces it. */
export function useSaveTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<"targets">, "user_id" | "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("targets")
        .upsert(input, { onConflict: "user_id,effective_from" })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: targetKeys.all }),
  });
}
