// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyATPfQaQaa6ZXxMHSYVluTwabcvnCdRP4o",
    authDomain: "university-7057b.firebaseapp.com",
    databaseURL: "https://university-7057b-default-rtdb.firebaseio.com",
    projectId: "university-7057b",
    storageBucket: "university-7057b.firebasestorage.app",
    messagingSenderId: "942212283522",
    appId: "1:942212283522:web:6308e7a75d5c2a32bf489b",
    measurementId: "G-HC2812Z29C"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();

// Enable Firestore offline persistence for faster UX
db.enablePersistence({ synchronizeTabs: true })
    .catch((err) => {
        if (err.code === 'failed-precondition') {
            console.warn('Persistence failed: Multiple tabs open');
        } else if (err.code === 'unimplemented') {
            console.warn('Persistence not supported in this browser');
        }
    });



// Make available globally
window.auth = auth;
window.db = db;
window.firebase = firebase;