import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 52;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const COLORS = {
  text: rgb(0.11, 0.11, 0.12),
  secondary: rgb(0.34, 0.34, 0.37),
  tertiary: rgb(0.54, 0.54, 0.57),
  border: rgb(0.82, 0.82, 0.84),
  surface: rgb(0.965, 0.965, 0.972),
  white: rgb(1, 1, 1),
};

type PlanPdfDocument = {
  title?: unknown;
  period?: unknown;
  version?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  content?: unknown;
};

function asText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function pdfSafeText(value: unknown) {
  return String(value ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

function supportedText(font: PDFFont, value: unknown) {
  let result = "";
  for (const character of pdfSafeText(value)) {
    try {
      font.encodeText(character);
      result += character;
    } catch {
      result += "?";
    }
  }
  return result;
}

function splitLongWord(font: PDFFont, word: string, maxWidth: number, size: number) {
  const pieces: string[] = [];
  let current = "";
  for (const character of word) {
    const candidate = current + character;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      pieces.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function wrapLine(font: PDFFont, value: unknown, maxWidth: number, size: number) {
  const text = supportedText(font, value).trim();
  if (!text) return [""];
  const words = text.split(/\s+/).flatMap((word) =>
    font.widthOfTextAtSize(word, size) > maxWidth ? splitLongWord(font, word, maxWidth, size) : [word]
  );
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function documentTypeLabel(value: unknown) {
  const labels: Record<string, string> = {
    strategic: "Plano Estratégico",
    quarterly: "Plano Trimestral",
    monthly: "Plano Mensal",
    month_close: "Fechamento Mensal",
    quarter_close: "Fechamento Trimestral",
    strategic_review: "Revisão Estratégica",
  };
  return labels[asText(value)] ?? "Documento Oráculo";
}

function objectiveTypeLabel(value: unknown) {
  const normalized = slug(value);
  if (normalized === "evolucao" || normalized === "seed") return "Evolução";
  if (normalized === "resultado" || normalized === "harvest") return "Resultado";
  return asText(value);
}

function slug(value: unknown) {
  return asText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function planDocumentFileName(document: { title?: unknown; period?: unknown }) {
  const title = slug(document.title || "documento-oraculo");
  const period = slug(document.period);
  const source = period && !title.includes(period) ? `${title}-${period}` : title;
  return `${source.slice(0, 100) || "documento-oraculo"}.pdf`;
}

export async function renderPlanDocumentPdf(document: PlanPdfDocument) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(asText(document.title, "Documento Oráculo"));
  pdf.setAuthor("Oráculo");
  pdf.setCreator("Oráculo");

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const medium = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const content = asRecord(document.content);
  const objectives = asArray<Record<string, unknown>>(content.objetivos);
  const context = asArray<string>(content.contexto_rapido);
  const focus = asArray<string>(content.foco_aprendizado);
  const reference = asRecord(content.referencia);
  const title = asText(document.title, documentTypeLabel(content.tipo));
  const metadata = [documentTypeLabel(content.tipo), asText(content.area, "Empresa"), asText(content.periodo, document.period)].filter(Boolean).join(" · ");

  let page: PDFPage;
  let pageNumber = 0;
  let y = 0;

  const drawFooter = () => {
    page.drawLine({ start: { x: MARGIN, y: 34 }, end: { x: PAGE_WIDTH - MARGIN, y: 34 }, thickness: 0.5, color: COLORS.border });
    page.drawText("ORÁCULO", { x: MARGIN, y: 20, size: 7, font: medium, color: COLORS.tertiary });
    const pageText = `Página ${pageNumber}`;
    page.drawText(pageText, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageText, 7),
      y: 20,
      size: 7,
      font: regular,
      color: COLORS.tertiary,
    });
  };

  const addPage = (continuation = false) => {
    if (pageNumber) drawFooter();
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pageNumber += 1;
    y = PAGE_HEIGHT - MARGIN;
    if (continuation) {
      page.drawText(supportedText(medium, title), { x: MARGIN, y, size: 9, font: medium, color: COLORS.secondary });
      page.drawText(supportedText(regular, metadata), { x: MARGIN, y: y - 15, size: 7.5, font: regular, color: COLORS.tertiary });
      page.drawLine({ start: { x: MARGIN, y: y - 27 }, end: { x: PAGE_WIDTH - MARGIN, y: y - 27 }, thickness: 0.6, color: COLORS.border });
      y -= 48;
    }
  };

  const ensure = (height: number) => {
    if (y - height < 52) addPage(true);
  };

  const drawLines = (lines: string[], options: { x?: number; width?: number; size?: number; lineHeight?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; gapAfter?: number } = {}) => {
    const x = options.x ?? MARGIN;
    const width = options.width ?? CONTENT_WIDTH;
    const size = options.size ?? 10;
    const lineHeight = options.lineHeight ?? 14;
    const selectedFont = options.font ?? regular;
    for (const source of lines) {
      const wrapped = wrapLine(selectedFont, source, width, size);
      for (const line of wrapped) {
        ensure(lineHeight + 3);
        if (line) page.drawText(line, { x, y, size, font: selectedFont, color: options.color ?? COLORS.secondary });
        y -= lineHeight;
      }
    }
    y -= options.gapAfter ?? 0;
  };

  const drawSectionHeader = (index: number, sectionTitle: string) => {
    ensure(30);
    page.drawText(String(index).padStart(2, "0"), { x: MARGIN, y, size: 8, font: medium, color: COLORS.tertiary });
    page.drawText(supportedText(medium, sectionTitle.toUpperCase()), { x: MARGIN + 27, y, size: 8.5, font: medium, color: COLORS.secondary });
    y -= 24;
  };

  const drawKeyValue = (label: string, value: unknown, indent = 0) => {
    const text = asText(value);
    if (!text) return;
    const x = MARGIN + indent;
    const labelText = `${label}:`;
    const labelWidth = medium.widthOfTextAtSize(labelText, 9.5);
    ensure(18);
    page.drawText(supportedText(medium, labelText), { x, y, size: 9.5, font: medium, color: COLORS.text });
    const available = CONTENT_WIDTH - indent - labelWidth - 5;
    const wrapped = wrapLine(regular, text, available, 9.5);
    if (wrapped[0]) page.drawText(wrapped[0], { x: x + labelWidth + 5, y, size: 9.5, font: regular, color: COLORS.secondary });
    y -= 13;
    for (const line of wrapped.slice(1)) {
      ensure(13);
      page.drawText(line, { x, y, size: 9.5, font: regular, color: COLORS.secondary });
      y -= 13;
    }
    y -= 3;
  };

  addPage();

  page.drawText(supportedText(medium, asText(content.empresa, "Empresa").toUpperCase()), { x: MARGIN, y, size: 8, font: medium, color: COLORS.tertiary });
  const brand = "ORÁCULO";
  page.drawText(brand, { x: PAGE_WIDTH - MARGIN - medium.widthOfTextAtSize(brand, 8), y, size: 8, font: medium, color: COLORS.text });
  y -= 30;
  drawLines([title], { size: 23, lineHeight: 27, font: medium, color: COLORS.text, gapAfter: 3 });
  drawLines([metadata], { size: 9.5, lineHeight: 13, color: COLORS.secondary });
  const version = `Versão ${Number(document.version ?? 1)} · Gerado pelo Oráculo`;
  page.drawText(supportedText(regular, version), { x: MARGIN, y: y - 2, size: 7.5, font: regular, color: COLORS.tertiary });
  y -= 25;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.8, color: COLORS.border });
  y -= 30;

  let section = 1;
  if (context.length) {
    drawSectionHeader(section++, "Contexto Rápido");
    for (const item of context) {
      ensure(18);
      page.drawCircle({ x: MARGIN + 3, y: y + 3, size: 1.6, color: COLORS.tertiary });
      drawLines([item], { x: MARGIN + 14, width: CONTENT_WIDTH - 14, size: 9.5, lineHeight: 14, gapAfter: 4 });
    }
    y -= 12;
  }

  drawSectionHeader(section++, content.tipo === "strategic" ? "Estrutura Estratégica" : "Referência");
  const referenceStart = y;
  const referenceItems = content.tipo === "strategic"
    ? [
      ["Propósito", asRecord(asRecord(content.strategic).direcionadores).proposito],
      ["Visão", asRecord(asRecord(content.strategic).direcionadores).visao],
      ["Temas", asArray<string>(asRecord(content.strategic).temas).join("; ")],
    ]
    : [
      ["Objetivo anual", reference.objetivo_anual],
      ["Objetivos do trimestre", asArray<string>(reference.objetivos_trimestre).join("; ")],
    ];
  const visibleReference = referenceItems.filter(([, value]) => asText(value));
  const estimatedReferenceHeight = Math.max(42, visibleReference.reduce((sum, [, value]) => sum + wrapLine(regular, value, CONTENT_WIDTH - 34, 9.5).length * 13 + 12, 18));
  ensure(estimatedReferenceHeight);
  page.drawRectangle({ x: MARGIN, y: y - estimatedReferenceHeight + 10, width: CONTENT_WIDTH, height: estimatedReferenceHeight, color: COLORS.surface, borderColor: COLORS.border, borderWidth: 0.6 });
  y -= 10;
  for (const [label, value] of visibleReference) drawKeyValue(label, value, 14);
  y = Math.min(y, referenceStart - estimatedReferenceHeight + 2) - 22;

  if (objectives.length) {
    drawSectionHeader(section++, "Objetivos e Ações");
    for (const [objectiveIndex, objective] of objectives.entries()) {
      ensure(92);
      if (objectiveIndex > 0) {
        page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.6, color: COLORS.border });
        y -= 22;
      }
      const number = asText(objective.numero, String(objectiveIndex + 1));
      page.drawText(supportedText(regular, number), { x: MARGIN, y: y - 3, size: 34, font: regular, color: COLORS.border });
      const objectiveX = MARGIN + 58;
      const objectiveWidth = CONTENT_WIDTH - 58;
      const titleLines = wrapLine(medium, asText(objective.titulo, "Objetivo"), objectiveWidth, 15);
      drawLines(titleLines, { x: objectiveX, width: objectiveWidth, size: 15, lineHeight: 19, font: medium, color: COLORS.text, gapAfter: 2 });
      const meta = [
        objectiveTypeLabel(objective.tipo),
        asText(objective.indicador) ? `Indicador: ${asText(objective.indicador)}` : "",
        asText(objective.meta) ? `Meta: ${asText(objective.meta)}` : "",
        asText(objective.responsavel) ? `Responsável: ${asText(objective.responsavel)}` : "",
      ].filter(Boolean).join(" · ");
      drawLines([meta], { x: objectiveX, width: objectiveWidth, size: 7.8, lineHeight: 11, font: medium, color: COLORS.tertiary, gapAfter: 8 });
      drawKeyValue("Resultado esperado", objective.resultado, 58);
      drawKeyValue("Vínculo", objective.vinculo, 58);

      const deliverables = asArray<string>(objective.entregas);
      if (deliverables.length) {
        drawLines(["ENTREGAS"], { x: objectiveX, width: objectiveWidth, size: 7.5, lineHeight: 11, font: medium, color: COLORS.tertiary, gapAfter: 2 });
        for (const deliverable of deliverables) {
          page.drawCircle({ x: objectiveX + 2, y: y + 3, size: 1.4, color: COLORS.tertiary });
          drawLines([deliverable], { x: objectiveX + 12, width: objectiveWidth - 12, size: 9, lineHeight: 13, gapAfter: 2 });
        }
        y -= 5;
      }

      const actions = asArray<Record<string, unknown>>(objective.acoes);
      for (const action of actions) {
        const actionTitle = `${asText(action.codigo)} ${asText(action.descricao, "Ação-chave")}`.trim();
        const details = [
          asText(action.criterio) ? `Critério: ${asText(action.criterio)}` : "",
          `Dono: ${asText(action.responsavel, "A definir")}`,
          `Prazo: ${asText(action.prazo, "A definir")}`,
        ].filter(Boolean);
        const actionHeight = 24 + wrapLine(medium, actionTitle, objectiveWidth - 24, 9.5).length * 13 +
          details.reduce((sum, detail) => sum + wrapLine(regular, detail, objectiveWidth - 24, 8).length * 11, 0);
        ensure(actionHeight + 8);
        const actionTop = y + 8;
        const actionBottom = actionTop - actionHeight;
        page.drawRectangle({ x: objectiveX, y: actionBottom, width: objectiveWidth, height: actionHeight, color: COLORS.surface, borderColor: COLORS.border, borderWidth: 0.6 });
        y -= 10;
        drawLines([actionTitle], { x: objectiveX + 12, width: objectiveWidth - 24, size: 9.5, lineHeight: 13, font: medium, color: COLORS.text, gapAfter: 3 });
        drawLines(details, { x: objectiveX + 12, width: objectiveWidth - 24, size: 8, lineHeight: 11, color: COLORS.secondary });
        y = Math.min(y, actionBottom - 12);
      }
      drawKeyValue("Evidência", objective.evidencia, 58);
      y -= 18;
    }
  }

  if (focus.length) {
    drawSectionHeader(section++, "Foco de Aprendizado");
    for (const item of focus) {
      page.drawCircle({ x: MARGIN + 3, y: y + 3, size: 1.6, color: COLORS.tertiary });
      drawLines([item], { x: MARGIN + 14, width: CONTENT_WIDTH - 14, size: 9.5, lineHeight: 14, gapAfter: 4 });
    }
    y -= 10;
  }

  const focusPhrase = asText(content.frase_de_foco);
  if (focusPhrase) {
    ensure(60);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.7, color: COLORS.border });
    y -= 24;
    drawLines([focusPhrase], { size: 12, lineHeight: 17, font: italic, color: COLORS.secondary });
  }

  drawFooter();
  return {
    bytes: await pdf.save(),
    fileName: planDocumentFileName(document),
    mimeType: "application/pdf",
  };
}
