import QRCode from "qrcode";

export type QrMatrix = {
  /** Module count per side, without the quiet zone. */
  size: number;
  /** Path data covering every dark module, in module units. */
  path: string;
};

/**
 * Returns the symbol as SVG path data rather than a raster image, so the same
 * markup stays sharp on a phone screen and on a printed sheet. Horizontal runs
 * are merged into one rectangle each, which keeps the attribute short.
 */
export function toQrMatrix(value: string): QrMatrix {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
  const { size, data } = modules;
  const segments: string[] = [];

  for (let row = 0; row < size; row += 1) {
    let column = 0;

    while (column < size) {
      if (!data[row * size + column]) {
        column += 1;
        continue;
      }

      let run = 1;

      while (column + run < size && data[row * size + column + run]) {
        run += 1;
      }

      segments.push(`M${column} ${row}h${run}v1h-${run}z`);
      column += run;
    }
  }

  return { size, path: segments.join("") };
}
