// The view strip under the layer bar, on every page (plans/VIEW_UI_PLAN.md): Globe | Map and what applies to it — the
// map's projection and centre, the globe's turning, the grid, and on Evolution the terrain's colours, hillshade and
// rivers. Each control keeps its id and its page's own wiring; this module gives Globe | Map its two buttons (they drive
// the page's #viewMode select, which the page listens to), shows the controls marked data-view="map" or "globe" only in
// that view, and on a phone moves the strip to the top of the bottom sheet (an always-on second row would cover the
// planet there) — back under the layer bar when the window widens.

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
