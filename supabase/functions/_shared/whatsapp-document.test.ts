import { afterEach, describe, expect, it, vi } from "vitest";
import { sendWhatsAppDocument } from "./whatsapp.ts";
import { inferWhatsAppDocumentType } from "./whatsapp-document-routing.ts";

afterEach(() => vi.unstubAllGlobals());

describe("envio de documento no WhatsApp", () => {
  it("recupera o documento da revisão semestral sem confundir com fechamento mensal", () => {
    expect(inferWhatsAppDocumentType("Me manda o documento da revisão semestral do plano estratégico anual"))
      .toBe("strategic_review");
  });

  it("preserva o tipo da sessão ao pedir novamente o arquivo da revisão", () => {
    expect(inferWhatsAppDocumentType("Gere novamente o arquivo completo da revisão")).toBeNull();
    expect(inferWhatsAppDocumentType("O PDF da revisão veio em branco, reenvie por favor")).toBeNull();
    expect(inferWhatsAppDocumentType("Me mande o fechamento mensal de junho")).toBe("month_close");
  });

  it("usa o endpoint de mídia do Evo Go com PDF em base64", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "media-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendWhatsAppDocument(
      { instance_url: "https://evo.example", instance_name: "oraculo" },
      { api_key: "secret" },
      "+5546999999999",
      {
        bytes: new Uint8Array([37, 80, 68, 70]),
        mimeType: "application/pdf",
        fileName: "plano-comercial-t3-2026.pdf",
        caption: "Plano Comercial",
      },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://evo.example/send/media");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      number: "5546999999999",
      type: "document",
      mimetype: "application/pdf",
      filename: "plano-comercial-t3-2026.pdf",
      caption: "Plano Comercial",
    });
    expect(body.url).toBe("JVBERg==");
    expect(String(init.body)).not.toContain("secret");
  });
});
