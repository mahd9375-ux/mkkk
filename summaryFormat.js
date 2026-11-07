import { normalize } from './arabic.js';
const KIND_BY_TITLE = [
    ['idea', ['الفكره الاساسيه', 'الفكره الرئيسيه', 'الفكره']],
    ['explain', ['شرح مبسط', 'الشرح', 'شرح']],
    ['definitions', ['التعاريف', 'تعاريف', 'التعريفات', 'المفاهيم']],
    ['reasons', ['التعاليل', 'التعاليل والاسباب', 'الاسباب والنتائج', 'علل']],
    ['laws', ['القوانين', 'القوانين والرموز والوحدات', 'المعادلات', 'القوانين والمعادلات']],
    ['comparisons', ['المقارنات', 'المقارنات والتعدادات', 'التعدادات']],
    ['memorize', ['نقاط للحفظ', 'نقاط مهمه', 'للحفظ', 'ملاحظات مهمه']],
    ['mistakes', ['اخطاء شائعه', 'الاخطاء الشائعه']],
    ['unreadable', ['اجزاء لم تقرا', 'غير مقروء']],
];
export const KIND_TITLE = {
    idea: 'الفكرة الأساسية', explain: 'شرح مبسط', definitions: 'التعاريف', reasons: 'التعاليل والأسباب', laws: 'القوانين والرموز والوحدات',
    comparisons: 'المقارنات والتعدادات', memorize: 'نقاط للحفظ', mistakes: 'أخطاء شائعة', unreadable: 'أجزاء لم تُقرأ',
};
export function parseSummaryText(src) {
    let topic = '';
    const sections = [];
    let cur = null;
    for (const raw of src.split('\n')) {
        const line = raw.trim();
        if (!line)
            continue;
        if (line.startsWith('## ')) {
            const title = line.slice(3).trim();
            const n = normalize(title);
            const kind = KIND_BY_TITLE.find(([, names]) => names.some(x => normalize(x) === n))?.[0] ?? 'explain';
            cur = { kind, title, items: [] };
            sections.push(cur);
        }
        else if (line.startsWith('# ')) {
            topic = line.slice(2).trim();
        }
        else {
            const item = line.replace(/^[-•*]\s*/, '');
            if (!cur) {
                cur = { kind: 'explain', title: KIND_TITLE.explain, items: [] };
                sections.push(cur);
            }
            cur.items.push(item);
        }
    }
    return { topic, sections: sections.filter(s => s.items.length) };
}
export function summaryToText(topic, sections) {
    const out = [];
    if (topic)
        out.push(`# ${topic}`);
    for (const s of sections) {
        out.push(`## ${s.title || KIND_TITLE[s.kind]}`);
        for (const i of s.items)
            out.push(`- ${i}`);
    }
    return out.join('\n');
}
/** الصيغة النصية للفصول: «# الفصل الأول: عنوان» ثم «- عنوان الدرس | 10-15» */
export function parseChaptersText(src, bookId) {
    const chapters = [];
    let cur = null;
    for (const raw of src.split('\n')) {
        const line = raw.trim();
        if (!line)
            continue;
        if (line.startsWith('#')) {
            cur = { id: `${bookId}:ch${chapters.length + 1}`, bookId, title: line.replace(/^#+\s*/, ''), order: chapters.length + 1, lessons: [] };
            chapters.push(cur);
        }
        else if (cur) {
            const m = /^[-•*]?\s*(.+?)\s*\|\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/u.exec(line.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
            if (m) {
                const a = +m[2], b = m[3] ? +m[3] : +m[2];
                cur.lessons.push({ id: `${cur.id}:l${cur.lessons.length + 1}`, title: m[1], fromPage: Math.min(a, b), toPage: Math.max(a, b) });
            }
        }
    }
    return chapters;
}
export function chaptersToText(chapters) {
    return chapters.map(c => [`# ${c.title}`, ...c.lessons.map(l => `- ${l.title} | ${l.fromPage}-${l.toPage}`)].join('\n')).join('\n\n');
}
