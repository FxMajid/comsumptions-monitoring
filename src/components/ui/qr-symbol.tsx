import type { QrMatrix } from "@/lib/qr";

/** The spec asks for four empty modules around the symbol before it scans. */
const QUIET_ZONE = 4;

/**
 * Draws an already encoded matrix. Split from `QrCode` because the encoder is a
 * Node module: a Client Component cannot call it, but it can render a matrix
 * that a Server Action encoded and returned.
 */
export function QrSymbol({
  matrix,
  label,
  pixelSize = 192,
}: Readonly<{ matrix: QrMatrix; label: string; pixelSize?: number }>) {
  const extent = matrix.size + QUIET_ZONE * 2;

  return (
    <svg
      viewBox={`0 0 ${extent} ${extent}`}
      width={pixelSize}
      height={pixelSize}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="rounded-md border border-line bg-white"
    >
      <path
        d={matrix.path}
        transform={`translate(${QUIET_ZONE} ${QUIET_ZONE})`}
        fill="#000000"
      />
    </svg>
  );
}
