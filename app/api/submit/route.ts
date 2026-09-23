import { NextResponse } from "next/server";
import { categorize } from "@/lib/categorize";
import { buildResults, gameKeys, getToday, nameKey, type Submission } from "@/lib/game";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 40) : "";
  const answers: string[] = Array.isArray(body?.answers)
    ? body.answers.map((a: unknown) => (typeof a === "string" ? a.trim().slice(0, 60) : ""))
    : [];

  if (!name) return NextResponse.json({ error: "Enter your name to play." }, { status: 400 });
  if (answers.length !== 3 || answers.some((a) => !a)) {
    return NextResponse.json({ error: "Fill in all three answers." }, { status: 400 });
  }

  const { day, question } = getToday();
  const store = getStore();
  const keys = gameKeys(day, question.id);
  const who = nameKey(name);

  if (await store.hget(keys.subs, who)) {
    return NextResponse.json({ alreadyPlayed: true, ...(await buildResults(store, keys, name)) }, { status: 409 });
  }

  const groups = await categorize(question, answers, store, keys);
  const sub: Submission = {
    name,
    answers: answers.map((raw, i) => ({ raw, category: groups[i] })),
    at: Date.now(),
  };

  // hsetnx guards against double-submits racing each other
  if (!(await store.hsetnx(keys.subs, who, JSON.stringify(sub)))) {
    return NextResponse.json({ alreadyPlayed: true, ...(await buildResults(store, keys, name)) }, { status: 409 });
  }

  // Each player counts once per group, even if two of their answers landed in the same one
  await Promise.all([...new Set(groups)].map((g) => store.hincrby(keys.counts, g, 1)));

  return NextResponse.json(await buildResults(store, keys, name));
}
