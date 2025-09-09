document.addEventListener('DOMContentLoaded', function() {
  const testButton = document.getElementById('testLog');
  
  testButton.addEventListener('click', function() {
    // Send a test message to the active tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs && tabs.length > 0) {
        chrome.scripting.executeScript({
          target: {tabId: tabs[0].id},
          function: function() {
            console.log('Test log from Discord Logger Extension');
            console.warn('Test warning message');
            console.error('Test error message');
          }
        });
      } else {
        console.error("No active tab found.");
      }
    });
  });
});
