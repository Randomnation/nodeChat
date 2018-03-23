$(function() {
  var FADE_TIME = 150; // ms
  var TYPING_TIMER_LENGTH = 400; // ms

  // Initialize variables
  var $window = $(window);
  var $usernameInput = $('.usernameInput'); // Input for username
  var $messages = $('.messages'); // Messages area
  var $inputMessage = $('.inputMessage'); // Input message input box

  var $loginPage = $('.login.page'); // The login page
  var $chatPage = $('.chat.page'); // The chatroom page


  // Prompt for setting a username
  var username;
  var clientList;
  var connected = false;
  var typing = false;
  var lastTypingTime;
  var lastChatMessage = {};
  var welcomeDisplayed = false;
  var inputFocus = false;
  var $currentInput = $usernameInput.focus();
  var $participantBadge = $('#participants');
  var $disconnectBadge = $('#disconnect');

  var socket = io();

  function addParticipants (data) {
    clientList = data.clientList;
    $participantBadge.text(data.numUsers + " connected");
  }

  // Sets the client's username
  function setUsername () {
    username = cleanInput($usernameInput.val().trim());

    // If the username is valid
    if (username) {
      $loginPage.fadeOut();
      $chatPage.show();
      $loginPage.off('click');
      $currentInput = $inputMessage.focus();

      // Tell the server your username
      socket.emit('add user', username);
    }
  }

  // Sends a chat message
  function sendMessage (data) {
    var message = $inputMessage.val();
    // Prevent markup from being injected into the message
    message = cleanInput(message);
    // if there is a non-empty message and a socket connection
    if (message && connected) {
      $inputMessage.val('');
      addChatMessage({
        username: username,
        message: message
      });
      // tell server to execute 'new message' and send along one parameter
      socket.emit('new message', message);
    }

  }


  // Log a message
  function log (message, options) {
    var $el = $('<tr></tr>').addClass("message");
    var $msg = $('<td colspan="2"></td>').addClass('log').addClass('text-center').text(message);
    $el.append($msg);
    addMessageElement($el, options);
  }

  // Adds the visual chat message to the message list
  function addChatMessage (data, options) {
    // Don't fade the message in if there is an 'X was typing'
    var $typingMessages = getTypingMessages(data);
    options = options || {};
    if ($typingMessages.length !== 0) {
      options.fade = false;
      $typingMessages.remove();
    }

    var $usernameDiv = $('<td class="username"></td>')
      .text(data.username)
      .prop('title', data.username)
      .css('color', getUsernameColour(data.username));
    var $messageBodyDiv = $('<td class="messageBody"></td>')
      .text(data.message);

    var typingClass = data.typing ? 'typing' : '';
    var $messageDiv = $('<tr class="message"></tr>')
      .data('username', data.username)
      .addClass(typingClass)
      .append($usernameDiv, $messageBodyDiv);

    addMessageElement($messageDiv, options);
  }

  // Adds the visual chat typing message
  function addChatTyping (data) {
    data.typing = true;
    data.message = 'is typing...';
    addChatMessage(data);
  }

  // Removes the visual chat typing message
  function removeChatTyping (data) {
    getTypingMessages(data).fadeOut(function () {
      $(this).remove();
    });
  }

  // Adds a message element to the messages and scrolls to the bottom
  // el - The element to add as a message
  // options.fade - If the element should fade-in (default = true)
  // options.prepend - If the element should prepend
  //   all other messages (default = false)
  function addMessageElement (el, options) {
    var $el = $(el);

    // Setup default options
    if (!options) {
      options = {};
    }
    if (typeof options.fade === 'undefined') {
      options.fade = true;
    }
    if (typeof options.prepend === 'undefined') {
      options.prepend = false;
    }

    // Apply options
    if (options.fade) {
      $el.hide().fadeIn(FADE_TIME);
    }
    if (options.prepend) {
      $messages.prepend($el);
    } else {
      $messages.append($el);
    }
    
    window.scrollTo(0, document.querySelector('.messages').clientHeight);
  }

  // Prevents input from having injected markup
  function cleanInput (input) {
    return $('<div/>').text(input).html();
  }

  // Updates the typing event
  function updateTyping () {
    if (connected) {
      if (!typing) {
        typing = true;
        socket.emit('typing');
      }
      lastTypingTime = (new Date()).getTime();

      setTimeout(function () {
        var typingTimer = (new Date()).getTime();
        var timeDiff = typingTimer - lastTypingTime;
        if (timeDiff >= TYPING_TIMER_LENGTH && typing) {
          socket.emit('stop typing');
          typing = false;
        }
      }, TYPING_TIMER_LENGTH);
    }
  }

  // Gets the 'X is typing' messages of a user
  function getTypingMessages (data) {
    return $('.typing.message').filter(function (i) {
      return $(this).data('username') === data.username;
    });
  }

  // Gets the color of a username through our hash function
  function getUsernameColour (username) {
    // Compute hash code
    var hash = 3; // dunno these colours looked good lel

    for (var i = 0; i < username.length; i++) {
       hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    var c = (hash & 0x00FFFFFF)
    .toString(16)
    .toUpperCase();

    var colour = '#' + "00000".substring(0, 6 - c.length) + c;
    return colour;
  }

  // Keyboard events

  $window.keydown(function (event, data) {
    // Auto-focus the current input when a key is typed
    if (!(event.ctrlKey || event.metaKey || event.altKey)) {
      $currentInput.focus();
    }
    // When the client hits ENTER on their keyboard
    if (event.which === 13) {
      if (username) {
        sendMessage(data);
        socket.emit('stop typing');
        typing = false;
      } else {
        setUsername();
      }
    }
  });

  $inputMessage.on('input', function() {
    updateTyping();
  });

  $usernameInput.on('input', function() {
    $usernameInput.css('color', getUsernameColour(this.value));
  })

  // Click events

  // Focus input when clicking anywhere on login page
  $loginPage.click(function () {
    $currentInput.focus();
  });

  // Focus input when clicking on the message input's border
  $inputMessage.click(function () {
    $inputMessage.focus();
  });

  // Socket events

  // Whenever the server emits 'login', update the participants
  socket.on('login', function (data) {
    connected = true;
    addParticipants(data);
    window.scrollTo(0, document.querySelector('.messages').clientHeight);
  });

  // Whenever the server emits 'catch up', add the missing messages to the chat
  socket.on('catch up', function(convs) {
    var output = [];
    var found = false;
    var equal = false;

    if (!Object.keys(lastChatMessage).length) {
      output = convs;
    } else {
      for (var i = 0; i < convs.length; i++) {
        if (!found 
          && convs[i].username == lastChatMessage.username 
          && convs[i].message == lastChatMessage.message 
          && convs[i].date == lastChatMessage.date) {
            found = true;
            equal = true;
        }
        if (!equal && found) {
          output.push(convs[i]);
        }

        equal = false;
      }

      if (!found && output.length === 0) {
        output = convs;
      }
    }

    // Push the messages onto the chat stream
    for (var i = 0; i < output.length; i++) {
      addChatMessage(output[i]);
    };

    // Set the last chat message to the latest in the conversation.json
    lastChatMessage = convs[convs.length - 1];
  });

  // Whenever the server emits 'new message', update the chat body
  socket.on('new message', function (data) {
    lastChatMessage = data;
    addChatMessage(data);
  });

  // Whenever the server emits 'user joined', log it in the chat body
  socket.on('user joined', function (data) {
    log(data.username + ' joined');
    addParticipants(data);
  });

  // Whenever the server emits 'user left', log it in the chat body
  socket.on('user left', function (data) {
    log(data.username + ' left');
    addParticipants(data);
    removeChatTyping(data);
  });

  // Whenever the server emits 'typing', show the typing message
  socket.on('typing', function (data) {
    addChatTyping(data);
  });

  // Whenever the server emits 'stop typing', kill the typing message
  socket.on('stop typing', function (data) {
    removeChatTyping(data);
  });

  socket.on('disconnect', function () {
    log('connection lost');
    $disconnectBadge.removeClass('d-none');
    $participantBadge.addClass('d-none');
    $inputMessage.prop('disabled', true);
  });

  socket.on('reconnect', function () {
    log('connection established');
    if (username) {
      socket.emit('add user', username);
    }
    $disconnectBadge.addClass('d-none');
    $participantBadge.removeClass('d-none');
    $inputMessage.prop('disabled', false);
  });

  socket.on('reconnect_error', function () {
    // log('attempt to reconnect has failed');
  });

});
