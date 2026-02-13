// Firebase configuration - Replace with your own config
const firebaseConfig = {
  apiKey: "AIzaSyA9i8N2DdfHV6NB24h8rl5Akkk0N9UQvYI",
  authDomain: "urdu-poetry-dd4c8.firebaseapp.com",
  projectId: "urdu-poetry-dd4c8",
  storageBucket: "urdu-poetry-dd4c8.firebasestorage.app",
  messagingSenderId: "957402969552",
  appId: "1:957402969552:web:83643eb2debffa0c2af5d5",
  measurementId: "G-Q0HFEFD0VW"
};

// Initialize Firebase
let analytics = null;

// Load Firebase scripts dynamically
function loadFirebaseScripts() {
  return new Promise((resolve, reject) => {
    // Check if Firebase is already loaded
    if (window.firebase && window.firebase.analytics) {
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
      // Initialize Firebase
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      analytics = firebase.analytics();
      
      // Track user engagement
      trackUserSession();
      resolve();
    };
    
    script2.onerror = reject;
    document.head.appendChild(script1);
  });
}

// Track user session
function trackUserSession() {
  if (!analytics) return;
  
  // Track session start
  analytics.logEvent('session_start', {
    timestamp: new Date().toISOString(),
    user_agent: navigator.userAgent,
    language: navigator.language,
    screen_resolution: `${window.screen.width}x${window.screen.height}`
  });
  
  // Track session duration
  const sessionStart = Date.now();
  window.addEventListener('beforeunload', () => {
    const sessionDuration = Math.round((Date.now() - sessionStart) / 1000); // in seconds
    analytics.logEvent('session_end', {
      duration_seconds: sessionDuration
    });
  });
}

// Track page view with title
function trackPageView() {
  if (!analytics) return;
  
  const pageTitle = document.title || 'Untitled Page';
  const pagePath = window.location.pathname;
  const pageUrl = window.location.href;
  
  analytics.logEvent('page_view', {
    page_title: pageTitle,
    page_path: pagePath,
    page_url: pageUrl,
    timestamp: new Date().toISOString()
  });
  
  console.log('Analytics: Page view tracked -', pageTitle);
}

// Track time spent on page
function trackTimeOnPage() {
  if (!analytics) return;
  
  const pageStart = Date.now();
  const pageTitle = document.title || 'Untitled Page';
  
  window.addEventListener('beforeunload', () => {
    const timeSpent = Math.round((Date.now() - pageStart) / 1000); // in seconds
    analytics.logEvent('page_timing', {
      page_title: pageTitle,
      time_spent_seconds: timeSpent
    });
  });
}

// Track promotion widget interaction
function trackPromotionInteraction(action, details = {}) {
  if (!analytics) return;
  
  analytics.logEvent('promotion_interaction', {
    action: action,
    widget_type: 'notes_keeper',
    ...details
  });
}

// Track user count (unique users)
function trackUniqueUser() {
  if (!analytics) return;
  
  // Check if user was counted before (using localStorage)
  const userCounted = localStorage.getItem('user_counted');
  
  if (!userCounted) {
    analytics.logEvent('unique_user', {
      first_visit: new Date().toISOString()
    });
    
    // Mark user as counted (expires after 24 hours for more accurate daily counts)
    const expiryTime = Date.now() + (24 * 60 * 60 * 1000);
    localStorage.setItem('user_counted', 'true');
    localStorage.setItem('user_counted_expiry', expiryTime);
  } else {
    // Check if expired
    const expiry = localStorage.getItem('user_counted_expiry');
    if (expiry && Date.now() > parseInt(expiry)) {
      localStorage.removeItem('user_counted');
      localStorage.removeItem('user_counted_expiry');
      trackUniqueUser(); // Recount user
    }
  }
}

// Modified initPromotion function with analytics
function initPromotion() {
  const promotion = document.getElementById('promotion');
  if (!promotion) {
    console.error('p_romo.js: Element #promotion not found in DOM');
    return;
  }

  // Initialize Firebase and analytics
  loadFirebaseScripts()
    .then(() => {
      // Track user
      trackUniqueUser();
      
      // Track page view
      trackPageView();
      
      // Track time on page
      trackTimeOnPage();
      
      // Track promotion widget load
      trackPromotionInteraction('widget_loaded');
    })
    .catch(error => {
      console.error('Failed to load Firebase:', error);
    });

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

// Run immediately if DOM is ready, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPromotion);
} else {
  initPromotion();
}