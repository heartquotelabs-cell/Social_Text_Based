const firebaseConfig = {
    apiKey: "AIzaSyCZCAwncuoDuy033ZrEquCwRvYpacBs8xM",
    authDomain: "heartquotecommunity.firebaseapp.com",
    projectId: "heartquotecommunity",
    storageBucket: "heartquotecommunity.firebasestorage.app",
    messagingSenderId: "346084161963",
    appId: "1:346084161963:web:f7ed56dc4a4599f4befaee",
    measurementId: "G-JGKWQP35QB"
  };
// Initialize Firebase
let analytics = null;
let firebaseInitialized = false;

// Load Firebase scripts dynamically
function loadFirebaseScripts() {
  return new Promise((resolve, reject) => {
    // Check if Firebase is already loaded
    if (window.firebase && window.firebase.analytics) {
      initializeFirebase();
      resolve();
      return;
    }

    // Load Firebase SDK
    const script1 = document.createElement('script');
    script1.src = 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js';
    
    const script2 = document.createElement('script');
    script2.src = 'https://www.gstatic.com/firebasejs/9.6.1/firebase-analytics-compat.js';
    
    script1.onload = () => {
      document.head.appendChild(script2);
    };
    
    script2.onload = () => {
      initializeFirebase();
      resolve();
    };
    
    script2.onerror = (error) => {
      console.error('Failed to load Firebase Analytics:', error);
      reject(error);
    };
    
    document.head.appendChild(script1);
  });
}

function initializeFirebase() {
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    
    // Check if analytics is available
    if (firebase.analytics) {
      analytics = firebase.analytics();
      
      // Enable analytics collection
      analytics.setAnalyticsCollectionEnabled(true);
      
      // Set default parameters
      analytics.setDefaultEventParameters({
        app_name: 'HeartQuote',
        app_version: '1.0.0',
        environment: 'production'
      });
      
      firebaseInitialized = true;
      console.log('Firebase Analytics initialized successfully');
      
      // Track user engagement after initialization
      trackUserSession();
      trackPageView(); // Track initial page view
    } else {
      console.error('Firebase Analytics not available');
    }
  } catch (error) {
    console.error('Error initializing Firebase:', error);
  }
}

// Track user session
function trackUserSession() {
  if (!analytics || !firebaseInitialized) {
    console.log('Analytics not ready for session tracking');
    return;
  }
  
  try {
    // Track session start with more details
    analytics.logEvent('session_start', {
      timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent.substring(0, 100), // Limit length
      language: navigator.language || 'unknown',
      screen_resolution: `${window.screen.width}x${window.screen.height}`,
      platform: navigator.platform || 'unknown',
      referrer: document.referrer || 'direct',
      page_title: document.title || 'Untitled',
      page_path: window.location.pathname
    });
    
    console.log('Session start tracked');
    
    // Track session duration
    const sessionStart = Date.now();
    window.addEventListener('beforeunload', () => {
      const sessionDuration = Math.round((Date.now() - sessionStart) / 1000);
      if (analytics && firebaseInitialized) {
        analytics.logEvent('session_end', {
          duration_seconds: sessionDuration,
          page_title: document.title || 'Untitled',
          page_path: window.location.pathname
        });
      }
    });
  } catch (error) {
    console.error('Error tracking session:', error);
  }
}

// Track page view with title
function trackPageView() {
  if (!analytics || !firebaseInitialized) {
    console.log('Analytics not ready for page view tracking');
    return;
  }
  
  try {
    const pageTitle = document.title || 'Untitled Page';
    const pagePath = window.location.pathname;
    const pageUrl = window.location.href;
    const pageHostname = window.location.hostname;
    
    console.log('Tracking page view:', { pageTitle, pagePath });
    
    // Set user properties
    analytics.setUserProperties({
      last_visited_page: pageTitle,
      last_visited_path: pagePath
    });
    
    // Track page view event
    analytics.logEvent('page_view', {
      page_title: pageTitle,
      page_path: pagePath,
      page_url: pageUrl,
      page_hostname: pageHostname,
      timestamp: new Date().toISOString(),
      engagement_time_msec: 1000 // Minimum engagement time
    });
    
    // Also track screen_view for better compatibility
    analytics.logEvent('screen_view', {
      screen_name: pageTitle,
      screen_class: pagePath
    });
    
    console.log('Analytics: Page view tracked -', pageTitle);
    
    // Track page timing separately
    trackPageTiming(pageTitle);
    
  } catch (error) {
    console.error('Error tracking page view:', error);
  }
}

// Track time spent on specific page
let pageStartTime = Date.now();
let currentPageTitle = document.title;

function trackPageTiming(pageTitle) {
  if (!analytics || !firebaseInitialized) return;
  
  // Reset timing for new page
  pageStartTime = Date.now();
  currentPageTitle = pageTitle;
  
  // Update timing when user leaves page
  const updatePageTime = () => {
    const timeSpent = Math.round((Date.now() - pageStartTime) / 1000);
    if (timeSpent >= 5) { // Only track if spent at least 5 seconds
      analytics.logEvent('page_timing', {
        page_title: currentPageTitle,
        time_spent_seconds: timeSpent,
        page_path: window.location.pathname,
        timestamp: new Date().toISOString()
      });
      console.log(`Time tracked for ${currentPageTitle}: ${timeSpent}s`);
    }
  };
  
  // Track on page unload
  window.addEventListener('beforeunload', updatePageTime);
  
  // Track on visibility change (user switches tabs)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      updatePageTime();
      pageStartTime = Date.now(); // Reset when user returns
    }
  });
}

// Track unique users
function trackUniqueUser() {
  if (!analytics || !firebaseInitialized) return;
  
  try {
    // Generate or retrieve user ID
    let userId = localStorage.getItem('user_id');
    if (!userId) {
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('user_id', userId);
      
      // Track new user
      analytics.logEvent('new_user', {
        user_id: userId,
        timestamp: new Date().toISOString(),
        first_page: document.title || 'Untitled',
        first_page_path: window.location.pathname
      });
      console.log('New user tracked:', userId);
    }
    
    // Set user ID for subsequent events
    analytics.setUserId(userId);
    
    // Check if user was counted today
    const lastCounted = localStorage.getItem('user_counted_date');
    const today = new Date().toDateString();
    
    if (lastCounted !== today) {
      analytics.logEvent('daily_active_user', {
        user_id: userId,
        date: today,
        page_title: document.title || 'Untitled'
      });
      
      localStorage.setItem('user_counted_date', today);
      console.log('Daily active user tracked');
    }
  } catch (error) {
    console.error('Error tracking user:', error);
  }
}

// Track promotion widget interaction
function trackPromotionInteraction(action, details = {}) {
  if (!analytics || !firebaseInitialized) {
    console.log('Analytics not ready for promotion tracking');
    return;
  }
  
  try {
    analytics.logEvent('promotion_interaction', {
      action: action,
      widget_type: 'notes_keeper',
      page_title: document.title || 'Untitled',
      page_path: window.location.pathname,
      timestamp: new Date().toISOString(),
      ...details
    });
    
    console.log('Promotion interaction tracked:', action);
  } catch (error) {
    console.error('Error tracking promotion:', error);
  }
}

// Check if Firebase is properly configured
function validateFirebaseConfig() {
  const requiredFields = ['apiKey', 'authDomain', 'projectId', 'appId'];
  for (const field of requiredFields) {
    if (!firebaseConfig[field] || firebaseConfig[field] === `YOUR_${field.toUpperCase()}`) {
      console.error(`Firebase ${field} is not properly configured`);
      return false;
    }
  }
  return true;
}

// Modified initPromotion function with analytics
function initPromotion() {
  const promotion = document.getElementById('promotion');
  if (!promotion) {
    console.error('p_romo.js: Element #promotion not found in DOM');
    return;
  }

  // Validate and initialize Firebase
  if (validateFirebaseConfig()) {
    loadFirebaseScripts()
      .then(() => {
        console.log('Firebase scripts loaded successfully');
        
        // Small delay to ensure analytics is ready
        setTimeout(() => {
          // Track user
          trackUniqueUser();
          
          // Track page view
          trackPageView();
          
          // Track promotion widget load
          trackPromotionInteraction('widget_loaded');
          
          // Set up mutation observer to detect page title changes (for SPA)
          observePageTitleChanges();
        }, 1000);
      })
      .catch(error => {
        console.error('Failed to load Firebase:', error);
      });
  } else {
    console.warn('Firebase not configured properly. Skipping analytics.');
  }

  // Rest of your promotion widget code remains the same...
  // [Keep all your existing widget creation code here]
  
  // Create main container
  const notesKeeper = document.createElement('div');
  notesKeeper.id = 'notes-keeper';
  notesKeeper.style.cssText = `
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 15px;
    border: .5px solid #e0e0e0;
    border-radius: 15px;
    margin: 18px;
    max-width: 600px;
    font-family: Arial, sans-serif;
  `;

  // Image container (45x45px)
  const imgContainer = document.createElement('div');
  imgContainer.style.cssText = `
    width: 45px;
    height: 45px;
    flex-shrink: 0;
    border-radius: 4px;
    overflow: hidden;
  `;

  const img = document.createElement('img');
  img.src = 'https://heartquotelabs-cell.github.io/Social_Text_Based/p_romo/hqp/20260212_171406.png';
  img.alt = 'logo';
  img.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
  `;
  imgContainer.appendChild(img);

  // Content container
  const contentContainer = document.createElement('div');
  contentContainer.style.cssText = `
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  `;

  // Image name
  const nameElement = document.createElement('div');
  nameElement.style.cssText = `
    font-weight: bold;
    font-size: 16px;
    text-align: left;
  `;
  nameElement.textContent = 'Notes Keeper';

  // Small title showcase (at bottom of name)
  const showcaseTitle = document.createElement('div');
  showcaseTitle.style.cssText = `
    font-size: 12px;
    color: #666;
    font-style: italic;
    text-align: left;
  `;
  showcaseTitle.textContent = 'Your notes organizer';

  // Right side red button - with style reset
  const button = document.createElement('button');
  button.textContent = 'Get App';

  // Reset ALL inherited styles first
  button.style.cssText = `
    all: initial !important;
    display: inline-block !important;
    background-color: #ff4444 !important;
    color: white !important;
    border: none !important;
    border-radius: 4px !important;
    padding: 8px 16px !important;
    font-size: 14px !important;
    font-family: Arial, sans-serif !important;
    cursor: pointer !important;
    font-weight: 500 !important;
    transition: background-color 0.2s !important;
    flex-shrink: 0 !important;
    width: auto !important;
    height: auto !important;
    margin: 0 !important;
    line-height: normal !important;
    text-transform: none !important;
    letter-spacing: normal !important;
    box-shadow: none !important;
    text-shadow: none !important;
  `;

  // Hover effect
  button.addEventListener('mouseenter', () => {
    button.style.backgroundColor = '#cc0000 !important';
  });

  button.addEventListener('mouseleave', () => {
    button.style.backgroundColor = '#ff4444 !important';
  });

  // Click handler - open provided link with analytics tracking
  button.addEventListener('click', function() {
    const link = 'https://apkpure.com/heartquote/com.heartquote/downloading';
    
    // Track button click
    trackPromotionInteraction('button_click', {
      link_url: link,
      button_text: 'Get App'
    });
    
    window.open(link, '_blank');
  });

  // Assemble structure
  contentContainer.appendChild(nameElement);
  contentContainer.appendChild(showcaseTitle);

  notesKeeper.appendChild(imgContainer);
  notesKeeper.appendChild(contentContainer);
  notesKeeper.appendChild(button);

  // Add to page
  promotion.appendChild(notesKeeper);
  console.log('p_romo.js: Promotion widget injected successfully');
}

// Observe page title changes (for Single Page Applications)
function observePageTitleChanges() {
  const titleElement = document.querySelector('title');
  if (!titleElement) return;
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' || mutation.type === 'characterData') {
        console.log('Page title changed to:', document.title);
        trackPageView(); // Track new page view when title changes
      }
    });
  });
  
  observer.observe(titleElement, { 
    childList: true, 
    characterData: true,
    subtree: true 
  });
}

// Run immediately if DOM is ready, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPromotion);
} else {
  initPromotion();
}