import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/SessionProvider";
import type { TablesInsert } from "../lib/database.types";
import type { FoodPayload, FoodWithServings, PriceRow } from "../lib/foods";
import { supabase } from "../lib/supabase";

// foods <-> food_servings has two relationships (servings.food_id and foods.basis_serving_id),
// so embeds must name the one they mean.
const FOOD_WITH_SERVINGS = "*, food_servings!food_servings_food_id_fkey(*)";

export const foodKeys = {
  all: ["foods"] as const,
  mine: ["foods", "mine"] as const,
  one: (id: string) => ["foods", "one", id] as const,
  prices: (id: string) => ["foods", "prices", id] as const,
};

export function useMyFoods() {
  const { session } = useSession();
  return useQuery({
    queryKey: foodKeys.mine,
    queryFn: async (): Promise<FoodWithServings[]> => {
      const { data, error } = await supabase
        .from("foods")
        .select(FOOD_WITH_SERVINGS)
        .eq("owner_id", session!.user.id)
        .order("name");
      if (error) throw error;
      return data as unknown as FoodWithServings[];
    },
  });
}

export function useFood(id: string | undefined) {
  return useQuery({
    queryKey: foodKeys.one(id ?? ""),
    enabled: !!id,
    queryFn: async (): Promise<FoodWithServings | null> => {
      const { data, error } = await supabase.from("foods").select(FOOD_WITH_SERVINGS).eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as unknown as FoodWithServings | null;
    },
  });
}

export function useSaveFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: FoodPayload): Promise<string> => {
      const { data, error } = await supabase.rpc("save_custom_food", {
        p_food: payload.food,
        p_servings: payload.servings,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: foodKeys.all }),
  });
}

export function useDeleteFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("foods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: foodKeys.all }),
  });
}

export function useFoodPrices(foodId: string | undefined) {
  return useQuery({
    queryKey: foodKeys.prices(foodId ?? ""),
    enabled: !!foodId,
    queryFn: async (): Promise<PriceRow[]> => {
      const { data, error } = await supabase
        .from("food_prices")
        .select("*")
        .eq("food_id", foodId!)
        .order("effective_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAddPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<"food_prices">, "user_id" | "id" | "created_at">) => {
      const { data, error } = await supabase.from("food_prices").insert(input).select("*").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => qc.invalidateQueries({ queryKey: foodKeys.prices(row.food_id) }),
  });
}

export function useDeletePrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (price: PriceRow) => {
      const { error } = await supabase.from("food_prices").delete().eq("id", price.id);
      if (error) throw error;
      return price;
    },
    onSuccess: (price) => qc.invalidateQueries({ queryKey: foodKeys.prices(price.food_id) }),
  });
}
