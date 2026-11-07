import { toLatinDigits } from '../arabic.js';
export const state = { drafts: [], draftSource: 'text', quiz: null };
let sourcesCache = null;
export function loadSources() {
    if (!sourcesCache) {
        sourcesCache = fetch('data/sources.json')
            .then(r => (r.ok ? r.json() : null))
            .catch(() => null);
    }
    return sourcesCache;
}
/** "10-15، 18" → [10..15, 18] */
export function parsePagesInput(s) {
    const out = new Set();
    for (const part of toLatinDigits(s).split(/[,،\s]+/u)) {
        if (!part)
            continue;
        const m = /^(\d{1,4})\s*[-–]\s*(\d{1,4})$/.exec(part);
        if (m) {
            const a = +m[1], b = +m[2];
            const [lo, hi] = a <= b ? [a, b] : [b, a];
            if (hi - lo <= 200)
                for (let p = lo; p <= hi; p++)
                    out.add(p);
        }
        else if (/^\d{1,4}$/.test(part))
            out.add(+part);
    }
    return [...out].sort((a, b) => a - b);
}
export function pagesToInput(pages) {
    const s = [...pages].sort((a, b) => a - b);
    const parts = [];
    for (let i = 0; i < s.length;) {
        let j = i;
        while (j + 1 < s.length && s[j + 1] === s[j] + 1)
            j++;
        parts.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`);
        i = j + 1;
    }
    return parts.join('، ');
}
