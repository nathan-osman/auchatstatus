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

    // Constants.
    var SERVER = 'auchat.quickmediasolutions.com';

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
                    if(data.version != '1.1') {
                        var msg = "<p><a href='https://github.com/nathan-osman/auchatstatus/raw/master/auchatstatus.user.js'>" +
                                "New version</a> of the chat status script available.<br>Please update as soon as possible.</p>";
                        if('changes' in data) {
                            msg += '<ul>';
                            $.each(data.changes, function(i, v) {
                                // v is HTML-escaped on the server
                                msg += '<li>' + v + '</li>';
                            });
                            msg += '</ul>';
                        }
                        notify(msg);
                    }
                } else {
                    notify('Received corrupt version number from the chat status API.');
                }
            },
            url: 'https://' + SERVER + '/api/version'
        });
    }
    updateCheck();

    // Add the element that will display typing status.
    $('#chat').css('paddingBottom', '0');
    var typingStatus = $('<div>')
            .css({
                color: 'rgba(0, 0, 0, 0.5)',
                height: '20px',
                paddingBottom: '90px',
                paddingLeft: '70px',
                paddingTop: '10px'
            })
            .insertAfter('#chat'),
        typingIndicator = $('<div>')
            .hide()
            .text('is typing...')
            .appendTo(typingStatus);

    // Establish a websocket connection.
    function connect() {
        var socket = new WebSocket('wss://' + SERVER + '/api/connect');

        // JavaScript doesn't let us send ping/pong control messages, so
        // instead, just send an empty message and the server will reply with
        // an empty message.
        var pingTimeout;
        function ping() {
            socket.send('');
            pingTimeout = window.setTimeout(ping, 30000);
        }

        // The status API will send a message when a user types a character. To
        // avoid a bunch of unnecessary messages, this message is only sent a
        // maximum of once per two seconds. Therefore the "xyz is typing..."
        // indicator must assume the user is typing for up to four seconds
        // after having received the last such update.
        var usersTyping = {};

        // A user has stopped typing (the timeout expired). The indicator
        // should be hidden if no more users are typing - and there's a small
        // hack to figure that out.
        function userTypingStopped(id) {
            usersTyping[id].remove();
            delete usersTyping[id];
            var anyUsersTyping = false;
            $.each(usersTyping, function() {
                anyUsersTyping = true;
                return false;
            });
            if(!anyUsersTyping) {
                typingIndicator.hide();
            }
        }

        // A user has started typing. Create the element for the indicator if
        // one does not already exist. If one does, reset the timeout.
        function userTypingStarted(id) {
            var elem;
            if(id in usersTyping) {
                elem = usersTyping[id];
                window.clearTimeout(elem.data('timeout'));
            } else {
                elem = $('<img>')
                    .addClass('acs-typing-avatar')
                    .css({
                        float: 'left',
                        height: '16px',
                        paddingRight: '4px',
                        width: '16px'
                    });
                usersTyping[id] = elem;
                CHAT.RoomUsers.get(id).then(function(u) {
                    elem.attr('src', avatar(u));
                });
            }
            elem.detach().prependTo(typingStatus).show();
            typingIndicator.show();
            elem.data('timeout', window.setTimeout(userTypingStopped, 4000, id));
        }

        // The user typed a message.
        var lastCharEntered = 0;
        function userTyped() {
            var n = now();
            if(lastCharEntered < (n - 2)) {
                socket.send(JSON.stringify({
                    id: CHAT.CURRENT_USER_ID,
                    data: {
                        last_char_entered: n.toString()
                    }
                }));
                lastCharEntered = n;
            }
        }

        // Monitor the input field for key presses. If this is the first
        // keypress during the last two seconds, immediately notify everyone.
        // This prevents a message being sent for every keypress.
        socket.onopen = function() {
            console.log("Connection to server established.")
            ping();
            $('#input').on('keypress', userTyped);
        }

        // Process new messages received on the socket - note that all packets are
        // assumed valid - invalid ones will generate an error but won't prevent
        // more from being processed in the future.
        socket.onmessage = function(e) {
            if(e.data.length) {
                var s = JSON.parse(e.data);
                if('last_char_entered' in s.data &&
                        s.data.last_char_entered > (now() - 5)) {
                    userTypingStarted(s.id);
                }
            }
        };

        // TODO: better error handling (no idea when this gets called)
        socket.onerror = function(e) {
            console.log(e);
        };

        // Assume the server is restarting or something and try to reconnect in
        // one minute intervals. Cancel some pending timeouts.
        socket.onclose = function() {
            console.log("Server closed connection.");
            $('#input').off('keypress', userTyped);
            window.clearTimeout(pingTimeout);
            window.setTimeout(connect, 60000);
        }
    }
    connect();
});
