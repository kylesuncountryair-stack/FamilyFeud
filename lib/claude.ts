/** Minimal Claude API call. Never throws; returns the text or a readable error. */
export type ClaudeResult = { ok: true; text: string } | { ok: false; error: string };

export async function callClaude(system: string, user: string, maxTokens = 400): Promise<ClaudeResult> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return { ok: false, error: "ANTHROPIC_API_KEY is not set in Vercel, so AI grouping is off." };

  try {
    const res = await fetch(`${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const raw = await res.text();
    if (!res.ok) {
      let message = raw.slice(0, 300);
      try {
        message = JSON.parse(raw)?.error?.message ?? message;
      } catch {}
      const hint =
        res.status === 401
          ? " (The key is wrong or expired.)"
          : /workspace/i.test(message)
            ? " (Use a Workspace-scoped key, not an Organization key.)"
            : res.status === 400 && /credit|billing/i.test(message)
              ? " (The Anthropic account needs credits.)"
              : "";
      console.error("[survey-says] Claude API error", res.status, message);
      return { ok: false, error: `Claude API error ${res.status}: ${message}${hint}` };
    }
    const data = JSON.parse(raw);
    const text: string = (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("")
      .replace(/```json|```/g, "")
      .trim();
    return { ok: true, text };
  } catch (err) {
    const error = `Couldn't reach Claude: ${err instanceof Error ? err.message : String(err)}`;
    console.error("[survey-says]", error);
    return { ok: false, error };
  }
}

/** Pull the first JSON array or object out of a model reply. */
export function extractJSON<T>(text: string, kind: "[" | "{"): T | null {
  const close = kind === "[" ? "]" : "}";
  const start = text.indexOf(kind);
  const end = text.lastIndexOf(close);
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
