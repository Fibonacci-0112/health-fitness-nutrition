import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Tables } from "../lib/database.types";
import { supabase } from "../lib/supabase";

export type BodyWeight = Tables<"body_weights">;

export const weightKeys = { latest: ["weights", "latest"] as const, all: ["weights"] as const };

export function useLatestWeight() {
  return useQuery({
    queryKey: weightKeys.latest,
    queryFn: async (): Promise<BodyWeight | null> => {
      const { data, error } = await supabase
        .from("body_weights")
        .select("*")
        .order("measured_on", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** One weight per day: saving again on the same date replaces that day's entry. */
export function useSaveWeight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { measuredOn: string; weightKg: number }) => {
      const { data, error } = await supabase
        .from("body_weights")
        .upsert({ measured_on: input.measuredOn, weight_kg: input.weightKg }, { onConflict: "user_id,measured_on" })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: weightKeys.all }),
  });
}
