// The view strip above the layer tabs, on every page (plans/VIEW_UI_PLAN.md): Globe | Map and what applies to it — the
// map's projection and centre, the globe's turning, the grid, and on Evolution the terrain's colours, hillshade and
// rivers. Each control keeps its id and its page's own wiring; this module gives Globe | Map its two buttons (they drive
// the page's #viewMode select, which the page listens to), shows the controls marked data-view="map" or "globe" only in
// that view, folds the strip behind the arrow at the tabs' left (opened, the tabs move down to make room; the browser
// remembers which), and on a phone moves the strip to the top of the bottom sheet, never folded (an always-on row would
// cover the planet there) — back above the tabs when the window widens.

const OPEN_KEY = 'orogen.view-strip-open';

export function initViewStrip() {
    const strip = document.getElementById('viewStrip'), mode = document.getElementById('viewMode');
    if (!strip || !mode) return;
    const buttons = strip.querySelectorAll('.vs-seg [data-mode]');
    const sync = () => {
        for (const b of buttons) { const on = b.dataset.mode === mode.value; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); }
        for (const el of strip.querySelectorAll('[data-view]')) el.hidden = el.dataset.view !== mode.value;
    };
    for (const b of buttons) b.addEventListener('click', () => {
        if (mode.value === b.dataset.mode) return;
        mode.value = b.dataset.mode;
        mode.dispatchEvent(new Event('change', { bubbles: true }));
    });
    mode.addEventListener('change', sync);
    sync();
    // (folded until opened)
    const fold = document.getElementById('viewFold');
    if (fold) {
        const tip = fold.title;
        const setOpen = (open) => {
            strip.classList.toggle('folded', !open);
            fold.setAttribute('aria-expanded', String(open));
            fold.title = open ? 'Hide the view options' : tip;
        };
        let open = false;
        try { open = localStorage.getItem(OPEN_KEY) === '1'; } catch { /* (folded where the browser forbids remembering) */ }
        setOpen(open);
        fold.addEventListener('click', () => {
            open = !open;
            setOpen(open);
            try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* (remembered only where the browser allows) */ }
        });
    }
    // (a phone: at the top of the bottom sheet; wider: back where the page put it)
    const slot = document.getElementById('viewStripSlot'), home = strip.parentElement, after = strip.nextElementSibling;
    if (!slot) return;
    const narrow = matchMedia('(max-width: 768px)');
    const place = () => {
        if (narrow.matches) { slot.appendChild(strip); strip.classList.add('in-sheet'); }
        else { home.insertBefore(strip, after && after.parentElement === home ? after : null); strip.classList.remove('in-sheet'); }
    };
    narrow.addEventListener('change', place);
    place();
}
