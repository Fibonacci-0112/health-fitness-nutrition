import type { ActivityLevel, BiologicalSex } from "@hfn/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/SessionProvider";
import type { Tables, TablesUpdate } from "../lib/database.types";
import { supabase } from "../lib/supabase";

export type Profile = Tables<"profiles">;

export const profileKeys = { me: ["profile"] as const };

export function useProfile() {
  const { session } = useSession();
  const userId = session?.user.id;
  return useQuery({
    queryKey: profileKeys.me,
    enabled: !!userId,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId!).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateProfile() {
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: TablesUpdate<"profiles">) => {
      const { data, error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("user_id", session!.user.id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => qc.setQueryData(profileKeys.me, data),
  });
}

/** Fields the target estimate needs; onboarding is complete once all are set. */
export function isProfileComplete(p: Profile | undefined): boolean {
  return !!p && p.sex != null && p.birth_date != null && p.height_cm != null && p.activity_level != null;
}

export function targetProfile(p: Profile) {
  return {
    sex: p.sex as BiologicalSex | null,
    birthDate: p.birth_date,
    heightCm: p.height_cm,
    activity: p.activity_level as ActivityLevel | null,
    calorieFloorKcal: p.calorie_floor_kcal,
  };
}
