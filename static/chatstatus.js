/**
 * Stack Exchange Chat Status
 * Copyright 2015 - Nathan Osman
 */

(function() {

    // TODO: get rid of this
    if(!location.pathname.startsWith('/rooms/201/')) {
        return;
    }

    /**
     * Global settings.
     */
    var DEBUG = true,
        SERVER = 'sechat.quickmediasolutions.com';

    /**
     * Log the specified message to the console for debug purposes.
     */
    function log(msg) {
        console.log('[ChatStatus] ' + msg);
    }

    /**
     * Return the current time as a unix timestamp.
     */
    function now() {
        return parseInt(new Date().getTime() / 1000);
    }

    /**
     * Given a message, obtain its ID.
     */
    function messageId(e) {
        return $(e).attr('id').match(/message-(\d+)/)[1];
    }

    /**
     * Given a message, obtain the user's ID. This is made simpler by the fact
     * that SE stores the ID directly in one of the parent elements.
     */
    function messageUserId(e) {
        return $(e).closest('.user-container').data('user');
    }

    /**
     * Load the specified script into the page.
     * @param name filename of the script
     * @param callback function to execute after loading
     */
    function loadScript(name, callback) {
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = 'https://' + SERVER + '/static/' + name;
        script.onload = callback;
        document.body.appendChild(script);
    }

    var users = {},
        pendingContainers = {};

    /**
     * Obtain the container for a specific message, creating it if necessary.
     * @param msgId the ID of the message
     * @return the container for indicators
     *
     * If the message does not exist, the container will be added to a list of
     * "pending" containers to be created when the message does exist.
     */
    function getContainer(msgId) {
        if(msgId in pendingContainers) {
            return pendingContainers[msgId];
        }
        var $msg = $('#message-' + msgId),
            $container = $msg.find('.secs-container');
        if(!$container.length) {
            $container = $('<div>').addClass('secs-container');
        }
        if($msg.length) {
            $msg.append($container);
        } else {
            pendingContainers[msgId] = $container;
        }
        return $container;
    }

    /**
     * Obtain the indicator element for a user, creating it if necessary.
     * @param userId the ID of the user
     * @return the indicator for the user
     */
    function getUser(userId) {
        var $user;
        if(userId in users) {
            $user = users[userId];
        } else {
            var $typing = $('<img>')
                    .attr('src', '//cdn-chat.sstatic.net/chat/img/progress-dots.gif')
                    .hide();
            $user = $('<span>')
                .css({
                    display: 'inline-block',
                    margin: '4px 8px 4px 0'
                })
                .append(CHAT.RoomUsers.createAvatarImage(userId, 16))
                .append(' ')
                .append($typing)
                .data('typing', $typing);
            users[userId] = $user;
        }
        return $user;
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
        if(timeout) {
            window.clearTimeout(timeout);
            $user.data('typing').hide();
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
        if(timeout) {
            window.clearTimeout(timeout);
        } else {
            $user.data('typing').css('display', 'inline');
        }
        $user.data('timeout', window.setTimeout(userStoppedTyping, 4000, userId));
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
        if(isActive()) {
            DEBUG && log("ping");
            socket.send('');
        }
    }
    window.setInterval(ping, 30000);

    /**
     * Hook the input box in order to notify other users of typing. Only send
     * the messages once per two seconds to avoid excessive bandwidth.
     */
    $('#input').on('keypress', function() {
        if(isActive()) {
            var t = now();
            if(lastTypingMsg < (t - 2)) {
                DEBUG && log("last_char_entered: " + t);
                socket.send(JSON.stringify({
                    id: CHAT.CURRENT_USER_ID,
                    data: {
                        last_char_entered: t.toString()
                    }
                }));
                lastTypingMsg = t;
            }
        }
    });

    /**
     * Broadcast the last message read to the other users.
     */
    function broadcastLastMessageRead() {
        if(isActive()) {
            var msgId = messageId($('.message').last());
            if(parseInt(msgId) > parseInt(lastMessageRead)) {
                lastMessageRead = msgId;
                DEBUG && log("last_message_read: " + lastMessageRead);
                socket.send(JSON.stringify({
                    id: CHAT.CURRENT_USER_ID,
                    data: {
                        last_message_read: lastMessageRead
                    }
                }));
            }
        }
    }

    /**
     * Load Live Query and watch for new messages coming in. When one comes in,
     * that user has stopped typing. Also, check for pending containers.
     */
    loadScript('jquery.livequery.min.js', function() {
        log("Live Query loaded")
        $('#chat').livequery('.message', function(e) {
            var msgId = messageId(e),
                userId = messageUserId(e);
            if(msgId in pendingContainers) {
                $(e).append(pendingContainers[msgId]);
                delete pendingContainers[msgId];
            }
            userStoppedTyping(userId);
            if(windowActive) {
                broadcastLastMessageRead();
            }
        });
    });

    /**
     * Keep track of whether the window (or tab) is active.
     */
    $(window).on({
        'blur': function() {
            DEBUG && log("Window has lost focus");
            windowActive = false;
        },
        'focus': function() {
            DEBUG && log("Window has gained focus");
            windowActive = true;
            broadcastLastMessageRead();
        }
    });

    /**
     * Connect to the WebSocket endpoint and set the appropriate callbacks;
     */
    function connect() {
        socket = new WebSocket('wss://' + SERVER + '/api/connect');
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
        if(e.data.length) {
            DEBUG && log("msg: " + e.data);
            try {
                var s = JSON.parse(e.data);
                if('last_char_entered' in s.data &&
                        s.data.last_char_entered > (now() - 4)) {
                    userStartedTyping(s.id);
                }
                if('last_message_read' in s.data) {
                    updateUserMessage(s.id, s.data.last_message_read);
                }
            } catch(e) {
                log("message error: " + e);
            }
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

    /**
     * Connect for the first time.
     */
    connect();

})();
