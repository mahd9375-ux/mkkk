// مكتبة الوزاريات، سجل المصادر، الإعدادات، والخصوصية.
import { h, btn, link, card, badge, emptyState, toast, clear, downloadFile, pickFile, confirmDialog } from './dom.js';
import { loadSources } from './state.js';
import { SUBJECTS, subjectName } from '../subjects.js';
import { db } from '../db.js';
import { getSettings, saveSettings, importPack } from '../services.js';
import { makeBackup, validateBackup, STUDENT_STORES, CONTENT_STORES } from '../backup.js';
import { MIN_VERIFIED_FOR_STATS } from '../linker.js';
import { questionPreview } from './library.js';
import { applyTheme, installPrompt } from './shell.js';
// ================= مكتبة الوزاريات =================
export async function examsView(root) {
    const all = await db.all('questions');
    const verified = all.filter(q => q.origin === 'ministerial_verified' && q.reviewStatus === 'verified');
    const pending = all.filter(q => q.origin === 'ministerial_unverified');
    const src = await loadSources();
    root.append(h('h1', null, 'مكتبة الوزاريات'), card(h('p', null, 'نعرض هنا الأسئلة الوزارية الأصلية فقط بعد التحقق من مصدرها وسنتها ودورها. الأسئلة التدريبية المولّدة من الكتاب لا تظهر هنا ولا تُعرض كوزارية.'), h('ul', { class: 'small' }, h('li', null, badge('وزاري أصلي موثق', 'ok'), ' — تمت مطابقة السؤال مع نسخة الامتحان الأصلية وتأكيدها من صاحب المشروع.'), h('li', null, badge('منسوب للوزاري — غير متحقق', 'err'), ' — في قائمة المراجعة؛ لا يدخل الاختبارات.'), h('li', null, badge('تدريبي مولّد من الكتاب', 'info'), ' — من نص الصفحة؛ ليس وزاريًا.'))));
    const subjSel = h('select', { 'aria-label': 'المادة' }, h('option', { value: '' }, 'كل المواد'), ...SUBJECTS.map(s => h('option', { value: s.id }, s.name)));
    const list = h('div', { class: 'stack' });
    const render = () => {
        clear(list);
        const items = verified.filter(q => !subjSel.value || q.subjectId === subjSel.value);
        if (!items.length) {
            list.append(emptyState('لا توجد أسئلة وزارية موثقة حتى الآن', 'لم يتم العثور على مصدر موثوق مستورد ومتحقق منه بعد. انظر سجل الاكتمال أدناه لمعرفة ما وُجد وما ينقص.'));
            return;
        }
        const sorted = [...items].sort((a, b) => (b.exam?.year ?? 0) - (a.exam?.year ?? 0));
        for (const q of sorted)
            list.append(card(h('div', { class: 'muted small' }, subjectName(q.subjectId)), questionPreview(q)));
    };
    subjSel.onchange = render;
    root.append(h('div', { class: 'row' }, subjSel), list);
    render();
    // إحصائيات (فقط مع بيانات كافية)
    const statsCard = card(h('h2', null, 'إحصائيات التكرار'));
    if (verified.length < MIN_VERIFIED_FOR_STATS) {
        statsCard.append(h('p', { class: 'muted' }, `لا تُعرض إحصائيات قبل توفر ${MIN_VERIFIED_FOR_STATS} سؤالًا وزاريًا موثقًا على الأقل (المتوفر الآن: ${verified.length}). لا نعرض أرقامًا من بيانات تجريبية.`));
    }
    else {
        const byGroup = new Map();
        for (const q of verified) {
            const g = q.similarGroup ?? q.id;
            if (!byGroup.has(g))
                byGroup.set(g, []);
            byGroup.get(g).push(q);
        }
        const repeated = [...byGroup.values()].filter(g => g.length > 1).sort((a, b) => b.length - a.length).slice(0, 15);
        statsCard.append(h('p', { class: 'small' }, `${verified.length} سؤال موثق. أسئلة تكررت صيغتها في أكثر من امتحان:`), repeated.length ? h('ul', null, ...repeated.map(g => h('li', null, `${g[0].prompt.slice(0, 80)}… — ${g.length} مرات (${g.map(q => `${q.exam?.year} ${q.exam?.round ?? ''}`).join('، ')})`))) : h('p', { class: 'muted' }, 'لا توجد صيغ متكررة.'), h('p', { class: 'muted tiny' }, 'هذه أرقام تاريخية من الأسئلة الموثقة فقط، وليست توقعًا لما سيأتي في الامتحان.'));
    }
    root.append(statsCard);
    // سجل الاكتمال
    const log = card(h('h2', null, 'سجل اكتمال الوزاريات'));
    if (src) {
        log.append(h('p', { class: 'small' }, `تاريخ البحث: ${src.exams.accessedAt}. ${src.exams.officialSourceNote}`));
        const rows = SUBJECTS.map(s => {
            const found = src.exams.sources.filter(x => x.subjectId === s.id);
            const years = [...new Set(found.map(x => x.year))].sort().join('، ');
            return h('tr', null, h('td', null, s.name), h('td', null, years || '—'), h('td', null, String(found.length)), h('td', null, String(found.filter(x => x.status === 'downloaded').length)), h('td', null, String(verified.filter(q => q.subjectId === s.id).length)), h('td', null, String(pending.filter(q => q.subjectId === s.id).length)));
        });
        log.append(h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ...['المادة', 'سنوات وُجدت لها مصادر', 'مصادر وُجدت', 'نُزّلت', 'أسئلة موثقة', 'بانتظار المراجعة'].map(x => h('th', null, x)))), h('tbody', null, ...rows))), h('p', { class: 'muted small' }, 'كل المصادر التي وُجدت مواقع غير رسمية، وحقوق إعادة نشرها غير معروفة، ولم يُنزّل منها أي ملف. التفاصيل في ', link('سجل المصادر', '#/sources', 'lnk'), '.'));
    }
    else
        log.append(h('p', { class: 'muted' }, 'تعذّر تحميل سجل المصادر.'));
    if (pending.length)
        log.append(h('p', null, `${pending.length} سؤال منسوب للوزاري ينتظر التحقق في `, link('أداة المحتوى', '#/admin', 'lnk'), '.'));
    root.append(log);
}
// ================= سجل المصادر =================
export async function sourcesView(root) {
    const src = await loadSources();
    root.append(h('h1', null, 'سجل المصادر'));
    if (!src) {
        root.append(emptyState('تعذّر تحميل السجل', ''));
        return;
    }
    root.append(card(h('p', { class: 'note warn' }, src.environmentNote), h('p', { class: 'small muted' }, `آخر تحديث: ${src.generatedAt}`)));
    root.append(card(h('h2', null, `المواد — ${src.curriculum.grade} (${src.curriculum.targetYear})`), h('ul', null, ...src.curriculum.subjects.map(s => h('li', null, h('strong', null, s.name), s.needsVerification ? badge('يحتاج تحقق', 'warn') : null, h('div', { class: 'small muted' }, s.evidence)))), h('p', { class: 'small' }, src.curriculum.tracksNote), h('p', { class: 'small' }, 'الحذوفات: ', badge('غير متحققة', 'warn'), ' ', src.curriculum.reductions2026.note, ' ', h('a', { href: src.curriculum.reductions2026.url, target: '_blank', rel: 'noopener noreferrer', class: 'lnk' }, 'المصدر'))));
    const bc = src.bookCommon;
    root.append(card(h('h2', null, 'الكتب الرسمية'), h('p', { class: 'small' }, `الناشر: ${bc.publisher}. السنة الدراسية: ${bc.schoolYear}. تاريخ الوصول: ${bc.accessedAt}.`), h('p', { class: 'small' }, `حالة التنزيل: ${bc.downloadNote}`), h('p', { class: 'small' }, `الحقوق: ${bc.rights}`), h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'الكتاب'), h('th', null, 'الطبعة المذكورة'), h('th', null, 'الرابط الرسمي'), h('th', null, 'نسخة بديلة (طرف ثالث)'), h('th', null, 'الحالة'))), h('tbody', null, ...src.books.map(b => h('tr', null, h('td', null, b.title), h('td', null, b.editionClaimed), h('td', null, h('a', { href: b.url, target: '_blank', rel: 'noopener noreferrer', class: 'lnk mono' }, b.url.split('/').pop() ?? b.url)), h('td', null, b.mirror ? h('a', { href: b.mirror.url, target: '_blank', rel: 'noopener noreferrer', class: 'lnk', title: b.mirror.note }, `Drive (${b.mirror.claimedEdition})`) : '—'), h('td', null, badge('لم يُنزَّل', 'warn'))))))), h('p', { class: 'small muted' }, 'وُجدت الروابط عبر: ', h('a', { href: bc.linkFoundVia ?? '#', target: '_blank', rel: 'noopener noreferrer', class: 'lnk' }, bc.linkFoundVia ?? ''), ' · إعلان الوزارة: ', h('a', { href: bc.officialAnnouncement ?? '#', target: '_blank', rel: 'noopener noreferrer', class: 'lnk' }, bc.officialAnnouncement ?? ''))));
    if (src.downloadAttempts?.length) {
        root.append(card(h('h2', null, 'سجل محاولات التنزيل'), h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ...['التاريخ', 'الأداة', 'الهدف', 'النتيجة'].map(x => h('th', null, x)))), h('tbody', null, ...src.downloadAttempts.map(a => h('tr', null, h('td', null, a.at), h('td', null, a.tool), h('td', { class: 'tiny mono' }, a.targets.join(' · ') || '—'), h('td', { class: 'small' }, a.result))))))));
    }
    root.append(card(h('h2', null, 'مصادر الوزاريات التي عُثر عليها'), h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ...['المادة', 'السنة', 'الدور', 'الصيغة', 'الحالة', 'الرابط'].map(x => h('th', null, x)))), h('tbody', null, ...src.exams.sources.map(s => h('tr', null, h('td', null, subjectName(s.subjectId)), h('td', null, String(s.year)), h('td', null, s.round), h('td', null, s.format), h('td', null, badge(s.status === 'found_not_opened' ? 'وُجد ولم يُفتح' : 'وُجد ولم يُنزَّل', 'warn')), h('td', null, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', class: 'lnk' }, 'فتح'))))))), h('p', { class: 'small muted' }, 'فهارس: ', ...src.exams.archiveIndexes.map(a => h('span', null, h('a', { href: a.url, target: '_blank', rel: 'noopener noreferrer', class: 'lnk' }, a.note), ' · ')))));
}
// ================= الإعدادات =================
export async function settingsView(root) {
    const s = await getSettings();
    root.append(h('h1', null, 'الإعدادات'));
    const theme = h('select', { 'aria-label': 'المظهر' }, h('option', { value: 'system' }, 'حسب الجهاز'), h('option', { value: 'light' }, 'فاتح'), h('option', { value: 'dark' }, 'داكن'));
    theme.value = s.theme;
    theme.onchange = async () => { const n = await saveSettings({ theme: theme.value }); applyTheme(n.theme); };
    const minutes = h('input', { type: 'number', min: 15, max: 720, step: 15, value: s.dailyMinutes });
    minutes.onchange = () => void saveSettings({ dailyMinutes: Math.max(15, +minutes.value || 120) });
    const rec = h('input', { type: 'checkbox', checked: s.recommendationsEnabled });
    rec.onchange = () => void saveSettings({ recommendationsEnabled: rec.checked });
    root.append(card(h('h2', null, 'عام'), h('label', { class: 'field' }, h('span', null, 'المظهر'), theme), h('label', { class: 'field' }, h('span', null, 'وقتك المتاح للدراسة يوميًا (دقيقة)'), minutes), h('label', { class: 'row' }, rec, ' توصيات المراجعة'), installPrompt()));
    // النسخ الاحتياطي
    const exportBackup = async (withContent) => {
        const stores = withContent ? [...STUDENT_STORES, ...CONTENT_STORES] : [...STUDENT_STORES];
        const data = {};
        for (const st of stores)
            data[st] = await db.all(st);
        const b = makeBackup(data, withContent);
        downloadFile(`tahdiri-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b));
        toast('تم تنزيل النسخة الاحتياطية');
    };
    const restore = async () => {
        const f = await pickFile('application/json,.json');
        if (!f)
            return;
        if (f.size > 300 * 1024 * 1024) {
            toast('الملف كبير جدًا', 'err');
            return;
        }
        let obj;
        try {
            obj = JSON.parse(await f.text());
        }
        catch {
            toast('الملف ليس JSON صالحًا', 'err');
            return;
        }
        const v = validateBackup(obj);
        if (!v.ok) {
            toast(v.error, 'err');
            return;
        }
        if (!(await confirmDialog('الاستعادة ستستبدل بيانات التقدم الحالية على هذا الجهاز. متابعة؟')))
            return;
        for (const [k, rows] of Object.entries(v.backup.data)) {
            await db.clear(k);
            await db.putMany(k, rows);
        }
        toast('تمت الاستعادة');
        const ns = await getSettings();
        applyTheme(ns.theme);
        clear(root);
        await settingsView(root);
    };
    root.append(card(h('h2', null, 'النسخة الاحتياطية'), h('p', { class: 'small' }, 'تقدّمك محفوظ على هذا الجهاز فقط (لا يوجد حساب). إذا حذفت بيانات المتصفح أو انتقلت لجهاز آخر، ستحتاج لاستعادة نسخة احتياطية.'), h('div', { class: 'row wrap' }, btn('تصدير تقدّمي', () => void exportBackup(false), 'primary'), btn('تصدير مع المحتوى المستورد', () => void exportBackup(true)), btn('استعادة نسخة', () => void restore()))));
    root.append(card(h('h2', null, 'حزمة محتوى'), h('p', { class: 'small' }, 'استيراد حزمة محتوى (كتب مستخرجة وملخصات وأسئلة) أعدّها شخص تثق به أو أداة الاستيراد المحلية.'), btn('استيراد حزمة محتوى', async () => {
        const f = await pickFile('application/json,.json');
        if (!f)
            return;
        try {
            const r = await importPack(JSON.parse(await f.text()), 'local');
            toast(`تم: ${r.books} كتاب، ${r.pages} صفحة، ${r.questions} سؤال`);
            if (r.warnings.length)
                alert(r.warnings.join('\n'));
        }
        catch (e) {
            toast(`تعذّر الاستيراد: ${e.message}`, 'err');
        }
    })));
    root.append(card(h('h2', { class: 'danger-t' }, 'حذف البيانات'), btn('احذف كل بياناتي من هذا الجهاز', async () => {
        if (!(await confirmDialog('سيتم حذف كل المهام والاختبارات والتقدم والمحتوى المستورد. لا يمكن التراجع.')))
            return;
        for (const st of [...STUDENT_STORES, ...CONTENT_STORES])
            await db.clear(st);
        try {
            localStorage.removeItem('tahdiri-packs');
        }
        catch { /* ignore */ }
        toast('تم الحذف');
        location.hash = '#/';
    }, 'danger')));
    root.append(h('p', { class: 'small' }, link('سياسة الخصوصية', '#/privacy', 'lnk'), ' · ', link('سجل المصادر', '#/sources', 'lnk'), ' · ', link('أداة المحتوى (للمشرف)', '#/admin', 'lnk')));
}
// ================= الخصوصية =================
export function privacyView(root) {
    root.append(h('h1', null, 'سياسة الخصوصية'), card(h('ul', null, h('li', null, 'لا توجد حسابات ولا تسجيل دخول. لا نجمع اسمك أو بريدك أو رقمك.'), h('li', null, 'كل مهامك واختباراتك وتقدّمك محفوظة في متصفحك على جهازك (IndexedDB) ولا تُرسل لأي خادم.'), h('li', null, 'لا يوجد تتبع أو إعلانات أو تحليلات.'), h('li', null, 'قراءة صور التحضير (OCR) تتم على جهازك. عند أول استخدام يُنزّل المتصفح مكتبة Tesseract.js ونموذج اللغة العربية من cdn.jsdelivr.net؛ الصورة نفسها لا تُرسل.'), h('li', null, 'استيراد كتب PDF يتم على جهازك. عند أول استخدام يُنزّل المتصفح مكتبة pdf.js من cdnjs.cloudflare.com؛ الملف نفسه لا يُرسل.'), h('li', null, 'الخطوط تُحمّل من Google Fonts، وهذا يكشف عنوان IP لخوادم Google كأي موقع يستخدم خطوطها.'), h('li', null, 'توليد الملخصات بالذكاء الاصطناعي (للمشرف فقط) يرسل نص صفحة الكتاب — لا بيانات الطالب — إلى الخادم الوسيط الذي يضبطه المشرف، ومنه إلى Anthropic API.'), h('li', null, 'تستطيع تصدير بياناتك أو حذفها بالكامل من الإعدادات.')), h('p', { class: 'muted small' }, 'التطبيق غير رسمي وغير تابع لوزارة التربية العراقية.')));
}
