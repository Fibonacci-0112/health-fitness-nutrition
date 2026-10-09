import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Tables } from "../lib/database.types";
import { supabase } from "../lib/supabase";

export type BodyWeight = Tables<"body_weights">;

export const weightKeys = { all: ["weights"] as const, latest: ["weights", "latest"] as const, list: ["weights", "list"] as const };

/** How many weigh-ins the history shows. */
export const WEIGHT_HISTORY_LIMIT = 90;

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

/** Recent weigh-ins, newest first. */
export function useWeights() {
  return useQuery({
    queryKey: weightKeys.list,
    queryFn: async (): Promise<BodyWeight[]> => {
      const { data, error } = await supabase
        .from("body_weights")
        .select("*")
        .order("measured_on", { ascending: false })
        .limit(WEIGHT_HISTORY_LIMIT);
      if (error) throw error;
      return data;
    },
  });
}

export function useDeleteWeight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("body_weights").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: weightKeys.all }),
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
