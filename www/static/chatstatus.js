/**
 * This script is a stub - its sole purpose is to tell everyone to upgrade
 * their script since the URL has changed.
 */
function inject(fn) {
    var code = document.createElement('script');
    code.type = 'text/javascript';
    code.textContent = '(' + fn.toString() + ')();';
    document.body.appendChild(code);
}

inject(function() {
    window.Notifier().notify(
        "The Stack Exchange chat script URL has changed.<br>" +
        "Please click <a href='https://sechat.quickmediasolutions.com'>here</a> to upgrade."
    );
});
