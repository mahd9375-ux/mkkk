// واجهة البحث داخل الكتب والمحتوى المستورد.
import { h, emptyState, link, clear, badge } from './dom.js';
import { db } from '../db.js';
import { searchContent } from '../search.js';
export async function searchView(root, params) {
    const [books, pages, summaries, questions] = await Promise.all([
        db.all('books'), db.all('pages'), db.all('summaries'), db.all('questions'),
    ]);
    root.append(h('h1', null, 'البحث في الكتب'));
    if (!books.length) {
        root.append(emptyState('لا توجد كتب مستوردة للبحث فيها', 'البحث يعمل داخل الكتب الرسمية بعد استيرادها واستخراج نصوصها.', link('المكتبة', '#/library')));
        return;
    }
    const input = h('input', { type: 'search', value: params.get('q') ?? '', placeholder: 'مثل: قانون كولوم، الشحنة، تعريف الموصل', 'aria-label': 'كلمات البحث', dir: 'auto' });
    const bookSel = h('select', { 'aria-label': 'الكتاب' }, h('option', { value: '' }, 'كل الكتب'), ...books.map(b => h('option', { value: b.id }, b.title)));
    bookSel.value = params.get('book') ?? '';
    const out = h('div', { class: 'stack' });
    const run = () => {
        clear(out);
        const q = input.value.trim();
        if (!q)
            return;
        const hits = searchContent(q, { books, pages, summaries, questions }, { bookId: bookSel.value || undefined });
        history.replaceState(null, '', `#/search?q=${encodeURIComponent(q)}${bookSel.value ? `&book=${encodeURIComponent(bookSel.value)}` : ''}`);
        if (!hits.length) {
            out.append(h('p', { class: 'muted' }, 'لا توجد نتائج.'));
            return;
        }
        out.append(h('p', { class: 'muted small' }, `${hits.length} نتيجة`));
        for (const r of hits) {
            const href = r.bookId && r.printedPage !== undefined ? `#/page/${encodeURIComponent(r.bookId)}/${r.printedPage}` : '#/exams';
            out.append(h('a', { class: 'card card-link', href }, h('div', { class: 'row wrap gap-s' }, badge(r.kind === 'page' ? 'نص الكتاب' : r.kind === 'summary' ? 'ملخص' : 'سؤال', r.kind === 'page' ? 'muted' : 'info'), h('strong', null, r.title)), r.snippet ? h('p', { class: 'small', dir: 'auto' }, r.snippet) : null));
        }
    };
    let t;
    input.oninput = () => { clearTimeout(t); t = window.setTimeout(run, 250); };
    bookSel.onchange = run;
    root.append(h('div', { class: 'row wrap' }, h('div', { class: 'grow' }, input), bookSel), out);
    input.focus();
    run();
}
