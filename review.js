const INTERVALS_DAYS = [1, 2, 4, 7, 14, 30];
export function emptyReview(bookId, printedPage) {
    return { id: `${bookId}:${printedPage}`, bookId, printedPage, mistakes: 0, correct: 0, reviews: 0, studied: false, needsReview: false };
}
function addDays(iso, days) {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString();
}
/** تحديث العنصر بعد نتيجة سؤال/اختبار على الصفحة */
export function applyResult(item, score, now) {
    const it = { ...item };
    if (score >= 0.7)
        it.correct++;
    else
        it.mistakes++;
    return reschedule(it, now);
}
export function markStudied(item, now) {
    return reschedule({ ...item, studied: true, reviews: item.reviews + 1, lastReviewAt: now }, now);
}
export function setSelfRating(item, rating, now) {
    return reschedule({ ...item, selfRating: rating }, now);
}
/** المستوى: كلما زادت الأخطاء وقلّ التقييم الذاتي، قصرت الفترة */
export function level(item) {
    let lv = Math.min(item.reviews, INTERVALS_DAYS.length - 1);
    lv -= Math.min(item.mistakes - Math.floor(item.correct / 2), 3);
    if (item.selfRating !== undefined)
        lv += item.selfRating >= 4 ? 1 : item.selfRating <= 2 ? -1 : 0;
    return Math.max(0, Math.min(INTERVALS_DAYS.length - 1, lv));
}
export function reschedule(item, now) {
    const lv = level(item);
    const base = item.lastReviewAt ?? now;
    const needsReview = item.mistakes > item.correct || (item.selfRating !== undefined && item.selfRating <= 2);
    return { ...item, needsReview, nextReviewAt: addDays(base, INTERVALS_DAYS[lv]) };
}
export function dueItems(items, now) {
    return items
        .filter(i => (i.studied || i.mistakes > 0) && i.nextReviewAt && i.nextReviewAt <= now)
        .sort((a, b) => (b.mistakes - b.correct) - (a.mistakes - a.correct) || (a.nextReviewAt < b.nextReviewAt ? -1 : 1));
}
