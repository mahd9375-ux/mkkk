// تصدير واستعادة النسخة الاحتياطية — منطق نقي قابل للاختبار.
export const BACKUP_FORMAT = 'tahdiri-backup';
export const BACKUP_VERSION = 1;
/** المخازن التي تخص الطالب (تقدمه) */
export const STUDENT_STORES = ['tasks', 'attempts', 'review', 'settings'];
/** مخازن المحتوى المستورد محليًا */
export const CONTENT_STORES = ['books', 'chapters', 'pages', 'summaries', 'questions', 'lessons'];
export function makeBackup(data, includesContent, now = new Date().toISOString()) {
    return { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: now, includesContent, data };
}
export function validateBackup(obj) {
    if (!obj || typeof obj !== 'object')
        return { ok: false, error: 'الملف ليس JSON صالحًا.' };
    const b = obj;
    if (b.format !== BACKUP_FORMAT)
        return { ok: false, error: 'هذا الملف ليس نسخة احتياطية من «تحضيري».' };
    if (typeof b.version !== 'number' || b.version > BACKUP_VERSION)
        return { ok: false, error: 'إصدار النسخة الاحتياطية غير مدعوم.' };
    if (!b.data || typeof b.data !== 'object')
        return { ok: false, error: 'النسخة الاحتياطية لا تحتوي بيانات.' };
    const allowed = new Set([...STUDENT_STORES, ...CONTENT_STORES]);
    for (const [k, v] of Object.entries(b.data)) {
        if (!allowed.has(k))
            return { ok: false, error: `مخزن غير معروف في الملف: ${k}` };
        if (!Array.isArray(v))
            return { ok: false, error: `بيانات المخزن ${k} غير صالحة.` };
        for (const rec of v) {
            if (!rec || typeof rec !== 'object' || typeof rec.id !== 'string') {
                return { ok: false, error: `سجل بلا معرّف في المخزن ${k}.` };
            }
        }
    }
    return { ok: true, backup: b };
}
