import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface UploadImageArgs {
  image_data: string;
  expiry?: string;
  filename?: string;
}

const VALID_EXPIRIES = ["1h", "12h", "24h", "72h"] as const;

const LITTERBOX_API =
  "https://litterbox.catbox.moe/resources/internals/api.php";

const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Detect MIME type from base64 magic bytes.
 * Falls back to application/octet-stream if unknown.
 */
function detectMimeType(base64: string): { mime: string; ext: string } {
  // Check first few bytes of the base64-decoded data
  const header = base64.slice(0, 24);

  if (header.startsWith("/9j/")) return { mime: "image/jpeg", ext: "jpg" };
  if (header.startsWith("iVBOR")) return { mime: "image/png", ext: "png" };
  if (header.startsWith("R0lGO")) return { mime: "image/gif", ext: "gif" };
  if (header.startsWith("UklGR")) return { mime: "image/webp", ext: "webp" };
  if (header.startsWith("Qk")) return { mime: "image/bmp", ext: "bmp" };
  if (header.startsWith("SUkq") || header.startsWith("TU0A"))
    return { mime: "image/tiff", ext: "tiff" };

  return { mime: "application/octet-stream", ext: "bin" };
}

/**
 * Strip a data URI prefix if present, returning raw base64.
 * Accepts: "data:image/png;base64,iVBOR..." or plain "iVBOR..."
 */
function stripDataUri(input: string): string {
  const match = input.match(/^data:[^;]+;base64,(.+)$/s);
  return match ? match[1] : input;
}

export async function handleUploadImage(
  args: UploadImageArgs
): Promise<CallToolResult> {
  try {
    if (!args.image_data || !args.image_data.trim()) {
      throw new Error("image_data must not be empty");
    }

    const expiry = args.expiry?.trim().toLowerCase() ?? "1h";
    if (!(VALID_EXPIRIES as readonly string[]).includes(expiry)) {
      throw new Error(
        `Invalid expiry: "${args.expiry}". Must be one of: ${VALID_EXPIRIES.join(", ")}`
      );
    }

    const rawBase64 = stripDataUri(args.image_data.trim());

    // Validate that it's actually base64
    let buffer: Buffer;
    try {
      buffer = Buffer.from(rawBase64, "base64");
      if (buffer.length === 0) {
        throw new Error("Decoded image data is empty");
      }
    } catch (e) {
      if (e instanceof Error && e.message === "Decoded image data is empty") {
        throw e;
      }
      throw new Error(
        "image_data is not valid base64. Provide raw base64 or a data URI " +
          "(data:image/png;base64,...)"
      );
    }

    const detected = detectMimeType(rawBase64);
    const filename =
      args.filename?.trim() || `image.${detected.ext}`;

    // Build multipart form data
    const arrayBuf = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuf], { type: detected.mime });
    const form = new FormData();
    form.set("reqtype", "fileupload");
    form.set("time", expiry);
    form.set("fileToUpload", blob, filename);

    let response: Response;
    try {
      response = await fetch(LITTERBOX_API, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new Error(
          `Upload timed out after ${UPLOAD_TIMEOUT_MS / 1000}s. ` +
            "The file may be too large or the service is slow."
        );
      }
      throw new Error(
        `Failed to connect to Litterbox (catbox.moe): ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const body = await response.text();

    if (!response.ok) {
      throw new Error(
        `Litterbox returned HTTP ${response.status}: ${body.slice(0, 500)}`
      );
    }

    const publicUrl = body.trim();
    if (!publicUrl.startsWith("https://")) {
      throw new Error(
        `Unexpected response from Litterbox: ${body.slice(0, 500)}`
      );
    }

    const sizeKb = (buffer.length / 1024).toFixed(1);

    const text =
      `Image uploaded successfully.\n\n` +
      `Public URL: ${publicUrl}\n` +
      `Expires in: ${expiry}\n` +
      `Size: ${sizeKb} KB\n` +
      `Type: ${detected.mime}\n\n` +
      `You can now use this URL with searxng_image_search to perform a reverse image search.`;

    return { content: [{ type: "text" as const, text }] };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
}
