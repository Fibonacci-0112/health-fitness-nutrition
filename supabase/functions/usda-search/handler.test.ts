import { describe, expect, it, vi } from "vitest";
import detail from "../_shared/fixtures/detail-sr-legacy.json";
import search from "../_shared/fixtures/search.json";
import { createHandler, type Deps } from "./handler.ts";

function deps(over: Partial<Deps> = {}): Deps {
  return {
    fdcGet: vi.fn(async (path: string) => ({ status: 200, body: path.startsWith("/foods/search") ? search : detail })),
    getUserId: vi.fn(async () => "user-1"),
    importFood: vi.fn(async () => "food-uuid"),
    ...over,
  };
}

const post = (body: unknown) =>
  new Request("http://localhost/usda-search", { method: "POST", body: JSON.stringify(body), headers: { Authorization: "Bearer t" } });

describe("usda-search handler", () => {
  it("requires a signed-in user", async () => {
    const res = await createHandler(deps({ getUserId: async () => null }))(post({ action: "search", query: "oats" }));
    expect(res.status).toBe(401);
  });

  it("answers CORS preflight", async () => {
    const res = await createHandler(deps())(new Request("http://localhost/usda-search", { method: "OPTIONS" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("searches with the data types and page size, and stores nothing", async () => {
    const d = deps();
    const res = await createHandler(d)(post({ action: "search", query: "  oats ", page: 2 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(5);
    expect(body.page).toBe(2);
    expect(d.fdcGet).toHaveBeenCalledWith("/foods/search", {
      query: "oats", dataType: "Foundation,SR Legacy,Branded", pageSize: "25", pageNumber: "2",
    });
    expect(d.importFood).not.toHaveBeenCalled();
  });

  it.each([
    [{ action: "search", query: "a" }],
    [{ action: "search", query: "oats", page: 0 }],
    [{ action: "import", fdcId: -1 }],
    [{ action: "import", fdcId: "123" }],
    [{ action: "delete" }],
  ])("rejects bad input %j", async (body) => {
    const res = await createHandler(deps())(post(body));
    expect(res.status).toBe(400);
  });

  it("imports a normalized food", async () => {
    const d = deps();
    const res = await createHandler(d)(post({ action: "import", fdcId: 172676 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ foodId: "food-uuid" });
    expect(d.fdcGet).toHaveBeenCalledWith("/food/172676", {});
    const [food, servings] = (d.importFood as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(food).toMatchObject({ source: "usda", source_id: "172676", energy_kcal: 236 });
    expect(servings).toHaveLength(2);
  });

  it("maps upstream rate limits and failures", async () => {
    const limited = await createHandler(deps({ fdcGet: async () => ({ status: 429, body: null }) }))(post({ action: "search", query: "oats" }));
    expect(limited.status).toBe(429);
    const down = await createHandler(deps({ fdcGet: async () => ({ status: 503, body: null }) }))(post({ action: "import", fdcId: 1 }));
    expect(down.status).toBe(502);
  });

  it("hides internal errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await createHandler(deps({ importFood: async () => { throw new Error("db password wrong"); } }))(
      post({ action: "import", fdcId: 172676 }),
    );
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("password");
  });
});
