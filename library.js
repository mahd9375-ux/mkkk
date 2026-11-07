// مكتبة المواد، صفحة الكتاب والفصول، وصفحة ملخص الصفحة.
import { h, btn, link, card, badge, emptyState, toast, icon, clear, pagesLabel } from './dom.js';
import { loadSources, state } from './state.js';
import { SUBJECTS, subjectName } from '../subjects.js';
import { db } from '../db.js';
import { booksForSubject, chaptersForBook, pagesForBook, summaryFor, questionsForPage, getReview, setStudied, setNeedsReview, updateTask } from '../services.js';
import { setSelfRating } from '../review.js';
import { planQuiz } from '../quiz.js';
export const ORIGIN_LABEL = {
    ministerial_verified: '★ مهم — وزاري',
    ministerial_unverified: 'منسوب للوزاري — غير متحقق',
    book_generated: 'تدريبي مولّد من الكتاب',
    platform_review: 'مراجعة من إعداد المنصة',
    book_exercise: 'سؤال من الكتاب',
};
export const REVIEW_LABEL = {
    unverified: 'غير متحقق', needs_review: 'لم تتم مراجعته', reviewed: 'تمت مراجعته', verified: 'متحقق', rejected: 'مرفوض',
};
export function originBadge(q) {
    const kind = q.origin === 'ministerial_verified' ? 'ok' : q.origin === 'ministerial_unverified' ? 'err' : 'info';
    return h('span', { class: 'row gap-s' }, badge(ORIGIN_LABEL[q.origin], kind), q.origin !== 'ministerial_verified' && q.reviewStatus !== 'reviewed' && q.reviewStatus !== 'verified' ? badge(REVIEW_LABEL[q.reviewStatus], 'warn') : null);
}
// ================= مكتبة المواد =================
export async function libraryView(root) {
    const books = await db.all('books');
    const src = await loadSources();
    root.append(h('h1', null, 'مكتبة المواد'), h('p', { class: 'muted' }, `مواد الثالث المتوسط العراقي ${src ? `(${src.curriculum.targetYear})` : ''}. المحتوى يظهر فقط بعد استيراد الكتاب الرسمي واستخراج صفحاته.`));
    const grid = h('div', { class: 'subject-grid' });
    for (const s of SUBJECTS) {
        const ev = src?.curriculum.subjects.find(x => x.id === s.id);
        const n = books.filter(b => b.subjectId === s.id).length;
        grid.append(h('a', { class: `subject-card s-${s.id}`, href: `#/subject/${s.id}` }, h('div', { class: 'subject-name' }, s.name), h('div', { class: 'row wrap gap-s' }, n ? badge(`${n} كتاب مستورد`, 'ok') : badge('لم يُستورد كتاب', 'muted'), ev?.needsVerification ? badge('اعتمادها يحتاج تحقق', 'warn') : null, ev && !ev.inMinisterialExam ? badge('ليست ضمن الوزاري', 'muted') : null)));
    }
    root.append(grid, h('p', { class: 'muted small' }, 'مصدر قائمة المواد: ', link('سجل المصادر', '#/sources', 'lnk')));
}
// ================= صفحة المادة =================
export async function subjectView(root, subjectId) {
    const books = await booksForSubject(subjectId);
    const src = await loadSources();
    const official = src?.books.filter(b => b.subjectId === subjectId) ?? [];
    root.append(h('h1', null, subjectName(subjectId)));
    if (books.length) {
        root.append(h('h2', null, 'الكتب المستوردة'));
        const list = h('div', { class: 'stack' });
        for (const b of books) {
            list.append(h('a', { class: 'card card-link', href: `#/book/${encodeURIComponent(b.id)}` }, h('div', { class: 'task-title' }, b.title), h('div', { class: 'muted small' }, `الطبعة: ${b.edition || 'غير محددة'} · المسار: ${b.track} · ${b.pageCount ?? '?'} صفحة`), h('div', { class: 'row wrap gap-s' }, badge(b.verificationStatus === 'verified' ? 'متحقق من المصدر' : 'لم يتم التحقق من الطبعة', b.verificationStatus === 'verified' ? 'ok' : 'warn'), badge(b.extractionStatus === 'done' ? 'تم استخراج النص' : b.extractionStatus === 'partial' ? 'استخراج جزئي' : 'لم يكتمل الاستخراج', b.extractionStatus === 'done' ? 'ok' : 'warn'))));
        }
        root.append(list);
    }
    else {
        root.append(emptyState('لا يوجد كتاب مستورد لهذه المادة', 'لم يتم العثور على مصدر موثوق مستورد حتى الآن. نزّل الكتاب الرسمي ثم استورده من أداة المحتوى.'));
    }
    if (official.length) {
        root.append(h('h2', null, 'الكتاب الرسمي (من سجل المصادر)'));
        for (const o of official) {
            root.append(card(h('div', { class: 'task-title' }, o.title), h('p', { class: 'small' }, `الطبعة المذكورة: ${o.editionClaimed}`), h('p', { class: 'small muted' }, 'الحالة: لم يُنزَّل ولم يُتحقق منه بعد. الرابط من موقع المديرية العامة للمناهج كما نقله مصدر ثانوي؛ قد لا يعمل أو قد تكون هناك طبعة أحدث.'), h('div', { class: 'row wrap' }, h('a', { class: 'btn btn-soft', href: o.url, target: '_blank', rel: 'noopener noreferrer' }, icon('download'), ' فتح الرابط الرسمي'), link([icon('upload'), ' استيراد بعد التنزيل'], `#/admin?registry=${o.id}`))));
        }
    }
}
// ================= صفحة الكتاب =================
export async function bookView(root, bookId) {
    const book = await db.get('books', bookId);
    if (!book) {
        root.append(emptyState('الكتاب غير موجود', '', link('المكتبة', '#/library')));
        return;
    }
    const pages = await pagesForBook(bookId);
    const chapters = await chaptersForBook(bookId);
    const reviews = new Map((await db.all('review')).filter(r => r.bookId === bookId).map(r => [r.printedPage, r]));
    const sums = new Set((await db.byIndex('summaries', 'bookId', bookId)).map(s => s.printedPage));
    root.append(h('div', { class: 'muted small' }, link(subjectName(book.subjectId), `#/subject/${book.subjectId}`, 'lnk')), h('h1', null, book.title), card(h('dl', { class: 'meta' }, h('dt', null, 'الطبعة'), h('dd', null, book.edition || 'غير محددة'), h('dt', null, 'السنة الدراسية'), h('dd', null, book.schoolYear || 'غير محددة'), h('dt', null, 'المصدر'), h('dd', null, book.sourceUrl ? h('a', { href: book.sourceUrl, target: '_blank', rel: 'noopener noreferrer', class: 'lnk' }, book.sourceUrl) : 'غير مسجل'), h('dt', null, 'عدد الصفحات'), h('dd', null, String(book.pageCount ?? '—')), h('dt', null, 'بصمة الملف'), h('dd', { class: 'mono' }, book.sha256 ? book.sha256.slice(0, 16) + '…' : '—'), h('dt', null, 'حقوق الاستخدام'), h('dd', null, book.rights || '—'))));
    if (chapters.length) {
        const ch = h('div', { class: 'stack' });
        for (const c of chapters) {
            ch.append(h('details', { class: 'card' }, h('summary', null, c.title), link('صفحة الفصل وأسئلة الكتاب وحلولها', `#/chapter/${encodeURIComponent(bookId)}/${encodeURIComponent(c.id)}`, 'lnk small'), h('ul', null, ...c.lessons.map(l => h('li', null, link(`${l.title} (ص ${l.fromPage}–${l.toPage})`, `#/page/${encodeURIComponent(bookId)}/${l.fromPage}`, 'lnk'))))));
        }
        root.append(h('h2', null, 'الفصول والدروس'), ch);
    }
    else {
        root.append(h('p', { class: 'muted' }, 'لم تُسجل فصول ودروس هذا الكتاب بعد.'));
    }
    root.append(h('h2', null, 'الصفحات'), h('div', { class: 'legend small' }, h('span', { class: 'pg pg-studied' }, '١'), ' درستها ', h('span', { class: 'pg pg-review' }, '١'), ' تحتاج مراجعة ', h('span', { class: 'pg pg-sum' }, '١'), ' لها ملخص ', h('span', { class: 'pg pg-bad' }, '١'), ' نص ضعيف'));
    if (!pages.length) {
        root.append(emptyState('لم تُستخرج صفحات هذا الكتاب بعد', 'افتح أداة المحتوى لاستخراج النص.', link('أداة المحتوى', `#/admin/book/${encodeURIComponent(bookId)}`)));
    }
    else {
        const grid = h('div', { class: 'page-grid' });
        for (const p of pages) {
            const r = reviews.get(p.printedPage);
            const cls = ['pg', r?.needsReview ? 'pg-review' : r?.studied ? 'pg-studied' : '', sums.has(p.printedPage) ? 'pg-sum' : '', p.status !== 'ok' ? 'pg-bad' : ''].join(' ');
            grid.append(h('a', { class: cls, href: `#/page/${encodeURIComponent(bookId)}/${p.printedPage}`, title: `صفحة ${p.printedPage}` }, String(p.printedPage)));
        }
        root.append(grid, h('div', { class: 'row wrap' }, link([icon('quiz'), ' اختبار من صفحات أختارها'], `#/quizsetup/${encodeURIComponent(bookId)}/pick`), link([icon('search'), ' ابحث في الكتاب'], `#/search?book=${encodeURIComponent(bookId)}`, 'btn btn-ghost'), link('اختبار شامل', `#/quizsetup/${encodeURIComponent(bookId)}/all`, 'btn btn-ghost')));
    }
}
function lessonFor(chapters, printed) {
    for (const c of chapters)
        for (const l of c.lessons)
            if (printed >= l.fromPage && printed <= l.toPage)
                return { chapter: c, lesson: l };
    return null;
}
const SECTION_ICON = {
    idea: 'الفكرة الأساسية', explain: 'شرح مبسط', definitions: 'التعاريف', reasons: 'التعاليل والأسباب', laws: 'القوانين والرموز والوحدات',
    comparisons: 'المقارنات والتعدادات', memorize: 'نقاط للحفظ', mistakes: 'أخطاء شائعة', unreadable: 'أجزاء لم تُقرأ',
};
// ================= صفحة ملخص الصفحة =================
export async function pageView(root, bookId, printed, taskId) {
    const book = await db.get('books', bookId);
    if (!book) {
        root.append(emptyState('الكتاب غير موجود', '', link('المكتبة', '#/library')));
        return;
    }
    const pages = await pagesForBook(bookId);
    const idx = pages.findIndex(p => p.printedPage === printed);
    const page = pages[idx];
    const chapters = await chaptersForBook(bookId);
    const loc = lessonFor(chapters, printed);
    const summary = await summaryFor(bookId, printed);
    const qs = await questionsForPage(bookId, printed);
    const allQ = await db.all('questions');
    // وزاريات مربوطة على مستوى الفصل (بدون صفحات محددة)
    const chapterLevel = loc ? allQ.filter(q => q.origin === 'ministerial_verified' && q.reviewStatus === 'verified' &&
        q.links.some(l => l.bookId === bookId && l.status === 'confirmed' && l.printedPages.length === 0 && l.chapterId === loc.chapter.id)) : [];
    let review = await getReview(bookId, printed);
    const task = taskId ? await db.get('tasks', taskId) : undefined;
    root.append(h('div', { class: 'crumbs small muted' }, link(subjectName(book.subjectId), `#/subject/${book.subjectId}`, 'lnk'), ' / ', link(book.title, `#/book/${encodeURIComponent(bookId)}`, 'lnk'), loc ? ` / ${loc.chapter.title} / ${loc.lesson.title}` : ''), h('div', { class: 'row between wrap' }, h('h1', null, `صفحة ${printed}`, summary?.topic ? h('span', { class: 'topic' }, ` — ${summary.topic}`) : null), h('span', { class: 'muted small' }, `الطبعة: ${book.edition || 'غير محددة'}`)), task ? h('p', { class: 'note' }, `ضمن مهمة: ${subjectName(task.subjectId)} ${pagesLabel(task.pages)}`) : '');
    if (!page) {
        root.append(emptyState('هذه الصفحة غير موجودة في الكتاب المستورد', 'تحقق من رقم الصفحة أو من إزاحة الترقيم في بيانات الكتاب.'));
    }
    // الملخص
    const sumCard = card(h('h2', null, 'الملخص'));
    if (summary) {
        if (summary.reviewStatus !== 'reviewed' && summary.reviewStatus !== 'verified') {
            sumCard.append(h('p', { class: 'note warn' }, summary.origin === 'ai'
                ? `ملخص مولّد آليًا (${summary.model ?? 'نموذج'}) من نص الصفحة ولم تتم مراجعته بشريًا بعد. قارن مع الكتاب.`
                : 'ملخص لم تتم مراجعته بعد.'));
        }
        if (page && summary.sourcePageTextHash) {
            const { textHash } = await import('../arabic.js');
            if (textHash(page.text) !== summary.sourcePageTextHash)
                sumCard.append(h('p', { class: 'note warn' }, 'نص الصفحة تغيّر بعد إنشاء هذا الملخص؛ قد يحتاج تحديثًا.'));
        }
        for (const s of summary.sections) {
            sumCard.append(h('div', { class: `sum-sec sum-${s.kind}` }, h('h3', null, s.title || SECTION_ICON[s.kind] || s.kind), h('ul', null, ...s.items.map(i => h('li', { dir: 'auto' }, i)))));
        }
        sumCard.append(h('p', { class: 'muted tiny' }, `المصدر: ${book.title}، الطبعة ${book.edition || 'غير محددة'}، صفحة ${printed}.`));
    }
    else {
        sumCard.append(h('p', { class: 'muted' }, 'لا يوجد ملخص لهذه الصفحة بعد. يمكنك قراءة النص المستخرج أدناه.'));
    }
    root.append(sumCard);
    // النص المستخرج
    if (page) {
        const det = h('details', { class: 'card' }, h('summary', null, 'النص المستخرج من الكتاب ', page.status === 'ok' ? badge(page.method === 'ocr' ? 'OCR' : page.method === 'ai_vision' ? 'منقول آليًا من صورة الصفحة' : 'نص PDF', 'muted') : badge(page.status === 'low_quality' ? 'جودة ضعيفة' : page.status === 'empty' ? 'فارغة' : 'فشل', 'warn'), page.reviewed ? badge('راجعه إنسان', 'ok') : null), page.status !== 'ok' ? h('p', { class: 'note warn' }, 'جودة استخراج هذه الصفحة ضعيفة. لا تعتمد عليها دون الرجوع للكتاب.') : null, page.method === 'ai_vision' && !page.reviewed ? h('p', { class: 'muted small' }, 'نُقل هذا النص بقراءة آلية لصورة الصفحة، دون التشكيل الكامل، ولم يراجعه إنسان بعد. عند أي شك ارجع إلى الكتاب.') : null, h('pre', { class: 'page-text', dir: 'auto' }, page.text || '(لا يوجد نص)'));
        root.append(det);
    }
    // أسئلة المراجعة
    const practice = qs.filter(q => q.origin !== 'ministerial_verified' && q.origin !== 'ministerial_unverified' && q.origin !== 'book_exercise');
    // الوزاري الموثق يظهر كما هو، وغير الموثق يظهر بوسمه «منسوب للوزاري — غير متحقق» ولا يدخل الاختبارات
    const minis = qs.filter(q => (q.origin === 'ministerial_verified' && q.reviewStatus === 'verified') || q.origin === 'ministerial_unverified');
    const qCard = card(h('h2', null, 'أسئلة مراجعة الصفحة'));
    if (practice.length) {
        for (const q of practice.slice(0, 8))
            qCard.append(questionPreview(q));
    }
    else
        qCard.append(h('p', { class: 'muted' }, 'لا توجد أسئلة مراجعة لهذه الصفحة بعد.'));
    root.append(qCard);
    const mCard = card(h('h2', null, 'الوزاريات المرتبطة'));
    if (minis.length || chapterLevel.length) {
        for (const q of minis)
            mCard.append(questionPreview(q));
        if (chapterLevel.length) {
            mCard.append(h('p', { class: 'muted small' }, 'أسئلة مرتبطة بالفصل كله (لم يكن الدليل كافيًا لربطها بصفحة محددة):'));
            for (const q of chapterLevel)
                mCard.append(questionPreview(q));
        }
    }
    else {
        mCard.append(h('p', { class: 'muted' }, 'لا توجد أسئلة وزارية موثقة مرتبطة بهذه الصفحة حتى الآن.'));
    }
    root.append(mCard);
    // أزرار الدراسة
    const status = h('div', { class: 'muted small' });
    const renderStatus = () => {
        status.textContent = review.studied ? (review.needsReview ? 'درستها وتحتاج مراجعة.' : 'درستها.') : review.needsReview ? 'تحتاج مراجعة.' : 'لم تُعلَّم كمدروسة بعد.';
    };
    renderStatus();
    const rating = h('div', { class: 'row wrap gap-s' }, h('span', { class: 'small' }, 'فهمي للصفحة:'), ...[1, 2, 3, 4, 5].map(n => btn(String(n), async () => {
        review = setSelfRating(review, n, new Date().toISOString());
        await db.put('review', review);
        renderStatus();
        toast('تم حفظ تقييمك');
    }, review.selfRating === n ? 'primary' : 'ghost', { 'aria-label': `تقييم ${n}` })));
    const nav = h('div', { class: 'row between page-nav' }, idx > 0 ? link([icon('chevronR'), ` صفحة ${pages[idx - 1].printedPage}`], `#/page/${encodeURIComponent(bookId)}/${pages[idx - 1].printedPage}${taskId ? '/' + taskId : ''}`, 'btn btn-ghost') : h('span'), idx >= 0 && idx < pages.length - 1 ? link([`صفحة ${pages[idx + 1].printedPage} `, icon('chevronL')], `#/page/${encodeURIComponent(bookId)}/${pages[idx + 1].printedPage}${taskId ? '/' + taskId : ''}`, 'btn btn-ghost') : h('span'));
    root.append(card(h('div', { class: 'row wrap' }, btn([icon('check'), ' تمت الدراسة'], async () => {
        review = await setStudied(bookId, printed, true);
        renderStatus();
        toast('تم تسجيل الصفحة كمدروسة');
        if (task) {
            const t = await db.get('tasks', task.id);
            const nextP = t?.pages.find(p => !t.studiedPages.includes(p));
            if (t && nextP === undefined) {
                toast('أنهيت كل صفحات المهمة! اضغط «خلصت التحضير» لتبدأ الاختبار.');
            }
            else if (nextP !== undefined)
                location.hash = `#/page/${encodeURIComponent(bookId)}/${nextP}/${task.id}`;
        }
    }, 'primary'), btn([icon('repeat'), ' أحتاج إلى مراجعة'], async () => { review = await setNeedsReview(bookId, printed); renderStatus(); toast('أضفناها لقائمة المراجعة'); }), task ? link([icon('flag'), ' خلصت التحضير'], `#/finish/${task.id}`) : null), status, rating), nav);
    void updateTask;
    void state;
}
export function questionPreview(q) {
    const ans = h('div', { class: 'answer', hidden: true }, h('div', null, h('strong', null, 'الإجابة: '), h('span', { dir: 'auto' }, q.answer)), q.explanation ? h('div', { class: 'muted small' }, q.explanation) : null);
    return h('div', { class: 'q-preview' }, h('div', { class: 'row wrap gap-s' }, originBadge(q), q.exam?.year ? badge(`${q.exam.year} ${q.exam.round ?? ''}`, 'muted') : null), h('p', { dir: 'auto' }, q.prompt), q.options ? h('ol', { class: 'opts' }, ...q.options.map(o => h('li', { dir: 'auto' }, o))) : null, q.exam?.sourceUrl ? h('div', { class: 'tiny' }, 'المصدر: ', h('a', { href: q.exam.sourceUrl, target: '_blank', rel: 'noopener noreferrer', class: 'lnk' }, q.exam.sourceUrl)) : null, q.exam?.sourceImage ? h('div', { class: 'tiny' }, 'المصدر: ', h('a', { href: q.exam.sourceImage, target: '_blank', rel: 'noopener', class: 'lnk' }, q.exam.sourceLabel ?? 'صورة الورقة الأصلية')) : null, btn('أظهر الإجابة', (e) => { ans.hidden = !ans.hidden; e.currentTarget.textContent = ans.hidden ? 'أظهر الإجابة' : 'أخفِ الإجابة'; }, 'ghost'), ans);
}
// ================= إعداد اختبار من الكتاب =================
export async function quizSetupView(root, bookId, mode) {
    const book = await db.get('books', bookId);
    if (!book) {
        root.append(emptyState('الكتاب غير موجود', ''));
        return;
    }
    const pages = await pagesForBook(bookId);
    const allQ = await db.all('questions');
    const comprehensive = mode === 'all';
    root.append(h('h1', null, comprehensive ? 'اختبار شامل' : 'اختبار من صفحات تختارها'), h('p', { class: 'muted' }, book.title));
    const input = h('input', { placeholder: 'مثل 10-15، 18', 'aria-label': 'الصفحات' });
    const unrev = h('input', { type: 'checkbox', checked: true });
    const count = h('input', { type: 'number', min: 3, max: 40, value: 10 });
    const out = h('div');
    const { parsePagesInput } = await import('./state.js');
    const plan = () => {
        clear(out);
        const sel = comprehensive ? pages.map(p => p.printedPage) : parsePagesInput(input.value);
        if (!sel.length) {
            out.append(h('p', { class: 'muted' }, 'حدد الصفحات.'));
            return;
        }
        const p = planQuiz(allQ, { bookId, pages: sel, comprehensive, includeUnreviewed: unrev.checked, max: +count.value || 10 });
        if (!p.questions.length) {
            out.append(h('p', null, 'لا توجد أسئلة مرتبطة بهذه الصفحات.'));
            return;
        }
        out.append(h('p', null, `${p.questions.length} سؤال: ${p.countsByOrigin.ministerial_verified} وزاري موثق، ${p.countsByOrigin.book_generated} تدريبي من الكتاب، ${p.countsByOrigin.platform_review} مراجعة.`), !p.hasVerifiedMinisterial ? h('p', { class: 'note' }, 'لا توجد وزاريات موثقة لهذه الصفحات.') : '', btn([icon('play'), ' ابدأ'], () => {
            state.quiz = { questions: p.questions, bookId, pages: sel, comprehensive, answers: {}, index: 0, startedAt: new Date().toISOString() };
            location.hash = '#/quiz';
        }, 'primary'));
    };
    root.append(card(comprehensive ? h('p', null, 'سيشمل الاختبار كل صفحات الكتاب المستوردة.') : h('label', { class: 'field' }, h('span', null, 'الصفحات'), input), h('label', { class: 'field' }, h('span', null, 'عدد الأسئلة'), count), h('label', { class: 'row' }, unrev, ' تضمين الأسئلة التدريبية غير المراجعة'), btn('جهّز الاختبار', plan, 'soft'), out));
    if (comprehensive)
        plan();
}
// ================= صفحة الفصل: الدروس + أسئلة الكتاب وحلولها + وزاريات الفصل =================
export async function chapterView(root, bookId, chapterId) {
    const book = await db.get('books', bookId);
    const ch = (await chaptersForBook(bookId)).find(c => c.id === chapterId);
    if (!book || !ch) {
        root.append(emptyState('الفصل غير موجود', '', link('المكتبة', '#/library')));
        return;
    }
    const { chapterProgress } = await import('../chapters.js');
    const reviews = await db.all('review');
    const prog = chapterProgress(ch, reviews);
    const all = await db.all('questions');
    const inChapter = (q) => q.links.some(l => l.bookId === bookId && l.status === 'confirmed' && (l.chapterId === chapterId ||
        l.printedPages.some(p => ch.lessons.some(ls => p >= ls.fromPage && p <= ls.toPage))));
    const exercises = all.filter(q => q.origin === 'book_exercise' && q.reviewStatus !== 'rejected' && inChapter(q))
        .sort((a, b) => (a.exercise?.sourcePage ?? 0) - (b.exercise?.sourcePage ?? 0));
    const minis = all.filter(q => q.origin === 'ministerial_verified' && q.reviewStatus === 'verified' && inChapter(q))
        .sort((a, b) => (b.exam?.year ?? 0) - (a.exam?.year ?? 0));
    root.append(h('div', { class: 'crumbs small muted' }, link(subjectName(book.subjectId), `#/subject/${book.subjectId}`, 'lnk'), ' / ', link(book.title, `#/book/${encodeURIComponent(bookId)}`, 'lnk')), h('h1', null, ch.title), card(h('h2', null, 'الدروس'), h('ul', null, ...ch.lessons.map(l => h('li', null, link(`${l.title} (ص ${l.fromPage}–${l.toPage})`, `#/page/${encodeURIComponent(bookId)}/${l.fromPage}`, 'lnk')))), h('p', { class: 'small muted' }, `درست ${prog.studied} من ${prog.total} صفحة في هذا الفصل.`), prog.total ? h('div', { class: 'progress' }, h('div', { class: 'progress-bar', style: `width:${Math.round((prog.studied / prog.total) * 100)}%` })) : null));
    const exCard = card(h('h2', null, 'أسئلة الكتاب وحلولها'));
    if (!exercises.length) {
        exCard.append(h('p', { class: 'muted' }, 'لم تُدخل أسئلة هذا الفصل من الكتاب بعد.'));
    }
    else {
        let revealed = prog.complete;
        const list = h('div');
        const render = () => {
            clear(list);
            if (!revealed)
                list.append(h('p', { class: 'note' }, 'تظهر الحلول بعد أن تعلّم كل صفحات الفصل «تمت الدراسة». حاول حل الأسئلة بنفسك أولًا.'), btn('أظهر الحلول الآن', () => { revealed = true; render(); }, 'ghost'));
            for (const q of exercises) {
                list.append(h('div', { class: 'q-preview' }, h('div', { class: 'row wrap gap-s' }, badge(`سؤال من الكتاب${q.exercise?.number ? ` ${q.exercise.number}` : ''}`, 'info'), badge(`صفحة ${q.exercise?.sourcePage ?? '?'}`, 'muted')), h('p', { dir: 'auto' }, q.prompt), revealed ? h('div', { class: 'answer' }, h('strong', null, q.exercise?.solutionOfficial ? 'الحل (رسمي موثق): ' : 'حل مقترح من المنصة: '), h('span', { dir: 'auto', style: 'white-space:pre-wrap' }, q.answer), q.reviewStatus !== 'reviewed' && q.reviewStatus !== 'verified' ? h('div', { class: 'tiny muted' }, 'لم تتم مراجعة هذا الحل بعد.') : null) : null));
            }
        };
        render();
        exCard.append(list);
    }
    root.append(exCard);
    const mCard = card(h('h2', null, 'وزاريات الفصل'));
    if (minis.length)
        for (const q of minis)
            mCard.append(questionPreview(q));
    else
        mCard.append(h('p', { class: 'muted' }, 'لا توجد أسئلة وزارية موثقة مرتبطة بهذا الفصل حتى الآن.'));
    root.append(mCard);
}
