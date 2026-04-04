const firebaseConfig = {
apiKey: "AIzaSyCZCAwncuoDuy033ZrEquCwRvYpacBs8xM",
authDomain: "heartquotecommunity.firebaseapp.com",
projectId: "heartquotecommunity",
storageBucket: "heartquotecommunity.firebasestorage.app",
messagingSenderId: "346084161963",
appId: "1:346084161963:web:f7ed56dc4a4599f4befaee",
measurementId: "G-JGKWQP35QB"};
let analytics = null;
let firebaseInitialized = false;
let pageViewTracked = false;
let sessionTracked = false;
let firebaseLoading = false;

function loadFirebaseScripts() {
if (firebaseLoading) {
return Promise.resolve();
}

if (firebaseInitialized) {
return Promise.resolve();
}

firebaseLoading = true;

return new Promise((resolve, reject) => {
if (window.firebase && window.firebase.analytics) {
firebaseLoading = false;
initializeFirebase();
resolve();
return;
}

const script1 = document.createElement('script');
script1.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js';

const script2 = document.createElement('script');
script2.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-analytics.js';

script1.onload = () => {
document.head.appendChild(script2);
};

script2.onload = () => {
firebaseLoading = false;
initializeFirebase();
resolve();
};

script2.onerror = (error) => {
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

analytics = firebase.analytics();

analytics.setAnalyticsCollectionEnabled(true);

firebaseInitialized = true;

trackPageView();

trackUserSession();

} catch (error) {
}
}

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
}
}

function trackPageView() {
if (!analytics || !firebaseInitialized) {
setTimeout(trackPageView, 2000);
return;
}

if (pageViewTracked) {
return;
}

try {
pageViewTracked = true;

const pageTitle = document.title || 'Untitled Page';
const pagePath = window.location.pathname;

analytics.logEvent('page_view', {
page_title: pageTitle,
page_path: pagePath,
page_location: window.location.href
});

} catch (error) {
}
}

const ADMOB_CONFIG = {
testDevices  : [''],
banner       : 'ca-app-pub-5188642994982403/7847467013',
appOpen      : 'ca-app-pub-5188642994982403/4281888101',
interstitial : 'ca-app-pub-5188642994982403/1811807909',
};

const APP_OPEN_EXPIRY_MS = 4 * 60 * 60 * 1000;
const INTERSTITIAL_COOLDOWN_MS = 3 * 60 * 1000;
const MAX_RETRY_ATTEMPTS  = 3;
const RETRY_DELAY_MS   = 5 * 1000;

function wait(ms) {
return new Promise(resolve => setTimeout(resolve, ms));
}

function shouldShowPrivacyButton() {
const s = window.admobConsentStatus;
return s === 1 || s === 3;
}

function shouldShowWatchAdButton() {
const s = window.admobConsentStatus;
return s === 2 || s === 3;
}

function createWatchAdButton() {
if (document.getElementById('watchAdBtn')) return;

const btn  = document.createElement('button');
btn.id     = 'watchAdBtn';
btn.title  = 'Watch Ad';

Object.assign(btn.style, {
display        : 'none',
position       : 'fixed',
bottom            : '20px',
right          : '16px',
zIndex         : '9999',
background     : '#1e1e1e',
border         : 'none',
borderRadius   : '50%',
width          : '45px',
height         : '45px',
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
if (!shouldShowWatchAdButton()) return;
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

function createPrivacyButton() {
if (document.getElementById('privacyBtn')) return;

const btn  = document.createElement('button');
btn.id     = 'privacyBtn';
btn.title  = 'Privacy Settings';

Object.assign(btn.style, {
display        : 'none',
position       : 'fixed',
bottom         : '35px',
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
const newStatus           = await consent.getConsentStatus();
window.admobConsentStatus = Number(newStatus);
window.admobNpa           = (await consent.canRequestAds()) ? 0 : 1;
}
} catch(e) {}
}

function showPrivacyButton() {
if (!shouldShowPrivacyButton()) return;
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

async function initConsent() {
try {
if (cordova.platformId === 'ios') {
await consent.requestTrackingAuthorization();
}

const consentStatus           = await consent.getConsentStatus();
window.admobConsentStatus     = Number(consentStatus);

if (
consentStatus === consent.ConsentStatus.Unknown ||
consentStatus === consent.ConsentStatus.Required
) {
await consent.requestInfoUpdate();

const freshStatus         = await consent.getConsentStatus();
window.admobConsentStatus = Number(freshStatus);

if (freshStatus === consent.ConsentStatus.Required) {
const formStatus = await consent.getFormStatus();

if (formStatus === consent.FormStatus.Available) {
const form = await consent.loadForm();
await form.show();

const afterStatus         = await consent.getConsentStatus();
window.admobConsentStatus = Number(afterStatus);

} else {
await consent.loadAndShowIfRequired();

const afterStatus         = await consent.getConsentStatus();
window.admobConsentStatus = Number(afterStatus);
}
}
}

if (shouldShowPrivacyButton()) {
showPrivacyButton();
} else {
hidePrivacyButton();
}

if (!shouldShowWatchAdButton()) {
hideWatchAdButton();
}

return await consent.canRequestAds();

} catch(e) {
hidePrivacyButton();
return true;
}
}

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
appOpenLastShown         = Date.now();
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

let appOpenLastShown = 0;
const APP_OPEN_COOLDOWN_MS = 2 * 60 * 60 * 1000;

document.addEventListener('resume', async () => {
if ((Date.now() - appOpenLastShown) < APP_OPEN_COOLDOWN_MS) return;
await showAppOpenAd();
}, false);

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

// ========== BALANCED AD TRIGGERS (Your Approved Plan) ==========
// No changes to consent code - everything below just calls existing functions

let adTriggersInitialized = false;
let hasShownFirstInterstitial = false;
let lastAdTriggerTime = 0;
let lastPageType = '';

// Track when we manually show ads to respect cooldowns
let manualInterstitialLastShown = 0;
let manualAppOpenLastShown = 0;

const MANUAL_INTERSTITIAL_COOLDOWN = 3 * 60 * 1000; // 3 minutes
const MANUAL_APP_OPEN_COOLDOWN = 2 * 60 * 1000;     // 2 minutes

function canShowManualInterstitial() {
    // Check consent using your existing function
    if (typeof shouldShowWatchAdButton === 'function' && !shouldShowWatchAdButton()) {
        console.log('[Ad] Consent prevents interstitial');
        return false;
    }
    
    const now = Date.now();
    if (now - manualInterstitialLastShown < MANUAL_INTERSTITIAL_COOLDOWN) {
        console.log('[Ad] Manual interstitial cooldown active');
        return false;
    }
    
    return true;
}

function canShowManualAppOpen() {
    const now = Date.now();
    if (now - manualAppOpenLastShown < MANUAL_APP_OPEN_COOLDOWN) {
        console.log('[Ad] Manual app open cooldown active');
        return false;
    }
    return true;
}

// 1. Interstitial: First time user navigates to ANY category
function onFirstCategoryNavigation() {
    if (!hasShownFirstInterstitial && canShowManualInterstitial()) {
        hasShownFirstInterstitial = true;
        manualInterstitialLastShown = Date.now();
        console.log('[Ad] First interstitial - category navigation');
        setTimeout(() => {
            if (typeof showInterstitialAd === 'function') {
                showInterstitialAd();
            }
        }, 500);
    }
}

// 2. Interstitial: After cooldown, on next category navigation
function onSubsequentCategoryNavigation() {
    if (hasShownFirstInterstitial && canShowManualInterstitial()) {
        manualInterstitialLastShown = Date.now();
        console.log('[Ad] Subsequent interstitial (cooldown passed)');
        setTimeout(() => {
            if (typeof showInterstitialAd === 'function') {
                showInterstitialAd();
            }
        }, 500);
    }
}

// 3. App Open: When user navigates back to home
function onBackToHomeTrigger() {
    if (canShowManualAppOpen()) {
        manualAppOpenLastShown = Date.now();
        console.log('[Ad] App open - back to home');
        setTimeout(() => {
            if (typeof showAppOpenAd === 'function') {
                showAppOpenAd();
            }
        }, 300);
    }
}

// DOM Observer to detect page changes (no mindex.js modification needed)
function setupPageWatcher() {
    const viewport = document.getElementById('page-viewport');
    if (!viewport) {
        setTimeout(setupPageWatcher, 500);
        return;
    }
    
    const observer = new MutationObserver(() => {
        const activePage = document.querySelector('.page-layer.page--active');
        if (!activePage) return;
        
        // Detect if current page is home or category
        const isHome = activePage.querySelector('.home-section') !== null;
        const isCategory = !isHome && (activePage.querySelector('.btn-grid-item') !== null || activePage.querySelector('.quote-box') !== null);
        
        const currentPageType = isHome ? 'home' : (isCategory ? 'category' : 'other');
        
        if (currentPageType !== lastPageType) {
            console.log('[Ad] Page change detected:', lastPageType, '->', currentPageType);
            
            if (currentPageType === 'category') {
                // User navigated TO a category
                if (!hasShownFirstInterstitial) {
                    onFirstCategoryNavigation();
                } else {
                    onSubsequentCategoryNavigation();
                }
            } else if (currentPageType === 'home' && lastPageType === 'category') {
                // User navigated BACK to home
                onBackToHomeTrigger();
            }
            
            lastPageType = currentPageType;
        }
    });
    
    observer.observe(viewport, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });
    
    // Initial check
    setTimeout(() => {
        const activePage = document.querySelector('.page-layer.page--active');
        if (activePage) {
            const isHome = activePage.querySelector('.home-section') !== null;
            lastPageType = isHome ? 'home' : 'category';
            console.log('[Ad] Initial page type:', lastPageType);
        }
    }, 1000);
    
    console.log('[Ad] Page watcher initialized');
}

document.addEventListener('deviceready', async () => {

createWatchAdButton();
createPrivacyButton();
hidePrivacyButton();
hideWatchAdButton();

if (!window.admobConsentDone) {

await admob.start();

const canRequest          = await initConsent();
window.admobConsentDone   = true;
window.admobNpa           = canRequest ? 0 : 1;

} else {
if (shouldShowPrivacyButton()) {
showPrivacyButton();
} else {
hidePrivacyButton();
}}
await initBanner(window.admobNpa);

if (!window.admobAppOpenReady) {
await loadAppOpenAd(window.admobNpa);
}

if (!window.admobInterstitialReady) {
await loadInterstitialAd(window.admobNpa);
} else {
showWatchAdButton();
}

// ========== INITIALIZE BALANCED AD TRIGGERS ==========
// This starts the page watcher that detects navigation
if (!adTriggersInitialized) {
    adTriggersInitialized = true;
    setTimeout(() => {
        setupPageWatcher();
        console.log('[Ad] Balanced ad triggers ready - respecting consent & cooldowns');
    }, 2000);
}

}, false);