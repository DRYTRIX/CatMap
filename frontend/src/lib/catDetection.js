/** Client-side cat check (blocks wizard until a cat is detected; server enforces too). */

const THRESHOLD = 0.2;

let modelPromise = null;

function isCatLabel(className) {
  const name = className.toLowerCase();
  if (name.includes("catamaran")) return false;
  return (
    name.includes("tabby") ||
    name.includes("tiger cat") ||
    name.includes("persian cat") ||
    name.includes("siamese cat") ||
    name.includes("egyptian cat")
  );
}

function scorePredictions(predictions) {
  let best = 0;
  for (const p of predictions) {
    if (isCatLabel(p.className)) {
      best = Math.max(best, p.probability);
    }
  }
  return best;
}

async function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      await import("@tensorflow/tfjs-backend-webgl");
      await tf.setBackend("webgl");
      await tf.ready();
      const mobilenet = await import("@tensorflow-models/mobilenet");
      return mobilenet.load({ version: 2, alpha: 1.0 });
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

/**
 * @returns {Promise<{ score: number, detected: boolean }>}
 */
export async function checkForCat(file) {
  try {
    const model = await loadModel();
    const img = await fileToImage(file);
    const predictions = await model.classify(img, 5);
    const score = scorePredictions(predictions);
    return { score, detected: score >= THRESHOLD };
  } catch {
    // Fail open — server is authoritative.
    return { score: null, detected: true };
  }
}
