import { describe, expect, it } from "vitest";
import { CsvParseError, parseCsv, serializeCsv, unprotectCsvFormula } from "./csv";

describe("parseCsv", () => {
  it("parses BOM, CRLF, escaped quotes, commas, and embedded newlines", () => {
    expect(parseCsv('﻿A,B,C\r\n1,"dua, kata","baris 1\r\nbaris 2"\r\n2,"a""b",')).toEqual([
      ["A", "B", "C"],
      ["1", "dua, kata", "baris 1\nbaris 2"],
      ["2", 'a"b', ""],
    ]);
  });

  it("rejects malformed quoting", () => {
    expect(() => parseCsv('A\r\n"tidak ditutup')).toThrow(CsvParseError);
    expect(() => parseCsv('A\r\n"selesai"x')).toThrow("Karakter setelah tanda kutip");
  });

  it("does not invent a row for an empty file or final CRLF", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("A,B\r\n")).toEqual([["A", "B"]]);
  });
});

describe("serializeCsv", () => {
  it("round-trips text and protects spreadsheet formulas", () => {
    const csv = serializeCsv([
      ["normal", "comma,value", 'quote"value', "two\nlines"],
      ["=SUM(A1:A2)", " +cmd", "-1+2", "@payload", "123"],
    ]);
    expect(csv).toContain("'=SUM(A1:A2)");
    expect(csv).toContain("' +cmd");
    expect(csv).toContain("'-1+2");
    expect(csv).toContain("'@payload");
    expect(parseCsv(csv)).toEqual([
      ["normal", "comma,value", 'quote"value', "two\nlines"],
      ["'=SUM(A1:A2)", "' +cmd", "'-1+2", "'@payload", "123"],
    ]);
  });

  it("reverses one system formula escape without stripping ordinary apostrophes", () => {
    expect(unprotectCsvFormula("'+628123456789")).toBe("+628123456789");
    expect(unprotectCsvFormula("''=kept-as-data")).toBe("'=kept-as-data");
    expect(unprotectCsvFormula("'Nama biasa")).toBe("'Nama biasa");
  });
});
