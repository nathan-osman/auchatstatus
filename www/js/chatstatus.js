/**
 * Stack Exchange Chat Status
 * Copyright 2015 - Nathan Osman
 */

(function() {

    /**
     * Display a notification at the top of the page.
     */
    function notify(msg) {
        window.Notifier().notify(msg);
    }

    /**
     * Return the current time as a unix timestamp (integer).
     */
    function now() {
        return parseInt(new Date().getTime() / 1000);
    }

    /**
     * Create a function that will only call the provided callback once.
     */
    function once(callback) {
        var firstCall = false;
        return function() {
            if (!firstCall) {
                callback.apply(null, arguments);
                firstCall = true;
            }
        };
    }

    /**
     * Create a function that ensures the provided callback is only called once
     * in the specified number of seconds.
     */
    function throttle(callback, seconds) {
        var lastCall = 0;
        return function() {
            var t = now();
            if (lastCall < (t - seconds)) {
                callback.apply(null, arguments);
                lastCall = t;
            }
        };
    }

    /**
     * Manage storage and retrieval of script preferences. localStorage is used
     * for keeping track of user preferences.
     */
    function Preferences() {

        /**
         * Default values for all settings.
         */
        var defaultValues = {
            // Show debug messages in the console
            debugMessages: false,
            // Show the user with everyone else
            showMe: true,
            // Show the user's active status
            showActive: true,
            // Show the user's typing status
            showTyping: true,
            // URI chat server to connect to
            server: 'sechat.quickmediasolutions.com',
            // Ping interval (in seconds)
            pingInterval: 30,
            // Connection retry interval (in seconds)
            retryInterval: 30
        };

        /**
         * Retrieve a value from localStorage. If the key has not been set, the
         * default value is returned.
         */
        this.get = function(key) {
            var val = localStorage.getItem(key);
            if (val === null) {
                return defaultValues[key];
            } else {
                return JSON.parse(val);
            }
        };

        /**
         * Store a value in localStorage. The stored value is JSON-serialized.
         */
        this.set = function(key, val) {
            localStorage.setItem(key, JSON.stringify(val));
        };
    }

    /**
     * Simplify the logging of messages to the console. Messages will only be
     * logged if debug messages are enabled.
     */
    function LogFactory(preferences) {

        // Only log messages if the appropriate preference is enabled
        var debugMessages = preferences.get('debugMessages');

        /**
         * Create a logger for the specified class.
         */
        this.create = function(class_) {
            return function(msg) {
                debugMessages && console.log("[" + class_ + "] " + msg);
            };
        };
    }

    /**
     * Interact with user containers, allowing user status and position to be
     * easily manipulated.
     */
    function UserManager() {

        /**
         * It is very possible that a packet indicating a user has read a
         * certain message arrives before the message. A container obviously
         * cannot be attached; therefore it must be added to a list of
         * "pending" containers.
         */
        var pendingContainers = {};

        /**
         * Retrieve the container for the specified message. First, a pending
         * container is returned if one exists. If the message exists in the
         * DOM, its container is optionally created and returned. If not, it is
         * added to the list of pending containers.
         */
        function getContainer(messageId) {
            if (messageId in pendingContainers) {
                return pendingContainers[messageId];
            }
            var $message = $('#message-' + messageId),
                $container = $message.next('.secs-container');
            if (!$container.length) {
                $container = $('<div>')
                    .addClass('secs-container')
                    .css('marginLeft', '18px')
                if ($message.length) {
                    $message.after($container);
                } else {
                    pendingContainers[messageId] = $container;
                }
            }
            return $container;
        }

        /**
         * New messages are inserted immediately after the previous one, which
         * unfortunately means that the container for a message is "bumped"
         * down when the next message is posted. We get around that by hooking
         * jQuery.insertAfter() and manually moving our container around. Yes,
         * it's a really nasty hack. Yes, it works.
         */
        var after = $.fn.after;
        $.fn.after = function(e) {
            var $container = $([]);
            if ($(e).hasClass('message')) {
                $container = this.next('.secs-container').detach();
            }
            var ret = after.apply(this, arguments);
            $container.insertBefore(e);
            return ret;
        };

        /**
         * Attach a pending container if one exists for the message.
         */
        this.attachPendingContainer = function(messageId) {
            if (messageId in pendingContainers) {
                $('#message-' + messageId).after(pendingContainers[messageId]);
                delete pendingContainers[messageId];
            }
        };

        /**
         * To speed things up, keep a map of user IDs to their indicator.
         */
        var users = {};

        /**
         * Display the current position and status of a user.
         */
        function User(userId) {

            // Create the indicator
            var $indicator = $('<span>')
                    .css({
                        backgroundColor: 'rgba(0, 0, 0, 0.1)',
                        borderRadius: '12px',
                        display: 'inline-block',
                        margin: '4px 4px 4px 0',
                        opacity: '0.5',
                        padding: '2px'
                    })
                    .append($(CHAT.RoomUsers.createAvatarImage(userId, 16))
                        .css({
                            borderRadius: '9px',
                            padding: '1px'
                        })),
                $typing = $('<img>')
                    .attr('src', '//cdn-chat.sstatic.net/chat/img/progress-dots.gif')
                    .css({
                        display: 'inline-block',
                        width: 0
                    })
                    .appendTo($indicator),
                timeout = null;

            // Lookup the user's name and display a tooltip
            CHAT.RoomUsers.allPresent().forEach(function(u) {
                if (u.id == userId) {
                    $indicator.attr('title', u.name + " has read this far");
                }
            });

            /**
             * Indicate whether the user is active (input has focus).
             */
            this.setActive = function(active) {
                $indicator.css('opacity', active ? '1' : '0.5');
            };

            /**
             * Move the indicator to the specified message.
             */
            this.moveTo = function(messageId) {
                getContainer(messageId).append($indicator.detach());
            };

            /**
             * Indicate whether the user is currently typing.
             */
            var setTyping = this.setTyping = function(typing) {
                if (timeout !== null) {
                    window.clearTimeout(timeout);
                    timeout = null;
                }
                $typing.animate({
                    marginLeft: typing ? '4px' : 0,
                    marginRight: typing ? '4px' : 0,
                    width: typing ? '18px' : 0
                });
                if (typing) {
                    timeout = window.setTimeout(setTyping, 4000, false);
                }
            };

            /**
             * Remove the indicator.
             */
            this.remove = function() {
                $indicator.fadeOut(function() {
                    $(this).remove();
                });
            };
        }

        /**
         * Retrieve the indicator element for a user, creating it if necessary.
         */
        var get = this.get = function(userId) {
            if (!(userId in users)) {
                users[userId] = new User(userId);
            }
            return users[userId];
        };

        /**
         * Remove the indicator for a user.
         */
        this.remove = function(userId) {
            get(userId).remove();
            delete users[userId];
        };
    }

    /**
     * Communicate with the central server via WebSocket.
     */
    function Socket(preferences, logFactory) {

        var self = this,
            log = logFactory.create('Socket'),
            server = preferences.get('server'),
            socket = null,
            timeout = null,
            pingInterval = preferences.get('pingInterval') * 1000,
            retryInterval = preferences.get('retryInterval') * 1000;

        /**
         * Send a message if the socket is open.
         */
        var send = this.send = function(type, value) {
            if (socket !== null && socket.readyState == WebSocket.OPEN) {
                var data = {
                    type: type
                };
                if (typeof value !== 'undefined') {
                    data.value = value;
                }
                socket.send(JSON.stringify(data));
            }
        }

        // TODO: use the /api/ping method to check if the connection is
        // still alive - if down, close the socket and notify the user

        /**
         * Ping the server to keep the connection alive.
         */
        function ping() {
            log("ping");
            send('ping');
            timeout = window.setTimeout(ping, pingInterval);
        }

        /**
         * Attempt to connect to the server.
         */
        function connect() {
            log("connecting to " + server);
            socket = new WebSocket(
                'wss://' + server + '/api/connect/' +
                CHAT.CURRENT_ROOM_ID + '/' + CHAT.CURRENT_USER_ID
            );
            socket.onopen = function() {
                log("connected");
                timeout = window.setTimeout(ping, pingInterval);
                self.onopen && self.onopen();
            };
            socket.onmessage = function(e) {
                log("received: " + e.data);
                self.onmessage && self.onmessage(e);
            };
            socket.onerror = function(e) {
                log("error: " + e.message);
            };
            socket.onclose = function() {
                log("connection closed; retrying in " + retryInterval + "ms");
                if (timeout !== null) {
                    window.clearTimeout(timeout);
                }
                window.setTimeout(connect, retryInterval);
            };
        }

        connect();
    }

    /**
     * Provides a set of methods and callbacks for interacting with the page.
     */
    function UI(preferences, logFactory) {

        var self = this,
            log = logFactory.create('UI');

        /**
         * Watch for the window gaining and losing focus.
         */
        $(window).on({
            blur: function() {
                log("window has lost focus");
                self.onactivechange && self.onactivechange(false);
            },
            focus: function() {
                log("window has gained focus");
                self.onactivechange && self.onactivechange(true);
            }
        });

        /**
         * Invoke the onmessage callback with the specified message.
         */
        function processMessage(elem) {
            var messageId = $(elem).messageId(),
                userId = $(elem).closest('.user-container').data('user');
            self.onnewmessage && self.onnewmessage(messageId, userId);
        }

        /**
         * In order to be notified of new messages, liveQuery is needed.
         * Therefore, it must be loaded from the remote URL. Once it is loaded,
         * the DOM is monitored for new messages.
         */
        var script = document.createElement('script'),
            server = preferences.get('server');
        script.type = 'text/javascript';
        script.src = 'https://' + server + '/js/jquery.livequery.min.js';
        script.onerror = function() {
            notify("Unable to load liveQuery from <strong>" + server + "</strong>.");
        };
        script.onload = function() {
            $('.message').livequery(once(function() {
                $('.message').expire();
                window.setTimeout(function() {
                    var firstMessages = true;
                    $('.message').livequery(function() {
                        if (!firstMessages) {
                            processMessage(this);
                        }
                    });
                    processMessage($('.message').last());
                    firstMessages = false;
                }, 0);
            }));
        };
        document.body.appendChild(script);

        /**
         * Invoke the typing callback when the user types.
         */
        $('#input').on('keypress', function() {
            self.ontyping && self.ontyping();
        });
    }

    /**
     * Allow user to manage preferences.
     */
    function PreferenceDialog(preferences) {

        /**
         * Create each of the elements.
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
                .appendTo('body'),
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
                .append($('<h3>').text("Preferences"))
                .append($('<p>')
                    .css('fontSize', '8pt')
                    .text("Reload the page to apply changes."))
                .append('<br>')
                .appendTo($prefCover),
            $debugOption = $('<div>')
                .append($('<input>')
                    .attr('type', 'checkbox')
                    .prop('checked', preferences.get('debugMessages'))
                    .change(function() {
                        set('debug', this.checked);
                    }))
                .append(" debug messages")
                .appendTo($prefDialog),
            $serverOption = $('<div>')
                .append("server: ")
                .append($('<input>')
                    .attr('type', 'text')
                    .val(preferences.get('server'))
                    .change(function() {
                        set('server', $(this).val());
                    }))
                .appendTo($prefDialog);
        $('input[type=checkbox]').css('verticalAlign', 'middle');

        /**
         * Add a link to the footer.
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
    }

    var preferences = new Preferences(),
        logFactory = new LogFactory(preferences),
        userManager = new UserManager(),
        socket = new Socket(preferences, logFactory);
        ui = new UI(preferences, logFactory),
        preferenceDialog = new PreferenceDialog(preferences);

    var windowActive = 1,
        lastMessageId = 0,
        lastMessageReadId = 0;

    /**
     * Broadcast the current status of the user each time the connection is
     * opened.
     */
    socket.onopen = function() {
        socket.send('active', windowActive ? 1 : 0);
        if (lastMessageReadId) {
            socket.send('position', lastMessageReadId);
        }
    };

    // TODO: no checking is done here, though the JSON is coming from a trusted
    // server over SSL, so fixing this isn't a huge priority

    /**
     * Process a message received from the socket.
     */
    socket.onmessage = function(e) {
        var json = JSON.parse(e.data),
            userId = json.user_id,
            type = json.type;
        if (type == 'quit') {
            userManager.remove(userId);
        } else {
            var user = userManager.get(json.user_id),
                value = json.value;
            if (type == 'active') {
                user.setActive(value);
            } else if (type == 'position') {
                user.moveTo(value);
            } else if (type == 'typing') {
                user.setTyping(value > (now() - 4));
            }
        }
    };

    /**
     * The window focus has changed. If focus is gained, either update the last
     * message read or indicate that focus was gained.
     */
    ui.onactivechange = function(active) {
        socket.send('active', windowActive = (active ? 1 : 0));
        if (windowActive && lastMessageReadId != lastMessageId) {
            socket.send('position', lastMessageReadId = lastMessageId);
        }
    };

    /**
     * Process a new message displayed in the UI.
     */
    ui.onnewmessage = function(messageId, userId) {
        userManager.attachPendingContainer(messageId);
        userManager.get(userId).setTyping(false);
        lastMessageId = messageId;
        if (windowActive) {
            lastMessageReadId = lastMessageId;
            socket.send('position', lastMessageReadId);
        }
    };

    /**
     * Indicate that the user has started typing - but throttle the calls to
     * avoid overwhelming the API (once every 2 seconds).
     */
    ui.ontyping = throttle(function() {
        socket.send('typing', now());
    }, 2);

})();
