/**
 * Stack Exchange Chat Status
 * Copyright 2015 - Nathan Osman
 */

(function() {

    /**
     * Default values for global settings.
     */
    var DEFAULTS = {
        debug: false,
        self: true,
        server: 'sechat.quickmediasolutions.com'
    };

    /**
     * Store a value in localStorage.
     * @param key item to set
     * @param val new value
     */
    function set(key, val) {
        localStorage.setItem(key, JSON.stringify(val));
    }

    /**
     * Retrieve a setting from localStorage.
     * @param key item to retrieve
     *
     * The DEFAULTS variable will be used for setting the default value if the
     * key is not set.
     */
    function get(key) {
        var val = localStorage.getItem(key);
        if (val === null) {
            set(key, DEFAULTS[key]);
            return DEFAULTS[key];
        } else {
            return JSON.parse(val);
        }
    }

    /**
     * Log the specified message to the console for debug purposes.
     */
    function log(msg) {
        get('debug') && console.log('[ChatStatus] ' + msg);
    }

    /**
     * Return the current time as a unix timestamp (integer).
     */
    function now() {
        return parseInt(new Date().getTime() / 1000);
    }

    /**
     * Given a message, obtain its ID.
     * @param elem HTML element or jQuery object
     */
    function messageId(elem) {
        if ($(elem).attr('id'))
        return $(elem).attr('id').match(/message-(\d+)/)[1];
    }

    /**
     * Given a message, obtain the user's ID. This is made simpler by the fact
     * that SE stores the ID directly in one of the parent elements.
     * @param elem HTML element or jQuery object
     */
    function messageUserId(elem) {
        return $(elem).closest('.user-container').data('user');
    }

    /**
     * Display a notification at the top of the page.
     * @param msg HTML message to display
     */
    function notify(msg) {
        window.Notifier().notify(msg);
    }

    /**
     * Load the specified script into the page.
     * @param name filename of the script
     * @param callback function to execute after loading
     */
    function loadScript(name, callback) {
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = 'https://' + get('server') + '/js/' + name;
        script.onload = callback;
        script.onerror = function() {
            notify(
                "Unable to load <strong>" + name +
                "</strong> from <strong>" + get('server') + "</strong>."
            );
        };
        document.body.appendChild(script);
    }

    /**
     * Consider the following scenario - notification that a message was read
     * arrives before the message - therefore we need to store the message in a
     * "pending" container until it arrives.
     */
    var pendingContainers = {};

    /**
     * Obtain the container for a specific message, creating it if necessary.
     * @param msgId the ID of the message
     * @return the container for indicators
     */
    function getContainer(msgId) {
        if (msgId in pendingContainers) {
            return pendingContainers[msgId];
        }
        var $msg = $('#message-' + msgId),
            $container = $msg.next('.secs-container');
        if (!$container.length) {
            $container = $('<div>')
                .addClass('secs-container')
                .css('marginLeft', '18px');
            if ($msg.length) {
                $msg.after($container);
            } else {
                pendingContainers[msgId] = $container;
            }
        }
        return $container;
    }

    /**
     * Maintain a map of user IDs to their container.
     */
    var users = {};

    /**
     * Obtain the indicator element for a user, creating it if necessary.
     * @param userId the ID of the user
     * @return the indicator for the user
     */
    function getUser(userId) {
        var $user;
        if (userId in users) {
            $user = users[userId];
        } else {
            var $typing = $('<img>')
                    .attr('src', '//cdn-chat.sstatic.net/chat/img/progress-dots.gif')
                    .css({
                        display: 'inline-block',
                        width: 0
                    });
            $user = $('<span>')
                .css({
                    backgroundColor: 'rgba(0, 0, 0, 0.1)',
                    borderRadius: '12px',
                    display: 'inline-block',
                    margin: '4px 4px 4px 0',
                    padding: '4px'
                })
                .append($(CHAT.RoomUsers.createAvatarImage(userId, 16))
                    .css({
                        borderRadius: '9px',
                        padding: '1px'
                    }))
                .append($typing)
                .data('typing', $typing);
            CHAT.RoomUsers.allPresent().forEach(function(u) {
                if (u.id == userId) {
                    $user.attr('title', u.name + " has read this far");
                }
            });
            users[userId] = $user;
        }
        return $user;
    }

    /**
     * Update whether the current user is active or not.
     * @param userId the ID of the user to update
     * @param active whether the user is active or not
     */
    function updateUserActive(userId, active) {
        getUser(userId).css('opacity', active ? '1' : '0.5');
    }

    /**
     * Update the message that the user has last read.
     * @param userId the ID of the user to update
     * @param msgId the ID of the message or null for the indicator tray
     */
    function updateUserMessage(userId, msgId) {
        getContainer(msgId).append(getUser(userId).detach());
    }

    /**
     * Indicate that a user has stopped typing.
     * @param userId the ID of the user
     */
    function userStoppedTyping(userId) {
        var $user = getUser(userId),
            timeout = $user.data('timeout');
        if (timeout) {
            window.clearTimeout(timeout);
            $user.data('typing').animate({
                marginLeft: 0,
                marginRight: 0,
                width: 0
            });
            $user.removeData('timeout');
        }
    }

    /**
     * Indicate that a user has started typing.
     * @param userId the ID of the user to update
     *
     * The typing indicator will be displayed for four seconds or until it is
     * reset by another call to this function for the same user.
     */
    function userStartedTyping(userId) {
        var $user = getUser(userId),
            timeout = $user.data('timeout');
        if (timeout) {
            window.clearTimeout(timeout);
        } else {
            $user.data('typing').animate({
                marginLeft: '4px',
                marginRight: '4px',
                width: '18px'
            });
        }
        $user.data('timeout', window.setTimeout(userStoppedTyping, 4000, userId));
    }

    /**
     * Indicate that a user has quit.
     */
    function userQuit(userId) {
        getUser(userId).fadeOut(function() {
            $(this).remove();
            delete users[userId];
        });
    }

    var socket,
        lastTypingMsg = 0,
        lastMessageRead = 0,
        windowActive = true;

    /**
     * Determine if the socket is active.
     */
    function isActive() {
        return socket && socket.readyState == WebSocket.OPEN;
    }

    /**
     * Send a ping every 30 seconds to avoid having the socket timeout.
     */
    function ping() {
        if (isActive()) {
            log("ping");
            socket.send(JSON.stringify({
                type: 'ping'
            }));
        }
    }
    window.setInterval(ping, 30000);

    /**
     * Hook the input box in order to notify other users of typing. Only send
     * the messages once per two seconds to avoid excessive bandwidth.
     */
    $('#input').on('keypress', function() {
        if (isActive()) {
            var t = now();
            if (lastTypingMsg < (t - 2)) {
                log("last_char_entered: " + t);
                socket.send(JSON.stringify({
                    type: 'typing',
                    value: t
                }));
                lastTypingMsg = t;
            }
        }
    });

    /**
     * Broadcast the fact that the input box has gained or lost focus.
     * @param active whether the input box is active or not
     */
    function broadcastActive(active) {
        socket.send(JSON.stringify({
            type: 'active',
            value: active ? 1 : 0
        }));
    }

    /**
     * Broadcast the last message read to the other users.
     */
    function broadcastLastMessageRead() {
        if (isActive()) {
            var msgId = messageId($('.message').last());
            if (parseInt(msgId) > parseInt(lastMessageRead)) {
                lastMessageRead = parseInt(msgId);
                log("last_message_read: " + lastMessageRead);
                socket.send(JSON.stringify({
                    type: 'position',
                    value: lastMessageRead
                }));
            } else {
                broadcastActive(true);
            }
        }
    }

    /**
     * Load Live Query and watch for new messages coming in. When one comes in,
     * that user has stopped typing. Also, check for pending containers.
     */
    loadScript('jquery.livequery.min.js', function() {
        log("Live Query loaded")
        var firstLoad = true;
        $('#chat').livequery('.message', function(e) {
            if (!firstLoad) {
                var msgId = messageId(e),
                    userId = messageUserId(e);
                if (msgId in pendingContainers) {
                    $(e).after(pendingContainers[msgId]);
                    delete pendingContainers[msgId];
                }
                userStoppedTyping(userId);
                if (windowActive) {
                    broadcastLastMessageRead();
                }
            }
        });
        firstLoad = false;
    });

    /**
     * Keep track of whether the window (or tab) is active.
     */
    $(window).on({
        'blur': function() {
            log("Window has lost focus");
            windowActive = false;
            broadcastActive(false);
        },
        'focus': function() {
            log("Window has gained focus");
            windowActive = true;
            broadcastLastMessageRead();
        }
    });

    /**
     * Connect to the WebSocket endpoint and set the appropriate callbacks;
     */
    function connect() {
        socket = new WebSocket(
            'wss://' + get('server') + '/api/connect/' +
            CHAT.CURRENT_ROOM_ID + '/' + CHAT.CURRENT_USER_ID
        );
        socket.onopen = onopen;
        socket.onmessage = onmessage;
        socket.onerror = onerror;
        socket.onclose = onclose;
    }

    /**
     * Log the successful connection.
     */
    function onopen() {
        log("socket opened");
        broadcastLastMessageRead();
    }

    /**
     * Process a message received from another user.
     */
    function onmessage(e) {
        log("msg: " + e.data);
        var s = JSON.parse(e.data);
        if (s.type == 'active') {
            updateUserActive(s.user_id, s.value);
        } else if (s.type == 'position') {
            updateUserMessage(s.user_id, s.value);
            updateUserActive(s.user_id, s.value);
        } else if (s.type == 'typing' &&
                s.value > (now() - 4)) {
            userStartedTyping(s.user_id);
        } else if (s.type == 'quit') {
            userQuit(s.user_id);
        }
    }

    /**
     * Log an error that occurs.
     */
    function onerror(e) {
        log("socket error: " + e);
    }

    /**
     * Attempt to reconnect after one minute.
     */
    function onclose() {
        log("socket closed");
        socket = null;
        window.setTimeout(connect, 60 * 1000);
    }

    connect();

    /**
     * Update the visibility of the current user.
     */
    function updateSelf(val) {
        getUser(CHAT.CURRENT_USER_ID).toggle(val);
    }
    updateSelf(get('self'));

    /**
     * Preference dialog
     */
    var $prefCover = $('<div>')
            .css({
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                height: '100%',
                left: '0',
                position: 'fixed',
                top: '0',
                width: '100%',
                zIndex: '6'
            })
            .hide()
            .appendTo(document.body),
        $prefDialog = $('<div>')
            .css({
                backgroundColor: '#fff',
                boxShadow: '0 1px 15px #555555',
                boxSizing: 'border-box',
                height: '200px',
                left: '50%',
                marginLeft: '-150px',
                marginTop: '-100px',
                padding: '8px',
                position: 'fixed',
                top: '50%',
                width: '300px'
            })
            .append($('<a>')
                .attr('href', '#')
                .css('float', 'right')
                .html('&times;')
                .click(function() {
                    $prefCover.fadeOut();
                    return false;
                }))
            .append($('<h4>').text("Preferences"))
            .append('<br>')
            .appendTo($prefCover),
        $debugOption = $('<div>')
            .append($('<input>')
                .attr('type', 'checkbox')
                .prop('checked', get('debug'))
                .change(function() {
                    set('debug', this.checked);
                }))
            .append(" debug messages")
            .appendTo($prefDialog),
        $selfOption = $('<div>')
            .append($('<input>')
                .attr('type', 'checkbox')
                .prop('checked', get('self'))
                .change(function() {
                    set('self', this.checked);
                    updateSelf(this.checked);
                }))
            .append(" show me")
            .appendTo($prefDialog);
    $('input[type=checkbox]').css('verticalAlign', 'middle');

    /**
     * Add a link to the bottom of the page for changing preferences
     */
    $('#footer-legal')
        .prepend(' | ')
        .prepend($('<a>')
            .attr('href', '#')
            .text('prefs')
            .click(function() {
                $prefCover.fadeIn();
                return false;
            }));

})();
