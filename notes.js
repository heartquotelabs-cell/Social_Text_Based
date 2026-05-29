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
                adUnitId : ADMOB_CONFIG.banner,
                position : 'bottom',
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

async function loadAppOpenAd() {
    if (appOpenAd && isAppOpenAdFresh()) return;
    if (appOpenRetries >= MAX_RETRY_ATTEMPTS) {
        appOpenRetries = 0;
        return;
    }

    try {
        appOpenAd = new admob.AppOpenAd({
            adUnitId : ADMOB_CONFIG.appOpen,
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
            await loadAppOpenAd();
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
            await loadAppOpenAd();
        });

        appOpenAd.on('error', async () => {
            appOpenIsShowing         = false;
            appOpenAd                = null;
            appOpenReady             = false;
            window.admobAppOpenReady = false;
            if (window.admobBanner) await window.admobBanner.show();
            await loadAppOpenAd();
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

document.addEventListener('deviceready', async () => {
    await admob.start();
    await initBanner();
    
    if (!window.admobAppOpenReady) {
        await loadAppOpenAd();
    }
}, false);