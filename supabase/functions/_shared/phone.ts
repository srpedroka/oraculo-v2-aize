export function normalizePhone(value: unknown) {
  const source = String(value ?? "").trim();
  if (!source || source.includes("@lid")) return null;

  const raw = source.split("@")[0].split(":")[0];
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 ? `+${digits}` : null;
}

export function phoneCandidates(value: unknown) {
  const normalized = normalizePhone(value);
  if (!normalized) return [];

  const candidates = new Set<string>();
  const add = (digits: string) => {
    const clean = digits.replace(/\D/g, "");
    if (clean.length >= 8) candidates.add(`+${clean}`);
  };

  const digits = normalized.replace(/\D/g, "");
  add(digits);
  add(digits.replace(/^0+/, ""));

  const national = digits.startsWith("55") ? digits.slice(2).replace(/^0+/, "") : digits.replace(/^0+/, "");
  if (national.length >= 10 && national.length <= 11) add(`55${national}`);

  if (national.length === 10) add(`55${national.slice(0, 2)}9${national.slice(2)}`);
  if (national.length === 11 && national[2] === "9") add(`55${national.slice(0, 2)}${national.slice(3)}`);

  return [...candidates];
}

export function phonesMayMatch(a: unknown, b: unknown) {
  const aCandidates = new Set(phoneCandidates(a).map((phone) => phone.replace(/\D/g, "")));
  return phoneCandidates(b).some((phone) => aCandidates.has(phone.replace(/\D/g, "")));
}
