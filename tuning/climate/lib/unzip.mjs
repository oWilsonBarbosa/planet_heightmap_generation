/**
 * Extract single entries from a .zip file with no dependencies (central directory + stored/deflate entries).
 * Enough for the reference archives; not a general-purpose unzip (no zip64, no encryption).
 */

import fs from 'node:fs';
import zlib from 'node:zlib';

function findCentralDirectory(buf) {
    // End-of-central-directory record: signature 0x06054b50, within the last 64 KB + 22 bytes.
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
            return { count: buf.readUInt16LE(i + 10), offset: buf.readUInt32LE(i + 16) };
        }
    }
    throw new Error('zip: end-of-central-directory not found (truncated download?)');
}

/** List entry names. */
export function listZip(zipPath) {
    const buf = fs.readFileSync(zipPath);
    const { count, offset } = findCentralDirectory(buf);
    const names = [];
    let p = offset;
    for (let e = 0; e < count; e++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: bad central directory entry');
        const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
        names.push(buf.toString('utf8', p + 46, p + 46 + nameLen));
        p += 46 + nameLen + extraLen + commentLen;
    }
    return names;
}

/** Extract one entry (by exact name) to destPath. */
export function extractZipEntry(zipPath, entryName, destPath) {
    const buf = fs.readFileSync(zipPath);
    const { count, offset } = findCentralDirectory(buf);
    let p = offset;
    for (let e = 0; e < count; e++) {
        const method = buf.readUInt16LE(p + 10);
        const compSize = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
        const localOffset = buf.readUInt32LE(p + 42);
        const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
        if (name === entryName) {
            const lNameLen = buf.readUInt16LE(localOffset + 26), lExtraLen = buf.readUInt16LE(localOffset + 28);
            const start = localOffset + 30 + lNameLen + lExtraLen;
            const data = buf.subarray(start, start + compSize);
            const out = method === 0 ? data : method === 8 ? zlib.inflateRawSync(data) : null;
            if (!out) throw new Error(`zip: unsupported compression method ${method} for ${entryName}`);
            fs.writeFileSync(destPath, out);
            return;
        }
        p += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error(`zip: ${entryName} not found in ${zipPath}`);
}
