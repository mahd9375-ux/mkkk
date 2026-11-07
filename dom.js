// أدوات DOM صغيرة بدون إطار عمل. كل النصوص تُدرج كنص (textContent) لمنع حقن HTML.
export function h(tag, attrs = null, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
            if (v === undefined || v === null || v === false)
                continue;
            if (k.startsWith('on') && typeof v === 'function') {
                el.addEventListener(k.slice(2).toLowerCase(), v);
            }
            else if (k === 'class')
                el.className = String(v);
            else if (k === 'value' && 'value' in el)
                el.value = String(v);
            else if (k === 'checked' && 'checked' in el)
                el.checked = Boolean(v);
            else if (v === true)
                el.setAttribute(k, '');
            else
                el.setAttribute(k, String(v));
        }
    }
    append(el, children);
    return el;
}
function append(el, children) {
    for (const c of children) {
        if (c === null || c === undefined || c === false)
            continue;
        if (Array.isArray(c))
            append(el, c);
        else if (c instanceof Node)
            el.appendChild(c);
        else
            el.appendChild(document.createTextNode(String(c)));
    }
}
export function clear(el) {
    while (el.firstChild)
        el.removeChild(el.firstChild);
}
export function icon(name, size = 20) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of ICONS[name]) {
        const p = document.createElementNS(ns, 'path');
        p.setAttribute('d', d);
        svg.appendChild(p);
    }
    return svg;
}
// أيقونات أصلية بسيطة مرسومة للمشروع
export const ICONS = {
    home: ['M4 11l8-7 8 7', 'M6 10v10h12V10'],
    list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
    book: ['M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z', 'M4 19V5'],
    quiz: ['M9 9a3 3 0 115 2c-1 .7-2 1.3-2 3', 'M12 18h.01', 'M12 2a10 10 0 100 20 10 10 0 000-20z'],
    archive: ['M3 5h18v4H3z', 'M5 9v10h14V9', 'M10 13h4'],
    repeat: ['M17 2l3 3-3 3', 'M4 11V9a4 4 0 014-4h12', 'M7 22l-3-3 3-3', 'M20 13v2a4 4 0 01-4 4H4'],
    chart: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
    gear: ['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z'],
    camera: ['M3 8a2 2 0 012-2h2l2-2h6l2 2h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z', 'M12 17a4 4 0 100-8 4 4 0 000 8z'],
    check: ['M5 12l5 5L20 7'],
    play: ['M7 4l13 8-13 8z'],
    pause: ['M7 4v16', 'M17 4v16'],
    edit: ['M4 20h4L19 9l-4-4L4 16z'],
    trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
    upload: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 20h16'],
    download: ['M12 4v12', 'M7 11l5 5 5-5', 'M4 20h16'],
    sun: ['M12 17a5 5 0 100-10 5 5 0 000 10z', 'M12 1v2', 'M12 21v2', 'M4.2 4.2l1.4 1.4', 'M18.4 18.4l1.4 1.4', 'M1 12h2', 'M21 12h2', 'M4.2 19.8l1.4-1.4', 'M18.4 5.6l1.4-1.4'],
    moon: ['M21 13A9 9 0 1111 3a7 7 0 0010 10z'],
    chevronR: ['M9 6l6 6-6 6'],
    chevronL: ['M15 6l-6 6 6 6'],
    info: ['M12 2a10 10 0 100 20 10 10 0 000-20z', 'M12 16v-5', 'M12 8h.01'],
    tools: ['M14 7l3-3 3 3-3 3', 'M17 4l-9 9', 'M4 20l4-1 9-9-3-3-9 9z'],
    flag: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],
    search: ['M11 18a7 7 0 100-14 7 7 0 000 14z', 'M20 20l-4-4'],
    notes: ['M6 3h9l4 4v14H6z', 'M14 3v5h5', 'M9 12h7', 'M9 16h7', 'M9 8h2'],
};
export function toast(msg, kind = 'ok') {
    const host = document.getElementById('toasts');
    const t = h('div', { class: `toast toast-${kind}`, role: 'status' }, msg);
    host.appendChild(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3700);
}
export function badge(text, kind = 'muted') {
    return h('span', { class: `badge badge-${kind}` }, text);
}
export function emptyState(title, body, action) {
    return h('div', { class: 'empty' }, h('div', { class: 'empty-title' }, title), h('p', null, body), action ?? null);
}
export function card(...children) {
    return h('section', { class: 'card' }, ...children);
}
export function btn(label, onClick, kind = 'soft', attrs = {}) {
    return h('button', { type: 'button', class: `btn btn-${kind}`, onclick: onClick, ...attrs }, label);
}
export function link(label, href, cls = 'btn btn-soft') {
    return h('a', { href, class: cls }, label);
}
export function confirmDialog(message) {
    return new Promise(resolve => {
        const dlg = h('dialog', { class: 'dialog' }, h('p', null, message), h('div', { class: 'row end' }, btn('إلغاء', () => { dlg.close(); resolve(false); }, 'ghost'), btn('تأكيد', () => { dlg.close(); resolve(true); }, 'danger')));
        document.body.appendChild(dlg);
        dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 50));
        dlg.showModal();
    });
}
export function downloadFile(name, content, type = 'application/json') {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function pickFile(accept) {
    return new Promise(resolve => {
        const inp = h('input', { type: 'file', accept, style: 'display:none' });
        inp.addEventListener('change', () => {
            resolve(inp.files?.[0] ?? null);
            inp.remove();
        });
        document.body.appendChild(inp);
        inp.click();
    });
}
export function fmtDate(iso) {
    if (!iso)
        return '—';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    return d.toLocaleDateString('ar-IQ', { weekday: 'short', day: 'numeric', month: 'short' });
}
export function pagesLabel(pages) {
    if (!pages.length)
        return '';
    const sorted = [...pages].sort((a, b) => a - b);
    const parts = [];
    let start = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
        const p = sorted[i];
        if (p === prev + 1) {
            prev = p;
            continue;
        }
        parts.push(start === prev ? `${start}` : `${start}–${prev}`);
        start = p;
        prev = p;
    }
    return (sorted.length === 1 ? 'صفحة ' : 'الصفحات ') + parts.join('، ');
}
