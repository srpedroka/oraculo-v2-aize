import { describe, expect, it } from "vitest";
import { normalizeTotpCode, totpQrDataUrl } from "./mfa";

describe("MFA helpers", () => {
  it("normaliza o código TOTP para seis dígitos", () => {
    expect(normalizeTotpCode(" 12a 34-567 ")).toBe("123456");
  });

  it("encapsula o SVG secreto em data URL sem deixar markup cru", () => {
    const result = totpQrDataUrl('<svg><text x="1">A&B</text></svg>');
    expect(result).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(result).not.toContain("<svg>");
    expect(decodeURIComponent(result.split(",")[1])).toContain("A&B");
  });

  it("não codifica novamente a data URL devolvida pelo Supabase", () => {
    const input = "data:image/svg+xml;utf-8,%3Csvg%3E%3C%2Fsvg%3E";
    expect(totpQrDataUrl(input)).toBe(input);
  });
});
