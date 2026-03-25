import { randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const MACOS_CLIPBOARD_IMAGE_SWIFT = `
import AppKit
import Foundation

func writeStdout(_ data: Data) {
  FileHandle.standardOutput.write(data)
}

let pasteboard = NSPasteboard.general

if let png = pasteboard.data(forType: .png) {
  writeStdout(png)
  exit(0)
}

if let tiff = pasteboard.data(forType: .tiff),
   let bitmap = NSBitmapImageRep(data: tiff),
   let png = bitmap.representation(using: .png, properties: [:]) {
  writeStdout(png)
  exit(0)
}

fputs("No image data found on the clipboard.\\n", stderr)
exit(2)
`.trim();

function readClipboardImagePngMacOs(): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const child = spawn("swift", ["-"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdout: Buffer[] = [];
    let stderr = "";

    child.on("error", reject);
    child.stdout?.on("data", (chunk) => {
      stdout.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }
      if (code === 2) {
        resolve(null);
        return;
      }
      reject(new Error(stderr.trim() || `Clipboard image helper exited with code ${code ?? -1}.`));
    });

    child.stdin?.end(MACOS_CLIPBOARD_IMAGE_SWIFT);
  });
}

const CLIPBOARD_IMAGE_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function createShortImageId(length: number): string {
  const bytes = randomBytes(length);
  let id = "";
  for (const byte of bytes) {
    id += CLIPBOARD_IMAGE_ID_ALPHABET[byte % CLIPBOARD_IMAGE_ID_ALPHABET.length];
  }
  return id;
}

export function createClipboardImageFileName(id = createShortImageId(5)): string {
  return `${id}.png`;
}

export async function saveClipboardImageToFile(directory: string): Promise<string | null> {
  if (process.platform !== "darwin") {
    return null;
  }

  const pngBuffer = await readClipboardImagePngMacOs();
  if (!pngBuffer || pngBuffer.length === 0) {
    return null;
  }

  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, createClipboardImageFileName());
  await fs.writeFile(filePath, pngBuffer);
  return filePath;
}
