// طبقة الخدمات: عمليات على البيانات المحلية تستخدمها الواجهات.
import { db, nowIso, uid } from './db.js';
import { applyResult, emptyReview, markStudied, reschedule } from './review.js';
import { validatePack } from './contentPack.js';
export const DEFAULT_SETTINGS = {
    id: 'settings',
    theme: 'system',
    aiEndpoint: '',
    recommendationsEnabled: true,
    dailyMinutes: 120,
};
export async function getSettings() {
    return { ...DEFAULT_SETTINGS, ...((await db.get('settings', 'settings')) ?? {}) };
}
export async function saveSettings(s) {
    const merged = { ...(await getSettings()), ...s, id: 'settings' };
    await db.put('settings', merged);
    return merged;
}
// رمز الخادم الوسيط يُحفظ في sessionStorage فقط (لا يُصدَّر ضمن النسخة الاحتياطية)
export function getAiToken() {
    try {
        return sessionStorage.getItem('tahdiri-ai-token') ?? '';
    }
    catch {
        return '';
    }
}
export function setAiToken(t) {
    try {
        sessionStorage.setItem('tahdiri-ai-token', t);
    }
    catch { /* ignore */ }
}
// ---------- المهام ----------
export async function saveDrafts(drafts, source) {
    const now = nowIso();
    const books = await db.all('books');
    const tasks = drafts.map(d => ({
        id: uid('task'),
        subjectId: d.subjectId,
        subjectRaw: d.subjectRaw,
        type: d.type,
        bookId: d.subjectId ? books.find(b => b.subjectId === d.subjectId)?.id : undefined,
        pages: d.pages,
        lessonText: d.lessonText,
        details: d.details,
        dueDate: d.dueDate,
        estimatedMinutes: d.estimatedMinutes,
        priority: d.priority,
        status: 'pending',
        progress: 0,
        studiedPages: [],
        source,
        rawLine: d.rawLine,
        createdAt: now,
        updatedAt: now,
    }));
    await db.putMany('tasks', tasks);
    return tasks;
}
export async function updateTask(t) {
    t.updatedAt = nowIso();
    if (t.pages.length)
        t.progress = Math.round((t.studiedPages.filter(p => t.pages.includes(p)).length / t.pages.length) * 100);
    await db.put('tasks', t);
}
// ---------- المحتوى ----------
export async function booksForSubject(subjectId) {
    return (await db.all('books')).filter(b => b.subjectId === subjectId);
}
export async function pagesForBook(bookId) {
    return (await db.byIndex('pages', 'bookId', bookId)).sort((a, b) => a.pdfIndex - b.pdfIndex);
}
export async function chaptersForBook(bookId) {
    return (await db.byIndex('chapters', 'bookId', bookId)).sort((a, b) => a.order - b.order);
}
export async function pageByPrinted(bookId, printed) {
    return (await pagesForBook(bookId)).find(p => p.printedPage === printed);
}
export async function summaryFor(bookId, printed) {
    return db.get('summaries', `${bookId}:${printed}`);
}
export async function questionsForPage(bookId, printed) {
    return (await db.all('questions')).filter(q => q.reviewStatus !== 'rejected' && q.links.some(l => l.bookId === bookId && l.status === 'confirmed' && l.printedPages.includes(printed)));
}
// ---------- المراجعة ----------
export async function getReview(bookId, printed) {
    return (await db.get('review', `${bookId}:${printed}`)) ?? emptyReview(bookId, printed);
}
export async function setStudied(bookId, printed, studied) {
    const r = await getReview(bookId, printed);
    const next = studied ? markStudied(r, nowIso()) : { ...r, studied: false };
    await db.put('review', next);
    // تحديث تقدم المهام المرتبطة
    const tasks = (await db.all('tasks')).filter(t => t.bookId === bookId && t.pages.includes(printed));
    for (const t of tasks) {
        const set = new Set(t.studiedPages);
        if (studied)
            set.add(printed);
        else
            set.delete(printed);
        t.studiedPages = [...set];
        if (t.status === 'pending' && studied)
            t.status = 'in_progress';
        await updateTask(t);
    }
    return next;
}
export async function setNeedsReview(bookId, printed) {
    const r = await getReview(bookId, printed);
    const next = reschedule({ ...r, needsReview: true, selfRating: 2, lastReviewAt: nowIso() }, nowIso());
    next.needsReview = true;
    await db.put('review', next);
    return next;
}
export async function recordAttempt(att, questions) {
    await db.put('attempts', att);
    const byId = new Map(questions.map(q => [q.id, q]));
    const now = nowIso();
    const perPage = new Map();
    for (const r of att.results) {
        const q = byId.get(r.questionId);
        if (!q)
            continue;
        for (const l of q.links) {
            if (l.status !== 'confirmed')
                continue;
            for (const p of l.printedPages) {
                const k = `${l.bookId}:${p}`;
                if (!perPage.has(k))
                    perPage.set(k, []);
                perPage.get(k).push(r.score);
            }
        }
    }
    for (const [k, scores] of perPage) {
        const [bookId, p] = [k.slice(0, k.lastIndexOf(':')), Number(k.slice(k.lastIndexOf(':') + 1))];
        let item = await getReview(bookId, p);
        for (const s of scores)
            item = applyResult(item, s, now);
        await db.put('review', item);
    }
}
// ---------- حزم المحتوى المنشورة ----------
export async function importPack(pack, mode) {
    const v = validatePack(pack);
    if (!v.ok || !v.pack)
        throw new Error(v.errors.join('\n'));
    const p = v.pack;
    if (mode === 'published') {
        // الحزمة المنشورة هي المرجع: نحذف سجلات الكتاب القديمة قبل التثبيت حتى لا يبقى محتوى محذوف
        const ids = new Set(p.books.map(b => b.id));
        for (const st of ['chapters', 'pages', 'summaries', 'lessons'])
            await db.deleteWhere(st, r => ids.has(r.bookId));
        await db.deleteWhere('questions', q => !!q.bookId && ids.has(q.bookId) && q.generatedBy !== 'manual-local');
    }
    await db.putMany('books', p.books);
    await db.putMany('chapters', p.chapters);
    await db.putMany('pages', p.pages);
    await db.putMany('summaries', p.summaries);
    if (p.lessons?.length)
        await db.putMany('lessons', p.lessons);
    await db.putMany('questions', p.questions);
    return { books: p.books.length, pages: p.pages.length, questions: p.questions.length, warnings: v.warnings };
}
/** تثبيت الحزم المنشورة مع التطبيق (content/index.json) إن وُجدت */
export async function syncPublishedPacks() {
    const notes = [];
    let index;
    try {
        const res = await fetch('content/index.json', { cache: 'no-cache' });
        if (!res.ok)
            return notes;
        index = await res.json();
    }
    catch {
        return notes;
    }
    let installed = {};
    try {
        installed = JSON.parse(localStorage.getItem('tahdiri-packs') ?? '{}');
    }
    catch { /* ignore */ }
    for (const p of index.packs ?? []) {
        if (installed[p.file] === p.version)
            continue;
        try {
            const pack = await (await fetch(`content/${p.file}`)).json();
            const r = await importPack(pack, 'published');
            installed[p.file] = p.version;
            notes.push(`تم تحديث محتوى الكتب (${r.pages} صفحة).`);
        }
        catch (e) {
            notes.push(`تعذّر تحديث محتوى أحد الكتب: ${e.message}`);
        }
    }
    try {
        localStorage.setItem('tahdiri-packs', JSON.stringify(installed));
    }
    catch { /* ignore */ }
    return notes;
}
