const MAX_FILE_SIZE_MB = 80;
const LARGE_FILE_WARNING_MB = 30;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const LARGE_FILE_WARNING_BYTES = LARGE_FILE_WARNING_MB * 1024 * 1024;

export const STRATEGIC_PLAN_FILE_ACCEPT =
  ".pdf,.pptx,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export const PLAN_FILE_ACCEPT = STRATEGIC_PLAN_FILE_ACCEPT;

/** Histórico: mesmos documentos de texto + imagens (OCR via IA de bastidores). */
export const HISTORICAL_FILE_ACCEPT =
  `${STRATEGIC_PLAN_FILE_ACCEPT},.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp`;

export function isHistoricalImageFile(file: File) {
  const extension = getExtension(file.name);
  return [".jpg", ".jpeg", ".png", ".webp"].includes(extension) || file.type.startsWith("image/");
}

interface ImportedPlanText {
  fileName: string;
  text: string;
  warning?: string;
}

type TextContentItem = {
  str?: string;
};

type MammothApi = {
  extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
};

let pdfWorkerReady = false;

function getExtension(fileName: string) {
  return fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
}

function assertSupportedFile(file: File) {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`O arquivo passa de ${MAX_FILE_SIZE_MB} MB. Compacte o arquivo, exporte uma versão mais leve ou cole o texto do plano no campo.`);
  }

  const extension = getExtension(file.name);
  if (![".pdf", ".pptx", ".docx", ".txt"].includes(extension)) {
    throw new Error("Formato não suportado. Importe um arquivo PDF, PPTX, DOCX ou TXT.");
  }
}

function normalizeImportedText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ensureTextWasExtracted(text: string, emptyMessage: string) {
  const normalized = normalizeImportedText(text);
  if (!normalized) {
    throw new Error(emptyMessage);
  }
  return normalized;
}

async function extractPdfText(file: File) {
  const [{ GlobalWorkerOptions, getDocument }, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.mjs?url"),
  ]);

  if (!pdfWorkerReady) {
    GlobalWorkerOptions.workerSrc = worker.default;
    pdfWorkerReady = true;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? (item as TextContentItem).str ?? "" : ""))
      .join(" ");

    pages.push(pageText);
  }

  return ensureTextWasExtracted(
    pages.join("\n\n"),
    "O PDF parece ser escaneado ou não tem texto extraível. Envie uma versão com texto ou cole o conteúdo no campo.",
  );
}

async function extractPptxText(file: File) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((a, b) => {
      const aNumber = Number(a.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      const bNumber = Number(b.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      return aNumber - bNumber;
    });

  const parser = new DOMParser();
  const slides: string[] = [];

  for (const path of slidePaths) {
    const entry = zip.file(path);
    if (!entry) continue;

    const xml = await entry.async("text");
    const document = parser.parseFromString(xml, "application/xml");
    const textNodes = Array.from(document.getElementsByTagName("*"))
      .filter((node) => node.localName === "t")
      .map((node) => node.textContent?.trim() ?? "")
      .filter(Boolean);

    if (textNodes.length) {
      slides.push(textNodes.join("\n"));
    }
  }

  return ensureTextWasExtracted(
    slides.join("\n\n"),
    "Não encontrei texto nos slides. Verifique se o PPTX tem texto editável ou cole o conteúdo no campo.",
  );
}

async function extractDocxText(file: File) {
  const mammothModule = (await import("mammoth")) as MammothApi | { default: MammothApi };
  const mammothApi = "default" in mammothModule ? mammothModule.default : mammothModule;
  const result = await mammothApi.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return ensureTextWasExtracted(
    result.value,
    "Não encontrei texto no DOCX. Verifique se o documento tem texto editável ou cole o conteúdo no campo.",
  );
}

async function extractTxtText(file: File) {
  return ensureTextWasExtracted(await file.text(), "O TXT está vazio. Cole o conteúdo do plano no campo.");
}

export async function importStrategicPlanFile(file: File): Promise<ImportedPlanText> {
  assertSupportedFile(file);

  const extension = getExtension(file.name);
  const textByExtension: Record<string, () => Promise<string>> = {
    ".pdf": () => extractPdfText(file),
    ".pptx": () => extractPptxText(file),
    ".docx": () => extractDocxText(file),
    ".txt": () => extractTxtText(file),
  };

  const text = await textByExtension[extension]();
  const warnings = [
    file.size > LARGE_FILE_WARNING_BYTES
      ? `Arquivo grande importado. A extração pode demorar em computadores mais lentos; se travar, use uma versão compactada ou cole o texto do plano.`
      : null,
    text.length > 60000
      ? "Importei o texto, mas ele veio bem longo. A revisão pode focar nos principais sinais do plano."
      : null,
  ].filter(Boolean);

  return {
    fileName: file.name,
    text,
    warning: warnings.length ? warnings.join(" ") : undefined,
  };
}

export const importPlanFile = importStrategicPlanFile;
