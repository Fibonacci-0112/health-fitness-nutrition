import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Tables } from "../lib/database.types";
import type { LogInsert, LogRow } from "../lib/diary";
import { supabase } from "../lib/supabase";

export const diaryKeys = {
  all: ["diary"] as const,
  day: (date: string) => ["diary", date] as const,
  status: (date: string) => ["diary", date, "status"] as const,
};

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

export type DayStatus = Tables<"diary_days">;

/**
 * Whether the user marked a day's log as complete. Days without a row are
 * "unknown": later features (adaptive targets) must never read them as zero intake.
 */
export function useDayStatus(date: string) {
  return useQuery({
    queryKey: diaryKeys.status(date),
    queryFn: async (): Promise<DayStatus | null> => {
      const { data, error } = await supabase.from("diary_days").select("*").eq("log_date", date).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Mark a day complete, or clear the mark (back to unknown). */
export function useSetDayComplete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ date, complete }: { date: string; complete: boolean }) => {
      const { error } = complete
        ? await supabase.from("diary_days").upsert({ log_date: date, status: "complete" }, { onConflict: "user_id,log_date" })
        : await supabase.from("diary_days").delete().eq("log_date", date);
      if (error) throw error;
      return date;
    },
    onSuccess: (date) => qc.invalidateQueries({ queryKey: diaryKeys.status(date) }),
  });
}
