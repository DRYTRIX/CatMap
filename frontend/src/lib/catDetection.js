/** Client-side cat check via YOLOv10 (server enforces too). */

import * as ort from "onnxruntime-web";

const CAT_THRESHOLD = 0.2;
const ANIMAL_THRESHOLD = 0.3;
const COCO_CAT_CLASS = 15;
const COCO_DOG_CLASS = 16;
const INPUT_SIZE = 640;
const MODEL_URL = "/models/yolov10n.onnx";

let sessionPromise = null;

async function loadSession() {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ["wasm"],
    });
  }
  return sessionPromise;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image for cat check."));
    };
    img.src = url;
  });
}

function cropToCanvas(img, sx, sy, sw, sh) {
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

/** Match server multi-crop strategy so client and server agree more often. */
function cropsForImage(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const side = Math.min(w, h);
  const left = Math.floor((w - side) / 2);
  const top = Math.floor((h - side) / 2);
  return [
    img,
    cropToCanvas(img, left, top, side, side),
    cropToCanvas(img, 0, 0, w, Math.max(Math.floor(h / 2), 1)),
    cropToCanvas(img, 0, 0, Math.max(Math.floor(w / 2), 1), h),
  ];
}

function letterboxToTensor(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scale = INPUT_SIZE / Math.max(w, h);
  const nw = Math.round(w * scale);
  const nh = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#727272";
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);

  const resized = document.createElement("canvas");
  resized.width = nw;
  resized.height = nh;
  resized.getContext("2d").drawImage(img, 0, 0, nw, nh);
  ctx.drawImage(
    resized,
    Math.floor((INPUT_SIZE - nw) / 2),
    Math.floor((INPUT_SIZE - nh) / 2),
  );

  const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const pixels = INPUT_SIZE * INPUT_SIZE;
  const float32 = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i++) {
    const base = i * 4;
    float32[i] = data[base] / 255;
    float32[i + pixels] = data[base + 1] / 255;
    float32[i + 2 * pixels] = data[base + 2] / 255;
  }

  return new ort.Tensor("float32", float32, [1, 3, INPUT_SIZE, INPUT_SIZE]);
}

function parseYoloOutput(tensor) {
  const data = tensor.data;
  let bestCat = 0;
  let bestDog = 0;
  for (let i = 0; i < 300; i++) {
    const off = i * 6;
    const score = data[off + 4];
    const cls = data[off + 5];
    if (score < 0.01) continue;
    if (cls === COCO_CAT_CLASS) bestCat = Math.max(bestCat, score);
    if (cls === COCO_DOG_CLASS) bestDog = Math.max(bestDog, score);
  }
  return { cat: bestCat, animal: Math.max(bestCat, bestDog) };
}

/**
 * @returns {Promise<{
 *   score: number | null,
 *   animalScore: number | null,
 *   detected: boolean,
 *   possibleAnimal: boolean,
 *   error?: boolean
 * }>}
 */
export async function checkForCat(file) {
  try {
    const session = await loadSession();
    const img = await fileToImage(file);
    let bestCat = 0;
    let bestAnimal = 0;

    for (const crop of cropsForImage(img)) {
      const tensor = letterboxToTensor(crop);
      const inputName = session.inputNames[0];
      const results = await session.run({ [inputName]: tensor });
      const outputName = session.outputNames[0];
      const parsed = parseYoloOutput(results[outputName]);
      bestCat = Math.max(bestCat, parsed.cat);
      bestAnimal = Math.max(bestAnimal, parsed.animal);
    }

    const detected = bestCat >= CAT_THRESHOLD;
    const possibleAnimal = !detected && bestAnimal >= ANIMAL_THRESHOLD;
    return {
      score: bestCat,
      animalScore: bestAnimal,
      detected,
      possibleAnimal,
      error: false,
    };
  } catch (err) {
    console.warn("Cat check unavailable — server will review the photo.", err);
    return {
      score: null,
      animalScore: null,
      detected: false,
      possibleAnimal: false,
      error: true,
    };
  }
}
