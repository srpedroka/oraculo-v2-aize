import tailwindConfig from "../../tailwind.config";
import { describe, expect, it } from "vitest";

const extend = tailwindConfig.theme.extend;

describe("tokens do Design System", () => {
  it("mantem raios de superficies em no maximo 8px", () => {
    expect(extend.borderRadius).toMatchObject({
      small: "4px",
      control: "6px",
      card: "8px",
      overlay: "8px",
    });
  });

  it("reserva sombra para elevacao real", () => {
    expect(extend.boxShadow).toMatchObject({
      card: "none",
      raised: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)",
      overlay: "0 16px 40px rgba(0,0,0,0.14)",
    });
  });

  it("expoe cores semanticas e motion sutil", () => {
    expect(extend.colors).toMatchObject({
      "border-control": "var(--border-control)",
      "text-disabled": "var(--text-disabled)",
      "status-neutral": "var(--status-neutral)",
      "status-info": "var(--status-info)",
    });
    expect(extend.transitionDuration).toMatchObject({ fast: "120ms", DEFAULT: "180ms", panel: "220ms" });
    expect(extend.keyframes["page-in"].from.transform).toBe("translateY(2px)");
  });
});
