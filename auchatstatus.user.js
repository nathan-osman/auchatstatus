// ==UserScript==
// @name          Ask Ubuntu Chat Status
// @author        Nathan Osman
// @version       1.0
// @namespace     https://quickmediasolutions.com
// @description   A UserScript for displaying the status of other users in chat.
// @include       http://chat.stackexchange.com/rooms/201/*
// ==/UserScript==

function withjQuery(fn) {
    var code = document.createElement('script');
    code.type = 'text/javascript';
    code.textContent = '(' + fn.toString() + ')(jQuery);';
    document.body.appendChild(code);
}

withjQuery(function($) {

    // Display a notification in the upper portion of the chat window
    function notify(msg) {
        window.Notifier().notify(msg);
    }

    // Check for updates to the chat script once every 24 hours.
    function updateCheck() {
        $.ajax({
            complete: function() {
                window.setTimeout(updateCheck, 24 * 60 * 60 * 1000);
            },
            dataType: 'json',
            error: function() {
                notify('Unable to communicate with the chat status API.');
            },
            success: function(data) {
                if('version' in data) {
                    if(data.version != '1.0') {
                        notify('New version of the chat status script available.<br>' +
                            'Please upgrade as soon as possible.');
                    }
                } else {
                    notify('Received corrupt version number from the chat status API.');
                }
            },
            url: 'https://127.0.0.1:8000/api/version'
        });
    }

    // Send the current status to the socket
    function updateStatus() {
        socket.send(JSON.stringify({
            id: CHAT.CURRENT_USER_ID,
            last_message_seen: 1,
            last_char_entered: 1
        }));
    }

    // Begin scheduling update checks
    updateCheck();

    // Establish a websocket connection
    var socket = new WebSocket('wss://127.0.0.1:8000/api/connect');

    socket.onmessage = function(e) {
        console.log(e.data)
    };

    socket.onerror = function(e) {
        console.log(e);
    };
});
