/** Client-side cat check (blocks wizard until a cat is detected; server enforces too). */

const THRESHOLD = 0.2;
const CROP_SCALES = [1.0, 0.5, 0.35, 0.25];
const CROP_GRID = 3;
const EARLY_EXIT_SCORE = 0.5;

let modelPromise = null;

async function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      await import("@tensorflow/tfjs-backend-webgl");
      await tf.setBackend("webgl");
      await tf.ready();
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      return cocoSsd.load({ base: "mobilenet_v2" });
    })();
  }
  return modelPromise;
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

async function scoreImage(model, source) {
  const predictions = await model.detect(source);
  let best = 0;
  for (const p of predictions) {
    if (p.class === "cat") {
      best = Math.max(best, p.score);
    }
  }
  return best;
}

async function scanImage(model, img) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  let best = await scoreImage(model, img);
  if (best >= EARLY_EXIT_SCORE) {
    return best;
  }

  for (const scale of CROP_SCALES) {
    const cropSize = Math.max(64, Math.floor(Math.min(w, h) * scale));
    const maxX = Math.max(0, w - cropSize);
    const maxY = Math.max(0, h - cropSize);
    for (let row = 0; row < CROP_GRID; row++) {
      for (let col = 0; col < CROP_GRID; col++) {
        const left = maxX > 0 ? Math.floor((maxX * col) / (CROP_GRID - 1)) : 0;
        const top = maxY > 0 ? Math.floor((maxY * row) / (CROP_GRID - 1)) : 0;
        canvas.width = cropSize;
        canvas.height = cropSize;
        ctx.drawImage(img, left, top, cropSize, cropSize, 0, 0, cropSize, cropSize);
        best = Math.max(best, await scoreImage(model, canvas));
        if (best >= EARLY_EXIT_SCORE) {
          return best;
        }
      }
    }
  }
  return best;
}

/**
 * @returns {Promise<{ score: number, detected: boolean }>}
 */
export async function checkForCat(file) {
  try {
    const model = await loadModel();
    const img = await fileToImage(file);
    const score = await scanImage(model, img);
    return { score, detected: score >= THRESHOLD };
  } catch {
    // Fail open — server is authoritative.
    return { score: null, detected: true };
  }
}
