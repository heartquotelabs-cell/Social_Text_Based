window.currentViewingUserId = null;
let currentUser = null;
let currentPage = null;
let postsListener = null;
let commentsListener = null;
let authListener = null;
let currentPostId = null;
let messagesListener = null;
let currentConversationId = null;
let messagingUserCache = new Map();
// Add these variables with other global variables
let notificationsListener = null;
let unreadNotificationsCount = 0;
const notificationCache = new Map();

// Add notification types
// Add this near the top with other global variables (around line 10-15)
const NOTIFICATION_TYPES = {
    LIKE: 'like',
    COMMENT: 'comment', 
    FOLLOW: 'follow',
    MENTION: 'mention',
    REPLY: 'reply'
};
// ===== ENHANCED FEED FEATURES =====
let seenPosts = new Set();
let lastFeedRefresh = 0;
const FEED_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes
let newPostsAvailable = false;
let newPostsCount = 0;

// ===== CACHE MANAGEMENT =====
const cache = {
    users: new Map(),
    posts: {
        data: [],
        lastUpdated: 0,
        ttl: 5 * 60 * 1000
    },
    comments: new Map(),
    
    persistCache() {
        const cacheData = {
            users: Array.from(this.users.entries()),
            posts: this.posts,
            timestamp: Date.now()
        };
        try {
            localStorage.setItem('app_cache', JSON.stringify(cacheData));
        } catch (e) {
            console.warn('Could not save cache to localStorage:', e);
        }
    },
    
    loadCache() {
        try {
            const cached = localStorage.getItem('app_cache');
            if (cached) {
                const cacheData = JSON.parse(cached);
                this.users = new Map(cacheData.users || []);
                this.posts = cacheData.posts || { data: [], lastUpdated: 0, ttl: 5 * 60 * 1000 };
                
                if (Date.now() - this.posts.lastUpdated > this.posts.ttl) {
                    this.posts.data = [];
                    this.posts.lastUpdated = 0;
                }
            }
        } catch (e) {
            console.warn('Could not load cache from localStorage:', e);
        }
    },
    
    clearCache(type) {
        switch(type) {
            case 'users':
                this.users.clear();
                break;
            case 'posts':
                this.posts.data = [];
                this.posts.lastUpdated = 0;
                break;
            case 'comments':
                this.comments.clear();
                break;
            case 'all':
                this.users.clear();
                this.posts.data = [];
                this.posts.lastUpdated = 0;
                this.comments.clear();
                localStorage.removeItem('app_cache');
                break;
        }
        this.persistCache();
    }
};

// Initialize cache
cache.loadCache();


// Add this near the top with other cache variables
const performance = {
    startTime: Date.now(),
    queryCount: 0,
    cacheHits: 0,
    
    logQuery(type) {
        this.queryCount++;
        console.log(`⚡ Query #${this.queryCount}: ${type}`);
    },
    
    logCacheHit() {
        this.cacheHits++;
    },
    
    showStats() {
        const elapsed = (Date.now() - this.startTime) / 1000;
        console.log(`📊 Performance Stats:`);
        console.log(`⏱️  Time elapsed: ${elapsed.toFixed(2)}s`);
        console.log(`📈 Queries: ${this.queryCount}`);
        console.log(`💾 Cache hits: ${this.cacheHits}`);
        console.log(`🎯 Cache hit rate: ${((this.cacheHits / this.queryCount) * 100).toFixed(1)}%`);
    }
};

// Wrap your Firestore queries with logging
// Example in getPostsFromUsers:
performance.logQuery('getPostsFromUsers');
// ===== INITIALIZE APP =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('SPA App Initializing...');
    updateBodyBackground();
    setupAuthListener();
    migrateExistingUsers();
    window.addEventListener('popstate', handleNavigation);
});

// User presence tracking
let presenceRef = null;

function setupPresence() {
    if (!currentUser) return;
    
    const userId = currentUser.uid;
    const userStatusRef = firebase.database().ref(`/status/${userId}`);
    
    // Create presence entry
    presenceRef = firebase.database().ref('.info/connected');
    
    presenceRef.on('value', (snapshot) => {
        if (snapshot.val()) {
            // User is online
            userStatusRef.set({
                state: 'online',
                lastChanged: firebase.database.ServerValue.TIMESTAMP
            });
            
            // Set offline on disconnect
            userStatusRef.onDisconnect().set({
                state: 'offline',
                lastChanged: firebase.database.ServerValue.TIMESTAMP
            });
        }
    });
}

function cleanupPresence() {
    if (presenceRef) {
        presenceRef.off();
        presenceRef = null;
    }
}


// ===== NOTIFICATION FUNCTIONS =====
async function createNotification(targetUserId, type, data) {
    try {
        // Don't create notifications for yourself
        if (targetUserId === currentUser?.uid) {
            console.log('Skipping notification: target is current user');
            return;
        }
      
        // Validate input
        if (!targetUserId || !type) {
            console.error('Missing required fields for notification');
            return;
        }
        
        console.log(`Creating ${type} notification for user ${targetUserId}`);
        
        // Prepare notification data
        const notificationData = {
            type: type,
            fromUserId: currentUser.uid,
            fromUserName: currentUser.displayName || 'User',
            targetUserId: targetUserId,
            data: data || {},
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Add to Firestore
        await firebase.firestore().collection('notifications').add(notificationData);
        
        console.log(`Notification created successfully for ${targetUserId}`);
        
        // Update notification count for the user
        updateNotificationCounts();
        
    } catch (error) {
        console.error('Error creating notification:', error);
    }
}

async function updateNotificationCounts() {
    if (!currentUser) return;
    
    try {
        // Use .get() instead of .count() and count manually
        const snapshot = await firebase.firestore().collection('notifications')
            .where('targetUserId', '==', currentUser.uid)
            .where('read', '==', false)
            .get();
        
        unreadNotificationsCount = snapshot.size || 0;
        updateNotificationBadge();
        
    } catch (error) {
        console.error('Error updating notification count:', error);
    }
}
function updateNotificationBadge() {
    const badges = [
        document.getElementById('notificationBadge'),
        document.getElementById('notificationBadgeBottom')
    ].filter(b => b);
    
    badges.forEach(badge => {
        if (unreadNotificationsCount > 0) {
            badge.textContent = unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount;
            badge.style.display = 'inline-block';
            
            // Style the badge
            badge.style.cssText = `
                position: absolute;
                top: -8px;
                right: 5px;
                background: #ff4757;
                color: white;
                font-size: 10px;
                font-weight: bold;
                min-width: 18px;
                height: 18px;
                border-radius: 9px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 4px;
                border: 2px solid white;
                z-index: 100;
            `;
        } else {
            badge.style.display = 'none';
        }
    });
}

async function markNotificationAsRead(notificationId) {
    if (!notificationId) return;
    
    try {
        const notificationRef = firebase.firestore().collection('notifications').doc(notificationId);
        const notificationDoc = await notificationRef.get();
        
        if (!notificationDoc.exists) {
            console.log('Notification already deleted:', notificationId);
            // Update UI anyway
            const notificationElement = document.querySelector(`.notification-item[data-notification-id="${notificationId}"]`);
            if (notificationElement) {
                notificationElement.classList.remove('unread');
                notificationElement.classList.add('read');
                
                // Remove mark as read button
                const markReadBtn = notificationElement.querySelector('.mark-read-btn');
                if (markReadBtn) {
                    markReadBtn.remove();
                }
            }
            return;
        }
        
        const notificationData = notificationDoc.data(); // 这行已经正确定义了变量名
        
        // Only update if not already read - 这里应该使用 notificationData，不是 notification
        if (!notificationData.read) {
            await notificationRef.update({
                read: true,
                readAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Update user's unread count
            await firebase.firestore().collection('users').doc(currentUser.uid).update({
                unreadNotifications: firebase.firestore.FieldValue.increment(-1)
            });
        }
        
        // Update UI
        const notificationElement = document.querySelector(`.notification-item[data-notification-id="${notificationId}"]`);
        if (notificationElement) {
            notificationElement.classList.remove('unread');
            notificationElement.classList.add('read');
            
            // Remove mark as read button
            const markReadBtn = notificationElement.querySelector('.mark-read-btn');
            if (markReadBtn) {
                markReadBtn.remove();
            }
        }
        
        // Update count
        unreadNotificationsCount = Math.max(0, unreadNotificationsCount - 1);
        updateNotificationBadge();
        
    } catch (error) {
        console.error('Error marking notification as read:', error);
        
        // Still update UI on error
        const notificationElement = document.querySelector(`.notification-item[data-notification-id="${notificationId}"]`);
        if (notificationElement) {
            notificationElement.classList.remove('unread');
            notificationElement.classList.add('read');
            
            const markReadBtn = notificationElement.querySelector('.mark-read-btn');
            if (markReadBtn) {
                markReadBtn.remove();
            }
        }
    }
}

async function markAllNotificationsAsRead() {
    try {
        const snapshot = await firebase.firestore().collection('notifications')
            .where('targetUserId', '==', currentUser.uid)
            .where('read', '==', false)
            .get();
        
        const batch = firebase.firestore().batch();
        
        snapshot.forEach(doc => {
            batch.update(doc.ref, { read: true });
        });
        
        await batch.commit();
        
        // Reset unread count
        await firebase.firestore().collection('users').doc(currentUser.uid).update({
            unreadNotifications: 0
        });
        
        unreadNotificationsCount = 0;
        updateNotificationBadge();
        showToast('All notifications marked as read', 'success');
        
        // Refresh notifications if on notifications page
        if (currentPage === 'notifications') {
            loadNotifications();
        }
        
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        showToast('Failed to mark all as read', 'error');
    }
}
// Call setupPresence() when user logs in
// Call cleanupPresence() when user logs out

let userPreferences = {
    hiddenUsers: new Set(),
    hiddenTopics: new Set(),
    likedTopics: new Set()
};

function trackUserFeedback(postId, action, post = null) {
    // action: 'like', 'comment', 'share', 'hide', 'scroll_past'
    
    if (action === 'hide' && post && post.userId) {
        userPreferences.hiddenUsers.add(post.userId);
        // Don't show this user's posts for 7 days
        localStorage.setItem(`hidden_user_${post.userId}`, Date.now() + 7*24*60*60*1000);
    }
    
    // Update feed weights based on feedback
    if (post) {
        updateFeedWeights(action, post);
    }
}
function updateFeedWeights(action, post) {
    // Implement your feed weight update logic here
    console.log(`Updating feed weights for ${action} on post ${post.id}`);
    
    // Example: Update user preferences based on interactions
    switch(action) {
        case 'like':
            userPreferences.likedTopics.add(getMainTopicFromPost(post));
            break;
        case 'hide':
            userPreferences.hiddenTopics.add(getMainTopicFromPost(post));
            break;
    }
}
function shouldShowPost(post) {
    // Check if user has hidden this user
    const hiddenUntil = localStorage.getItem(`hidden_user_${post.userId}`);
    if (hiddenUntil && Date.now() < hiddenUntil) {
        return false;
    }
    
    // Check if post contains hidden topics
    const content = post.content.toLowerCase();
    for (const topic of userPreferences.hiddenTopics) {
        if (content.includes(topic)) return false;
    }
    
    return true;
}


// Simple analytics
const analytics = {
    trackEvent(eventName, data = {}) {
        const event = {
            event: eventName,
            userId: currentUser?.uid || 'anonymous',
            timestamp: Date.now(),
            ...data
        };
        
        // Store in Firestore
        if (currentUser) {
            firebase.firestore().collection('analytics').add({
                ...event,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {/* Silently fail */});
        }
        
        // Also log to console in development
        if (window.location.hostname === 'localhost') {
            console.log(`📊 Event: ${eventName}`, data);
        }
    },
    
    trackPageView(page) {
        this.trackEvent('page_view', { page });
    },
    
    trackPostAction(action, postId) {
        this.trackEvent('post_action', { action, postId });
    },
    
    trackFollow(action, targetUserId) {
        this.trackEvent('follow', { action, targetUserId });
    }
};

// Use in your functions:
// analytics.trackPageView('feed');
// analytics.trackPostAction('like', postId);
// analytics.trackFollow('follow', userId);
// ===== NEW POSTS TOAST SYSTEM =====
function showNewPostsToast(count) {
    // Remove existing toast if any
    const existingToast = document.getElementById('newPostsToast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.id = 'newPostsToast';
    toast.className = 'new-posts-toast';
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas fa-arrow-up"></i>
            <span>${count} new post${count > 1 ? 's' : ''}</span>
            <button onclick="scrollToTopAndRefresh()" class="toast-action-btn">
                View now
            </button>
            <button onclick="dismissNewPostsToast()" class="toast-dismiss-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
        if (toast.parentNode && !toast.classList.contains('clicked')) {
            dismissNewPostsToast();
        }
    }, 10000);
}

function dismissNewPostsToast() {
    const toast = document.getElementById('newPostsToast');
    if (toast) {
        toast.classList.add('hiding');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
        newPostsAvailable = false;
        newPostsCount = 0;
    }
}

function scrollToTopAndRefresh() {
    const toast = document.getElementById('newPostsToast');
    if (toast) {
        toast.classList.add('clicked');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Refresh feed with latest posts
    if (currentPage === 'feed') {
        loadPosts(true); // Force refresh
    }
    
    newPostsAvailable = false;
    newPostsCount = 0;
}

// ===== SEEN POSTS TRACKING =====
function trackPostSeen(postId) {
    if (!seenPosts.has(postId)) {
        seenPosts.add(postId);
        const seen = JSON.parse(localStorage.getItem('seenPosts') || '[]');
        seen.push({ id: postId, timestamp: Date.now() });
        localStorage.setItem('seenPosts', JSON.stringify(seen.slice(-100)));
        updateSeenCounter();
    }
}

function setupPostVisibilityTracker() {
    if (window.postObserver) {
        window.postObserver.disconnect();
    }
    
    window.postObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const postId = entry.target.getAttribute('data-post-id');
                if (postId) {
                    trackPostSeen(postId);
                    if (!entry.target.classList.contains('viewed')) {
                        entry.target.classList.add('viewed');
                        setTimeout(() => {
                            entry.target.classList.add('fully-viewed');
                        }, 1000);
                    }
                }
            }
        });
    }, { threshold: 0.5, rootMargin: '0px 0px -100px 0px' });
    
    document.querySelectorAll('.post').forEach(post => {
        window.postObserver.observe(post);
    });
}

function updateSeenCounter() {
    const seenCounter = document.getElementById('seenCounter');
    const seenCount = document.getElementById('seenCount');
    if (seenCounter && seenCount) {
        const count = seenPosts.size;
        if (count > 0) {
            seenCount.textContent = count;
            seenCounter.style.display = 'block';
        } else {
            seenCounter.style.display = 'none';
        }
    }
}

// ===== ENHANCED FEED ALGORITHM =====
// Add these variables to your existing ones
let lastVisiblePost = null;
const POSTS_PER_PAGE = 5;
let isLoadingMore = false;

// ===== ENHANCED FEED WITH UNSEEN POSTS =====
let lastFeedUpdateTime = Date.now();

async function loadPosts(forceRefresh = false) {
    console.log("🔍 DEBUG: loadPosts() called - focusing on unseen posts");
    
    await waitForElement('#postsContainer');
    const postsContainer = document.getElementById('postsContainer');
    if (!postsContainer || !currentUser) return;
    
    // Clean up
    cleanupFeedListeners();
    
    // If force refresh, clear everything
    if (forceRefresh) {
        postsContainer.innerHTML = '';
        lastVisiblePost = null;
        localStorage.removeItem('lastKnownPostTime');
        newPostsAvailable = false;
        newPostsCount = 0;
        hideNewPostsButton();
        
        postsContainer.innerHTML = '<div class="loading">🔄 Refreshing your feed...</div>';
    } else if (!lastVisiblePost) {
        showSkeletonPosts(3);
    }
    
    try {
        // 1. Get user data
        const userDoc = await firebase.firestore().collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data();
        const following = userData?.following || [];
        
        console.log(`👤 User follows ${following.length} users, has seen ${seenPosts.size} posts`);
        
        let posts = [];
        
        // 2. STRATEGY BASED ON USER TYPE
        if (following.length === 0) {
            // NEW USER: Recommend posts from active users
            console.log("🎯 New user - recommending from active users");
            posts = await getPostsFromActiveUsers(15);
        } else if (following.length < 5) {
            // LIGHT USER: Mix of following + active users
            console.log("🎯 Light user - mixed feed");
            posts = await getMixedFeedWithUnseen(following, 15);
        } else {
            // ACTIVE USER: From followed users, excluding seen
            console.log("🎯 Active user - following feed");
            posts = await getUnseenPostsFromFollowing(following, 20);
        }
        
        // 3. FILTER OUT ALREADY SEEN POSTS
        const unseenPosts = posts.filter(post => !seenPosts.has(post.id));
        
        if (unseenPosts.length === 0) {
            console.log("📭 No unseen posts found");
            
            if (forceRefresh || !lastVisiblePost) {
                // Show suggestions to follow more people
                showNoNewPostsMessage();
                return;
            } else {
                // Try to get older posts
                const olderPosts = await getOlderPosts(following);
                const unseenOlder = olderPosts.filter(post => !seenPosts.has(post.id));
                
                if (unseenOlder.length > 0) {
                    posts = unseenOlder;
                } else {
                    if (forceRefresh || !lastVisiblePost) {
                        showNoNewPostsMessage();
                        return;
                    }
                    // No posts at all
                    return;
                }
            }
        } else {
            posts = unseenPosts;
        }
        
        console.log(`🎯 Found ${posts.length} unseen posts`);
        
        // 4. SORT BY RELEVANCE (newest + engagement)
        const sortedPosts = sortUnseenPosts(posts, following);
        
        // 5. Update lastVisiblePost for pagination
        if (sortedPosts.length > 0 && !forceRefresh) {
            lastVisiblePost = { id: sortedPosts[sortedPosts.length - 1].id };
        }
        
        // 6. RENDER
        if (forceRefresh || !lastVisiblePost) {
            postsContainer.innerHTML = '';
        }
        
        renderPostsBatch(sortedPosts.slice(0, POSTS_PER_PAGE), forceRefresh || !lastVisiblePost);
        
        // 7. Setup tracking
        if (!lastVisiblePost || forceRefresh) {
            setupSimpleVisibilityTracker();
            setupSimpleInfiniteScroll();
        }
        
        // 8. Setup periodic check for new posts
        setupPeriodicNewPostsCheck(following);
        
        // 9. Update last feed update time
        lastFeedUpdateTime = Date.now();
        localStorage.setItem('lastFeedUpdate', lastFeedUpdateTime);
        
    } catch (error) {
        console.error("❌ ERROR in loadPosts:", error);
        handleFeedError(error, postsContainer);
    }
}

// ===== CORE FUNCTIONS =====

// 1. For NEW USERS: Get posts from recently active users
async function getPostsFromActiveUsers(limit = 15) {
    try {
        // Get recently active users (last 7 days)
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        const activeUsersSnapshot = await firebase.firestore().collection('users')
            .where('lastSeen', '>=', weekAgo)
            .orderBy('lastSeen', 'desc')
            .limit(20)
            .get();
        
        if (activeUsersSnapshot.empty) {
            return getRecentPosts(limit);
        }
        
        const activeUserIds = [];
        activeUsersSnapshot.forEach(doc => {
            if (doc.id !== currentUser.uid) {
                activeUserIds.push(doc.id);
            }
        });
        
        if (activeUserIds.length === 0) {
            return getRecentPosts(limit);
        }
        
        // Get posts from active users (limit to 10 users for 'in' query)
        const usersToQuery = activeUserIds.slice(0, 10);
        const query = firebase.firestore().collection('posts')
            .where('userId', 'in', usersToQuery)
            .orderBy('createdAt', 'desc')
            .limit(limit * 2); // Get more to filter client-side
        
        const snapshot = await query.get();
        
        const posts = [];
        snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));
        
        // If not enough posts, get recent posts as fallback
        if (posts.length < limit / 2) {
            const recentPosts = await getRecentPosts(limit);
            return [...posts, ...recentPosts].slice(0, limit);
        }
        
        return posts.slice(0, limit);
        
    } catch (error) {
        console.error("Error getting active users posts:", error);
        return getRecentPosts(limit);
    }
}

// 2. For LIGHT USERS: Mix of following + active users
async function getMixedFeedWithUnseen(following, limit = 15) {
    try {
        const [followingPosts, activePosts] = await Promise.all([
            getUnseenPostsFromFollowing(following, Math.floor(limit * 0.6)),
            getPostsFromActiveUsers(Math.floor(limit * 0.4))
        ]);
        
        // Combine and remove duplicates
        const allPosts = [...followingPosts, ...activePosts];
        const uniquePosts = removeDuplicatePosts(allPosts);
        
        // Filter out seen posts
        const unseenPosts = uniquePosts.filter(post => !seenPosts.has(post.id));
        
        // If not enough unseen posts, get more
        if (unseenPosts.length < limit / 2) {
            const recentPosts = await getRecentPosts(limit);
            const recentUnseen = recentPosts.filter(post => !seenPosts.has(post.id));
            return [...unseenPosts, ...recentUnseen].slice(0, limit);
        }
        
        return unseenPosts.slice(0, limit);
        
    } catch (error) {
        console.error("Error getting mixed feed:", error);
        return getRecentPosts(limit);
    }
}

// 3. For ACTIVE USERS: Get unseen posts from followed users
async function getUnseenPostsFromFollowing(following, limit = 20) {
    try {
        if (!following || following.length === 0) {
            return getPostsFromActiveUsers(limit);
        }
        
        // Get posts from followed users (including self)
        const usersToQuery = [...following, currentUser.uid].slice(0, 10);
        const query = firebase.firestore().collection('posts')
            .where('userId', 'in', usersToQuery)
            .orderBy('createdAt', 'desc')
            .limit(limit * 2); // Get more to filter unseen
        
        const snapshot = await query.get();
        
        const allPosts = [];
        snapshot.forEach(doc => allPosts.push({ id: doc.id, ...doc.data() }));
        
        // Filter out seen posts
        const unseenPosts = allPosts.filter(post => !seenPosts.has(post.id));
        
        console.log(`📊 From ${allPosts.length} posts, ${unseenPosts.length} are unseen`);
        
        // If all posts are seen, try getting older posts
        if (unseenPosts.length === 0) {
            return await getOlderPostsFromFollowing(following, limit);
        }
        
        return unseenPosts.slice(0, limit);
        
    } catch (error) {
        console.error("Error getting unseen posts from following:", error);
        return getRecentPosts(limit);
    }
}

// 4. Get older posts when all new ones are seen
async function getOlderPostsFromFollowing(following, limit = 10) {
    try {
        // Get posts older than last seen
        const lastSeenPostTime = getLastSeenPostTime();
        
        let query = firebase.firestore().collection('posts')
            .orderBy('createdAt', 'desc')
            .limit(limit * 3);
        
        if (lastSeenPostTime) {
            query = query.where('createdAt', '<', lastSeenPostTime);
        }
        
        const snapshot = await query.get();
        
        const allPosts = [];
        snapshot.forEach(doc => allPosts.push({ id: doc.id, ...doc.data() }));
        
        // Filter by following and unseen
        const filteredPosts = allPosts.filter(post => 
            (following.includes(post.userId) || post.userId === currentUser.uid) &&
            !seenPosts.has(post.id)
        );
        
        return filteredPosts.slice(0, limit);
        
    } catch (error) {
        console.error("Error getting older posts:", error);
        return [];
    }
}

// 5. Sort unseen posts by relevance
function sortUnseenPosts(posts, following) {
    return posts.sort((a, b) => {
        // Priority 1: User's own posts (highest)
        if (a.userId === currentUser.uid && b.userId !== currentUser.uid) return -1;
        if (b.userId === currentUser.uid && a.userId !== currentUser.uid) return 1;
        
        // Priority 2: From followed users
        const aIsFollowing = following.includes(a.userId);
        const bIsFollowing = following.includes(b.userId);
        if (aIsFollowing && !bIsFollowing) return -1;
        if (!aIsFollowing && bIsFollowing) return 1;
        
        // Priority 3: Engagement score
        const aScore = calculateEngagementScore(a);
        const bScore = calculateEngagementScore(b);
        if (Math.abs(aScore - bScore) > 10) {
            return bScore - aScore;
        }
        
        // Priority 4: Most recent
        const aTime = a.createdAt?.toDate() || new Date(0);
        const bTime = b.createdAt?.toDate() || new Date(0);
        return bTime - aTime;
    });
}

// 6. Calculate simple engagement score
function calculateEngagementScore(post) {
    const likes = post.likes?.length || 0;
    const comments = post.commentsCount || 0;
    const postTime = post.createdAt?.toDate() || new Date();
    const hoursOld = Math.max(1, (Date.now() - postTime) / (1000 * 60 * 60));
    
    // Engagement per hour
    return (likes + comments * 2) / hoursOld;
}

// 7. Get last seen post time
function getLastSeenPostTime() {
    // Get timestamp of oldest seen post
    if (seenPosts.size === 0) return null;
    
    // Store last seen time in localStorage
    const lastSeenTime = localStorage.getItem('lastSeenPostTime');
    if (lastSeenTime) {
        return new Date(parseInt(lastSeenTime));
    }
    
    // Default to 24 hours ago
    return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

// 8. Show no new posts message
function showNoNewPostsMessage() {
    const postsContainer = document.getElementById('postsContainer');
    if (!postsContainer) return;
    
    const userDoc = firebase.firestore().collection('users').doc(currentUser.uid);
    
    userDoc.get().then(doc => {
        const following = doc.data()?.following || [];
        
        if (following.length === 0) {
            postsContainer.innerHTML = `
                <div class="empty-feed" style="text-align: center; padding: 40px 20px;">
                    <i class="fas fa-users fa-3x" style="color: #667eea; margin-bottom: 20px;"></i>
                    <h3>Welcome! 👋</h3>
                    <p style="margin: 15px 0 25px; color: #666; max-width: 400px; margin-left: auto; margin-right: auto;">
                        Follow some users to see their posts, or create your own first post!
                    </p>
                    <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                        <button onclick="showDiscoverPage()" class="btn-primary" style="background: #764ba2;">
                            <i class="fas fa-compass"></i> Discover Users
                        </button>
                        <button onclick="document.getElementById('postContent').focus()" class="btn-primary">
                            <i class="fas fa-pen"></i> Create First Post
                        </button>
                    </div>
                </div>
            `;
        } else {
            postsContainer.innerHTML = `
                <div class="empty-feed" style="text-align: center; padding: 40px 20px;">
                    <i class="fas fa-check-circle fa-3x" style="color: #4CAF50; margin-bottom: 20px;"></i>
                    <h3>You're all caught up! 🎉</h3>
                    <p style="margin: 15px 0 25px; color: #666; max-width: 400px; margin-left: auto; margin-right: auto;">
                        You've seen all new posts from people you follow. Check back later or follow more users!
                    </p>
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button onclick="showDiscoverPage()" class="btn-primary">
                            <i class="fas fa-user-plus"></i> Find More Users
                        </button>
                        <button onclick="loadPosts(true)" class="btn-primary" style="background: #667eea;">
                            <i class="fas fa-redo"></i> Refresh Feed
                        </button>
                    </div>
                </div>
            `;
        }
    });
}

// 9. Error handler
function handleFeedError(error, postsContainer) {
    console.error("Feed error:", error);
    
    if (postsContainer) {
        postsContainer.innerHTML = `
            <div class="error-feed" style="text-align: center; padding: 40px 20px;">
                <i class="fas fa-exclamation-triangle fa-3x" style="color: #ff9800; margin-bottom: 20px;"></i>
                <h3>Oops! Something went wrong</h3>
                <p style="margin: 15px 0 25px; color: #666;">
                    We couldn't load your feed. Please try again.
                </p>
                <button onclick="loadPosts(true)" class="btn-primary">
                    <i class="fas fa-redo"></i> Try Again
                </button>
            </div>
        `;
    }
}

// 10. Track when user has seen all posts
function markFeedAsSeen() {
    // Called when user reaches bottom of feed
    const lastSeenTime = Date.now();
    localStorage.setItem('lastFeedSeenTime', lastSeenTime);
    
    // Also mark all currently visible posts as seen
    document.querySelectorAll('.post[data-post-id]').forEach(post => {
        const postId = post.getAttribute('data-post-id');
        if (postId && !seenPosts.has(postId)) {
            seenPosts.add(postId);
        }
    });
    
    updateSeenCounter();
}

// 11. Reset seen posts periodically (after 24 hours)
function resetSeenPostsIfNeeded() {
    const lastReset = localStorage.getItem('lastSeenReset') || 0;
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    if (now - lastReset > oneDay) {
        console.log("🔄 Resetting seen posts (24h passed)");
        seenPosts.clear();
        localStorage.setItem('seenPosts', '[]');
        localStorage.setItem('lastSeenReset', now);
        updateSeenCounter();
    }
}

// 12. Load more posts (infinite scroll)
async function loadMorePosts() {
    if (isLoadingMore) return;
    isLoadingMore = true;
    
    try {
        const userDoc = await firebase.firestore().collection('users').doc(currentUser.uid).get();
        const following = userDoc.data()?.following || [];
        
        // Get older posts
        const olderPosts = await getOlderPostsFromFollowing(following, POSTS_PER_PAGE);
        const unseenOlder = olderPosts.filter(post => !seenPosts.has(post.id));
        
        if (unseenOlder.length > 0) {
            const sortedPosts = sortUnseenPosts(unseenOlder, following);
            renderPostsBatch(sortedPosts, false);
            
            // Update lastVisiblePost
            if (sortedPosts.length > 0) {
                lastVisiblePost = { id: sortedPosts[sortedPosts.length - 1].id };
            }
        } else {
            // No more unseen posts
            showNoMorePostsMessage();
        }
    } catch (error) {
        console.error("Error loading more posts:", error);
    } finally {
        isLoadingMore = false;
    }
}

function showNoMorePostsMessage() {
    const sentinel = document.getElementById('loadMoreSentinel');
    if (sentinel) {
        sentinel.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">No more posts to show</div>';
    }
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    // Load seen posts from localStorage
    const savedSeen = localStorage.getItem('seenPosts');
    if (savedSeen) {
        try {
            const seenArray = JSON.parse(savedSeen);
            // Only keep recent ones (last 1000 posts)
            seenArray.slice(-1000).forEach(item => {
                if (item && item.id) {
                    seenPosts.add(item.id);
                }
            });
        } catch (e) {
            console.warn("Could not load seen posts:", e);
        }
    }
    
    // Check if we need to reset seen posts
    resetSeenPostsIfNeeded();
    
    console.log(`📊 Loaded ${seenPosts.size} seen posts from storage`);
});

// ===== MISSING FUNCTIONS NEEDED =====

function setupSimpleVisibilityTracker() {
    // Clean up existing observer
    if (window.postObserver) {
        window.postObserver.disconnect();
        window.postObserver = null;
    }
    
    // Create a simple Intersection Observer to track seen posts
    window.postObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const postId = entry.target.getAttribute('data-post-id');
                if (postId && !seenPosts.has(postId)) {
                    // Mark post as seen
                    seenPosts.add(postId);
                    
                    // Save to localStorage (keep last 1000)
                    const seenArray = Array.from(seenPosts);
                    localStorage.setItem('seenPosts', JSON.stringify(
                        seenArray.slice(-1000).map(id => ({ id, timestamp: Date.now() }))
                    ));
                    
                    // Update counter
                    updateSeenCounter();
                    
                    // Visual feedback (optional)
                    if (!entry.target.classList.contains('viewed')) {
                        entry.target.classList.add('viewed');
                    }
                }
            }
        });
    }, {
        threshold: 0.3, // 30% of post visible
        rootMargin: '0px 0px -50px 0px' // Ignore bottom 50px
    });
    
    // Observe all current posts
    document.querySelectorAll('.post[data-post-id]').forEach(post => {
        window.postObserver.observe(post);
    });
    
    console.log("👀 Visibility tracker setup for", document.querySelectorAll('.post').length, "posts");
}

function setupSimpleInfiniteScroll() {
    const sentinel = document.createElement('div');
    sentinel.id = 'loadMoreSentinel';
    sentinel.style.height = '50px';
    sentinel.style.width = '100%';
    sentinel.className = 'load-more-sentinel';
    
    const postsContainer = document.getElementById('postsContainer');
    if (postsContainer) {
        // Remove existing sentinel
        const existing = document.getElementById('loadMoreSentinel');
        if (existing) existing.remove();
        
        postsContainer.appendChild(sentinel);
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !isLoadingMore) {
                    console.log("📜 Loading more posts...");
                    loadMorePosts();
                }
            });
        }, { threshold: 0.1 });
        
        observer.observe(sentinel);
        sentinel._observer = observer; // Store for cleanup
    }
}

// Add this to cleanup function
function cleanupFeedListeners() {
    // Clean up real-time listeners
    if (postsListener) {
        postsListener();
        postsListener = null;
    }
    
    // Clean up interval
    if (window.newPostsInterval) {
        clearInterval(window.newPostsInterval);
        window.newPostsInterval = null;
    }
    
    // Clean up intersection observer
    if (window.postObserver) {
        window.postObserver.disconnect();
        window.postObserver = null;
    }
    
    // Clean up infinite scroll observer
    const sentinel = document.getElementById('loadMoreSentinel');
    if (sentinel && sentinel._observer) {
        sentinel._observer.disconnect();
    }
}

// Also need these helper functions:

function renderPostsBatch(posts, isFirstBatch) {
    const postsContainer = document.getElementById('postsContainer');
    if (!postsContainer) return;
    
    if (isFirstBatch) {
        postsContainer.innerHTML = '';
    }
    
    // Simple render - no complex queues
    posts.forEach(post => {
        const postElement = createPostElement(post.id, post);
        postsContainer.appendChild(postElement);
    });
    
    // Setup visibility tracker after rendering
    setTimeout(() => {
        setupSimpleVisibilityTracker();
    }, 100);
}

function updateSeenCounter() {
    const seenCounter = document.getElementById('seenCounter');
    const seenCount = document.getElementById('seenCount');
    
    if (seenCounter && seenCount) {
        const count = seenPosts.size;
        if (count > 0) {
            seenCount.textContent = count;
            seenCounter.style.display = 'block';
        } else {
            seenCounter.style.display = 'none';
        }
    }
}

function removeDuplicatePosts(posts) {
    if (!posts || !Array.isArray(posts)) return [];
    const seen = new Set();
    return posts.filter(post => {
        if (!post || !post.id) return false;
        if (seen.has(post.id)) return false;
        seen.add(post.id);
        return true;
    });
}

async function getRecentPosts(limit = 10) {
    try {
        const snapshot = await firebase.firestore().collection('posts')
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        
        const posts = [];
        snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));
        return posts;
    } catch (error) {
        console.error("Error getting recent posts:", error);
        return [];
    }
}

function getOlderPosts(following) {
    return getOlderPostsFromFollowing(following, POSTS_PER_PAGE);
}

// And add the createPostElement function (simplified version):
function createPostElement(postId, post) {
    const div = document.createElement('div');
    div.className = 'post';
    div.dataset.postId = postId;
    
    // Check if already seen
    if (seenPosts.has(postId)) {
        div.classList.add('seen');
    }
    
    // Simple HTML
    const hasBackgroundColor = post.backgroundColor && post.backgroundColor !== 'transparent';
    const isLiked = post.likes && post.likes.includes(currentUser.uid);
    const likesCount = post.likes ? post.likes.length : 0;
    const userName = post.userName || 'Anonymous';
    const avatarColor = getColorFromName(userName);
    const avatarInitial = userName.charAt(0).toUpperCase();
    const isAuthor = post.userId === currentUser.uid;
    
    div.innerHTML = `
        <div class="post-header">
            <div class="user-info clickable-user" data-user-id="${post.userId}">
                <div class="avatar" style="background: ${avatarColor}">
                    ${avatarInitial}
                </div>
                <div>
                    <div class="user-name">${userName}</div>
                    <div class="post-time">${formatTime(post.createdAt)}</div>
                </div>
            </div>
            ${isAuthor ? `
            <button class="post-menu-btn" onclick="togglePostMenu('${postId}', this)">
                <i class="fas fa-ellipsis-h"></i>
            </button>
            ` : ''}
        </div>
        
        <div class="post-content-wrapper" style="${hasBackgroundColor ? `background-color: ${post.backgroundColor};` : ''}">
            <div class="post-content">${escapeHtml(post.content)}</div>
        </div>
        
        <div class="post-stats">
            <span class="likes-count">${likesCount} ${likesCount === 1 ? 'like' : 'likes'}</span>
            <span>•</span>
            <span class="comments-count">${post.commentsCount || 0} ${post.commentsCount === 1 ? 'comment' : 'comments'}</span>
        </div>
        
        <div class="post-actions">
            <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${postId}', this)">
                <i class="fas fa-thumbs-up"></i>
                <span>${isLiked ? ' Liked' : ' Like'}</span>
            </button>
            <button class="comment-btn" onclick="openCommentModal('${postId}')">
                <i class="fas fa-comment"></i>
                <span> Comment</span>
            </button>
        </div>
        
        ${isAuthor ? `
        <div class="post-menu-dropdown" id="menu-${postId}" style="display: none;">
            <button onclick="editPost('${postId}', '${escapeHtml(post.content).replace(/'/g, "\\'")}')">Edit</button>
            <button onclick="deletePost('${postId}')">Delete</button>
        </div>
        ` : ''}
    `;
    
    // Add click listener to user info
    const userInfo = div.querySelector('.clickable-user');
    if (userInfo) {
        userInfo.addEventListener('click', function(e) {
            e.stopPropagation();
            const userId = this.getAttribute('data-user-id');
            if (userId && userId !== currentUser.uid) {
                loadUserProfile(userId);
            }
        });
        userInfo.style.cursor = 'pointer';
    }
    
    return div;
}

// Simple post menu toggle
function togglePostMenu(postId, button) {
    const menu = document.getElementById(`menu-${postId}`);
    const allMenus = document.querySelectorAll('.post-menu-dropdown');
    
    // Close all other menus
    allMenus.forEach(m => {
        if (m.id !== `menu-${postId}`) {
            m.style.display = 'none';
        }
    });
    
    // Toggle current menu
    if (menu) {
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }
    
    // Close menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!e.target.closest('.post-menu-btn') && !e.target.closest('.post-menu-dropdown')) {
                if (menu) menu.style.display = 'none';
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 10);
}

// Simple like function
function toggleLike(postId, button) {
    if (!postId || !button || !currentUser) return;
    
    const postElement = button.closest('.post');
    const likesCountElement = postElement?.querySelector('.likes-count');
    
    // Optimistic update
    const isLiked = button.classList.contains('liked');
    let likesCount = parseInt(likesCountElement?.textContent) || 0;
    
    if (isLiked) {
        button.classList.remove('liked');
        button.querySelector('span').textContent = ' Like';
        likesCount = Math.max(0, likesCount - 1);
    } else {
        button.classList.add('liked');
        button.querySelector('span').textContent = ' Liked';
        likesCount++;
    }
    
    if (likesCountElement) {
        likesCountElement.textContent = `${likesCount} ${likesCount === 1 ? 'like' : 'likes'}`;
    }
    
    // Firestore update
    const postRef = firebase.firestore().collection('posts').doc(postId);
    
    if (isLiked) {
        postRef.update({
            likes: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
        }).catch(console.error);
    } else {
        postRef.update({
            likes: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        }).catch(console.error);
    }
}

// Simple comment modal (if not already defined)
function openCommentModal(postId) {
    currentPostId = postId;
    
    const modal = document.getElementById('commentModal');
    const overlay = document.getElementById('overlay');
    
    if (modal && overlay) {
        overlay.style.display = 'block';
        modal.classList.add('active');
        
        setTimeout(() => {
            const commentInput = document.getElementById('commentInput');
            if (commentInput) commentInput.focus();
        }, 300);
        
        loadComments(postId);
    }
}


// === NEW HELPER FUNCTIONS THAT DON'T REQUIRE INDEXES ===

async function getMixedPosts(following, limit = 10) {
    try {
        // Strategy: Get recent posts and filter client-side
        const recentPosts = await getRecentPosts(limit * 2);
        
        // Filter to include: user's posts + followed users' posts + some random
        const filtered = recentPosts.filter(post => {
            return post.userId === currentUser.uid || 
                   following.includes(post.userId) ||
                   Math.random() > 0.7; // 30% chance to include random posts
        });
        
        return filtered.slice(0, limit);
        
    } catch (error) {
        console.error("Error getting mixed posts:", error);
        return getRecentPosts(limit);
    }
}

async function getPostsFromUsers(following, limit = 10) {
    try {
        if (!following || following.length === 0) {
            return getRecentPosts(limit);
        }
        
        // IMPORTANT: Firestore 'in' query has limit of 10 values
        const usersToQuery = [...following, currentUser.uid].slice(0, 10);
        
        // Use 'in' query (no composite index needed)
        const query = firebase.firestore().collection('posts')
            .where('userId', 'in', usersToQuery)
            .limit(limit);
        
        const snapshot = await query.get();
        
        const posts = [];
        snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));
        
        // Sort by date client-side
        posts.sort((a, b) => {
            const aTime = a.createdAt?.toDate() || new Date(0);
            const bTime = b.createdAt?.toDate() || new Date(0);
            return bTime - aTime;
        });
        
        return posts.slice(0, limit);
        
    } catch (error) {
        console.error("Error getting posts from users:", error);
        return getRecentPosts(limit);
    }
}

async function getRecentPosts(limit = 10) {
    try {
        // This query works without composite index
        const snapshot = await firebase.firestore().collection('posts')
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        
        const posts = [];
        snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));
        return posts;
        
    } catch (error) {
        console.error("Error getting recent posts:", error);
        return [];
    }
}

async function getTrendingPostsClientSide(limit = 10) {
    try {
        // Get recent posts and calculate trending client-side
        const recentPosts = await getRecentPosts(limit * 3);
        
        // Calculate trending score (likes per hour)
        const postsWithScore = recentPosts.map(post => {
            const postTime = post.createdAt?.toDate() || new Date();
            const hoursOld = Math.max(1, (Date.now() - postTime) / (1000 * 60 * 60));
            const likes = post.likes?.length || 0;
            const comments = post.commentsCount || 0;
            
            return {
                ...post,
                trendingScore: (likes + comments) / hoursOld
            };
        });
        
        // Sort by trending score
        postsWithScore.sort((a, b) => b.trendingScore - a.trendingScore);
        
        return postsWithScore.slice(0, limit).map(p => ({
            id: p.id,
            ...p
        }));
        
    } catch (error) {
        console.error("Error getting trending posts:", error);
        return getRecentPosts(limit);
    }
}

// Update the simpleSortPosts function
function simpleSortPosts(posts, following) {
    if (!posts || posts.length === 0) return [];
    
    return posts.sort((a, b) => {
        // Priority 1: User's own posts
        if (a.userId === currentUser.uid && b.userId !== currentUser.uid) return -1;
        if (b.userId === currentUser.uid && a.userId !== currentUser.uid) return 1;
        
        // Priority 2: Followed users' posts
        const aIsFollowing = following.includes(a.userId);
        const bIsFollowing = following.includes(b.userId);
        if (aIsFollowing && !bIsFollowing) return -1;
        if (!aIsFollowing && bIsFollowing) return 1;
        
        // Priority 3: More engagement
        const aEngagement = (a.likes?.length || 0) + (a.commentsCount || 0);
        const bEngagement = (b.likes?.length || 0) + (b.commentsCount || 0);
        if (aEngagement !== bEngagement) return bEngagement - aEngagement;
        
        // Priority 4: Most recent
        const aTime = a.createdAt?.toDate() || new Date(0);
        const bTime = b.createdAt?.toDate() || new Date(0);
        return bTime - aTime;
    });
}

// Update setupSimpleFeedListener to avoid composite index
function setupSimpleFeedListener(following) {
    // Clean up previous listener
    if (postsListener) postsListener();
    
    // Only listen if following users
    if (following.length === 0) return;
    
    // Simple listener for new posts (no composite index)
    // We'll just check for new posts periodically instead of real-time
    setupPeriodicNewPostsCheck(following);
}

function setupPeriodicNewPostsCheck(following) {
    // Clean up any existing interval
    if (window.newPostsInterval) {
        clearInterval(window.newPostsInterval);
    }
    
    // Check every 30 seconds for new posts
    window.newPostsInterval = setInterval(async () => {
        if (currentPage !== 'feed' || window.scrollY < 200) return;
        
        try {
            // Get latest post timestamp
            const lastCheck = localStorage.getItem('lastPostsCheck') || 0;
            const now = Date.now();
            
            if (now - lastCheck > 30000) { // 30 seconds
                let query = firebase.firestore().collection('posts')
                    .orderBy('createdAt', 'desc')
                    .limit(1);
                
                const snapshot = await query.get();
                
                if (!snapshot.empty) {
                    const latestPost = snapshot.docs[0];
                    const postTime = latestPost.data().createdAt?.toDate() || new Date();
                    const storedTime = localStorage.getItem('lastKnownPostTime');
                    
                    if (!storedTime || postTime > new Date(parseInt(storedTime))) {
                        newPostsCount++;
                        showNewPostsButton(newPostsCount);
                        localStorage.setItem('lastKnownPostTime', postTime.getTime());
                    }
                }
                
                localStorage.setItem('lastPostsCheck', now);
            }
        } catch (error) {
            console.error("Error checking for new posts:", error);
        }
    }, 30000);
}

// Update cleanup function
function cleanupFeedListeners() {
    // Clean up real-time listeners
    if (postsListener) {
        postsListener();
        postsListener = null;
    }
    
    // Clean up interval
    if (window.newPostsInterval) {
        clearInterval(window.newPostsInterval);
        window.newPostsInterval = null;
    }
    
    // Clean up intersection observer
    if (window.postObserver) {
        window.postObserver.disconnect();
        window.postObserver = null;
    }
    
    // Clean up infinite scroll observer
    const sentinel = document.getElementById('loadMoreSentinel');
    if (sentinel && sentinel._observer) {
        sentinel._observer.disconnect();
    }
}

// Add this helper function at the top of your file
async function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        const checkElement = () => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }
            
            if (Date.now() - startTime > timeout) {
                reject(new Error(`Element ${selector} not found after ${timeout}ms`));
                return;
            }
            
            setTimeout(checkElement, 100);
        };
        
        checkElement();
    });
}
function setupFeedRealTimeListener(following) {
    // Clean up previous listener
    if (postsListener) postsListener();
    
    // Listen for new posts from followed users
    if (following.length > 0) {
        postsListener = firebase.firestore().collection('posts')
            .where('userId', 'in', [...following.slice(0, 10), currentUser.uid]) // Firestore 'in' limit is 10
            .orderBy('createdAt', 'desc')
            .limit(20)
            .onSnapshot((snapshot) => {
                // Check if there are new posts
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added' && !change.doc.metadata.hasPendingWrites) {
                        // New post added by followed user
                        const newPost = { id: change.doc.id, ...change.doc.data() };
                        
                        // Don't add if it's the current user's own post (they just posted it)
                        if (newPost.userId !== currentUser.uid) {
                            // Show new posts button
                            newPostsCount++;
                            showNewPostsButton(newPostsCount);
                        }
                    }
                });
            });
    }
}


function processDiscoverFeed(posts) {
    // Simple sorting: newest first, then by engagement
    return posts.sort((a, b) => {
        const aTime = a.createdAt?.toDate() || new Date(0);
        const bTime = b.createdAt?.toDate() || new Date(0);
        
        // Newest first
        if (bTime - aTime !== 0) return bTime - aTime;
        
        // Then by engagement
        const aEngagement = (a.likes?.length || 0) + (a.commentsCount || 0);
        const bEngagement = (b.likes?.length || 0) + (b.commentsCount || 0);
        return bEngagement - aEngagement;
    });
}
function processMixedFeed(posts, following) {
    // Separate posts from followed users vs others
    const followedPosts = [];
    const otherPosts = [];
    
    posts.forEach(post => {
        if (following.includes(post.userId) || post.userId === currentUser?.uid) {
            followedPosts.push(post);
        } else {
            otherPosts.push(post);
        }
    });
    
    // Sort followed posts by recency
    followedPosts.sort((a, b) => {
        const aTime = a.createdAt?.toDate() || new Date(0);
        const bTime = b.createdAt?.toDate() || new Date(0);
        return bTime - aTime;
    });
    
    // Sort other posts by engagement
    otherPosts.sort((a, b) => {
        const aEngagement = (a.likes?.length || 0) + (a.commentsCount || 0);
        const bEngagement = (b.likes?.length || 0) + (b.commentsCount || 0);
        return bEngagement - aEngagement;
    });
    
    // Mix: 70% followed, 30% other
    const followedCount = Math.min(followedPosts.length, Math.ceil(posts.length * 0.7));
    const otherCount = posts.length - followedCount;
    
    const result = [];
    result.push(...followedPosts.slice(0, followedCount));
    result.push(...otherPosts.slice(0, otherCount));
    
    return result;
}


const postRealTimeListeners = new Map();

function setupPostRealTimeUpdates(postId, postElement) {
    if (!postId || !postElement) return;
    
    // Clean up existing listener for this post
    if (postRealTimeListeners.has(postId)) {
        postRealTimeListeners.get(postId)();
        postRealTimeListeners.delete(postId);
    }
    
    const postRef = firebase.firestore().collection('posts').doc(postId);
    
    const listener = postRef.onSnapshot((doc) => {
        if (!doc.exists || !postElement.isConnected) return;
        
        const updatedPost = doc.data();
        
        // Update like count
        const likesCount = updatedPost.likes ? updatedPost.likes.length : 0;
        const likesCountElement = postElement.querySelector('.likes-count');
        if (likesCountElement) {
            likesCountElement.textContent = `${likesCount} ${likesCount === 1 ? 'like' : 'likes'}`;
        }
        
        // Update like button
        const likeBtn = postElement.querySelector('.like-btn');
        if (likeBtn) {
            const isLiked = updatedPost.likes && updatedPost.likes.includes(currentUser.uid);
            likeBtn.classList.toggle('liked', isLiked);
            const span = likeBtn.querySelector('span');
            if (span) {
                span.textContent = isLiked ? ' Liked' : ' Like';
            }
        }
        
        // CRITICAL FIX: Update comments count in real-time
        const commentsCount = updatedPost.commentsCount || 0;
        const commentsCountElement = postElement.querySelector('.comments-count');
        if (commentsCountElement) {
            commentsCountElement.textContent = `${commentsCount} ${commentsCount === 1 ? 'comment' : 'comments'}`;
        }
        
        console.log(`✅ Post ${postId} updated: ${likesCount} likes, ${commentsCount} comments`);
        
    }, (error) => {
        console.error(`Error in real-time updates for post ${postId}:`, error);
    });
    
    // Store listener
    postRealTimeListeners.set(postId, listener);
    
    // Also listen for comment changes specifically
    setupPostCommentsListener(postId, postElement);
}

const postCommentListeners = new Map();

function setupPostCommentsListener(postId, postElement) {
    if (!postId || !postElement) return;
    
    // Clean up existing comment listener for this post
    if (postCommentListeners.has(postId)) {
        postCommentListeners.get(postId)();
        postCommentListeners.delete(postId);
    }
    
    const commentsRef = firebase.firestore()
        .collection('posts')
        .doc(postId)
        .collection('comments');
    
    const listener = commentsRef.onSnapshot((snapshot) => {
        if (!postElement.isConnected) return;
        
        // Update comment count based on actual comment documents
        const commentsCount = snapshot.size;
        const commentsCountElement = postElement.querySelector('.comments-count');
        if (commentsCountElement) {
            commentsCountElement.textContent = `${commentsCount} ${commentsCount === 1 ? 'comment' : 'comments'}`;
        }
        
        // Also update the post document's commentsCount field
        if (snapshot.docChanges().length > 0) {
            firebase.firestore().collection('posts').doc(postId).update({
                commentsCount: commentsCount,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(error => {
                console.error("Error updating comments count:", error);
            });
        }
        
    }, (error) => {
        console.error(`Error listening to comments for post ${postId}:`, error);
    });
    
    postCommentListeners.set(postId, listener);
}

async function cleanupDeletedNotifications() {
    try {
        const snapshot = await firebase.firestore().collection('notifications')
            .where('targetUserId', '==', currentUser.uid)
            .limit(100)
            .get();
        
        const batch = firebase.firestore().batch();
        let deletedCount = 0;
        
        // Check each notification's referenced content
        for (const doc of snapshot.docs) {
            const notificationData = doc.data(); // CHANGED HERE
            
            if (notificationData.type === 'like' || notificationData.type === 'comment' || 
                notificationData.type === 'mention' || notificationData.type === 'reply') {
                
                const postId = notificationData.data?.postId; // CHANGED HERE
                if (postId) {
                    const postRef = firebase.firestore().collection('posts').doc(postId);
                    const postDoc = await postRef.get();
                    
                    if (!postDoc.exists) {
                        // Post was deleted, mark notification as deleted
                        batch.update(doc.ref, {
                            deleted: true,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        deletedCount++;
                    }
                }
            } else if (notificationData.type === 'follow') { // CHANGED HERE
                const userId = notificationData.fromUserId; // CHANGED HERE
                if (userId) {
                    const userRef = firebase.firestore().collection('users').doc(userId);
                    const userDoc = await userRef.get();
                    
                    if (!userDoc.exists) {
                        // User was deleted
                        batch.update(doc.ref, {
                            deleted: true,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        deletedCount++;
                    }
                }
            }
        }
        
        if (deletedCount > 0) {
            await batch.commit();
            console.log(`Marked ${deletedCount} notifications as deleted`);
            
            // Refresh notifications list
            if (currentPage === 'notifications') {
                loadNotifications();
            }
        }
        
    } catch (error) {
        console.error('Error cleaning up notifications:', error);
    }
}

// Call this periodically or when loading notifications
setInterval(cleanupDeletedNotifications, 5 * 60 * 1000); // Every 5 minutes
// Update cleanup function
function cleanupPostRealTimeListeners() {
    // Clean up post listeners
    postRealTimeListeners.forEach((unsubscribe, postId) => {
        unsubscribe();
    });
    postRealTimeListeners.clear();
    
    // Clean up comment listeners
    postCommentListeners.forEach((unsubscribe, postId) => {
        unsubscribe();
    });
    postCommentListeners.clear();
}
// Update cleanup function
function cleanupPostRealTimeListeners() {
    postRealTimeListeners.forEach((unsubscribe, postId) => {
        unsubscribe();
    });
    postRealTimeListeners.clear();
}

// Update cleanup function
function cleanupPostRealTimeListeners() {
    postRealTimeListeners.forEach((unsubscribe, postId) => {
        unsubscribe();
    });
    postRealTimeListeners.clear();
}
function setupInfiniteScrollObserver() {
    const sentinel = document.createElement('div');
    sentinel.id = 'loadMoreSentinel';
    sentinel.style.height = '50px';
    sentinel.style.width = '100%';
    sentinel.className = 'load-more-sentinel';
    
    const postsContainer = document.getElementById('postsContainer');
    if (postsContainer) {
        postsContainer.appendChild(sentinel);
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !isLoadingMore) {
                    console.log("Loading more posts...");
                    loadPosts(false); // Load next batch
                }
            });
        }, { threshold: 0.1 });
        
        observer.observe(sentinel);
    }
}
async function processFeedPosts(posts) {
    // Quick processing - prioritize speed
    return posts.sort((a, b) => {
        const aTime = a.createdAt?.toDate() || new Date(0);
        const bTime = b.createdAt?.toDate() || new Date(0);
        return bTime - aTime; // Most recent first
    });
}

function showSkeletonPosts(count = 3) {
    const postsContainer = document.getElementById('postsContainer');
    if (!postsContainer) return;
    
    postsContainer.innerHTML = '';
    
    for (let i = 0; i < count; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'skeleton-post';
        skeleton.innerHTML = `
            <div class="skeleton-header">
                <div class="skeleton-avatar"></div>
                <div class="skeleton-text">
                    <div class="skeleton-line short"></div>
                    <div class="skeleton-line" style="width: 40%"></div>
                </div>
            </div>
            <div class="skeleton-content"></div>
            <div class="skeleton-line" style="width: 30%; margin-top: 12px;"></div>
        `;
        postsContainer.appendChild(skeleton);
    }
}
let postRenderQueue = [];
let isRendering = false;

function enqueuePostsForRender(posts) {
    postRenderQueue.push(...posts);
    if (!isRendering) {
        renderQueuedPosts();
    }
}
let visiblePosts = new Set();
const MAX_VISIBLE_POSTS = 30;

function managePostMemory() {
    const allPosts = document.querySelectorAll('.post');
    
    if (allPosts.length > MAX_VISIBLE_POSTS) {
        const postsToRemove = allPosts.length - MAX_VISIBLE_POSTS;
        
        // Remove oldest posts that are not in viewport
        for (let i = 0; i < postsToRemove; i++) {
            const post = allPosts[i];
            const postId = post.dataset.postId;
            
            // Check if post is in viewport
            const rect = post.getBoundingClientRect();
            const isInViewport = (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= window.innerHeight &&
                rect.right <= window.innerWidth
            );
            
            if (!isInViewport) {
                post.remove();
                visiblePosts.delete(postId);
            }
        }
    }
}

// Call this periodically or when adding new posts
setInterval(managePostMemory, 30000); // Every 30 seconds

function renderQueuedPosts() {
    if (postRenderQueue.length === 0 || isRendering) return;
    
    isRendering = true;
    const postsContainer = document.getElementById('postsContainer');
    
    // Use requestAnimationFrame for smooth rendering
    requestAnimationFrame(() => {
        const fragment = document.createDocumentFragment();
        const batchSize = Math.min(3, postRenderQueue.length);
        
        for (let i = 0; i < batchSize; i++) {
            const post = postRenderQueue.shift();
            if (post) {
                const postElement = createPostElement(post.id, post);
                fragment.appendChild(postElement);
            }
        }
        
        // Remove skeletons if present
        const skeletons = postsContainer.querySelectorAll('.skeleton-post');
        if (skeletons.length > 0 && postRenderQueue.length === 0) {
            skeletons.forEach(skeleton => skeleton.remove());
        }
        
        postsContainer.appendChild(fragment);
        
        // Setup visibility tracker for new posts
        setupPostVisibilityTracker();
        
        isRendering = false;
        
        // If there are more posts in queue, render next batch
        if (postRenderQueue.length > 0) {
            setTimeout(renderQueuedPosts, 50); // Small delay for smoothness
        }
    });
}
// Modified getPersonalizedFeed for lazy loading
async function getPersonalizedFeedBatch(following, lastVisible = null, limit = 10) {
    try {
        const query = firebase.firestore().collection('posts')
            .where('userId', 'in', [...following, currentUser.uid])
            .orderBy('createdAt', 'desc')
            .limit(limit);
        
        if (lastVisible) {
            query.startAfter(lastVisible);
        }
        
        const snapshot = await query.get();
        return {
            posts: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
            lastVisible: snapshot.docs[snapshot.docs.length - 1]
        };
    } catch (error) {
        console.error("Error in batch feed:", error);
        return { posts: [], lastVisible: null };
    }
}

function renderPostsBatch(posts, isFirstBatch) {
    const postsContainer = document.getElementById('postsContainer');
    if (!postsContainer) {
        console.error('Posts container not found in renderPostsBatch');
        return;
    }
    
    const fragment = document.createDocumentFragment();
    
    posts.forEach(post => {
        const postElement = createPostElement(post.id, post);
        fragment.appendChild(postElement);
    });
    
    if (isFirstBatch) {
        postsContainer.innerHTML = '';
    }
    
    postsContainer.appendChild(fragment);
}
// === SIMPLE, FAST FEED ALGORITHM ===

let feedListener = null;
let feedPosts = [];

async function loadSimpleFeed() {
    const postsContainer = document.getElementById('postsContainer');
    if (!postsContainer || !currentUser) return;
    
    // Show skeletons
    showSkeletonPosts(3);
    
    // 1. Get user's following list ONCE
    const userDoc = await firebase.firestore().collection('users').doc(currentUser.uid).get();
    const following = userDoc.data()?.following || [];
    
    // 2. SIMPLE QUERY: Get posts from followed users OR recent posts
    let query = firebase.firestore().collection('posts')
        .orderBy('createdAt', 'desc')
        .limit(20);
    
    if (following.length > 0) {
        // If following users, get their posts
        query = firebase.firestore().collection('posts')
            .where('userId', 'in', following.slice(0, 10)) // Max 10 users
            .orderBy('createdAt', 'desc')
            .limit(20);
    }
    
    const snapshot = await query.get();
    
    // 3. Simple processing (no complex scoring)
    const posts = [];
    snapshot.forEach(doc => {
        posts.push({ id: doc.id, ...doc.data() });
    });
    
    // 4. Simple client-side sorting
    posts.sort((a, b) => {
        // Just by recency
        const aTime = a.createdAt?.toDate() || new Date(0);
        const bTime = b.createdAt?.toDate() || new Date(0);
        return bTime - aTime;
    });
    
    // 5. Simple rendering
    postsContainer.innerHTML = '';
    posts.forEach(post => {
        const postElement = createSimplePostElement(post.id, post);
        postsContainer.appendChild(postElement);
    });
    
    // 6. Setup ONE real-time listener for new posts
    setupSimpleRealTimeListener(following);
}

function createSimplePostElement(postId, post) {
    const div = document.createElement('div');
    div.className = 'post';
    div.dataset.postId = postId;
    
    // SIMPLE HTML - no complex event listeners
    div.innerHTML = `
        <div class="post-header">
            <div class="user-info">
                <div class="avatar">${post.userName?.charAt(0) || 'U'}</div>
                <div>
                    <div class="user-name">${post.userName || 'User'}</div>
                    <div class="post-time">${formatTime(post.createdAt)}</div>
                </div>
            </div>
        </div>
        <div class="post-content">${escapeHtml(post.content)}</div>
        <div class="post-actions">
            <button class="like-btn" onclick="toggleLike('${postId}', this)">
                <i class="fas fa-thumbs-up"></i>
                <span>${post.likes?.includes(currentUser.uid) ? 'Liked' : 'Like'}</span>
            </button>
            <button class="comment-btn" onclick="openCommentModal('${postId}')">
                <i class="fas fa-comment"></i>
                <span>Comment</span>
            </button>
        </div>
    `;
    
    return div;
}

function setupSimpleRealTimeListener(following) {
    // Clean up previous listener
    if (feedListener) feedListener();
    
    // Only listen if following users
    if (following.length === 0) return;
    
    // SINGLE listener for new posts from followed users
    feedListener = firebase.firestore().collection('posts')
        .where('userId', 'in', following.slice(0, 10))
        .orderBy('createdAt', 'desc')
        .limit(5)
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    // Show "new posts" button
                    newPostsCount++;
                    showNewPostsButton(newPostsCount);
                }
            });
        });
}
function calculateFreshnessScore(postTime) {
    const now = new Date();
    const postDate = postTime.toDate();
    const hoursOld = (now - postDate) / (1000 * 60 * 60);
    
    // Exponential decay - newer posts get much higher scores
    if (hoursOld < 1) return 100;            // Less than 1 hour
    if (hoursOld < 6) return 80;             // 1-6 hours
    if (hoursOld < 24) return 60;            // 6-24 hours
    if (hoursOld < 72) return 30;            // 1-3 days
    if (hoursOld < 168) return 10;           // 3-7 days
    return 0;                                 // Older than 1 week
}

async function renderSmartFeed(posts, followingCount) {
    const postsContainer = document.getElementById('postsContainer');
    if (!postsContainer) return;
    
    postsContainer.innerHTML = '';
    
    if (!posts || posts.length === 0) {
        showEmptyFeedWithSuggestions();
        return;
    }
    
    // Decide suggestion positions
    const shouldShowSuggestions = followingCount < 5;
    const suggestionPositions = [];
    
    if (shouldShowSuggestions) {
        for (let i = 3; i < posts.length; i += Math.floor(Math.random() * 3) + 3) {
            suggestionPositions.push(i);
        }
    }
    
    // Render posts with interspersed suggestions
    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const postElement = createPostElement(post.id, post);
        postsContainer.appendChild(postElement);
        
        if (suggestionPositions.includes(i)) {
            const suggestion = await createInFeedSuggestion();
            if (suggestion) {
                postsContainer.appendChild(suggestion);
                const spacer = document.createElement('div');
                spacer.className = 'feed-spacer';
                spacer.style.height = '20px';
                postsContainer.appendChild(spacer);
            }
        }
    }
    
    if (posts.length < 8 && shouldShowSuggestions) {
        const finalSuggestion = await createInFeedSuggestion();
        if (finalSuggestion) {
            postsContainer.appendChild(finalSuggestion);
        }
    }
}

// ===== REAL-TIME NEW POSTS LISTENER =====
function setupNewPostsListener() {
    // Clean up previous listener
    if (postsListener) postsListener();
    
    // Listen for new posts
    postsListener = firebase.firestore().collection('posts')
        .limit(1)
        .onSnapshot((snapshot) => {
            if (!snapshot.empty) {
                const latestPost = snapshot.docs[0];
                const postTime = latestPost.data().createdAt?.toDate() || new Date();
                const now = new Date();
                const timeDiff = now - postTime;
                
                // If post is less than 5 minutes old and user is not at top
                if (timeDiff < 5 * 60 * 1000 && window.scrollY > 200) {
                    newPostsCount++;
                    newPostsAvailable = true;
                    showNewPostsToast(newPostsCount);
                }
            }
        }, (error) => {
            console.error("Error listening for new posts:", error);
        });
}

// ===== IN-FEED SUGGESTIONS =====
async function createInFeedSuggestion() {
    try {
        const suggestions = await getSuggestedUsers(3);
        if (suggestions.length === 0) return null;
        
        const container = document.createElement('div');
        container.className = 'in-feed-suggestion';
        
        container.innerHTML = `
            <div class="suggestion-card">
                <div class="suggestion-header">
                    <h4><i class="fas fa-user-plus"></i> Suggested for you</h4>
                    <button class="refresh-suggestions" title="Refresh">
                        <i class="fas fa-redo"></i>
                    </button>
                </div>
                <div class="suggestion-users">
                    ${suggestions.map(user => `
                        <div class="suggested-user" data-user-id="${user.id}">
                            <div class="user-avatar">
                                ${user.name?.charAt(0)?.toUpperCase() || 'U'}
                            </div>
                            <div class="user-info">
                                <div class="user-name">${user.name || 'User'}</div>
                                <div class="user-stats">
                                    <span><i class="fas fa-users"></i> ${user.followerCount || 0}</span>
                                    <span><i class="fas fa-pen"></i> ${user.postCount || 0}</span>
                                </div>
                            </div>
                            <button class="follow-suggestion-btn" data-user-id="${user.id}">
                                Follow
                            </button>
                        </div>
                    `).join('')}
                </div>
                <div class="suggestion-footer">
                    <button class="view-all-suggestions">
                        <i class="fas fa-compass"></i> Discover more users
                    </button>
                </div>
            </div>
        `;
        
        setTimeout(() => {
            container.querySelectorAll('.follow-suggestion-btn').forEach(btn => {
                btn.addEventListener('click', async function(e) {
                    e.stopPropagation();
                    const userId = this.getAttribute('data-user-id');
                    await followUser(userId, this);
                    this.innerHTML = '<i class="fas fa-check"></i> Following';
                    this.classList.add('following');
                    this.disabled = true;
                    showToast(`You're now following ${suggestions.find(u => u.id === userId)?.name || 'this user'}!`, 'success');
                });
            });
            
            container.querySelectorAll('.suggested-user').forEach(item => {
                item.addEventListener('click', function(e) {
                    if (!e.target.closest('.follow-suggestion-btn')) {
                        const userId = this.getAttribute('data-user-id');
                        loadUserProfile(userId);
                    }
                });
            });
            
            container.querySelector('.refresh-suggestions').addEventListener('click', async function() {
                this.classList.add('refreshing');
                const newSuggestion = await createInFeedSuggestion();
                if (newSuggestion) {
                    container.replaceWith(newSuggestion);
                }
                setTimeout(() => this.classList.remove('refreshing'), 1000);
            });
            
            container.querySelector('.view-all-suggestions').addEventListener('click', function() {
                showDiscoverPage();
            });
        }, 100);
        
        return container;
    } catch (error) {
        console.error("Error creating in-feed suggestion:", error);
        return null;
    }
}

async function getSuggestedUsers(limit = 3) {
    try {
        if (!currentUser) return [];
        
        const userDoc = await firebase.firestore().collection('users').doc(currentUser.uid).get();
        if (!userDoc.exists) return [];
        
        const userData = userDoc.data();
        const following = userData.following || [];
        
        let suggestedUsers = new Map(); // Use Map to avoid duplicates
        
        // Strategy 1: Friends of friends
        if (following.length > 0) {
            // Get data for following users
            const followingUsers = await firebase.firestore().collection('users')
                .where('__name__', 'in', following.slice(0, 10))
                .get();
            
            // Collect their following
            for (const doc of followingUsers.docs) {
                const followingUserData = doc.data();
                if (followingUserData.following) {
                    for (const friendId of followingUserData.following) {
                        if (friendId !== currentUser.uid && 
                            !following.includes(friendId) &&
                            !suggestedUsers.has(friendId)) {
                            suggestedUsers.set(friendId, { id: friendId });
                        }
                    }
                }
            }
        }
        
        // Strategy 2: Popular users if we don't have enough suggestions
        if (suggestedUsers.size < limit) {
            const popularUsers = await firebase.firestore().collection('users')
                .where('postsCount', '>', 0)
                .orderBy('postsCount', 'desc')
                .limit(20)
                .get();
            
            for (const doc of popularUsers.docs) {
                const userId = doc.id;
                if (userId !== currentUser.uid && 
                    !following.includes(userId) &&
                    !suggestedUsers.has(userId)) {
                    suggestedUsers.set(userId, { 
                        id: userId,
                        ...doc.data()
                    });
                }
                if (suggestedUsers.size >= limit * 3) break; // Get extras
            }
        }
        
        // Strategy 3: Random active users if still not enough
        if (suggestedUsers.size < limit) {
            const allUsers = await firebase.firestore().collection('users')
                .where('lastSeen', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
                .limit(30)
                .get();
            
            const randomUsers = [];
            allUsers.forEach(doc => {
                if (doc.id !== currentUser.uid && !following.includes(doc.id)) {
                    randomUsers.push({ id: doc.id, ...doc.data() });
                }
            });
            
            // Shuffle and take random users
            const shuffled = shuffleArray(randomUsers);
            for (const user of shuffled) {
                if (!suggestedUsers.has(user.id)) {
                    suggestedUsers.set(user.id, user);
                }
                if (suggestedUsers.size >= limit * 2) break;
            }
        }
        
        // Convert Map to array and get detailed info
        const userArray = Array.from(suggestedUsers.values());
        
        // Get detailed user info for each suggestion
        const detailedUsers = await Promise.all(
            userArray.slice(0, limit * 2).map(async (user) => {
                try {
                    // Skip if we already have the data
                    if (user.name && user.followerCount !== undefined && user.postCount !== undefined) {
                        return user;
                    }
                    
                    const userDoc = await firebase.firestore().collection('users').doc(user.id).get();
                    if (userDoc.exists) {
                        const data = userDoc.data();
                        return {
                            id: user.id,
                            name: data.name || 'User',
                            followerCount: Array.isArray(data.followers) ? data.followers.length : 0,
                            postCount: data.postsCount || 0,
                            lastSeen: data.lastSeen || null
                        };
                    }
                } catch (error) {
                    console.error("Error fetching user details:", error);
                }
                return null;
            })
        );
        
        // Filter out nulls and users without names
        const validUsers = detailedUsers.filter(user => 
            user && user.name && user.id !== currentUser.uid
        );
        
        // Sort by activity and freshness
        validUsers.sort((a, b) => {
            // Prioritize users with posts
            if (a.postCount > 0 && b.postCount === 0) return -1;
            if (a.postCount === 0 && b.postCount > 0) return 1;
            
            // Then by followers
            if (a.followerCount !== b.followerCount) {
                return b.followerCount - a.followerCount;
            }
            
            // Then by recency
            if (a.lastSeen && b.lastSeen) {
                return b.lastSeen.toDate() - a.lastSeen.toDate();
            }
            
            return 0;
        });
        
        return validUsers.slice(0, limit);
        
    } catch (error) {
        console.error("Error in getSuggestedUsers:", error);
        return [];
    }
}

async function detectTrendingPosts() {
    // Look for posts with sudden engagement spikes
    const recentPosts = await getRecentPosts(100);
    
    return recentPosts.filter(post => {
        const postAge = (Date.now() - post.createdAt.toDate()) / (1000 * 60 * 60);
        const engagementRate = (post.likes.length + post.commentsCount) / (postAge + 1);
        
        // High engagement in short time = trending
        return engagementRate > 5 && postAge < 24;
    });
}


let userActivityContext = {
    lastActiveTime: null,
    sessionLength: 0,
    interactionRate: 0
};

function adjustFeedForUserContext() {
    const sessionLength = getUserSessionLength();
    
    if (sessionLength < 60) { // First minute
        // Show high-engagement, popular content
        return { limit: 10, strategy: 'trending' };
    } else if (sessionLength < 300) { // 1-5 minutes
        // Mix of personalized and trending
        return { limit: 15, strategy: 'mixed' };
    } else { // Long session
        // Deeper, more personalized content
        return { limit: 25, strategy: 'deep_personalized' };
    }
}
const feedMetrics = {
    loadTime: 0,
    engagementRate: 0,
    scrollDepth: 0,
    timeSpent: 0
};

function logFeedPerformance() {
    // Track how well the feed is performing
    const metrics = {
        date: new Date().toISOString(),
        userId: currentUser.uid,
        postsShown: document.querySelectorAll('.post').length,
        postsEngaged: document.querySelectorAll('.post.viewed').length,
        engagementRate: feedMetrics.engagementRate,
        loadTime: feedMetrics.loadTime,
        scrollDepth: feedMetrics.scrollDepth
    };
    
    // Send to analytics
    firebase.firestore().collection('feed_metrics').add(metrics);
}

// Periodically optimize feed based on metrics
setInterval(async () => {
    const recentMetrics = await getRecentFeedMetrics();
    const optimalStrategy = analyzeOptimalStrategy(recentMetrics);
    applyFeedStrategy(optimalStrategy);
}, 24 * 60 * 60 * 1000); // Every 24 hour

const FEED_VARIANTS = {
    CONTROL: 'control', // Current algorithm
    VARIANT_A: 'variant_a', // More trending
    VARIANT_B: 'variant_b', // More personalized
    VARIANT_C: 'variant_c'  // More discovery
};

function assignFeedVariant(userId) {
    // Deterministic assignment based on user ID
    const hash = stringHash(userId);
    const variants = Object.values(FEED_VARIANTS);
    return variants[hash % variants.length];
}

async function loadVariantFeed(variant, following) {
    switch(variant) {
        case FEED_VARIANTS.VARIANT_A:
            return await getTrendingHeavyFeed(following);
        case FEED_VARIANTS.VARIANT_B:
            return await getDeepPersonalizedFeed(following);
        case FEED_VARIANTS.VARIANT_C:
            return await getDiscoveryHeavyFeed(following);
        default:
            return await getPersonalizedFeed(following);
    }
}

function getSeasonalMultiplier() {
    const now = new Date();
    const month = now.getMonth();
    const day = now.getDate();
    
    // Holiday seasons
    if (month === 11) return 1.3; // December - holiday content boost
    if (month === 0 && day === 1) return 1.5; // New Year's
    if (month === 9) return 1.2; // October - tech conference season
    
    // Weekends vs weekdays
    const dayOfWeek = now.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return 1.1; // Weekends
    
    return 1.0; // Normal day
}

function adjustPostScoreForSeason(score, post) {
    const multiplier = getSeasonalMultiplier();
    return score * multiplier;
}
// ===== HELPER FUNCTIONS =====
// Replace the current getPostsFromUsers function
async function getPostsFromUsers(userIds, limit = 10) {
    try {
        if (!userIds || userIds.length === 0) return [];
        
        // Firestore 'in' query limit is 10, so we need to batch
        let allPosts = [];
        
        // Process in batches of 10
        for (let i = 0; i < userIds.length; i += 10) {
            const batch = userIds.slice(i, i + 10);
            const snapshot = await firebase.firestore().collection('posts')
                .where('userId', 'in', batch)
                .limit(limit)
                .get();
            
            snapshot.docs.forEach(doc => {
                allPosts.push({ id: doc.id, ...doc.data() });
            });
        }
        
        // Sort by date and limit
        allPosts.sort((a, b) => 
            (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0)
        );
        
        return allPosts.slice(0, limit);
        
    } catch (error) {
        console.error("Error in getPostsFromUsers:", error);
        // Fallback to recent posts
        return getRecentPosts(limit);
    }
}

async function getTrendingPosts(limit = 10) {
    try {
        const snapshot = await firebase.firestore().collection('posts')
            .orderBy('likes', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error getting trending posts:", error);
        return [];
    }
}

async function getRecentPopularPosts(limit = 10) {
    try {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const snapshot = await firebase.firestore().collection('posts')
            .where('createdAt', '>=', weekAgo)
            .orderBy('createdAt', 'desc')
            .limit(limit * 5)
            .get();
        
        let posts = [];
        snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));
        
        posts.sort((a, b) => {
            const scoreA = (a.likes?.length || 0) + (a.commentsCount || 0);
            const scoreB = (b.likes?.length || 0) + (b.commentsCount || 0);
            return scoreB - scoreA;
        });
        
        return posts.slice(0, limit);
    } catch (error) {
        console.error("Error getting recent popular posts:", error);
        return getRecentPosts(limit);
    }
}

async function getRandomUsersPosts(limit = 5) {
    try {
        const usersSnapshot = await firebase.firestore().collection('users')
            .where('postsCount', '>', 0)
            .limit(20)
            .get();
        
        if (usersSnapshot.empty) return [];
        
        const randomUsers = [];
        usersSnapshot.forEach(doc => {
            if (doc.id !== currentUser.uid) randomUsers.push(doc.id);
        });
        
        const selectedUsers = shuffleArray(randomUsers).slice(0, 5);
        if (selectedUsers.length === 0) return [];
        
        const postsSnapshot = await firebase.firestore().collection('posts')
            .where('userId', 'in', selectedUsers)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        
        const posts = [];
        postsSnapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));
        return posts;
    } catch (error) {
        console.error("Error getting random users posts:", error);
        return [];
    }
}

async function getRecentPosts(limit = 10) {
    try {
        const snapshot = await firebase.firestore().collection('posts')
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        const posts = [];
        snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));
        return posts;
    } catch (error) {
        console.error("Error getting recent posts:", error);
        return [];
    }
}

async function getFreshPosts(limit, following) {
    try {
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const snapshot = await firebase.firestore().collection('posts')
            .where('createdAt', '>=', dayAgo)
            .limit(limit * 2)
            .get();
        
        let posts = [];
        snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));
        
        posts = posts.filter(post => !seenPosts.has(post.id));
        
        posts.sort((a, b) => {
            const aIsFollowing = following.includes(a.userId);
            const bIsFollowing = following.includes(b.userId);
            if (aIsFollowing && !bIsFollowing) return -1;
            if (!aIsFollowing && bIsFollowing) return 1;
            const aEngagement = (a.likes?.length || 0) + (a.commentsCount || 0);
            const bEngagement = (b.likes?.length || 0) + (b.commentsCount || 0);
            return bEngagement - aEngagement;
        });
        
        return posts.slice(0, limit);
    } catch (error) {
        console.error("Error getting fresh posts:", error);
        return getRecentPosts(limit);
    }
}

// Add this function right before getPersonalizedFeed
async function calculatePostScore(post) {
    let score = 0;
    
    // 1. Recency (0-40 points)
    const hoursOld = post.createdAt ? 
        (Date.now() - post.createdAt.toDate()) / (1000 * 60 * 60) : 24;
    const recencyScore = Math.max(0, 40 - (hoursOld * 1.67));
    score += recencyScore;
    
    // 2. Engagement (0-35 points)
    const likes = post.likes?.length || 0;
    const comments = post.commentsCount || 0;
    const engagementRate = (likes + comments * 2) / (hoursOld + 1); // Per hour
    const engagementScore = Math.min(35, engagementRate * 5);
    score += engagementScore;
    
    // 3. Relationship (0-25 points)
    if (post.userId === currentUser.uid) {
        score += 25; // User's own posts
    } else {
        // Check if following
        const userDoc = await firebase.firestore().collection('users').doc(currentUser.uid).get();
        const following = userDoc.data()?.following || [];
        if (following.includes(post.userId)) {
            score += 20; // Following user's post
        } else {
            score += 5; // Not following
        }
    }
    
    // 4. Content quality signals
    const content = post.content || '';
    const words = content.split(' ').length;
    if (words > 10 && words < 300) score += 5; // Good length
    if (content.includes('?')) score += 3; // Question posts get engagement
    
    return score;
}

// Then keep your existing getPersonalizedFeed function
async function getPersonalizedFeed(following, forceRefresh = false) {
    try {
        const followingUsers = [...following, currentUser.uid];
        const candidatePosts = await getPostsFromUsers(followingUsers, 30);
        
        if (!candidatePosts || candidatePosts.length === 0) {
            return getMixedFeed(following);
        }
        
        const scoredPosts = [];
        for (const post of candidatePosts) {
            const score = await calculatePostScore(post);
            scoredPosts.push({ post, score });
        }
        
        scoredPosts.sort((a, b) => b.score - a.score);
        const topPosts = scoredPosts.slice(0, 15).map(item => item.post);
        return topPosts;
    } catch (error) {
        console.error("Error in personalized feed:", error);
        return getMixedFeed(following);
    }
}

const FEED_STRATEGIES = {
    DISCOVER: 'discover',
    PERSONALIZED: 'personalized',
    TRENDING: 'trending'
};

async function getSmartFeed(userData) {
    const now = new Date();
    const hour = now.getHours();
    
    // Morning: Show trending/popular content
    if (hour >= 6 && hour < 12) {
        return await getMixedFeed(userData.following, true);
    }
    
    // Afternoon: Personalized feed
    if (hour >= 12 && hour < 18) {
        return await getPersonalizedFeed(userData.following, false);
    }
    
    // Evening: Discovery & new content
    if (hour >= 18 || hour < 6) {
        return await getDiscoverFeed(true);
    }
}

function removeDuplicatePosts(posts) {
    if (!posts || !Array.isArray(posts)) return [];
    const seen = new Set();
    return posts.filter(post => {
        if (!post || !post.id) return false;
        if (seen.has(post.id)) return false;
        seen.add(post.id);
        return true;
    });
}

function shuffleArray(array) {
    if (!array || !Array.isArray(array)) return [];
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function renderPostsToContainer(posts) {
    const postsContainer = document.getElementById('postsContainer');
    if (!postsContainer) return;
    
    let appendTarget = postsContainer;
    const header = postsContainer.querySelector('.feed-header');
    if (header) {
        const postsWrapper = document.createElement('div');
        postsWrapper.id = 'postsWrapper';
        header.insertAdjacentElement('afterend', postsWrapper);
        appendTarget = postsWrapper;
    }
    
    if (appendTarget.id === 'postsWrapper') {
        appendTarget.innerHTML = '';
    }
    
    if (!posts || posts.length === 0) {
        appendTarget.innerHTML = `
            <div class="empty-feed">
                <h3>No posts to show</h3>
                <p>Be the first to post something amazing!</p>
            </div>
        `;
        return;
    }
    
    posts.forEach(post => {
        if (post && post.id) {
            const postElement = createPostElement(post.id, post);
            appendTarget.appendChild(postElement);
        }
    });
}

function showEmptyFeedWithSuggestions() {
    const postsContainer = document.getElementById('postsContainer');
    if (!postsContainer) return;
    
    postsContainer.innerHTML = `
        <div class="empty-feed" style="text-align: center; padding: 40px 20px;">
            <i class="fas fa-users fa-3x" style="color: #667eea; margin-bottom: 20px;"></i>
            <h3>Welcome to Future Engineers! 👋</h3>
            <p style="margin: 15px 0 25px; color: #666; max-width: 400px; margin-left: auto; margin-right: auto;">
                Your feed is empty. Follow some users to see their posts, or create your own first post!
            </p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button onclick="document.getElementById('postContent').focus()" class="btn-primary">
                    <i class="fas fa-pen"></i> Create First Post
                </button>
                <button onclick="showDiscoverPage()" class="btn-primary" style="background: #764ba2;">
                    <i class="fas fa-compass"></i> Discover Users
                </button>
            </div>
        </div>
    `;
}

function showDiscoverPage() {
    // Instead of just loading feed, create a proper discover page
    const app = document.getElementById('app');
    
    app.innerHTML = `
        <header class="app-header">
            <div class="container">
                <h1><i class="fas fa-compass"></i> Discover</h1>
                <button onclick="loadPage('feed')" class="logout-btn">
                    <i class="fas fa-arrow-left"></i> Back
                </button>
            </div>
        </header>
        
        <main class="container main-content">
            <div class="discover-container">
                <div class="discover-header">
                    <h2>Discover Users</h2>
                    <p>Find interesting people to follow</p>
                </div>
                
                <div class="discover-filters">
                    <button class="filter-btn active" data-filter="popular">Popular</button>
                    <button class="filter-btn" data-filter="recent">Recently Active</button>
                    <button class="filter-btn" data-filter="similar">Similar to You</button>
                </div>
                
                <div id="discoverUsersList" class="discover-users-list">
                    <div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading suggestions...</div>
                </div>
                
                <div class="discover-actions">
                    <button id="refreshDiscoverBtn" class="btn-primary">
                        <i class="fas fa-redo"></i> Refresh Suggestions
                    </button>
                </div>
            </div>
        </main>
        
        <nav class="bottom-nav">
            <a href="#" class="nav-item" data-page="feed">
                <i class="fas fa-home"></i>
                <span>Feed</span>
            </a>
            <a href="#" class="nav-item active" data-page="discover">
                <i class="fas fa-compass"></i>
                <span>Discover</span>
            </a>
            <a href="#" class="nav-item" data-page="profile">
                <i class="fas fa-user"></i>
                <span>Profile</span>
            </a>
        </nav>
    `;
    
    setupDiscoverPage();
}

function setupDiscoverPage() {
    // Setup navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            if (page === 'discover') {
                showDiscoverPage();
            } else {
                loadPage(page);
            }
        });
    });
    
    // Setup filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const filter = this.getAttribute('data-filter');
            loadDiscoverUsers(filter);
        });
    });
    
    // Setup refresh button
    const refreshBtn = document.getElementById('refreshDiscoverBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            this.classList.add('refreshing');
            const activeFilter = document.querySelector('.filter-btn.active').getAttribute('data-filter');
            loadDiscoverUsers(activeFilter, true);
            setTimeout(() => this.classList.remove('refreshing'), 1000);
        });
    }
    
    // Load initial users
    loadDiscoverUsers('popular');
}

async function loadDiscoverUsers(filter = 'popular', forceRefresh = false) {
    const container = document.getElementById('discoverUsersList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Finding users...</div>';
    
    try {
        let users = [];
        
        switch(filter) {
            case 'popular':
                users = await getPopularUsers(20);
                break;
            case 'recent':
                users = await getRecentlyActiveUsers(20);
                break;
            case 'similar':
                users = await getSimilarUsers(20);
                break;
            default:
                users = await getPopularUsers(20);
        }
        
        if (users.length === 0) {
            container.innerHTML = `
                <div class="empty-discover">
                    <i class="fas fa-users fa-2x"></i>
                    <h3>No users found</h3>
                    <p>Try refreshing or check back later</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        users.forEach(user => {
            const userElement = createDiscoverUserElement(user);
            container.appendChild(userElement);
        });
        
    } catch (error) {
        console.error('Error loading discover users:', error);
        container.innerHTML = '<div class="error">Error loading users. Please try again.</div>';
    }
}

async function getPopularUsers(limit = 10) {
    try {
        const snapshot = await firebase.firestore().collection('users')
            .where('postsCount', '>', 0)
            .orderBy('postsCount', 'desc')
            .limit(limit)
            .get();
        
        const users = [];
        snapshot.forEach(doc => {
            if (doc.id !== currentUser.uid) {
                const data = doc.data();
                users.push({
                    id: doc.id,
                    name: data.name || 'User',
                    email: data.email || '',
                    followerCount: Array.isArray(data.followers) ? data.followers.length : 0,
                    postCount: data.postsCount || 0,
                    lastSeen: data.lastSeen || null
                });
            }
        });
        return users;
    } catch (error) {
        console.error('Error getting popular users:', error);
        return [];
    }
}

async function getRecentlyActiveUsers(limit = 10) {
    try {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const snapshot = await firebase.firestore().collection('users')
            .where('lastSeen', '>=', weekAgo)
            .orderBy('lastSeen', 'desc')
            .limit(limit)
            .get();
        
        const users = [];
        snapshot.forEach(doc => {
            if (doc.id !== currentUser.uid) {
                const data = doc.data();
                users.push({
                    id: doc.id,
                    name: data.name || 'User',
                    email: data.email || '',
                    followerCount: Array.isArray(data.followers) ? data.followers.length : 0,
                    postCount: data.postsCount || 0,
                    lastSeen: data.lastSeen || null
                });
            }
        });
        return users;
    } catch (error) {
        console.error('Error getting recently active users:', error);
        return getPopularUsers(limit);
    }
}

async function getSimilarUsers(limit = 10) {
    try {
        // Get current user's data
        const userDoc = await firebase.firestore().collection('users').doc(currentUser.uid).get();
        if (!userDoc.exists) return getPopularUsers(limit);
        
        const userData = userDoc.data();
        const following = userData.following || [];
        
        if (following.length === 0) return getPopularUsers(limit);
        
        // Get users that are followed by people you follow
        const followingUsers = await firebase.firestore().collection('users')
            .where('__name__', 'in', following.slice(0, 10))
            .get();
        
        const suggested = new Map();
        
        followingUsers.forEach(doc => {
            const data = doc.data();
            if (data.following) {
                data.following.forEach(friendId => {
                    if (friendId !== currentUser.uid && 
                        !following.includes(friendId) &&
                        !suggested.has(friendId)) {
                        suggested.set(friendId, { id: friendId });
                    }
                });
            }
        });
        
        // Get details for suggested users
        const detailedUsers = await Promise.all(
            Array.from(suggested.keys()).slice(0, limit).map(async (userId) => {
                try {
                    const userDoc = await firebase.firestore().collection('users').doc(userId).get();
                    if (userDoc.exists) {
                        const data = userDoc.data();
                        return {
                            id: userId,
                            name: data.name || 'User',
                            email: data.email || '',
                            followerCount: Array.isArray(data.followers) ? data.followers.length : 0,
                            postCount: data.postsCount || 0,
                            lastSeen: data.lastSeen || null
                        };
                    }
                } catch (error) {
                    console.error('Error getting user details:', error);
                }
                return null;
            })
        );
        
        return detailedUsers.filter(user => user !== null).slice(0, limit);
        
    } catch (error) {
        console.error('Error getting similar users:', error);
        return getPopularUsers(limit);
    }
}

function createDiscoverUserElement(user) {
    const div = document.createElement('div');
    div.className = 'discover-user-item';
    
    const avatarColor = getColorFromName(user.name);
    const avatarInitial = user.name.charAt(0).toUpperCase();
    const isFollowing = false; // You'll need to check this from current user's following list
    
    div.innerHTML = `
        <div class="discover-user-info clickable-user" data-user-id="${user.id}">
            <div class="avatar large" style="background: ${avatarColor}">
                ${avatarInitial}
            </div>
            <div class="discover-user-details">
                <div class="discover-user-name">${user.name}</div>
                ${user.email ? `<div class="discover-user-email">${user.email}</div>` : ''}
                <div class="discover-user-stats">
                    <span><i class="fas fa-users"></i> ${user.followerCount} followers</span>
                    <span><i class="fas fa-pen"></i> ${user.postCount} posts</span>
                    ${user.lastSeen ? `<span><i class="fas fa-clock"></i> ${formatTime(user.lastSeen)}</span>` : ''}
                </div>
            </div>
        </div>
        <button class="follow-btn discover-follow-btn" data-user-id="${user.id}">
            ${isFollowing ? '<i class="fas fa-check"></i> Following' : '<i class="fas fa-user-plus"></i> Follow'}
        </button>
    `;
    
    // Add click listener to user info
    const userInfo = div.querySelector('.clickable-user');
    if (userInfo) {
        userInfo.addEventListener('click', function(e) {
            e.stopPropagation();
            loadUserProfile(user.id);
        });
    }
    
    // Add follow button listener
    const followBtn = div.querySelector('.follow-btn');
    if (followBtn) {
        // Check initial following status
        checkFollowingStatus(user.id).then(isFollowing => {
            followBtn.classList.toggle('following', isFollowing);
            followBtn.innerHTML = isFollowing ? 
                '<i class="fas fa-check"></i> Following' : 
                '<i class="fas fa-user-plus"></i> Follow';
        });
        
        followBtn.addEventListener('click', async function(e) {
            e.stopPropagation();
            const userId = this.getAttribute('data-user-id');
            const isCurrentlyFollowing = this.classList.contains('following');
            
            if (isCurrentlyFollowing) {
                await unfollowUser(userId, this);
            } else {
                await followUser(userId, this);
            }
        });
    }
    
    return div;
}


// ===== FOLLOW FUNCTION =====
async function followUser(targetUserId, buttonElement = null) {
    try {
        const currentUserRef = firebase.firestore().collection('users').doc(currentUser.uid);
        const targetUserRef = firebase.firestore().collection('users').doc(targetUserId);
        
        const targetUserDoc = await targetUserRef.get();
        const targetUserName = targetUserDoc.exists ? targetUserDoc.data().name : 'User';
        
        await Promise.all([
            currentUserRef.update({
                following: firebase.firestore.FieldValue.arrayUnion(targetUserId)
            }),
            targetUserRef.update({
                followers: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            })
        ]);
        
        if (buttonElement) {
            buttonElement.innerHTML = '<i class="fas fa-check"></i> Following';
            buttonElement.classList.add('following');
            buttonElement.disabled = true;
        }
        
        showToast(`You're now following ${targetUserName}!`, 'success');
        refreshFeedSuggestions();
        return true;
    } catch (error) {
        console.error('Error following user:', error);
        showToast('Failed to follow user. Please try again.', 'error');
        return false;
    }
}

function refreshFeedSuggestions() {
    const suggestions = document.querySelectorAll('.in-feed-suggestion');
    suggestions.forEach(suggestion => suggestion.remove());
    
    setTimeout(async () => {
        const postsContainer = document.getElementById('postsContainer');
        if (postsContainer) {
            const newSuggestion = await createInFeedSuggestion();
            if (newSuggestion) {
                const posts = postsContainer.querySelectorAll('.post');
                if (posts.length >= 2) {
                    posts[1].insertAdjacentElement('afterend', newSuggestion);
                }
            }
        }
    }, 1000);
}

async function migrateExistingUsers() {
    try {
        const auth = firebase.auth();
        const currentUser = auth.currentUser;
        
        if (currentUser) {
            await ensureUserDocumentExists(currentUser);
        }
    } catch (error) {
        console.error('Error in user migration:', error);
    }
}

function ensureContentDiversity(posts, following) {
    const categorized = {
        followingPosts: [],
        trendingPosts: [],
        discoveryPosts: [],
        ownPosts: []
    };
    
    posts.forEach(post => {
        if (post.userId === currentUser.uid) {
            categorized.ownPosts.push(post);
        } else if (following.includes(post.userId)) {
            categorized.followingPosts.push(post);
        } else if (post.likes > 10) {
            categorized.trendingPosts.push(post);
        } else {
            categorized.discoveryPosts.push(post);
        }
    });
    
    // Ensure mix (e.g., 60% following, 20% trending, 20% discovery)
    const finalPosts = [];
    finalPosts.push(...categorized.followingPosts.slice(0, 9));
    finalPosts.push(...categorized.trendingPosts.slice(0, 3));
    finalPosts.push(...categorized.discoveryPosts.slice(0, 3));
    
    return shuffleArray(finalPosts);
}

function updateBodyBackground() {
    const lastLogin = parseInt(localStorage.getItem('lastLogin') || '0');
    const isRecentlyLoggedIn = Date.now() - lastLogin < 300000;
    
    if (isRecentlyLoggedIn && localStorage.getItem('userAuthenticated') === 'true') {
        document.body.classList.remove('logged-out');
        document.body.classList.add('logged-in');
    } else {
        document.body.classList.remove('logged-in');
        document.body.classList.add('logged-out');
    }
}
function setupAuthListener() {
    if (authListener) authListener();
    
    authListener = firebase.auth().onAuthStateChanged(async function(user) {
        if (user) {
            // User is logged in
            currentUser = user;
            console.log('User authenticated:', user.displayName);
            
            // 🔥 CRITICAL FIX: Ensure user document exists in Firestore
        await ensureUserDocumentExists(user);
         await preloadEssentialData(user);
      updateNotificationCounts();
       setupNotificationsListener();   
            // Update body background
            document.body.classList.remove('logged-out');
            document.body.classList.add('logged-in');
            
            // Store login time
            localStorage.setItem('lastLogin', Date.now().toString());
            localStorage.setItem('userAuthenticated', 'true');
            
            // 🔥 NEW: Initialize cache controls for debugging
            addCacheControls();
            startUnreadListener();
            // Load feed page
            loadPage('feed');
        } else {
       if (notificationsListener) {
         notificationsListener();
         notificationsListener = null; }
            currentUser = null;

            // 🔥 STOP LISTENERS
            if (postsListener) {
                postsListener();
                postsListener = null;
            }
            if (commentsListener) {
                commentsListener();
                commentsListener = null;
            }

            // 🔥 REMOVE LOADING SPINNER (CRITICAL)
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) {
                loadingScreen.remove();
            }

            // 🔥 RESET STORAGE
            localStorage.removeItem('userAuthenticated');
            localStorage.removeItem('lastLogin');
            
            // 🔥 NEW: Clear user-specific cache
            if (window.cache) {
                cache.clearCache('users'); // Clear user cache but keep posts
                // Keep posts cache for faster login if user comes back
            }

            // 🔥 RESET BODY STATE
            document.body.className = '';
            document.body.classList.add('logged-out');

            updateBodyBackground();

            // 🔥 LOAD LOGIN UI
            loadPage('login', false);
        }
    });
}
async function preloadEssentialData(user) {
    try {
        console.log('Preloading essential data...');
        
        // 1. Load current user's data
        await loadUserData(user.uid, true);
        
        // 2. Preload user's own posts count
        const userPostsQuery = await firebase.firestore().collection('posts')
            .where('userId', '==', user.uid)
            .limit(1)
            .get();
        
        // 3. Preload recent posts in background (non-blocking)
        setTimeout(async () => {
            try {
                const recentPosts = await firebase.firestore().collection('posts')
                    .orderBy('createdAt', 'desc')
                    .limit(20)
                    .get();
                
                const posts = [];
                recentPosts.forEach(doc => {
                    posts.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                // Update cache
                cache.posts.data = posts;
                cache.posts.lastUpdated = Date.now();
                cache.persistCache();
                
                console.log('Preloaded', posts.length, 'posts into cache');
            } catch (error) {
                console.warn('Background posts preload failed:', error);
            }
        }, 1000); // Delay to prioritize UI rendering
        
        // 4. Preload user's followers/following count
        const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            // Cache the user data
            cache.users.set(user.uid, {
                data: userData,
                cachedAt: Date.now()
            });
            cache.persistCache();
        }
        
        console.log('Essential data preloaded');
    } catch (error) {
        console.warn('Preloading failed:', error);
        // Non-critical, continue anyway
    }
}
function updateCacheStats() {
    const controls = document.getElementById('cacheControls');
    if (controls && window.cache) {
        const userCount = cache.users.size;
        const postCount = cache.posts.data.length;
        const commentCount = cache.comments.size;
        const cacheAge = cache.posts.lastUpdated ? 
            Math.round((Date.now() - cache.posts.lastUpdated) / 1000) + 's ago' : 
            'Never';
        
        controls.innerHTML = `
            <div style="font-weight:bold;margin-bottom:5px;">Cache Stats</div>
            <div>👤 Users: ${userCount}</div>
            <div>📝 Posts: ${postCount} (${cacheAge})</div>
            <div>💬 Comments: ${commentCount}</div>
            <div style="margin-top:10px;border-top:1px solid rgba(255,255,255,0.2);padding-top:5px;">
                <button onclick="cache.clearCache('posts')" 
                    style="margin-right:5px;padding:2px 5px;font-size:10px;">
                    Clear Posts
                </button>
                <button onclick="cache.clearCache('all')" 
                    style="padding:2px 5px;font-size:10px;background:#ff4757;">
                    Clear All
                </button>
            </div>
        `;
        
        // Re-add close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            position: absolute;
            top: 2px;
            right: 5px;
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            font-size: 14px;
        `;
        closeBtn.onclick = () => {
            controls.style.display = 'none';
        };
        controls.appendChild(closeBtn);
    }
}
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('Cache debugging enabled. Press Ctrl+Shift+C to toggle cache stats.');
}

async function ensureUserDocumentExists(user) {
    const userRef = firebase.firestore().collection('users').doc(user.uid);
    
    // Check cache first
    if (cache.users.has(user.uid)) {
        const cachedUser = cache.users.get(user.uid);
        if (Date.now() - cachedUser.cachedAt < 10 * 60 * 1000) { // 10 minutes TTL
            console.log('Using cached user data for:', user.uid);
            return cachedUser.data;
        }
    }
    
    try {
        const doc = await userRef.get();
        
        let userData;
        if (!doc.exists) {
            // User document doesn't exist, create it
            console.log('Creating user document for:', user.uid);
            
            userData = {
                name: user.displayName || 'User',
                email: user.email || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                followers: [],
                following: [],
                postsCount: 0,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await userRef.set(userData);
            console.log('User document created successfully');
        } else {
            userData = doc.data();
            // Update last seen timestamp
            await userRef.update({
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Cache the user data
        cache.users.set(user.uid, {
            data: userData,
            cachedAt: Date.now()
        });
        cache.persistCache();
        
        return userData;
    } catch (error) {
        console.error('Error ensuring user document:', error);
        return null;
    }
}

// Handle page navigation
function loadPage(pageName, pushState = true) {
    console.log('Loading page:', pageName);
    
    // Update current page
    currentPage = pageName;
    
    // Hide loading screen
    hideLoading();
    
    hideNewPostsButton();
    // Load the appropriate page
    switch(pageName) {
        case 'login':
            renderLoginPage();
            break;
        case 'feed':
            renderFeedPage();
            break;
case 'messages':
    renderMessagesPage();
    break;
        case 'notifications':
            renderNotificationsPage();
            break;
        case 'profile':
            renderProfilePage();
            break;
        default:
            renderFeedPage();
    }
    
    // Update browser history
    if (pushState) {
        history.pushState({ page: pageName }, '', `#${pageName}`);
    }
    
    // Update navigation active state
    updateNavActiveState(pageName);
}

// Then add this handler function:
async function handleNotificationClick(notificationId, type, postId, userId) {
    console.log('Handling notification click:', { notificationId, type, postId, userId });
    
    // Mark as read
    if (notificationId) {
        await markNotificationAsRead(notificationId);
    }
    
    // Handle based on type
    switch(type) {
        case 'like':
        case 'comment':
        case 'mention':
        case 'reply':
            if (postId) {
                await openPostFromNotification(postId);
            } else {
                showToast('Post reference missing', 'error');
            }
            break;
            
        case 'follow':
            if (userId) {
                openUserFromNotification(userId);
            } else {
                showToast('User reference missing', 'error');
            }
            break;
            
        default:
            showToast('Unknown notification type', 'info');
    }
}



function handleNavigation(event) {
    if (event.state && event.state.page) {
        loadPage(event.state.page, false);
    } else {
        // Default to feed if logged in, login if not
        if (currentUser) {
            loadPage('feed', false);
        } else {
            loadPage('login', false);
        }
    }
}
function showLoading() {
    let loadingScreen = document.getElementById('loadingScreen');

    if (!loadingScreen) {
        loadingScreen = document.createElement('div');
        loadingScreen.id = 'loadingScreen';
        loadingScreen.className = 'loading-screen active';
        loadingScreen.innerHTML = `
            <div class="spinner"></div>
            <div>Loading...</div>
        `;
        document.body.appendChild(loadingScreen);
    }

    loadingScreen.classList.add('active');
}
function hideLoading() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.remove('active');
        setTimeout(() => {
            if (loadingScreen.parentNode) {
                loadingScreen.parentNode.removeChild(loadingScreen);
            }
        }, 300);
    }
}
function updateNavActiveState(pageName) {
    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active class to current page
    const activeNav = document.querySelector(`.nav-item[data-page="${pageName}"]`);
    if (activeNav) {
        activeNav.classList.add('active');
    }
}
function renderLoginPage() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="login-page-wrapper">
            <div class="auth-box" id="authBox">
                <!-- Login Form -->
                <form id="loginForm">
                    <div class="form-group">
                        <input type="email" id="loginEmail" placeholder="Email" required>
                    </div>
                    <div class="form-group">
                        <input type="password" id="loginPassword" placeholder="Password" required>
                    </div>
                    <button type="submit" class="auth-btn" id="loginBtn">Login</button>
                    <p>Login or sign up to finish setting up your profile</p>
                    <div id="loginError" class="error"></div>
                </form>
                
                <!-- Signup Form -->
                <form id="signupForm" class="hidden">
                    <div class="form-group">
                        <input type="text" id="signupName" placeholder="Full Name" required>
                    </div>
                    <div class="form-group">
                        <input type="email" id="signupEmail" placeholder="Email" required>
                    </div>
                    <div class="form-group">
                        <input type="password" id="signupPassword" placeholder="Password (min 6 characters)" required>
                    </div>
                    <button type="submit" class="auth-btn" id="signupBtn">Sign Up</button>
                    <div id="signupError" class="error"></div>
                </form>
                
                <div class="switch">
                    <span id="switchText">Don't have an account?</span>
                    <a id="showSignup" class="switch-link">Sign up</a>
                    <a id="showLogin" class="switch-link hidden">Login</a>
                </div>
            </div>
        </div>
    `;
    
    setupLoginForms();
}
function setupLoginForms() {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const showSignup = document.getElementById('showSignup');
    const showLogin = document.getElementById('showLogin');
    const switchText = document.getElementById('switchText');
    
    if (!loginForm || !signupForm) return;
    
    // Initial state
    signupForm.classList.add('hidden');
    showLogin.classList.add('hidden');
    
    // Switch forms
    showSignup.addEventListener('click', function(e) {
        e.preventDefault();
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        showSignup.classList.add('hidden');
        showLogin.classList.remove('hidden');
        if (switchText) switchText.textContent = 'Already have an account?';
    });
    
    showLogin.addEventListener('click', function(e) {
        e.preventDefault();
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        showLogin.classList.add('hidden');
        showSignup.classList.remove('hidden');
        if (switchText) switchText.textContent = 'Don\'t have an account?';
    });
    
    // Login form
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        if (!email || !password) {
            document.getElementById('loginError').textContent = 'Please fill in all fields';
            return;
        }
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Logging in...';
        submitBtn.disabled = true;
        
        firebase.auth().signInWithEmailAndPassword(email, password)
            .then(function() {
                // Auth listener will automatically redirect to feed
            })
            .catch(function(error) {
                document.getElementById('loginError').textContent = error.message;
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            });
    });
    
    // Signup form
    // Signup form - UPDATED: More robust user creation
signupForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    
    if (!name || !email || !password) {
        document.getElementById('signupError').textContent = 'Please fill in all fields';
        return;
    }
    
    if (password.length < 6) {
        document.getElementById('signupError').textContent = 'Password must be at least 6 characters';
        return;
    }
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating account...';
    submitBtn.disabled = true;
    
    firebase.auth().createUserWithEmailAndPassword(email, password)
        .then(function(userCredential) {
            // Update profile with display name
            return userCredential.user.updateProfile({
                displayName: name
            }).then(function() {
                // Create user document in Firestore
                return firebase.firestore().collection('users').doc(userCredential.user.uid).set({
                    name: name,
                    email: email,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    followers: [],
                    following: [],
                    postsCount: 0,
                    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
        })
        .then(function() {
            // Auth listener will automatically redirect to feed
            console.log('User created successfully');
        })
        .catch(function(error) {
            document.getElementById('signupError').textContent = error.message;
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        });
});
    
}


function renderFeedPage() { 
    // ENHANCED WITH FEED CONTROLS
    const app = document.getElementById('app');
    app.innerHTML = `
        <!-- Header -->
        <header class="app-header">
            <div class="container">
                <h1>Future Engineers</h1>
                <button id="logoutBtn" class="logout-btn">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </button>
            </div>
        </header>

        <!-- Main Content -->
        <main class="container main-content">
            <!-- Create Post -->
            <div class="create-post">
                <textarea id="postContent" placeholder="What's on your mind?" rows="3"></textarea>
                <div class="post-options">
                    <div class="color-picker">
                        <span>Background:</span>
                        <div class="color-options">
                            <div class="color-option" data-color="transparent" style="background: white; border: 1px solid #ddd;"></div>
                            <div class="color-option" data-color="#ffcdd2" style="background: #ffcdd2;"></div>
                            <div class="color-option" data-color="#bbdefb" style="background: #bbdefb;"></div>
                            <div class="color-option" data-color="#c8e6c9" style="background: #c8e6c9;"></div>
                            <div class="color-option" data-color="#ffe0b2" style="background: #ffe0b2;"></div>
                            <div class="color-option" data-color="#e1bee7" style="background: #e1bee7;"></div>
                            <div class="color-option" data-color="#ffcc80" style="background: #ffcc80;"></div>
                            <div class="color-option" data-color="#80deea" style="background: #80deea;"></div>
                        </div>
                    </div>
                </div>
                <button id="createPostBtn" class="btn-primary">
                    <i class="fas fa-paper-plane"></i> Post
                </button>
            </div>
            
            <!-- Feed Controls -->
            <div class="feed-controls">
                <div class="feed-stats">
                    <span class="seen-counter" id="seenCounter" style="display: none;">
                        <i class="fas fa-eye"></i> <span id="seenCount">0</span> seen
                    </span>
                </div>
                <button id="refreshFeedBtn" class="feed-refresh-btn" title="Refresh feed">
                    <i class="fas fa-redo"></i>
                </button>
            </div>
            
            <!-- Feed -->
            <div class="feed">
                <div id="postsContainer">
                    <div class="loading">Loading posts...</div>
                </div>
            </div>
        </main>

        <!-- Bottom Navigation -->
        <nav class="bottom-nav">
            <a href="#" class="nav-item active" data-page="feed">
                <i class="fas fa-home"></i>
                <span>Feed</span>
            </a>
            <a href="#" class="nav-item" data-page="messages">
                <i class="fas fa-envelope"></i>
                <span>Messages</span>
                <span class="unread-badge" id="messageBadge" style="display:none">0</span>
            </a>
      <a href="#" class="nav-item" data-page="notifications">
    <i class="fas fa-bell"></i>
    <span>Notifications</span>
    <span class="unread-badge" id="notificationBadge" style="display:none"></span>
</a>
            <a href="#" class="nav-item" data-page="profile">
                <i class="fas fa-user"></i>
                <span>Profile</span>
            </a>
        </nav>

        <!-- Overlay for modal -->
        <div id="overlay"></div>

        <!-- Bottom Sheet Comment Modal -->
        <div id="commentModal">
            <div class="handle-bar"></div>
            <div class="modal-header">
                <h3>Comments</h3>
                <button class="close-modal">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-content">
                <div class="comments-container">
                    <div id="commentsList">
                        <!-- Comments will be loaded here -->
                    </div>
                </div>
                <div class="add-comment">
                    <textarea id="commentInput" placeholder="Write a comment..." rows="1"></textarea>
                    <button id="postCommentBtn">Post</button>
                </div>
            </div>
        </div>
    `;
    
    setupFeedPage();
}
function setupFeedPage() {
    // Setup navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            loadPage(page);
        });
    });
    
    // Setup logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Show loading state
            const originalHtml = this.innerHTML;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging out...';
            this.disabled = true;
            
            // Sign out
            firebase.auth().signOut().then(function() {
                console.log('Sign out successful');
                // Auth listener will automatically redirect to login
            }).catch(function(error) {
                console.error('Sign out error:', error);
                logoutBtn.innerHTML = originalHtml;
                logoutBtn.disabled = false;
                
            });
        });
    }
    
    // Setup color picker for posts
    setupColorPicker();
    
    const refreshBtn = document.getElementById('refreshFeedBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            this.classList.add('refreshing');
            loadPosts(true); // Force refresh
            setTimeout(() => this.classList.remove('refreshing'), 1000);
        });
    }
    
    // Setup create post
    const createPostBtn = document.getElementById('createPostBtn');
    if (createPostBtn) {
        createPostBtn.addEventListener('click', createPost);
    }
    
    // Enter key for creating post
    const postContent = document.getElementById('postContent');
    if (postContent) {
        postContent.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                createPost();
            }
        });
    }
    
    // Setup comment modal
    const closeModalBtn = document.querySelector('.close-modal');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeCommentModal);
    }
    
    const overlay = document.getElementById('overlay');
    if (overlay) {
        overlay.addEventListener('click', closeCommentModal);
    }
    
    // Post comment
    const postCommentBtn = document.getElementById('postCommentBtn');
    if (postCommentBtn) {
        postCommentBtn.addEventListener('click', postComment);
    }
    
    // Enter key for comment
    const commentInput = document.getElementById('commentInput');
    if (commentInput) {
        commentInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                postComment();
            }
        });
    }
    
    // Escape key to close modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeCommentModal();
        }
    });
    
    // Load posts with a small delay to ensure DOM is ready
    setTimeout(() => {
        loadPosts();
    }, 100);
}

// Setup color picker
function setupColorPicker() {
    const colorOptions = document.querySelectorAll('.color-option');
    let selectedColor = 'transparent';
    
    colorOptions.forEach(option => {
        option.addEventListener('click', function() {
            // Remove selected class from all
            colorOptions.forEach(opt => opt.classList.remove('selected'));
            
            // Add selected class to clicked
            this.classList.add('selected');
            selectedColor = this.getAttribute('data-color');
            
            // Update only post textarea background (not the whole card)
            const postContent = document.getElementById('postContent');
            if (postContent) {
                postContent.style.backgroundColor = selectedColor;
                // Add some padding for better appearance
                if (selectedColor !== 'transparent') {
                    postContent.style.padding = '20px';
                } else {
                    postContent.style.padding = '14px 16px';
                }
            }
        });
    });
    
    // Select transparent by default
    if (colorOptions[0]) {
        colorOptions[0].classList.add('selected');
    }
}
function getSelectedColor() {
    const selectedOption = document.querySelector('.color-option.selected');
    return selectedOption ? selectedOption.getAttribute('data-color') : 'transparent';
}
async function createPost() {
    const content = document.getElementById('postContent').value.trim();
    if (!content) {
        // Visual feedback
        const postInput = document.getElementById('postContent');
        postInput.style.borderColor = '#ff4757';
        postInput.style.boxShadow = '0 0 0 2px rgba(255, 71, 87, 0.2)';
        postInput.placeholder = 'Please write something first!';
        // Ensure user document exists after creating post
        ensureUserDocumentExists(currentUser);
        setTimeout(function() {
            postInput.style.borderColor = '#ddd';
            postInput.style.boxShadow = 'none';
            postInput.placeholder = "What's on your mind?";
        }, 2000);
        return;
    }
    
    const createBtn = document.getElementById('createPostBtn');
    const originalText = createBtn.innerHTML;
    createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';
    createBtn.style.border = '.5px dashed #ddd';
    createBtn.disabled = true;
    
    try {
        const backgroundColor = getSelectedColor();
        
        // Use await without .then()
        await firebase.firestore().collection('posts').add({
            content: content,
            userId: currentUser.uid,
            userName: currentUser.displayName || 'Anonymous',
            userPhotoURL: currentUser.photoURL || '',
            backgroundColor: backgroundColor,
            likes: [],
            commentsCount: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Success feedback (this runs after the await)
        const postInput = document.getElementById('postContent');
        postInput.value = '';
        postInput.style.backgroundColor = 'white';
        
        // Reset color picker
        const colorOptions = document.querySelectorAll('.color-option');
        colorOptions.forEach(opt => opt.classList.remove('selected'));
        if (colorOptions[0]) colorOptions[0].classList.add('selected');
        
        // Invalidate cache
        invalidateCache('post');
        
        // Show success message
        showToast('Posted', 'success');
        
    } catch (error) {
        console.error('Error creating post:', error);
        showToast('Failed to publish post. Please try again.', 'error');
    } finally {
        createBtn.innerHTML = originalText;
        createBtn.disabled = false;
    }
}

// Add to setupFeedPage() or create a debug menu
function addCacheControls() {
   }
// Cache invalidation function
function invalidateCache(type, id = null) {
    switch(type) {
        case 'post':
            cache.posts.data = [];
            cache.posts.lastUpdated = 0;
            if (id && cache.comments.has(id)) {
                cache.comments.delete(id);
            }
            break;
        case 'user':
            if (id) {
                cache.users.delete(id);
            } else {
                cache.users.clear();
            }
            break;
        case 'all':
            cache.clearCache('all');
            break;
    }
    cache.persistCache();
}
function showCacheStats() {
    const controls = document.getElementById('cacheControls');
    if (controls) {
        const userCount = cache.users.size;
        const postCount = cache.posts.data.length;
        const commentCount = cache.comments.size;
        
        controls.innerHTML = `
            <div>Users: ${userCount}</div>
            <div>Posts: ${postCount}</div>
            <div>Comments: ${commentCount}</div>
            <button onclick="cache.clearCache('all')" style="margin-top:5px;padding:2px 5px;font-size:10px;">
                Clear Cache
            </button>
        `;
        controls.style.display = 'block';
    }
}
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        showCacheStats();
    }
});
// Toast notification helper
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 99999;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }
    }, 3000);
}


// Create post element - UPDATED: Colored background touches borders
function createPostElement(postId, post) {
    const div = document.createElement('div');
    div.className = 'post';
    div.dataset.postId = postId;
    
    // Apply background color only to content area, not whole post
    const hasBackgroundColor = post.backgroundColor && post.backgroundColor !== 'transparent';
    
    if (hasBackgroundColor) {
        div.classList.add('colored-post');
    }
    
    const isLiked = post.likes && post.likes.includes(currentUser.uid);
    const likesCount = post.likes ? post.likes.length : 0;
    const isAuthor = post.userId === currentUser.uid;
    
    // Use safe defaults
    const userName = post.userName || 'Anonymous';
    const avatarColor = getColorFromName(userName);
    const avatarInitial = userName.charAt(0).toUpperCase();
    
    // Create user document if it doesn't exist
    if (post.userId && !isAuthor) {
        createUserDocumentFromPostData(post.userId, userName, '');
    }
    
    // Create the post with new structure - color touches borders
    div.innerHTML = `
        <!-- Header (Always white) -->
        <div class="post-header">
            <div class="user-info clickable-user" data-user-id="${post.userId}">
                <div class="avatar" style="background: ${avatarColor}">
                    ${avatarInitial}
                </div>
                <div>
                    <div class="user-name">${userName}</div>
                    <div class="post-time">${formatTime(post.createdAt)}</div>
                </div>
            </div>
            ${isAuthor ? `
            <div class="post-actions-menu">
                <button class="post-menu-btn">
                    <i class="fas fa-ellipsis-h"></i>
                </button>
                <div class="post-menu-dropdown">
                    <button class="edit-post-btn" data-id="${postId}">Edit</button>
                    <button class="delete-post-btn" data-id="${postId}">Delete</button>
</div>
            </div>
            ` : ''}
        </div>
        
        <!-- Content Area (Colored background touches borders) -->
        <div class="post-content-wrapper" style="${hasBackgroundColor ? `background-color: ${post.backgroundColor};` : ''}">
            <div class="post-content">${escapeHtml(post.content)}</div>
        </div>
        
        <!-- Stats (Always light gray) -->
        <div class="post-stats">
            <span class="likes-count">${likesCount} ${likesCount === 1 ? 'like' : 'likes'}</span>
            <span>•</span>
            <span class="comments-count">${post.commentsCount || 0} ${post.commentsCount === 1 ? 'comment' : 'comments'}</span>
        </div>
        
        <!-- Actions (Always white) -->
        <div class="post-actions">
            <button class="like-btn ${isLiked ? 'liked' : ''}" data-id="${postId}">
                <i class="fas fa-thumbs-up"></i>
                <span>${isLiked ? ' Liked' : ' Like'}</span>
            </button>
            <button class="comment-btn" data-id="${postId}">
                <i class="fas fa-comment"></i>
                <span> Comment</span>
            </button>
        </div>
    `;
    
    // Add event listeners
    const likeBtn = div.querySelector('.like-btn');
    const commentBtn = div.querySelector('.comment-btn');
    const userInfo = div.querySelector('.clickable-user');
    
    if (likeBtn) {
        likeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleLike(postId, likeBtn, div.querySelector('.likes-count'));
        });
    }
    
    if (commentBtn) {
        commentBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openCommentModal(postId);
        });
    }
    
    // Add click listener to user info
    if (userInfo) {
        userInfo.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const userId = this.getAttribute('data-user-id');
            if (userId && userId !== currentUser?.uid) {
                loadUserProfile(userId);
            }
        });
        userInfo.style.cursor = 'pointer';
    }
    
    // Add edit/delete listeners for author
    if (isAuthor) {
        const menuBtn = div.querySelector('.post-menu-btn');
        const editBtn = div.querySelector('.edit-post-btn');
        const deleteBtn = div.querySelector('.delete-post-btn');
        const dropdown = div.querySelector('.post-menu-dropdown');
        
        menuBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });
        
        editBtn.addEventListener('click', function() {
            editPost(postId, post.content);
        });
        
        deleteBtn.addEventListener('click', function() {
            deletePost(postId);
        });
        
        // Close dropdown when clicking elsewhere
        document.addEventListener('click', function() {
            dropdown.classList.remove('show');
        });
    }
    
    setupPostLikeListener(postId, div);
    
    return div;
}
function setupPostLikeListener(postId, postElement) {
    const postRef = firebase.firestore().collection('posts').doc(postId);
    
    // Listen for like changes in real-time
    const likeListener = postRef.onSnapshot((doc) => {
        if (doc.exists) {
            const updatedPost = doc.data();
            const likesCount = updatedPost.likes ? updatedPost.likes.length : 0;
            const isLiked = updatedPost.likes && updatedPost.likes.includes(currentUser.uid);
            
            // Update like count
            const likesCountElement = postElement.querySelector('.likes-count');
            if (likesCountElement) {
                likesCountElement.textContent = `${likesCount} ${likesCount === 1 ? 'like' : 'likes'}`;
            }
            
            // Update like button state
            const likeBtn = postElement.querySelector('.like-btn');
            if (likeBtn) {
                if (isLiked && !likeBtn.classList.contains('liked')) {
                    likeBtn.classList.add('liked');
                    likeBtn.querySelector('span').textContent = ' Liked';
                } else if (!isLiked && likeBtn.classList.contains('liked')) {
                    likeBtn.classList.remove('liked');
                    likeBtn.querySelector('span').textContent = ' Like';
                }
            }
        }
    }, (error) => {
        console.error("Error listening to post likes:", error);
    });
    
    // Store listener reference for cleanup
    postElement._likeListener = likeListener;
}
// Toggle like
async function toggleLike(postId, likeButton, likesCountElement) {
    if (!postId || !likeButton) return;
    
    const postRef = firebase.firestore().collection('posts').doc(postId);
    
    const isLiked = likeButton.classList.contains('liked');
    
    likeButton.disabled = true;
    
    try {
        const postDoc = await postRef.get();
        if (!postDoc.exists) {
            likeButton.disabled = false;
            return;
        }
        
        const post = postDoc.data();
        const postAuthorId = post.userId;
        
        if (isLiked) {
            // Unlike
            await postRef.update({
                likes: firebase.firestore.FieldValue.arrayRemove(currentUser.uid),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // Like
            await postRef.update({
                likes: firebase.firestore.FieldValue.arrayUnion(currentUser.uid),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Create notification for post author (unless it's your own post)
            if (postAuthorId !== currentUser.uid) {
                await createNotification(postAuthorId, 'like', {
                    postId: postId,
                    postContent: post.content?.substring(0, 100) || '',
                    likesCount: (post.likes?.length || 0) + 1
                });
            }
        }
        
        likeButton.disabled = false;
        
    } catch (error) {
        console.error('Error toggling like:', error);
        likeButton.disabled = false;
        showToast('Failed to update like. Please try again.', 'error');
    }
}
async function updateOtherUserPostsCount(userId) {
    if (!userId) return;
    
    try {
        const snapshot = await firebase.firestore().collection('posts')
            .where('userId', '==', userId)
            .get();
        
        const postsCountElement = document.getElementById('otherUserPostsCount');
        if (postsCountElement) {
            postsCountElement.textContent = snapshot.size;
        }
    } catch (error) {
        console.error('Error updating other user posts count:', error);
    }
}
function editPost(postId, currentContent) {
    const newContent = prompt('Edit your post:', currentContent);
    if (newContent !== null && newContent.trim() !== '' && newContent !== currentContent) {
        firebase.firestore().collection('posts').doc(postId).update({
            content: newContent.trim(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function(error) {
            console.error('Error editing post:', error);
        });
    }
}
function deletePost(postId) {
    if (confirm('Are you sure you want to delete this post?')) {
        firebase.firestore().collection('posts').doc(postId).delete()
            .then(function() {
                console.log('Post deleted');
                // Invalidate cache
                invalidateCache('post', postId);
            })
            .catch(function(error) {
                console.error('Error deleting post:', error);
            });
    }
}
function openCommentModal(postId) {
    console.log('Opening comment modal for post:', postId);
    
    if (!postId) {
        console.error('No postId provided to openCommentModal');
        return;
    }
    
    currentPostId = postId;
    
    const modal = document.getElementById('commentModal');
    const overlay = document.getElementById('overlay');
    
    if (!modal) {
        // Try to create modal if it doesn't exist
        console.log('Creating comment modal...');
        createCommentModal();
        
        // Try to get it again
        const newModal = document.getElementById('commentModal');
        const newOverlay = document.getElementById('overlay');
        
        if (!newModal || !newOverlay) {
            console.error('Failed to create comment modal');
            return;
        }
        
        modal = newModal;
        overlay = newOverlay;
    }
    
    if (!overlay) {
        console.error('Overlay element not found');
        return;
    }
    
    document.getElementById('commentInput').value = '';
    
    overlay.style.display = 'block';
    modal.classList.add('active');
    
    setTimeout(function() {
        const commentInput = document.getElementById('commentInput');
        if (commentInput) {
            commentInput.focus();
        }
    }, 300);
    
    loadComments(postId);
}
// Add this function to create modal dynamically
function createCommentModal() {
    const modalHTML = `
        <div id="overlay"></div>
        <div id="commentModal">
            <div class="handle-bar"></div>
            <div class="modal-header">
                <h3>Comments</h3>
                <button class="close-modal">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-content">
                <div class="comments-container">
                    <div id="commentsList">
                        <!-- Comments will be loaded here -->
                    </div>
                </div>
                <div class="add-comment">
                    <textarea id="commentInput" placeholder="Write a comment..." rows="1"></textarea>
                    <button id="postCommentBtn">Post</button>
                </div>
            </div>
        </div>
    `;
    
    // Append to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Setup handlers
    setupCommentModalHandlers();
}
function closeCommentModal() {
    const modal = document.getElementById('commentModal');
    const overlay = document.getElementById('overlay');
    
    if (!modal || !overlay) return;
    
    modal.classList.remove('active');
    
    setTimeout(function() {
        overlay.style.display = 'none';
        
        if (commentsListener) {
            commentsListener();
            commentsListener = null;
        }
    }, 300);
}
function loadComments(postId) {
    const commentsList = document.getElementById('commentsList');
    if (!commentsList) return;
    
    // Clear any existing listener
    if (commentsListener) {
        commentsListener();
        commentsListener = null;
    }
    
    // Check cache first
    if (cache.comments.has(postId)) {
        const cachedComments = cache.comments.get(postId);
        if (Date.now() - cachedComments.timestamp < 2 * 60 * 1000) { // 2 minutes TTL
            console.log('Loading comments from cache for post:', postId);
            renderComments(commentsList, cachedComments.data);
            
            // Still setup real-time listener
            setupCommentsRealTimeListener(postId, commentsList);
            return;
        }
    }
    
    // Show loading
    commentsList.innerHTML = '<div class="loading-comments"><i class="fas fa-spinner fa-spin"></i> Loading comments...</div>';
    
    // Setup real-time listener
    setupCommentsRealTimeListener(postId, commentsList);
}

function setupCommentsRealTimeListener(postId, commentsList) {
    if (commentsListener) commentsListener();
    
    commentsListener = firebase.firestore().collection('posts').doc(postId)
        .collection('comments')
        .orderBy('createdAt', 'asc')
        .limit(100) // Increased limit for better real-time experience
        .onSnapshot((snapshot) => {
            if (!commentsList) return;
            
            if (snapshot.empty) {
                commentsList.innerHTML = '<div class="empty-comments">No comments yet. Be the first to comment!</div>';
                cache.comments.set(postId, { data: [], timestamp: Date.now() });
                return;
            }
            
            const comments = [];
            snapshot.forEach((doc) => {
                const comment = {
                    id: doc.id,
                    ...doc.data()
                };
                
                // Ensure createdAt is a Firestore timestamp
                if (!comment.createdAt || !comment.createdAt.toDate) {
                    comment.createdAt = { toDate: () => new Date() };
                }
                
                comments.push(comment);
            });
            
            // Cache comments
            cache.comments.set(postId, {
                data: comments,
                timestamp: Date.now()
            });
            
            renderComments(commentsList, comments);
            
            // Auto-scroll to bottom for new comments
            setTimeout(() => {
                if (commentsList.scrollHeight > commentsList.clientHeight) {
                    commentsList.scrollTop = commentsList.scrollHeight;
                }
            }, 100);
            
        }, (error) => {
            console.error('Error loading comments:', error);
            // If we have cached comments, show them
            if (cache.comments.has(postId)) {
                const cachedComments = cache.comments.get(postId);
                renderComments(commentsList, cachedComments.data);
                showToast('Showing cached comments', 'info');
            } else {
                commentsList.innerHTML = '<div class="error-comments">Error loading comments</div>';
            }
        });
}

function loadFreshComments(postId, commentsList) {
    if (commentsListener) commentsListener();
    
    commentsListener = firebase.firestore().collection('posts').doc(postId)
        .collection('comments')
        .orderBy('createdAt', 'asc')
        .limit(50)
        .onSnapshot(function(snapshot) {
            if (snapshot.empty) {
                commentsList.innerHTML = '<div class="empty-comments">No comments yet. Be the first to comment!</div>';
                cache.comments.set(postId, { data: [], timestamp: Date.now() });
                return;
            }
            
            const comments = [];
            snapshot.forEach(function(doc) {
                const comment = {
                    id: doc.id,
                    ...doc.data()
                };
                comments.push(comment);
            });
            
            // Cache comments
            cache.comments.set(postId, {
                data: comments,
                timestamp: Date.now()
            });
            
            renderComments(commentsList, comments);
            
            setTimeout(function() {
                commentsList.scrollTop = commentsList.scrollHeight;
            }, 100);
        }, function(error) {
            console.error('Error loading comments:', error);
            // If we have cached comments, show them
            if (cache.comments.has(postId)) {
                const cachedComments = cache.comments.get(postId);
                renderComments(commentsList, cachedComments.data);
                showToast('Showing cached comments', 'info');
            } else {
                commentsList.innerHTML = '<div class="error-comments">Error loading comments</div>';
            }
        });
}
function renderComments(container, comments) {
    container.innerHTML = '';
    comments.forEach(function(commentData) {
        const commentElement = createCommentElement(commentData.id, commentData);
        container.appendChild(commentElement);
    });
}

// Create comment element 
function createCommentElement(commentId, comment) {
    const div = document.createElement('div');
    div.className = 'comment';
    div.dataset.commentId = commentId;
    
    const isAuthor = comment.userId === currentUser.uid;
    const likesCount = comment.likes ? comment.likes.length : 0;
    const isLiked = comment.likes && comment.likes.includes(currentUser.uid);
    
    // Generate a color for the avatar
    const avatarColor = getColorFromName(comment.userName);
    const avatarInitial = comment.userName ? comment.userName.charAt(0).toUpperCase() : 'A';
    
    div.innerHTML = `
        <div class="comment-header">
            <div class="user-info clickable-user" data-user-id="${comment.userId}">
                <div class="avatar small" style="background: ${avatarColor}">
                    ${avatarInitial}
                </div>
                <div>
                    <div class="user-name">${comment.userName || 'Anonymous'}</div>
                    <div class="comment-time">${formatTime(comment.createdAt)}</div>
                </div>
            </div>
            ${isAuthor ? `
            <div class="comment-actions-menu">
                <button class="comment-menu-btn">
                    <i class="fas fa-ellipsis-h"></i>
                </button>
                <div class="comment-menu-dropdown">
                    <button class="delete-comment-btn" data-id="${commentId}">Delete</button>
                </div>
            </div>
            ` : ''}
        </div>
        <div class="comment-content">${escapeHtml(comment.content)}</div>
        <div class="comment-actions">
            <button class="comment-like-btn ${isLiked ? 'liked' : ''}" data-id="${commentId}">
                <i class="fas fa-thumbs-up"></i>
                <span class="comment-likes-count">${likesCount}</span>
            </button>
        </div>
    `;
    
    // Add event listeners
    const likeBtn = div.querySelector('.comment-like-btn');
    const userInfo = div.querySelector('.clickable-user');
    
    likeBtn.addEventListener('click', function() {
        toggleCommentLike(commentId, likeBtn, div.querySelector('.comment-likes-count'));
    });
    
    // Add click listener to user info
    if (userInfo) {
        userInfo.addEventListener('click', function(e) {
            e.stopPropagation();
            const userId = this.getAttribute('data-user-id');
            if (userId && userId !== currentUser.uid) {
                loadUserProfile(userId);
            }
        });
        
        // Make cursor pointer for clickable user info
        userInfo.style.cursor = 'pointer';
    }
    
    // Add delete listener for author
    if (isAuthor) {
        const menuBtn = div.querySelector('.comment-menu-btn');
        const deleteBtn = div.querySelector('.delete-comment-btn');
        const dropdown = div.querySelector('.comment-menu-dropdown');
        
        menuBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });
        
        deleteBtn.addEventListener('click', function() {
            deleteComment(commentId);
        });
        
        // Close dropdown when clicking elsewhere
        document.addEventListener('click', function() {
            dropdown.classList.remove('show');
        });
    }
    
    return div;
}


async function enhanceNewUserOnboarding(userId) {
    console.log('🚀 Enhancing new user onboarding...');
    
    try {
        // Follow some seed accounts immediately
        const seedUsers = await firebase.firestore().collection('users')
            .where('isSeedAccount', '==', true)
            .limit(5)
            .get();
        
        const followPromises = [];
        seedUsers.forEach(doc => {
            followPromises.push(
                firebase.firestore().collection('users').doc(userId).update({
                    following: firebase.firestore.FieldValue.arrayUnion(doc.id)
                })
            );
        });
        
        await Promise.all(followPromises);
        
        // Create a welcome post
        await firebase.firestore().collection('posts').add({
            content: "👋 Just joined Future Engineers! Excited to connect with fellow tech enthusiasts!",
            userId: userId,
            userName: currentUser.displayName || 'New User',
            backgroundColor: '#bbdefb',
            likes: [],
            commentsCount: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            isWelcomePost: true
        });
        
        console.log('✅ New user onboarding enhanced');
        
    } catch (error) {
        console.warn('Onboarding enhancement failed:', error);
        // Non-critical, continue anyway
    }
}

// Call this in ensureUserDocumentExists after creating new user
async function loadUserData(userId, forceRefresh = false) {
    // Check cache first
    if (!forceRefresh && cache.users.has(userId)) {
        const cached = cache.users.get(userId);
        if (Date.now() - cached.cachedAt < 10 * 60 * 1000) { // 10 minutes TTL
            return cached.data;
        }
    }
    
    try {
        const userDoc = await firebase.firestore().collection('users').doc(userId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            
            // Update cache
            cache.users.set(userId, {
                data: userData,
                cachedAt: Date.now()
            });
            cache.persistCache();
            
            return userData;
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
    
    return null;
}
async function loadUserProfile(userId) {
    console.log('Loading profile for user:', userId);
    
    if (!userId || userId === currentUser?.uid) {
        loadPage('profile');
        return;
    }
    
    showLoading();
    
    try {
        // Try cache first
        let userData = await loadUserData(userId);
        
        if (!userData) {
            // Try to get from Firestore
            const userRef = firebase.firestore().collection('users').doc(userId);
            const doc = await userRef.get();
            
            if (!doc.exists) {
                // Create placeholder
                userData = {
                    name: 'User',
                    email: '',
                    followers: [],
                    following: [],
                    postsCount: 0
                };
                
                // Don't actually create in Firestore unless needed
            } else {
                userData = doc.data();
            }
        }
        
        renderOtherUserProfile(userId, userData);
        hideLoading();
        
    } catch (error) {
        console.error('Error loading user profile:', error);
        showToast('Error loading user profile', 'error');
        hideLoading();
        loadPage('feed');
    }
}
function onPostAction(action, postId = null) {
    invalidateCache('post', postId);
    
    // Also invalidate user posts count cache
    if (currentUser) {
        cache.users.delete(currentUser.uid);
    }
}
// 🔥 NEW FUNCTION: Create user document
async function createUserDocumentFromPostData(userId, userName, userEmail = '') {
    if (!userId) return;
    
    const userRef = firebase.firestore().collection('users').doc(userId);
    
    try {
        const doc = await userRef.get();
        
        if (!doc.exists) {
            // Create user document from available data
            await userRef.set({
                name: userName || 'User',
                email: userEmail || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                followers: [],
                following: [],
                postsCount: 0,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
                createdFromPost: true // Flag to identify auto-created users
            });
            
            console.log('Created user document from post data:', userId);
        }
    } catch (error) {
        console.error('Error creating user document from post data:', error);
    }
}
function renderOtherUserProfile(userId, userData) {
    // Validate user data
    if (!userData || typeof userData !== 'object') {
        showToast('Invalid user data', 'error');
        loadPage('feed');
        return;
    }
    
    const app = document.getElementById('app');
    
    // Use safe defaults for missing data
    const userName = userData.name || 'User';
    const userEmail = userData.email || '';
    const followers = userData.followers || [];
    const following = userData.following || [];
    
    app.innerHTML = `
        <header class="app-header">
            <div class="container">
                <h1><i class="fas fa-user"></i> Profile</h1>
                <button onclick="loadPage('feed')" class="logout-btn">
                    <i class="fas fa-arrow-left"></i> Back
                </button>
            </div>
        </header>
        
        <main class="container main-content">
            <div class="profile-container">
                <div class="profile-header">
                    <div class="avatar large" style="background: ${getColorFromName(userName)}">
                        ${userName.charAt(0).toUpperCase()}
                    </div>
                    <h2>${userName}</h2>
                    ${userEmail ? `<p class="profile-email">${userEmail}</p>` : ''}
                    
                    <div class="profile-stats">
                        <div class="stat">
                            <div class="stat-number" id="otherUserPostsCount">0</div>
                            <div class="stat-label">Posts</div>
                        </div>
                        <div class="stat">
                            <div class="stat-number" id="otherUserFollowersCount">${followers.length}</div>
                            <div class="stat-label">Followers</div>
                        </div>
                        <div class="stat">
                            <div class="stat-number" id="otherUserFollowingCount">${following.length}</div>
                            <div class="stat-label">Following</div>
                        </div>
                    </div>
${userId !== currentUser.uid ? `
<div style="margin-top: 20px; display: flex; gap: 10px;">
  <button id="followUserBtn" class="follow-btn" style="padding: 10px 20px;">
    Follow
  </button>
  <button id="messageUserBtn" class="message-user-btn" 
          data-user-id="${userId}" 
          style="padding: 10px 20px; background: #667eea;">
    <i class="fas fa-paper-plane"></i> Message
  </button>
</div>
` : ''}
                
                <div class="profile-tabs">
                    <button class="tab-btn active" data-tab="user-posts">Posts</button>
                    <button class="tab-btn" data-tab="user-followers">Followers</button>
                    <button class="tab-btn" data-tab="user-following">Following</button>
                </div>
                
                <div class="tab-content">
                    <div id="user-posts-tab" class="tab-pane active">
                        <div id="otherUserPostsContainer">
                            <div class="loading">Loading posts...</div>
                        </div>
                    </div>
                    <div id="user-followers-tab" class="tab-pane">
                        <div id="otherUserFollowersList" class="users-list">
                            <div class="loading">Loading followers...</div>
                        </div>
                    </div>
                    <div id="user-following-tab" class="tab-pane">
                        <div id="otherUserFollowingList" class="users-list">
                            <div class="loading">Loading following...</div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
        
        <nav class="bottom-nav">
            <a href="#" class="nav-item" data-page="feed">
                <i class="fas fa-home"></i>
                <span>Feed</span>
            </a>
            <a href="#" class="nav-item" data-page="notifications">
                <i class="fas fa-bell"></i>
                <span>Notifications</span>
            </a>
            <a href="#" class="nav-item" data-page="profile">
                <i class="fas fa-user"></i>
                <span>Profile</span>
            </a>
        </nav>
               <!-- ADD THESE - Overlay and Comment Modal for profile pages -->
        <div id="overlay"></div>

        <div id="commentModal">
            <div class="handle-bar"></div>
            <div class="modal-header">
                <h3>Comments</h3>
                <button class="close-modal">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-content">
                <div class="comments-container">
                    <div id="commentsList">
                        <!-- Comments will be loaded here -->
                    </div>
                </div>
                <div class="add-comment">
                    <textarea id="commentInput" placeholder="Write a comment..." rows="1"></textarea>
                    <button id="postCommentBtn">Post</button>
                </div>
            </div>
        </div>
    `;
    
    setupOtherUserProfile(userId, userData);
}
function setupOtherUserProfile(userId, userData) {
    // Store current viewing user ID
    window.currentViewingUserId = userId;
    
    // Setup navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            loadPage(page);
        });
    });
    
    // Setup tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.getAttribute('data-tab');
            
            // Update active tab button
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Show active tab content
            document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
            document.getElementById(`${tab}-tab`).classList.add('active');
            
            // Load content for tab
            if (tab === 'user-posts') {
                loadOtherUserPosts(userId);
            } else if (tab === 'user-followers') {
                loadOtherUserFollowers(userId, userData);
            } else if (tab === 'user-following') {
                loadOtherUserFollowing(userId, userData);
            }
        });
    });
    
    // Setup follow button if exists
    const followBtn = document.getElementById('followUserBtn');
    if (followBtn) {
        // Set initial state
        followBtn.textContent = 'Follow';
        followBtn.classList.remove('following');
        
        // Check following status asynchronously
        if (currentUser && userId !== currentUser.uid) {
            checkFollowingStatus(userId).then(isFollowing => {
                followBtn.classList.toggle('following', isFollowing);
                followBtn.textContent = isFollowing ? 'Following' : 'Follow';
            }).catch(error => {
                console.error('Error checking following status:', error);
            });
        }
        
        followBtn.addEventListener('click', function() {
            const isFollowing = this.classList.contains('following');
            
            if (isFollowing) {
                unfollowUser(userId, this);
            } else {
                followUser(userId, this);
            }
        });
    }
    
    // Load initial data
    loadOtherUserPosts(userId);
    
    // In setupOtherUserProfile() function, add:
const messageBtn = document.getElementById('messageUserBtn');
if (messageBtn) {
    messageBtn.addEventListener('click', function() {
        const targetUserId = this.getAttribute('data-user-id');
        startConversation(targetUserId);
    });
}

// Start new conversation
async function startConversation(targetUserId) {
    showLoading();
    
    try {
        // Check if conversation already exists
        const existingConvo = await firebase.firestore().collection('conversations')
            .where('participants', 'array-contains', currentUser.uid)
            .get();
        
        let conversationId = null;
        
        existingConvo.forEach(doc => {
            const convo = doc.data();
            if (convo.participants.includes(targetUserId)) {
                conversationId = doc.id;
            }
        });
        
        if (!conversationId) {
            // Create new conversation
            const newConvo = await firebase.firestore().collection('conversations').add({
                participants: [currentUser.uid, targetUserId],
                lastMessage: '',
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                unreadCount: {
                    [currentUser.uid]: 0,
                    [targetUserId]: 0
                }
            });
            
            conversationId = newConvo.id;
        }
        
        // Load user data
        const userDoc = await firebase.firestore().collection('users').doc(targetUserId).get();
        const userData = userDoc.exists ? userDoc.data() : { name: 'User' };
        
        hideLoading();
        
        // Go to messages page and open conversation
        loadPage('messages');
        
        // Wait a bit for page to render
        setTimeout(() => {
            openConversation(conversationId, targetUserId, userData);
        }, 300);
        
    } catch (error) {
        console.error('Error starting conversation:', error);
        showToast('Failed to start conversation', 'error');
        hideLoading();
    }
}
setupOtherUserRealTimeListeners(userId);
setupCommentModalHandlers();
loadOtherUserPosts(userId);
loadOtherUserPostsCount(userId);
}
function setupCommentModalHandlers() {
    // Setup comment modal
    const closeModalBtn = document.querySelector('.close-modal');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeCommentModal);
    }
    
    const overlay = document.getElementById('overlay');
    if (overlay) {
        overlay.addEventListener('click', closeCommentModal);
    }
    
    // Post comment
    const postCommentBtn = document.getElementById('postCommentBtn');
    if (postCommentBtn) {
        postCommentBtn.addEventListener('click', postComment);
    }
    
    // Enter key for comment
    const commentInput = document.getElementById('commentInput');
    if (commentInput) {
        commentInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                postComment();
            }
        });
    }
    
    // Escape key to close modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeCommentModal();
        }
    });
}
function setupOtherUserRealTimeListeners(userId) {
    // Listen for user data changes
    firebase.firestore().collection('users').doc(userId)
        .onSnapshot((doc) => {
            if (doc.exists) {
                const userData = doc.data();
                
                // Update follower count
                const followersCountElement = document.getElementById('otherUserFollowersCount');
                if (followersCountElement) {
                    followersCountElement.textContent = userData.followers ? userData.followers.length : 0;
                }
                
                // Update following count
                const followingCountElement = document.getElementById('otherUserFollowingCount');
                if (followingCountElement) {
                    followingCountElement.textContent = userData.following ? userData.following.length : 0;
                }
                
                // FIXED: Call the correct function
                loadOtherUserPostsCount(userId); // Changed from updateOtherUserPostsCount
                
                // Update follow button state
                updateFollowButtonState(userId);
            }
        });
    
    // Listen for new posts from this user
    setupOtherUserPostsListener(userId);
}

// Add this new function
async function loadOtherUserPostsCount(userId) {
    try {
        const snapshot = await firebase.firestore().collection('posts')
            .where('userId', '==', userId)
            .get();
        
        const postsCountElement = document.getElementById('otherUserPostsCount');
        if (postsCountElement) {
            postsCountElement.textContent = snapshot.size;
        }
    } catch (error) {
        console.error('Error loading user posts count:', error);
    }
}

function setupOtherUserPostsListener(userId) {
    // Clean up previous listener
    if (postsListener) postsListener();
    
    postsListener = firebase.firestore().collection('posts')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            // Update posts count
            const postsCountElement = document.getElementById('otherUserPostsCount');
            if (postsCountElement) {
                postsCountElement.textContent = snapshot.size;
            }
            
            // IMPORTANT: Don't reload posts when we're just updating likes/comments
            // Only reload if posts are actually added/removed
            const changes = snapshot.docChanges();
            const hasNewOrRemovedPosts = changes.some(change => 
                change.type === 'added' || change.type === 'removed'
            );
            
            // Only reload posts if new posts were added or removed
            // NOT when existing posts are modified (likes/comments)
            if (hasNewOrRemovedPosts) {
                const activeTab = document.querySelector('.tab-btn.active');
                if (activeTab && activeTab.dataset.tab === 'user-posts') {
                    loadOtherUserPosts(userId);
                }
            }
            // For modifications (like likes/comments), let individual post real-time listeners handle it
        });
}

function updateFollowButtonState(targetUserId) {
    const followBtn = document.getElementById('followUserBtn');
    if (!followBtn) return;
    
    checkFollowingStatus(targetUserId).then(isFollowing => {
        followBtn.classList.toggle('following', isFollowing);
        followBtn.textContent = isFollowing ? 'Following' : 'Follow';
    });
}
// Render Messages Page
function renderMessagesPage() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <header class="app-header">
            <div class="container">
                <h1><i class="fas fa-envelope"></i> Messages</h1>
                <button onclick="loadPage('feed')" class="logout-btn">
                    <i class="fas fa-arrow-left"></i> Back
                </button>
            </div>
        </header>
        
        <main class="container main-content">
            <div class="messages-container">
                <!-- Conversations List -->
                <div class="conversations-pane">
                    <div class="search-conversations">
                        <input type="text" id="searchConversations" placeholder="Search conversations...">
                    </div>
                    <div id="conversationsList" class="conversations-list">
                        <div class="loading">Loading conversations...</div>
                    </div>
                </div>
                
                <!-- Chat Area (hidden by default) -->
                <div id="chatArea" class="chat-area hidden">
                    <div class="chat-header">
                        <button class="back-to-conversations">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        <div class="chat-user-info">
                            <div class="avatar small" id="chatUserAvatar">U</div>
                            <div>
                                <div class="user-name" id="chatUserName">User</div>
                                <div class="user-status" id="chatUserStatus"></div>
                            </div>
                        </div>
                    </div>
                    
                    <div id="messagesList" class="messages-list">
                        <div class="empty-chat">
                            <i class="fas fa-comments fa-2x"></i>
                            <p>Select a conversation to start messaging</p>
                        </div>
                    </div>
                    
                    <div class="message-input-area">
                        <div class="message-input-wrapper">
                            <textarea id="messageInput" placeholder="Type a message..." rows="1"></textarea>
                            <button id="sendMessageBtn" class="send-btn">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Empty State -->
                <div id="emptyConversations" class="empty-conversations hidden">
                    <i class="fas fa-comments fa-2x"></i>
                    <h3>No conversations yet</h3>
                    <p>Start a conversation by messaging someone from their profile</p>
                </div>
            </div>
        </main>
        
        <nav class="bottom-nav">
            <a href="#" class="nav-item" data-page="feed">
                <i class="fas fa-home"></i>
                <span>Feed</span>
            </a>
            <a href="#" class="nav-item" data-page="messages">
                <i class="fas fa-envelope"></i>
                <span>Messages</span>
                <span class="unread-badge" id="messageBadgeBottom" style="display:none"></span>
            </a>
            <a href="#" class="nav-item" data-page="profile">
                <i class="fas fa-user"></i>
                <span>Profile</span>
            </a>
        </nav>
    `;
    
    setupMessagesPage();
}
function setupMessagesPage() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            loadPage(page);
        });
    });
    
    // Back to conversations button
    const backBtn = document.querySelector('.back-to-conversations');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            document.getElementById('chatArea').classList.add('hidden');
            document.querySelector('.conversations-pane').classList.remove('hidden');
            currentConversationId = null;
        });
    }
    
    // Search conversations
    const searchInput = document.getElementById('searchConversations');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            filterConversations(searchTerm);
        });
    }
    
    // Setup message sending
    const sendBtn = document.getElementById('sendMessageBtn');
    const messageInput = document.getElementById('messageInput');
    
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        // Auto-resize textarea
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
    }
    
    // Load conversations
    loadConversations();
    startUnreadListener();
}
function loadConversations() {
    const conversationsList = document.getElementById('conversationsList');
    if (!conversationsList) return;
    
    // Clean up previous listener
    if (messagesListener) {
        messagesListener();
    }
    
    // Listen to user's conversations
    messagesListener = firebase.firestore().collection('conversations')
        .where('participants', 'array-contains', currentUser.uid)
        .onSnapshot(function(snapshot) {
            if (!conversationsList) return;
            
            if (snapshot.empty) {
                conversationsList.innerHTML = '';
                document.getElementById('emptyConversations').classList.remove('hidden');
                return;
            }
            
            document.getElementById('emptyConversations').classList.add('hidden');
            
            const conversations = [];
            snapshot.forEach(function(doc) {
                const conversation = {
                    id: doc.id,
                    ...doc.data()
                };
                conversations.push(conversation);
            });
            
            renderConversations(conversationsList, conversations);
        }, function(error) {
            console.error('Error loading conversations:', error);
            conversationsList.innerHTML = '<div class="error">Error loading conversations</div>';
        });
}
function renderConversations(container, conversations) {
    container.innerHTML = '';
    
    conversations.forEach(async function(conversation) {
        const otherUserId = conversation.participants.find(id => id !== currentUser.uid);
        let otherUserData = null;
        
        // Try cache first
        if (messagingUserCache.has(otherUserId)) {
            otherUserData = messagingUserCache.get(otherUserId);
        } else {
            // Fetch user data
            try {
                const userDoc = await firebase.firestore().collection('users').doc(otherUserId).get();
                if (userDoc.exists) {
                    otherUserData = userDoc.data();
                    messagingUserCache.set(otherUserId, otherUserData);
                }
            } catch (error) {
                console.error('Error fetching user data:', error);
            }
        }
        
        const conversationElement = createConversationElement(conversation, otherUserId, otherUserData);
        container.appendChild(conversationElement);
    });
}
function createConversationElement(conversation, otherUserId, otherUserData) {
    const div = document.createElement('div');
    div.className = 'conversation-item';
    div.dataset.conversationId = conversation.id;
    div.dataset.userId = otherUserId;
    
    const userName = otherUserData?.name || 'User';
    const avatarColor = getColorFromName(userName);
    const avatarInitial = userName.charAt(0).toUpperCase();
    const lastMessage = conversation.lastMessage || 'No messages yet';
    const unreadCount = conversation.unreadCount?.[currentUser.uid] || 0;
    const lastUpdated = conversation.lastUpdated ? formatTime(conversation.lastUpdated) : '';
    
    div.innerHTML = `
        <div class="conversation-avatar" style="background: ${avatarColor}">
            ${avatarInitial}
        </div>
        <div class="conversation-info">
            <div class="conversation-header">
                <div class="conversation-name">${userName}</div>
                <div class="conversation-time">${lastUpdated}</div>
            </div>
            <div class="conversation-preview">${escapeHtml(lastMessage)}</div>
        </div>
        ${unreadCount > 0 ? `
        <div class="conversation-unread">
            <span class="unread-count">${unreadCount}</span>
        </div>
        ` : ''}
    `;
    
    div.addEventListener('click', function() {
        openConversation(conversation.id, otherUserId, otherUserData);
    });
    
    return div;
}
function openConversation(conversationId, otherUserId, otherUserData) {
    currentConversationId = conversationId;
    
    // Switch to chat view
    document.querySelector('.conversations-pane').classList.add('hidden');
    document.getElementById('chatArea').classList.remove('hidden');
    
    // Set chat header info
    const userName = otherUserData?.name || 'User';
    document.getElementById('chatUserName').textContent = userName;
    document.getElementById('chatUserAvatar').textContent = userName.charAt(0).toUpperCase();
    document.getElementById('chatUserAvatar').style.background = getColorFromName(userName);
    
    // Clear unread count
    clearUnreadCount(conversationId);
    
    // Load messages
    loadMessages(conversationId);
    
    // Focus input
    setTimeout(() => {
        document.getElementById('messageInput').focus();
    }, 100);
}

// Load messages for a conversation
function loadMessages(conversationId) {
    const messagesList = document.getElementById('messagesList');
    if (!messagesList) return;
    
    messagesList.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading messages...</div>';
    
    // Listen to messages
    const messagesQuery = firebase.firestore()
        .collection('conversations')
        .doc(conversationId)
        .collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(50);
    
    messagesQuery.onSnapshot(function(snapshot) {
        if (!messagesList) return;
        
        if (snapshot.empty) {
            messagesList.innerHTML = '<div class="empty-chat">No messages yet. Start the conversation!</div>';
            return;
        }
        
        const messages = [];
        snapshot.forEach(function(doc) {
            const message = {
                id: doc.id,
                ...doc.data()
            };
            messages.unshift(message); // Reverse order for display
        });
        
        renderMessages(messagesList, messages);
        
        // Scroll to bottom
        setTimeout(() => {
            messagesList.scrollTop = messagesList.scrollHeight;
        }, 100);
    }, function(error) {
        console.error('Error loading messages:', error);
        messagesList.innerHTML = '<div class="error">Error loading messages</div>';
    });
}
function renderMessages(container, messages) {
    container.innerHTML = '';
    
    messages.forEach(function(message) {
        const messageElement = createMessageElement(message);
        container.appendChild(messageElement);
    });
}
function createMessageElement(message) {
    const div = document.createElement('div');
    div.className = `message-bubble ${message.senderId === currentUser.uid ? 'sent' : 'received'}`;
    div.dataset.messageId = message.id;
    
    const time = message.timestamp ? formatTime(message.timestamp) : '';
    const isDeleted = message.deleted === true;
    
    div.innerHTML = `
        <div class="message-content">
            ${isDeleted ? '<em>Message deleted</em>' : escapeHtml(message.text)}
        </div>
        <div class="message-meta">
            <span class="message-time">${time}</span>
            ${message.senderId === currentUser.uid ? `
            <span class="message-status">
                ${message.read ? '✓✓' : '✓'}
            </span>
            ` : ''}
        </div>
        ${message.senderId === currentUser.uid && !isDeleted ? `
        <button class="delete-message-btn" data-message-id="${message.id}">
            <i class="fas fa-trash"></i>
        </button>
        ` : ''}
    `;
    
    // Add delete listener
    const deleteBtn = div.querySelector('.delete-message-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            deleteMessage(message.id);
        });
    }
    
    return div;
}
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text || !currentConversationId) return;
    
    const sendBtn = document.getElementById('sendMessageBtn');
    const originalHTML = sendBtn.innerHTML;
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    sendBtn.disabled = true;
    
    try {
        // Create or update conversation
        const conversationRef = firebase.firestore().collection('conversations').doc(currentConversationId);
        const conversationDoc = await conversationRef.get();
        
        if (!conversationDoc.exists) {
            // This shouldn't happen, but handle gracefully
            console.error('Conversation not found');
            return;
        }
        
        // Add message
        await conversationRef.collection('messages').add({
            text: text,
            senderId: currentUser.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            read: false,
            deleted: false
        });
        
        // Update conversation
        await conversationRef.update({
            lastMessage: text.length > 50 ? text.substring(0, 47) + '...' : text,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
            [`unreadCount.${getOtherUserId(currentConversationId)}`]: firebase.firestore.FieldValue.increment(1)
        });
        
        // Clear input
        input.value = '';
        input.style.height = 'auto';
        
    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Failed to send message', 'error');
    } finally {
        sendBtn.innerHTML = originalHTML;
        sendBtn.disabled = false;
    }
}
function getOtherUserId(conversationId) {
    const conversationItem = document.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`);
    if (conversationItem) {
        return conversationItem.dataset.userId;
    }
    return null;
}
async function deleteMessage(messageId) {
    if (!confirm('Delete this message?')) return;
    
    try {
        await firebase.firestore()
            .collection('conversations')
            .doc(currentConversationId)
            .collection('messages')
            .doc(messageId)
            .update({
                deleted: true,
                text: '[deleted]'
            });
    } catch (error) {
        console.error('Error deleting message:', error);
        showToast('Failed to delete message', 'error');
    }
}
async function clearUnreadCount(conversationId) {
    try {
        await firebase.firestore()
            .collection('conversations')
            .doc(conversationId)
            .update({
                [`unreadCount.${currentUser.uid}`]: 0
            });
    } catch (error) {
        console.error('Error clearing unread count:', error);
    }
}


// Start unread count listener
function startUnreadListener() {
    // This updates the badge in real-time
    if (messagesListener) return;
    
    firebase.firestore().collection('conversations')
        .where('participants', 'array-contains', currentUser.uid)
        .onSnapshot(function(snapshot) {
            let totalUnread = 0;
            
            snapshot.forEach(function(doc) {
                const conversation = doc.data();
                totalUnread += conversation.unreadCount?.[currentUser.uid] || 0;
            });
            
            updateUnreadBadge(totalUnread);
        });
}
// Update unread badge
function updateUnreadBadge(count) {
    // Update both badges (top and bottom)
    const badges = [
        document.getElementById('messageBadge'),
        document.getElementById('messageBadgeBottom')
    ].filter(b => b); // Remove null elements
    
    badges.forEach(badge => {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'inline-block';
            
            // Force re-display with inline styles
            badge.style.position = 'absolute';
            badge.style.top = '-8px';
            badge.style.right = '5px';
            badge.style.background = '#ff4757';
            badge.style.color = 'white';
            badge.style.fontSize = '10px';
            badge.style.fontWeight = 'bold';
            badge.style.minWidth = '18px';
            badge.style.height = '18px';
            badge.style.borderRadius = '9px';
            badge.style.display = 'flex';
            badge.style.alignItems = 'center';
            badge.style.justifyContent = 'center';
            badge.style.padding = '0 4px';
            badge.style.border = '2px solid white';
            badge.style.zIndex = '100';
        } else {
            badge.style.display = 'none';
        }
    });
}
// Filter conversations
function filterConversations(searchTerm) {
    const items = document.querySelectorAll('.conversation-item');
    
    items.forEach(item => {
        const userName = item.querySelector('.conversation-name').textContent.toLowerCase();
        const preview = item.querySelector('.conversation-preview').textContent.toLowerCase();
        
        if (userName.includes(searchTerm) || preview.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
} 

async function startConversation(targetUserId) {
    showLoading();
    
    try {
        // Check if conversation already exists
        const existingConvo = await firebase.firestore().collection('conversations')
            .where('participants', 'array-contains', currentUser.uid)
            .get();
        
        let conversationId = null;
        
        existingConvo.forEach(doc => {
            const convo = doc.data();
            if (convo.participants.includes(targetUserId)) {
                conversationId = doc.id;
            }
        });
        
        if (!conversationId) {
            // Create new conversation
            const newConvo = await firebase.firestore().collection('conversations').add({
                participants: [currentUser.uid, targetUserId],
                lastMessage: '',
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                unreadCount: {
                    [currentUser.uid]: 0,
                    [targetUserId]: 0
                }
            });
            
            conversationId = newConvo.id;
        }
        
        // Load user data
        const userDoc = await firebase.firestore().collection('users').doc(targetUserId).get();
        const userData = userDoc.exists ? userDoc.data() : { name: 'User' };
        
        hideLoading();
        
        // Go to messages page and open conversation
        loadPage('messages');
        
        // Wait a bit for page to render
        setTimeout(() => {
            openConversation(conversationId, targetUserId, userData);
        }, 300);
        
    } catch (error) {
        console.error('Error starting conversation:', error);
        showToast('Failed to start conversation', 'error');
        hideLoading();
    }
}


async function checkFollowingStatus(targetUserId) {
    if (!currentUser) return false;
    
    try {
        const userDoc = await firebase.firestore().collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            const following = userData.following || [];
            return following.includes(targetUserId);
        }
    } catch (error) {
        console.error('Error checking following status:', error);
    }
    return false;
}

// Update loadOtherUserPosts to set data attribute
function loadOtherUserPosts(userId) {
    const container = document.getElementById('otherUserPostsContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading posts...</div>';
    
    // Load all posts and filter client-side
    firebase.firestore().collection('posts')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get()
        .then(function(snapshot) {
            if (snapshot.empty) {
                container.innerHTML = '<div class="empty">No posts yet.</div>';
                return;
            }
            
            container.innerHTML = '';
            let userPostsCount = 0;
            
            snapshot.forEach(function(doc) {
                const post = doc.data();
                // Filter posts by this user
                if (post.userId === userId) {
                    const postElement = createPostElement(doc.id, post);
                    
                    // CRITICAL: Ensure the element has the post class
                    if (!postElement.classList.contains('post')) {
                        postElement.classList.add('post');
                    }
                    
                    container.appendChild(postElement);
                    userPostsCount++;
                }
            });
            
            // Set data attribute for debug
            container.setAttribute('data-post-count', userPostsCount);
            
            // Update posts count in stats
            document.getElementById('otherUserPostsCount').textContent = userPostsCount;
            
            if (userPostsCount === 0) {
                container.innerHTML = '<div class="empty">No posts yet.</div>';
            }
        })
        .catch(function(error) {
            console.error('Error loading user posts:', error);
            container.innerHTML = '<div class="error"><i class="fas fa-exclamation-circle"></i> Error loading posts</div>';
        });
}
// Load other user's followers
function loadOtherUserFollowers(userId, userData) {
    const container = document.getElementById('otherUserFollowersList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading followers...</div>';
    
    const followers = userData.followers || [];
    
    if (followers.length === 0) {
        container.innerHTML = '<div class="empty">No followers yet.</div>';
        return;
    }
    
    // Load follower details
    container.innerHTML = '';
    followers.forEach(followerId => {
        firebase.firestore().collection('users').doc(followerId).get()
            .then(function(followerDoc) {
                if (followerDoc.exists) {
                    const followerData = followerDoc.data();
                    const followerElement = createUserElement(followerId, followerData);
                    container.appendChild(followerElement);
                }
            });
    });
}
// Load other user's following
function loadOtherUserFollowing(userId, userData) {
    const container = document.getElementById('otherUserFollowingList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading following...</div>';
    
    const following = userData.following || [];
    
    if (following.length === 0) {
        container.innerHTML = '<div class="empty">Not following anyone yet.</div>';
        return;
    }
    
    // Load following details
    container.innerHTML = '';
    following.forEach(followingId => {
        firebase.firestore().collection('users').doc(followingId).get()
            .then(function(followingDoc) {
                if (followingDoc.exists) {
                    const followingData = followingDoc.data();
                    const followingElement = createUserElement(followingId, followingData);
                    container.appendChild(followingElement);
                }
            });
    });
}
// Toggle comment like
function toggleCommentLike(commentId, likeButton, likesCountElement) {
    const commentRef = firebase.firestore().collection('posts').doc(currentPostId)
        .collection('comments').doc(commentId);
    
    // Optimistic UI update
    const isLiked = likeButton.classList.contains('liked');
    const currentLikes = parseInt(likesCountElement.textContent) || 0;
    
    if (isLiked) {
        likeButton.classList.remove('liked');
        likesCountElement.textContent = currentLikes - 1;
    } else {
        likeButton.classList.add('liked');
        likesCountElement.textContent = currentLikes + 1;
    }
    
    // Disable button during update
    likeButton.disabled = true;
    
    commentRef.get().then(function(doc) {
        if (!doc.exists) return;
        
        const comment = doc.data();
        const likes = comment.likes || [];
        
        if (isLiked) {
            // Unlike
            return commentRef.update({
                likes: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
            });
        } else {
            // Like
            return commentRef.update({
                likes: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            });
        }
    })
    .then(function() {
        // Re-enable button
        likeButton.disabled = false;
    })
    .catch(function(error) {
        console.error('Error toggling comment like:', error);
        // Revert optimistic update on error
        if (isLiked) {
            likeButton.classList.add('liked');
            likesCountElement.textContent = currentLikes;
        } else {
            likeButton.classList.remove('liked');
            likesCountElement.textContent = currentLikes;
        }
        likeButton.disabled = false;
    });
}
// Delete comment
async function deleteComment(commentId) {
    if (!commentId || !currentPostId) return;
    
    if (!confirm('Are you sure you want to delete this comment?')) return;
    
    try {
        const postRef = firebase.firestore().collection('posts').doc(currentPostId);
        
        // Get current comment count
        const postDoc = await postRef.get();
        const currentCommentsCount = postDoc.data().commentsCount || 0;
        
        // Delete comment
        await postRef.collection('comments').doc(commentId).delete();
        
        // Update comment count
        await postRef.update({
            commentsCount: Math.max(0, currentCommentsCount - 1),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showToast('Comment deleted', 'success');
        
    } catch (error) {
        console.error('Error deleting comment:', error);
        showToast('Failed to delete comment', 'error');
    }
}
// Post comment
async function postComment() {
    const input = document.getElementById('commentInput');
    const content = input.value.trim();
    
    if (!content || !currentPostId) return;
    
    const postBtn = document.getElementById('postCommentBtn');
    const originalText = postBtn.innerHTML;
    postBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    postBtn.disabled = true;
    
    try {
        const postRef = firebase.firestore().collection('posts').doc(currentPostId);
        const postDoc = await postRef.get();
        const postData = postDoc.data();
        const currentCommentsCount = postData.commentsCount || 0;
        const postAuthorId = postData.userId;
        
        // Add comment
        await postRef.collection('comments').add({
            content: content,
            userId: currentUser.uid,
            userName: currentUser.displayName || 'Anonymous',
            userPhotoURL: currentUser.photoURL || '',
            likes: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update comment count
        await postRef.update({
            commentsCount: currentCommentsCount + 1,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Create notification for post author (unless it's your own post)
        if (postAuthorId !== currentUser.uid) {
            await createNotification(postAuthorId, NOTIFICATION_TYPES.COMMENT, {
                postId: currentPostId,
                postContent: postData.content?.substring(0, 100) || '',
                commentContent: content.substring(0, 100),
                commentsCount: currentCommentsCount + 1
            });
        }
        
        // Clear input
        input.value = '';
        
        // Show success
        showToast('Comment posted', 'success');
        
    } catch (error) {
        console.error('Error posting comment:', error);
        showToast('Failed to post comment', 'error');
    } finally {
        postBtn.innerHTML = originalText;
        postBtn.disabled = false;
    }
}
// Render Profile Page
function renderProfilePage() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <header class="app-header">
            <div class="container">
                <h1><i class="fas fa-user"></i> Profile</h1>
                <button onclick="loadPage('feed')" class="logout-btn">
                    <i class="fas fa-arrow-left"></i> Back
                </button>
            </div>
        </header>
        
        <main class="container main-content">
            <div class="profile-container">
                <div class="profile-header">
                    <div class="avatar large" style="background: ${getColorFromName(currentUser?.displayName)}">
                        ${currentUser?.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <h2>${currentUser?.displayName || 'User'}</h2>
                    <p class="profile-email">${currentUser?.email || ''}</p>
                    
                    <div class="profile-stats">
                        <div class="stat">
                            <div class="stat-number" id="postsCount">0</div>
                            <div class="stat-label">Posts</div>
                        </div>
                        <div class="stat">
                            <div class="stat-number" id="followersCount">0</div>
                            <div class="stat-label">Followers</div>
                        </div>
                        <div class="stat">
                            <div class="stat-number" id="followingCount">0</div>
                            <div class="stat-label">Following</div>
                        </div>
                    </div>
                </div>
                
                <div class="profile-tabs">
                    <button class="tab-btn active" data-tab="my-posts">My Posts</button>
                    <button class="tab-btn" data-tab="followers">Followers</button>
                    <button class="tab-btn" data-tab="following">Following</button>
                </div>
                
                <div class="tab-content">
                    <div id="my-posts-tab" class="tab-pane active">
                        <div id="userPostsContainer">
                            <div class="loading">Loading your posts...</div>
                        </div>
                    </div>
                    <div id="followers-tab" class="tab-pane">
                        <div id="followersList" class="users-list">
                            <div class="loading">Loading followers...</div>
                        </div>
                    </div>
                    <div id="following-tab" class="tab-pane">
                        <div id="followingList" class="users-list">
                            <div class="loading">Loading following...</div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
        
        <nav class="bottom-nav">
            <a href="#" class="nav-item" data-page="feed">
                <i class="fas fa-home"></i>
                <span>Feed</span>
            </a>
<a href="#" class="nav-item" data-page="notifications">
    <i class="fas fa-bell"></i>
    <span>Notifications</span>
    <span class="unread-badge" id="notificationBadge" style="display:none"></span>
</a>
            <a href="#" class="nav-item active" data-page="profile">
                <i class="fas fa-user"></i>
                <span>Profile</span>
            </a>
        </nav>
                <div id="overlay"></div>

        <div id="commentModal">
            <div class="handle-bar"></div>
            <div class="modal-header">
                <h3>Comments</h3>
                <button class="close-modal">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-content">
                <div class="comments-container">
                    <div id="commentsList">
                        <!-- Comments will be loaded here -->
                    </div>
                </div>
                <div class="add-comment">
                    <textarea id="commentInput" placeholder="Write a comment..." rows="1"></textarea>
                    <button id="postCommentBtn">Post</button>
                </div>
            </div>
        </div>
    `;
    
    setupProfilePage();
}
function refreshNotificationBadges() {
    updateNotificationCounts();
}

// Setup Profile Page
function setupProfilePage() {
    // Setup navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            loadPage(page);
        });
    });
    
    // Setup tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.getAttribute('data-tab');
            
            // Update active tab button
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Show active tab content
            document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
            document.getElementById(`${tab}-tab`).classList.add('active');
            
            // Load content for tab
            if (tab === 'my-posts') {
                loadUserPosts();
            } else if (tab === 'followers') {
                loadFollowers();
            } else if (tab === 'following') {
                loadFollowing();
            }
        });
    });
    
    // Load initial data
    loadProfileStats();
    loadUserPosts();
    setupProfileRealTimeListeners();
    setupCommentModalHandlers();
}
function setupProfileRealTimeListeners() {
    if (!currentUser) return;
    
    // Listen for user data changes (followers/following count)
    firebase.firestore().collection('users').doc(currentUser.uid)
        .onSnapshot((doc) => {
            if (doc.exists) {
                const userData = doc.data();
                // Update stats in real-time
                document.getElementById('followersCount').textContent = 
                    userData.followers ? userData.followers.length : 0;
                document.getElementById('followingCount').textContent = 
                    userData.following ? userData.following.length : 0;
                
                // Update posts count
                updateProfilePostsCount();
            }
        });
    
    // Listen for user's own posts in real-time
    setupUserPostsListener();
}

function setupUserPostsListener() {
    // Clean up previous listener
    if (postsListener) postsListener();
    
    postsListener = firebase.firestore().collection('posts')
        .where('userId', '==', currentUser.uid)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .onSnapshot((snapshot) => {
            // Update posts count
            document.getElementById('postsCount').textContent = snapshot.size;
            
            // Check if we need to reload posts
            const changes = snapshot.docChanges();
            const hasNewOrRemovedPosts = changes.some(change => 
                change.type === 'added' || change.type === 'removed'
            );
            
            // Only reload if posts are added/removed, not modified
            if (hasNewOrRemovedPosts) {
                const activeTab = document.querySelector('.tab-btn.active');
                if (activeTab && activeTab.dataset.tab === 'my-posts') {
                    loadUserPosts();
                }
            }
            // Likes/comments updates are handled by individual post listeners
        }, (error) => {
            console.error("Error listening to user posts:", error);
        });
}
// Load profile stats
function loadProfileStats() {
    if (!currentUser) return;
    
    // Load user data from Firestore
    firebase.firestore().collection('users').doc(currentUser.uid).get()
        .then(function(doc) {
            if (doc.exists) {
                const userData = doc.data();
                document.getElementById('followersCount').textContent = userData.followers ? userData.followers.length : 0;
                document.getElementById('followingCount').textContent = userData.following ? userData.following.length : 0;
            }
        })
        .catch(function(error) {
            console.error('Error loading user data:', error);
        });
    
    // Count user posts
    firebase.firestore().collection('posts')
        .where('userId', '==', currentUser.uid)
        .get()
        .then(function(snapshot) {
            document.getElementById('postsCount').textContent = snapshot.size;
        })
        .catch(function(error) {
            console.error('Error counting posts:', error);
        });
}
// Load user posts - FIXED: No index required
// Load user posts - UPDATED with proper cleanup
function loadUserPosts() {
    const container = document.getElementById('userPostsContainer');
    if (!container) return;
    
    // Clean up existing listeners
    cleanupPostRealTimeListeners();
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading your posts...</div>';
    
    // Load all posts and filter client-side to avoid index requirement
    firebase.firestore().collection('posts')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get()
        .then(function(snapshot) {
            if (snapshot.empty) {
                container.innerHTML = '<div class="empty">You haven\'t posted anything yet.</div>';
                return;
            }
            
            container.innerHTML = '';
            let userPostsCount = 0;
            
            snapshot.forEach(function(doc) {
                const post = doc.data();
                // Filter posts client-side
                if (post.userId === currentUser.uid) {
                    const postElement = createPostElement(doc.id, post);
                    container.appendChild(postElement);
                    userPostsCount++;
                }
            });
            
            if (userPostsCount === 0) {
                container.innerHTML = '<div class="empty">You haven\'t posted anything yet.</div>';
            }
        })
        .catch(function(error) {
            console.error('Error loading user posts:', error);
            container.innerHTML = '<div class="error"><i class="fas fa-exclamation-circle"></i> Error loading posts</div>';
        });
}
// Load followers
function loadFollowers() {
    const container = document.getElementById('followersList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading followers...</div>';
    
    firebase.firestore().collection('users').doc(currentUser.uid).get()
        .then(function(doc) {
            if (doc.exists) {
                const userData = doc.data();
                const followers = userData.followers || [];
                
                if (followers.length === 0) {
                    container.innerHTML = '<div class="empty">No followers yet.</div>';
                    return;
                }
                
                // Load follower details
                container.innerHTML = '';
                followers.forEach(followerId => {
                    firebase.firestore().collection('users').doc(followerId).get()
                        .then(function(followerDoc) {
                            if (followerDoc.exists) {
                                const followerData = followerDoc.data();
                                const followerElement = createUserElement(followerId, followerData);
                                container.appendChild(followerElement);
                            }
                        });
                });
            }
        })
        .catch(function(error) {
            console.error('Error loading followers:', error);
            container.innerHTML = '<div class="error">Error loading followers</div>';
        });
}
// Load following
function loadFollowing() {
    const container = document.getElementById('followingList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading following...</div>';
    
    firebase.firestore().collection('users').doc(currentUser.uid).get()
        .then(function(doc) {
            if (doc.exists) {
                const userData = doc.data();
                const following = userData.following || [];
                
                if (following.length === 0) {
                    container.innerHTML = '<div class="empty">You\'re not following anyone yet.</div>';
                    return;
                }
                
                // Load following details
                container.innerHTML = '';
                following.forEach(followingId => {
                    firebase.firestore().collection('users').doc(followingId).get()
                        .then(function(followingDoc) {
                            if (followingDoc.exists) {
                                const followingData = followingDoc.data();
                                const followingElement = createUserElement(followingId, followingData);
                                container.appendChild(followingElement);
                            }
                        });
                });
            }
        })
        .catch(function(error) {
            console.error('Error loading following:', error);
            container.innerHTML = '<div class="error">Error loading following</div>';
        });
}

// Create user element for followers/following lists - UPDATED: Make clickable
function createUserElement(userId, userData) {
    const div = document.createElement('div');
    div.className = 'user-item';
    
    // Use safe defaults
    const userName = userData?.name || 'Unknown';
    const userEmail = userData?.email || '';
    const avatarColor = getColorFromName(userName);
    const avatarInitial = userName.charAt(0).toUpperCase();
    
    div.innerHTML = `
        <div class="user-info clickable-user" data-user-id="${userId}">
            <div class="avatar" style="background: ${avatarColor}">
                ${avatarInitial}
            </div>
            <div>
                <div class="user-name">${userName}</div>
                ${userEmail ? `<div class="user-email">${userEmail}</div>` : ''}
            </div>
        </div>
        ${userId !== currentUser?.uid ? `
        <button class="follow-btn" data-user-id="${userId}">
            Follow
        </button>
        ` : ''}
    `;
    
    // Add click listener to user info
    const userInfo = div.querySelector('.clickable-user');
    if (userInfo) {
        userInfo.addEventListener('click', function(e) {
            e.stopPropagation();
            const targetUserId = this.getAttribute('data-user-id');
            if (targetUserId && targetUserId !== currentUser?.uid) {
                loadUserProfile(targetUserId);
            }
        });
        
        userInfo.style.cursor = 'pointer';
    }
    
    // Add follow button listener and set initial state
    const followBtn = div.querySelector('.follow-btn');
    if (followBtn && currentUser && userId !== currentUser.uid) {
        // Set initial state
        followBtn.textContent = 'Follow';
        followBtn.classList.remove('following');
        
        // Check following status asynchronously
        checkFollowingStatus(userId).then(isFollowing => {
            followBtn.classList.toggle('following', isFollowing);
            followBtn.textContent = isFollowing ? 'Following' : 'Follow';
        }).catch(error => {
            console.error('Error checking following status:', error);
        });
        
        followBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const targetUserId = this.getAttribute('data-user-id');
            const isFollowing = this.classList.contains('following');
            
            if (isFollowing) {
                unfollowUser(targetUserId, this);
            } else {
                followUser(targetUserId, this);
            }
        });
    }
    
    return div;
}
// Check if current user is following another user
function isFollowing(userId) {
    // This would need to be implemented with actual data
    // For now, return false
    return false;
}
// Toggle follow
function toggleFollow(targetUserId, followBtn) {
    const isCurrentlyFollowing = followBtn.classList.contains('following');
    
    if (isCurrentlyFollowing) {
        // Unfollow
        unfollowUser(targetUserId, followBtn);
    } else {
        // Follow
        followUser(targetUserId, followBtn);
    }
}
// Follow user
async function followUser(targetUserId, buttonElement = null) {
    try {
        const currentUserRef = firebase.firestore().collection('users').doc(currentUser.uid);
        const targetUserRef = firebase.firestore().collection('users').doc(targetUserId);
        
        const targetUserDoc = await targetUserRef.get();
        const targetUserName = targetUserDoc.exists ? targetUserDoc.data().name : 'User';
        
        await Promise.all([
            currentUserRef.update({
                following: firebase.firestore.FieldValue.arrayUnion(targetUserId)
            }),
            targetUserRef.update({
                followers: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            }),
            createNotification(targetUserId, NOTIFICATION_TYPES.FOLLOW, {
                followerId: currentUser.uid,
                followerName: currentUser.displayName || 'User'
            })
        ]);
        
        if (buttonElement) {
            buttonElement.innerHTML = '<i class="fas fa-check"></i> Following';
            buttonElement.classList.add('following');
            buttonElement.disabled = true;
        }
        
        showToast(`You're now following ${targetUserName}!`, 'success');
        refreshFeedSuggestions();
        return true;
    } catch (error) {
        console.error('Error following user:', error);
        showToast('Failed to follow user. Please try again.', 'error');
        return false;
    }
}
// Unfollow user
function unfollowUser(targetUserId, followBtn) {
    firebase.firestore().collection('users').doc(currentUser.uid).update({
        following: firebase.firestore.FieldValue.arrayRemove(targetUserId)
    })
    .then(function() {
        // Remove current user from target user's followers
        return firebase.firestore().collection('users').doc(targetUserId).update({
            followers: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
        });
    })
    .then(function() {
        followBtn.classList.remove('following');
        followBtn.textContent = 'Follow';
        console.log('Unfollowed user:', targetUserId);
    })
    .catch(function(error) {
        console.error('Error unfollowing user:', error);
    });
}
// Render Notifications Page
// ===== ENHANCED NOTIFICATIONS PAGE =====
function renderNotificationsPage() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <header class="app-header">
            <div class="container">
                <h1><i class="fas fa-bell"></i> Notifications</h1>
                <div class="header-actions">
                    <button id="markAllReadBtn" class="btn-icon" title="Mark all as read">
                        <i class="fas fa-check-double"></i>
                    </button>
                    <button onclick="loadPage('feed')" class="logout-btn">
                        <i class="fas fa-arrow-left"></i> Back
                    </button>
                </div>
            </div>
        </header>
        
        <main class="container main-content">
            <div class="notifications-container">
                <div class="notifications-header">
                    <h2>Your Notifications</h2>
                    <div class="notifications-filter">
                        <button class="filter-btn active" data-filter="all">All</button>
                        <button class="filter-btn" data-filter="unread">Unread</button>
                    </div>
                </div>
                
                <div id="notificationsList" class="notifications-list">
                    <div class="loading">
                        <i class="fas fa-spinner fa-spin"></i> Loading notifications...
                    </div>
                </div>
                
                <div id="emptyNotifications" class="empty-notifications hidden">
                    <i class="fas fa-bell-slash fa-2x"></i>
                    <h3>No notifications yet</h3>
                    <p>When you get notifications, they'll appear here</p>
                </div>
            </div>
        </main>
        
        <nav class="bottom-nav">
            <a href="#" class="nav-item" data-page="feed">
                <i class="fas fa-home"></i>
                <span>Feed</span>
            </a>
            <a href="#" class="nav-item active" data-page="notifications">
                <i class="fas fa-bell"></i>
                <span>Notifications</span>
                <span class="unread-badge" id="notificationBadgeBottom" style="display:none"></span>
            </a>
            <a href="#" class="nav-item" data-page="profile">
                <i class="fas fa-user"></i>
                <span>Profile</span>
            </a>
        </nav>
    `;
    
    setupNotificationsPage();
}

function setupNotificationsPage() {
    setupNavigation();
    
    // Setup mark all as read button
    const markAllBtn = document.getElementById('markAllReadBtn');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', markAllNotificationsAsRead);
    }
    
    // Setup filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const filter = this.getAttribute('data-filter');
            loadNotifications(filter);
        });
    });
    
    // Load notifications
    loadNotifications();
    setupNotificationsListener();
}

function loadNotifications(filter = 'all') {
    const container = document.getElementById('notificationsList');
    const emptyState = document.getElementById('emptyNotifications');
    
    if (!container || !currentUser) {
        console.error('Container not found or user not logged in');
        return;
    }
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading notifications...</div>';
    
    if (emptyState) emptyState.classList.add('hidden');
    
    // Clean up previous listener
    if (notificationsListener) {
        notificationsListener();
    }
    
    console.log(`Loading notifications with filter: ${filter} for user: ${currentUser.uid}`);
    
    // Get notifications for current user
    notificationsListener = firebase.firestore().collection('notifications')
        .where('targetUserId', '==', currentUser.uid)
        .limit(50)
        .onSnapshot((snapshot) => {
            console.log(`Received ${snapshot.size} notifications`);
            
            if (!snapshot.empty) {
                container.innerHTML = '';
                let hasVisibleNotifications = false;
                const notificationsArray = [];
                
                snapshot.forEach(doc => {
                    try {
                        const notificationData = {
                            id: doc.id,
                            ...doc.data()
                        };
                        notificationsArray.push(notificationData);
                    } catch (error) {
                        console.error('Error processing notification doc:', error);
                    }
                });
                
                // Sort by createdAt (newest first)
                notificationsArray.sort((a, b) => {
                    try {
                        const aTime = a.createdAt?.toDate?.()?.getTime() || 
                                     new Date(a.createdAt || 0).getTime() || 0;
                        const bTime = b.createdAt?.toDate?.()?.getTime() || 
                                     new Date(b.createdAt || 0).getTime() || 0;
                        return bTime - aTime;
                    } catch (error) {
                        return 0;
                    }
                });
                
                // Apply filter and render
                notificationsArray.forEach(notificationData => {
                    const shouldShow = filter === 'all' || 
                                      (filter === 'unread' && !notificationData.read);
                    
                    if (shouldShow) {
                        try {
                            const notificationElement = createNotificationElement(notificationData);
                            if (notificationElement) {
                                container.appendChild(notificationElement);
                                hasVisibleNotifications = true;
                            }
                        } catch (error) {
                            console.error('Error creating notification element:', error, notificationData);
                        }
                    }
                });
                
                if (hasVisibleNotifications) {
                    if (emptyState) emptyState.classList.add('hidden');
                    console.log(`Displayed ${notificationsArray.length} notifications`);
                } else {
                    container.innerHTML = '';
                    if (emptyState) emptyState.classList.remove('hidden');
                    console.log('No notifications to display with current filter');
                }
            } else {
                container.innerHTML = '';
                if (emptyState) emptyState.classList.remove('hidden');
                console.log('No notifications found');
            }
            
        }, (error) => {
            console.error('Error loading notifications:', error);
            container.innerHTML = '<div class="error">Error loading notifications. Please try again.</div>';
            if (emptyState) emptyState.classList.remove('hidden');
        });
}
function sortNotificationsByDate(container) {
    const notifications = Array.from(container.children);
    
    notifications.sort((a, b) => {
        // Get timestamps from data attributes or fallback to DOM order
        const aTime = a.dataset.timestamp || 0;
        const bTime = b.dataset.timestamp || 0;
        return bTime - aTime; // Newest first
    });
    
    // Reappend in sorted order
    notifications.forEach(notification => {
        container.appendChild(notification);
    });
}
function createNotificationElement(notificationData) {
    // Safety check
    if (!notificationData || typeof notificationData !== 'object') {
        console.error('Invalid notification data:', notificationData);
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'notification-item error';
        emptyDiv.innerHTML = '<div class="error">Invalid notification data</div>';
        return emptyDiv;
    }
    
    const div = document.createElement('div');
    div.className = `notification-item ${notificationData.read ? 'read' : 'unread'}`;
    
    // Set ID if available
    if (notificationData.id) {
        div.dataset.notificationId = notificationData.id;
    }
    
    // Store data for debugging
    div.dataset.notificationType = notificationData.type || 'unknown';
    div.dataset.targetId = notificationData.data?.postId || notificationData.fromUserId || '';
    
    // Store timestamp for client-side sorting
    if (notificationData.createdAt) {
        try {
            const date = notificationData.createdAt.toDate ? 
                notificationData.createdAt.toDate() : 
                new Date(notificationData.createdAt);
            div.dataset.timestamp = date.getTime();
        } catch (error) {
            console.error('Error parsing notification date:', error);
            div.dataset.timestamp = Date.now();
        }
    }
    
    // Set default values
    let icon = 'fa-bell';
    let message = 'New notification';
    let actionText = 'View';
    let actionIcon = 'fa-arrow-right';
    let onClickAction = 'void(0)'; // Default to no action
    let previewContent = '';
    
    // Safely extract data
    const fromUserName = notificationData.fromUserName || 'Someone';
    const postContent = notificationData.data?.postContent ? 
        escapeHtml(String(notificationData.data.postContent).substring(0, 80)) : '';
    const commentContent = notificationData.data?.commentContent ? 
        escapeHtml(String(notificationData.data.commentContent).substring(0, 60)) : '';
    
    // Determine notification type and content
    switch(notificationData.type) {
        case 'like':
        case NOTIFICATION_TYPES.LIKE:
            icon = 'fa-thumbs-up';
            message = `<strong>${fromUserName}</strong> liked your post`;
            actionText = 'View Post';
            actionIcon = 'fa-eye';
            if (notificationData.data?.postId) {
                onClickAction = `openPostFromNotification('${notificationData.data.postId}')`;
            }
            previewContent = postContent;
            break;
            
        case 'comment':
        case NOTIFICATION_TYPES.COMMENT:
            icon = 'fa-comment';
            message = `<strong>${fromUserName}</strong> commented on your post`;
            actionText = 'View Post';
            actionIcon = 'fa-eye';
            if (notificationData.data?.postId) {
                onClickAction = `openPostFromNotification('${notificationData.data.postId}')`;
            }
            previewContent = commentContent || postContent;
            break;
            
        case 'follow':
        case NOTIFICATION_TYPES.FOLLOW:
            icon = 'fa-user-plus';
            message = `<strong>${fromUserName}</strong> started following you`;
            actionText = 'View Profile';
            actionIcon = 'fa-user';
            if (notificationData.fromUserId) {
                onClickAction = `openUserFromNotification('${notificationData.fromUserId}')`;
            }
            break;
            
        case 'mention':
        case NOTIFICATION_TYPES.MENTION:
            icon = 'fa-at';
            message = `<strong>${fromUserName}</strong> mentioned you`;
            actionText = 'View Post';
            actionIcon = 'fa-eye';
            if (notificationData.data?.postId) {
                onClickAction = `openPostFromNotification('${notificationData.data.postId}')`;
            }
            previewContent = postContent;
            break;
            
        case 'reply':
        case NOTIFICATION_TYPES.REPLY:
            icon = 'fa-reply';
            message = `<strong>${fromUserName}</strong> replied to your comment`;
            actionText = 'View Post';
            actionIcon = 'fa-eye';
            if (notificationData.data?.postId) {
                onClickAction = `openPostFromNotification('${notificationData.data.postId}')`;
            }
            previewContent = commentContent;
            break;
            
        default:
            icon = 'fa-bell';
            message = `New notification from <strong>${fromUserName}</strong>`;
            actionText = 'View';
            actionIcon = 'fa-arrow-right';
    }
    
    const timeAgo = formatTime(notificationData.createdAt);
    
    // Build HTML
    div.innerHTML = `
        <div class="notification-icon">
            <i class="fas ${icon}"></i>
        </div>
        <div class="notification-content">
            <div class="notification-message">${message}</div>
            <div class="notification-time">${timeAgo}</div>
            ${previewContent ? 
                `<div class="notification-preview">${previewContent}</div>` : ''}
        </div>
        <div class="notification-actions">
      <button class="notification-action-btn" onclick="${onClickAction}">
                <i class="fas ${actionIcon}"></i> ${actionText}
            </button>
            ${!notificationData.read ? `
            <button class="mark-read-btn" data-id="${notificationData.id || ''}" title="Mark as read">
                <i class="fas fa-check"></i>
            </button>
            ` : ''}
        </div>
    `;
    
    // Add click handler to mark as read when notification is clicked
    div.addEventListener('click', function(e) {
        if (!e.target.closest('.notification-action-btn') && !e.target.closest('.mark-read-btn')) {
            if (!notificationData.read && notificationData.id) {
                markNotificationAsRead(notificationData.id);
            }
        }
    });
    
    // Add mark as read button handler
    const markReadBtn = div.querySelector('.mark-read-btn');
    if (markReadBtn && notificationData.id) {
        markReadBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            markNotificationAsRead(notificationData.id);
        });
    }
    
    return div;
}
async function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        const checkElement = () => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }
            
            if (Date.now() - startTime > timeout) {
                reject(new Error(`Element ${selector} not found after ${timeout}ms`));
                return;
            }
            
            setTimeout(checkElement, 100);
        };
        
        checkElement();
    });
}

function openPostFromNotification(postId) {
    if (!postId) {
        showToast('Invalid post reference', 'error');
        return;
    }
    
    // Close notifications page and go to feed
    loadPage('feed');
    
    // Mark notification as read
    const notificationId = getCurrentNotificationId();
    if (notificationId) {
        markNotificationAsRead(notificationId);
    }
    
    // Try to find and scroll to the post
    setTimeout(async () => {
        try {
            // Check if post still exists
            const postRef = firebase.firestore().collection('posts').doc(postId);
            const postDoc = await postRef.get();
            
            if (!postDoc.exists) {
                showToast('Post was deleted or not found', 'info');
                return;
            }
            
            const postData = postDoc.data();
            
            // Wait for posts to load
            await waitForElement('.post', 5000).catch(() => {
                // Posts haven't loaded yet, try to load them
                console.log('Posts not loaded yet, refreshing feed...');
                if (currentPage === 'feed') {
                    loadPosts(true);
                }
            });
            
            // Try to find the post in the DOM
            const postElement = document.querySelector(`.post[data-post-id="${postId}"]`);
            
            if (postElement) {
                // Scroll to the post
                postElement.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
                
                // Highlight the post
                postElement.classList.add('highlighted');
                
                // Open comments if available
                const commentBtn = postElement.querySelector('.comment-btn');
                if (commentBtn) {
                    setTimeout(() => {
                        commentBtn.click();
                    }, 1000);
                }
                
                // Remove highlight after 3 seconds
                setTimeout(() => {
                    postElement.classList.remove('highlighted');
                }, 3000);
            } else {
                // Post not in current view, show message
                showToast('Post found but not in current view. Check your feed.', 'info');
                
                // Try to load post directly
                try {
                    await loadSinglePost(postId);
                } catch (loadError) {
                    console.error('Could not load post:', loadError);
                }
            }
            
        } catch (error) {
            console.error('Error opening post from notification:', error);
            showToast('Could not open the post. It may have been deleted.', 'error');
        }
    }, 500);
}

function openUserFromNotification(userId) {
    if (!userId) {
        showToast('Invalid user reference', 'error');
        return;
    }
    
    // Mark notification as read
    const notificationId = getCurrentNotificationId();
    if (notificationId) {
        markNotificationAsRead(notificationId);
    }
    
    // Load user profile with error handling
    loadUserProfile(userId);
}
async function loadSinglePost(postId) {
    try {
        const postRef = firebase.firestore().collection('posts').doc(postId);
        const postDoc = await postRef.get();
        
        if (postDoc.exists) {
            const post = {
                id: postDoc.id,
                ...postDoc.data()
            };
            
            // Create and display the post
            const postsContainer = document.getElementById('postsContainer');
            if (postsContainer) {
                // Clear and show just this post
                postsContainer.innerHTML = '<h3>Post from notification:</h3>';
                const postElement = createPostElement(post.id, post);
                postsContainer.appendChild(postElement);
                
                // Scroll to it
                setTimeout(() => {
                    postElement.scrollIntoView({ behavior: 'smooth' });
                    postElement.classList.add('highlighted');
                }, 100);
            }
        }
    } catch (error) {
        console.error('Error loading single post:', error);
        throw error;
    }
}
function getCurrentNotificationId() {
    const activeNotification = document.querySelector('.notification-item.unread');
    if (activeNotification) {
        return activeNotification.dataset.notificationId;
    }
    return null;
}

function setupNotificationsListener() {
    // Real-time listener for new notifications
    if (notificationsListener) {
        notificationsListener();
    }
    
    notificationsListener = firebase.firestore().collection('notifications')
        .where('targetUserId', '==', currentUser.uid)
        .where('read', '==', false)
        .onSnapshot((snapshot) => {
            updateNotificationCounts();
            
            // Update UI if on notifications page
            if (currentPage === 'notifications') {
                const activeFilter = document.querySelector('.filter-btn.active');
                if (activeFilter) {
                    loadNotifications(activeFilter.getAttribute('data-filter'));
                }
            }
        });
}
// Setup navigation for all pages
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            loadPage(page);
        });
    });
}
// Helper functions
function formatTime(timestamp) {
    if (!timestamp) return '';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getColorFromName(name) {
    if (!name) return '#667eea';
    
    const colors = [
        '#667eea', '#764ba2', '#f093fb', '#f5576c',
        '#4facfe', '#00f2fe', '#43e97b', '#38f9d7',
        '#fa709a', '#fee140', '#ff9a9e', '#a18cd1'
    ];
    
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
}

// ===== REAL-TIME NEW POSTS LISTENER =====
function setupNewPostsListener() {
    // Clean up previous listener
    if (postsListener) postsListener();
    
    // Listen for new posts with a timestamp comparison
    postsListener = firebase.firestore().collection('posts')
        .limit(1)
        .onSnapshot((snapshot) => {
            if (!snapshot.empty && currentUser) {
                const latestPost = snapshot.docs[0];
                const postTime = latestPost.data().createdAt?.toDate() || new Date();
                const now = new Date();
                const timeDiff = now - postTime;
                
                // Store the latest post time
                const lastKnownPostTime = localStorage.getItem('lastKnownPostTime');
                
                // If post is new (more recent than last known) and user is not at top
                if (!lastKnownPostTime || postTime > new Date(parseInt(lastKnownPostTime))) {
                    if (window.scrollY > 200) {
                        newPostsCount++;
                        newPostsAvailable = true;
                        showNewPostsButton(newPostsCount);
                    }
                    
                    // Update last known post time
                    localStorage.setItem('lastKnownPostTime', postTime.getTime());
                }
            }
        }, (error) => {
            console.error("Error listening for new posts:", error);
        });
}

// ===== NEW POSTS BUTTON =====
function showNewPostsButton(count) {
    // Check if button already exists
    const existingButton = document.getElementById('newPostsButton');
    if (existingButton) {
        // Update existing button
        const countBadge = existingButton.querySelector('.count-badge');
        if (countBadge) {
            countBadge.textContent = count;
        } else if (count > 1) {
            existingButton.innerHTML = `
                <i class="fas fa-arrow-up"></i>
                <span>New posts</span>
                <span class="count-badge">${count}</span>
            `;
        }
        return;
    }
    
    // Create new button
    const button = document.createElement('button');
    button.id = 'newPostsButton';
    button.className = 'new-posts-button';
    button.innerHTML = `
        <i class="fas fa-arrow-up"></i>
        <span>New posts</span>
        ${count > 1 ? `<span class="count-badge">${count}</span>` : ''}
    `;
    
    // Add click handler
    button.addEventListener('click', scrollToTopAndLoadNewPosts);
    
    document.body.appendChild(button);
    
    // Auto-hide after 30 seconds if not clicked
    setTimeout(() => {
        if (button.parentNode && !button.classList.contains('clicked')) {
            hideNewPostsButton();
        }
    }, 30000);
}

function hideNewPostsButton() {
    const button = document.getElementById('newPostsButton');
    if (button) {
        button.classList.add('hiding');
        setTimeout(() => {
            if (button.parentNode) button.parentNode.removeChild(button);
            newPostsAvailable = false;
            newPostsCount = 0;
        }, 300);
    }
}

async function scrollToTopAndLoadNewPosts() {
    const button = document.getElementById('newPostsButton');
    if (button) {
        button.classList.add('clicked');
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        button.disabled = true;
    }
    
    try {
        // First, scroll to top smoothly
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
        
        // Wait for scroll to complete
        await new Promise(resolve => setTimeout(resolve, 300));
        
        if (currentPage === 'feed') {
            // Clear existing posts and load fresh ones
            const postsContainer = document.getElementById('postsContainer');
            if (postsContainer) {
                postsContainer.innerHTML = '';
                lastVisiblePost = null; // Reset pagination
            }
            
            // Show skeletons while loading
            showSkeletonPosts(3);
            
            // Load fresh posts
            await loadPosts(true);
            
            // Clear the new posts counter
            newPostsAvailable = false;
            newPostsCount = 0;
            
            // Update last known post time to now
            localStorage.setItem('lastKnownPostTime', Date.now());
        }
    } catch (error) {
        console.error("Error loading new posts:", error);
    } finally {
        // Remove button
        hideNewPostsButton();
    }
}

function scrollToTopAndRefresh() {
    // First, hide any existing button
    hideNewPostsButton();
    
    // Also hide toast if exists
    const toast = document.getElementById('newPostsToast');
    if (toast) {
        toast.classList.add('hiding');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }
    
    // Scroll to top
    window.scrollTo({ 
        top: 0, 
        behavior: 'smooth' 
    });
    
    // Refresh feed with latest posts
    if (currentPage === 'feed') {
        loadPosts(true); // Force refresh
    }
    
    newPostsAvailable = false;
    newPostsCount = 0;
}

function dismissNewPostsToast() {
    // Hide toast
    const toast = document.getElementById('newPostsToast');
    if (toast) {
        toast.classList.add('hiding');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }
    
    // Also hide button if exists
    hideNewPostsButton();
    
    newPostsAvailable = false;
    newPostsCount = 0;
}

function trackNewPostView() {
    // When user scrolls to top or clicks new posts button
    // Mark that they've seen the latest posts
    const lastSeenPostTime = Date.now();
    localStorage.setItem('lastSeenPostTime', lastSeenPostTime);
    
    // Also update in Firestore for cross-device sync
    if (currentUser) {
        firebase.firestore().collection('users').doc(currentUser.uid).update({
            lastSeenFeedTime: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => {/* Silently fail */});
    }
}

function onNewPostsViewed() {
    trackNewPostView();
    newPostsAvailable = false;
    newPostsCount = 0;
    hideNewPostsButton();
}
window.loadPage = loadPage;
// Make handleNotificationClick globally available
window.handleNotificationClick = handleNotificationClick;
window.loadUserProfile = loadUserProfile;
window.renderOtherUserProfile = renderOtherUserProfile;
window.scrollToTopAndRefresh = scrollToTopAndRefresh;
window.dismissNewPostsToast = dismissNewPostsToast;
window.addEventListener('scroll', function() {
    if (window.scrollY < 100) {
        if (newPostsAvailable) {
            onNewPostsViewed();
        }
        hideNewPostsButton();
    }
    let lastScrollTop = 0;
    const st = window.pageYOffset || document.documentElement.scrollTop;
    if (st < lastScrollTop && st > 200) {
    }
    lastScrollTop = st <= 0 ? 0 : st;
});