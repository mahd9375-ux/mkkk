// الصفحة الرئيسية، إدخال التحضير، مراجعة المهام المستخرجة، جدول التحضير، وإنهاء التحضير.
import { h, btn, link, card, badge, emptyState, toast, icon, confirmDialog, fmtDate, pagesLabel, clear } from './dom.js';
import { state, parsePagesInput, pagesToInput } from './state.js';
import { parsePrep, sortTasks, TASK_TYPE_LABEL, computePriority } from '../prepParser.js';
import { SUBJECTS, subjectName } from '../subjects.js';
import { db, todayIso } from '../db.js';
import { getSettings, saveDrafts, updateTask, booksForSubject, pagesForBook, summaryFor, questionsForPage } from '../services.js';
import { dueItems } from '../review.js';
import { planQuiz } from '../quiz.js';
import { MAX_IMAGE_BYTES, isImageHeader, ocrImage } from '../pdfImport.js';
const PRIORITY_LABEL = { 1: 'عالية', 2: 'متوسطة', 3: 'منخفضة' };
const STATUS_LABEL = { pending: 'لم تبدأ', in_progress: 'قيد الدراسة', paused: 'متوقفة مؤقتًا', done: 'منجزة' };
// ================= الصفحة الرئيسية =================
export async function homeView(root) {
    const ta = h('textarea', {
        id: 'prep-input',
        class: 'prep-input',
        rows: 5,
        placeholder: 'مثال:\nفيزياء من صفحة 10 إلى 15\nرياضيات حل أول خمسة تمارين من صفحة 20 باجر\nعربي حفظ تعريفات الفصل الثاني',
        'aria-label': 'اكتب تحضيرك',
    });
    const ocrStatus = h('div', { class: 'muted small', 'aria-live': 'polite' });
    const extract = () => {
        const text = ta.value.trim();
        if (!text) {
            toast('اكتب تحضيرك أولًا', 'warn');
            return;
        }
        state.drafts = parsePrep(text, new Date());
        if (!state.drafts.length) {
            toast('لم نستخرج أي مهمة. أضف اسم المادة أو الصفحات.', 'warn');
            return;
        }
        location.hash = '#/prep/review';
    };
    const fromImage = async () => {
        const inp = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', capture: 'environment', style: 'display:none' });
        document.body.appendChild(inp);
        inp.addEventListener('change', async () => {
            const f = inp.files?.[0];
            inp.remove();
            if (!f)
                return;
            if (f.size > MAX_IMAGE_BYTES) {
                toast('الصورة كبيرة جدًا (الحد 15 ميغابايت).', 'err');
                return;
            }
            const buf = await f.arrayBuffer();
            if (!isImageHeader(buf)) {
                toast('الملف ليس صورة PNG أو JPEG أو WEBP.', 'err');
                return;
            }
            ocrStatus.textContent = 'جارٍ قراءة الصورة على جهازك… (أول مرة تنزّل نموذج اللغة العربية)';
            try {
                const r = await ocrImage(f, 'ara+eng', (p, s) => { ocrStatus.textContent = `قراءة الصورة: ${s} ${Math.round(p * 100)}%`; });
                ta.value = (ta.value ? ta.value + '\n' : '') + r.text;
                state.draftSource = 'image';
                ocrStatus.textContent = `تمت القراءة (الثقة ${Math.round(r.confidence)}%). راجع النص وصحّحه ثم اضغط «استخرج المهام».`;
                if (r.status !== 'ok')
                    ocrStatus.textContent += ' جودة القراءة ضعيفة — تحقق من كل سطر.';
            }
            catch (e) {
                ocrStatus.textContent = `تعذّرت القراءة: ${e.message}`;
            }
        });
        inp.click();
    };
    const tasks = sortTasks((await db.all('tasks')).filter(t => t.status !== 'done'));
    const settings = await getSettings();
    const due = settings.recommendationsEnabled ? dueItems(await db.all('review'), new Date().toISOString()) : [];
    root.append(h('section', { class: 'hero' }, h('h1', { class: 'hero-title' }, 'شنو عندك تحضير اليوم؟'), h('p', { class: 'muted' }, 'اكتب تحضيراتك كما تكتبها بدفترك، أو صوّر جدول الواجبات أو السبورة.'), ta, h('div', { class: 'row wrap' }, btn([icon('check'), ' استخرج المهام'], extract, 'primary'), btn([icon('camera'), ' من صورة'], fromImage, 'soft')), ocrStatus, h('p', { class: 'muted tiny' }, 'قراءة الصور تتم على جهازك ولا تُرسل الصورة لأي خادم.')));
    const list = h('div', { class: 'stack' });
    if (tasks.length) {
        for (const t of tasks.slice(0, 3))
            list.appendChild(taskMini(t));
        list.appendChild(link('كل المهام', '#/tasks', 'btn btn-ghost'));
    }
    else {
        list.appendChild(h('p', { class: 'muted' }, 'لا توجد مهام مفتوحة.'));
    }
    root.append(card(h('h2', null, 'تحضير اليوم'), list));
    if (due.length) {
        root.append(card(h('h2', null, 'مراجعة مقترحة'), h('p', null, `عندك ${due.length} صفحة حان وقت مراجعتها.`), link('ابدأ المراجعة', '#/review')));
    }
}
function taskMini(t) {
    return h('a', { class: 'task-mini', href: '#/tasks' }, h('span', { class: `dot p${t.priority}` }), h('span', { class: 'grow' }, `${subjectName(t.subjectId)} — ${TASK_TYPE_LABEL[t.type]} ${pagesLabel(t.pages)}`), t.dueDate ? h('span', { class: 'muted small' }, fmtDate(t.dueDate)) : null);
}
// ================= محرر مهمة (مشترك) =================
function taskEditor(d, onChange) {
    const subj = h('select', { 'aria-label': 'المادة' }, h('option', { value: '' }, '— اختر المادة —'), ...SUBJECTS.map(s => h('option', { value: s.id }, s.name)));
    subj.value = d.subjectId ?? '';
    subj.onchange = () => { d.subjectId = subj.value || null; onChange(); };
    const type = h('select', { 'aria-label': 'نوع الواجب' }, ...Object.entries(TASK_TYPE_LABEL).map(([k, v]) => h('option', { value: k }, v)));
    type.value = d.type;
    type.onchange = () => { d.type = type.value; onChange(); };
    const pages = h('input', { value: pagesToInput(d.pages), placeholder: 'مثل 10-15، 18', inputmode: 'numeric', 'aria-label': 'الصفحات' });
    pages.onchange = () => { d.pages = parsePagesInput(pages.value); onChange(); };
    const lesson = h('input', { value: d.lessonText ?? '', placeholder: 'الدرس أو الفصل (اختياري)', 'aria-label': 'الدرس' });
    lesson.onchange = () => { d.lessonText = lesson.value || undefined; };
    const details = h('input', { value: d.details ?? '', placeholder: 'تفاصيل (اختياري)', 'aria-label': 'تفاصيل' });
    details.onchange = () => { d.details = details.value || undefined; };
    const due = h('input', { type: 'date', value: d.dueDate ?? '', 'aria-label': 'الموعد' });
    due.onchange = () => { d.dueDate = due.value || undefined; onChange(); };
    const mins = h('input', { type: 'number', min: 0, max: 600, value: d.estimatedMinutes ?? '', placeholder: 'غير محدد', 'aria-label': 'الوقت المتوقع بالدقائق' });
    mins.onchange = () => { d.estimatedMinutes = mins.value ? Math.max(0, +mins.value) : undefined; };
    const prio = h('select', { 'aria-label': 'الأولوية' }, ...[1, 2, 3].map(p => h('option', { value: p }, PRIORITY_LABEL[p])));
    prio.value = String(d.priority);
    prio.onchange = () => { d.priority = +prio.value; };
    const field = (label, el) => h('label', { class: 'field' }, h('span', null, label), el);
    return h('div', { class: 'grid2' }, field('المادة', subj), field('نوع الواجب', type), field('الصفحات', pages), field('الدرس', lesson), field('التفاصيل', details), field('الموعد', due), field('الوقت المتوقع (دقيقة)', mins), field('الأولوية', prio));
}
// ================= مراجعة المهام المستخرجة =================
export function draftsView(root) {
    if (!state.drafts.length) {
        root.append(emptyState('لا توجد مهام لمراجعتها', 'اكتب تحضيرك في الصفحة الرئيسية أولًا.', link('الرئيسية', '#/')));
        return;
    }
    root.append(h('h1', null, 'راجع المهام المستخرجة'), h('p', { class: 'muted' }, state.draftSource === 'image'
        ? 'هذه المهام مستخرجة من صورة وقد تحتوي أخطاء قراءة. صحّح كل حقل قبل الحفظ.'
        : 'هذا ما فهمناه من كلامك. صحّح أي حقل قبل الحفظ.'));
    const list = h('div', { class: 'stack' });
    const render = () => {
        clear(list);
        state.drafts.forEach((d, i) => {
            list.appendChild(card(h('div', { class: 'row between' }, h('div', { class: 'muted small' }, `النص الأصلي: «${d.rawLine}»`), btn(icon('trash'), () => { state.drafts.splice(i, 1); render(); }, 'ghost', { 'aria-label': 'حذف' })), d.warnings.length ? h('ul', { class: 'warn-list' }, ...d.warnings.map(w => h('li', null, w))) : null, taskEditor(d, () => { d.priority = computePriority(d.type, d.dueDate, new Date()); })));
        });
    };
    render();
    root.append(list, h('div', { class: 'row sticky-actions' }, btn('أضف مهمة يدويًا', () => {
        state.drafts.push({ subjectId: null, type: 'study', pages: [], priority: 2, rawLine: '(يدوي)', warnings: [] });
        render();
    }, 'ghost'), btn([icon('check'), ' احفظ المهام'], async () => {
        const missing = state.drafts.filter(d => !d.subjectId).length;
        if (missing) {
            toast(`حدّد المادة لـ ${missing} مهمة.`, 'warn');
            return;
        }
        await saveDrafts(state.drafts, state.draftSource);
        toast(`تم حفظ المهام (${state.drafts.length})`);
        state.drafts = [];
        state.draftSource = 'text';
        location.hash = '#/tasks';
    }, 'primary')));
}
// ================= جدول التحضير =================
export async function tasksView(root) {
    const all = sortTasks(await db.all('tasks'));
    const settings = await getSettings();
    root.append(h('div', { class: 'row between' }, h('h1', null, 'جدول التحضير'), link('+ تحضير جديد', '#/')));
    if (!all.length) {
        root.append(emptyState('لا توجد مهام بعد', 'اكتب تحضيرك في الصفحة الرئيسية وسنرتبه لك.', link('أضف التحضير', '#/')));
        return;
    }
    const open = all.filter(t => t.status !== 'done');
    const withEst = open.filter(t => t.estimatedMinutes);
    const total = withEst.reduce((a, t) => a + (t.estimatedMinutes ?? 0), 0);
    const plan = h('p', { class: 'muted' }, `${open.length} مهمة مفتوحة. `, withEst.length ? `الوقت المقدّر لـ ${withEst.length} منها: ${total} دقيقة من أصل ${settings.dailyMinutes} دقيقة متاحة يوميًا. ` : 'لم تحدد أوقاتًا تقديرية للمهام. ', total > settings.dailyMinutes ? 'المهام أكثر من وقتك المتاح؛ ابدأ بالأولوية العالية.' : '', open.length - withEst.length > 0 && withEst.length ? `(${open.length - withEst.length} مهمة بلا تقدير وقت)` : '');
    root.append(plan);
    const today = todayIso();
    const list = h('div', { class: 'stack' });
    for (const t of all)
        list.appendChild(taskCard(t, today, () => { clear(root); void tasksView(root); }));
    root.append(list);
}
function taskCard(t, today, refresh) {
    const overdue = t.dueDate && t.dueDate < today && t.status !== 'done';
    const set = async (patch) => { Object.assign(t, patch); await updateTask(t); refresh(); };
    const actions = h('div', { class: 'row wrap' });
    if (t.status === 'pending')
        actions.append(btn([icon('play'), ' ابدأ التحضير'], () => startTask(t), 'primary'));
    if (t.status === 'paused')
        actions.append(btn([icon('play'), ' أكمل الدراسة'], () => startTask(t), 'primary'));
    if (t.status === 'in_progress') {
        actions.append(btn([icon('play'), ' أكمل الدراسة'], () => startTask(t), 'primary'));
        actions.append(btn([icon('pause'), ' إيقاف مؤقت'], () => set({ status: 'paused' })));
    }
    if (t.status !== 'done') {
        actions.append(link([icon('flag'), ' خلصت التحضير'], `#/finish/${t.id}`, 'btn btn-soft'));
        actions.append(btn([icon('check'), ' تم الإنجاز'], () => set({ status: 'done', progress: 100 })));
    }
    else {
        actions.append(btn('إعادة فتح', () => set({ status: 'pending' }), 'ghost'));
    }
    actions.append(btn([icon('edit'), ' تعديل'], () => editTaskDialog(t, refresh), 'ghost'));
    actions.append(btn([icon('trash')], async () => {
        if (await confirmDialog('حذف هذه المهمة؟')) {
            await db.delete('tasks', t.id);
            refresh();
        }
    }, 'ghost', { 'aria-label': 'حذف المهمة' }));
    return card(h('div', { class: 'row between wrap' }, h('div', null, h('div', { class: 'task-title' }, h('span', { class: `dot p${t.priority}` }), `${subjectName(t.subjectId)} — ${TASK_TYPE_LABEL[t.type]}`), h('div', { class: 'muted small' }, [pagesLabel(t.pages), t.lessonText, t.details].filter(Boolean).join(' · ') || t.rawLine)), h('div', { class: 'row wrap' }, badge(STATUS_LABEL[t.status], t.status === 'done' ? 'ok' : t.status === 'in_progress' ? 'info' : 'muted'), badge(`أولوية ${PRIORITY_LABEL[t.priority]}`, t.priority === 1 ? 'warn' : 'muted'), t.dueDate ? badge(`الموعد ${fmtDate(t.dueDate)}`, overdue ? 'err' : 'muted') : null, t.estimatedMinutes ? badge(`${t.estimatedMinutes} د`, 'muted') : null)), t.pages.length ? h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': t.progress, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('div', { class: 'progress-bar', style: `width:${t.progress}%` })) : null, t.pages.length ? h('div', { class: 'muted tiny' }, `أنجزت ${t.studiedPages.filter(p => t.pages.includes(p)).length} من ${t.pages.length} صفحة`) : null, t.notes ? h('p', { class: 'small' }, `ملاحظاتك: ${t.notes}`) : null, actions);
}
async function startTask(t) {
    if (t.status !== 'in_progress') {
        t.status = 'in_progress';
        await updateTask(t);
    }
    if (!t.bookId && t.subjectId) {
        const b = (await booksForSubject(t.subjectId))[0];
        if (b) {
            t.bookId = b.id;
            await updateTask(t);
        }
    }
    if (t.bookId && t.pages.length) {
        const next = t.pages.find(p => !t.studiedPages.includes(p)) ?? t.pages[0];
        location.hash = `#/page/${encodeURIComponent(t.bookId)}/${next}/${t.id}`;
    }
    else if (t.subjectId) {
        location.hash = `#/subject/${t.subjectId}`;
    }
    else {
        location.hash = '#/library';
    }
}
function editTaskDialog(t, refresh) {
    const copy = JSON.parse(JSON.stringify(t));
    const notes = h('textarea', { rows: 2, placeholder: 'ملاحظاتك' }, copy.notes ?? '');
    const dlg = h('dialog', { class: 'dialog wide' }, h('h2', null, 'تعديل المهمة'), taskEditor(copy, () => { }), h('label', { class: 'field' }, h('span', null, 'ملاحظات'), notes), h('div', { class: 'row end' }, btn('إلغاء', () => dlg.close(), 'ghost'), btn('حفظ', async () => {
        copy.notes = notes.value || undefined;
        if (copy.subjectId !== t.subjectId)
            copy.bookId = undefined;
        await updateTask(copy);
        dlg.close();
        refresh();
    }, 'primary')));
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 50));
    dlg.showModal();
}
// ================= خلصت التحضير =================
export async function finishView(root, taskId) {
    const t = await db.get('tasks', taskId);
    if (!t) {
        root.append(emptyState('المهمة غير موجودة', '', link('المهام', '#/tasks')));
        return;
    }
    root.append(h('h1', null, 'خلصت التحضير'), h('p', { class: 'muted' }, `${subjectName(t.subjectId)} — ${TASK_TYPE_LABEL[t.type]} ${pagesLabel(t.pages)}`));
    let book = t.bookId ? await db.get('books', t.bookId) : undefined;
    const subjectBooks = t.subjectId ? await booksForSubject(t.subjectId) : [];
    if (!book)
        book = subjectBooks[0];
    if (book && subjectBooks.length > 1) {
        // أكثر من كتاب للمادة: الطالب يختار كتابه، ويُحفظ اختياره في المهمة
        const sel = h('select', null, ...subjectBooks.map(b => h('option', { value: b.id, selected: b.id === book.id }, `${b.title} — ${b.edition}`)));
        sel.onchange = async () => { t.bookId = sel.value; await updateTask(t); clear(root); await finishView(root, taskId); };
        root.append(card(h('label', { class: 'field' }, h('span', null, 'الكتاب'), sel)));
    }
    if (!book) {
        root.append(card(h('h2', null, 'لا يوجد كتاب مستورد لهذه المادة'), h('p', null, 'لا يمكن إنشاء اختبار أو عرض ملخصات قبل استيراد كتاب المادة الرسمي واستخراج صفحاته. لن نختبرك بأسئلة من خارج كتابك.'), h('div', { class: 'row wrap' }, link('استيراد الكتاب', '#/admin'), btn('سجّل المهمة كمنجزة', async () => { t.status = 'done'; t.progress = 100; await updateTask(t); location.hash = '#/tasks'; }))));
        return;
    }
    if (!t.pages.length) {
        root.append(card(h('p', null, 'المهمة لا تحدد صفحات. عدّل المهمة وأضف الصفحات التي درستها، أو اختر اختبارًا شاملًا للكتاب.'), link('اختبار شامل', `#/quizsetup/${encodeURIComponent(book.id)}/all`)));
        return;
    }
    // 1) تحديد الصفحات
    const chosen = new Set(t.studiedPages.length ? t.studiedPages.filter(p => t.pages.includes(p)) : t.pages);
    const pagesBox = h('div', { class: 'chips' });
    for (const p of t.pages) {
        const cb = h('input', { type: 'checkbox', checked: chosen.has(p) });
        cb.onchange = () => { if (cb.checked)
            chosen.add(p);
        else
            chosen.delete(p); void refreshPlan(); };
        pagesBox.append(h('label', { class: 'chip' }, cb, ` ${p}`));
    }
    const comp = h('input', { type: 'checkbox' });
    const unrev = h('input', { type: 'checkbox', checked: true });
    comp.onchange = unrev.onchange = () => void refreshPlan();
    const avail = h('div');
    const planBox = h('div');
    root.append(card(h('h2', null, '1. الصفحات التي درستها'), pagesBox, h('label', { class: 'row' }, comp, ' اختبار شامل لكل الكتاب (اختياري)'), h('label', { class: 'row' }, unrev, ' تضمين الأسئلة التدريبية التي لم تتم مراجعتها بعد (موسومة بوضوح)')), card(h('h2', null, '2. توفر المحتوى'), avail), card(h('h2', null, '3. الاختبار'), planBox));
    const allQ = await db.all('questions');
    const pages = await pagesForBook(book.id);
    const lessons = await db.byIndex('lessons', 'bookId', book.id);
    const refreshPlan = async () => {
        clear(avail);
        const sel = [...chosen].sort((a, b) => a - b);
        const rows = await Promise.all(sel.map(async (p) => {
            const pg = pages.find(x => x.printedPage === p);
            const sum = await summaryFor(book.id, p);
            const qs = await questionsForPage(book.id, p);
            return h('tr', null, h('td', null, String(p)), h('td', null, pg ? (pg.status === 'ok' ? badge('نص متوفر', 'ok') : badge('نص يحتاج مراجعة', 'warn')) : badge('غير مستورد', 'err')), h('td', null, sum ? link(sum.reviewStatus === 'reviewed' || sum.reviewStatus === 'verified' ? 'ملخص مراجَع' : 'ملخص غير مراجَع', `#/page/${encodeURIComponent(book.id)}/${p}`, 'lnk') : h('span', { class: 'muted' }, 'لا يوجد ملخص')), h('td', null, String(qs.length)));
        }));
        avail.append(h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'الصفحة'), h('th', null, 'النص'), h('th', null, 'الملخص'), h('th', null, 'أسئلة'))), h('tbody', null, ...rows))));
        clear(planBox);
        const plan = planQuiz(allQ, { bookId: book.id, pages: sel, comprehensive: comp.checked, includeUnreviewed: unrev.checked, max: 10 });
        // ملخصات الدروس («ملخصاتي») التي تغطي الصفحات المختارة
        const lessonLinks = lessons.filter(l => l.pages.some(p => chosen.has(p)));
        if (lessonLinks.length)
            planBox.append(h('p', null, 'ملخص الدرس وأسئلة مراجعته في «ملخصاتي»: ', ...lessonLinks.map((l, i) => [i ? '، ' : '', link(l.title, `#/m/l/${encodeURIComponent(l.id)}`, 'lnk')]).flat()));
        if (!plan.questions.length) {
            planBox.append(h('p', null, 'لا توجد أسئلة اختبار مرتبطة بهذه الصفحات حتى الآن. يمكن توليد أسئلة تدريبية من نص الصفحات في أداة المحتوى.'), link('أداة المحتوى', `#/admin/book/${encodeURIComponent(book.id)}`));
            return;
        }
        const c = plan.countsByOrigin;
        planBox.append(h('p', null, `عدد الأسئلة: ${plan.questions.length}`), h('ul', null, h('li', null, `وزاري أصلي موثق: ${c.ministerial_verified}`), h('li', null, `تدريبي مولّد من الكتاب: ${c.book_generated}`), h('li', null, `مراجعة من إعداد المنصة: ${c.platform_review}`)), !plan.hasVerifiedMinisterial ? h('p', { class: 'note' }, 'لا توجد أسئلة وزارية موثقة مرتبطة بهذه الصفحات حتى الآن. الاختبار يتكون من أسئلة تدريبية فقط.') : '', plan.pagesWithoutQuestions.length ? h('p', { class: 'muted small' }, `صفحات بلا أسئلة: ${plan.pagesWithoutQuestions.join('، ')}`) : '', btn([icon('play'), ' ابدأ الاختبار'], () => {
            state.quiz = { questions: plan.questions, bookId: book.id, pages: sel, taskId: t.id, comprehensive: comp.checked, answers: {}, index: 0, startedAt: new Date().toISOString() };
            location.hash = '#/quiz';
        }, 'primary'));
    };
    await refreshPlan();
}
