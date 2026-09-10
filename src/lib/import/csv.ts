export class CsvParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(`${message} (baris ${line}, kolom ${column})`);
    this.name = "CsvParseError";
  }
}

/** RFC 4180 CSV parser. Newlines inside quoted fields are preserved as `\n`. */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith("﻿") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let quoteClosed = false;
  let line = 1;
  let column = 1;

  const pushRow = () => {
    row.push(field);
    rows.push(row);
    row = [];
    field = "";
    quoteClosed = false;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
          column += 2;
        } else {
          quoted = false;
          quoteClosed = true;
          column += 1;
        }
      } else if (character === "\r" || character === "\n") {
        if (character === "\r" && source[index + 1] === "\n") index += 1;
        field += "\n";
        line += 1;
        column = 1;
      } else {
        field += character;
        column += 1;
      }
      continue;
    }

    if (quoteClosed && character !== "," && character !== "\r" && character !== "\n") {
      throw new CsvParseError("Karakter setelah tanda kutip penutup tidak sah", line, column);
    }

    if (character === '"') {
      if (field !== "") {
        throw new CsvParseError("Tanda kutip hanya boleh di awal kolom", line, column);
      }
      quoted = true;
      column += 1;
    } else if (character === ",") {
      row.push(field);
      field = "";
      quoteClosed = false;
      column += 1;
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      pushRow();
      line += 1;
      column = 1;
    } else {
      field += character;
      column += 1;
    }
  }

  if (quoted) throw new CsvParseError("Kolom bertanda kutip tidak ditutup", line, column);
  if (field !== "" || row.length > 0 || quoteClosed) pushRow();

  return rows;
}

const FORMULA_LIKE = /^'*[\t\r\n ]*[=+\-@]/u;

function protectFormula(value: string): string {
  return FORMULA_LIKE.test(value) ? `'${value}` : value;
}

/** Reverses exactly one formula-escape prefix produced by `serializeCsv`. */
export function unprotectCsvFormula(value: string): string {
  return value.startsWith("'") && FORMULA_LIKE.test(value)
    ? value.slice(1)
    : value;
}

function serializeField(value: string, protectFormulas: boolean): string {
  const output = protectFormulas ? protectFormula(value) : value;
  return /[",\r\n]/u.test(output)
    ? `"${output.replaceAll('"', '""')}"`
    : output;
}

export type CsvSerializeOptions = { protectFormulas?: boolean };

/** Serializes RFC 4180 CSV with CRLF. Formula protection is enabled by default. */
export function serializeCsv(
  rows: readonly (readonly string[])[],
  options: CsvSerializeOptions = {},
): string {
  const protectFormulas = options.protectFormulas ?? true;
  return rows
    .map((row) => row.map((value) => serializeField(value, protectFormulas)).join(","))
    .join("\r\n");
}
