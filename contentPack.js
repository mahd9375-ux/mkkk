export const PACK_FORMAT = 'tahdiri-content';
export const PACK_VERSION = 1;
export function validatePack(obj) {
    const errors = [];
    const warnings = [];
    if (!obj || typeof obj !== 'object')
        return { ok: false, errors: ['ليس JSON صالحًا'], warnings };
    const p = obj;
    if (p.format !== PACK_FORMAT)
        errors.push('صيغة الحزمة غير معروفة');
    if (typeof p.version !== 'number' || p.version > PACK_VERSION)
        errors.push('إصدار الحزمة غير مدعوم');
    for (const k of ['books', 'chapters', 'pages', 'summaries', 'questions']) {
        if (!Array.isArray(p[k]))
            errors.push(`الحقل ${k} مفقود أو ليس قائمة`);
    }
    if (errors.length)
        return { ok: false, errors, warnings };
    const bookIds = new Set(p.books.map(b => b.id));
    for (const b of p.books) {
        if (!b.id || !b.subjectId || !b.title)
            errors.push(`كتاب ناقص البيانات: ${b.id ?? '?'}`);
        if (!b.sourceUrl)
            warnings.push(`الكتاب ${b.title} بلا رابط مصدر`);
        if (b.verificationStatus === 'verified' && !b.sha256)
            errors.push(`الكتاب ${b.title} موسوم «متحقق» بلا بصمة ملف`);
    }
    for (const pg of p.pages) {
        if (!bookIds.has(pg.bookId))
            errors.push(`صفحة مرتبطة بكتاب غير موجود: ${pg.id}`);
        if (typeof pg.printedPage !== 'number')
            errors.push(`صفحة بلا رقم مطبوع: ${pg.id}`);
    }
    const questions = p.questions.map(q => {
        if (q.origin === 'ministerial_verified') {
            const e = q.exam;
            if (!e || !(e.sourceUrl || e.sourceImage || (e.verificationMethod === 'user_confirmed_against_original_exam' && e.sourceLabel && e.sourcePage)) || !e.year || !e.round) {
                warnings.push(`السؤال ${q.id} موسوم «وزاري موثق» بلا مصدر/سنة/دور كاملة؛ خُفّض إلى «غير متحقق».`);
                return { ...q, origin: 'ministerial_unverified', reviewStatus: 'unverified' };
            }
            if (q.reviewStatus !== 'verified') {
                warnings.push(`السؤال ${q.id} وزاري لكن حالته ليست «verified»؛ لن يُعرض كوزاري موثق.`);
                return { ...q, origin: 'ministerial_unverified' };
            }
        }
        return q;
    });
    if (p.lessons !== undefined) {
        if (!Array.isArray(p.lessons))
            errors.push('الحقل lessons ليس قائمة');
        else
            for (const l of p.lessons) {
                if (!l.id || !bookIds.has(l.bookId) || !Array.isArray(l.items))
                    errors.push(`ملخص درس غير صالح: ${l.id ?? '?'}`);
            }
    }
    if (errors.length)
        return { ok: false, errors, warnings };
    return { ok: true, errors, warnings, pack: { ...p, questions } };
}
