import { QrSymbol } from "@/components/ui/qr-symbol";
import { toQrMatrix } from "@/lib/qr";

/**
 * Encodes on the server: the encoder is a Node module, and the value is a claim
 * token that has no reason to reach a client bundle.
 */
export function QrCode({
  value,
  label,
  pixelSize,
}: Readonly<{ value: string; label: string; pixelSize?: number }>) {
  return <QrSymbol matrix={toQrMatrix(value)} label={label} pixelSize={pixelSize} />;
}
