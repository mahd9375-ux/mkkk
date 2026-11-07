// تقييم جودة النص المستخرج من PDF وإصلاح الحالات الشائعة (أشكال العرض العربية، النص المعكوس).
import { normalize } from './arabic.js';
const COMMON = new Set(['من', 'في', 'علي', 'الي', 'ان', 'التي', 'الذي', 'هذا', 'هذه', 'عن', 'مع', 'كما', 'او', 'هو', 'هي', 'ما', 'لا', 'كل', 'بين', 'ذلك']);
function arabicTokens(s) {
    return normalize(s).split(/[^؀-ۿ]+/u).filter(t => t.length >= 2);
}
export function commonWordRatio(s) {
    const toks = arabicTokens(s);
    if (toks.length === 0)
        return 0;
    return toks.filter(t => COMMON.has(t)).length / toks.length;
}
function reverseLines(s) {
    return s
        .split('\n')
        .map(line => [...line].reverse().join(''))
        .join('\n');
}
/** تنظيف نص صفحة مستخرج من طبقة النص في PDF */
export function assessExtractedText(raw) {
    // NFKC يحوّل أشكال العرض العربية (FB50–FEFF) إلى الحروف الأساسية
    let text = raw.normalize('NFKC').replace(/[‎‏‪-‮]/g, '').replace(/[ \t]+/g, ' ').trim();
    const arabicLetters = (text.match(/[؀-ۿ]/g) || []).length;
    const latinLetters = (text.match(/[A-Za-z]/g) || []).length;
    if (arabicLetters + latinLetters < 20)
        return { text, status: 'empty', note: 'لا توجد طبقة نص كافية؛ الصفحة غالبًا مصورة وتحتاج OCR.' };
    if (arabicLetters < latinLetters)
        return { text, status: 'ok' }; // صفحة إنكليزية
    // بعض ملفات PDF تكتب ربط «لا» معكوسًا «ال». الإصلاح الآمن الوحيد: «ال» ككلمة مستقلة → «لا».
    const standalone = /(?<![\u0600-\u06FF])ال(?![\u0600-\u06FF])/gu;
    const lamAlef = (text.match(standalone) || []).length;
    if (lamAlef)
        text = text.replace(standalone, 'لا');
    const toks = arabicTokens(text);
    const ratio = commonWordRatio(text);
    if (toks.length >= 15 && ratio < 0.06) {
        const rev = reverseLines(text);
        if (commonWordRatio(rev) > ratio * 2 && commonWordRatio(rev) >= 0.06) {
            text = rev;
            return { text, status: 'low_quality', note: 'النص كان معكوس الاتجاه وتم قلبه آليًا؛ راجع الصفحة.' };
        }
        return { text, status: 'low_quality', note: 'النص المستخرج يبدو مشوهًا؛ جرّب OCR أو راجع يدويًا.' };
    }
    if (lamAlef)
        return { text, status: 'low_quality', note: 'ربط «لا» كان معكوسًا في طبقة النص؛ صُحّحت الحالات المستقلة فقط. راجع الكلمات التي تحتوي «ال» في وسطها (مثل «الموصالت» ← «الموصلات»).' };
    return { text, status: 'ok' };
}
/** حالة صفحة OCR حسب الثقة */
export function ocrStatus(text, confidence) {
    if (!text.trim())
        return 'empty';
    if (confidence < 50)
        return 'failed';
    if (confidence < 75)
        return 'low_quality';
    return 'ok';
}
