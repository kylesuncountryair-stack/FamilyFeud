import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { findPlayers, removePlayer, unblock } from "@/lib/players";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Remove a player (e.g. a testing account) from every board and the leaderboard.
 *   Find the exact email:  /api/admin/remove-player?key=ADMIN_KEY&find=test
 *   Preview:               /api/admin/remove-player?key=ADMIN_KEY&email=someone@suncountry.com
 *   Remove + block:        ...&apply=1
 *   Undo the block:        ...&email=someone@suncountry.com&unblock=1
 */
export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, problem: "Wrong or missing ?key=" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const store = getStore();
  const email = (p.get("email") ?? "").trim();

  if (!email) {
    const find = p.get("find") ?? "";
    return NextResponse.json({
      ok: true,
      hint: "Copy the exact email, then open this link again with &email=THAT_EMAIL (preview), then add &apply=1.",
      players: await findPlayers(store, find),
    });
  }
  if (p.get("unblock") === "1") {
    await unblock(store, email);
    return NextResponse.json({ ok: true, message: `${email} can play again. (Their removed answers are not restored.)` });
  }

  const apply = p.get("apply") === "1";
  const r = await removePlayer(store, email, apply);
  if (!r.daysRemoved.length && !apply) {
    return NextResponse.json(
      { ok: false, problem: `No answers found for ${r.email}. Use &find=part-of-the-name to look up the exact email.` },
      { status: 404 }
    );
  }
  return NextResponse.json({
    ok: true,
    mode: apply
      ? `REMOVED: ${r.leaderboardName} is off every board and the leaderboard, and can't play again.`
      : "PREVIEW ONLY: nothing was changed. Add &apply=1 to the link to remove this player.",
    ...r,
  });
}
