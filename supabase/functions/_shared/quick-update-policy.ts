import { normalizeTextForRouting } from "./periods.ts";

const ACKNOWLEDGEMENTS = new Set([
  "ok",
  "okay",
  "sim",
  "certo",
  "recebido",
  "entendido",
  "beleza",
  "blz",
  "perfeito",
  "combinado",
  "confirmado",
  "fechado",
  "valeu",
  "obrigado",
  "obrigada",
  "tudo certo",
  "deu certo",
  "piloto ok",
  "teste ok",
  "teste certo",
  "piloto funcionando",
  "teste funcionando",
]);

const TARGET_STOP_WORDS = new Set([
  "acao",
  "acoes",
  "objetivo",
  "objetivos",
  "plano",
  "planos",
  "mensal",
  "trimestral",
  "estrategico",
  "empresa",
  "area",
  "para",
  "como",
  "com",
  "sem",
  "uma",
  "das",
  "dos",
  "que",
  "por",
  "em",
  "no",
  "na",
  "de",
  "do",
  "da",
  "e",
]);

function normalizedWords(value: string) {
  return normalizeTextForRouting(value)
    .split(/\W+/)
    .filter(Boolean);
}

export function isNonMutatingAcknowledgement(message: string) {
  const normalized = normalizeTextForRouting(message).replace(/[.!?]+$/g, "").trim();
  return ACKNOWLEDGEMENTS.has(normalized);
}

export function hasConcreteQuickUpdateSignal(message: string) {
  const normalized = normalizeTextForRouting(message);
  if (!normalized || isNonMutatingAcknowledgement(message)) return false;

  if (/\b\d{1,3}\s*%/.test(normalized)) return true;
  if (/\b(evidencia|comprovante|comprovacao|prova|registrar|registre|registro|progresso|status)\b/.test(normalized)) return true;
  if (/\b(conclui|concluimos|concluido|finalizei|finalizamos|finalizado|terminei|terminamos|avancei|avancamos|atualizei|atualizamos)\b/.test(normalized)) return true;
  if (/\b(entreguei|entregamos|aprovamos|aprovado|implantamos|implantado|lancamos|lancado|publicamos|publicado|atingimos|batemos|reduzimos|aumentamos|fechamos)\b/.test(normalized)) {
    return normalizedWords(normalized).length >= 3;
  }
  if (/\b(feito|pronto)\b/.test(normalized)) return normalizedWords(normalized).length >= 3;

  return false;
}

export function isConcreteEvidenceText(value: string) {
  const normalized = normalizeTextForRouting(value)
    .replace(/^evidencia\s*(?:para|no|na|do|da)?\s*/i, "")
    .trim();
  if (!normalized || isNonMutatingAcknowledgement(normalized)) return false;
  if (/^(feito|pronto|concluido|finalizado|teste|piloto|sem novidade|nada novo)$/.test(normalized)) return false;

  const meaningfulWords = normalizedWords(normalized).filter((word) => word.length >= 3);
  return normalized.length >= 10 && (meaningfulWords.length >= 2 || /\d/.test(normalized));
}

function targetTokens(value: string) {
  return [...new Set(normalizedWords(value).filter((word) => word.length >= 4 && !TARGET_STOP_WORDS.has(word)))];
}

export function explicitlyReferencesQuickTarget(message: string, label: string, objectiveTitle: string) {
  const normalizedMessage = normalizeTextForRouting(message);
  const normalizedLabel = normalizeTextForRouting(label);
  if (normalizedLabel.length >= 8 && normalizedMessage.includes(normalizedLabel)) return true;

  const messageWords = new Set(normalizedWords(message));
  const tokens = targetTokens(`${label} ${objectiveTitle}`);
  const matches = tokens.filter((token) => messageWords.has(token));
  if (matches.length >= 2) return true;
  return matches.length === 1 && matches[0].length >= 7;
}
