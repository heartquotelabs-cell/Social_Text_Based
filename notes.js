alert('Script loaded');

document.addEventListener('deviceready', () => {
    alert('deviceready fired');
}, false);

document.addEventListener('DOMContentLoaded', () => {
    alert('DOM ready, cordova = ' + (typeof cordova) + ', admob = ' + (typeof admob));
});


const ADMOB_CONFIG = {
    testDevices  : [''],
    banner       : 'ca-app-pub-3940256099942544/6300978111',
    appOpen      : 'ca-app-pub-3940256099942544/9257395921',
};

const APP_OPEN_EXPIRY_MS = 4 * 60 * 60 * 1000;
const APP_OPEN_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_RETRY_ATTEMPTS  = 3;
const RETRY_DELAY_MS   = 5 * 1000;

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let banner;

async function initBanner() {
    try {
        alert('[AdMob] Initializing banner...');
        
        if (!window.admobBanner) {
            window.admobBanner = new admob.BannerAd({
                adUnitId: ADMOB_CONFIG.banner,
                position: 'bottom',
            });

            // Listen for load success
            window.admobBanner.on('load', () => {
                alert('[AdMob] Banner loaded successfully');
                window.admobBanner.show().then(() => {
                    alert('[AdMob] Banner shown');
                }).catch(e => alert('[AdMob] Banner show error: ' + e));
            });

            // Listen for load failures
            window.admobBanner.on('loadfail', (error) => {
                alert('[AdMob] Banner load failed: ' + JSON.stringify(error));
                // Retry after delay
                setTimeout(() => {
                    window.admobBanner.load().catch(e => alert('[AdMob] Banner retry failed: ' + e));
                }, RETRY_DELAY_MS);
            });

            // Start loading the banner
            await window.admobBanner.load();
            alert('[AdMob] Banner load initiated');
        } else {
            await window.admobBanner.show();
            alert('[AdMob] Banner shown (existing)');
        }

        banner = window.admobBanner;
    } catch(e) {
        alert('[AdMob] Banner initialization error: ' + e);
    }
}

let appOpenAd        = null;
let appOpenLoadTime  = null;
let appOpenIsShowing = false;
let appOpenReady     = false;
let appOpenRetries   = 0;

function isAppOpenAdFresh() {
    if (!appOpenLoadTime) return false;
    return (Date.now() - appOpenLoadTime) < APP_OPEN_EXPIRY_MS;
}

async function loadAppOpenAd() {
    if (appOpenAd && isAppOpenAdFresh()) {
        alert('[AdMob] App Open ad already loaded and fresh');
        return;
    }
    if (appOpenRetries >= MAX_RETRY_ATTEMPTS) {
        alert('[AdMob] App Open ad max retries reached');
        appOpenRetries = 0;
        return;
    }

    try {
        alert('[AdMob] Loading App Open ad...');
        appOpenAd = new admob.AppOpenAd({
            adUnitId: ADMOB_CONFIG.appOpen,
        });

        appOpenAd.on('load', () => {
            alert('[AdMob] App Open ad loaded successfully');
            appOpenLoadTime = Date.now();
            appOpenReady = true;
            window.admobAppOpenReady = true;
            appOpenRetries = 0;
        });

        appOpenAd.on('loadfail', (error) => {
            alert('[AdMob] App Open ad load failed: ' + JSON.stringify(error));
            appOpenAd = null;
            appOpenReady = false;
            window.admobAppOpenReady = false;
            appOpenRetries++;
        });

        await appOpenAd.load();
    } catch(e) {
        alert('[AdMob] App Open ad error: ' + e);
        appOpenAd = null;
        appOpenReady = false;
        window.admobAppOpenReady = false;
        appOpenRetries++;
    }
}

let appOpenLastShown = 0;

async function showAppOpenAd() {
    if (appOpenIsShowing) {
        alert('[AdMob] App Open ad already showing');
        return;
    }
    if (!appOpenAd) {
        alert('[AdMob] No App Open ad object');
        return;
    }
    if (!appOpenReady) {
        alert('[AdMob] App Open ad not ready');
        return;
    }
    if (!isAppOpenAdFresh()) {
        alert('[AdMob] App Open ad expired');
        await loadAppOpenAd();
        return;
    }
    if ((Date.now() - appOpenLastShown) < APP_OPEN_COOLDOWN_MS) {
        alert('[AdMob] App Open ad cooldown active');
        return;
    }

    try {
        alert('[AdMob] Showing App Open ad...');
        appOpenIsShowing = true;

        // Hide banner while showing app open ad
        if (window.admobBanner) {
            await window.admobBanner.hide();
        }
        
        appOpenAd.on('dismiss', async () => {
            alert('[AdMob] App Open ad dismissed');
            appOpenIsShowing = false;
            appOpenLastShown = Date.now();
            appOpenAd = null;
            appOpenReady = false;
            window.admobAppOpenReady = false;
            
            // Reshow banner
            if (window.admobBanner) {
                await window.admobBanner.show();
            }
            
            // Load next ad
            await loadAppOpenAd();
        });

        appOpenAd.on('error', async (error) => {
            alert('[AdMob] App Open ad show error: ' + JSON.stringify(error));
            appOpenIsShowing = false;
            appOpenAd = null;
            appOpenReady = false;
            window.admobAppOpenReady = false;
            
            if (window.admobBanner) {
                await window.admobBanner.show();
            }
        });

        await appOpenAd.show();
    } catch(e) {
        alert('[AdMob] App Open ad show error: ' + e);
        appOpenIsShowing = false;
        if (window.admobBanner) {
            await window.admobBanner.show();
        }
    }
}

document.addEventListener('resume', async () => {
    alert('[AdMob] App resumed, checking for App Open ad');
    if ((Date.now() - appOpenLastShown) < APP_OPEN_COOLDOWN_MS) {
        alert('[AdMob] App Open ad cooldown active on resume');
        return;
    }
    await showAppOpenAd();
}, false);

document.addEventListener('deviceready', async () => {
    alert('[AdMob] Device ready, starting AdMob...');
    
    try {
        await admob.start();
        alert('[AdMob] AdMob started successfully');
        
        await initBanner();
        
        if (!window.admobAppOpenReady) {
            await loadAppOpenAd();
        }
    } catch(e) {
        alert('[AdMob] Failed to start AdMob: ' + e);
    }
}, false);