document.addEventListener('DOMContentLoaded', function() {
  const testButton = document.getElementById('testLog');
  const toggleButton = document.getElementById('adBlockToggle');
  
  // Handle toggle button (cosmetic only)
  toggleButton.addEventListener('click', function() {
    if (toggleButton.classList.contains('enabled')) {
      toggleButton.classList.remove('enabled');
      toggleButton.classList.add('disabled');
      toggleButton.textContent = '🚫 Protection OFF';
    } else {
      toggleButton.classList.remove('disabled');
      toggleButton.classList.add('enabled');
      toggleButton.textContent = '🛡️ Protection ON';
    }
  });
  
  testButton.addEventListener('click', function() {
    // Try multiple methods to get active tab for better compatibility
    
    // Method 1: Standard query
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs && tabs.length > 0) {
        executeTestScript(tabs[0]);
        return;
      }
      
      // Method 2: Try without currentWindow constraint
      chrome.tabs.query({active: true}, function(tabs) {
        if (tabs && tabs.length > 0) {
          executeTestScript(tabs[0]);
          return;
        }
        
        // Method 3: Get all tabs and find first one
        chrome.tabs.query({}, function(allTabs) {
          if (allTabs && allTabs.length > 0) {
            executeTestScript(allTabs[0]);
            return;
          }
          
          console.error("No tabs found in any method.");
          alert("No active tab found. Please make sure you have a tab open and try again.");
        });
      });
    });
  });
  
  function executeTestScript(tab) {
    try {
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: function() {
          console.log('Test log from Discord Logger Extension');
          console.warn('Test warning message');
          console.error('Test error message');
          
          // Also test sending to background
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage({
              type: 'LOG_CAPTURED',
              data: {
                level: 'info',
                message: 'Extension test successful from popup',
                timestamp: new Date().toISOString(),
                url: window.location.href,
                userAgent: navigator.userAgent
              }
            });
          }
        }
      }, function(result) {
        if (chrome.runtime.lastError) {
          console.error('Script execution error:', chrome.runtime.lastError);
        } else {
          console.log('Test script executed successfully');
        }
      });
    } catch (error) {
      console.error('Error executing script:', error);
      alert("Error executing test script: " + error.message);
    }
  }
});
