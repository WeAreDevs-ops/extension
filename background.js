

// Background script to handle log messages and send to webhook service
// Replace with your actual Replit deployment URL
const WEBHOOK_SERVICE_URL = 'https://extension.up.railway.app/send-log';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'LOG_CAPTURED') {
    sendLogToWebhook(message.data, sender.tab);
  }
});

async function sendLogToWebhook(logData, tab) {
  try {
    const payload = {
      ...logData,
      tabId: tab?.id,
      tabTitle: tab?.title
    };

    await fetch(WEBHOOK_SERVICE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error('Failed to send log to webhook service:', error);
  }
}

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Discord Logger Extension installed');
});
  
