"use client";

/**
 * Browser-only bill image compression.
 *
 * No external dependencies: decode → resize (longest edge ≤ 1280px) → draw to
 * canvas → JPEG encode (0.78, or 0.70 when still larger than 250 KB). Canvas
 * re-encoding strips EXIF/GPS metadata and applies EXIF orientation in modern
 * browsers. Never upscales a smaller source image.
 */

export interface CompressedImageOutput {
  base64DataUrl: string;
  base64Pure: string;
  mimeType: string;
  originalSizeKB: number;
  compressedSizeKB: number;
  width: number;
  height: number;
}

const MAX_EDGE = 1280;
const PRIMARY_QUALITY = 0.78;
const FALLBACK_QUALITY = 0.7;
const HARD_SIZE_LIMIT_KB = 250;
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

export function formatKB(kilobytes: number): string {
  if (!Number.isFinite(kilobytes) || kilobytes <= 0) return "0 KB";
  if (kilobytes >= 1024) {
    return `${(kilobytes / 1024).toFixed(kilobytes >= 10240 ? 0 : 1)} MB`;
  }
  return `${Math.round(kilobytes)} KB`;
}

export function compressionSummary(output: CompressedImageOutput): string {
  return `${formatKB(output.originalSizeKB)} → ${formatKB(output.compressedSizeKB)}`;
}

export async function compressImage(input: File | Blob): Promise<CompressedImageOutput> {
  if (!(input instanceof Blob)) {
    throw new Error("Compression ke liye valid image file chahiye.");
  }
  if (input.type && !input.type.startsWith("image/")) {
    throw new Error("Sirf image file scan ho sakti hai (JPG, PNG, WebP).");
  }
  if (input.size > MAX_SOURCE_BYTES) {
    throw new Error("Photo 30MB se bari hai. Qareeb se dobara tasveer lein.");
  }

  const originalSizeKB = roundKB(input.size / 1024);

  try {
    const image = await decodeImage(input);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas is unavailable in this browser.");

    // White matte prevents transparent PNGs becoming black in JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image.source, 0, 0, width, height);
    image.release();

    let jpeg = await canvasToJpeg(canvas, PRIMARY_QUALITY);
    if (jpeg.size > HARD_SIZE_LIMIT_KB * 1024) {
      jpeg = await canvasToJpeg(canvas, FALLBACK_QUALITY);
    }

    const base64DataUrl = await blobToDataUrl(jpeg);
    return {
      base64DataUrl,
      base64Pure: stripDataPrefix(base64DataUrl),
      mimeType: "image/jpeg",
      originalSizeKB,
      compressedSizeKB: roundKB(jpeg.size / 1024),
      width,
      height,
    };
  } catch (error) {
    // A browser that cannot decode an exotic camera format should not kill the
    // whole batch. Pass the original bytes through when they are already one of
    // the API's accepted raster formats; the server/UI will surface a readable
    // error otherwise instead of crashing the scanner.
    if (input.type === "image/jpeg" || input.type === "image/png" || input.type === "image/webp") {
      const base64DataUrl = await blobToDataUrl(input);
      return {
        base64DataUrl,
        base64Pure: stripDataPrefix(base64DataUrl),
        mimeType: input.type,
        originalSizeKB,
        compressedSizeKB: originalSizeKB,
        width: 0,
        height: 0,
      };
    }
    throw new Error(
      error instanceof Error
        ? `Is photo ko compress nahi kiya ja saka: ${error.message}`
        : "Is photo ko compress nahi kiya ja saka. Dobara try karein.",
    );
  }
}

async function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), "image/jpeg", quality);
  });
  if (!blob) throw new Error("JPEG compression failed.");
  return blob;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Image read failed."));
    };
    reader.onerror = () => reject(new Error("Image read failed."));
    reader.readAsDataURL(blob);
  });
}

function stripDataPrefix(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function roundKB(value: number) {
  return Math.round(value * 10) / 10;
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      } as ImageBitmapOptions);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to <img> decoding for browsers with partial support.
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await loadImageElement(objectUrl);
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Photo open nahi ho saki."));
    image.src = src;
  });
}
