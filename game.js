'use strict';
/**
 * Cave Rush — game.js bootstrap for the main branch.
 *
 * The full ~100KB game lives on the `master` branch (and GitHub Pages).
 * This loader pulls a pinned commit via jsDelivr so `main` stays playable
 * until the blob is copied verbatim into this path.
 *
 * Pin: 294669cd9a71b7178c345aefdcaf89209fbfbb3e (master HEAD at PR time)
 */
(function () {
  var PIN = '294669cd9a71b7178c345aefdcaf89209fbfbb3e';
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/gh/010GCC/Cave-rush@' + PIN + '/game.js';
  s.async = false;
  s.onerror = function () {
    document.body.innerHTML =
      '<pre style="color:#0ff;padding:24px;font:14px monospace;background:#050a10">' +
      'Failed to load Cave Rush game.js from CDN.\n' +
      'Copy game.js from the master branch into this repo for offline/local play.' +
      '</pre>';
  };
  document.head.appendChild(s);
})();
