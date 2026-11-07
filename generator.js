// مولّد أسئلة تدريبية حتمي (بدون ذكاء اصطناعي) من النص الفعلي للصفحة.
// كل سؤال يُوسم بـ origin = 'book_generated' وحالة 'needs_review' ويُربط بالصفحة التي جاء منها.
import { normalize, sentences, tokenize } from './arabic.js';
const DEF_PATTERNS = [
    // يُعرَّف X بأنه Y
    /^(?:ي|ت)عرف\s+(.{2,40}?)\s+ب[أا]ن(?:ه|ها|هما)\s+(.{8,240})$/u,
    // X: هو/هي Y   أو  X هو Y
    /^(.{2,40}?)\s*:?\s+(?:هو|هي|هما|هم)\s+(.{8,240})$/u,
    // يُسمى/تُسمى Y بـ X  → المصطلح X
    /^(.{8,200}?)\s+(?:ي|ت)سم[ىي]\s+(?:بـ?)?(.{2,40})$/u,
];
/** تنظيف خفيف يحافظ على شكل الحروف للعرض: حذف التشكيل والتطويل وتوحيد المسافات */
export function cleanForDisplay(s) {
    return s.replace(/[\u064B-\u0652\u0670\u0640]/g, '').replace(/\s+/g, ' ').trim();
}
/** استخراج تعاريف من نص صفحة. نعمل على نص مطبّع للمطابقة ونحفظ الأجزاء من النص الأصلي. */
export function extractDefinitions(text) {
    const out = [];
    for (const raw of sentences(text)) {
        const s = cleanForDisplay(raw).replace(/[.\s]+$/u, '');
        const n = s;
        if (n.length < 15 || n.length > 300)
            continue;
        for (let i = 0; i < DEF_PATTERNS.length; i++) {
            const m = DEF_PATTERNS[i].exec(n);
            if (!m)
                continue;
            let term;
            let definition;
            if (i === 2) {
                term = m[2];
                definition = m[1];
            }
            else {
                term = m[1];
                definition = m[2];
            }
            term = term.replace(/^(إن|ان|أن|أما|اما|و)\s+/u, '').replace(/[:،,]+$/u, '').trim();
            // تجنب مصطلحات تبدأ بضمير أو طويلة جدًا
            if (term.split(' ').length > 5 || /^(هذا|هذه|ذلك|تلك|وهو|وهي|التي|الذي|كما|لذلك|ولذلك)/u.test(term))
                continue;
            if (tokenize(definition).length < 2)
                continue;
            out.push({ term, definition, sentence: s });
            break;
        }
    }
    return out;
}
export function extractReasons(text) {
    const out = [];
    for (const raw of sentences(text)) {
        const s = cleanForDisplay(raw).replace(/[.\s]+$/u, '');
        const m = /^(.{10,200}?)\s*[،,]?\s*(?:وذلك\s+)?(?:لأن|لان|بسبب|نتيج[ةه]\s+ل|بفعل)\s+(.{6,200})$/u.exec(s);
        if (m)
            out.push({ claim: m[1], reason: m[2], sentence: s });
    }
    return out;
}
let counter = 0;
function qid(prefix, page, i) {
    counter++;
    return `${prefix}-${page.bookId}-${page.printedPage}-${i}-${Date.now().toString(36)}${counter}`;
}
/** توليد أسئلة تدريبية من صفحة. pool: مصطلحات من صفحات أخرى لنفس الكتاب لاستخدامها كخيارات خاطئة. */
export function generateFromPage(page, pool = [], now = new Date().toISOString()) {
    const qs = [];
    const defs = extractDefinitions(page.text);
    const link = {
        bookId: page.bookId,
        printedPages: [page.printedPage],
        confidence: 1,
        status: 'confirmed',
        method: 'generated_from_page',
    };
    defs.forEach((d, i) => {
        qs.push({
            id: qid('def', page, i),
            subjectId: page.subjectId,
            bookId: page.bookId,
            origin: 'book_generated',
            type: 'definition',
            prompt: `عرّف: ${d.term}`,
            answer: d.definition,
            keywords: tokenize(d.definition).slice(0, 12),
            explanation: `من نص الصفحة ${page.printedPage}: «${d.sentence}»`,
            links: [link],
            reviewStatus: 'needs_review',
            generatedBy: 'rule-definitions-v1',
            createdAt: now,
        });
        const distractors = uniqueTerms(pool.filter(t => normalize(t) !== normalize(d.term)), 3);
        if (distractors.length === 3) {
            const options = shuffleSeeded([d.term, ...distractors], d.term.length + page.printedPage);
            qs.push({
                id: qid('mcq', page, i),
                subjectId: page.subjectId,
                bookId: page.bookId,
                origin: 'book_generated',
                type: 'mcq',
                prompt: `أي مصطلح يطابق الوصف التالي: «${d.definition}»؟`,
                options,
                answer: d.term,
                explanation: `من نص الصفحة ${page.printedPage}.`,
                links: [link],
                reviewStatus: 'needs_review',
                generatedBy: 'rule-mcq-v1',
                createdAt: now,
            });
        }
        else {
            qs.push({
                id: qid('fill', page, i),
                subjectId: page.subjectId,
                bookId: page.bookId,
                origin: 'book_generated',
                type: 'fill_blank',
                prompt: `أكمل الفراغ: ........ هو ${d.definition}`,
                answer: d.term,
                explanation: `من نص الصفحة ${page.printedPage}.`,
                links: [link],
                reviewStatus: 'needs_review',
                generatedBy: 'rule-fill-v1',
                createdAt: now,
            });
        }
    });
    extractReasons(page.text).forEach((r, i) => {
        qs.push({
            id: qid('rsn', page, i),
            subjectId: page.subjectId,
            bookId: page.bookId,
            origin: 'book_generated',
            type: 'reason',
            prompt: `علّل: ${r.claim}`,
            answer: r.reason,
            keywords: tokenize(r.reason).slice(0, 10),
            explanation: `من نص الصفحة ${page.printedPage}: «${r.sentence}»`,
            links: [link],
            reviewStatus: 'needs_review',
            generatedBy: 'rule-reasons-v1',
            createdAt: now,
        });
    });
    return qs;
}
export function termsFromPages(texts) {
    const terms = [];
    for (const t of texts)
        for (const d of extractDefinitions(t))
            terms.push(d.term);
    return uniqueTerms(terms, 500);
}
function uniqueTerms(list, max) {
    const seen = new Set();
    const out = [];
    for (const t of list) {
        const k = normalize(t);
        if (seen.has(k))
            continue;
        seen.add(k);
        out.push(t);
        if (out.length >= max)
            break;
    }
    return out;
}
export function shuffleSeeded(arr, seed) {
    const a = [...arr];
    let s = seed || 1;
    for (let i = a.length - 1; i > 0; i--) {
        s = (s * 9301 + 49297) % 233280;
        const j = Math.floor((s / 233280) * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
