// نقطة الدخول والموجّه.
import { buildShell, highlightNav, applyTheme } from './ui/shell.js';
import { clear, h, emptyState, link, toast } from './ui/dom.js';
import { homeView, draftsView, tasksView, finishView } from './ui/prep.js';
import { libraryView, subjectView, bookView, pageView, quizSetupView, chapterView } from './ui/library.js';
import { quizView, resultsView, reviewView, progressView } from './ui/study.js';
import { examsView, sourcesView, settingsView, privacyView } from './ui/info.js';
import { adminView, adminBookView, adminPageView, adminQuestionsView, adminExamView } from './ui/admin.js';
import { getSettings, syncPublishedPacks } from './services.js';
import { searchView } from './ui/searchView.js';
import { malzamaHome, malzamaSubject, malzamaBook, malzamaLesson, malzamaFind } from './ui/malzama.js';
const routes = [
    [/^\/?$/, r => homeView(r), 'الرئيسية'],
    [/^\/prep\/review$/, r => draftsView(r), 'مراجعة المهام'],
    [/^\/tasks$/, r => tasksView(r), 'جدول التحضير'],
    [/^\/finish\/([^/]+)$/, (r, m) => finishView(r, m[1]), 'خلصت التحضير'],
    [/^\/library$/, r => libraryView(r), 'المواد'],
    [/^\/chapter\/([^/]+)\/([^/]+)$/, (r, m) => chapterView(r, decodeURIComponent(m[1]), decodeURIComponent(m[2])), 'الفصل'],
    [/^\/m$/, r => malzamaHome(r), 'ملخصاتي'],
    [/^\/m\/s\/([^/]+)$/, (r, m) => malzamaSubject(r, m[1]), 'ملخصاتي'],
    [/^\/m\/b\/([^/]+)$/, (r, m) => malzamaBook(r, decodeURIComponent(m[1])), 'ملخصاتي'],
    [/^\/m\/l\/([^/]+)$/, (r, m) => malzamaLesson(r, decodeURIComponent(m[1])), 'ملخص الدرس'],
    [/^\/m\/find$/, (r, _m, q) => malzamaFind(r, q), 'البحث في الملخصات'],
    [/^\/search$/, (r, _m, q) => searchView(r, q), 'البحث'],
    [/^\/subject\/([^/]+)$/, (r, m) => subjectView(r, m[1]), 'المادة'],
    [/^\/book\/([^/]+)$/, (r, m) => bookView(r, decodeURIComponent(m[1])), 'الكتاب'],
    [/^\/page\/([^/]+)\/(-?\d+)(?:\/([^/]+))?$/, (r, m) => pageView(r, decodeURIComponent(m[1]), +m[2], m[3]), 'ملخص الصفحة'],
    [/^\/quizsetup\/([^/]+)\/(all|pick)$/, (r, m) => quizSetupView(r, decodeURIComponent(m[1]), m[2]), 'إعداد اختبار'],
    [/^\/quiz$/, r => quizView(r), 'الاختبار'],
    [/^\/results\/([^/]+)$/, (r, m) => resultsView(r, m[1]), 'النتيجة'],
    [/^\/exams$/, r => examsView(r), 'الوزاريات'],
    [/^\/review$/, r => reviewView(r), 'المراجعة'],
    [/^\/progress$/, r => progressView(r), 'تقدمي'],
    [/^\/settings$/, r => settingsView(r), 'الإعدادات'],
    [/^\/privacy$/, r => privacyView(r), 'الخصوصية'],
    [/^\/sources$/, r => sourcesView(r), 'سجل المصادر'],
    [/^\/admin$/, (r, _m, q) => adminView(r, q), 'أداة المحتوى'],
    [/^\/admin\/book\/([^/]+)$/, (r, m) => adminBookView(r, decodeURIComponent(m[1])), 'إدارة كتاب'],
    [/^\/admin\/page\/([^/]+)\/(\d+)$/, (r, m) => adminPageView(r, decodeURIComponent(m[1]), +m[2]), 'تحرير صفحة'],
    [/^\/admin\/questions\/([^/]+)$/, (r, m) => adminQuestionsView(r, decodeURIComponent(m[1])), 'مراجعة الأسئلة'],
    [/^\/admin\/exam\/([^/]+)$/, (r, m) => adminExamView(r, m[1]), 'سؤال وزاري'],
];
let renderSeq = 0;
async function render() {
    const view = document.getElementById('view');
    const raw = (location.hash || '#/').slice(1);
    const [path, query] = raw.split('?');
    const seq = ++renderSeq;
    clear(view);
    highlightNav();
    for (const [re, fn, title] of routes) {
        const m = re.exec(path);
        if (!m)
            continue;
        document.title = `${title} — تحضيري`;
        const container = h('div', { class: 'view-inner' });
        view.append(container);
        try {
            await fn(container, m, new URLSearchParams(query ?? ''));
        }
        catch (e) {
            console.error(e);
            if (seq === renderSeq)
                container.append(emptyState('حدث خطأ', e.message, link('الرئيسية', '#/')));
        }
        if (seq === renderSeq)
            view.focus({ preventScroll: true });
        window.scrollTo(0, 0);
        return;
    }
    view.append(emptyState('الصفحة غير موجودة', '', link('الرئيسية', '#/')));
}
async function boot() {
    document.body.append(buildShell());
    try {
        const s = await getSettings();
        applyTheme(s.theme);
        matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => applyTheme((await getSettings()).theme));
    }
    catch {
        applyTheme('system');
        toast('تعذّر فتح التخزين المحلي؛ قد لا يُحفظ تقدّمك (وضع التصفح الخاص؟).', 'err');
    }
    window.addEventListener('hashchange', () => void render());
    await render();
    syncPublishedPacks().then(n => {
        if (!n.length)
            return;
        const failed = n.filter(x => x.startsWith('تعذّر'));
        toast(failed.length ? failed[0] : 'تم تحديث محتوى الكتب', failed.length ? 'warn' : 'ok');
        void render(); // إعادة عرض الصفحة الحالية بالمحتوى الجديد
    }).catch(() => { });
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err));
    }
}
void boot();
