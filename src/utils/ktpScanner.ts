import * as ort from 'onnxruntime-web';
import Tesseract from 'tesseract.js';
import { OnnxRunQueue } from './onnxRunQueue';

// ── Config ────────────────────────────────────────────────────────────────────
const CLASSES: Record<number, string> = {
  0: 'agama', 1: 'alamat', 2: 'berlaku_hingga', 3: 'golongan_darah',
  4: 'jenis_kelamin', 5: 'kecamatan', 6: 'kelurahan_desa',
  7: 'kewarganegaraan', 8: 'kota_kabupaten', 9: 'ktp',
  10: 'nama', 11: 'nik', 12: 'pekerjaan', 13: 'provinsi',
  14: 'rt_rw', 15: 'status_perkawinan', 16: 'tempat_tanggal_lahir'
};

const OCR_FIELDS = new Set([
  'nik', 'nama', 'alamat', 'rt_rw', 'kelurahan_desa', 'kecamatan',
  'agama', 'jenis_kelamin', 'golongan_darah', 'tempat_tanggal_lahir',
  'pekerjaan', 'kewarganegaraan', 'status_perkawinan', 'berlaku_hingga'
]);

const TESS_CONFIG: Record<string, Partial<Tesseract.RecognizeOptions>> = {
  nik: { tessedit_char_whitelist: '0123456789' },
  rt_rw: { tessedit_char_whitelist: '0123456789/' },
  default: { tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,-/' }, // Huruf kapital KTP
};

// ── Session & Queue ───────────────────────────────────────────────────────────
let session: ort.InferenceSession | null = null;
const runQueue = new OnnxRunQueue();

async function getSession() {
  if (session) return session;

  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
  session = await ort.InferenceSession.create('/models/ektp_detector.onnx', {
    executionProviders: ['wasm'],
  });
  return session;
}

// ── Preprocess ────────────────────────────────────────────────────────────────
interface LetterboxInfo {
  padX: number;
  padY: number;
  scale: number;
}

async function imageToTensor(canvas: HTMLCanvasElement): Promise<{ tensor: ort.Tensor, info: LetterboxInfo }> {
  const W = canvas.width;
  const H = canvas.height;
  const scale = Math.min(640 / W, 640 / H);
  const newW = Math.round(W * scale);
  const newH = Math.round(H * scale);
  const padX = (640 - newW) / 2;
  const padY = (640 - newH) / 2;

  const resized = document.createElement('canvas');
  resized.width = 640;
  resized.height = 640;
  const ctx = resized.getContext('2d')!;

  ctx.fillStyle = '#747474';
  ctx.fillRect(0, 0, 640, 640);
  ctx.drawImage(canvas, 0, 0, W, H, padX, padY, newW, newH);

  const imgData = ctx.getImageData(0, 0, 640, 640).data;
  const float32 = new Float32Array(3 * 640 * 640);

  for (let i = 0; i < 640 * 640; i++) {
    float32[i] = imgData[i * 4] / 255.0;
    float32[i + 640 * 640] = imgData[i * 4 + 1] / 255.0;
    float32[i + 2 * 640 * 640] = imgData[i * 4 + 2] / 255.0;
  }

  return {
    tensor: new ort.Tensor('float32', float32, [1, 3, 640, 640]),
    info: { padX, padY, scale }
  };
}

function iou(b1: number[], b2: number[]) {
  const ix1 = Math.max(b1[0], b2[0]), iy1 = Math.max(b1[1], b2[1]);
  const ix2 = Math.min(b1[2], b2[2]), iy2 = Math.min(b1[3], b2[3]);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const a1 = (b1[2] - b1[0]) * (b1[3] - b1[1]);
  const a2 = (b2[2] - b2[0]) * (b2[3] - b2[1]);
  return inter / (a1 + a2 - inter + 1e-6);
}

function nms(dets: any[], iouThr = 0.45) {
  dets.sort((a, b) => b.conf - a.conf);
  const kept: any[] = [];
  while (dets.length) {
    const best = dets.shift();
    kept.push(best);
    dets = dets.filter(d => iou(best.box, d.box) < iouThr);
  }
  return kept;
}

async function detectFields(canvas: HTMLCanvasElement) {
  const sess = await getSession();
  const { tensor, info } = await imageToTensor(canvas);

  const output = await runQueue.enqueue(() => sess.run({ images: tensor }));
  const data = output['output0'].data as Float32Array;

  const numDet = 8400;
  const numCols = Object.keys(CLASSES).length + 4;

  const dets: any[] = [];
  for (let i = 0; i < numDet; i++) {
    let maxConf = 0, maxCls = 0;
    for (let c = 0; c < Object.keys(CLASSES).length; c++) {
      const conf = data[(c + 4) * numDet + i];
      if (conf > maxConf) { maxConf = conf; maxCls = c; }
    }

    if (maxConf < 0.25) continue;

    const cx = (data[0 * numDet + i] - info.padX) / info.scale;
    const cy = (data[1 * numDet + i] - info.padY) / info.scale;
    const bw = (data[2 * numDet + i]) / info.scale;
    const bh = (data[3 * numDet + i]) / info.scale;

    dets.push({
      box: [
        Math.round(cx - bw / 2),
        Math.round(cy - bh / 2),
        Math.round(cx + bw / 2),
        Math.round(cy + bh / 2),
      ],
      conf: maxConf,
      cls: maxCls,
      name: CLASSES[maxCls] ?? `cls_${maxCls}`,
    });
  }

  return nms(dets);
}

function cropAndPreprocess(srcCanvas: HTMLCanvasElement, box: number[]): HTMLCanvasElement {
  const [x1, y1, x2, y2] = box;
  const pad = 6;
  const srcX = Math.max(0, x1 - pad);
  const srcY = Math.max(0, y1 - pad);
  const srcW = Math.min(srcCanvas.width, x2 + pad) - srcX;
  const srcH = Math.min(srcCanvas.height, y2 + pad) - srcY;

  const scale = 3;
  const canvas = document.createElement('canvas');
  canvas.width = srcW * scale;
  canvas.height = srcH * scale;
  const ctx = canvas.getContext('2d')!;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(srcCanvas, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  const w = canvas.width;
  const h = canvas.height;

  // 1. Grayscale
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  }

  // 2. Denoise (Box Blur 3x3)
  const blurred = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      sum += gray[(y - 1) * w + x - 1] + gray[(y - 1) * w + x] + gray[(y - 1) * w + x + 1];
      sum += gray[y * w + x - 1]     + gray[y * w + x]     + gray[y * w + x + 1];
      sum += gray[(y + 1) * w + x - 1] + gray[(y + 1) * w + x] + gray[(y + 1) * w + x + 1];
      blurred[y * w + x] = sum / 9;
    }
  }
  for (let x = 0; x < w; x++) { blurred[x] = gray[x]; blurred[(h - 1) * w + x] = gray[(h - 1) * w + x]; }
  for (let y = 0; y < h; y++) { blurred[y * w] = gray[y * w]; blurred[y * w + w - 1] = gray[y * w + w - 1]; }

  // Unsharp Mask (Sharpen)
  const sharpened = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    let val = gray[i] + (gray[i] - blurred[i]) * 1.5;
    sharpened[i] = Math.min(255, Math.max(0, val));
  }

  // 3. Integral Image (Adaptive Thresholding basis)
  const intImg = new Float32Array(w * h);
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      let sum = sharpened[j * w + i];
      if (i > 0) sum += intImg[j * w + i - 1];
      if (j > 0) sum += intImg[(j - 1) * w + i];
      if (i > 0 && j > 0) sum -= intImg[(j - 1) * w + i - 1];
      intImg[j * w + i] = sum;
    }
  }

  // 4. Bradley-Roth Adaptive Thresholding
  const s = Math.floor(w / 8);
  const s2 = Math.floor(s / 2);
  const t = 15;

  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      const x1 = Math.max(i - s2, 0);
      const x2 = Math.min(i + s2, w - 1);
      const y1 = Math.max(j - s2, 0);
      const y2 = Math.min(j + s2, h - 1);

      const count = (x2 - x1 + 1) * (y2 - y1 + 1);

      let sum = intImg[y2 * w + x2];
      if (y1 > 0) sum -= intImg[(y1 - 1) * w + x2];
      if (x1 > 0) sum -= intImg[y2 * w + x1 - 1];
      if (x1 > 0 && y1 > 0) sum += intImg[(y1 - 1) * w + x1 - 1];

      const value = (sharpened[j * w + i] * count) < (sum * ((100 - t) / 100)) ? 0 : 255;

      const idx = (j * w + i) * 4;
      d[idx] = value;
      d[idx + 1] = value;
      d[idx + 2] = value;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

async function ocrROI(canvas: HTMLCanvasElement, fieldName: string): Promise<string> {
  const config = TESS_CONFIG[fieldName] ?? TESS_CONFIG.default;
  const result = await Tesseract.recognize(canvas, 'ind+eng', {
    ...config,
  } as any);

  let text = result.data.text.trim().replace(/\s+/g, ' ');

  if (fieldName === 'nik') {
    text = text.replace(/[OoDdIilSsBbGg]/g, (c) =>
      ({ O: '0', o: '0', D: '0', d: '0', I: '1', i: '1', l: '1', S: '5', s: '5', B: '8', G: '6', g: '6' }[c] ?? c)
    ).replace(/\D/g, '');
  } else if (fieldName === 'jenis_kelamin') {
    const t = text.toUpperCase();
    if (t.includes('PEREMPUAN') || t.includes('WANITA')) return 'PEREMPUAN';
    if (t.includes('LAKI') || t.includes('PRIA')) return 'LAKI-LAKI';
  } else if (fieldName === 'tempat_tanggal_lahir') {
    const dm = text.match(/(\d{1,2}[-/.\s]\d{1,2}[-/.\s]\d{4})/);
    if (dm) {
      const tgl = dm[1].replace(/\s/g, '-');
      const tmp = text.slice(0, text.indexOf(dm[1])).replace(/[,.\-\s]+$/, '').trim();
      return JSON.stringify({ tmp_lahir: tmp.toUpperCase(), tgl_lahir: tgl });
    }
  }

  return text.toUpperCase().replace(/[^\w\s.\-\/,]/g, '').trim();
}

// ── Exported Functions ────────────────────────────────────────────────────────
export interface KTPFields {
  nik?: string; nama?: string; tmp_lahir?: string; tgl_lahir?: string;
  jenis_kelamin?: string; golongan_darah?: string; alamat?: string;
  rt_rw?: string; kelurahan_desa?: string; kecamatan?: string;
  agama?: string; status_perkawinan?: string; pekerjaan?: string;
  kewarganegaraan?: string; berlaku_hingga?: string;
}

export async function scanKTP(
  input: string | HTMLCanvasElement,
  onProgress?: (step: string) => void
): Promise<KTPFields> {
  let canvas: HTMLCanvasElement;

  if (typeof input === 'string') {
    const img = new Image();
    img.src = input;
    await new Promise(r => img.onload = r);
    canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
  } else {
    canvas = input;
  }

  onProgress?.('Mendeteksi lokasi data KTP (ONNX)...');
  const detections = await detectFields(canvas);

  onProgress?.('Ekstraksi teks (OCR)...');
  const fields: KTPFields = {};

  // Jalankan crop & OCR paralel tiap box yang terdeteksi
  await Promise.all(
    detections
      .filter(d => OCR_FIELDS.has(d.name))
      .map(async (det) => {
        const roi = cropAndPreprocess(canvas, det.box);
        const text = await ocrROI(roi, det.name);
        if (!text) return;

        if (det.name === 'tempat_tanggal_lahir') {
          try {
            const parsed = JSON.parse(text);
            Object.assign(fields, parsed);
          } catch {
            fields.tmp_lahir = text;
          }
          return;
        }
        (fields as any)[det.name] = text;
      })
  );

  return fields;
}