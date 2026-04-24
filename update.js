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
const APP_OPEN_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_RETRY_ATTEMPTS  = 3;
const RETRY_DELAY_MS   = 5 * 1000;

function wait(ms) {
return new Promise(resolve => setTimeout(resolve, ms));}

function shouldShowPrivacyButton() {
const s = window.admobConsentStatus;
return s === 1 || s === 3;}

function shouldShowWatchAdButton() {
const s = window.admobConsentStatus;
return s === 2 || s === 3;}

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
  return;
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

// REMOVED: showWatchAdButton() call

} catch(e) {
interstitialAd                = null;
interstitialReady             = false;
window.admobInterstitialReady = false;
interstitialRetries++;

// REMOVED: hideWatchAdButton() call

if (interstitialRetries < MAX_RETRY_ATTEMPTS) {
await wait(RETRY_DELAY_MS * interstitialRetries);
await loadInterstitialAd(npa);
}
}
}

async function showInterstitialAd() {
  return;
if (interstitialShowing)                                              return;
if (!interstitialAd)                                                  return;
if (!interstitialReady)                                               return;
if ((Date.now() - interstitialLastShown) < INTERSTITIAL_COOLDOWN_MS)  return;

try {
interstitialShowing = true;

// REMOVED: hideWatchAdButton() call
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
// REMOVED: hideWatchAdButton() call
await loadInterstitialAd(window.admobNpa);
});

await interstitialAd.show();

} catch(e) {
interstitialShowing = false;
if (window.admobBanner) await window.admobBanner.show();
}
}

// ========== BALANCED AD TRIGGERS (No button, consent untouched) ==========

let adTriggersInitialized = false;
let hasShownFirstInterstitial = false;
let lastPageType = '';

const MANUAL_INTERSTITIAL_COOLDOWN = 3 * 60 * 1000;
let manualInterstitialLastShown = 0;

function canShowManualInterstitial() {
    // Check consent using your existing function (UNCHANGED)
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

function setupPageWatcher() {
    const viewport = document.getElementById('page-viewport');
    if (!viewport) {
        setTimeout(setupPageWatcher, 500);
        return;
    }

    const observer = new MutationObserver(() => {
        const activePage = document.querySelector('.page-layer.page--active');
        if (!activePage) return;

        const isHome = activePage.querySelector('.home-section') !== null;
        const isCategory = !isHome && (activePage.querySelector('.btn-grid-item') !== null || activePage.querySelector('.quote-box') !== null);

        const currentPageType = isHome ? 'home' : (isCategory ? 'category' : 'other');

        if (currentPageType !== lastPageType) {
            console.log('[Ad] Page change detected:', lastPageType, '->', currentPageType);

            if (currentPageType === 'category') {
                if (!hasShownFirstInterstitial) {
                    onFirstCategoryNavigation();
                } else {
                    onSubsequentCategoryNavigation();
                }
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

    setTimeout(() => {
        const activePage = document.querySelector('.page-layer.page--active');
        if (activePage) {
            const isHome = activePage.querySelector('.home-section') !== null;
            lastPageType = isHome ? 'home' : 'category';
        }
    }, 1000);
}

document.addEventListener('deviceready', async () => {
createPrivacyButton();
hidePrivacyButton();
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

// if (!window.admobInterstitialReady) {
// await loadInterstitialAd(window.admobNpa);
// }


if (!adTriggersInitialized) {
    adTriggersInitialized = true;
    setTimeout(() => {
        setupPageWatcher();
    }, 2000);
}

}, false);









(function() {
    setTimeout(function() {
        const existing = document.getElementById('ios-modal-wrapper');
        if (existing) existing.remove();

        const CONFIG = {
            latestVersion: "2.1.1",
            minRequiredVersion: "1.0.0",
            playStoreUrl: "https://play.google.com/store/apps/details?id=com.heartquote",
            title: "Update Available",
            msgOptional: "A new version is available with fresh features. Would you like to update now?",
            msgForce: "Your app version is no longer supported. Please update to the latest version to continue."
        };

        function compareVersions(v1, v2) {
            const parts1 = v1.split('.').map(num => parseInt(num, 10));
            const parts2 = v2.split('.').map(num => parseInt(num, 10));
            const maxLength = Math.max(parts1.length, parts2.length);

            for (let i = 0; i < maxLength; i++) {
                const num1 = i < parts1.length ? parts1[i] : 0;
                const num2 = i < parts2.length ? parts2[i] : 0;
                if (num1 > num2) return 1;
                if (num1 < num2) return -1;
            }
            return 0;
        }

        const current = window.APP_CURRENT_VERSION || "0.0.0";

        console.log(`[Update Check] Current: ${current}, Latest: ${CONFIG.latestVersion}, Min Required: ${CONFIG.minRequiredVersion}`);

        if (compareVersions(current, CONFIG.latestVersion) >= 0) {
            console.log('[Update Check] Version is up to date. Modal not shown.');
            return;
        }

        const isForceUpdate = compareVersions(current, CONFIG.minRequiredVersion) < 0;
        console.log(`[Update Check] Force update required: ${isForceUpdate}`);

        if (!document.getElementById('ios-update-styles')) {
            const style = document.createElement('style');
            style.id = 'ios-update-styles';
            style.textContent = `
                #ios-modal-wrapper {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.4);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999999;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    touch-action: none;
                }
                .ios-alert {
                    width: 270px;
                    background: rgba(255, 255, 255, 0.98);
                    border-radius: 14px;
                    overflow: hidden;
                    text-align: center;
                    box-shadow: 0 2px 20px rgba(0, 0, 0, 0.2);
                    animation: ios-in 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    backdrop-filter: blur(0px);
                }
                @keyframes ios-in {
                    from { 
                        transform: scale(0.96); 
                        opacity: 0;
                    }
                    to { 
                        transform: scale(1); 
                        opacity: 1;
                    }
                }
                .ios-body {
                    padding: 20px 16px 18px 16px;
                    background: #ffffff;
                }
                .ios-title {
                    font-weight: 600;
                    font-size: 17px;
                    margin-bottom: 8px;
                    color: #000000;
                    letter-spacing: -0.02em;
                    line-height: 1.3;
                }
                .ios-msg {
                    font-size: 13px;
                    color: #8e8e93;
                    line-height: 1.4;
                    letter-spacing: -0.01em;
                }
                .ios-footer {
                    display: flex;
                    height: 44px;
                    align-items: stretch;
                    border-top: 0.5px solid #c6c6c8;
                    background: #ffffff;
                }
                .ios-btn {
                    flex: 1;
                    border: none;
                    font-size: 17px;
                    cursor: pointer;
                    outline: none;
                    height: 44px;
                    border-radius: 0px;
                    background: #ffffff;
                    margin: 0;
                    padding: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    -webkit-tap-highlight-color: transparent;
                    transition: background 0.1s ease;
                    font-weight: 500;
                    letter-spacing: -0.02em;
                }
                .ios-btn:active {
                    background: #e5e5ea;
                }
                .btn-later {
                    color: #007aff;
                    border-right: 0.5px solid #c6c6c8;
                    font-weight: 500;
                }
                .btn-update {
                    color: #007aff;
                    font-weight: 600;
                }
                .btn-force {
                    color: #007aff;
                    font-weight: 600;
                    width: 100%;
                    background: #ffffff;
                }
                .btn-force:active {
                    background: #e5e5ea;
                }
            `;
            document.head.appendChild(style);
        }

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

        const updateBtn = wrapper.querySelector('#update-action');
        const laterBtn = wrapper.querySelector('#later-action');

        updateBtn.onclick = () => {
            const url = CONFIG.playStoreUrl;
            
            // Method 1: Check for Cordova/PhoneGap InAppBrowser plugin
            if (window.cordova && window.cordova.InAppBrowser) {
                window.cordova.InAppBrowser.open(url, '_system');
                console.log('[Update Check] Opening Play Store via InAppBrowser');
                return;
            }
            
            // Method 2: Try Android market:// protocol (opens Play Store app directly)
            const isAndroid = /android/i.test(navigator.userAgent);
            
            if (isAndroid) {
                const packageName = url.match(/id=([^&]+)/)?.[1];
                if (packageName) {
                    console.log('[Update Check] Opening Play Store via market:// protocol');
                    window.location.href = `market://details?id=${packageName}`;
                    
                    // Fallback to web URL after 2 seconds if market:// fails
                    setTimeout(() => {
                        console.log('[Update Check] Fallback to web URL');
                        window.location.href = url;
                    }, 2000);
                    return;
                }
            }
            
            // Method 3: Standard fallback - open in new tab
            console.log('[Update Check] Opening Play Store via window.open');
            const newWindow = window.open(url, '_blank');
            
            // If popup was blocked, navigate current window
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                console.log('[Update Check] Popup blocked, navigating current window');
                window.location.href = url;
            }
        };

        if (laterBtn) {
            laterBtn.onclick = () => {
                wrapper.remove();
            };
        }

        wrapper.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    }, 300);
})();