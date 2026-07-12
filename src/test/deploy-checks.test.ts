import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  functionConfigIssues,
  functionDeploymentIssues,
  migrationDrift,
  parseFunctionJwtConfig,
  verifyJwtIssues,
} from "../../scripts/deploy-checks";

const localFunctions = readdirSync("supabase/functions", { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_") && existsSync(join("supabase/functions", entry.name, "index.ts")))
  .map((entry) => entry.name)
  .sort();
const functionConfig = readFileSync("supabase/config.toml", "utf8");

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

  it("declara todas as funções locais no config.toml com a política correta", () => {
    expect(functionConfigIssues(localFunctions, functionConfig)).toEqual([]);
    expect(Object.keys(parseFunctionJwtConfig(functionConfig)).sort()).toEqual(localFunctions);
  });

  it("DETECTA função ausente, extra ou com política declarativa errada", () => {
    const source = [
      "[functions.oracle-chat]",
      "verify_jwt = false",
      "[functions.funcao-extra]",
      "verify_jwt = true",
    ].join("\n");
    const issues = functionConfigIssues(["oracle-chat", "invite-member"], source);
    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining("oracle-chat"),
      expect.stringContaining("invite-member"),
      expect.stringContaining("funcao-extra"),
    ]));
  });

  it("DETECTA divergência entre funções locais e publicadas", () => {
    const issues = functionDeploymentIssues(
      ["oracle-chat", "invite-member"],
      [
        { slug: "oracle-chat", verify_jwt: true },
        { slug: "funcao-antiga", verify_jwt: true },
      ],
    );
    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining("invite-member"),
      expect.stringContaining("funcao-antiga"),
    ]));
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
