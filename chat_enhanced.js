
document.addEventListener('DOMContentLoaded', function () {
  var conversationWindow = document.getElementById('conversation-window');
  var userInput = document.getElementById('user-input');
  var sendButton = document.getElementById('send-button');
  var redirectButton = document.getElementById('redirect-button');
  var legalButton = document.getElementById('legal-language');
  var laymanButton = document.getElementById('layman-language');
  var systemPrompt = ''; // Will change based on which language button is clicked

  function appendMessage(text, isUser) {
    var messageDiv = document.createElement('div');
    messageDiv.classList.add(isUser ? 'user-message' : 'ai-message');
    messageDiv.textContent = text;
    conversationWindow.appendChild(messageDiv);
    conversationWindow.scrollTop = conversationWindow.scrollHeight; // Scroll to the bottom
  }

  sendButton.addEventListener('click', function() {
    var message = userInput.value.trim();
    if (message) {
      appendMessage(message, true);
      userInput.value = '';
      userInput.disabled = true;
      sendButton.disabled = true;
      // TODO: Call OpenAI API and handle the response
      // This is where the serverless function will be called. It should be set up in Vercel.
      fetch('/api/openai.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: systemPrompt, message: message }),
      })
      .then(response => response.json())
      .then(data => {
        appendMessage(data.response, false);
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

  function updateLanguageButtonSelection(selectedButton) {
    legalButton.classList.remove('active');
    laymanButton.classList.remove('active');
    selectedButton.classList.add('active');
    if (selectedButton === legalButton) {
      systemPrompt = 'Juristendeutsch: ';
    } else {
      systemPrompt = 'Laiendeutsch: ';
    }
  }

  legalButton.addEventListener('click', function() {
    updateLanguageButtonSelection(legalButton);
  });

  laymanButton.addEventListener('click', function() {
    updateLanguageButtonSelection(laymanButton);
  });

  redirectButton.addEventListener('click', function() {
    window.location.href = '/modules';
  });
});
