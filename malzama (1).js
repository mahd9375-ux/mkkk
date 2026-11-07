/** تصنيف السؤال كما يُعرض للطالب. «★ مهم — وزاري» فقط لسؤال وزاري أصلي موثق. */
export function categoryOf(q) {
    if (q.origin === 'ministerial_verified' && q.reviewStatus === 'verified')
        return 'ministerial';
    if (q.origin === 'ministerial_verified' || q.origin === 'ministerial_unverified')
        return 'ministerial_unverified';
    if (q.origin === 'book_exercise')
        return 'book_exercise';
    if (q.importance === 'important')
        return 'important';
    return 'practice';
}
export const CATEGORY_LABEL = {
    ministerial: '★ مهم — وزاري',
    ministerial_unverified: 'وزاري — بيانات المصدر غير مكتملة',
    important: 'مهم للمراجعة',
    practice: 'سؤال تدريبي',
    book_exercise: 'سؤال من الكتاب',
};
const ROUND_ORDER = { 'الدور الأول': 1, 'الدور الثاني': 2, 'الدور الثالث': 3, 'التمهيدي': 0 };
export function lessonPageRange(ch, lessonId) {
    const l = ch?.lessons.find(x => x.id === lessonId);
    return l ? { from: l.fromPage, to: l.toPage } : null;
}
/** الأسئلة الوزارية (الموثقة وغير المكتملة) المرتبطة بدرس، مرتبة بالسنة ثم الدور */
export function ministerialForLesson(lesson, ch, all) {
    const range = lessonPageRange(ch, lesson.lessonId);
    const pages = new Set(lesson.pages);
    const out = [];
    for (const q of all) {
        if (q.origin !== 'ministerial_verified' && q.origin !== 'ministerial_unverified')
            continue;
        if (q.reviewStatus === 'rejected')
            continue;
        if (q.lessonId === lesson.lessonId) {
            out.push({ q, precision: 'lesson' });
            continue;
        }
        let best = null;
        for (const l of q.links) {
            if (l.bookId !== lesson.bookId || l.status !== 'confirmed')
                continue;
            const inLesson = l.printedPages.some(p => pages.has(p) || (range !== null && p >= range.from && p <= range.to));
            if (inLesson) {
                best = 'lesson';
                break;
            }
            if (l.printedPages.length === 0 && l.chapterId === lesson.chapterId)
                best = 'chapter';
        }
        if (best)
            out.push({ q, precision: best });
    }
    return out.sort((a, b) => (b.q.exam?.year ?? 0) - (a.q.exam?.year ?? 0) ||
        (ROUND_ORDER[a.q.exam?.round ?? ''] ?? 9) - (ROUND_ORDER[b.q.exam?.round ?? ''] ?? 9));
}
export const SECTION_ORDER = [
    { kind: 'definition', title: 'التعاريف' },
    { kind: 'reason', title: 'التعاليل' },
    { kind: 'comparison', title: 'المقارنات' },
    { kind: 'law', title: 'القوانين' },
    { kind: 'problem', title: 'المسائل المحلولة' },
    { kind: 'note', title: 'معلومات مهمة للحفظ' },
    { kind: 'review', title: 'أسئلة المراجعة' },
];
const pagesTxt = (p) => (p.length ? ` (ص ${p.join('، ')})` : '');
/** نص عادي للنسخ — يحافظ على الترتيب ويذكر الصفحات والمصدر */
export function lessonToText(l, bookTitle) {
    const out = [`${l.title}`, `${bookTitle} — ${l.source}`, `الصفحات: ${l.pages.join('، ')}`];
    if (l.intro)
        out.push('', l.intro);
    for (const sec of SECTION_ORDER) {
        const items = l.items.filter(i => i.kind === sec.kind);
        if (!items.length)
            continue;
        out.push('', `■ ${sec.title}`);
        items.forEach((it, i) => {
            const n = `${i + 1}- `;
            switch (it.kind) {
                case 'definition':
                    out.push(`${n}${it.term}: ${it.text}${pagesTxt(it.pages)}`);
                    break;
                case 'reason':
                    out.push(`${n}علّل: ${it.question}`, `   ج/ ${it.answer}${pagesTxt(it.pages)}`);
                    break;
                case 'comparison':
                    out.push(`${n}${it.title ?? 'مقارنة'}${pagesTxt(it.pages)}`);
                    if (it.headers)
                        out.push('   ' + it.headers.join(' | '));
                    for (const r of it.rows ?? [])
                        out.push('   ' + r.join(' | '));
                    break;
                case 'law':
                    out.push(`${n}${it.title ?? ''}: ${it.formula ?? ''}${pagesTxt(it.pages)}`);
                    for (const [s, m, u] of it.symbols ?? [])
                        out.push(`   ${s}: ${m}${u ? ` (${u})` : ''}`);
                    if (it.text)
                        out.push(`   ${it.text}`);
                    break;
                case 'problem':
                    out.push(`${n}${it.question ?? it.title ?? ''}${pagesTxt(it.pages)}`);
                    (it.steps ?? []).forEach((s, k) => out.push(`   ${k + 1}) ${s}`));
                    if (it.result)
                        out.push(`   الناتج: ${it.result}`);
                    break;
                case 'note':
                    out.push(`${n}${it.text}${pagesTxt(it.pages)}`);
                    break;
                case 'review':
                    out.push(`${n}س/ ${it.question}`, `   ج/ ${it.answer}${pagesTxt(it.pages)}`);
                    break;
            }
        });
    }
    return out.join('\n');
}
/** فحص بنية ملخص الدرس — يُستخدم في الاختبارات وأداة البناء */
export function validateLesson(l, ch) {
    const errs = [];
    // البند قد يستشهد بصفحة من الفصل نفسه خارج صفحات الدرس (مثل أسئلة نهاية الفصل)، لا خارج الفصل
    const lo = ch ? Math.min(...ch.lessons.map(x => x.fromPage)) - 2 : Math.min(...l.pages);
    const hi = ch ? Math.max(...ch.lessons.map(x => x.toPage)) : Math.max(...l.pages);
    if (!l.items.length)
        errs.push(`${l.id}: لا بنود`);
    for (const [i, it] of l.items.entries()) {
        const tag = `${l.id}#${i}`;
        if (!Array.isArray(it.pages) || !it.pages.length)
            errs.push(`${tag}: بلا صفحة مصدر`);
        if (it.pages?.some(p => p < lo || p > hi))
            errs.push(`${tag}: صفحة خارج نطاق ${ch ? 'الفصل' : 'الدرس'}`);
        if (it.kind === 'definition' && !(it.term && it.text))
            errs.push(`${tag}: تعريف ناقص`);
        if ((it.kind === 'reason' || it.kind === 'review') && !(it.question && it.answer))
            errs.push(`${tag}: سؤال بلا جواب`);
        if (it.kind === 'comparison' && !(it.headers?.length && it.rows?.length && it.rows.every(r => r.length === it.headers.length)))
            errs.push(`${tag}: جدول مقارنة غير متسق`);
        if (it.kind === 'law' && !it.formula)
            errs.push(`${tag}: قانون بلا صيغة`);
        if (it.kind === 'problem' && !(it.steps?.length && it.result))
            errs.push(`${tag}: مسألة بلا خطوات أو ناتج`);
        if (it.kind === 'note' && !it.text)
            errs.push(`${tag}: ملاحظة فارغة`);
    }
    return errs;
}
