// بناء الاختبارات وتصحيحها وفق قواعد معلنة.
import { coverage, lightStem, normalize, tokenize, toLatinDigits } from './arabic.js';
import { shuffleSeeded } from './generator.js';
export const GRADING_RULES = [
    'الاختيار من متعدد وصح/خطأ: درجة كاملة للإجابة المطابقة وصفر لغيرها.',
    'أكمل الفراغ: تُقبل الإجابة إذا طابقت المرجع بعد توحيد الهمزات والتاء المربوطة و«ال» التعريف.',
    'المسائل الحسابية: تُقبل القيمة إذا كان الفرق عن المرجع أقل من 2%. نقص الوحدة يخصم ربع الدرجة. خطوات الحل لا تُفحص آليًا.',
    'التعاريف والتعاليل والأسئلة القصيرة: تقييم آلي تقريبي بحسب نسبة الكلمات الأساسية من الإجابة المرجعية الموجودة في إجابتك (60% فأكثر = كاملة، 30–60% = نصف). يمكنك مراجعة الإجابة النموذجية وتعديل الحكم بنفسك.',
];
function linkedToPages(q, bookId, pages, comprehensive) {
    return q.links.some(l => {
        if (l.bookId !== bookId)
            return false;
        if (l.status !== 'confirmed')
            return false;
        if (comprehensive)
            return true;
        return l.printedPages.length > 0 && l.printedPages.every(p => pages.has(p));
    });
}
export function planQuiz(all, sel) {
    const pages = new Set(sel.pages);
    const comprehensive = !!sel.comprehensive;
    const eligible = all.filter(q => {
        if (q.reviewStatus === 'rejected')
            return false;
        // الأسئلة المنسوبة للوزاري دون تحقق لا تدخل الاختبار كوزارية
        if (q.origin === 'ministerial_unverified')
            return false;
        // أسئلة نهاية الفصل تُعرض في صفحة الفصل، وتدخل الاختبار الشامل فقط
        if (q.origin === 'book_exercise' && !comprehensive)
            return false;
        if (q.origin === 'ministerial_verified' && q.reviewStatus !== 'verified')
            return false;
        if (!sel.includeUnreviewed && q.origin !== 'ministerial_verified' && !(q.reviewStatus === 'reviewed' || q.reviewStatus === 'verified'))
            return false;
        return linkedToPages(q, sel.bookId, pages, comprehensive);
    });
    const ministerial = eligible.filter(q => q.origin === 'ministerial_verified');
    const others = eligible.filter(q => q.origin !== 'ministerial_verified');
    const seed = sel.seed ?? Date.now() % 100000;
    const max = sel.max ?? 10;
    // نعطي الوزاري الموثق أولوية حتى ثلث الاختبار، ثم نوزع الباقي على الصفحات
    const mPick = shuffleSeeded(ministerial, seed).slice(0, Math.max(1, Math.floor(max / 3)));
    const byPage = new Map();
    for (const q of shuffleSeeded(others, seed + 7)) {
        const p = q.links[0]?.printedPages[0] ?? -1;
        if (!byPage.has(p))
            byPage.set(p, []);
        byPage.get(p).push(q);
    }
    const rest = [];
    const remaining = max - mPick.length;
    let added = true;
    while (rest.length < remaining && added) {
        added = false;
        for (const list of byPage.values()) {
            const q = list.shift();
            if (q) {
                rest.push(q);
                added = true;
                if (rest.length >= remaining)
                    break;
            }
        }
    }
    const questions = [...mPick, ...rest];
    const countsByOrigin = { ministerial_verified: 0, ministerial_unverified: 0, book_generated: 0, platform_review: 0, book_exercise: 0 };
    const countsByType = {};
    for (const q of questions) {
        countsByOrigin[q.origin]++;
        countsByType[q.type] = (countsByType[q.type] ?? 0) + 1;
    }
    const covered = new Set();
    for (const q of eligible)
        for (const l of q.links)
            for (const p of l.printedPages)
                covered.add(p);
    return {
        questions,
        countsByOrigin,
        countsByType,
        pagesWithoutQuestions: sel.pages.filter(p => !covered.has(p)),
        hasVerifiedMinisterial: mPick.length > 0,
    };
}
function normTerm(s) {
    return normalize(s)
        .split(' ')
        .map(lightStem)
        .join(' ')
        .replace(/[^\p{L}\p{N} ]/gu, '')
        .trim();
}
export function parseNumber(s) {
    const t = toLatinDigits(s).replace(/٫/g, '.').replace(/,/g, '.');
    const m = /-?\d+(?:\.\d+)?(?:\s*[x×]\s*10\s*\^?\s*(-?\d+))?/.exec(t);
    if (!m)
        return null;
    const base = parseFloat(m[0]);
    if (m[1])
        return base * Math.pow(10, parseInt(m[1], 10));
    return base;
}
export function gradeQuestion(q, given) {
    const g = (given ?? '').trim();
    const base = { questionId: q.id, given: g };
    if (!g)
        return { ...base, correct: false, score: 0, autoGradeNote: 'لم تتم الإجابة.' };
    switch (q.type) {
        case 'mcq':
        case 'true_false': {
            const ok = normalize(g) === normalize(q.answer);
            return { ...base, correct: ok, score: ok ? 1 : 0 };
        }
        case 'fill_blank': {
            const ok = normTerm(g) === normTerm(q.answer);
            return { ...base, correct: ok, score: ok ? 1 : 0 };
        }
        case 'calc': {
            const exp = parseNumber(q.answer);
            const got = parseNumber(g);
            if (exp === null)
                return { ...base, correct: null, score: 0, autoGradeNote: 'لا توجد قيمة مرجعية رقمية؛ يحتاج تصحيحًا يدويًا.' };
            if (got === null)
                return { ...base, correct: false, score: 0, autoGradeNote: 'لم نجد رقمًا في إجابتك.' };
            const tol = Math.max(Math.abs(exp) * 0.02, 1e-9);
            const ok = Math.abs(got - exp) <= tol;
            if (!ok)
                return { ...base, correct: false, score: 0, autoGradeNote: 'القيمة النهائية لا تطابق المرجع. خطوات الحل لا تُفحص آليًا.' };
            if (q.unit && !normalize(g).includes(normalize(q.unit))) {
                return { ...base, correct: true, score: 0.75, autoGradeNote: `القيمة صحيحة لكن الوحدة (${q.unit}) ناقصة.` };
            }
            return { ...base, correct: true, score: 1, autoGradeNote: 'تم فحص القيمة النهائية والوحدة فقط.' };
        }
        default: {
            const ref = q.keywords && q.keywords.length ? q.keywords : tokenize(q.answer);
            const cov = coverage(ref, tokenize(g));
            const score = cov >= 0.6 ? 1 : cov >= 0.3 ? 0.5 : 0;
            return {
                ...base,
                correct: score === 1,
                score,
                autoGradeNote: `تقييم آلي تقريبي: إجابتك تغطي ${Math.round(cov * 100)}% من الكلمات الأساسية في الإجابة المرجعية. قارن بنفسك مع الإجابة النموذجية.`,
            };
        }
    }
}
export const TYPE_LABEL = {
    mcq: 'اختيار من متعدد',
    true_false: 'صح أو خطأ',
    fill_blank: 'أكمل الفراغ',
    definition: 'التعاريف',
    reason: 'التعاليل',
    compare: 'المقارنات',
    short: 'أسئلة قصيرة',
    calc: 'مسائل حسابية',
    explain: 'أسئلة تفسيرية',
};
export function analyze(questions, results) {
    const byId = new Map(questions.map(q => [q.id, q]));
    let total = 0;
    const wrongByType = {};
    const pageScore = new Map();
    for (const r of results) {
        const q = byId.get(r.questionId);
        if (!q)
            continue;
        total += r.score;
        if (r.score < 1)
            wrongByType[q.type] = (wrongByType[q.type] ?? 0) + 1;
        for (const l of q.links) {
            if (l.status !== 'confirmed')
                continue;
            for (const p of l.printedPages) {
                const e = pageScore.get(p) ?? { got: 0, max: 0 };
                e.got += r.score;
                e.max += 1;
                pageScore.set(p, e);
            }
        }
    }
    const max = results.length;
    const weakPages = [];
    const strongPages = [];
    for (const [p, e] of [...pageScore.entries()].sort((a, b) => a[0] - b[0])) {
        if (e.got / e.max < 0.7)
            weakPages.push(p);
        else
            strongPages.push(p);
    }
    const advice = [];
    for (const [t, n] of Object.entries(wrongByType)) {
        advice.push(`أخطأت في ${n === 1 ? 'سؤال واحد' : n === 2 ? 'سؤالين' : `${n} أسئلة`} من ${TYPE_LABEL[t] ?? t}.`);
    }
    if (weakPages.length)
        advice.push(`ننصح بمراجعة الصفحة ${weakPages.join('، ')} ثم حل اختبار قصير.`);
    return { total, max, percent: max ? Math.round((total / max) * 100) : 0, wrongByType, weakPages, strongPages, advice };
}
