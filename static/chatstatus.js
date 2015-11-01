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
        if(val === null) {
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
        script.src = 'https://' + get('server') + '/static/' + name;
        script.onload = callback;
        document.body.appendChild(script);
    }

    var pendingContainers = {};

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
            $container = $msg.next('.secs-container');
        if(!$container.length) {
            $container = $('<div>')
                .addClass('secs-container')
                .css('marginLeft', '18px');
            if($msg.length) {
                $msg.after($container);
            } else {
                pendingContainers[msgId] = $container;
            }
        }
        return $container;
    }

    var users = {};

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
                    .css('marginRight', '4px')
                    .hide();

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
                .append(' ')
                .append($typing)
                .data('typing', $typing);
            users[userId] = $user;

            // Create the allUsers variable as an array of all present users
            var allUsers = CHAT.RoomUsers.allPresent().toArray();

            for (i = 0; i < allUsers.length; i++) {
                // Iterate through the list of present users and if it's equal
                // to the user's ID we are updating then ...
                if (allUsers[i].id == userId) {
                    // ... set the user's element's title attribute equal to
                    // the user's username
                    $user.attr('title', allUsers[i].name + " has read this far");
                }
            }

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
            // Animate the hide
            $user.data('typing').animate({width: 'hide'});
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
            // Animate the element as showing
            $user.data('typing').animate({width: 'show'});
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
            log("ping");
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
                log("last_char_entered: " + t);
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
                log("last_message_read: " + lastMessageRead);
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
        var firstLoad = true;
        $('#chat').livequery('.message', function(e) {
            if(!firstLoad) {
                var msgId = messageId(e),
                    userId = messageUserId(e);
                if(msgId in pendingContainers) {
                    $(e).after(pendingContainers[msgId]);
                    delete pendingContainers[msgId];
                }
                userStoppedTyping(userId);
                if(windowActive) {
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
        socket = new WebSocket('wss://' + get('server') + '/api/connect');
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
            log("msg: " + e.data);
            var s = JSON.parse(e.data);
            if('last_char_entered' in s.data &&
                    parseInt(s.data.last_char_entered) > (now() - 4)) {
                userStartedTyping(s.id);
            }
            if('last_message_read' in s.data) {
                updateUserMessage(s.id, s.data.last_message_read);
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

    connect();

    /**
     * Update the visibility of the current user.
     */
    function updateSelf(val) {
        getUser(CHAT.CURRENT_USER_ID).toggle(val);
    }
    updateSelf();

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
    updateSelf();

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
