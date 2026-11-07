import { textHash } from './arabic.js';
const SECTION_KINDS = new Set(['idea', 'explain', 'definitions', 'reasons', 'laws', 'comparisons', 'memorize', 'mistakes', 'unreadable']);
async function call(cfg, path, body) {
    if (!cfg.endpoint)
        throw new Error('لم يتم ضبط عنوان الخادم الوسيط في الإعدادات.');
    const res = await fetch(cfg.endpoint.replace(/\/$/, '') + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
        throw new Error(data.error || `خطأ من الخادم (${res.status})`);
    return data;
}
/** يتحقق من بنية الملخص القادم من النموذج ويرفض أي شكل غير متوقع */
export function sanitizeSummary(raw) {
    const r = raw;
    if (!r || typeof r.topic !== 'string' || !Array.isArray(r.sections))
        throw new Error('رد غير صالح من النموذج');
    const sections = [];
    for (const s of r.sections) {
        if (!s || typeof s.kind !== 'string' || !SECTION_KINDS.has(s.kind))
            continue;
        const items = Array.isArray(s.items) ? s.items.filter((x) => typeof x === 'string' && x.trim().length > 0) : [];
        if (!items.length)
            continue;
        sections.push({ kind: s.kind, title: typeof s.title === 'string' ? s.title : '', items: items.slice(0, 30) });
    }
    return { topic: r.topic.slice(0, 200), sections };
}
export async function aiSummarize(cfg, ctx) {
    const res = await call(cfg, '/v1/summarize', ctx);
    const { topic, sections } = sanitizeSummary(res.summary);
    return {
        id: `${ctx.bookId}:${ctx.printedPage}`,
        bookId: ctx.bookId,
        printedPage: ctx.printedPage,
        topic,
        sections,
        origin: 'ai',
        model: res.model,
        generatedAt: new Date().toISOString(),
        reviewStatus: 'needs_review',
        sourcePageTextHash: textHash(ctx.text),
    };
}
export async function aiQuestions(cfg, ctx) {
    const res = await call(cfg, '/v1/questions', ctx);
    const now = new Date().toISOString();
    const out = [];
    const allowed = new Set(['mcq', 'true_false', 'fill_blank', 'definition', 'reason', 'compare', 'short', 'calc', 'explain']);
    (res.questions || []).forEach((q, i) => {
        const x = q;
        if (typeof x.prompt !== 'string' || typeof x.answer !== 'string' || typeof x.type !== 'string' || !allowed.has(x.type))
            return;
        const options = Array.isArray(x.options) ? x.options.filter((o) => typeof o === 'string') : undefined;
        if (x.type === 'mcq' && (!options || options.length < 2 || !options.includes(x.answer)))
            return;
        out.push({
            id: `ai-${ctx.bookId}-${ctx.printedPage}-${i}-${Date.now().toString(36)}`,
            subjectId: ctx.subjectId,
            bookId: ctx.bookId,
            origin: 'book_generated',
            type: x.type,
            prompt: x.prompt,
            options,
            answer: x.answer,
            keywords: Array.isArray(x.keywords) ? x.keywords.filter((k) => typeof k === 'string') : undefined,
            unit: typeof x.unit === 'string' ? x.unit : undefined,
            explanation: typeof x.explanation === 'string' ? x.explanation : undefined,
            links: [{ bookId: ctx.bookId, printedPages: [ctx.printedPage], confidence: 1, status: 'confirmed', method: 'generated_from_page' }],
            reviewStatus: 'needs_review',
            generatedBy: res.model,
            createdAt: now,
        });
    });
    return out;
}
