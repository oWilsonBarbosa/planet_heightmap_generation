// Before the app's modules load (a classic script, so it runs in any browser): a browser that cannot run World Orogen
// gets a plain message instead of a blank page or a spinner that never stops — no import maps (older than Chrome/Edge
// 105, Firefox 114, Safari/iOS 16.4) or no WebGL for the globe. The pages' module scripts call orogenCantRun() from
// their onerror too, for when the app's code cannot be loaded at all (offline, or the CDN down).
(function () {
    function show(reason) {
        if (document.getElementById('cantRun')) return;
        var box = document.createElement('div');
        box.id = 'cantRun';
        box.setAttribute('role', 'alert');
        box.innerHTML = '<div class="cant-run-card"><h2>World Orogen can’t run here</h2><p></p></div>';
        box.querySelector('p').textContent = reason;
        document.body.appendChild(box);
    }
    window.orogenCantRun = function (reason) {
        reason = reason || 'Part of the app could not be loaded. Check your connection, then reload the page.';
        if (document.body) show(reason);
        else document.addEventListener('DOMContentLoaded', function () { show(reason); });
    };

    var importMaps = typeof HTMLScriptElement !== 'undefined' && typeof HTMLScriptElement.supports === 'function' &&
        HTMLScriptElement.supports('importmap');
    var gl = null;
    try { var canvas = document.createElement('canvas'); gl = canvas.getContext('webgl2') || canvas.getContext('webgl'); } catch (e) { gl = null; }
    if (!importMaps) window.orogenCantRun('This browser is too old to run it. Please update it: Chrome or Edge 105 or later, Firefox 114 or later, or Safari 16.4 or later (iOS 16.4 on iPhone and iPad).');
    else if (!gl) window.orogenCantRun('The 3D globe needs WebGL, which this browser or device has turned off or does not support. Try another browser, or turn on hardware acceleration in its settings.');
})();
