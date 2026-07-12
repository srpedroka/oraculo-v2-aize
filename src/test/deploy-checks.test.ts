import { describe, it, expect } from "vitest";
import { verifyJwtIssues, migrationDrift } from "../../scripts/deploy-checks";

describe("verificador de verify_jwt", () => {
  it("aprova uma configuração correta", () => {
    expect(
      verifyJwtIssues([
        { slug: "oracle-chat", verify_jwt: true },
        { slug: "company-research", verify_jwt: true },
        { slug: "whatsapp-webhook", verify_jwt: false },
        { slug: "deadline-nudges", verify_jwt: false },
      ]),
    ).toEqual([]);
  });

  it("DETECTA uma função autenticada publicada sem JWT", () => {
    const issues = verifyJwtIssues([{ slug: "company-research", verify_jwt: false }]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("company-research");
  });

  it("DETECTA um webhook exigindo JWT por engano", () => {
    const issues = verifyJwtIssues([{ slug: "whatsapp-webhook", verify_jwt: true }]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("whatsapp-webhook");
  });
});

describe("drift de migrations", () => {
  it("aponta migration local ainda não aplicada no remoto", () => {
    const drift = migrationDrift(["001", "002", "003"], ["001", "002"]);
    expect(drift.pendentes).toEqual(["003"]);
    expect(drift.soNoRemoto).toEqual([]);
  });
  it("aponta migration remota que sumiu do repositório", () => {
    const drift = migrationDrift(["001"], ["001", "999"]);
    expect(drift.soNoRemoto).toEqual(["999"]);
  });
});
