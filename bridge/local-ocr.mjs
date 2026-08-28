import { createWorker, OEM } from "tesseract.js";
import chiSimData from "@tesseract.js-data/chi_sim";

let workerPromise;

async function getWorker() {
  workerPromise ??= createWorker("chi_sim", OEM.LSTM_ONLY, {
    langPath: chiSimData.langPath,
    cacheMethod: "readOnly",
    errorHandler: () => {},
  });
  return workerPromise;
}

export async function extractLocalText(imageBytes) {
  const worker = await getWorker();
  const { data } = await worker.recognize(imageBytes);
  const text = String(data?.text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4_000);
  return {
    text,
    confidence: Math.max(0, Math.min(1, Number(data?.confidence ?? 0) / 100)),
  };
}
