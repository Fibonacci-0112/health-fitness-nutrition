import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LogInsert, LogRow } from "../lib/diary";
import { supabase } from "../lib/supabase";

export const diaryKeys = { all: ["diary"] as const, day: (date: string) => ["diary", date] as const };

/** The user's food log entries for one calendar date, in the order they were logged. */
export function useDiaryDay(date: string) {
  return useQuery({
    queryKey: diaryKeys.day(date),
    queryFn: async (): Promise<LogRow[]> => {
      const { data, error } = await supabase
        .from("food_logs")
        .select("*")
        .eq("log_date", date)
        .order("created_at")
        .order("id");
      if (error) throw error;
      return data;
    },
  });
}

/** Save a snapshot entry. Upsert on the client-generated id, so a retry never duplicates it. */
export function useLogFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: LogInsert): Promise<LogRow> => {
      const { data, error } = await supabase.from("food_logs").upsert(row, { onConflict: "id" }).select("*").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => qc.invalidateQueries({ queryKey: diaryKeys.day(row.log_date) }),
  });
}

export function useDeleteLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: LogRow) => {
      const { error } = await supabase.from("food_logs").delete().eq("id", row.id);
      if (error) throw error;
      return row;
    },
    onSuccess: (row) => qc.invalidateQueries({ queryKey: diaryKeys.day(row.log_date) }),
  });
}
