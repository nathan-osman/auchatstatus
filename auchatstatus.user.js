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

    // Retrieve the current UTC time as a Unix timestamp.
    function now() {
        return parseInt(new Date().getTime() / 1000);
    }

    // Given an email hash from chat, determine the user's avatar.
    function avatar(u) {
        if(u.email_hash[0] == '!') {
            return u.email_hash.slice(1);
        } else {
            return 'http://www.gravatar.com/avatar/' + u.email_hash +
                '?s=16&d=identicon&r=PG';
        }
    }

    // Display a drop-down notification in the top of the chat window.
    function notify(msg) {
        window.Notifier().notify(msg);
    }

    // Check for updates to the chat script once every hour.
    function updateCheck() {
        $.ajax({
            complete: function() {
                window.setTimeout(updateCheck, 60 * 60 * 1000);
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
            url: 'https://auchat.quickmediasolutions.com/api/version'
        });
    }
    updateCheck();

    // Add the element that will display typing status.
    $('#chat').css('paddingBottom', '0');
    var typingStatus = $('<div>')
            .css({
                color: 'rgba(0, 0, 0, 0.5)',
                height: '20px',
                paddingBottom: '100px',
                paddingLeft: '70px',
                paddingTop: '10px'
            })
            .insertAfter('#chat'),
        typingIndicator = $('<div>')
            .hide()
            .text('is typing...')
            .appendTo(typingStatus);

    // Add a user to the list displayed - their info may need to be fetched
    var userTypingTimeouts = {};
    function userTyping(id) {
        var elemId = 'acs-typing-' + id,
            elem = $('#' + elemId);
        if(!elem.length) {
            CHAT.RoomUsers.get(id).then(function(u) {
                elem = $('<img>')
                    .addClass('acs-typing-avatar')
                    .attr({
                        id: elemId,
                        src: avatar(u)
                    }).css({
                        float: 'left',
                        paddingRight: '4px'
                    });
            });
        }
        elem.detach().prependTo(typingStatus).show();
        typingIndicator.show();
        if(id in userTypingTimeouts) {
            window.clearTimeout(userTypingTimeouts[id]);
        }
        window.setTimeout(function() {
            elem.remove();
            if(!$('.acs-typing-avatar').length) {
                typingIndicator.hide();
            }
        }, 8000);
    }

    // Establish a websocket connection.
    var socket = new WebSocket('wss://auchat.quickmediasolutions.com/api/connect');

    socket.onopen = function() {
        // Monitor the input field for key presses. If this is the first keypress
        // during the last second, immediately notify everyone. This prevents a
        // message being sent for every keypress.
        var lastCharEntered = 0;
        $('#input').keypress(function() {
            var n = now();
            if(lastCharEntered < (n - 1)) {
                socket.send(JSON.stringify({
                    id: CHAT.CURRENT_USER_ID,
                    last_char_entered: n
                }));
                lastCharEntered = n;
            }
        });
    }

    // Process new messages received on the socket - note that all packets are
    // assumed valid - invalid ones will generate an error but won't prevent
    // more from being processed in the future
    socket.onmessage = function(e) {
        var s = JSON.parse(e.data);
        if('last_char_entered' in s && s.last_char_entered > (now() - 5)) {
            userTyping(s.id);
        }
    };

    socket.onerror = function(e) {
        console.log(e);
    };

    socket.onclose = function() {
        console.log("Socket closing...");
    }
});
