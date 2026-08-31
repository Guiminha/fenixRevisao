// Parser de CSV para importação em lote de códigos D.I.
// Formato esperado: 1ª coluna = Nome do D.I. | 2ª coluna = Código do D.I.

export interface ParsedDICsvRow {
  line: number;
  nome: string;
  codigo: string;
}

export interface DICsvParseResult {
  rows: ParsedDICsvRow[];
  errors: { line: number; motivo: string }[];
}

const MAX_ROWS = 5000;
const MAX_CELL = 200;

function sanitizeCell(v: string): string {
  return v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, MAX_CELL);
}

function isHeaderRow(cells: string[]): boolean {
  if (cells.length < 2) return false;
  const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f\s.]/g, "").toLowerCase();
  const a = norm(cells[0]);
  const b = norm(cells[1]);
  const nameOk = a === "nome" || a === "nomedodi" || a === "nomedod";
  const codeOk = b === "codigo" || b === "codigododi" || b === "codigodod";
  return nameOk && codeOk;
}

function parseDelimited(text: string, delimiter: string): { cells: string[]; line: number }[] {
  const rows: { cells: string[]; line: number }[] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let lineNo = 1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push({ cells: row, line: lineNo });
      row = [];
      lineNo++;
      continue;
    }
    field += ch;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push({ cells: row, line: lineNo });
  }
  return rows;
}

export function parseDICsv(buffer: Buffer | string): DICsvParseResult {
  let text = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const sample = text.split("\n").slice(0, 8).join("\n");
  const commas = (sample.match(/,/g) || []).length;
  const semis = (sample.match(/;/g) || []).length;
  const delimiter = semis > commas ? ";" : ",";

  const parsed = parseDelimited(text, delimiter);

  const rows: ParsedDICsvRow[] = [];
  const errors: { line: number; motivo: string }[] = [];
  let headerSkipped = false;

  for (const r of parsed) {
    if (!headerSkipped && r.cells.length >= 2 && isHeaderRow(r.cells)) {
      headerSkipped = true;
      continue;
    }
    const nome = sanitizeCell(r.cells[0] ?? "");
    const codigo = sanitizeCell(r.cells[1] ?? "");
    if (!nome && !codigo) continue;
    if (nome.startsWith("#")) continue;
    if (!codigo) {
      errors.push({ line: r.line, motivo: "Código D.I. ausente (coluna 2 vazia)." });
      continue;
    }
    if (rows.length >= MAX_ROWS) {
      errors.push({ line: r.line, motivo: `Limite de ${MAX_ROWS} D.I.s por arquivo excedido.` });
      continue;
    }
    rows.push({ line: r.line, nome, codigo });
  }

  return { rows, errors };
}

export function buildDITemplateCSV(): string {
  return [
    "Nome do DI,Código do DI",
    '# Preencha a partir da 2ª linha: 1ª coluna = Nome do D.I. | 2ª coluna = Código do D.I.',
    "# Linhas que começam com # são ignoradas no upload.",
    "# Exemplo (remova antes de enviar):",
    "# Maria Silva (Líder Regional SP),DI-123456",
    "# João Pereira (Consultor Comercial),DI-654321"
  ].join("\n") + "\n";
}