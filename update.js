// Firebase configuration - Replace with your own config
const firebaseConfig = {
    apiKey: "AIzaSyCZCAwncuoDuy033ZrEquCwRvYpacBs8xM",
    authDomain: "heartquotecommunity.firebaseapp.com",
    projectId: "heartquotecommunity",
    storageBucket: "heartquotecommunity.firebasestorage.app",
    messagingSenderId: "346084161963",
    appId: "1:346084161963:web:f7ed56dc4a4599f4befaee",
    measurementId: "G-JGKWQP35QB"
  };

// Simple Firebase initialization without the problematic method
let analytics = null;
let firebaseInitialized = false;

// Load Firebase scripts dynamically
function loadFirebaseScripts() {
  return new Promise((resolve, reject) => {
    // Check if Firebase is already loaded
    if (window.firebase && window.firebase.analytics) {
      console.log('Firebase already loaded');
      initializeFirebase();
      resolve();
      return;
    }

    console.log('Loading Firebase scripts...');

    // Load Firebase SDK - using older compatible version
    const script1 = document.createElement('script');
    script1.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js';

    const script2 = document.createElement('script');
    script2.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-analytics.js';

    script1.onload = () => {
      console.log('Firebase App loaded');
      document.head.appendChild(script2);
    };

    script2.onload = () => {
      console.log('Firebase Analytics loaded');
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

    // Get analytics instance
    analytics = firebase.analytics();

    // Enable analytics collection
    analytics.setAnalyticsCollectionEnabled(true);

    firebaseInitialized = true;
    console.log('Firebase Analytics initialized successfully');

    // Now track the page view
    trackPageView();
    trackUserSession();

  } catch (error) {
    console.error('Error initializing Firebase:', error);
  }
}

// Track user session
function trackUserSession() {
  if (!analytics || !firebaseInitialized) return;

  try {
    analytics.logEvent('session_start', {
      session_start: new Date().toISOString(),
      user_agent: navigator.userAgent.substring(0, 100),
      language: navigator.language || 'unknown',
      screen_resolution: `${window.screen.width}x${window.screen.height}`
    });

    console.log('Session start tracked');

    // Track session duration
    const sessionStart = Date.now();
    window.addEventListener('beforeunload', () => {
      const sessionDuration = Math.round((Date.now() - sessionStart) / 1000);
      if (analytics && firebaseInitialized) {
        analytics.logEvent('session_end', {
          duration_seconds: sessionDuration
        });
      }
    });
  } catch (error) {
    console.error('Error tracking session:', error);
  }
}

// Track page view with title - SIMPLIFIED VERSION
function trackPageView() {
  if (!analytics || !firebaseInitialized) {
    setTimeout(trackPageView, 2000);
    return;
  }

  try {
    const pageTitle = document.title || 'Untitled Page';
    const pagePath = window.location.pathname;

    // 1. Force the 'config' to update (This is the secret sauce for GA4)
    // This ensures any auto-collected events also use the correct title
    window.gtag('config', firebaseConfig.measurementId, {
      'page_title': pageTitle,
      'page_path': pagePath,
      'page_location': window.location.href
    });

    // 2. Set Screen Name for the Real-time 'Screen' report
    analytics.setCurrentScreen(pageTitle);

    // 3. Manually log the event
    analytics.logEvent('page_view', {
      page_title: pageTitle,
      page_path: pagePath
    });

    console.log('✅ Real-time Title sent:', pageTitle);

  } catch (error) {
    console.error('Error tracking page view:', error);
  }
}



// Track unique users
function trackUniqueUser() {
  if (!analytics || !firebaseInitialized) return;

  try {
    // Simple user tracking
    const lastVisit = localStorage.getItem('last_visit_date');
    const today = new Date().toDateString();

    if (lastVisit !== today) {
      analytics.logEvent('user_visit', {
        visit_date: today,
        page_title: document.title || 'Untitled'
      });

      localStorage.setItem('last_visit_date', today);
      console.log('User visit tracked for today');
    }
  } catch (error) {
    console.error('Error tracking user:', error);
  }
}

// Track promotion widget interaction
function trackPromotionInteraction(action, details = {}) {
  if (!analytics || !firebaseInitialized) {
    console.log('Analytics not ready, promotion tracking delayed');
    return;
  }

  try {
    analytics.logEvent('promotion_action', {
      action_name: action,
      page_title: document.title || 'Untitled',
      page_path: window.location.pathname,
      ...details
    });

    console.log('Promotion interaction tracked:', action);
  } catch (error) {
    console.error('Error tracking promotion:', error);
  }
}

// Modified initPromotion function
// Updated initPromotion function with Plugin Check
function initPromotion() {
  console.log('🚀 Starting promotion widget...');

  const promotion = document.getElementById('promotion');
  if (!promotion) {
    console.error('❌ Element #promotion not found');
    return;
  }

  // First, inject the widget (so users see it immediately)
  createPromotionWidget(promotion);

  // Then try to load Firebase
  setTimeout(() => {
    loadFirebaseScripts()
      .then(() => {
        console.log('✅ Firebase ready, tracking additional data...');

        // Track user after Firebase is ready
        setTimeout(() => {
          trackUniqueUser();
          trackPromotionInteraction('widget_loaded');
        }, 1000);

      })
      .catch(error => {
        console.error('❌ Firebase failed to load:', error);
      });
  }, 100);
}


function createPromotionWidget(promotion) {
  console.log('Creating promotion widget...');

  // Create main container
  const notesKeeper = document.createElement('div');
  notesKeeper.id = 'notes-keeper';
  notesKeeper.style.cssText = `
    display: none;
    align-items: center;
    gap: 15px;
    padding: 15px;
    border: .5px solid #e0e0e0;
    border-radius: 15px;
    margin: 18px;
    max-width: 600px;
    font-family: Arial, sans-serif;
  `;

  // Image container
  const imgContainer = document.createElement('div');
  imgContainer.style.cssText = `
    width: 45px;
    height: 45px;
    flex-shrink: 0;
    border-radius: 4px;
    overflow: hidden;
  `;

  const img = document.createElement('img');
  img.src = 'https://cdn.jsdelivr.net/gh/heartquotelabs-cell/Social_Text_Based/p_romo/hqp/notes.png';
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

  const nameElement = document.createElement('div');
  nameElement.style.cssText = `
    font-weight: bold;
    font-size: 12px;
    text-align: left;
  `;
  nameElement.textContent = 'Notes Keeper - With Lock';

  const showcaseTitle = document.createElement('div');
  showcaseTitle.style.cssText = `
    font-size: 12px;
    color: #cccc;
    font-style: italic;
    text-align: left;
    .night-mode
  `;
  showcaseTitle.textContent = 'Your notes organizer';

  const button = document.createElement('button');
  button.textContent = 'Install';
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

  button.addEventListener('mouseenter', () => {
    button.style.backgroundColor = '#cc0000 !important';
  });

  button.addEventListener('mouseleave', () => {
    button.style.backgroundColor = '#ff4444 !important';
  });

  button.addEventListener('click', function() {
    const link = 'https://apkpure.com/heartquote/com.heartquote/downloading';

    // Track click if analytics is available
    if (analytics && firebaseInitialized) {
      trackPromotionInteraction('button_click', {
        link_url: link,
        button_text: 'Get App'
      });
    } else {
      console.log('Button clicked (analytics not ready)');
    }

    window.open(link, '_blank');
  });

  contentContainer.appendChild(nameElement);
  contentContainer.appendChild(showcaseTitle);

  notesKeeper.appendChild(imgContainer);
  notesKeeper.appendChild(contentContainer);
  notesKeeper.appendChild(button);

  promotion.appendChild(notesKeeper);
  console.log('✅ Promotion widget injected');
}

// Start the script
console.log('📝 Script loaded, waiting for DOM...');

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPromotion);
} else {
  initPromotion();
}

(function() {
    // 1. SINGLETON: Remove any existing modal to prevent duplicates on navigation
    const existing = document.getElementById('ios-modal-wrapper');
    if (existing) existing.remove();

    // CONFIGURATION
    const CONFIG = {
        latestVersion: "2.0.0",     // The newest version available
        minRequiredVersion: "1.0.0", // Versions  this MUST update (Force)
        playStoreUrl: "https://play.google.com/store/apps/details?id=your.app.package",
        title: "Update Available",
        msgOptional: "A new version is available with fresh features. Would you like to update now?",
        msgForce: "Your version is no longer supported. Please update to the latest version to continue."
    };

    // VERSION COMPARISON HELPER
    const current = window.APP_CURRENT_VERSION || "0.0.0";
    
    // If user is already on the latest version, do nothing
    if (current >= CONFIG.latestVersion) return;

    // Check if it should be a FORCE update
    const isForceUpdate = current < CONFIG.minRequiredVersion;

    // 2. STYLES
    if (!document.getElementById('ios-update-styles')) {
        const style = document.createElement('style');
        style.id = 'ios-update-styles';
        style.textContent = `
        #ios-modal-wrapper {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px); display: flex;
            align-items: center; justify-content: center; z-index: 9999999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            touch-action: none;
        }
        .ios-alert {
            width: 280px; background: rgba(255, 255, 255, 0.95);
            border-radius: 14px; overflow: hidden; text-align: center;
            box-shadow: 0 15px 45px rgba(0,0,0,0.3);
            animation: ios-in 0.3s cubic-bezier(0.1, 0.8, 0.2, 1);
        }
        @keyframes ios-in { from { transform: scale(1.1); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .ios-body { padding: 24px 16px; border-bottom: 1px solid #d1d1d6; }
        .ios-title { font-weight: 600; font-size: 18px; margin-bottom: 6px; color: #000; }
        .ios-msg { font-size: 14px; color: #333; line-height: 1.5; }
        .ios-footer { display: flex; height: 50px; align-items: stretch; }
        .ios-btn {
            flex: 1; border: none; font-size: 17px; cursor: pointer; outline: none;
            height:50px;
            border-radius:0px;
            transition: none;
            transform: none !important;
            margin: 0; padding: 0; display: flex; align-items: center; justify-content: center;
            -webkit-tap-highlight-color: transparent; transition: opacity 0.2s;
        }
        .ios-btn:active { opacity: 0.6; }

        /* Optional Update Colors */
        .btn-later { background: #f1f1f1; color: #007aff; border-right: 1px solid #d1d1d6; }
        .btn-update { background: #3cc358; color: #fff; font-weight: 600; }
.btn-later {
background:#3c96c3;
}
        /* Force Update Color (Blue & Bold) */
        .btn-force { background: #007aff; color: #fff; font-weight: 600; width: 100%; }
        `;
        document.head.appendChild(style);
    }

    // 3. CREATE MODAL
    const wrapper = document.createElement('div');
    wrapper.id = 'ios-modal-wrapper';
    
    const message = isForceUpdate ? CONFIG.msgForce : CONFIG.msgOptional;
    const footerHtml = isForceUpdate 
        ? `<button class="ios-btn btn-force" id="update-action">Update Now</button>`
        : `<button class="ios-btn btn-later" id="later-action">Later</button>
           <button class="ios-btn btn-update" id="update-action">Update</button>`;

    wrapper.innerHTML = `
        <div class="ios-alert">
            <div class="ios-body">
                <div class="ios-title">${CONFIG.title}</div>
                <div class="ios-msg">${message}</div>
            </div>
            <div class="ios-footer">${footerHtml}</div>
        </div>
    `;

    document.body.appendChild(wrapper);

    // 4. HANDLERS
    const updateBtn = wrapper.querySelector('#update-action');
    const laterBtn = wrapper.querySelector('#later-action');

    updateBtn.onclick = () => window.location.href = CONFIG.playStoreUrl;
    if (laterBtn) {
        laterBtn.onclick = () => wrapper.remove();
    }

    // Lock Screen
    wrapper.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
})();
