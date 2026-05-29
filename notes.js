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
        if (!window.admobBanner) {
            window.admobBanner = new admob.BannerAd({
                adUnitId: ADMOB_CONFIG.banner,
position: 'bottom',
size     : 'BANNER',
});

            window.admobBanner.on('load', () => {
                window.admobBanner.show().catch(e => console.error('[AdMob] Banner show error: ' + e));
            });

            // Listen for load failures
            window.admobBanner.on('loadfail', (error) => {
                console.error('[AdMob] Banner load failed: ' + JSON.stringify(error));
                // Retry after delay
                setTimeout(() => {
                    window.admobBanner.load().catch(e => console.error('[AdMob] Banner retry failed: ' + e));}, RETRY_DELAY_MS);});
await window.admobBanner.load();} else {await window.admobBanner.show();}banner = window.admobBanner;
    } catch(e) {
        console.error('[AdMob] Banner initialization error: ' + e);}}

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
        return;
    }
    if (appOpenRetries >= MAX_RETRY_ATTEMPTS) {
        appOpenRetries = 0;
        return;
    }

    try {
        appOpenAd = new admob.AppOpenAd({
            adUnitId: ADMOB_CONFIG.appOpen,
        });

        appOpenAd.on('load', () => {
            appOpenLoadTime = Date.now();
            appOpenReady = true;
            window.admobAppOpenReady = true;
            appOpenRetries = 0;
        });

        appOpenAd.on('loadfail', (error) => {
            console.error('[AdMob] App Open ad load failed: ' + JSON.stringify(error));
            appOpenAd = null;
            appOpenReady = false;
            window.admobAppOpenReady = false;
            appOpenRetries++;
        });

        await appOpenAd.load();
    } catch(e) {
        console.error('[AdMob] App Open ad error: ' + e);
        appOpenAd = null;
        appOpenReady = false;
        window.admobAppOpenReady = false;
        appOpenRetries++;
    }
}

let appOpenLastShown = 0;

async function showAppOpenAd() {
    if (appOpenIsShowing) {
        return;
    }
    if (!appOpenAd) {
        return;
    }
    if (!appOpenReady) {
        return;
    }
    if (!isAppOpenAdFresh()) {
        await loadAppOpenAd();
        return;
    }
    if ((Date.now() - appOpenLastShown) < APP_OPEN_COOLDOWN_MS) {
        return;
    }

    try {
        appOpenIsShowing = true;

        // Hide banner while showing app open ad
        if (window.admobBanner) {
            await window.admobBanner.hide();
        }

        appOpenAd.on('dismiss', async () => {
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
            console.error('[AdMob] App Open ad show error: ' + JSON.stringify(error));
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
        console.error('[AdMob] App Open ad show error: ' + e);
        appOpenIsShowing = false;
        if (window.admobBanner) {
            await window.admobBanner.show();
        }
    }
}

document.addEventListener('resume', async () => {
    if ((Date.now() - appOpenLastShown) < APP_OPEN_COOLDOWN_MS) {
        return;
    }
    await showAppOpenAd();
}, false);

document.addEventListener('deviceready', async () => {
    try {
        await admob.start();

        await initBanner();

        if (!window.admobAppOpenReady) {
            await loadAppOpenAd();
        }
    } catch(e) {
        console.error('[AdMob] Failed to start AdMob: ' + e);
    }
}, false);