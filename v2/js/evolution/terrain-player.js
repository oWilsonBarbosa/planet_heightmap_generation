// The Evolution page's terrain: a history's frames turned into shaded, river-carved heights on a terrain mesh, as the
// frames arrive (the planet is shown as it builds) and as the timeline is scrubbed and played.
//
// The frame asked for is built on the worker pool (terrain/terrain-pool.js: the surface on the synthesis workers, its
// rivers on the carving worker, its hillshade on the shading worker), then the frames near it that have arrived, the way
// the timeline is moving (AHEAD of it; half as many behind), within a memory budget of heights kept as 16-bit metres. Rivers are carved on every frame shown, playing included (developer: "lets show rivers
// while playing"). The same machinery as the lab's terrain phases (app/phases/phase8a-terrain.js), for frames that
// stream in. Without workers (Node) a frame is built in place.

import { TerrainPool } from '../terrain/terrain-pool.js';
import { synthesizeTerrain, hypsometry } from '../terrain/synthesize.js';
import { sampleOnto } from '../terrain/terrain-mesh.js';
import { hillshade } from '../view/terrain-shade.js';
import { SMALL_DEVICE } from '../core/device.js';

const usePool = typeof window !== 'undefined' && typeof Worker !== 'undefined';
const BUDGET = SMALL_DEVICE ? 64e6 : 320e6;
const AHEAD = 10;

// One worker pool for the page, for one sim mesh and size (a new sim resolution replaces it). `workers`: how many
// synthesis workers (null: one per core but one, up to 8 — on a phone, fewer: each holds its own copy of the meshes)
let poolPromise = null, poolKey = null;
function poolFor(simMesh, workers) {
    if (poolKey?.mesh !== simMesh || poolKey?.workers !== workers) {
        const old = poolPromise, key = poolKey = { mesh: simMesh, workers };
        poolPromise = TerrainPool.create(simMesh, workers, { carvers: SMALL_DEVICE ? 1 : null });
        // a worker that dies (out of memory) breaks the pool: its jobs fail at once, and the next frame asked for gets a new one
        poolPromise.then(p => { p.onBroken = () => { if (poolKey === key) poolKey = null; p.terminate(); }; });
        old?.then(p => p.terminate());
    }
    return poolPromise;
}
/** Let the page's pool go (its workers and their copies of the meshes); the next asked for is a new one. */
function releasePool() {
    const p = poolPromise;
    poolPromise = null; poolKey = null;
    p?.then(pool => pool.terminate());
}

export class TerrainPlayer {
    /**
     * @param {{simMesh, tMesh, cfg, seed: number, shading: {exaggeration, seaLevelKm}, workers?: number|null, onBuilt?: () => void}} o
     *        onBuilt: a frame's build (or its carving) has finished — repaint if it is on screen
     */
    constructor({ simMesh, tMesh, cfg, seed, shading, workers = null, onBuilt = () => {} }) {
        Object.assign(this, { simMesh, tMesh, cfg, seed, shading, onBuilt });
        this.frames = [];
        this.index = new Map();
        this.disposed = false;
        this.current = -1;             // the frame on screen, and which way the shown frames have been moving
        this.heading = 0;
        this.sampler = null;
        this.full = new Map();         // frame → its full build (the last few)
        this.heights = new Map();      // frame → its carved heights, 16-bit metres (within the budget)
        this.bytes = 0;
        this.carving = new Map();      // frame → its carving under way
        this.shown = new Map();        // frame → what is painted: heights + hillshade (the last few)
        this.prefetching = false;
        this.workers = workers;
        this.resting = null;           // let go of the pool for a while (rest): { wake: a promise, resolve }
        this.rests = 0;
        if (usePool) poolFor(simMesh, workers);
    }

    /** The worker pool (a promise) — a new one if the last broke or was let go; none while resting. */
    get pool() { return usePool && !this.resting ? poolFor(this.simMesh, this.workers) : null; }

    /** A frame arrived from the history. */
    addFrame(frame) { this.index.set(frame, this.frames.length); this.frames.push(frame); }

    /** Build the frames near the one shown (the history has finished arriving, or the terrain is new). */
    finish() { this.pool?.then(p => this.prefetch(p)); }

    dispose() { this.disposed = true; }

    /**
     * Let go of the worker pool for a while — a small device's memory, while a moment gets its detail (its own workers):
     * frames asked for meanwhile are built after wake(). Frames already built stay; a build under way is done again.
     */
    rest() {
        if (!usePool || this.resting) return;
        let resolve;
        const wake = new Promise(r => { resolve = r; });
        this.resting = { wake, resolve };
        this.rests++;
        releasePool();
    }
    wake() {
        const r = this.resting;
        if (!r) return;
        this.resting = null;
        r.resolve();
        this.finish();
    }

    /** Another hillshade (or sea level) for every frame shown from now on. */
    setShading(shading) { this.shading = shading; this.shown.clear(); }

    /** Ready to paint: built (and carved), and shaded for the current view. */
    isReady(frame) { return !usePool || (this.built(frame) && this.fresh(frame)); }

    /** The terrain of a frame ready to paint: {heightKm, shade, sampler, hyps}. */
    terrainOf(frame) {
        this.showing(frame);
        if (this.fresh(frame)) return this.shown.get(frame);
        const r = this.full.get(frame) ?? this.fromHeights(frame);
        if (r) return this.keep(frame, r);
        // (in place: no workers)
        this.sampler ??= sampleOnto(this.simMesh, this.tMesh, this.cfg, this.seed);
        const T = synthesizeTerrain(frame, this.simMesh, this.tMesh, { cfg: this.cfg, seed: this.seed, sampler: this.sampler, carve: true });
        this.remember(frame, T);
        return this.keep(frame, T);
    }

    /** Build a frame on the pool — its surface, its rivers, its hillshade — then the frames near it. */
    async prepare(frame) {
        this.showing(frame);
        if (!usePool) return;
        for (;;) {
            if (this.resting) await this.resting.wake;
            const pool = await this.pool, rests = this.rests;
            if (this.disposed) return;
            try { return await this.build(pool, frame); } catch (err) { if (!(pool.closed && this.rests !== rests)) throw err; }   // (let go mid-build: rest)
        }
    }
    async build(pool, frame) {
        if (!this.built(frame)) {
            const surf = await pool.synthesize(frame, this.tMesh, { cfg: this.cfg, seed: this.seed, parts: false, records: false, carveInputs: true });
            if (this.disposed) return;
            this.sampler ??= surf.sampler;
            await this.carve(pool, frame, surf);
            if (this.disposed) return;
        }
        const r = this.fresh(frame) ? null : this.full.get(frame) ?? this.fromHeights(frame);
        if (r) this.keep(frame, r, await pool.shade(this.tMesh, r.heightKm, this.shading));
        this.prefetch(pool);
    }

    // ── internals ──

    showing(frame) {
        const i = this.index.get(frame);
        if (i === undefined || i === this.current) return;
        this.heading = Math.sign(i - this.current); this.current = i;
    }
    /** How far a frame is from the one on screen: frames the way the shown frames are moving count twice as near. */
    distance(i) { return Math.abs(i - this.current) * (this.heading && Math.sign(i - this.current) === -this.heading ? 2 : 1); }
    built(frame) { return this.heights.has(frame) || this.full.has(frame); }
    fresh(frame) { const s = this.shown.get(frame), full = this.full.get(frame); return !!s && (!full || s.src === full); }

    keep(frame, r, shade = hillshade(this.tMesh, r.heightKm, this.shading)) {
        let hyps = null;
        const seaLevelKm = this.shading.seaLevelKm;
        const out = { src: r, heightKm: r.heightKm, shade, sampler: r.sampler ?? this.sampler, get hyps() { return hyps ??= hypsometry(r.heightKm, seaLevelKm); } };
        this.shown.set(frame, out);
        if (this.shown.size > 4) this.shown.delete(this.shown.keys().next().value);
        return out;
    }
    remember(frame, r) {
        this.sampler ??= r.sampler;
        this.full.set(frame, r);
        if (this.full.size > 4) this.full.delete(this.full.keys().next().value);
        this.storeHeights(frame, r);
    }
    storeHeights(frame, r) {
        if (this.heights.has(frame)) return;
        const q = new Int16Array(r.heightKm.length);
        for (let i = 0; i < q.length; i++) q[i] = Math.round(r.heightKm[i] * 1000);
        this.heights.set(frame, q);
        this.bytes += q.byteLength;
        // over budget: drop the frames farthest from the one on screen
        while (this.bytes > BUDGET && this.heights.size > 1) {
            let far = null, d = -1;
            for (const g of this.heights.keys()) { const dd = this.distance(this.index.get(g) ?? 0); if (dd > d) { d = dd; far = g; } }
            this.bytes -= this.heights.get(far).byteLength; this.heights.delete(far);
        }
    }
    fromHeights(frame) {
        const q = this.heights.get(frame);
        if (!q) return null;
        const heightKm = new Float32Array(q.length);
        for (let i = 0; i < q.length; i++) heightKm[i] = q[i] / 1000;
        return { heightKm, sampler: this.sampler };
    }
    /** Carve a frame's rivers on the carving worker (once), and tell the page when done. */
    carve(pool, frame, surf) {
        if (this.carving.has(frame)) return this.carving.get(frame);
        const job = pool.carve(this.tMesh, surf, this.cfg).then(C => {
            if (this.disposed) return;
            this.remember(frame, { ...surf, heightKm: C.z, tectonicKm: surf.heightKm, drainage: C.area });
            this.shown.delete(frame);
            this.onBuilt();
        }).finally(() => this.carving.delete(frame));
        this.carving.set(frame, job);
        return job;
    }
    /** Build ahead, one frame at a time: the nearest to the one on screen not built yet, within AHEAD and the budget. */
    async prefetch(pool) {
        if (this.prefetching || this.disposed) return;
        this.prefetching = true;
        const carving = [];                // (carvings under way, as many as the pool has carving workers)
        try {
            for (;;) {
                if (this.disposed || this.resting) return;
                const room = Math.max(4, Math.floor(BUDGET / (2 * this.tMesh.numCells)));
                const next = this.frames.map((_, i) => i).filter(i => this.distance(i) <= AHEAD).sort((a, b) => this.distance(a) - this.distance(b) || a - b)
                    .slice(0, room).find(i => !this.built(this.frames[i]) && !this.carving.has(this.frames[i]));
                if (next === undefined) break;
                const frame = this.frames[next];
                const surf = await pool.synthesize(frame, this.tMesh, { cfg: this.cfg, seed: this.seed, parts: false, records: false, carveInputs: true });
                if (this.disposed) return;
                this.sampler ??= surf.sampler;
                // (carved on a carving worker while the next frame's surface is built)
                while (carving.length >= pool.carverCount) await carving.shift();
                carving.push(this.carve(pool, frame, surf).catch(() => {}));
            }
            await Promise.all(carving);
        } catch { /* building ahead is only a convenience: frames are built when asked for */ } finally { this.prefetching = false; }
    }
}
