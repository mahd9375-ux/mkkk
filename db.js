const DB_NAME = 'tahdiri';
const DB_VERSION = 2;
const STORES = ['books', 'chapters', 'pages', 'summaries', 'questions', 'tasks', 'attempts', 'review', 'settings', 'lessons'];
let dbPromise = null;
export function openDb() {
    if (dbPromise)
        return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            for (const s of STORES) {
                if (!db.objectStoreNames.contains(s)) {
                    const os = db.createObjectStore(s, { keyPath: 'id' });
                    if (s === 'pages' || s === 'summaries' || s === 'chapters' || s === 'lessons')
                        os.createIndex('bookId', 'bookId');
                    if (s === 'questions')
                        os.createIndex('subjectId', 'subjectId');
                }
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbPromise;
}
function tx(store, mode, fn) {
    return openDb().then(db => new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const r = fn(s);
        let result;
        if (r)
            r.onsuccess = () => (result = r.result);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
    }));
}
export const db = {
    get(store, id) {
        return tx(store, 'readonly', s => s.get(id));
    },
    all(store) {
        return tx(store, 'readonly', s => s.getAll());
    },
    byIndex(store, index, value) {
        return tx(store, 'readonly', s => s.index(index).getAll(value));
    },
    put(store, value) {
        return tx(store, 'readwrite', s => {
            s.put(value);
        });
    },
    putMany(store, values) {
        return tx(store, 'readwrite', s => {
            for (const v of values)
                s.put(v);
        });
    },
    delete(store, id) {
        return tx(store, 'readwrite', s => {
            s.delete(id);
        });
    },
    clear(store) {
        return tx(store, 'readwrite', s => {
            s.clear();
        });
    },
    async deleteWhere(store, pred) {
        const all = await db.all(store);
        const ids = all.filter(pred).map(v => v.id);
        await tx(store, 'readwrite', s => {
            for (const id of ids)
                s.delete(id);
        });
        return ids.length;
    },
};
export function uid(prefix = 'id') {
    const rnd = crypto.getRandomValues(new Uint32Array(2));
    return `${prefix}-${Date.now().toString(36)}-${rnd[0].toString(36)}${rnd[1].toString(36)}`;
}
export function nowIso() {
    return new Date().toISOString();
}
export function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
