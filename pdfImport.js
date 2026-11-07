// استيراد ملفات PDF واستخراج النص وOCR — يعمل بالكامل داخل متصفح المستخدم.
// المكتبات تُحمَّل عند الحاجة فقط من CDN بنسخ مثبتة (pdf.js من cdnjs، Tesseract.js من jsdelivr).
// لا يُرسل أي ملف أو صورة إلى خادم؛ يتم تنزيل نماذج اللغة فقط عند أول استخدام لـ OCR.
import { assessExtractedText, ocrStatus } from './textQuality.js';
export const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';
export const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
export const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
export const MAX_PDF_BYTES = 200 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
let pdfjsPromise = null;
export function loadPdfJs() {
    if (!pdfjsPromise) {
        pdfjsPromise = import(/* @vite-ignore */ PDFJS_URL).then((m) => {
            m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
            return m;
        });
        pdfjsPromise.catch(() => (pdfjsPromise = null));
    }
    return pdfjsPromise;
}
let tesseractPromise = null;
export function loadTesseract() {
    if (!tesseractPromise) {
        tesseractPromise = new Promise((resolve, reject) => {
            const w = window;
            if (w.Tesseract)
                return resolve(w.Tesseract);
            const s = document.createElement('script');
            s.src = TESSERACT_URL;
            s.crossOrigin = 'anonymous';
            s.onload = () => (w.Tesseract ? resolve(w.Tesseract) : reject(new Error('تعذّر تحميل Tesseract')));
            s.onerror = () => reject(new Error('تعذّر تحميل مكتبة OCR (تحقق من الاتصال)'));
            document.head.appendChild(s);
        });
        tesseractPromise.catch(() => (tesseractPromise = null));
    }
    return tesseractPromise;
}
export async function sha256Hex(buf) {
    const h = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
/** فحص ترويسة الملف: يجب أن يبدأ بـ %PDF- */
export function isPdfHeader(buf) {
    const b = new Uint8Array(buf.slice(0, 5));
    return String.fromCharCode(...b) === '%PDF-';
}
export function isImageHeader(buf) {
    const b = new Uint8Array(buf.slice(0, 12));
    const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    const webp = String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
    return png || jpg || webp;
}
export async function openPdf(data) {
    const pdfjs = await loadPdfJs();
    // نمرر نسخة لأن pdf.js ينقل ملكية المخزن إلى الـ worker
    // isEvalSupported:false — لا تنفيذ لأي شيفرة من داخل الملف
    return pdfjs.getDocument({ data: data.slice(0), isEvalSupported: false, enableXfa: false }).promise;
}
/** استخراج نص صفحة من طبقة النص مع إعادة بناء الأسطر */
export async function extractPageText(doc, pageIndex) {
    const page = await doc.getPage(pageIndex);
    const content = await page.getTextContent();
    const lines = new Map();
    for (const it of content.items) {
        if (!it.str)
            continue;
        const y = Math.round(it.transform[5] / 3) * 3;
        if (!lines.has(y))
            lines.set(y, []);
        lines.get(y).push({ x: it.transform[4], s: it.str });
    }
    const ordered = [...lines.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, parts]) => {
        const ar = parts.some(p => /[؀-ۿ]/.test(p.s));
        // للعربية: من اليمين إلى اليسار
        parts.sort((a, b) => (ar ? b.x - a.x : a.x - b.x));
        return parts.map(p => p.s).join(' ');
    });
    page.cleanup();
    return assessExtractedText(ordered.join('\n'));
}
export async function renderPageToCanvas(doc, pageIndex, scale = 2) {
    const page = await doc.getPage(pageIndex);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    page.cleanup();
    return canvas;
}
let ocrWorker = null;
let ocrLangs = '';
export async function getOcrWorker(langs = 'ara+eng', onProgress) {
    const T = await loadTesseract();
    if (ocrWorker && ocrLangs === langs)
        return ocrWorker;
    if (ocrWorker)
        await ocrWorker.terminate();
    ocrWorker = await T.createWorker(langs, 1, {
        logger: (m) => onProgress?.(m.progress, m.status),
    });
    ocrLangs = langs;
    return ocrWorker;
}
export async function terminateOcr() {
    if (ocrWorker)
        await ocrWorker.terminate();
    ocrWorker = null;
}
export async function ocrImage(image, langs = 'ara+eng', onProgress) {
    const w = await getOcrWorker(langs, onProgress);
    const { data } = await w.recognize(image);
    const text = (data.text || '').normalize('NFKC').trim();
    const confidence = typeof data.confidence === 'number' ? data.confidence : 0;
    return { text, confidence, status: ocrStatus(text, confidence) };
}
