/** Admin pages accept the key as an x-admin-key header or ?key= (so they work from a browser). */
export function isAdmin(req: Request) {
  const key = process.env.ADMIN_KEY?.trim();
  if (!key) return false;
  const given = req.headers.get("x-admin-key") ?? new URL(req.url).searchParams.get("key") ?? "";
  return given.trim() === key;
}
