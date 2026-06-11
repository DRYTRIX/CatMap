/** Client-side cat check via COCO object detection (server enforces too). */

const THRESHOLD = 0.2;

let modelPromise = null;

async function initBackend(tf) {
  try {
    await import("@tensorflow/tfjs-backend-webgl");
    await tf.setBackend("webgl");
    await tf.ready();
  } catch (err) {
    console.warn("Cat check: WebGL backend failed, falling back to CPU.", err);
    await import("@tensorflow/tfjs-backend-cpu");
    await tf.setBackend("cpu");
    await tf.ready();
  }
}

async function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      await initBackend(tf);
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      return cocoSsd.load({ base: "lite_mobilenet_v2" });
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

async function catScore(model, target) {
  const predictions = await model.detect(target);
  let best = 0;
  for (const p of predictions) {
    if (p.class === "cat") {
      best = Math.max(best, p.score);
    }
  }
  return best;
}

/**
 * @returns {Promise<{ score: number | null, detected: boolean, error?: boolean }>}
 */
export async function checkForCat(file) {
  try {
    const model = await loadModel();
    const img = await fileToImage(file);
    let best = 0;
    for (const crop of cropsForImage(img)) {
      best = Math.max(best, await catScore(model, crop));
    }
    return { score: best, detected: best >= THRESHOLD };
  } catch (err) {
    console.warn("Cat check failed — blocking until a photo can be verified.", err);
    return { score: null, detected: false, error: true };
  }
}
