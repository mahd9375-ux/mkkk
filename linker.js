// اقتراح ربط سؤال بصفحات الكتاب عبر تطابق المصطلحات (TF-IDF مبسط).
// النتيجة «اقتراح» فقط؛ الربط لا يصبح مؤكدًا إلا بمراجعة بشرية.
import { jaccard, tokenize } from './arabic.js';
export function buildIndex(pages) {
    const docs = pages.map(p => ({ page: p.printedPage, tokens: tokenize(p.text) }));
    const df = new Map();
    for (const d of docs)
        for (const t of new Set(d.tokens))
            df.set(t, (df.get(t) ?? 0) + 1);
    const N = docs.length || 1;
    const idf = (t) => Math.log(1 + N / (df.get(t) ?? 0.5));
    const tf = docs.map(d => {
        const m = new Map();
        for (const t of d.tokens)
            m.set(t, (m.get(t) ?? 0) + 1);
        return { page: d.page, m, len: d.tokens.length || 1 };
    });
    return { idf, tf, N };
}
export function suggestLinks(questionText, pages) {
    const qTokens = [...new Set(tokenize(questionText))];
    if (qTokens.length === 0 || pages.length === 0) {
        return { printedPages: [], confidence: 0, level: 'none', reason: 'لا يوجد نص كافٍ للمقارنة.', topTerms: [] };
    }
    const { idf, tf } = buildIndex(pages);
    const scored = tf
        .map(d => {
        let s = 0;
        const hits = [];
        for (const t of qTokens) {
            const c = d.m.get(t);
            if (c) {
                s += (1 + Math.log(c)) * idf(t);
                hits.push(t);
            }
        }
        return { page: d.page, score: s, hits };
    })
        .sort((a, b) => b.score - a.score);
    const maxPossible = qTokens.reduce((acc, t) => acc + idf(t) * 2, 0) || 1;
    const best = scored[0];
    if (!best || best.score === 0) {
        return { printedPages: [], confidence: 0, level: 'none', reason: 'لم نجد مصطلحات مشتركة مع صفحات الكتاب.', topTerms: [] };
    }
    const conf = Math.min(1, best.score / maxPossible);
    const close = scored.filter(s => s.score >= best.score * 0.8).map(s => s.page);
    const coverageRatio = best.hits.length / qTokens.length;
    if (coverageRatio < 0.3 || conf < 0.15) {
        return {
            printedPages: [],
            confidence: conf,
            level: 'chapter_or_topic',
            reason: 'الدليل غير كافٍ لربط السؤال بصفحة محددة؛ يُعرض على مستوى الفصل أو الموضوع حتى المراجعة.',
            topTerms: best.hits.slice(0, 8),
        };
    }
    if (close.length > 1) {
        const sorted = close.slice(0, 4).sort((a, b) => a - b);
        return {
            printedPages: sorted,
            confidence: conf * 0.8,
            level: 'pages',
            reason: 'السؤال يتطابق مع عدة صفحات بدرجة متقاربة.',
            topTerms: best.hits.slice(0, 8),
        };
    }
    return { printedPages: [best.page], confidence: conf, level: 'page', reason: 'أعلى تطابق في المصطلحات.', topTerms: best.hits.slice(0, 8) };
}
/** تجميع الأسئلة المتشابهة دون حذف أي ظهور */
export function groupSimilar(items, threshold = 0.6) {
    const groups = new Map();
    const toks = items.map(i => ({ id: i.id, t: tokenize(i.text) }));
    for (let i = 0; i < toks.length; i++) {
        if (groups.has(toks[i].id))
            continue;
        groups.set(toks[i].id, toks[i].id);
        for (let j = i + 1; j < toks.length; j++) {
            if (groups.has(toks[j].id))
                continue;
            if (jaccard(toks[i].t, toks[j].t) >= threshold)
                groups.set(toks[j].id, toks[i].id);
        }
    }
    return groups;
}
/** الحد الأدنى من الأسئلة الموثقة قبل عرض أي إحصائية تكرار */
export const MIN_VERIFIED_FOR_STATS = 30;
