document.addEventListener('DOMContentLoaded', function () {
  var conversationWindow = document.getElementById('conversation-window');
  var userInput = document.getElementById('user-input');
  var sendButton = document.getElementById('send-button');

  function appendMessage(text, isUser) {
    var messageDiv = document.createElement('div');
    messageDiv.classList.add(isUser ? 'user-message' : 'ai-message');
    messageDiv.textContent = text;
    conversationWindow.appendChild(messageDiv);
    conversationWindow.scrollTop = conversationWindow.scrollHeight;
  }

  sendButton.addEventListener('click', function() {
    var message = userInput.value.trim();
    if (message) {
      appendMessage(message, true);
      userInput.value = '';
      userInput.disabled = true;
      sendButton.disabled = true;

      fetch('/api/stream', {  
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      })
      .then(response => response.text())
      .then(data => {
        appendMessage(data, false);
      })
      .catch(error => {
        console.error('Error:', error);
      })
      .finally(() => {
        userInput.disabled = false;
        sendButton.disabled = false;
      });
    }
  });
});
