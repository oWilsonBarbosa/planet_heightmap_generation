// A ZIP file written in the browser, without a library: the files stored as they are (PNGs are compressed already), names
// in UTF-8, one central directory. For Evolution's Export All (the developer's decision, 2026-10-01: one ZIP, a small
// built-in writer). Under 4 GB in all (no ZIP64).

import { crc32 } from './png.js';

/** The time now as DOS time and date (what ZIP records). */
function dosTime(d = new Date()) {
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

/**
 * One ZIP of the given files. `files`: [{ name, blob }]; `onFile(i)` as each is read.
 * @returns {Promise<Blob>}
 */
export async function zipFiles(files, onFile = () => {}) {
    const enc = new TextEncoder(), { time, date } = dosTime(), parts = [], central = [];
    let offset = 0;
    for (let i = 0; i < files.length; i++) {
        const { name, blob } = files[i], nm = enc.encode(name), data = new Uint8Array(await blob.arrayBuffer()), crc = crc32(data);
        onFile(i);
        const head = new Uint8Array(30 + nm.length), h = new DataView(head.buffer);
        h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
        h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
        h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
        head.set(nm, 30);
        const dir = new Uint8Array(46 + nm.length), c = new DataView(dir.buffer);
        c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
        c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
        c.setUint16(28, nm.length, true); c.setUint32(42, offset, true);
        dir.set(nm, 46);
        parts.push(head, blob); central.push(dir);
        offset += head.length + data.length;
        if (offset > 0xFFFFFFFF) throw new Error('the files are too big for one ZIP (over 4 GB): export them one at a time');
    }
    const dirSize = central.reduce((a, d) => a + d.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, dirSize, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
