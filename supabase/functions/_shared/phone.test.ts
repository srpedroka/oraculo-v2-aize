import { describe, expect, it } from "vitest";
import { normalizePhone, phoneCandidates, phonesMayMatch } from "./phone.ts";

describe("normalização de telefone do WhatsApp", () => {
  it("normaliza JID e ignora identificador LID", () => {
    expect(normalizePhone("5546999751340@s.whatsapp.net")).toBe("+5546999751340");
    expect(normalizePhone("5546999751340:12@s.whatsapp.net")).toBe("+5546999751340");
    expect(normalizePhone("123@lid")).toBeNull();
    expect(normalizePhone("curto")).toBeNull();
  });

  it("considera celular brasileiro com e sem o nono dígito", () => {
    expect(phoneCandidates("+5546999751340")).toContain("+554699751340");
    expect(phoneCandidates("+554699751340")).toContain("+5546999751340");
    expect(phonesMayMatch("+5546999751340", "554699751340@s.whatsapp.net")).toBe(true);
  });

  it("não aproxima números diferentes nem valores inválidos", () => {
    expect(phonesMayMatch("+5546999751340", "+5546991112222")).toBe(false);
    expect(phonesMayMatch(null, "+5546999751340")).toBe(false);
  });
});
