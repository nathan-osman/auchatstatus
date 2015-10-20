// ==UserScript==
// @name          Ask Ubuntu Chat Status
// @author        Nathan Osman
// @version       1.2
// @namespace     https://quickmediasolutions.com
// @description   A UserScript for displaying the status of other users in chat.
// @include       *://chat.stackexchange.com/rooms/*
// ==/UserScript==

/**
 * This script is a stub - its sole purpose is to inject the actual chat status
 * script into the DOM. This approach makes updates much simpler and eliminates
 * users with really old versions of the script.
 */

(function() {
    var code = document.createElement('script');
    code.type = 'text/javascript';
    code.src = 'https://sechat.quickmediasolutions.com/static/chatstatus.js';
    document.body.appendChild(code);
})();
