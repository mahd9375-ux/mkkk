// أداة استيراد وإدارة المحتوى (محلية).
// كل التعديلات هنا تخص نسخة هذا الجهاز فقط. لا توجد واجهة عامة لتعديل المحتوى المنشور:
// النشر يتم بتصدير «حزمة محتوى» ووضعها في مجلد content/ عند نشر الموقع.
import { h, btn, link, card, badge, emptyState, toast, clear, downloadFile, pickFile, confirmDialog, icon } from './dom.js';
import { loadSources } from './state.js';
import { SUBJECTS, subjectName } from '../subjects.js';
import { db, nowIso, uid } from '../db.js';
import { pagesForBook, chaptersForBook, importPack, getAiToken, setAiToken, getSettings, saveSettings } from '../services.js';
import { MAX_PDF_BYTES, isPdfHeader, sha256Hex, openPdf, extractPageText, renderPageToCanvas, ocrImage } from '../pdfImport.js';
import { generateFromPage, termsFromPages } from '../generator.js';
import { suggestLinks, groupSimilar } from '../linker.js';
import { aiQuestions, aiSummarize } from '../ai.js';
import { parseSummaryText, summaryToText, parseChaptersText, chaptersToText, KIND_TITLE } from '../summaryFormat.js';
import { textHash } from '../arabic.js';
import { PACK_FORMAT, PACK_VERSION } from '../contentPack.js';
import { ORIGIN_LABEL, REVIEW_LABEL, originBadge } from './library.js';
// ملف PDF المفتوح حاليًا في الجلسة (لإعادة المعالجة دون استيراد الكتاب كاملًا)
const openDocs = new Map();
let cancelFlag = false;
async function ensureDoc(book) {
    if (openDocs.has(book.id))
        return openDocs.get(book.id);
    toast('اختر ملف PDF الأصلي لهذا الكتاب لإعادة المعالجة', 'warn');
    const f = await pickFile('application/pdf,.pdf');
    if (!f)
        return null;
    const buf = await f.arrayBuffer();
    const hash = await sha256Hex(buf);
    if (book.sha256 && hash !== book.sha256) {
        toast('هذا ليس نفس الملف (البصمة مختلفة).', 'err');
        return null;
    }
    const doc = await openPdf(buf);
    openDocs.set(book.id, doc);
    return doc;
}
function aiCfg() {
    return getSettings().then(s => ({ endpoint: s.aiEndpoint, token: getAiToken() }));
}
// ================= الصفحة الرئيسية للأداة =================
export async function adminView(root, params) {
    const books = await db.all('books');
    const src = await loadSources();
    root.append(h('h1', null, 'أداة استيراد وإدارة المحتوى'), card(h('p', { class: 'small' }, 'هذه أداة محلية: كل ما تستورده أو تعدّله هنا يُحفظ على هذا الجهاز فقط. لا يستطيع أحد تعديل المحتوى المنشور من خلالها. لنشر المحتوى لكل الطلاب: صدّر «حزمة محتوى» وضعها في مجلد content/ عند نشر الموقع (راجع docs/CONTENT.md).'), h('p', { class: 'small muted' }, 'تعامل مع كل ملف PDF أو صورة كمدخل غير موثوق: نتحقق من النوع والحجم، ولا ننفذ أي شيفرة من داخل الملفات.')));
    // ---- استيراد كتاب ----
    const reg = src?.books ?? [];
    const pre = reg.find(b => b.id === params.get('registry'));
    const regSel = h('select', { 'aria-label': 'من سجل المصادر' }, h('option', { value: '' }, '— إدخال يدوي —'), ...reg.map(b => h('option', { value: b.id }, b.title)));
    const subj = h('select', { 'aria-label': 'المادة' }, ...SUBJECTS.map(s => h('option', { value: s.id }, s.name)));
    const title = h('input', { placeholder: 'عنوان الكتاب كما في الغلاف' });
    const track = h('select', null, h('option', { value: 'عام' }, 'عام'), h('option', { value: 'متميزين' }, 'متميزين'));
    const edition = h('input', { placeholder: 'مثال: الطبعة الثامنة 2024 — من صفحة الطبعة داخل الكتاب' });
    const year = h('input', { placeholder: 'مثال: 2025-2026' });
    const url = h('input', { type: 'url', placeholder: 'https://manahj.edu.iq/…', dir: 'ltr' });
    const offset = h('input', { type: 'number', value: 0, 'aria-label': 'إزاحة الترقيم' });
    const rights = h('textarea', { rows: 2 }, src?.bookCommon.rights ?? '');
    const autoOcr = h('input', { type: 'checkbox', checked: true });
    const applyReg = (id) => {
        const r = reg.find(b => b.id === id);
        if (!r)
            return;
        subj.value = r.subjectId;
        title.value = r.title;
        track.value = r.track;
        url.value = r.url;
    };
    regSel.onchange = () => applyReg(regSel.value);
    if (pre) {
        regSel.value = pre.id;
        applyReg(pre.id);
    }
    const progress = h('div', { class: 'stack-s' });
    const doImport = async () => {
        if (!title.value.trim()) {
            toast('اكتب عنوان الكتاب', 'warn');
            return;
        }
        if (!edition.value.trim()) {
            toast('اكتب الطبعة كما تظهر داخل الكتاب — لا نعتمد كتابًا بلا طبعة.', 'warn');
            return;
        }
        const f = await pickFile('application/pdf,.pdf');
        if (!f)
            return;
        if (f.size > MAX_PDF_BYTES) {
            toast('الملف أكبر من 200 ميغابايت', 'err');
            return;
        }
        const buf = await f.arrayBuffer();
        if (!isPdfHeader(buf)) {
            toast('الملف ليس PDF صالحًا', 'err');
            return;
        }
        const hash = await sha256Hex(buf);
        const dup = (await db.all('books')).find(b => b.sha256 === hash);
        if (dup) {
            toast(`هذا الملف مستورد مسبقًا باسم «${dup.title}»`, 'warn');
            location.hash = `#/admin/book/${encodeURIComponent(dup.id)}`;
            return;
        }
        clear(progress);
        const line = h('div', { class: 'small' }, 'جارٍ فتح الملف…');
        const bar = h('div', { class: 'progress-bar', style: 'width:0%' });
        progress.append(line, h('div', { class: 'progress' }, bar), btn('إيقاف', () => { cancelFlag = true; }, 'ghost'));
        let doc;
        try {
            doc = await openPdf(buf);
        }
        catch (e) {
            line.textContent = `تعذّر فتح الملف: ${e.message}. تحقق من الاتصال لتحميل pdf.js أول مرة.`;
            return;
        }
        const now = nowIso();
        const book = {
            id: uid('book'), subjectId: subj.value, title: title.value.trim(), track: track.value, edition: edition.value.trim(), schoolYear: year.value.trim(),
            sourceUrl: url.value.trim(), accessedAt: now.slice(0, 10), fileName: f.name, sha256: hash, pageCount: doc.numPages,
            pageOffset: +offset.value || 0, downloadStatus: 'imported', extractionStatus: 'in_progress', verificationStatus: 'unverified',
            rights: rights.value.trim(), createdAt: now, updatedAt: now,
        };
        await db.put('books', book);
        openDocs.set(book.id, doc);
        cancelFlag = false;
        const counts = await processPages(book, doc, range(1, doc.numPages), autoOcr.checked, (i, n, msg) => {
            line.textContent = `صفحة ${i} من ${n} — ${msg}`;
            bar.style.width = `${Math.round((i / n) * 100)}%`;
        });
        line.textContent = `انتهى: ${counts.ok} سليمة، ${counts.low} ضعيفة، ${counts.failed} فاشلة، ${counts.empty} فارغة${cancelFlag ? ' (أُوقف قبل الاكتمال)' : ''}.`;
        toast('تم استيراد الكتاب');
        location.hash = `#/admin/book/${encodeURIComponent(book.id)}`;
    };
    root.append(card(h('h2', null, 'استيراد كتاب PDF'), h('p', { class: 'small muted' }, 'نزّل الكتاب من موقع المديرية العامة للمناهج أولًا، ثم استورده هنا. لا نعيد نشر ملف PDF نفسه؛ نحفظ النص المستخرج لكل صفحة مع رقمها.'), h('div', { class: 'grid2' }, field('من سجل المصادر', regSel), field('المادة', subj), field('العنوان', title), field('المسار', track), field('الطبعة (إلزامي)', edition), field('السنة الدراسية', year), field('رابط المصدر', url), field('إزاحة الترقيم (رقم صفحة PDF − رقم الصفحة المطبوعة)', offset)), field('حقوق الاستخدام المعروفة', rights), h('label', { class: 'row small' }, autoOcr, ' تشغيل OCR تلقائيًا للصفحات المصورة أو المشوهة (أبطأ)'), btn([icon('upload'), ' اختر ملف PDF وابدأ'], () => void doImport(), 'primary'), progress));
    // ---- الكتب المستوردة ----
    const listCard = card(h('h2', null, 'الكتب المستوردة وسجل المعالجة'));
    if (!books.length)
        listCard.append(h('p', { class: 'muted' }, 'لم يُستورد أي كتاب بعد.'));
    for (const b of books) {
        const pages = await pagesForBook(b.id);
        const c = { ok: 0, low_quality: 0, failed: 0, empty: 0 };
        for (const p of pages)
            c[p.status]++;
        listCard.append(h('div', { class: 'row between wrap admin-row' }, h('div', null, h('strong', null, b.title), h('div', { class: 'small muted' }, `${subjectName(b.subjectId)} · ${b.edition} · ${pages.length}/${b.pageCount ?? '?'} صفحة · سليمة ${c.ok} · ضعيفة ${c.low_quality} · فاشلة ${c.failed} · فارغة ${c.empty}`)), link('إدارة', `#/admin/book/${encodeURIComponent(b.id)}`)));
    }
    root.append(listCard);
    // ---- الوزاريات ----
    const pending = (await db.all('questions')).filter(q => q.origin === 'ministerial_unverified' || (q.origin === 'ministerial_verified' && q.reviewStatus !== 'verified'));
    root.append(card(h('h2', null, 'الأسئلة الوزارية'), h('p', { class: 'small' }, 'أدخل السؤال من ملف الامتحان الأصلي بعد قراءته، مع الرابط والسنة والدور ورقم الصفحة في الملف. لا يُوسم «موثقًا» إلا بعد التحقق من الأصل.'), h('div', { class: 'row wrap' }, link('+ إضافة سؤال وزاري', '#/admin/exam/new'), pending.length ? badge(`${pending.length} بانتظار التحقق`, 'warn') : null), ...pending.slice(0, 20).map(q => h('div', { class: 'row between admin-row' }, h('span', { class: 'small' }, `${subjectName(q.subjectId)} · ${q.exam?.year ?? '؟'} ${q.exam?.round ?? ''} · ${q.prompt.slice(0, 60)}`), link('تحقق', `#/admin/exam/${q.id}`, 'btn btn-ghost')))));
    // ---- حزم المحتوى ----
    root.append(card(h('h2', null, 'حزم المحتوى'), h('div', { class: 'row wrap' }, btn([icon('download'), ' تصدير كل المحتوى'], () => void exportPack()), btn([icon('upload'), ' استيراد حزمة'], async () => {
        const f = await pickFile('application/json,.json');
        if (!f)
            return;
        try {
            const r = await importPack(JSON.parse(await f.text()), 'local');
            toast(`تم: ${r.books} كتاب، ${r.pages} صفحة، ${r.questions} سؤال`);
            if (r.warnings.length)
                alert(r.warnings.join('\n'));
            clear(root);
            await adminView(root, params);
        }
        catch (e) {
            toast(e.message, 'err');
        }
    }))));
    // ---- الذكاء الاصطناعي ----
    const s = await getSettings();
    const ep = h('input', { type: 'url', dir: 'ltr', value: s.aiEndpoint, placeholder: 'https://your-proxy.example.com' });
    const tk = h('input', { type: 'password', dir: 'ltr', value: getAiToken(), placeholder: 'رمز المشرف للخادم الوسيط' });
    root.append(card(h('h2', null, 'الذكاء الاصطناعي (اختياري)'), h('p', { class: 'small' }, 'توليد الملخصات والأسئلة بالذكاء الاصطناعي يتطلب خادمًا وسيطًا تشغّله أنت (server/ai-proxy.mjs) ومفتاح Anthropic API مدفوعًا. اشتراك Claude لا يتضمن API مجانيًا. المفتاح يبقى في الخادم ولا يوضع هنا أبدًا.'), field('عنوان الخادم الوسيط', ep), field('رمز المشرف (يُحفظ لهذه الجلسة فقط)', tk), btn('حفظ', async () => { await saveSettings({ aiEndpoint: ep.value.trim() }); setAiToken(tk.value.trim()); toast('تم الحفظ'); })));
}
function field(label, el) {
    return h('label', { class: 'field' }, h('span', null, label), el);
}
function range(a, b) {
    const out = [];
    for (let i = a; i <= b; i++)
        out.push(i);
    return out;
}
/** معالجة صفحات: نص PDF أولًا، ثم OCR عند الحاجة. لا تُعتمد الصفحات غير المقروءة. */
async function processPages(book, doc, indices, useOcr, onStep, forceOcr = false) {
    const counts = { ok: 0, low: 0, failed: 0, empty: 0 };
    let n = 0;
    for (const i of indices) {
        if (cancelFlag)
            break;
        n++;
        let page;
        const base = { id: `${book.id}:${i}`, bookId: book.id, pdfIndex: i, printedPage: i - book.pageOffset, reviewed: false, updatedAt: nowIso() };
        try {
            const r = forceOcr ? { text: '', status: 'empty', note: '' } : await extractPageText(doc, i);
            page = { ...base, text: r.text, method: 'pdf_text', status: r.status };
            if (useOcr && (r.status !== 'ok')) {
                onStep(n, indices.length, 'OCR…');
                const canvas = await renderPageToCanvas(doc, i, 2);
                const o = await ocrImage(canvas, book.subjectId === 'english' || book.subjectId === 'french' ? 'eng+ara' : 'ara+eng');
                if (o.text && (o.status === 'ok' || r.status !== 'low_quality')) {
                    page = { ...base, text: o.text, method: 'ocr', ocrConfidence: o.confidence, status: o.status };
                }
            }
        }
        catch (e) {
            page = { ...base, text: '', method: 'pdf_text', status: 'failed' };
            console.warn('page failed', i, e);
        }
        // لا نستبدل نصًا راجعه إنسان
        const existing = await db.get('pages', base.id);
        if (existing?.reviewed && !forceOcr) {
            onStep(n, indices.length, 'محفوظة (مراجَعة)');
            continue;
        }
        await db.put('pages', page);
        if (page.status === 'ok')
            counts.ok++;
        else if (page.status === 'low_quality')
            counts.low++;
        else if (page.status === 'failed')
            counts.failed++;
        else
            counts.empty++;
        onStep(n, indices.length, page.status === 'ok' ? 'سليمة' : page.status);
    }
    const all = await pagesForBook(book.id);
    book.extractionStatus = all.length >= (book.pageCount ?? 0) ? (all.every(p => p.status === 'ok') ? 'done' : 'partial') : 'partial';
    book.updatedAt = nowIso();
    await db.put('books', book);
    return counts;
}
async function exportPack(bookId) {
    const books = (await db.all('books')).filter(b => !bookId || b.id === bookId);
    const ids = new Set(books.map(b => b.id));
    const pack = {
        format: PACK_FORMAT, version: PACK_VERSION, createdAt: nowIso(), generator: 'tahdiri-admin-web',
        books,
        chapters: (await db.all('chapters')).filter(c => ids.has(c.bookId)),
        pages: (await db.all('pages')).filter(p => ids.has(p.bookId)),
        summaries: (await db.all('summaries')).filter(s => ids.has(s.bookId)),
        questions: (await db.all('questions')).filter(q => !bookId || q.bookId === bookId || q.links.some(l => ids.has(l.bookId))),
    };
    downloadFile(`tahdiri-content-${bookId ?? 'all'}-${nowIso().slice(0, 10)}.json`, JSON.stringify(pack));
}
// ================= إدارة كتاب =================
export async function adminBookView(root, bookId) {
    const book = await db.get('books', bookId);
    if (!book) {
        root.append(emptyState('الكتاب غير موجود', '', link('الأداة', '#/admin')));
        return;
    }
    const pages = await pagesForBook(bookId);
    const chapters = await chaptersForBook(bookId);
    const sums = new Map((await db.byIndex('summaries', 'bookId', bookId)).map(s => [s.printedPage, s]));
    const qs = (await db.all('questions')).filter(q => q.bookId === bookId);
    const refresh = () => { clear(root); void adminBookView(root, bookId); };
    root.append(h('div', { class: 'small' }, link('← أداة المحتوى', '#/admin', 'lnk')), h('h1', null, book.title));
    // ---- البيانات ----
    const ed = h('input', { value: book.edition });
    const yr = h('input', { value: book.schoolYear });
    const off = h('input', { type: 'number', value: book.pageOffset });
    const url = h('input', { type: 'url', dir: 'ltr', value: book.sourceUrl });
    const rights = h('textarea', { rows: 2 }, book.rights);
    const ver = h('select', null, ...['unverified', 'needs_review', 'verified'].map(v => h('option', { value: v }, REVIEW_LABEL[v])));
    ver.value = book.verificationStatus;
    root.append(card(h('h2', null, 'بيانات الكتاب'), h('div', { class: 'grid2' }, field('الطبعة', ed), field('السنة الدراسية', yr), field('إزاحة الترقيم', off), field('رابط المصدر', url), field('حالة التحقق', ver)), field('الحقوق', rights), h('p', { class: 'tiny muted mono' }, `SHA-256: ${book.sha256 ?? '—'} · الملف: ${book.fileName ?? '—'} · ${book.pageCount ?? '?'} صفحة`), h('p', { class: 'tiny muted' }, '«متحقق» تعني: فتحت الملف وتأكدت من الصف والمادة والطبعة من صفحة الطبعة داخل الكتاب، ومن أن المصدر رسمي.'), h('div', { class: 'row wrap' }, btn('حفظ', async () => {
        const newOff = +off.value || 0;
        if (newOff !== book.pageOffset) {
            for (const p of pages) {
                p.printedPage = p.pdfIndex - newOff;
            }
            await db.putMany('pages', pages);
        }
        Object.assign(book, { edition: ed.value.trim(), schoolYear: yr.value.trim(), pageOffset: newOff, sourceUrl: url.value.trim(), rights: rights.value.trim(), verificationStatus: ver.value, updatedAt: nowIso() });
        await db.put('books', book);
        toast('تم الحفظ');
        refresh();
    }, 'primary'), btn([icon('download'), ' تصدير حزمة هذا الكتاب'], () => void exportPack(bookId)), btn([icon('trash'), ' حذف الكتاب'], async () => {
        if (!(await confirmDialog('حذف الكتاب وكل صفحاته وملخصاته وأسئلته المولّدة من هذا الجهاز؟')))
            return;
        await db.deleteWhere('pages', p => p.bookId === bookId);
        await db.deleteWhere('summaries', s => s.bookId === bookId);
        await db.deleteWhere('chapters', c => c.bookId === bookId);
        await db.deleteWhere('questions', q => q.bookId === bookId && q.origin === 'book_generated');
        await db.delete('books', bookId);
        location.hash = '#/admin';
    }, 'danger'))));
    // ---- الفصول ----
    const chText = h('textarea', { rows: 8, dir: 'auto', placeholder: '# الفصل الأول: الكهربائية الساكنة\n- الشحنة الكهربائية | 8-12\n- قانون كولوم | 13-17' }, chaptersToText(chapters));
    root.append(card(h('h2', null, 'الفصول والدروس'), h('p', { class: 'small muted' }, 'اكتبها من فهرس الكتاب: سطر يبدأ بـ # لكل فصل، وسطر لكل درس بالشكل «العنوان | من-إلى» بأرقام الصفحات المطبوعة.'), chText, btn('حفظ الفصول', async () => {
        const parsed = parseChaptersText(chText.value, bookId);
        await db.deleteWhere('chapters', c => c.bookId === bookId);
        await db.putMany('chapters', parsed);
        toast(`تم حفظ الفصول (${parsed.length})`);
    }, 'primary')));
    // ---- التوليد الجماعي ----
    const genLog = h('div', { class: 'small' });
    root.append(card(h('h2', null, 'توليد أسئلة وملخصات'), h('p', { class: 'small' }, 'المولّد القاعدي (بدون إنترنت) يستخرج التعاريف والتعاليل من نص الصفحات المقروءة فقط ويحوّلها إلى أسئلة تدريبية موسومة «لم تتم مراجعته». الذكاء الاصطناعي يحتاج خادمًا وسيطًا.'), h('div', { class: 'row wrap' }, btn('توليد أسئلة قاعدية لكل الصفحات السليمة', async () => {
        const good = pages.filter(p => p.status === 'ok' || p.reviewed);
        const pool = termsFromPages(good.map(p => p.text));
        await db.deleteWhere('questions', q => q.bookId === bookId && (q.generatedBy ?? '').startsWith('rule-') && q.reviewStatus === 'needs_review');
        let n = 0;
        for (const p of good) {
            const g = generateFromPage({ bookId, subjectId: book.subjectId, printedPage: p.printedPage, text: p.text }, pool);
            await db.putMany('questions', g);
            n += g.length;
        }
        genLog.textContent = `تم توليد ${n} سؤال من ${good.length} صفحة.`;
    }), btn('ملخصات بالذكاء الاصطناعي للصفحات بلا ملخص', async () => {
        const cfg = await aiCfg();
        if (!cfg.endpoint) {
            toast('اضبط الخادم الوسيط أولًا', 'warn');
            return;
        }
        const todo = pages.filter(p => (p.status === 'ok' || p.reviewed) && !sums.has(p.printedPage));
        cancelFlag = false;
        let done = 0;
        for (const p of todo) {
            if (cancelFlag)
                break;
            try {
                const s = await aiSummarize(cfg, { bookId, bookTitle: book.title, edition: book.edition, subjectName: subjectName(book.subjectId), printedPage: p.printedPage, text: p.text });
                await db.put('summaries', s);
                done++;
                genLog.textContent = `ملخصات: ${done}/${todo.length}`;
            }
            catch (e) {
                genLog.textContent = `توقف عند صفحة ${p.printedPage}: ${e.message}`;
                break;
            }
        }
    }), btn('إيقاف', () => { cancelFlag = true; }, 'ghost')), genLog));
    // ---- قائمة مراجعة الأسئلة ----
    const toReview = qs.filter(q => q.reviewStatus === 'needs_review');
    root.append(card(h('h2', null, `مراجعة الأسئلة المولّدة (${toReview.length})`), toReview.length ? link('افتح قائمة المراجعة', `#/admin/questions/${encodeURIComponent(bookId)}`) : h('p', { class: 'muted small' }, 'لا توجد أسئلة بانتظار المراجعة.')));
    // ---- أسئلة الكتاب (نهاية الدروس/الفصول) ----
    const exList = qs.filter(q => q.origin === 'book_exercise');
    const exCh = h('select', null, ...chapters.map(c => h('option', { value: c.id }, c.title)));
    const exPage = h('input', { type: 'number', min: 1, placeholder: 'رقم الصفحة المطبوعة' });
    const exNum = h('input', { placeholder: 'رقم السؤال كما في الكتاب (مثل س3)' });
    const exText = h('textarea', { rows: 3, dir: 'auto', placeholder: 'انقل نص السؤال حرفيًا من الكتاب' });
    const exSol = h('textarea', { rows: 4, dir: 'auto', placeholder: 'الحل' });
    const exOfficial = h('input', { type: 'checkbox' });
    root.append(card(h('h2', null, `أسئلة الكتاب وحلولها (${exList.length})`), chapters.length ? null : h('p', { class: 'note warn' }, 'أدخل الفصول أولًا.'), h('div', { class: 'grid2' }, field('الفصل', exCh), field('الصفحة', exPage), field('رقم السؤال', exNum)), field('نص السؤال (حرفيًا)', exText), field('الحل', exSol), h('label', { class: 'row small' }, exOfficial, ' الحل من مصدر رسمي موثق (دليل المدرس مثلًا). وإلا يُعرض «حل مقترح من المنصة».'), btn('إضافة السؤال', async () => {
        if (!chapters.length || !exText.value.trim() || !exSol.value.trim() || !exPage.value) {
            toast('أكمل الفصل والصفحة والنص والحل', 'warn');
            return;
        }
        const q = {
            id: uid('ex'), subjectId: book.subjectId, bookId, origin: 'book_exercise', type: 'short', prompt: exText.value.trim(), answer: exSol.value.trim(),
            links: [{ bookId, printedPages: [+exPage.value], chapterId: exCh.value, confidence: 1, status: 'confirmed', method: 'manual' }],
            exercise: { sourcePage: +exPage.value, number: exNum.value.trim() || undefined, solutionOfficial: exOfficial.checked },
            reviewStatus: 'reviewed', generatedBy: 'manual', createdAt: nowIso(),
        };
        await db.put('questions', q);
        toast('تمت الإضافة');
        refresh();
    }, 'primary'), ...exList.map(q => h('div', { class: 'row between admin-row' }, h('span', { class: 'small' }, `ص ${q.exercise?.sourcePage} ${q.exercise?.number ?? ''} — ${q.prompt.slice(0, 70)}`), btn(icon('trash'), async () => { if (await confirmDialog('حذف السؤال؟')) {
        await db.delete('questions', q.id);
        refresh();
    } }, 'ghost', { 'aria-label': 'حذف' })))));
    // ---- الصفحات ----
    const filter = h('select', null, h('option', { value: 'all' }, 'كل الصفحات'), h('option', { value: 'bad' }, 'ضعيفة/فاشلة/فارغة'), h('option', { value: 'nosum' }, 'بلا ملخص'), h('option', { value: 'unrev' }, 'لم يراجعها إنسان'));
    const table = h('div', { class: 'table-wrap' });
    const renderTable = () => {
        clear(table);
        const rows = pages.filter(p => filter.value === 'all' || (filter.value === 'bad' && p.status !== 'ok') || (filter.value === 'nosum' && !sums.has(p.printedPage)) || (filter.value === 'unrev' && !p.reviewed));
        table.append(h('table', null, h('thead', null, h('tr', null, ...['PDF', 'مطبوعة', 'الطريقة', 'الحالة', 'ملخص', ''].map(x => h('th', null, x)))), h('tbody', null, ...rows.slice(0, 400).map(p => h('tr', null, h('td', null, String(p.pdfIndex)), h('td', null, String(p.printedPage)), h('td', null, p.method === 'ocr' ? `OCR ${Math.round(p.ocrConfidence ?? 0)}%` : p.method === 'manual' ? 'يدوي' : p.method === 'ai_vision' ? 'قراءة آلية للصورة' : 'نص'), h('td', null, badge(p.status, p.status === 'ok' ? 'ok' : 'warn'), p.reviewed ? badge('مراجَعة', 'ok') : null), h('td', null, sums.has(p.printedPage) ? badge(REVIEW_LABEL[sums.get(p.printedPage).reviewStatus], 'muted') : '—'), h('td', null, link('تحرير', `#/admin/page/${encodeURIComponent(bookId)}/${p.pdfIndex}`, 'lnk')))))));
    };
    filter.onchange = renderTable;
    renderTable();
    const failed = pages.filter(p => p.status !== 'ok' && !p.reviewed).map(p => p.pdfIndex);
    const missing = book.pageCount ? range(1, book.pageCount).filter(i => !pages.some(p => p.pdfIndex === i)) : [];
    const repLog = h('div', { class: 'small' });
    root.append(card(h('h2', null, 'الصفحات'), h('div', { class: 'row wrap' }, filter, failed.length ? btn(`إعادة معالجة ${failed.length} صفحة ضعيفة بـ OCR`, async () => {
        const doc = await ensureDoc(book);
        if (!doc)
            return;
        cancelFlag = false;
        const c = await processPages(book, doc, failed, true, (i, n, m) => { repLog.textContent = `${i}/${n} ${m}`; }, true);
        toast(`سليمة ${c.ok}، ضعيفة ${c.low}، فاشلة ${c.failed}`);
        refresh();
    }) : null, missing.length ? btn(`استكمال ${missing.length} صفحة لم تُعالج`, async () => {
        const doc = await ensureDoc(book);
        if (!doc)
            return;
        cancelFlag = false;
        await processPages(book, doc, missing, true, (i, n, m) => { repLog.textContent = `${i}/${n} ${m}`; });
        refresh();
    }) : null), repLog, table));
}
// ================= تحرير صفحة =================
export async function adminPageView(root, bookId, pdfIndex) {
    const book = await db.get('books', bookId);
    const page = await db.get('pages', `${bookId}:${pdfIndex}`);
    if (!book || !page) {
        root.append(emptyState('الصفحة غير موجودة', ''));
        return;
    }
    const summary = await db.get('summaries', `${bookId}:${page.printedPage}`);
    const refresh = () => { clear(root); void adminPageView(root, bookId, pdfIndex); };
    root.append(h('div', { class: 'small' }, link(`← ${book.title}`, `#/admin/book/${encodeURIComponent(bookId)}`, 'lnk')), h('h1', null, `صفحة ${page.printedPage} (PDF ${pdfIndex})`));
    const preview = h('div', { class: 'page-preview' });
    const txt = h('textarea', { rows: 16, dir: 'auto', class: 'mono-ar' }, page.text);
    root.append(card(h('h2', null, 'النص المستخرج'), h('p', { class: 'small muted' }, `الطريقة: ${page.method} · الحالة: ${page.status}${page.ocrConfidence ? ` · ثقة OCR ${Math.round(page.ocrConfidence)}%` : ''}. صحّح النص بمقارنته بصورة الصفحة. لا تخمّن الكلمات أو المعادلات غير الواضحة — اكتب [غير واضح].`), h('div', { class: 'row wrap' }, btn('عرض صورة الصفحة', async () => {
        const doc = await ensureDoc(book);
        if (!doc)
            return;
        const c = await renderPageToCanvas(doc, pdfIndex, 1.5);
        c.className = 'page-canvas';
        clear(preview);
        preview.append(c);
    }), btn('إعادة OCR لهذه الصفحة', async () => {
        const doc = await ensureDoc(book);
        if (!doc)
            return;
        toast('جارٍ OCR…');
        const c = await renderPageToCanvas(doc, pdfIndex, 2);
        const o = await ocrImage(c, book.subjectId === 'english' || book.subjectId === 'french' ? 'eng+ara' : 'ara+eng');
        Object.assign(page, { text: o.text, method: 'ocr', ocrConfidence: o.confidence, status: o.status, reviewed: false, updatedAt: nowIso() });
        await db.put('pages', page);
        refresh();
    }), btn('إعادة استخراج نص PDF', async () => {
        const doc = await ensureDoc(book);
        if (!doc)
            return;
        const r = await extractPageText(doc, pdfIndex);
        Object.assign(page, { text: r.text, method: 'pdf_text', status: r.status, reviewed: false, updatedAt: nowIso() });
        delete page.ocrConfidence;
        await db.put('pages', page);
        refresh();
    })), h('div', { class: 'split' }, txt, preview), h('div', { class: 'row wrap' }, btn('حفظ واعتماد النص (راجعته)', async () => {
        Object.assign(page, { text: txt.value, reviewed: true, status: txt.value.trim() ? 'ok' : 'empty', method: page.text === txt.value ? page.method : 'manual', updatedAt: nowIso() });
        await db.put('pages', page);
        toast('تم الحفظ');
        refresh();
    }, 'primary'))));
    // الملخص
    const sumTxt = h('textarea', { rows: 14, dir: 'auto', placeholder: `# عنوان الموضوع\n## ${KIND_TITLE.idea}\n- …\n## ${KIND_TITLE.definitions}\n- …` }, summary ? summaryToText(summary.topic, summary.sections) : '');
    const sumStatus = h('select', null, ...['needs_review', 'reviewed', 'rejected'].map(v => h('option', { value: v }, REVIEW_LABEL[v])));
    sumStatus.value = summary?.reviewStatus ?? 'needs_review';
    root.append(card(h('h2', null, 'ملخص الصفحة'), summary ? h('p', { class: 'small muted' }, `المنشأ: ${summary.origin === 'ai' ? `ذكاء اصطناعي (${summary.model})` : 'يدوي'} · ${summary.generatedAt.slice(0, 10)}${summary.sourcePageTextHash !== textHash(page.text) ? ' · ⚠ نص الصفحة تغيّر بعد التلخيص' : ''}`) : null, h('p', { class: 'small muted' }, 'العناوين المعروفة: ' + Object.values(KIND_TITLE).join('، ')), sumTxt, h('div', { class: 'row wrap' }, field('حالة المراجعة', sumStatus), btn('حفظ الملخص', async () => {
        const parsed = parseSummaryText(sumTxt.value);
        if (!parsed.sections.length) {
            toast('الملخص فارغ', 'warn');
            return;
        }
        const s = {
            id: `${bookId}:${page.printedPage}`, bookId, printedPage: page.printedPage, topic: parsed.topic, sections: parsed.sections,
            origin: summary && summaryToText(summary.topic, summary.sections) === sumTxt.value ? summary.origin : 'manual',
            model: summary?.model, generatedAt: summary?.generatedAt ?? nowIso(), reviewStatus: sumStatus.value, sourcePageTextHash: textHash(page.text),
        };
        await db.put('summaries', s);
        toast('تم حفظ الملخص');
        refresh();
    }, 'primary'), btn('توليد بالذكاء الاصطناعي', async () => {
        const cfg = await aiCfg();
        if (!cfg.endpoint) {
            toast('اضبط الخادم الوسيط أولًا', 'warn');
            return;
        }
        if (page.status !== 'ok' && !page.reviewed) {
            toast('راجع نص الصفحة أولًا؛ لا نلخص نصًا غير مقروء.', 'warn');
            return;
        }
        try {
            const s = await aiSummarize(cfg, { bookId, bookTitle: book.title, edition: book.edition, subjectName: subjectName(book.subjectId), printedPage: page.printedPage, text: page.text });
            await db.put('summaries', s);
            toast('تم التوليد — راجعه');
            refresh();
        }
        catch (e) {
            toast(e.message, 'err');
        }
    }), btn('أسئلة بالذكاء الاصطناعي', async () => {
        const cfg = await aiCfg();
        if (!cfg.endpoint) {
            toast('اضبط الخادم الوسيط أولًا', 'warn');
            return;
        }
        try {
            const q = await aiQuestions(cfg, { bookId, bookTitle: book.title, edition: book.edition, subjectName: subjectName(book.subjectId), subjectId: book.subjectId, printedPage: page.printedPage, text: page.text });
            await db.putMany('questions', q);
            toast(`تم توليد ${q.length} سؤال — بانتظار المراجعة`);
        }
        catch (e) {
            toast(e.message, 'err');
        }
    }))));
}
// ================= مراجعة الأسئلة =================
export async function adminQuestionsView(root, bookId) {
    const qs = (await db.all('questions')).filter(q => q.bookId === bookId && q.reviewStatus === 'needs_review');
    root.append(h('div', { class: 'small' }, link('← الكتاب', `#/admin/book/${encodeURIComponent(bookId)}`, 'lnk')), h('h1', null, `مراجعة الأسئلة (${qs.length})`));
    if (!qs.length) {
        root.append(emptyState('لا توجد أسئلة بانتظار المراجعة', ''));
        return;
    }
    for (const q of qs.slice(0, 50)) {
        const prompt = h('textarea', { rows: 2, dir: 'auto' }, q.prompt);
        const answer = h('textarea', { rows: 2, dir: 'auto' }, q.answer);
        const c = card(h('div', { class: 'row wrap gap-s' }, originBadge(q), badge(`صفحة ${q.links[0]?.printedPages.join('،') ?? '?'}`, 'muted'), badge(q.generatedBy ?? '', 'muted')), field('السؤال', prompt), q.options ? h('ol', { class: 'opts small' }, ...q.options.map(o => h('li', null, o))) : null, field('الإجابة المرجعية', answer), q.explanation ? h('p', { class: 'muted small' }, q.explanation) : null, h('div', { class: 'row wrap' }, btn('اعتماد', async () => { q.prompt = prompt.value; q.answer = answer.value; q.reviewStatus = 'reviewed'; await db.put('questions', q); c.remove(); }, 'primary'), btn('رفض', async () => { q.reviewStatus = 'rejected'; await db.put('questions', q); c.remove(); }, 'danger')));
        root.append(c);
    }
}
// ================= إضافة/تحقق سؤال وزاري =================
export async function adminExamView(root, id) {
    const existing = id !== 'new' ? await db.get('questions', id) : undefined;
    const books = await db.all('books');
    root.append(h('div', { class: 'small' }, link('← أداة المحتوى', '#/admin', 'lnk')), h('h1', null, existing ? 'التحقق من سؤال وزاري' : 'إضافة سؤال وزاري'));
    const subj = h('select', null, ...SUBJECTS.map(s => h('option', { value: s.id }, s.name)));
    subj.value = existing?.subjectId ?? 'physics';
    const type = h('select', null, ...Object.entries({ mcq: 'اختيار من متعدد', true_false: 'صح أو خطأ', fill_blank: 'أكمل الفراغ', definition: 'تعريف', reason: 'تعليل', compare: 'مقارنة', short: 'قصير', calc: 'مسألة حسابية', explain: 'تفسيري' }).map(([k, v]) => h('option', { value: k }, v)));
    type.value = existing?.type ?? 'short';
    const prompt = h('textarea', { rows: 3, dir: 'auto' }, existing?.prompt ?? '');
    const options = h('textarea', { rows: 3, dir: 'auto', placeholder: 'خيار في كل سطر (للاختيار من متعدد)' }, existing?.options?.join('\n') ?? '');
    const answer = h('textarea', { rows: 2, dir: 'auto' }, existing?.answer ?? '');
    const unit = h('input', { value: existing?.unit ?? '', placeholder: 'الوحدة (للمسائل)' });
    const solOfficial = h('input', { type: 'checkbox', checked: existing?.exam?.solutionOfficial ?? false });
    const year = h('input', { type: 'number', min: 1990, max: 2100, value: existing?.exam?.year ?? '' });
    const round = h('select', null, ...['', 'الدور الأول', 'الدور الثاني', 'الدور الثالث', 'التمهيدي'].map(r => h('option', { value: r }, r || '— غير معروف —')));
    round.value = existing?.exam?.round ?? '';
    const srcUrl = h('input', { type: 'url', dir: 'ltr', value: existing?.exam?.sourceUrl ?? '' });
    const srcPage = h('input', { type: 'number', min: 1, value: existing?.exam?.sourcePage ?? '' });
    const srcImage = h('input', { dir: 'ltr', value: existing?.exam?.sourceImage ?? '', placeholder: 'content/exams/....jpg' });
    const verified = h('input', { type: 'checkbox', checked: existing?.origin === 'ministerial_verified' && existing.reviewStatus === 'verified' });
    const bookSel = h('select', null, h('option', { value: '' }, '— بدون ربط —'), ...books.map(b => h('option', { value: b.id }, b.title)));
    bookSel.value = existing?.links[0]?.bookId ?? '';
    const linkPages = h('input', { value: existing?.links[0]?.printedPages.join('، ') ?? '', placeholder: 'أرقام الصفحات المطبوعة، أو اتركه فارغًا للربط بالفصل' });
    const chapterSel = h('select', null, h('option', { value: '' }, '— الفصل —'));
    const sugBox = h('div', { class: 'small' });
    const loadChapters = async () => {
        clear(chapterSel);
        chapterSel.append(h('option', { value: '' }, '— الفصل —'));
        if (!bookSel.value)
            return;
        for (const c of await chaptersForBook(bookSel.value))
            chapterSel.append(h('option', { value: c.id }, c.title));
        chapterSel.value = existing?.links[0]?.chapterId ?? '';
    };
    bookSel.onchange = () => void loadChapters();
    await loadChapters();
    root.append(card(h('p', { class: 'note' }, 'انقل السؤال حرفيًا من ملف الامتحان الأصلي. ضع علامة «موثق» فقط إذا فتحت الملف الأصلي وتأكدت أنه امتحان الثالث المتوسط العراقي للمادة والسنة والدور المذكورة.'), h('div', { class: 'grid2' }, field('المادة', subj), field('النوع', type), field('السنة', year), field('الدور', round), field('رابط الملف الأصلي', srcUrl), field('رقم الصفحة في الملف', srcPage), field('مسار صورة الورقة (اختياري)', srcImage)), field('نص السؤال', prompt), field('الخيارات', options), field('الإجابة', answer), field('الوحدة', unit), h('label', { class: 'row small' }, solOfficial, ' الإجابة من حل رسمي موثق (وإلا تُعرض كحل مقترح من المنصة)'), h('h3', null, 'الربط بالكتاب'), h('div', { class: 'grid2' }, field('الكتاب', bookSel), field('الفصل', chapterSel), field('الصفحات', linkPages)), btn('اقترح الصفحات آليًا', async () => {
        if (!bookSel.value) {
            toast('اختر الكتاب', 'warn');
            return;
        }
        const pages = (await pagesForBook(bookSel.value)).filter(p => p.status === 'ok' || p.reviewed);
        const s = suggestLinks(`${prompt.value} ${answer.value}`, pages.map(p => ({ printedPage: p.printedPage, text: p.text })));
        sugBox.textContent = `${s.reason} الثقة ${Math.round(s.confidence * 100)}%. ${s.printedPages.length ? `الصفحات المقترحة: ${s.printedPages.join('، ')}` : ''} المصطلحات: ${s.topTerms.join('، ')}`;
        if (s.printedPages.length)
            linkPages.value = s.printedPages.join('، ');
    }), sugBox, h('label', { class: 'row' }, verified, ' تحققت من الأصل — اعرضه كسؤال وزاري موثق'), h('div', { class: 'row wrap' }, btn('حفظ', async () => {
        if (!prompt.value.trim() || !answer.value.trim()) {
            toast('السؤال والإجابة مطلوبان', 'warn');
            return;
        }
        const isVerified = verified.checked;
        if (isVerified && (!(srcUrl.value || srcImage.value) || !year.value || !round.value)) {
            toast('لا يمكن التوثيق بدون مصدر (رابط أو صورة) وسنة ودور.', 'err');
            return;
        }
        const { parsePagesInput } = await import('./state.js');
        const pagesArr = parsePagesInput(linkPages.value);
        const q = {
            id: existing?.id ?? uid('min'),
            subjectId: subj.value,
            bookId: bookSel.value || undefined,
            origin: isVerified ? 'ministerial_verified' : 'ministerial_unverified',
            type: type.value,
            prompt: prompt.value.trim(),
            options: type.value === 'mcq' ? options.value.split('\n').map(s => s.trim()).filter(Boolean) : undefined,
            answer: answer.value.trim(),
            unit: unit.value.trim() || undefined,
            links: bookSel.value ? [{ bookId: bookSel.value, printedPages: pagesArr, chapterId: chapterSel.value || undefined, confidence: 1, status: 'confirmed', method: 'manual' }] : [],
            exam: { year: year.value ? +year.value : undefined, round: round.value || undefined, sourceUrl: srcUrl.value.trim() || undefined, sourcePage: srcPage.value ? +srcPage.value : undefined, solutionOfficial: solOfficial.checked, sourceImage: srcImage.value.trim() || undefined },
            reviewStatus: isVerified ? 'verified' : 'unverified',
            generatedBy: 'manual',
            createdAt: existing?.createdAt ?? nowIso(),
        };
        // ربط الصيغ المتشابهة (دون حذف أي ظهور)
        const all = (await db.all('questions')).filter(x => x.origin.startsWith('ministerial') && x.subjectId === q.subjectId && x.id !== q.id);
        const groups = groupSimilar([{ id: q.id, text: q.prompt }, ...all.map(x => ({ id: x.id, text: x.prompt }))]);
        const g = groups.get(q.id);
        const match = [...groups.entries()].find(([k, v]) => k !== q.id && v === g);
        if (match)
            q.similarGroup = all.find(x => x.id === match[0])?.similarGroup ?? match[0];
        await db.put('questions', q);
        toast(isVerified ? 'تم الحفظ كسؤال وزاري موثق' : 'تم الحفظ — بانتظار التحقق');
        location.hash = '#/admin';
    }, 'primary'), existing ? btn('حذف', async () => { if (await confirmDialog('حذف السؤال؟')) {
        await db.delete('questions', existing.id);
        location.hash = '#/admin';
    } }, 'danger') : null)));
    void ORIGIN_LABEL;
}
