// الاختبار، النتائج، المراجعة الذكية، وتقدم الطالب.
import { h, btn, link, card, badge, emptyState, toast, icon, clear, fmtDate } from './dom.js';
import { state } from './state.js';
import { analyze, gradeQuestion, GRADING_RULES, planQuiz, TYPE_LABEL } from '../quiz.js';
import { db, uid } from '../db.js';
import { getSettings, recordAttempt, saveSettings, updateTask } from '../services.js';
import { dueItems } from '../review.js';
import { subjectName } from '../subjects.js';
import { originBadge } from './library.js';
// ================= الاختبار =================
export function quizView(root) {
    const qz = state.quiz;
    if (!qz || !qz.questions.length) {
        root.append(emptyState('لا يوجد اختبار جارٍ', 'ابدأ اختبارًا من «خلصت التحضير» أو من صفحة الكتاب.', link('جدول التحضير', '#/tasks')));
        return;
    }
    const render = () => {
        clear(root);
        const q = qz.questions[qz.index];
        const total = qz.questions.length;
        root.append(h('div', { class: 'row between' }, h('h1', null, 'الاختبار'), h('span', { class: 'muted' }, `سؤال ${qz.index + 1} من ${total}`)), h('div', { class: 'progress' }, h('div', { class: 'progress-bar', style: `width:${Math.round(((qz.index + 1) / total) * 100)}%` })));
        const body = card(h('div', { class: 'row wrap gap-s' }, originBadge(q), badge(TYPE_LABEL[q.type] ?? q.type, 'muted'), q.exam?.year ? badge(`وزاري ${q.exam.year} ${q.exam.round ?? ''}`, 'ok') : null), h('p', { class: 'q-prompt', dir: 'auto' }, q.prompt));
        const cur = qz.answers[q.id] ?? '';
        const set = (v) => { qz.answers[q.id] = v; };
        if (q.type === 'mcq' && q.options) {
            const group = h('div', { class: 'opts-input', role: 'radiogroup' });
            q.options.forEach((o, i) => {
                const r = h('input', { type: 'radio', name: 'opt', value: o, id: `o${i}`, checked: cur === o });
                r.onchange = () => set(o);
                group.append(h('label', { class: 'opt', for: `o${i}` }, r, h('span', { dir: 'auto' }, o)));
            });
            body.append(group);
        }
        else if (q.type === 'true_false') {
            const group = h('div', { class: 'opts-input', role: 'radiogroup' });
            for (const o of ['صح', 'خطأ']) {
                const r = h('input', { type: 'radio', name: 'opt', value: o, checked: cur === o });
                r.onchange = () => set(o);
                group.append(h('label', { class: 'opt' }, r, h('span', null, o)));
            }
            body.append(group);
        }
        else if (q.type === 'fill_blank' || q.type === 'calc') {
            const inp = h('input', { value: cur, dir: 'auto', placeholder: q.type === 'calc' ? `اكتب الناتج مع الوحدة${q.unit ? ` (${q.unit})` : ''}` : 'اكتب الكلمة الناقصة', 'aria-label': 'إجابتك' });
            inp.oninput = () => set(inp.value);
            body.append(inp);
        }
        else {
            const ta = h('textarea', { rows: 4, dir: 'auto', placeholder: 'اكتب إجابتك', 'aria-label': 'إجابتك' }, cur);
            ta.oninput = () => set(ta.value);
            body.append(ta, h('p', { class: 'muted tiny' }, 'هذا النوع يُصحح تصحيحًا آليًا تقريبيًا، وستتمكن من مقارنة إجابتك بالنموذجية.'));
        }
        root.append(body, h('div', { class: 'row between' }, qz.index > 0 ? btn([icon('chevronR'), ' السابق'], () => { qz.index--; render(); }, 'ghost') : h('span'), qz.index < total - 1
            ? btn(['التالي ', icon('chevronL')], () => { qz.index++; render(); }, 'primary')
            : btn([icon('check'), ' أنهِ الاختبار وصحّح'], finish, 'primary')), h('details', { class: 'muted small' }, h('summary', null, 'قواعد التصحيح'), h('ul', null, ...GRADING_RULES.map(r => h('li', null, r)))));
    };
    const finish = async () => {
        const unanswered = qz.questions.filter(q => !(qz.answers[q.id] ?? '').trim()).length;
        if (unanswered && !confirm(`لم تجب عن ${unanswered} سؤال. هل تريد إنهاء الاختبار؟`))
            return;
        const results = qz.questions.map(q => gradeQuestion(q, qz.answers[q.id] ?? ''));
        const att = {
            id: uid('att'),
            taskId: qz.taskId,
            bookId: qz.bookId,
            pages: qz.pages,
            questionIds: qz.questions.map(q => q.id),
            results,
            score: results.reduce((a, r) => a + r.score, 0),
            maxScore: results.length,
            startedAt: qz.startedAt,
            finishedAt: new Date().toISOString(),
            comprehensive: qz.comprehensive,
        };
        await recordAttempt(att, qz.questions);
        if (qz.taskId) {
            const t = await db.get('tasks', qz.taskId);
            if (t) {
                t.studiedPages = [...new Set([...t.studiedPages, ...qz.pages])];
                t.status = 'done';
                await updateTask(t);
            }
        }
        state.quiz = null;
        location.hash = `#/results/${att.id}`;
    };
    render();
}
// ================= النتائج =================
export async function resultsView(root, attemptId) {
    const att = await db.get('attempts', attemptId);
    if (!att) {
        root.append(emptyState('النتيجة غير موجودة', ''));
        return;
    }
    const allQ = await db.all('questions');
    const byId = new Map(allQ.map(q => [q.id, q]));
    const qs = att.questionIds.map(id => byId.get(id)).filter((q) => !!q);
    const a = analyze(qs, att.results);
    root.append(h('h1', null, 'نتيجة الاختبار'), card(h('div', { class: 'score' }, h('span', { class: 'score-num' }, `${Math.round(a.total * 10) / 10} / ${a.max}`), h('span', { class: 'score-pct' }, `${a.percent}%`)), h('p', { class: 'muted small' }, `بتاريخ ${fmtDate(att.finishedAt)}. الدرجة محسوبة من إجاباتك وفق قواعد التصحيح المعلنة.`), a.strongPages.length ? h('p', null, `صفحات أتقنتها: ${a.strongPages.join('، ')}`) : null, a.weakPages.length ? h('p', null, `صفحات تحتاج مراجعة: `, ...a.weakPages.map(p => link(String(p), `#/page/${encodeURIComponent(att.bookId ?? '')}/${p}`, 'lnk pg-link'))) : null, a.advice.length ? h('ul', { class: 'advice' }, ...a.advice.map(x => h('li', null, x))) : null, h('div', { class: 'row wrap' }, btn([icon('repeat'), ' أعد الاختبار'], () => {
        state.quiz = { questions: [...qs].sort(() => Math.random() - 0.5), bookId: att.bookId ?? '', pages: att.pages, taskId: undefined, comprehensive: att.comprehensive, answers: {}, index: 0, startedAt: new Date().toISOString() };
        location.hash = '#/quiz';
    }, 'primary'), link('المراجعة', '#/review'))));
    att.results.forEach((r, i) => {
        const q = byId.get(r.questionId);
        if (!q)
            return;
        const verdict = r.score === 1 ? badge('صحيحة', 'ok') : r.score > 0 ? badge('صحيحة جزئيًا', 'warn') : badge('خاطئة', 'err');
        const override = (q.type !== 'mcq' && q.type !== 'true_false') ? h('div', { class: 'row wrap gap-s' }, h('span', { class: 'tiny muted' }, 'بعد المقارنة بالإجابة النموذجية:'), btn('احسبها صحيحة', async () => { r.score = 1; r.correct = true; r.autoGradeNote = (r.autoGradeNote ?? '') + ' (عدّلها الطالب)'; await saveOverride(att); }, 'ghost'), btn('احسبها خاطئة', async () => { r.score = 0; r.correct = false; r.autoGradeNote = (r.autoGradeNote ?? '') + ' (عدّلها الطالب)'; await saveOverride(att); }, 'ghost')) : null;
        const pages = q.links.filter(l => l.status === 'confirmed').flatMap(l => l.printedPages);
        root.append(card(h('div', { class: 'row between wrap' }, h('strong', null, `السؤال ${i + 1}`), h('div', { class: 'row wrap gap-s' }, verdict, originBadge(q))), h('p', { dir: 'auto' }, q.prompt), h('div', { class: 'small' }, h('strong', null, 'إجابتك: '), h('span', { dir: 'auto' }, r.given || '—')), h('div', { class: 'small' }, h('strong', null, 'الإجابة النموذجية: '), h('span', { dir: 'auto' }, q.answer), q.origin === 'ministerial_verified' && !q.exam?.solutionOfficial ? h('span', { class: 'muted tiny' }, ' (حل مقترح من المنصة وليس حلًا رسميًا)') : null), q.explanation ? h('div', { class: 'muted small' }, q.explanation) : null, r.autoGradeNote ? h('div', { class: 'note small' }, r.autoGradeNote) : null, h('div', { class: 'tiny muted' }, 'المصدر: ', q.exam?.sourceUrl ? h('a', { href: q.exam.sourceUrl, target: '_blank', rel: 'noopener noreferrer', class: 'lnk' }, `وزاري ${q.exam.year ?? ''} ${q.exam.round ?? ''}`) : (q.origin === 'book_generated' ? 'مولّد من نص الكتاب' : 'المنصة'), pages.length ? [' · الصفحة ', ...pages.map(p => link(String(p), `#/page/${encodeURIComponent(att.bookId ?? q.bookId ?? '')}/${p}`, 'lnk'))] : ''), override));
    });
    async function saveOverride(att2) {
        att2.score = att2.results.reduce((s, x) => s + x.score, 0);
        await db.put('attempts', att2);
        toast('تم تحديث التصحيح');
        clear(root);
        await resultsView(root, att2.id);
    }
}
// ================= المراجعة الذكية =================
export async function reviewView(root) {
    const settings = await getSettings();
    const items = await db.all('review');
    const books = new Map((await db.all('books')).map(b => [b.id, b]));
    const toggle = h('input', { type: 'checkbox', checked: settings.recommendationsEnabled });
    toggle.onchange = async () => { await saveSettings({ recommendationsEnabled: toggle.checked }); clear(root); await reviewView(root); };
    root.append(h('h1', null, 'المراجعة'), h('label', { class: 'row small' }, toggle, ' تفعيل توصيات المراجعة'));
    if (!settings.recommendationsEnabled) {
        root.append(h('p', { class: 'muted' }, 'التوصيات معطلة.'));
        return;
    }
    const due = dueItems(items, new Date().toISOString());
    const flagged = items.filter(i => i.needsReview && !due.includes(i));
    if (!due.length && !flagged.length) {
        root.append(emptyState('لا توجد مراجعة مستحقة الآن', 'عندما تدرس صفحات وتحل اختبارات، سنقترح عليك مراجعتها في أوقات مناسبة.'));
        return;
    }
    const row = (i) => {
        const b = books.get(i.bookId);
        const reason = i.mistakes > 0 ? `أخطأت في ${i.mistakes} سؤال من هذه الصفحة` : i.selfRating && i.selfRating <= 2 ? 'قيّمت فهمك لها منخفضًا' : 'حان موعد مراجعتها';
        return card(h('div', { class: 'row between wrap' }, h('div', null, h('strong', null, `${b ? subjectName(b.subjectId) : ''} — صفحة ${i.printedPage}`), h('div', { class: 'muted small' }, `${reason}. راجعتها ${i.reviews} مرة.`)), h('div', { class: 'row wrap' }, link('راجع الصفحة', `#/page/${encodeURIComponent(i.bookId)}/${i.printedPage}`), btn('اختبار قصير', async () => {
            const p = planQuiz(await db.all('questions'), { bookId: i.bookId, pages: [i.printedPage], includeUnreviewed: true, max: 5 });
            if (!p.questions.length) {
                toast('لا توجد أسئلة لهذه الصفحة', 'warn');
                return;
            }
            state.quiz = { questions: p.questions, bookId: i.bookId, pages: [i.printedPage], comprehensive: false, answers: {}, index: 0, startedAt: new Date().toISOString() };
            location.hash = '#/quiz';
        }, 'ghost'))));
    };
    if (due.length)
        root.append(h('h2', null, 'مستحقة الآن'), ...due.map(row));
    if (flagged.length)
        root.append(h('h2', null, 'علّمتها «تحتاج مراجعة»'), ...flagged.map(row));
    root.append(h('p', { class: 'muted tiny' }, 'التوصيات تقديرية مبنية على أخطائك وتقييمك الذاتي وعدد مرات المراجعة والوقت منذ آخر مراجعة. لا تعني أن سؤالًا معينًا سيأتي في الامتحان.'));
}
// ================= التقدم =================
export async function progressView(root) {
    const tasks = await db.all('tasks');
    const atts = (await db.all('attempts')).sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
    const rev = await db.all('review');
    const books = new Map((await db.all('books')).map(b => [b.id, b]));
    root.append(h('h1', null, 'تقدّمي'));
    const done = tasks.filter(t => t.status === 'done').length;
    root.append(h('div', { class: 'stats' }, stat('مهام منجزة', `${done} / ${tasks.length}`), stat('صفحات مدروسة', String(rev.filter(r => r.studied).length)), stat('اختبارات', String(atts.length)), stat('متوسط الدرجات', atts.length ? `${Math.round(atts.reduce((a, x) => a + (x.maxScore ? x.score / x.maxScore : 0), 0) / atts.length * 100)}%` : '—')));
    const perBook = new Map();
    for (const r of rev.filter(r => r.studied))
        perBook.set(r.bookId, (perBook.get(r.bookId) ?? 0) + 1);
    if (perBook.size) {
        root.append(card(h('h2', null, 'حسب الكتاب'), ...[...perBook.entries()].map(([id, n]) => {
            const b = books.get(id);
            const pct = b?.pageCount ? Math.round((n / b.pageCount) * 100) : null;
            return h('div', { class: 'stack-s' }, h('div', { class: 'small' }, `${b?.title ?? id}: ${n} صفحة${pct !== null ? ` (${pct}%)` : ''}`), pct !== null ? h('div', { class: 'progress' }, h('div', { class: 'progress-bar', style: `width:${pct}%` })) : null);
        })));
    }
    if (atts.length) {
        root.append(card(h('h2', null, 'سجل الاختبارات'), h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'التاريخ'), h('th', null, 'الكتاب'), h('th', null, 'الصفحات'), h('th', null, 'الدرجة'))), h('tbody', null, ...atts.slice(0, 30).map(a => h('tr', null, h('td', null, link(fmtDate(a.finishedAt), `#/results/${a.id}`, 'lnk')), h('td', null, books.get(a.bookId ?? '')?.title ?? '—'), h('td', null, a.comprehensive ? 'شامل' : a.pages.join('، ')), h('td', null, `${Math.round(a.score * 10) / 10}/${a.maxScore}`))))))));
    }
    else
        root.append(h('p', { class: 'muted' }, 'لم تحل أي اختبار بعد.'));
}
function stat(label, value) {
    return h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, value), h('div', { class: 'stat-l' }, label));
}
