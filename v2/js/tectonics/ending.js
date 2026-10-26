// Choose your ending (after Phase 13): a history asked to end in a stage of the supercontinent cycle — as a supercontinent,
// as one breaking up, or with its continents dispersed. It runs as long as it would anyway (its scene's length), then runs
// on until the world is in that stage, and stops there (at most endingExtraMyr further on). Nothing is steered: the
// history is the same one — it only ends at a moment of the kind asked for. So an ending can also be cut out of a longer
// run of the same history after the fact (the lab does, when you change the ending of a history it has already run on).
//
// A stage is read from what the world and every frame carry: the cycle's state (step/supercontinent.js — the largest
// landmass's share of the continental crust, 'assembled' or 'dispersed', since when) and the event log.

import { EventKind } from './model/world.js';

/** The endings, by id, in the order a menu lists them (`phrase`: how a sentence names the stage). */
export const ENDINGS = [
    { id: 'none', label: 'Wherever the history has got to', phrase: 'wherever it has got to' },
    { id: 'supercontinent', label: 'A supercontinent (a Pangaea)', phrase: 'a supercontinent' },
    { id: 'breakup', label: 'A supercontinent breaking up (young rift seas)', phrase: 'a supercontinent breaking up' },
    { id: 'dispersed', label: 'Continents dispersed (as on Earth today)', phrase: 'dispersed continents' },
];

/**
 * Is the world — or a frame — in this stage? `state`: anything with {time, cycle, events} (a TectonicWorld or a Frame).
 * - supercontinent: the largest landmass holds superShare of the continental crust (a supercontinent the cycle has
 *   counted), and nothing has rifted for endingQuietMyr — whole, not yet coming apart;
 * - breakup: the first rift since the latest supercontinent formed is endingBreakupMyr[0]–[1] old: young rift seas
 *   opening through it, its pieces still close (Pangaea in the Jurassic);
 * - dispersed: the cycle counts the supercontinent broken up, and the largest landmass holds no more than
 *   endingDispersedShare (Earth today: the largest, Afro-Eurasia, about 45 % of the continental crust).
 */
export function inStage(state, stage, config) {
    if (stage === 'none') return true;
    const c = state.cycle, { time, events } = state;
    if (!c) return false;
    const lastOf = kind => { for (let i = events.length - 1; i >= 0; i--) if (events[i].kind === kind && events[i].time <= time + 1e-9) return events[i]; return null; };
    if (stage === 'supercontinent') {
        const rift = lastOf(EventKind.RIFT);
        return c.state === 'assembled' && c.share >= config.superShare && (!rift || time - rift.time >= config.endingQuietMyr);
    }
    if (stage === 'breakup') {
        const formed = lastOf(EventKind.SUPERCONTINENT);
        if (!formed) return false;
        // (the cycle counts a supercontinent once it has held cycleHoldMyr: rifts from when it had gathered count)
        const from = formed.time - config.cycleHoldMyr, first = events.find(e => e.kind === EventKind.RIFT && e.time >= from - 1e-9 && e.time <= time + 1e-9);
        if (!first) return false;
        const age = time - first.time;
        return age >= config.endingBreakupMyr[0] - 1e-9 && age <= config.endingBreakupMyr[1] + 1e-9;
    }
    if (stage === 'dispersed') return c.state === 'dispersed' && c.share <= config.endingDispersedShare;
    throw new Error(`unknown ending: ${stage}`);
}

/**
 * How to run a history of at least `minMyr` that ends in `stage`: simulate(world, { untilMyr, stopAt, … }).
 * With no ending (or 'none') it simply runs minMyr.
 */
export function historyEnding(minMyr, stage, config) {
    if (!stage || stage === 'none') return { untilMyr: minMyr, stopAt: null };
    return { untilMyr: minMyr + config.endingExtraMyr, stopAt: world => world.time >= minMyr - 1e-9 && inStage(world, stage, config) };
}

/**
 * The frames of a history cut to end in `stage`: up to the first frame at or after minMyr in that stage, or null if
 * none is (the history must be run on further to find one). `complete`: the frames reach as far as a history may run
 * (minMyr + endingExtraMyr) — then, with no frame in the stage, all of them (the stage was not reached in time).
 */
export function framesEnding(frames, minMyr, stage, config, complete = false) {
    if (!stage || stage === 'none') {
        const last = frames.findIndex(f => f.time > minMyr + 1e-9);
        return last < 0 ? (frames.at(-1).time >= minMyr - 1e-9 ? frames : null) : frames.slice(0, last);
    }
    const i = frames.findIndex(f => f.time >= minMyr - 1e-9 && inStage(f, stage, config));
    return i >= 0 ? frames.slice(0, i + 1) : complete ? frames : null;
}
