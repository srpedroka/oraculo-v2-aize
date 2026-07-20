export function replayedSessionConfirmation(session: any, document: any) {
  if (!document) return null;
  return {
    session,
    reply: `Esta proposta já foi gravada. Documento disponível: ${document.title} (v${document.version}).`,
    document,
    replayed: true as const,
  };
}
