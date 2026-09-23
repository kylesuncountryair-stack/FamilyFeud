/** Agents sign in with their company email: Firstname.Lastname@suncountry.com */
export const EMAIL_DOMAIN = (process.env.NEXT_PUBLIC_EMAIL_DOMAIN || "suncountry.com").toLowerCase();

export function normalizeEmail(input: string) {
  return input.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  const [local, domain, ...rest] = normalizeEmail(email).split("@");
  return !!local && rest.length === 0 && domain === EMAIL_DOMAIN && /^[a-z0-9._%+'-]+$/.test(local);
}

/** "mary-kate.oconnor@suncountry.com" -> "Mary-Kate" */
export function firstNameFromEmail(email: string) {
  const first = normalizeEmail(email).split("@")[0].split(/[._]/)[0] || "Player";
  return first
    .split(/([-'])/)
    .map((part) => (part.length > 1 || /[a-z]/.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join("");
}
