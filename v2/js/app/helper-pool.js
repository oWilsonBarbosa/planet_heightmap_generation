// Helpers for the history's worker: a few workers (app/helper-worker.js) that take the pieces of a job that do not depend
// on one another — the junctions of a rift's search, the layout attempts of the start world — side by side, and give back
// each piece's answer in order. The history then picks among them as it always did: the same history, sooner (developer,
// 2026-10-18: "lets do the rift and start world on multiple cores"). A rift's search (12 junctions; 48 for an overdue
// piece) was ~67 ms on the desktop, a burst in the collision-heavy stretches; the start world's search 0.2–2.3 s before the
// first frame, an attempt at a time. In Node (the checks) they are worker threads.

const IS_NODE = typeof window === 'undefined' && typeof self === 'undefined' && typeof process !== 'undefined' && !!process.versions?.node;

async function spawn() {
    const url = new URL('./helper-worker.js', import.meta.url);
    if (IS_NODE) {
        const { Worker } = await import('node:worker_threads');
        const w = new Worker(url);
        w.unref();                                        // (idle helpers never keep a Node process alive)
        return { post: (m, t) => w.postMessage(m, t), listen: fn => w.on('message', fn), onCrash: fn => w.on('error', e => fn(e.message)), terminate: () => w.terminate(), hold: on => (on ? w.ref() : w.unref()) };
    }
    const w = new Worker(url, { type: 'module' });
    return { post: (m, t) => w.postMessage(m, t), listen: fn => w.addEventListener('message', e => fn(e.data)),
        onCrash: fn => w.addEventListener('error', e => { e.preventDefault?.(); fn(e.message || 'a helper stopped'); }), terminate: () => w.terminate(), hold: () => {} };
}

/** How many helpers: the cores but one, at most 4 (a rift has 12 junctions; the start world's attempts come a few at a time). */
export async function helperCount() {
    const cores = IS_NODE ? (await import('node:os')).availableParallelism() : (globalThis.navigator?.hardwareConcurrency || 4);
    return Math.max(1, Math.min(4, cores - 1));
}

export class HelperPool {
    /** @param {{numCells, xyz, adjOffset, adjList}} simMesh  the mesh the history runs on (sent to every helper once) */
    static async create(simMesh, size = null) {
        const n = size ?? await helperCount(), workers = await Promise.all(Array.from({ length: n }, spawn));
        const mesh = { numCells: simMesh.numCells, xyz: simMesh.xyz, adjOffset: simMesh.adjOffset, adjList: simMesh.adjList };
        for (const w of workers) w.post({ type: 'mesh', mesh });
        return new HelperPool(workers);
    }

    constructor(workers) {
        this.workers = workers;
        this.pending = new Map();            // job id → { resolve, reject }
        this.nextJob = 1;
        this.dead = null;
        for (const w of workers) {
            w.listen(msg => { const p = this.pending.get(msg.jobId); if (!p) return; this.pending.delete(msg.jobId); if (msg.error) p.reject(new Error(`helper: ${msg.error}`)); else p.resolve(msg); });
            w.onCrash(m => { this.dead = new Error(`a helper stopped (${m || 'out of memory?'})`); for (const p of this.pending.values()) p.reject(this.dead); this.pending.clear(); });
        }
    }

    get size() { return this.workers.length; }

    ask(i, msg) {
        if (this.dead) return Promise.reject(this.dead);
        const jobId = this.nextJob++, w = this.workers[i % this.workers.length];
        w.hold(true);
        return new Promise((resolve, reject) => { this.pending.set(jobId, { resolve, reject }); w.post({ ...msg, jobId }); }).finally(() => w.hold(false));
    }

    /**
     * A rift's request (step/rifting.js tryRift): its junctions split into a run per helper, each searched there with the
     * crust as it stands and the rift's rules of the moment. @returns {Promise<Array>} each junction's rift or null, in order
     */
    async searchJunctions(world, { plate, junctions, pull, needCratonsBothSides, ctx, config }) {
        const { mask, type, flags, terrane, count } = plate.crust;
        // (the rules a rift's search reads — config.rift…, as they stand now: a forced rift may have loosened them)
        const rules = Object.fromEntries(Object.entries(config).filter(([k]) => k.startsWith('rift')));
        const common = { type: 'rift', seed: world.seed, config: rules, crust: { mask, type, flags, terrane, count }, ctx: { cells: ctx.cells, exterior: ctx.exterior, fromCoast: ctx.fromCoast }, pull, needCratonsBothSides };
        const k = Math.min(this.size, junctions.length), per = Math.ceil(junctions.length / k), runs = [];
        for (let i = 0; i < k; i++) runs.push(this.ask(i, { ...common, junctions: junctions.slice(i * per, (i + 1) * per) }));
        return (await Promise.all(runs)).flatMap(r => r.results);
    }

    /** The start world's layout attempts, one per helper. @returns {Promise<Array>} each attempt's {tried, fit}, in order */
    async layoutAttempts(seed, cfg, attempts) {
        return Promise.all(attempts.map((attempt, i) => this.ask(i, { type: 'layout', seed, cfg, attempt })));
    }

    terminate() { for (const w of this.workers) w.terminate(); this.workers = []; }
}
