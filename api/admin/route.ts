import { NextResponse } from "next/server";
import { gameKeys, getToday, rebuildCounts, type Submission } from "@/lib/game";
import { getStore, parseJSON } from "@/lib/store";

export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const key = process.env.ADMIN_KEY?.trim();
  return !!key && req.headers.get("x-admin-key")?.trim() === key;
}

function resolveKeys(url: string) {
  const p = new URL(url).searchParams;
  const today = getToday();
  return gameKeys(p.get("day") ?? today.day, p.get("questionId") ?? today.question.id);
}

/** GET: every group with the raw answers that landed in it. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const keys = resolveKeys(req.url);
  const subs = await getStore().hgetall(keys.subs);
  const groups: Record<string, string[]> = {};
  for (const v of Object.values(subs)) {
    const s = parseJSON<Submission>(v);
    s?.answers.forEach((a) => (groups[a.category] ??= []).push(a.raw));
  }
  return NextResponse.json({ players: Object.keys(subs).length, groups });
}

/** POST { from: "Shirts", to: "Clothes" } — merges one group into another. */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const from = String(body?.from ?? "").trim();
  const to = String(body?.to ?? "").trim();
  if (!from || !to) return NextResponse.json({ error: "Send both 'from' and 'to'." }, { status: 400 });

  const store = getStore();
  const keys = resolveKeys(req.url);

  const subs = await store.hgetall(keys.subs);
  const updatedSubs: Record<string, string> = {};
  let moved = 0;
  for (const [who, v] of Object.entries(subs)) {
    const s = parseJSON<Submission>(v);
    if (!s) continue;
    let changed = false;
    s.answers = s.answers.map((a) => {
      if (a.category !== from) return a;
      changed = true;
      moved++;
      return { ...a, category: to };
    });
    if (changed) updatedSubs[who] = JSON.stringify(s);
  }
  await store.hset(keys.subs, updatedSubs);

  // Point the grouping cache at the new group so future answers follow
  const map = await store.hgetall(keys.map);
  const updatedMap: Record<string, string> = {};
  for (const [norm, g] of Object.entries(map)) if (g === from) updatedMap[norm] = to;
  await store.hset(keys.map, updatedMap);

  await rebuildCounts(store, keys);
  return NextResponse.json({ ok: true, moved });
}
