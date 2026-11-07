// الإطار العام: التنقل، المظهر، التثبيت كتطبيق، حالة الاتصال.
import { h, icon, btn } from './dom.js';
const NAV = [
    { href: '#/', label: 'الرئيسية', icon: 'home', match: /^#\/?$|^#\/prep/ },
    { href: '#/tasks', label: 'التحضير', icon: 'list', match: /^#\/(tasks|finish)/ },
    { href: '#/m', label: 'ملخصاتي', icon: 'notes', match: /^#\/m(\/|$|\?)/ },
    { href: '#/library', label: 'المواد', icon: 'book', match: /^#\/(library|subject|book|page|quizsetup|chapter|search)/ },
    { href: '#/exams', label: 'الوزاريات', icon: 'archive', match: /^#\/exams/ },
    { href: '#/review', label: 'المراجعة', icon: 'repeat', match: /^#\/review/ },
    { href: '#/progress', label: 'تقدّمي', icon: 'chart', match: /^#\/(progress|results|quiz)/ },
    { href: '#/settings', label: 'الإعدادات', icon: 'gear', match: /^#\/(settings|privacy|sources|admin)/ },
];
export function buildShell() {
    const main = h('main', { id: 'view', tabindex: -1 });
    const collapse = h('button', { class: 'nav-collapse', type: 'button', 'aria-label': 'إخفاء شريط التنقل', title: 'إخفاء الشريط', onclick: () => setNavHidden(true) }, '›  إخفاء');
    const expand = h('button', { class: 'nav-expand', type: 'button', 'aria-label': 'إظهار شريط التنقل', title: 'إظهار الشريط', onclick: () => setNavHidden(false) }, '‹  القائمة');
    const nav = h('nav', { class: 'nav', 'aria-label': 'التنقل الرئيسي' }, collapse, ...NAV.map(n => h('a', { href: n.href, class: 'nav-item', 'data-match': n.match.source }, icon(n.icon, 22), h('span', null, n.label))));
    const themeBtn = btn(icon('moon'), () => {
        const cur = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(cur);
        void import('../services.js').then(s => s.saveSettings({ theme: cur }));
    }, 'ghost', { 'aria-label': 'تبديل المظهر', id: 'theme-btn' });
    const header = h('header', { class: 'topbar' }, h('a', { href: '#/', class: 'brand' }, logo(), h('span', null, 'تحضيري')), h('span', { id: 'net', class: 'net', hidden: navigator.onLine }, 'بدون اتصال'), h('a', { href: '#/search', class: 'btn btn-ghost', 'aria-label': 'البحث في الكتب' }, icon('search')), themeBtn);
    window.addEventListener('online', () => { document.getElementById('net').hidden = true; });
    window.addEventListener('offline', () => { document.getElementById('net').hidden = false; });
    const app = h('div', { class: 'app' }, header, nav, main, h('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite' }), expand);
    // إخفاء شريط التنقل على الحاسوب فقط، ويُحفظ اختيار المستخدم
    function setNavHidden(on) {
        app.classList.toggle('nav-hidden', on);
        try {
            localStorage.setItem('tahdiri-nav-hidden', on ? '1' : '0');
        }
        catch { /* لا تخزين */ }
    }
    try {
        if (localStorage.getItem('tahdiri-nav-hidden') === '1')
            app.classList.add('nav-hidden');
    }
    catch { /* لا تخزين */ }
    return app;
}
export function highlightNav() {
    const hash = location.hash || '#/';
    for (const a of document.querySelectorAll('.nav-item')) {
        const re = new RegExp(a.dataset.match ?? '^$');
        a.classList.toggle('active', re.test(hash));
        if (re.test(hash))
            a.setAttribute('aria-current', 'page');
        else
            a.removeAttribute('aria-current');
    }
}
function logo() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 32 32');
    svg.setAttribute('width', '28');
    svg.setAttribute('height', '28');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<rect x="2" y="2" width="28" height="28" rx="8" fill="var(--brand)"/><path d="M9 11h14M16 11v12M11 23h10" stroke="var(--on-brand)" stroke-width="2.6" stroke-linecap="round"/><circle cx="23" cy="20" r="2.2" fill="var(--accent)"/>';
    return svg;
}
export function applyTheme(t) {
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try {
        localStorage.setItem('tahdiri-theme', t);
    }
    catch { /* ignore */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#14181f' : '#f6f4ef');
    const b = document.getElementById('theme-btn');
    if (b) {
        b.replaceChildren(icon(dark ? 'sun' : 'moon'));
    }
}
// التثبيت كتطبيق PWA
let deferred = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });
export function installPrompt() {
    const standalone = matchMedia('(display-mode: standalone)').matches;
    if (standalone)
        return h('p', { class: 'small muted' }, 'التطبيق مثبت على جهازك.');
    if (deferred) {
        return btn('ثبّت التطبيق على جهازك', async () => { await deferred?.prompt(); deferred = null; }, 'soft');
    }
    return h('p', { class: 'small muted' }, 'لتثبيت التطبيق: افتح قائمة المتصفح واختر «إضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق».');
}
