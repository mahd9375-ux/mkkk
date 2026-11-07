export function chapterPages(ch) {
    const set = new Set();
    for (const l of ch.lessons)
        for (let p = l.fromPage; p <= l.toPage; p++)
            set.add(p);
    return [...set].sort((a, b) => a - b);
}
export function chapterProgress(ch, reviews) {
    const pages = chapterPages(ch);
    const studied = new Set(reviews.filter(r => r.bookId === ch.bookId && r.studied).map(r => r.printedPage));
    const n = pages.filter(p => studied.has(p)).length;
    return { total: pages.length, studied: n, complete: pages.length > 0 && n === pages.length };
}
