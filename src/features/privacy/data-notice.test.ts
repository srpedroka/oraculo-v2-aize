import { describe, expect, it } from "vitest";
import {
  DATA_NOTICE_DISMISS_KEY,
  DATA_NOTICE_PROVIDERS,
  DATA_NOTICE_VERSION,
  PROVIDER_LABELS,
} from "./data-notice";

describe("data notice", () => {
  it("mantém uma versão explícita e uma dispensa isolada por empresa e versão", () => {
    expect(DATA_NOTICE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}(?:-r\d+)?$/);
    expect(DATA_NOTICE_DISMISS_KEY("org-a")).toContain(`org-a.${DATA_NOTICE_VERSION}`);
    expect(DATA_NOTICE_DISMISS_KEY("org-a")).not.toBe(DATA_NOTICE_DISMISS_KEY("org-b"));
  });

  it("cobre todos os provedores disponíveis sem expor chaves", () => {
    expect(DATA_NOTICE_PROVIDERS).toEqual(["OpenAI", "Anthropic", "xAI", "Moonshot"]);
    expect(Object.values(PROVIDER_LABELS).sort()).toEqual([...DATA_NOTICE_PROVIDERS].sort());
  });
});
