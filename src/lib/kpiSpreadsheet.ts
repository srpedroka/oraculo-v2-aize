import type { WorkBook } from "xlsx";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_SHEETS = 8;
const MAX_ROWS_PER_SHEET = 240;
const MAX_COLUMNS_PER_ROW = 36;
const MAX_CELL_LENGTH = 240;
const MAX_TEXT_LENGTH = 70_000;
const ALLOWED_EXTENSIONS = new Set(["xlsx", "xls", "csv"]);

export const KPI_SPREADSHEET_ACCEPT = ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv";

export interface ImportedKpiSpreadsheet {
  fileName: string;
  rawText: string;
  truncated: boolean;
}

function fileExtension(fileName: string) {
  return fileName.trim().toLowerCase().split(".").pop() ?? "";
}

function cellText(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n?/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CELL_LENGTH);
}

export async function readKpiSpreadsheet(file: File): Promise<ImportedKpiSpreadsheet> {
  const extension = fileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error("Envie uma planilha .xlsx, .xls ou .csv.");
  if (!file.size) throw new Error("A planilha está vazia.");
  if (file.size > MAX_FILE_SIZE_BYTES) throw new Error("A planilha deve ter no máximo 20 MB.");

  const XLSX = await import("xlsx");
  let workbook: WorkBook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, raw: false });
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
