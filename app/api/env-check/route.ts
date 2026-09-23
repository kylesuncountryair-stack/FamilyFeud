import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EXPECTED = [
  "ADMIN_KEY",
  "SHEETS_WEBHOOK_URL",
  "SHEETS_WEBHOOK_SECRET",
  "ANTHROPIC_API_KEY",
  "GAME_TIMEZONE",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];

/**
 * Shows which settings this deployment can see. Never shows values, only
 * whether each is present, plus near-miss names (typos, stray spaces).
 * Open /api/env-check in a browser.
 */
export async function GET() {
  const names = Object.keys(process.env);
  const squash = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");

  const settings = Object.fromEntries(
    EXPECTED.map((name) => {
      const v = process.env[name];
      return [name, v === undefined ? "MISSING" : v.trim() === "" ? "SET BUT EMPTY" : "ok"];
    })
  );

  const nearMisses = names
    .filter((n) => !EXPECTED.includes(n))
    .filter((n) => EXPECTED.some((e) => squash(n) === squash(e) || /ADMIN|SHEET|WEBHOOK/i.test(n)))
    .map((n) => JSON.stringify(n)); // quotes make stray spaces visible

  return NextResponse.json({
    deployment: {
      environment: process.env.VERCEL_ENV ?? "not on Vercel",
      url: process.env.VERCEL_URL ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    },
    settings,
    similarNamesFound: nearMisses,
  });
}
