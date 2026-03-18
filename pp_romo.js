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

// Simple Firebase initialization
let analytics = null;
let firebaseInitialized = false;
let pageViewTracked = false;
let sessionTracked = false;
let firebaseLoading = false; // Prevent multiple load attempts

// Load Firebase scripts dynamically (only once)
function loadFirebaseScripts() {
  // Prevent multiple simultaneous load attempts
  if (firebaseLoading) {
    console.log('Firebase already loading...');
    return Promise.resolve();
  }

  if (firebaseInitialized) {
    console.log('Firebase already initialized');
    return Promise.resolve();
  }

  firebaseLoading = true;

  return new Promise((resolve, reject) => {
    // Check if Firebase is already loaded
    if (window.firebase && window.firebase.analytics) {
      console.log('Firebase already loaded');
      firebaseLoading = false;
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
      firebaseLoading = false;
      initializeFirebase();
      resolve();
    };

    script2.onerror = (error) => {
      console.error('Failed to load Firebase Analytics:', error);
      firebaseLoading = false;
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

    // Track page view only once
    trackPageView();

    // Track session only once
    trackUserSession();

  } catch (error) {
    console.error('Error initializing Firebase:', error);
  }
}

// Track user session
function trackUserSession() {
  if (!analytics || !firebaseInitialized || sessionTracked) return;

  try {
    sessionTracked = true;

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

// Track page view - ONLY ONCE
function trackPageView() {
  if (!analytics || !firebaseInitialized) {
    setTimeout(trackPageView, 2000);
    return;
  }

  // CRITICAL: Prevent duplicate page views
  if (pageViewTracked) {
    console.log('Page view already tracked, skipping duplicate');
    return;
  }

  try {
    pageViewTracked = true;

    const pageTitle = document.title || 'Untitled Page';
    const pagePath = window.location.pathname;

    // Use ONLY ONE method for page_view
    analytics.logEvent('page_view', {
      page_title: pageTitle,
      page_path: pagePath,
      page_location: window.location.href
    });

    console.log('✅ Page view tracked once:', pageTitle);

  } catch (error) {
    console.error('Error tracking page view:', error);
  }
}

// SEPARATE FUNCTION: Track promotion appearance (NOT a page view)
function trackPromotionAppearance() {
  if (!analytics || !firebaseInitialized) {
    console.log('Analytics not ready for promotion tracking');
    return;
  }

  try {
    // Use a custom event name - NOT page_view
    analytics.logEvent('promotion_impression', {
      promotion_name: 'notes_keeper',
      promotion_id: 'notes_keeper_001',
      creative_name: 'widget_banner',
      page_title: document.title || 'Untitled'
    });

    console.log('✅ Promotion impression tracked (separate from page view)');
  } catch (error) {
    console.error('Error tracking promotion:', error);
  }
}

// Track promotion interaction (clicks, etc.)
function trackPromotionInteraction(action, details = {}) {
  if (!analytics || !firebaseInitialized) {
    console.log('Analytics not ready, promotion tracking delayed');
    return;
  }

  try {
    analytics.logEvent('promotion_action', {
      action_name: action,
      promotion_name: 'notes_keeper',
      page_title: document.title || 'Untitled',
      page_path: window.location.pathname,
      ...details
    });

    console.log('Promotion interaction tracked:', action);
  } catch (error) {
    console.error('Error tracking promotion:', error);
  }
}

// Track unique users
function trackUniqueUser() {
  if (!analytics || !firebaseInitialized) return;

  try {
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

// Modified initPromotion function
function initPromotion() {
  console.log('🚀 Starting promotion widget...');

  const promotion = document.getElementById('promotion');
  if (!promotion) {
    console.error('❌ Element #promotion not found');
    return;
  }

  // First, inject the widget
  createPromotionWidget(promotion);

  // Then try to load Firebase (only once)
  setTimeout(() => {
    loadFirebaseScripts()
      .then(() => {
        console.log('✅ Firebase ready, tracking additional data...');

        setTimeout(() => {
          trackUniqueUser();

          // Track promotion appearance - THIS IS NOT A PAGE VIEW
          trackPromotionAppearance();

          // Track widget loaded event
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
  img.src = 'https://cdn.jsdelivr.net/gh/heartquotelabs-cell/Social_Text_Based/p_romo/hqp/20260212_171406.png';
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
    font-size: 16px;
    text-align: left;
  `;
  nameElement.textContent = 'Notes Keeper';

  const showcaseTitle = document.createElement('div');
  showcaseTitle.style.cssText = `
    font-size: 12px;
    color: #666;
    font-style: italic;
    text-align: left;
  `;
  showcaseTitle.textContent = 'Your notes organizer';

  const button = document.createElement('button');
  button.textContent = 'Get App';
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

    if (analytics && firebaseInitialized) {
      trackPromotionInteraction('button_click', {
        link_url: link,
        button_text: 'Get App'
      });
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









// ============================================
// CONFIGURATION
// ============================================
const ADMOB_CONFIG = {
    testDevices  : ['f5af6f48-23f7-412f-af01-4ee218d6893a'],
    banner       : 'ca-app-pub-3940256099942544/6300978111',
    appOpen      : 'ca-app-pub-3940256099942544/9257395921',
    interstitial : 'ca-app-pub-3940256099942544/1033173712',
};


const APP_OPEN_EXPIRY_MS       = 4 * 60 * 60 * 1000; // 4 hours
const INTERSTITIAL_COOLDOWN_MS = 60 * 1000;           // 1 minute
const MAX_RETRY_ATTEMPTS       = 3;                   // Max retries
const RETRY_DELAY_MS           = 5 * 1000;            // 5 seconds


// ============================================
// UTILITIES
// ============================================
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// ============================================
// HELPERS — Single source of truth
// ============================================

// Privacy button only for EEA/US regulated users
function shouldShowPrivacyButton() {
    const s = window.admobConsentStatus;
    // 1 = Required (EEA/US user, not consented yet)
    // 3 = Obtained (EEA/US user, already consented)
    return s === 1 || s === 3;
}

// Watch Ad button only shows when:
// 1. Ad is loaded
// 2. Non EEA/US users — immediately
// 3. EEA/US users — only after consent dialog done
function shouldShowWatchAdButton() {
    const s = window.admobConsentStatus;
    // 0 = Unknown     → consent not done yet → hide
    // 1 = Required    → consent form not shown yet → hide
    // 2 = NotRequired → outside EEA/US → show ✅
    // 3 = Obtained    → EEA/US consented → show ✅
    return s === 2 || s === 3;
}


// ============================================
// CREATE WATCH AD BUTTON VIA JAVASCRIPT
// ============================================
function createWatchAdButton() {
    if (document.getElementById('watchAdBtn')) return;

    const btn  = document.createElement('button');
    btn.id     = 'watchAdBtn';
    btn.title  = 'Watch Ad';

    Object.assign(btn.style, {
        display        : 'none',
        position       : 'fixed',
        top            : '7px',
        right          : '15px',
        zIndex         : '9999',
        background     : '#FF6600',
        border         : 'none',
        borderRadius   : '50%',
        width          : '35px',
        height         : '35px',
        cursor         : 'pointer',
        boxShadow      : '0 2px 6px rgba(0,0,0,0.4)',
        alignItems     : 'center',
        justifyContent : 'center',
        padding        : '0',
        outline        : 'none',
    });

    const icon     = document.createElement('i');
    icon.className = 'fas fa-video';

    Object.assign(icon.style, {
        color         : 'white',
        fontSize      : '18px',
        pointerEvents : 'none',
    });

    btn.appendChild(icon);
    document.body.appendChild(btn);

    btn.addEventListener('click', async () => {
        await showInterstitialAd();
    });
}

function showWatchAdButton() {
    if (!shouldShowWatchAdButton()) return; // ← Guard ✅
    const btn = document.getElementById('watchAdBtn');
    if (btn) {
        btn.style.display        = 'flex';
        btn.style.alignItems     = 'center';
        btn.style.justifyContent = 'center';
    }
}

function hideWatchAdButton() {
    const btn = document.getElementById('watchAdBtn');
    if (btn) btn.style.display = 'none';
}


// ============================================
// CREATE PRIVACY BUTTON VIA JAVASCRIPT
// ============================================
function createPrivacyButton() {
    if (document.getElementById('privacyBtn')) return;

    const btn  = document.createElement('button');
    btn.id     = 'privacyBtn';
    btn.title  = 'Privacy Settings';

    Object.assign(btn.style, {
        display        : 'none',
        position       : 'fixed',
        bottom         : '65px',
        left           : '10px',
        zIndex         : '9999',
        background     : 'rgba(0,0,0,0.5)',
        border         : 'none',
        borderRadius   : '20px',
        cursor         : 'pointer',
        boxShadow      : '0 2px 6px rgba(0,0,0,0.3)',
        alignItems     : 'center',
        justifyContent : 'center',
        padding        : '5px 10px',
        outline        : 'none',
        gap            : '5px',
    });

    const icon     = document.createElement('i');
    icon.className = 'fas fa-shield-alt';

    Object.assign(icon.style, {
        color         : 'white',
        fontSize      : '11px',
        pointerEvents : 'none',
    });

    const label     = document.createElement('span');
    label.innerText = 'Privacy';

    Object.assign(label.style, {
        color         : 'white',
        fontSize      : '11px',
        pointerEvents : 'none',
    });

    btn.appendChild(icon);
    btn.appendChild(label);
    document.body.appendChild(btn);

    btn.addEventListener('click', async () => {
        await showPrivacyOptions();
    });
}

async function showPrivacyOptions() {
    try {
        if (shouldShowPrivacyButton()) {
            await consent.showPrivacyOptionsForm();
            // Update consent status after user changes preferences
            const newStatus           = await consent.getConsentStatus();
            window.admobConsentStatus = Number(newStatus);
            window.admobNpa           = (await consent.canRequestAds()) ? 0 : 1;
        }
    } catch(e) {}
}

function showPrivacyButton() {
    if (!shouldShowPrivacyButton()) return; // ← Guard ✅
    const btn = document.getElementById('privacyBtn');
    if (btn) {
        btn.style.display        = 'flex';
        btn.style.alignItems     = 'center';
        btn.style.justifyContent = 'center';
    }
}

function hidePrivacyButton() {
    const btn = document.getElementById('privacyBtn');
    if (btn) btn.style.display = 'none';
}


// ============================================
// CONSENT — Runs once, respects user choice
// ============================================
async function initConsent() {
    try {
        if (cordova.platformId === 'ios') {
            await consent.requestTrackingAuthorization();
        }

        // Step 1 — Get current consent status
        const consentStatus           = await consent.getConsentStatus();
        window.admobConsentStatus     = Number(consentStatus);

        // Step 2 — Only proceed if unknown or required
        if (
            consentStatus === consent.ConsentStatus.Unknown ||
            consentStatus === consent.ConsentStatus.Required
        ) {
            await consent.requestInfoUpdate();

            // Step 3 — Re-check after update
            const freshStatus         = await consent.getConsentStatus();
            window.admobConsentStatus = Number(freshStatus);

            // Step 4 — Only show form if still Required
            if (freshStatus === consent.ConsentStatus.Required) {
                const formStatus = await consent.getFormStatus();

                if (formStatus === consent.FormStatus.Available) {
                    const form = await consent.loadForm();
                    await form.show();

                    // Re-check after user interacts with form
                    const afterStatus         = await consent.getConsentStatus();
                    window.admobConsentStatus = Number(afterStatus);

                } else {
                    await consent.loadAndShowIfRequired();

                    // Re-check after loadAndShowIfRequired
                    const afterStatus         = await consent.getConsentStatus();
                    window.admobConsentStatus = Number(afterStatus);
                }
            }
        }

        // Step 5 — Update buttons based on final consent status
        if (shouldShowPrivacyButton()) {
            showPrivacyButton();
        } else {
            hidePrivacyButton();
        }

        // Show watch ad button if consent allows
        // Actual show handled after interstitial loads
        if (!shouldShowWatchAdButton()) {
            hideWatchAdButton();
        }

        return await consent.canRequestAds();

    } catch(e) {
        hidePrivacyButton();
        return true;
    }
}


// ============================================
// BANNER AD - Create once, reuse forever
// ============================================
let banner;

async function initBanner(npa) {
    try {
        if (!window.admobBanner) {
            window.admobBanner = new admob.BannerAd({
                adUnitId : ADMOB_CONFIG.banner,
                position : 'bottom',
                npa      : npa,
                size     : 'BANNER',
            });

            window.admobBanner.on('load', async () => {
                await window.admobBanner.show();
            });

            window.admobBanner.on('error', async () => {
                await wait(RETRY_DELAY_MS);
                try {
                    await window.admobBanner.load();
                } catch(e) {}
            });

            await window.admobBanner.load();
        } else {
            await window.admobBanner.show();
        }

        banner = window.admobBanner;

    } catch(e) {}
}

window.addEventListener('pagehide', () => {
    try {
        if (window.admobBanner) {
            window.admobBanner.hide();
        }
    } catch(e) {}
});


// ============================================
// APP OPEN AD - Policy Compliant
// ============================================
let appOpenAd        = null;
let appOpenLoadTime  = null;
let appOpenIsShowing = false;
let appOpenReady     = false;
let appOpenRetries   = 0;

function isAppOpenAdFresh() {
    if (!appOpenLoadTime) return false;
    return (Date.now() - appOpenLoadTime) < APP_OPEN_EXPIRY_MS;
}

async function loadAppOpenAd(npa) {
    if (appOpenAd && isAppOpenAdFresh()) return;
    if (appOpenRetries >= MAX_RETRY_ATTEMPTS) {
        appOpenRetries = 0;
        return;
    }

    try {
        appOpenAd = new admob.AppOpenAd({
            adUnitId : ADMOB_CONFIG.appOpen,
            npa      : npa,
        });

        await appOpenAd.load();
        appOpenLoadTime          = Date.now();
        appOpenReady             = true;
        appOpenRetries           = 0;
        window.admobAppOpenReady = true;

    } catch(e) {
        appOpenAd                = null;
        appOpenReady             = false;
        window.admobAppOpenReady = false;
        appOpenRetries++;

        if (appOpenRetries < MAX_RETRY_ATTEMPTS) {
            await wait(RETRY_DELAY_MS * appOpenRetries);
            await loadAppOpenAd(npa);
        }
    }
}

async function showAppOpenAd() {
    if (appOpenIsShowing)    return;
    if (!appOpenAd)          return;
    if (!appOpenReady)       return;
    if (!isAppOpenAdFresh()) return;

    try {
        appOpenIsShowing = true;

        if (window.admobBanner) await window.admobBanner.hide();

        appOpenAd.on('dismiss', async () => {
            appOpenIsShowing         = false;
            appOpenAd                = null;
            appOpenReady             = false;
            window.admobAppOpenReady = false;

            if (window.admobBanner) await window.admobBanner.show();
            await loadAppOpenAd(window.admobNpa);
        });

        appOpenAd.on('error', async () => {
            appOpenIsShowing         = false;
            appOpenAd                = null;
            appOpenReady             = false;
            window.admobAppOpenReady = false;

            if (window.admobBanner) await window.admobBanner.show();
            await loadAppOpenAd(window.admobNpa);
        });

        await appOpenAd.show();

    } catch(e) {
        appOpenIsShowing = false;
        if (window.admobBanner) await window.admobBanner.show();
    }
}

document.addEventListener('resume', async () => {
    await showAppOpenAd();
}, false);


// ============================================
// INTERSTITIAL AD - Persistent + Button Controlled
// ============================================
let interstitialAd        = null;
let interstitialReady     = false;
let interstitialLastShown = 0;
let interstitialShowing   = false;
let interstitialRetries   = 0;

async function loadInterstitialAd(npa) {
    if (interstitialReady && window.admobInterstitialReady) return;
    if (interstitialRetries >= MAX_RETRY_ATTEMPTS) {
        interstitialRetries = 0;
        return;
    }

    try {
        interstitialAd = new admob.InterstitialAd({
            adUnitId : ADMOB_CONFIG.interstitial,
            npa      : npa,
        });

        await interstitialAd.load();
        interstitialReady             = true;
        interstitialRetries           = 0;
        window.admobInterstitialReady = true;

        // Only show button if consent status allows ✅
        showWatchAdButton();

    } catch(e) {
        interstitialAd                = null;
        interstitialReady             = false;
        window.admobInterstitialReady = false;
        interstitialRetries++;

        hideWatchAdButton();

        if (interstitialRetries < MAX_RETRY_ATTEMPTS) {
            await wait(RETRY_DELAY_MS * interstitialRetries);
            await loadInterstitialAd(npa);
        }
    }
}

async function showInterstitialAd() {
    if (interstitialShowing)                                              return;
    if (!interstitialAd)                                                  return;
    if (!interstitialReady)                                               return;
    if ((Date.now() - interstitialLastShown) < INTERSTITIAL_COOLDOWN_MS)  return;

    try {
        interstitialShowing = true;

        hideWatchAdButton();
        if (window.admobBanner) await window.admobBanner.hide();

        interstitialAd.on('dismiss', async () => {
            interstitialShowing           = false;
            interstitialReady             = false;
            interstitialAd                = null;
            interstitialLastShown         = Date.now();
            window.admobInterstitialReady = false;

            if (window.admobBanner) await window.admobBanner.show();
            await loadInterstitialAd(window.admobNpa);
        });

        interstitialAd.on('error', async () => {
            interstitialShowing           = false;
            interstitialReady             = false;
            interstitialAd                = null;
            window.admobInterstitialReady = false;

            if (window.admobBanner) await window.admobBanner.show();
            hideWatchAdButton();
            await loadInterstitialAd(window.admobNpa);
        });

        await interstitialAd.show();

    } catch(e) {
        interstitialShowing = false;
        if (window.admobBanner) await window.admobBanner.show();
    }
}


// ============================================
// MASTER INIT — Entry point for everything
// ============================================
document.addEventListener('deviceready', async () => {

    // Step 1 — Create buttons, hide both by default
    createWatchAdButton();
    createPrivacyButton();
    hidePrivacyButton();
    hideWatchAdButton();

    // Step 2 — Run consent + admob start ONCE only
    if (!window.admobConsentDone) {

        await admob.configure({
            testDevices: ADMOB_CONFIG.testDevices,
        });

        await admob.start();

        // Consent MUST happen before any ads
        const canRequest          = await initConsent();
        window.admobConsentDone   = true;
        window.admobNpa           = canRequest ? 0 : 1;

    } else {

        // Already initialized — restore consent status on new page
        // Re-check buttons based on stored consent status
        if (shouldShowPrivacyButton()) {
            showPrivacyButton();
        } else {
            hidePrivacyButton();
        }

    }

    // Step 3 — Banner show/hide per page
    await initBanner(window.admobNpa);

    // Step 4 — App Open Ad once
    if (!window.admobAppOpenReady) {
        await loadAppOpenAd(window.admobNpa);
    }

    // Step 5 — Interstitial once
    if (!window.admobInterstitialReady) {
    await loadInterstitialAd(window.admobNpa);
    } else {
        // Already loaded — show button if consent allows
        showWatchAdButton();
    }

}, false);