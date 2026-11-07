// واجهة «ملخصاتي»: المادة ← الكتاب ← الفصل ← الدرس ← الملخص ← الأسئلة المهمة.
import { h, btn, link, badge, emptyState, toast, icon } from './dom.js';
import { SUBJECTS, subjectName } from '../subjects.js';
import { db } from '../db.js';
import { searchContent } from '../search.js';
import { CATEGORY_LABEL, SECTION_ORDER, categoryOf, lessonToText, ministerialForLesson } from '../malzama.js';
const enc = encodeURIComponent;
function pageChips(bookId, pages) {
    if (!pages.length)
        return null;
    return h('span', { class: 'mz-pages' }, ...pages.map(p => h('a', { class: 'mz-page', href: `#/page/${enc(bookId)}/${p}`, title: `فتح صفحة ${p} من الكتاب` }, `ص ${p}`)));
}
export function categoryBadge(q) {
    const c = categoryOf(q);
    const cls = c === 'ministerial' ? 'mz-badge mz-wizari' : c === 'important' ? 'mz-badge mz-important' : c === 'ministerial_unverified' ? 'mz-badge mz-unverified' : 'mz-badge mz-practice';
    return h('span', { class: cls }, CATEGORY_LABEL[c]);
}
function examMeta(q, bookTitle, chapterTitle) {
    const e = q.exam ?? {};
    const parts = [];
    parts.push(h('span', null, `المادة: ${subjectName(q.subjectId)}`));
    parts.push(h('span', null, `السنة: ${e.year ? `${e.year}${e.yearVerified === false ? ' (غير متحققة)' : ''}` : 'غير متوفرة'}`));
    parts.push(h('span', null, `الدور: ${e.round ? `${e.round}${e.roundVerified === false ? ' (غير متحقق)' : ''}` : 'غير متوفر'}`));
    if (chapterTitle)
        parts.push(h('span', null, `الدرس/الفصل: ${chapterTitle}`));
    if (bookTitle)
        parts.push(h('span', null, `الكتاب: ${bookTitle}`));
    const src = h('span', null, 'المصدر: ', e.sourceImage ? h('a', { href: e.sourceImage, target: '_blank', rel: 'noopener', class: 'lnk' }, e.sourceLabel ?? 'صورة الورقة الأصلية') : e.sourceUrl ? h('a', { href: e.sourceUrl, target: '_blank', rel: 'noopener noreferrer', class: 'lnk' }, e.sourceLabel ?? 'رابط المصدر') : (e.sourceLabel ?? 'غير مسجل'), e.sourcePage ? ` — صفحة ${e.sourcePage} من الورقة` : '');
    parts.push(src);
    return h('div', { class: 'mz-exam-meta' }, ...parts);
}
// ================= المواد =================
export async function malzamaHome(root) {
    const [books, lessons] = await Promise.all([db.all('books'), db.all('lessons')]);
    root.append(h('div', { class: 'mz-head' }, h('h1', null, 'ملخصاتي'), h('p', { class: 'muted' }, 'ملخصات دروس الثالث المتوسط مرتبة كالملزمة: تعاريف، تعاليل، مقارنات، قوانين، ومعلومات للحفظ، مع الأسئلة المهمة ووزاريات كل درس.')), searchBox(''));
    const grid = h('div', { class: 'subject-grid' });
    for (const s of SUBJECTS) {
        const sBooks = books.filter(b => b.subjectId === s.id);
        const n = lessons.filter(l => l.subjectId === s.id).length;
        grid.append(h('a', { class: `subject-card s-${s.id}`, href: `#/m/s/${s.id}` }, h('div', { class: 'subject-name' }, s.name), h('div', { class: 'row wrap gap-s' }, n ? badge(`${n} درس ملخّص`, 'ok') : sBooks.length ? badge('الكتاب مستورد — لم يُلخّص بعد', 'warn') : badge('لا يوجد كتاب', 'muted'))));
    }
    root.append(grid);
}
function searchBox(value) {
    const inp = h('input', { type: 'search', value, placeholder: 'ابحث في الملخصات والوزاريات: تعريف، علّل، اسم درس، سنة...', 'aria-label': 'ابحث في الملخصات', dir: 'auto' });
    const form = h('form', { class: 'row mz-search no-print', role: 'search' }, h('div', { class: 'grow' }, inp), h('button', { type: 'submit', class: 'btn btn-primary' }, icon('search'), ' بحث'));
    form.addEventListener('submit', e => { e.preventDefault(); location.hash = `#/m/find?q=${enc(inp.value.trim())}`; });
    return form;
}
// ================= كتب المادة =================
export async function malzamaSubject(root, subjectId) {
    const books = (await db.all('books')).filter(b => b.subjectId === subjectId);
    const lessons = await db.all('lessons');
    root.append(h('div', { class: 'crumbs small muted' }, link('ملخصاتي', '#/m', 'lnk')), h('h1', null, subjectName(subjectId)));
    if (!books.length) {
        root.append(emptyState('لم يُستورد كتاب هذه المادة بعد', 'لا توجد ملخصات لهذه المادة. لن نعرض ملخصات قبل معالجة الكتاب الرسمي نفسه.'));
        return;
    }
    for (const b of books) {
        const n = lessons.filter(l => l.bookId === b.id).length;
        root.append(h('a', { class: 'card card-link', href: `#/m/b/${enc(b.id)}` }, h('div', { class: 'task-title' }, b.title), h('div', { class: 'muted small' }, `${b.edition || 'الطبعة غير محددة'} · ${b.pageCount ?? '?'} صفحة`), h('div', { class: 'row wrap gap-s' }, n ? badge(`${n} درس ملخّص`, 'ok') : badge('لم يُلخّص بعد', 'warn'))));
    }
}
// ================= فصول الكتاب ودروسه =================
export async function malzamaBook(root, bookId) {
    const book = await db.get('books', bookId);
    if (!book) {
        root.append(emptyState('الكتاب غير موجود', '', link('ملخصاتي', '#/m')));
        return;
    }
    const chapters = (await db.byIndex('chapters', 'bookId', bookId)).sort((a, b) => a.order - b.order);
    const lessons = await db.byIndex('lessons', 'bookId', bookId);
    const byLesson = new Map(lessons.map(l => [l.lessonId, l]));
    const allQ = await db.all('questions');
    root.append(h('div', { class: 'crumbs small muted' }, link('ملخصاتي', '#/m', 'lnk'), ' / ', link(subjectName(book.subjectId), `#/m/s/${book.subjectId}`, 'lnk')), h('h1', null, book.title), h('p', { class: 'muted small' }, `${book.edition} · ${lessons.length} درس ملخّص من أصل ${chapters.reduce((a, c) => a + c.lessons.length, 0)}`), searchBox(''));
    if (!chapters.length) {
        root.append(emptyState('لم تُستخرج فصول هذا الكتاب بعد', 'تظهر الفصول والدروس هنا بعد استخراجها من فهرس الكتاب.'));
        return;
    }
    for (const c of chapters) {
        const done = c.lessons.filter(l => byLesson.has(l.id)).length;
        const det = h('details', { class: 'card mz-chapter', open: done > 0 }, h('summary', null, h('span', { class: 'mz-ch-title' }, c.title), ' ', badge(`${done}/${c.lessons.length}`, done ? 'ok' : 'muted')));
        const ul = h('ul', { class: 'mz-lessons' });
        for (const l of c.lessons) {
            const s = byLesson.get(l.id);
            const nMin = s ? ministerialForLesson(s, c, allQ).filter(x => categoryOf(x.q) === 'ministerial').length : 0;
            ul.append(h('li', null, s
                ? h('a', { href: `#/m/l/${enc(s.id)}`, class: 'mz-lesson-link' }, h('span', null, l.title), h('span', { class: 'muted tiny' }, ` ص ${l.fromPage}–${l.toPage}`), nMin ? h('span', { class: 'mz-badge mz-wizari mz-mini' }, `★ ${nMin} وزاري`) : null)
                : h('span', { class: 'mz-lesson-pending' }, h('span', null, l.title), h('span', { class: 'muted tiny' }, ` ص ${l.fromPage}–${l.toPage} · لم يُلخّص بعد`))));
        }
        det.append(ul);
        root.append(det);
    }
}
// ================= ملخص الدرس =================
function renderItem(bookId, it, idx) {
    const imp = it.importance === 'important' ? h('span', { class: 'mz-badge mz-important' }, 'مهم للمراجعة') : null;
    const review = it.needsReview ? h('div', { class: 'note warn small' }, `يحتاج مراجعة: ${it.needsReview}`) : null;
    const pages = pageChips(bookId, it.pages);
    switch (it.kind) {
        case 'definition':
            return h('div', { class: 'mz-item mz-def' }, h('div', { class: 'mz-term' }, it.term, imp), h('div', { dir: 'auto' }, it.text), h('div', { class: 'mz-foot' }, pages), review);
        case 'reason':
            return h('div', { class: 'mz-item mz-reason' }, h('div', { class: 'mz-q' }, h('b', null, `${idx}- علّل: `), it.question, imp), h('div', { class: 'mz-a' }, h('b', null, 'ج/ '), it.answer), h('div', { class: 'mz-foot' }, pages), review);
        case 'comparison':
            return h('div', { class: 'mz-item' }, h('div', { class: 'mz-term' }, it.title ?? 'مقارنة', imp), h('div', { class: 'table-wrap' }, h('table', { class: 'mz-table' }, h('thead', null, h('tr', null, ...(it.headers ?? []).map(x => h('th', { scope: 'col' }, x)))), h('tbody', null, ...(it.rows ?? []).map(r => h('tr', null, ...r.map((c, i) => (i === 0 ? h('th', { scope: 'row' }, c) : h('td', null, c)))))))), h('div', { class: 'mz-foot' }, pages), review);
        case 'law':
            return h('div', { class: 'mz-item mz-law' }, h('div', { class: 'mz-term' }, it.title ?? 'القانون', imp), h('div', { class: 'mz-formula', dir: 'ltr' }, it.formula), it.symbols?.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'mz-table' }, h('thead', null, h('tr', null, h('th', null, 'الرمز'), h('th', null, 'المعنى'), h('th', null, 'الوحدة'))), h('tbody', null, ...it.symbols.map(([s, m, u]) => h('tr', null, h('td', { dir: 'ltr', class: 'mz-sym' }, s), h('td', null, m), h('td', null, u || '—')))))) : null, it.text ? h('p', { class: 'small' }, it.text) : null, h('div', { class: 'mz-foot' }, pages), review);
        case 'problem':
            return h('div', { class: 'mz-item mz-problem' }, h('div', { class: 'mz-q' }, h('b', null, `مسألة ${idx}: `), it.question ?? it.title, imp), h('ol', { class: 'mz-steps' }, ...(it.steps ?? []).map(s => h('li', { dir: 'auto' }, s))), h('div', { class: 'mz-result' }, h('b', null, 'الناتج: '), h('span', { dir: 'auto' }, it.result)), h('div', { class: 'mz-foot' }, pages), review);
        case 'note':
            return h('li', { class: 'mz-note' }, h('span', { dir: 'auto' }, it.text), imp, ' ', pages, review);
        case 'review': {
            const ans = h('div', { class: 'mz-a mz-hidden-answer' }, h('b', null, 'ج/ '), h('span', { dir: 'auto', style: 'white-space:pre-wrap' }, it.answer));
            ans.hidden = true;
            const tog = btn('أظهر الجواب', e => { ans.hidden = !ans.hidden; e.currentTarget.textContent = ans.hidden ? 'أظهر الجواب' : 'أخفِ الجواب'; }, 'ghost', { class: 'btn btn-ghost no-print' });
            return h('div', { class: 'mz-item mz-review' }, h('div', { class: 'row wrap gap-s' }, it.fromBook ? h('span', { class: 'mz-badge mz-practice' }, 'سؤال من الكتاب — إجابة تعليمية') : it.importance === 'important' ? h('span', { class: 'mz-badge mz-important' }, 'مهم للمراجعة') : h('span', { class: 'mz-badge mz-practice' }, 'سؤال تدريبي'), it.fromBook && it.importance === 'important' ? h('span', { class: 'mz-badge mz-important' }, 'مهم للمراجعة') : null), h('div', { class: 'mz-q' }, h('b', null, `س${idx}/ `), it.question), tog, ans, h('div', { class: 'mz-foot' }, pages), review);
        }
    }
}
export async function malzamaLesson(root, id) {
    const l = await db.get('lessons', id);
    if (!l) {
        root.append(emptyState('الملخص غير موجود', 'ربما لم يُلخّص هذا الدرس بعد.', link('ملخصاتي', '#/m')));
        return;
    }
    const book = await db.get('books', l.bookId);
    const chapters = (await db.byIndex('chapters', 'bookId', l.bookId)).sort((a, b) => a.order - b.order);
    const ch = chapters.find(c => c.id === l.chapterId);
    const allQ = await db.all('questions');
    const siblings = (await db.byIndex('lessons', 'bookId', l.bookId)).sort((a, b) => (a.pages[0] ?? 0) - (b.pages[0] ?? 0));
    const idx = siblings.findIndex(s => s.id === l.id);
    root.append(h('div', { class: 'crumbs small muted no-print' }, link('ملخصاتي', '#/m', 'lnk'), ' / ', link(subjectName(l.subjectId), `#/m/s/${l.subjectId}`, 'lnk'), ' / ', link(book?.title ?? '', `#/m/b/${enc(l.bookId)}`, 'lnk'), ch ? ` / ${ch.title}` : ''), h('header', { class: 'mz-lesson-head' }, h('div', { class: 'mz-eyebrow' }, `${subjectName(l.subjectId)} · ${ch?.title ?? ''}`), h('h1', null, l.title), h('div', { class: 'mz-source' }, `المصدر: ${book?.title ?? ''} — ${l.source} — الصفحات ${l.pages[0]}–${l.pages[l.pages.length - 1]}`), l.reviewStatus !== 'reviewed' && l.reviewStatus !== 'verified'
        ? h('p', { class: 'note warn small' }, `ملخص أعدّه ${l.origin === 'ai' ? 'الذكاء الاصطناعي' : 'المحرر'} من نص الكتاب ولم يراجعه مدرس بعد. أرقام الصفحات بجانب كل بند تقودك إلى الأصل للتحقق.`)
        : null, h('div', { class: 'row wrap no-print' }, btn([icon('check'), ' نسخ الملخص'], async () => {
        const text = lessonToText(l, book?.title ?? '');
        try {
            await navigator.clipboard.writeText(text);
            toast('تم نسخ الملخص');
        }
        catch {
            const ta = h('textarea', { class: 'mz-copy-fallback' }, text);
            document.body.append(ta);
            ta.select();
            try {
                document.execCommand('copy');
                toast('تم نسخ الملخص');
            }
            catch {
                toast('تعذّر النسخ؛ حدّد النص يدويًا', 'warn');
            }
            ta.remove();
        }
    }), btn([icon('download'), ' طباعة / حفظ PDF'], () => {
        document.querySelectorAll('.mz-hidden-answer').forEach(a => { a.hidden = false; });
        window.print();
    }))));
    if (l.intro)
        root.append(h('p', { class: 'mz-intro' }, l.intro));
    let n = 0;
    for (const sec of SECTION_ORDER) {
        const items = l.items.filter(i => i.kind === sec.kind);
        if (!items.length)
            continue;
        const box = h('section', { class: `mz-sec mz-sec-${sec.kind}` }, h('h2', null, sec.title, h('span', { class: 'mz-count' }, String(items.length))));
        if (sec.kind === 'note')
            box.append(h('ul', { class: 'mz-notes' }, ...items.map((it, i) => renderItem(l.bookId, it, i + 1))));
        else
            items.forEach((it, i) => box.append(renderItem(l.bookId, it, i + 1)));
        n += items.length;
        root.append(box);
    }
    // وزاريات هذا الدرس
    const linked = ministerialForLesson(l, ch, allQ);
    const mSec = h('section', { class: 'mz-sec mz-sec-wizari' }, h('h2', null, 'وزاريات هذا الدرس', h('span', { class: 'mz-count' }, String(linked.length))));
    if (!linked.length) {
        mSec.append(h('p', { class: 'muted' }, 'لا توجد أسئلة وزارية أصلية مرتبطة بهذا الدرس حتى الآن. تُضاف بعد استخراجها من صور أوراق الامتحانات الأصلية والتحقق منها.'));
    }
    else {
        for (const { q, precision } of linked) {
            const ans = h('div', { class: 'mz-a' }, h('b', null, q.exam?.solutionOfficial ? 'الإجابة النموذجية (موثقة): ' : 'إجابة تعليمية (ليست الحل الرسمي): '), h('span', { dir: 'auto', style: 'white-space:pre-wrap' }, q.answer || '—'));
            ans.hidden = true;
            ans.classList.add('mz-hidden-answer');
            mSec.append(h('div', { class: 'mz-item mz-wq' }, h('div', { class: 'row wrap gap-s' }, categoryBadge(q), precision === 'chapter' ? h('span', { class: 'mz-badge mz-unverified' }, 'ربط تقريبي على مستوى الفصل') : null, q.reviewStatus !== 'verified' ? h('span', { class: 'mz-badge mz-unverified' }, 'يحتاج إلى مراجعة') : null), h('p', { class: 'mz-q', dir: 'auto' }, q.prompt), q.options ? h('ol', { class: 'opts' }, ...q.options.map(o => h('li', { dir: 'auto' }, o))) : null, examMeta(q, book?.title, ch?.lessons.find(x => x.id === l.lessonId)?.title), btn('أظهر الإجابة', e => { ans.hidden = !ans.hidden; e.currentTarget.textContent = ans.hidden ? 'أظهر الإجابة' : 'أخفِ الإجابة'; }, 'ghost', { class: 'btn btn-ghost no-print' }), ans));
        }
    }
    root.append(mSec);
    root.append(h('nav', { class: 'row between page-nav no-print' }, idx > 0 ? link([icon('chevronR'), ` ${siblings[idx - 1].title}`], `#/m/l/${enc(siblings[idx - 1].id)}`, 'btn btn-ghost') : h('span'), idx >= 0 && idx < siblings.length - 1 ? link([`${siblings[idx + 1].title} `, icon('chevronL')], `#/m/l/${enc(siblings[idx + 1].id)}`, 'btn btn-ghost') : h('span')));
    if (!n)
        root.append(emptyState('الملخص فارغ', ''));
}
// ================= البحث في الملخصات والوزاريات =================
export async function malzamaFind(root, params) {
    const q = params.get('q') ?? '';
    root.append(h('div', { class: 'crumbs small muted' }, link('ملخصاتي', '#/m', 'lnk')), h('h1', null, 'البحث في الملخصات والوزاريات'), searchBox(q));
    const out = h('div', { class: 'stack' });
    root.append(out);
    if (!q)
        return;
    const [books, lessons, questions, chapters] = await Promise.all([db.all('books'), db.all('lessons'), db.all('questions'), db.all('chapters')]);
    const subjectHit = SUBJECTS.filter(s => s.name.includes(q) || q.includes(s.name.replace(/^ال/, '')));
    for (const s of subjectHit)
        out.append(h('a', { class: 'card card-link', href: `#/m/s/${s.id}` }, badge('مادة', 'info'), ' ', h('strong', null, s.name)));
    const minis = questions.filter(x => x.origin === 'ministerial_verified' || x.origin === 'ministerial_unverified');
    const hits = searchContent(q, { books, pages: [], summaries: [], questions: minis, lessons, chapters }, { limit: 80 });
    if (!hits.length && !subjectHit.length) {
        out.append(h('p', { class: 'muted' }, 'لا توجد نتائج في الملخصات والوزاريات.'));
        return;
    }
    const qById = new Map(minis.map(x => [x.id, x]));
    const lessonOf = (bookId, page) => lessons.find(l => l.bookId === bookId && page !== undefined && l.pages.includes(page));
    for (const r of hits) {
        if (r.kind === 'lesson') {
            out.append(h('a', { class: 'card card-link', href: `#/m/l/${enc(r.lessonId)}` }, h('div', { class: 'row wrap gap-s' }, badge('ملخص درس', 'info'), h('strong', null, r.title)), r.snippet ? h('p', { class: 'small', dir: 'auto' }, r.snippet) : null));
        }
        else if (r.kind === 'question') {
            const qq = qById.get(r.questionId);
            if (!qq)
                continue;
            const ls = lessonOf(r.bookId, r.printedPage);
            out.append(h('a', { class: 'card card-link', href: ls ? `#/m/l/${enc(ls.id)}` : '#/exams' }, h('div', { class: 'row wrap gap-s' }, categoryBadge(qq), qq.exam?.year ? badge(`${qq.exam.year} ${qq.exam.round ?? ''}`, 'muted') : null), h('p', { class: 'small', dir: 'auto' }, qq.prompt.slice(0, 160))));
        }
    }
}
