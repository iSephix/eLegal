
document.addEventListener('DOMContentLoaded', function () {
  var conversationWindow = document.getElementById('conversation-window');
  var userInput = document.getElementById('user-input');
  var sendButton = document.getElementById('send-button');
  var redirectButton = document.getElementById('redirect-button');

  sendButton.addEventListener('click', function() {
    var message = userInput.value.trim();
    if (message) {
      conversationWindow.innerHTML += '<div>' + message + '</div>';
      userInput.value = '';
    }
  });

  redirectButton.addEventListener('click', function() {
    window.location.href = '/modules';
  });
});
