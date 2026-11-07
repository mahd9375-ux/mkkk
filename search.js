// البحث داخل الكتب المستوردة والملخصات والأسئلة — مطابقة عربية موحدة (همزات، تاء مربوطة، «ال»).
import { normalize, sentences, tokenize } from './arabic.js';
/** مقتطف ≤180 حرفًا يتمركز حول أول كلمة مطابقة (لا يقطع الجملة قبل موضع المطابقة) */
function clip(s, qTokens) {
    if (s.length <= 180)
        return s;
    const words = s.split(/(\s+)/);
    let pos = 0, at = 0;
    for (const w of words) {
        if (w.trim() && tokenize(w).some(t => qTokens.has(t))) {
            at = pos;
            break;
        }
        pos += w.length;
    }
    const start = Math.max(0, Math.min(at - 60, s.length - 177));
    return (start > 0 ? '…' : '') + s.slice(start, start + 177).trim() + (start + 177 < s.length ? '…' : '');
}
function bestSnippet(text, qTokens, phrase) {
    let best = { snippet: '', score: 0 };
    for (const s of sentences(text)) {
        const toks = tokenize(s);
        let hit = 0;
        for (const t of new Set(toks))
            if (qTokens.has(t))
                hit++;
        if (!hit)
            continue;
        const bonus = phrase && normalize(s).includes(phrase) ? qTokens.size : 0;
        if (hit + bonus > best.score)
            best = { snippet: clip(s, qTokens), score: hit + bonus };
    }
    return best;
}
export function searchContent(query, data, opts = {}) {
    const qTokens = new Set(tokenize(query));
    if (qTokens.size === 0)
        return [];
    const phrase = qTokens.size > 1 ? normalize(query) : '';
    const titles = new Map(data.books.map(b => [b.id, b.title]));
    const hits = [];
    const minScore = Math.max(1, Math.ceil(qTokens.size * 0.6));
    for (const p of data.pages) {
        if (opts.bookId && p.bookId !== opts.bookId)
            continue;
        if (!p.text)
            continue;
        const r = bestSnippet(p.text, qTokens, phrase);
        if (r.score >= minScore)
            hits.push({ kind: 'page', bookId: p.bookId, printedPage: p.printedPage, title: `${titles.get(p.bookId) ?? ''} — صفحة ${p.printedPage}`, snippet: r.snippet, score: r.score });
    }
    for (const s of data.summaries) {
        if (opts.bookId && s.bookId !== opts.bookId)
            continue;
        if (s.reviewStatus === 'rejected')
            continue;
        const text = [s.topic, ...s.sections.flatMap(x => x.items)].join('\n');
        const r = bestSnippet(text, qTokens, phrase);
        if (r.score >= minScore)
            hits.push({ kind: 'summary', bookId: s.bookId, printedPage: s.printedPage, title: `ملخص صفحة ${s.printedPage}${s.topic ? ` — ${s.topic}` : ''}`, snippet: r.snippet, score: r.score + 0.5 });
    }
    const chapterTitle = new Map();
    for (const c of data.chapters ?? []) {
        chapterTitle.set(c.id, c.title);
        for (const l of c.lessons)
            chapterTitle.set(l.id, l.title);
    }
    for (const l of data.lessons ?? []) {
        if (opts.bookId && l.bookId !== opts.bookId)
            continue;
        const parts = [l.title, chapterTitle.get(l.chapterId) ?? '', titles.get(l.bookId) ?? '', l.intro ?? ''];
        for (const it of l.items)
            parts.push([it.term, it.text, it.question, it.answer, it.title, it.formula, it.result, ...(it.rows ?? []).flat(), ...(it.steps ?? [])].filter(Boolean).join(' — '));
        const r = bestSnippet(parts.join('\n'), qTokens, phrase);
        if (r.score >= minScore)
            hits.push({ kind: 'lesson', lessonId: l.id, bookId: l.bookId, title: `${titles.get(l.bookId) ?? ''} — ${l.title}`, snippet: r.snippet, score: r.score + 1 });
    }
    for (const q of data.questions) {
        if (q.reviewStatus === 'rejected')
            continue;
        const link = q.links.find(l => l.status === 'confirmed');
        if (opts.bookId && link?.bookId !== opts.bookId)
            continue;
        const meta = q.exam ? ` وزاري ${q.exam.year ?? ''} ${q.exam.round ?? ''}` : '';
        const r = bestSnippet(q.prompt + meta, qTokens, phrase);
        if (r.score >= minScore)
            hits.push({ kind: 'question', questionId: q.id, bookId: link?.bookId, printedPage: link?.printedPages[0], title: q.prompt.slice(0, 80), snippet: q.prompt.length > 80 ? r.snippet : '', score: r.score });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 60);
}
