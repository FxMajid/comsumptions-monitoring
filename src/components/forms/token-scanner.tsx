"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CameraOff } from "lucide-react";
import { extractClaimToken, operatorClaimPath } from "@/lib/domain/claim-link";

type DetectedBarcode = { rawValue: string };

type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

/** Chrome and Edge ship it; Safari and Firefox still do not, hence the fallback. */
function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  const candidate = (
    window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
  ).BarcodeDetector;

  return typeof candidate === "function" ? candidate : null;
}

const SCAN_INTERVAL_MS = 250;

type ScanState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "unsupported" }
  | { kind: "error"; message: string };

/**
 * The camera starts only when the operator asks for it. Nothing here reads the
 * device on mount, so a station that never scans never prompts, and the typed
 * fallback below works with the camera switched off entirely.
 */
export function TokenScanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<ScanState>({ kind: "idle" });
  const [manualError, setManualError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = useCallback(async () => {
    if (!getBarcodeDetector()) {
      setState({ kind: "unsupported" });

      return;
    }

    setState({ kind: "starting" });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setState({ kind: "scanning" });
    } catch {
      stopCamera();
      setState({
        kind: "error",
        message:
          "Kamera tidak bisa dibuka. Izinkan akses kamera di browser, atau masukkan kode secara manual.",
      });
    }
  }, [stopCamera]);

  useEffect(() => {
    if (state.kind !== "scanning") {
      return;
    }

    const Detector = getBarcodeDetector();

    if (!Detector) {
      return;
    }

    const detector = new Detector({ formats: ["qr_code"] });
    let cancelled = false;

    const timer = window.setInterval(async () => {
      const video = videoRef.current;

      if (cancelled || !video || video.readyState < 2) {
        return;
      }

      try {
        const codes = await detector.detect(video);

        for (const code of codes) {
          const token = extractClaimToken(code.rawValue);

          if (token) {
            cancelled = true;
            window.clearInterval(timer);
            stopCamera();
            router.push(operatorClaimPath(token));

            return;
          }
        }
      } catch {
        // A single failed frame is normal while the camera focuses.
      }
    }, SCAN_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [router, state.kind, stopCamera]);

  function readManual(formData: FormData) {
    const raw = formData.get("token");
    const token = typeof raw === "string" ? extractClaimToken(raw) : null;

    if (!token) {
      setManualError("Kode itu bukan token klaim yang sah.");

      return;
    }

    setManualError(null);
    router.push(operatorClaimPath(token));
  }

  const isLive = state.kind === "scanning" || state.kind === "starting";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="relative overflow-hidden rounded-lg border border-line bg-black">
          <video
            ref={videoRef}
            muted
            playsInline
            aria-label="Pratinjau kamera pemindai QR"
            className={`aspect-video w-full object-cover ${isLive ? "" : "opacity-40"}`}
          />
          {state.kind !== "scanning" ? (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/80">
              {state.kind === "starting"
                ? "Menyalakan kamera…"
                : "Kamera mati. Nyalakan untuk memindai QR peserta."}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isLive ? (
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setState({ kind: "idle" });
              }}
              className="inline-flex items-center gap-2 rounded-md border border-line bg-surface-raised px-3 py-2 text-sm font-semibold hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <CameraOff aria-hidden className="size-4" />
              Matikan kamera
            </button>
          ) : (
            <button
              type="button"
              onClick={startCamera}
              className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <Camera aria-hidden className="size-4" />
              Nyalakan kamera
            </button>
          )}

          {state.kind === "scanning" ? (
            <span className="text-xs text-ink-muted">
              Arahkan QR peserta ke kamera.
            </span>
          ) : null}
        </div>

        {state.kind === "unsupported" ? (
          <p role="alert" className="text-xs text-warn">
            Browser ini belum mendukung pemindaian QR. Pakai Chrome di Android, atau
            masukkan kode manual di bawah.
          </p>
        ) : null}

        {state.kind === "error" ? (
          <p role="alert" className="text-xs text-alert">
            {state.message}
          </p>
        ) : null}
      </div>

      <form action={readManual} className="flex flex-col gap-2">
        <label htmlFor="token" className="text-sm font-medium">
          Masukkan kode manual
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="token"
            name="token"
            autoComplete="off"
            spellCheck={false}
            placeholder="Tempel tautan klaim atau token"
            aria-invalid={manualError ? true : undefined}
            aria-describedby={manualError ? "token-error" : "token-hint"}
            className="min-w-0 flex-1 rounded-md border border-line bg-surface-raised px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 aria-invalid:border-alert"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md border border-line bg-surface-raised px-3 py-2 text-sm font-semibold hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            Buka
          </button>
        </div>
        {manualError ? (
          <p id="token-error" role="alert" className="text-xs text-alert">
            {manualError}
          </p>
        ) : (
          <p id="token-hint" className="text-xs text-ink-muted">
            Berguna saat kamera bermasalah: tautan dari QR bisa ditempel apa adanya.
          </p>
        )}
      </form>
    </div>
  );
}
