import { useRef, useState } from "react";
import { Camera, RotateCcw } from "lucide-react";

/**
 * Camera capture via the native file input (`capture` attribute) — the most
 * reliable path on mobile: the OS camera UI handles permissions and quality,
 * and it degrades to the gallery/file picker on desktop. Returns the chosen
 * File plus a preview URL.
 */
export function PhotoCapture({
  facing = "user",
  onCapture,
  label = "Take photo",
  disabled = false,
}: {
  facing?: "user" | "environment";
  onCapture: (file: File | null) => void;
  label?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = (file: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    if (!file) {
      setPreview(null);
      onCapture(null);
      return;
    }
    setPreview(URL.createObjectURL(file));
    onCapture(file);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={facing}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt="Captured preview"
            className="h-48 w-48 rounded-2xl border border-gray-200 object-cover"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-md hover:text-primary"
          >
            <RotateCcw size={13} /> Retake
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="flex h-48 w-48 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 text-primary transition hover:border-primary/70 hover:bg-primary/10 disabled:opacity-50"
        >
          <Camera size={30} />
          <span className="text-sm font-semibold">{label}</span>
        </button>
      )}
    </div>
  );
}

/** Best-effort current GPS position; resolves null if denied/unavailable. */
export function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );
  });
}
