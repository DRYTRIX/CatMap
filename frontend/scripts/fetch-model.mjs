#!/usr/bin/env node
/** Download the YOLOv10n ONNX model for client-side cat pre-check. */

import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const MODEL_SOURCES = [
  ["https://github.com/THU-MIG/yolov10/releases/download/v1.1/yolov10n.onnx", 2],
  ["https://huggingface.co/onnx-community/yolov10n/resolve/main/onnx/model.onnx", 2],
  ["https://hf-mirror.com/onnx-community/yolov10n/resolve/main/onnx/model.onnx", 1],
];
const MIN_BYTES = 5_000_000;
const TIMEOUT_MS = 300_000;
const OUTPUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "models",
  "yolov10n.onnx",
);

async function isValidModel(path) {
  try {
    const info = await stat(path);
    if (info.size < MIN_BYTES) {
      return false;
    }
    const header = await readFile(path, { encoding: null, flag: "r" });
    if (header.subarray(0, 32).toString("utf8").startsWith("version https://git-lfs")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function downloadOnce(url, output) {
  try {
    await unlink(output);
  } catch {
    // ignore missing file
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  await pipeline(res.body, createWriteStream(output));
}

async function downloadModel(sources, output) {
  let lastError = "Unknown error";

  for (const [url, maxAttempts] of sources) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        console.log(`Downloading from ${url} (attempt ${attempt}/${maxAttempts}) …`);
        await downloadOnce(url, output);
        if (await isValidModel(output)) {
          return null;
        }
        await unlink(output);
        lastError = "Downloaded file failed validation (too small or Git LFS pointer).";
      } catch (err) {
        try {
          await unlink(output);
        } catch {
          // ignore missing file
        }
        lastError = err.message || String(err);
        console.error(`Attempt ${attempt} failed: ${lastError}`);
      }

      if (attempt < maxAttempts) {
        const delay = 2 ** attempt;
        console.error(`Retrying in ${delay}s …`);
        await sleep(delay);
      }
    }
  }

  return lastError;
}

async function main() {
  await mkdir(dirname(OUTPUT), { recursive: true });

  if (await isValidModel(OUTPUT)) {
    console.log(`Model already present: ${OUTPUT}`);
    return;
  }

  try {
    await unlink(OUTPUT);
  } catch {
    // ignore missing file
  }

  console.log(`Downloading model to ${OUTPUT} …`);
  const error = await downloadModel(MODEL_SOURCES, OUTPUT);
  if (error !== null) {
    throw new Error(`Failed to download model: ${error}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
