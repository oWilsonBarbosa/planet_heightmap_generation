// The device the page runs on, for memory budgets: a phone or tablet (a coarse pointer) or one that reports 4 GB or less.
// A phone's browser closes a tab at well under 2 GB, every worker of the page counted. False in Node; in a worker (no
// matchMedia) only the reported memory counts.

export const SMALL_DEVICE = typeof navigator !== 'undefined' && ((navigator.deviceMemory ?? 8) <= 4 || !!globalThis.matchMedia?.('(pointer: coarse)').matches);
