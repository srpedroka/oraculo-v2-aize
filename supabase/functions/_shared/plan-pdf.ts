import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";
import { renderPlanForWhatsApp } from "./plan-render.ts";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const BODY_SIZE = 10;
const LINE_HEIGHT = 14;

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
function plainDocumentText(content: unknown) {
  return pdfSafeText(renderPlanForWhatsApp(content))
    .replace(/^---$/gm, "")
    .replace(/\*+/g, "")
    .replace(/^_([^\n]+)_$/gm, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function supportedText(font: PDFFont, value: string) {
  let result = "";
  for (const character of value) {
    try {
      font.encodeText(character);
      result += character;
    } catch {
      result += "?";
    }
  }
  return result;
}

function wrapLine(font: PDFFont, value: string, maxWidth: number, size: number) {
  if (!value.trim()) return [""];
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function addPage(pdf: PDFDocument) {
  return pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
}

function drawFooter(page: PDFPage, font: PDFFont, pageNumber: number) {
  page.drawText(`Oráculo · página ${pageNumber}`, {
    x: MARGIN,
    y: 24,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });
}

export function planDocumentFileName(document: { title?: unknown; period?: unknown }) {
  const source = `${String(document.title ?? "documento-oraculo")} ${String(document.period ?? "")}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return `${source || "documento-oraculo"}.pdf`;
}

export async function renderPlanDocumentPdf(document: { title?: unknown; period?: unknown; content?: unknown }) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = addPage(pdf);
  let pageNumber = 1;
  let y = PAGE_HEIGHT - MARGIN;

  const title = supportedText(bold, pdfSafeText(document.title || "Documento Oráculo"));
  for (const line of wrapLine(bold, title, PAGE_WIDTH - 2 * MARGIN, 16)) {
    page.drawText(line, { x: MARGIN, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
    y -= 21;
  }
  if (document.period) {
    page.drawText(supportedText(regular, pdfSafeText(document.period)), {
      x: MARGIN,
      y,
      size: 9,
      font: regular,
      color: rgb(0.42, 0.42, 0.42),
    });
    y -= 24;
  }

  const sourceLines = plainDocumentText(document.content).split("\n");
  for (const sourceLine of sourceLines) {
    const safeLine = supportedText(regular, sourceLine);
    const lines = wrapLine(regular, safeLine, PAGE_WIDTH - 2 * MARGIN, BODY_SIZE);
    for (const line of lines) {
      if (y < MARGIN + LINE_HEIGHT) {
        drawFooter(page, regular, pageNumber);
        page = addPage(pdf);
        pageNumber += 1;
        y = PAGE_HEIGHT - MARGIN;
      }
      if (line) page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font: regular, color: rgb(0.12, 0.12, 0.12) });
      y -= LINE_HEIGHT;
    }
    if (!sourceLine.trim()) y -= 4;
  }
  drawFooter(page, regular, pageNumber);

  return {
    bytes: await pdf.save(),
    fileName: planDocumentFileName(document),
    mimeType: "application/pdf",
  };
}
