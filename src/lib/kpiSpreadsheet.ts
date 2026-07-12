import type { WorkBook } from "xlsx";
import type { KpiImportImage } from "../types";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_SHEETS = 8;
const MAX_ROWS_PER_SHEET = 240;
const MAX_COLUMNS_PER_ROW = 36;
const MAX_CELL_LENGTH = 240;
const MAX_TEXT_LENGTH = 70_000;
const MAX_IMAGE_DIMENSION = 2_400;
const ALLOWED_EXTENSIONS = new Set(["xlsx", "xls", "csv"]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

export const KPI_IMPORT_ACCEPT = ".xlsx,.xls,.csv,.jpg,.jpeg,.png,.webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,image/jpeg,image/png,image/webp";

export interface ImportedKpiSpreadsheet {
  fileName: string;
  rawText: string;
  truncated: boolean;
}

export interface ImportedKpiImage {
  fileName: string;
  image: KpiImportImage;
}

function fileExtension(fileName: string) {
  return fileName.trim().toLowerCase().split(".").pop() ?? "";
}

export function isKpiImageFile(file: File) {
  return IMAGE_EXTENSIONS.has(fileExtension(file.name));
}

function cellText(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n?/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CELL_LENGTH);
}

function hasZipSignature(bytes: Uint8Array) {
  return bytes.length >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b
    && ((bytes[2] === 0x03 && bytes[3] === 0x04)
      || (bytes[2] === 0x05 && bytes[3] === 0x06)
      || (bytes[2] === 0x07 && bytes[3] === 0x08));
}

export async function readKpiSpreadsheet(file: File): Promise<ImportedKpiSpreadsheet> {
  const extension = fileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error("Envie uma planilha .xlsx, .xls ou .csv.");
  if (!file.size) throw new Error("A planilha está vazia.");
  if (file.size > MAX_FILE_SIZE_BYTES) throw new Error("A planilha deve ter no máximo 20 MB.");

  const XLSX = await import("xlsx");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (extension === "xlsx" && !hasZipSignature(bytes)) {
    throw new Error("Não foi possível ler esta planilha. Verifique se o arquivo não está corrompido.");
  }
  let workbook: WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: "array", cellDates: true, raw: false });
  } catch (_error) {
    throw new Error("Não foi possível ler esta planilha. Verifique se o arquivo não está corrompido.");
  }

  const sections = workbook.SheetNames.slice(0, MAX_SHEETS).flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    }) as unknown[][];
    const table = rows
      .slice(0, MAX_ROWS_PER_SHEET)
      .map((row) => row.slice(0, MAX_COLUMNS_PER_ROW).map(cellText).join("\t"))
      .filter(Boolean)
      .join("\n");
    return table ? [`Aba: ${cellText(sheetName)}\n${table}`] : [];
  });

  if (!sections.length) throw new Error("Não encontrei dados legíveis na planilha.");

  const joined = sections.join("\n\n");
  return {
    fileName: file.name.slice(0, 180),
    rawText: joined.slice(0, MAX_TEXT_LENGTH),
    truncated: joined.length > MAX_TEXT_LENGTH || workbook.SheetNames.length > MAX_SHEETS,
  };
}

function readBlobAsBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível preparar a imagem para leitura."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.split(",", 2)[1] ?? "";
      if (!base64) {
        reject(new Error("Não foi possível preparar a imagem para leitura."));
        return;
      }
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

async function prepareKpiImage(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a imagem para leitura.");
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const output = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Não foi possível preparar a imagem para leitura."));
      }, "image/jpeg", 0.92);
    });
    return { mimeType: "image/jpeg" as const, base64: await readBlobAsBase64(output) };
  } finally {
    bitmap.close();
  }
}

export async function readKpiImage(file: File): Promise<ImportedKpiImage> {
  if (!isKpiImageFile(file)) throw new Error("Envie uma imagem JPG, PNG ou WEBP.");
  if (!file.size) throw new Error("A imagem está vazia.");
  if (file.size > MAX_IMAGE_SIZE_BYTES) throw new Error("A imagem deve ter no máximo 8 MB.");

  try {
    return {
      fileName: file.name.slice(0, 180),
      image: await prepareKpiImage(file),
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Não foi possível ler esta imagem. Use JPG, PNG ou WEBP.");
  }
}
