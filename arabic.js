// أدوات معالجة النص العربي (بدون اعتماديات)
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
/** تحويل الأرقام العربية-الهندية والفارسية إلى أرقام لاتينية */
export function toLatinDigits(s) {
    let out = '';
    for (const ch of s) {
        const a = ARABIC_INDIC.indexOf(ch);
        const p = PERSIAN.indexOf(ch);
        out += a >= 0 ? String(a) : p >= 0 ? String(p) : ch;
    }
    return out;
}
/** توحيد الكتابة لأغراض المطابقة فقط (لا يُستخدم لعرض النص) */
export function normalize(s) {
    return toLatinDigits(s)
        .replace(/[ً-ْٰـ]/g, '') // تشكيل وتطويل
        .replace(/[إأآٱ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/[گ]/g, 'ك')
        .replace(/[چ]/g, 'ج')
        .replace(/[ڤ]/g, 'ف')
        .replace(/[،؛؟]/g, m => (m === '،' ? ',' : m === '؛' ? ';' : '?'))
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}
export const STOPWORDS = new Set([
    'في', 'من', 'على', 'الى', 'الي', 'عن', 'مع', 'هو', 'هي', 'ان', 'او', 'ثم', 'كل', 'ما', 'لا', 'لم', 'لن', 'قد',
    'هذا', 'هذه', 'ذلك', 'تلك', 'التي', 'الذي', 'الذين', 'كان', 'كانت', 'يكون', 'تكون', 'بين', 'عند', 'اذا', 'به',
    'بها', 'له', 'لها', 'و', 'ف', 'ب', 'ل', 'ك', 'اي', 'كما', 'حيث', 'ايضا', 'غير', 'بعض', 'عندما', 'منها', 'فيها',
    'the', 'a', 'an', 'of', 'to', 'in', 'is', 'are', 'and', 'or', 'for', 'on', 'with', 'by', 'be', 'as', 'at', 'it',
].map(normalize));
/** إزالة السوابق الشائعة (ال، وال، بال، كال، فال، لل) بشكل خفيف */
export function lightStem(token) {
    let t = token;
    for (const p of ['وال', 'بال', 'كال', 'فال', 'لل', 'ال']) {
        if (t.startsWith(p) && t.length - p.length >= 3) {
            t = t.slice(p.length);
            break;
        }
    }
    if (t.length > 4 && (t.endsWith('ات') || t.endsWith('ين') || t.endsWith('ون')))
        t = t.slice(0, -2);
    if (t.length > 3 && t.endsWith('ه'))
        t = t.slice(0, -1);
    return t;
}
export function tokenize(s) {
    // بعض ملفات PDF تكتب ربط «لا» معكوسًا «ال»؛ نوحّد الاثنين في المطابقة فقط حتى يجد البحث الكلمة في الحالتين.
    return normalize(s)
        .replace(/لا/g, 'ال')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .filter(t => !STOPWORDS.has(t))
        .map(lightStem)
        .filter(t => t.length >= 2);
}
/** تشابه جاكارد بين مجموعتي كلمات */
export function jaccard(a, b) {
    const A = new Set(a);
    const B = new Set(b);
    if (A.size === 0 && B.size === 0)
        return 1;
    let inter = 0;
    for (const x of A)
        if (B.has(x))
            inter++;
    return inter / (A.size + B.size - inter);
}
/** نسبة تغطية كلمات المرجع داخل الإجابة */
export function coverage(reference, answer) {
    const R = new Set(reference);
    if (R.size === 0)
        return 0;
    const A = new Set(answer);
    let hit = 0;
    for (const x of R)
        if (A.has(x))
            hit++;
    return hit / R.size;
}
/** بصمة بسيطة لنص (FNV-1a) لاكتشاف تغيّر نص الصفحة؛ ليست بديلًا عن SHA-256 للملفات */
export function textHash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}
/** تقسيم النص إلى جمل */
export function sentences(text) {
    return text
        .replace(/\r/g, '')
        .split(/(?<=[.!؟?:])\s+|\n+/u)
        .map(s => s.trim())
        .filter(s => s.length > 0);
}
export function isMostlyArabic(s) {
    const ar = (s.match(/[؀-ۿ]/g) || []).length;
    const lat = (s.match(/[A-Za-z]/g) || []).length;
    return ar >= lat;
}
