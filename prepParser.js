// تحويل نص التحضير (فصحى أو لهجة عراقية) إلى مهام مقترحة.
// النتائج اقتراحات فقط ويجب أن يراجعها الطالب قبل الحفظ.
import { normalize, toLatinDigits } from './arabic.js';
import { SUBJECT_ALIASES } from './subjects.js';
const MAX_RANGE = 60;
const NUMBER_WORDS = {
    'واحد': 1, 'اول': 1, 'اثنين': 2, 'ثنين': 2, 'اثنان': 2, 'ثلاث': 3, 'ثلاثه': 3, 'تلاث': 3, 'اربع': 4, 'اربعه': 4,
    'خمس': 5, 'خمسه': 5, 'ست': 6, 'سته': 6, 'سبع': 7, 'سبعه': 7, 'ثمان': 8, 'ثمانيه': 8, 'ثمن': 8, 'تسع': 9, 'تسعه': 9,
    'عشر': 10, 'عشره': 10,
};
const w = (alts) => new RegExp(`(^|[^\\p{L}])(?:و|ف|ب|ل)?(?:${alts})`, 'u');
const TYPE_RULES = [
    ['exam_prep', w('امتحان|اختبار|امتحانيه|شهري|كوز|quiz|exam|test')],
    ['memorize', w('حفظ|احفظ|يحفظ|تحفيظ|تسميع|سمع')],
    ['solve', w('حل|احل|يحل|نحل|تمارين|تمرين|مسائل|مساله|اسئله|سؤال|exercise')],
    ['review', w('مراجعه|راجع|نراجع|review')],
    ['read', w('قراءه|اقرا|يقرا|نقرا|read')],
    ['homework', w('واجب|واجبات|homework')],
    ['study', w('دراسه|ادرس|يدرس|تحضير|حضر|study')],
];
const WEEKDAYS = {
    'الاحد': 0, 'احد': 0, 'الاثنين': 1, 'اثنين': 1, 'الثلاثاء': 2, 'ثلاثاء': 2, 'الاربعاء': 3, 'اربعاء': 3,
    'الخميس': 4, 'خميس': 4, 'الجمعه': 5, 'جمعه': 5, 'السبت': 6, 'سبت': 6,
};
function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function addDays(d, n) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
}
/** إيجاد المادة: أطول اسم مستعار مطابق ككلمة كاملة */
export function detectSubject(normText) {
    let best = null;
    for (const [id, aliases] of Object.entries(SUBJECT_ALIASES)) {
        for (const alias of aliases) {
            const a = normalize(alias);
            const re = new RegExp(`(^|[^\\p{L}])(و|ب|ل)?${escapeRe(a)}($|[^\\p{L}])`, 'u');
            const m = re.exec(normText);
            if (m) {
                const idx = m.index + m[1].length;
                if (!best || a.length > best.alias.length || (a.length === best.alias.length && idx < best.index)) {
                    best = { id, alias: a, index: idx };
                }
            }
        }
    }
    return best;
}
function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** استخراج الصفحات */
export function extractPages(normText) {
    const t = toLatinDigits(normText);
    const warnings = [];
    const pages = new Set();
    const PAGE = '(?:صفحه|صفحات|الصفحات|الصفحه|صفح|ص|page|pages|p)';
    const RANGE_SEP = '(?:\\s*(?:-|–|—|الي|لغايه|لحد|حتي|الين|لل|ل)\\s*)';
    // نطاق: من صفحة 10 إلى 15 / ص 10-15 / صفحه ١٠ لل ١٥
    const B = '(?:^|(?<=[^\\p{L}]))(?:و|ب|ف)?';
    const rangeRe = new RegExp(`${B}${PAGE}\\.?\\s*(\\d{1,3})${RANGE_SEP}(?:${PAGE}\\.?\\s*)?(\\d{1,3})`, 'gu');
    let consumed = t;
    for (const m of t.matchAll(rangeRe)) {
        const a = parseInt(m[1], 10);
        const b = parseInt(m[2], 10);
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        consumed = consumed.replace(m[0], ' ');
        if (hi - lo + 1 > MAX_RANGE) {
            warnings.push(`نطاق الصفحات ${lo}-${hi} طويل جدًا؛ تحقق منه.`);
            continue;
        }
        for (let p = lo; p <= hi; p++)
            pages.add(p);
    }
    // "من 10 الى 15" بدون كلمة صفحة لكن بعد "من"
    const fromToRe = /من\s+(\d{1,3})\s*(?:-|الي|لغايه|لحد|حتي|الين|لل|ل)\s*(\d{1,3})/gu;
    for (const m of consumed.matchAll(fromToRe)) {
        const a = parseInt(m[1], 10);
        const b = parseInt(m[2], 10);
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        if (hi - lo + 1 <= MAX_RANGE)
            for (let p = lo; p <= hi; p++)
                pages.add(p);
        consumed = consumed.replace(m[0], ' ');
    }
    // صفحة مفردة أو قائمة: ص 10 و 12 و 14
    const singleRe = new RegExp(`${B}${PAGE}\\.?\\s*(\\d{1,3}(?:\\s*(?:و|,|،)\\s*\\d{1,3})*)`, 'gu');
    for (const m of consumed.matchAll(singleRe)) {
        for (const n of m[1].split(/\s*(?:و|,|،)\s*/u)) {
            const v = parseInt(n, 10);
            if (!Number.isNaN(v))
                pages.add(v);
        }
    }
    return { pages: [...pages].sort((a, b) => a - b), warnings };
}
function extractDue(normText, today) {
    if (/بعد\s+(باجر|باكر|بكره|غدا)/u.test(normText))
        return isoDate(addDays(today, 2));
    if (/(^|\s)(باجر|باكر|بكره|بكرا|غدا|الغد|tomorrow)($|\s)/u.test(normText))
        return isoDate(addDays(today, 1));
    if (/(^|\s)(اليوم|today)($|\s)/u.test(normText))
        return isoDate(today);
    for (const [name, dow] of Object.entries(WEEKDAYS)) {
        if (new RegExp(`(^|\\s)(يوم\\s+)?${name}($|\\s)`, 'u').test(normText)) {
            let diff = (dow - today.getDay() + 7) % 7;
            if (diff === 0)
                diff = 7;
            return isoDate(addDays(today, diff));
        }
    }
    const dm = /(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/.exec(toLatinDigits(normText));
    if (dm) {
        const day = parseInt(dm[1], 10);
        const month = parseInt(dm[2], 10);
        let year = dm[3] ? parseInt(dm[3], 10) : today.getFullYear();
        if (year < 100)
            year += 2000;
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            const d = new Date(year, month - 1, day);
            if (!dm[3] && d < addDays(today, -1))
                d.setFullYear(year + 1);
            return isoDate(d);
        }
    }
    return undefined;
}
function extractMinutes(normText) {
    const t = toLatinDigits(normText);
    if (/نص\s*ساعه|نصف\s*ساعه/u.test(t))
        return 30;
    if (/ربع\s*ساعه/u.test(t))
        return 15;
    if (/ساعه\s*ونص/u.test(t))
        return 90;
    if (/ساعتين/u.test(t))
        return 120;
    const h = /(\d+(?:\.\d+)?)\s*(?:ساعه|ساعات)/u.exec(t);
    if (h)
        return Math.round(parseFloat(h[1]) * 60);
    if (/(^|\s)ساعه($|\s)/u.test(t))
        return 60;
    const m = /(\d+)\s*(?:دقيقه|دقايق|دقائق|min)/u.exec(t);
    if (m)
        return parseInt(m[1], 10);
    return undefined;
}
function extractLesson(normText) {
    const t = toLatinDigits(normText);
    const m = /((?:الدرس|درس|الفصل|فصل|الوحده|وحده|الباب|باب|unit|lesson|chapter)\s+(?:[\p{L}]+\s+)?(?:\d+|[\p{L}]+))/u.exec(t);
    return m ? m[1] : undefined;
}
function extractDetails(normText) {
    const t = toLatinDigits(normText);
    const parts = [];
    const m1 = /(?:اول|أول)\s+([\p{L}\d]+)\s+(تمارين|تمرين|اسئله|مسائل|اسئلة)/u.exec(t);
    if (m1) {
        const n = NUMBER_WORDS[m1[1]] ?? parseInt(m1[1], 10);
        if (!Number.isNaN(n))
            parts.push(`أول ${n} ${m1[2]}`);
    }
    const m2 = /(تمارين|تمرين|سؤال|اسئله|مسائل)\s*(\d+)\s*(?:-|الي|ل)\s*(\d+)/u.exec(t);
    if (m2)
        parts.push(`${m2[1]} ${m2[2]}–${m2[3]}`);
    else {
        const m3 = /(تمرين|سؤال|مساله)\s*(?:رقم\s*)?(\d+)/u.exec(t);
        if (m3)
            parts.push(`${m3[1]} ${m3[2]}`);
    }
    if (/(تعريفات|تعاريف|تعريف)/u.test(t))
        parts.push('تعاريف');
    if (/(تعاليل|علل)/u.test(t))
        parts.push('تعاليل');
    if (/(قوانين|قانون)/u.test(t))
        parts.push('قوانين');
    if (/(مفردات|vocabulary|words)/u.test(t))
        parts.push('مفردات');
    return parts.length ? parts.join('، ') : undefined;
}
function detectType(normText) {
    for (const [type, re] of TYPE_RULES)
        if (re.test(normText))
            return type;
    return 'study';
}
/** تقسيم النص إلى مقاطع؛ كل مقطع غالبًا مادة واحدة */
export function splitSegments(text) {
    const lines = text
        .split(/\n|;|؛|•|\*|(?:^|\s)-\s(?=\S)/u)
        .map(s => s.trim())
        .filter(Boolean);
    const out = [];
    for (const line of lines) {
        // تقسيم داخل السطر عند فاصلة أو "و" يليها اسم مادة
        const norm = normalize(line);
        const tokens = norm.split(/\s*[,،]\s*|\s+(?=و\S)/u);
        let current = '';
        for (const tok of tokens) {
            const stripped = tok.replace(/^و(?=\S)/u, '');
            const subj = detectSubject(stripped);
            if (current && subj && subj.index === 0) {
                out.push(current.trim());
                current = stripped;
            }
            else {
                current = current ? `${current} ${tok}` : tok;
            }
        }
        if (current.trim())
            out.push(current.trim());
    }
    return out;
}
export function computePriority(type, dueDate, today) {
    if (dueDate) {
        const diff = Math.round((new Date(dueDate + 'T00:00:00').getTime() - addDays(today, 0).getTime()) / 86400000);
        if (diff <= 1)
            return 1;
        if (diff <= 3)
            return type === 'exam_prep' ? 1 : 2;
    }
    if (type === 'exam_prep')
        return 1;
    return 2;
}
export function parsePrep(text, today = new Date()) {
    const segments = splitSegments(text);
    const tasks = [];
    let lastSubject = null;
    for (const seg of segments) {
        const subj = detectSubject(seg);
        const { pages, warnings } = extractPages(seg);
        const lessonText = extractLesson(seg);
        const details = extractDetails(seg);
        // مقطع بلا مادة ولا صفحات ولا درس — ليس مهمة
        if (!subj && pages.length === 0 && !lessonText && !details)
            continue;
        let subjectId = subj?.id ?? null;
        if (!subjectId && lastSubject && (pages.length || lessonText)) {
            subjectId = lastSubject;
            warnings.push('لم تُذكر المادة؛ افترضنا نفس مادة السطر السابق.');
        }
        if (!subjectId)
            warnings.push('لم نتعرف على المادة. اخترها يدويًا.');
        if (subjectId)
            lastSubject = subjectId;
        const type = detectType(seg);
        const dueDate = extractDue(seg, today);
        tasks.push({
            subjectId,
            subjectRaw: subj?.alias,
            type,
            pages,
            lessonText,
            details,
            dueDate,
            estimatedMinutes: extractMinutes(seg),
            priority: computePriority(type, dueDate, today),
            rawLine: seg,
            warnings,
        });
    }
    return tasks;
}
/** ترتيب المهام: الأولوية ثم الموعد ثم الأقدم */
export function sortTasks(tasks) {
    return [...tasks].sort((a, b) => {
        const da = a.status === 'done' ? 1 : 0;
        const db = b.status === 'done' ? 1 : 0;
        if (da !== db)
            return da - db;
        if (a.priority !== b.priority)
            return a.priority - b.priority;
        const ad = a.dueDate ?? '9999-99-99';
        const bd = b.dueDate ?? '9999-99-99';
        if (ad !== bd)
            return ad < bd ? -1 : 1;
        return (a.createdAt ?? '') < (b.createdAt ?? '') ? -1 : 1;
    });
}
export const TASK_TYPE_LABEL = {
    study: 'دراسة',
    solve: 'حل تمارين',
    memorize: 'حفظ',
    review: 'مراجعة',
    read: 'قراءة',
    homework: 'واجب',
    exam_prep: 'تحضير لامتحان',
    other: 'أخرى',
};
