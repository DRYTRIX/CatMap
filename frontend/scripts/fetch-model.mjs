#!/usr/bin/env node
/** Download the YOLOv10n ONNX model for client-side cat pre-check. */

import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const MODEL_URL =
  "https://huggingface.co/onnx-community/yolov10n/resolve/main/onnx/model.onnx";
const MIN_BYTES = 5_000_000;
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
    return info.size >= MIN_BYTES;
  } catch {
    return false;
  }
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
  const res = await fetch(MODEL_URL);
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }
  await pipeline(res.body, createWriteStream(OUTPUT));

  if (!(await isValidModel(OUTPUT))) {
    await unlink(OUTPUT);
    throw new Error("Downloaded file failed validation (too small).");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
