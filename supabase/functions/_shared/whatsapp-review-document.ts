import { formatUntrustedDocument } from "./untrusted-content.ts";
import { whatsappFileExtension } from "./whatsapp-text.ts";

export function strategicReviewDocumentHandoff(params: {
  sessionId: string;
  fileName: string;
  extractedText: string;
}) {
  const format = whatsappFileExtension(params.fileName).replace(/^\./, "").slice(0, 8);
  return {
    userText: `[Arquivo extraído para a revisão estratégica${format ? `, formato ${format}` : ""}. Conteúdo e nome do arquivo omitidos do histórico.]`,
    answer: "Consegui extrair o texto do arquivo e vou usá-lo agora na revisão do semestre.",
    skipHistory: false,
    resumeSessionId: params.sessionId,
    transientContext: formatUntrustedDocument({
      fileName: params.fileName,
      content: params.extractedText,
      maxChars: 60_000,
    }),
  };
}
