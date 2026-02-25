// ========== SCRIPT LOADER WITH RETRY (Fixed for older browsers) ==========
(function loadFirebaseScripts() {
  const scripts = [
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics-compat.js',
    'https://www.gstatic.com/firebasejs/9.22.2/firebase-database-compat.js'
  ];

  let loadedCount = 0;
  const totalScripts = scripts.length;
  let retryCount = 0;
  const maxRetries = 3;

  function loadScript(url, attempt = 0) {
    return new Promise(function(resolve, reject) {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;

      script.onload = function() {
        console.log('✓ Loaded: ' + url);
        loadedCount++;

        // Update loading progress if elements exist
        const loadingProgress = document.getElementById('loadingProgress');
        const loadingText = document.getElementById('loadingText');

        if (loadingProgress) {
          const percentage = Math.round((loadedCount / totalScripts) * 100);
          loadingProgress.style.width = percentage + '%';
        }

        if (loadingText) {
          loadingText.textContent = 'Loading... (' + loadedCount + '/' + totalScripts + ')';
        }

        resolve();
      };

      script.onerror = function() {
        console.warn('✗ Failed to load: ' + url + ' (attempt ' + (attempt + 1) + '/' + (maxRetries + 1) + ')');

        if (attempt < maxRetries) {
          // Exponential backoff
          var delay = 1000 * Math.pow(2, attempt);
          setTimeout(function() {
            loadScript(url, attempt + 1).then(resolve)['catch'](reject);
          }, delay);
        } else {
          reject(new Error('Failed to load script after ' + (maxRetries + 1) + ' attempts: ' + url));
        }
      };

      document.body.appendChild(script);
    });
  }

  function loadAllScripts() {
    // Use Promise chain instead of async/await
    var promise = Promise.resolve();
    
    for (var i = 0; i < scripts.length; i++) {
      promise = promise.then((function(index) {
        return function() {
          return loadScript(scripts[index]);
        };
      })(i));
    }
    
    promise.then(function() {
      console.log('All Firebase scripts loaded successfully');

      // Hide loading state if it exists
      var loadingState = document.getElementById('loadingState');
      if (loadingState) loadingState.style.display = 'none';

      // Initialize the app after scripts are loaded
      if (typeof app !== 'undefined' && app.init) {
        app.init();
      }
    })['catch'](function(error) {
      console.error('Failed to load Firebase scripts:', error);

      // Show error in UI
      var errorModal = document.getElementById('errorModal');
      var errorTitle = document.getElementById('errorTitle');
      var errorMessage = document.getElementById('errorMessage');

      if (errorModal && errorTitle && errorMessage) {
        errorTitle.textContent = 'Connection Failed';
        errorMessage.textContent = 'Unable to load required resources. Please check your connection.';
        errorModal.classList.add('active');

        // Setup retry button
        var retryBtn = document.getElementById('manualRetryBtn');
        if (retryBtn) {
          retryBtn.onclick = function() {
            errorModal.classList.remove('active');
            loadFirebaseScripts(); // Retry loading
          };
        }

        // Auto-retry countdown
        var countdown = 10;
        var countdownEl = document.getElementById('autoRetryCountdown');
        var interval = setInterval(function() {
          countdown--;
          if (countdownEl) countdownEl.textContent = countdown;

          if (countdown <= 0) {
            clearInterval(interval);
            errorModal.classList.remove('active');
            loadFirebaseScripts(); // Auto retry
          }
        }, 1000);
      }
    });
  }

  // Start loading
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAllScripts);
  } else {
    loadAllScripts();
  }
})();

const firebaseConfig = {
    apiKey: "AIzaSyCZCAwncuoDuy033ZrEquCwRvYpacBs8xM",
    authDomain: "heartquotecommunity.firebaseapp.com",
    projectId: "heartquotecommunity",
    storageBucket: "heartquotecommunity.firebasestorage.app",
    messagingSenderId: "346084161963",
    appId: "1:346084161963:web:f7ed56dc4a4599f4befaee",
    measurementId: "G-JGKWQP35QB"
  };
  
// Local storage keys
var STORAGE_KEYS = {
  likedQuotes: 'likedQuotes',
  draftQuoteText: 'draftQuoteText',
  draftReplyPrefix: 'draftReply_',
  draftQuoteBgColor: 'draftQuoteBgColor',
  quoteAuthor: 'quoteAuthor',
  visitorId: 'visitorId'
};

// Prohibited words list
var prohibitedWords = ['spam', 'badword', 'inappropriate'];

// Main Application Object
var app = {
  // Properties
  database: null,
  analytics: null,
  currentAuthor: '',
  likedQuotes: {},
  currentQuoteIdForReply: null,
  isTyping: false,
  typingTimeout: null,
  typingRef: null,
  myTypingRef: null,

  // DOM Elements
  elements: {},

  // Initialization
  init: function() {
    try {
      // Initialize Firebase
      var firebaseApp = firebase.initializeApp(firebaseConfig);
      this.database = firebase.database();
      this.analytics = firebase.analytics();

      // Cache DOM elements
      this.cacheElements();

      // Load saved data
      this.loadSavedData();

      // Setup event listeners
      this.setupEventListeners();

      // Load quotes
      this.loadQuotes();

      console.log('Application initialized successfully');
    } catch (error) {
      console.error('Failed to initialize application:', error);
    }
  },

  // Cache DOM elements
cacheElements: function() {
  this.elements = {
    quoteAuthor: document.getElementById('quoteAuthor'),
    quoteText: document.getElementById('quoteText'),
    quoteBgColor: document.getElementById('quoteBgColor'),
    quotesContainer: document.getElementById('quotesContainer'),
    replyPanel: document.getElementById('replyPanel'),
    replyPanelContent: document.getElementById('replyPanelContent'),
    replyText: document.getElementById('reply-text'),
    typingIndicator: document.getElementById('typing-indicator'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage'),
    shimmerContainer: null
  };
  
  // If toast elements are missing, create them
  var self = this;
  setTimeout(function() {
    if (!self.elements.toast || !self.elements.toastMessage) {
      self.createToastElements();
    }
  }, 100);
},

  // Load saved data from localStorage
  loadSavedData: function() {
    try {
      // Load liked quotes
      var savedLikes = localStorage.getItem(STORAGE_KEYS.likedQuotes);
      this.likedQuotes = savedLikes ? JSON.parse(savedLikes) : {};

      // Load author
      this.currentAuthor = localStorage.getItem(STORAGE_KEYS.quoteAuthor) || '';
      if (this.currentAuthor) {
        this.elements.quoteAuthor.value = this.currentAuthor;
        this.elements.quoteAuthor.readOnly = true;
      }

      // Load drafts
      this.elements.quoteText.value = this.loadFromLocalStorage(STORAGE_KEYS.draftQuoteText) || '';
      this.elements.quoteBgColor.value = this.loadFromLocalStorage(STORAGE_KEYS.draftQuoteBgColor) || '';

      if (this.elements.quoteBgColor.value) {
        this.elements.quoteText.style.backgroundColor = this.elements.quoteBgColor.value;
        this.elements.quoteBgColor.style.backgroundColor = this.elements.quoteBgColor.value;
      }
    } catch (error) {
      console.error('Error loading saved data:', error);
    }
  },

  // Setup event listeners
  setupEventListeners: function() {
    var self = this;
    
    // Quote text input
    this.elements.quoteText.addEventListener('input', function() {
      self.saveToLocalStorage(STORAGE_KEYS.draftQuoteText, self.elements.quoteText.value);
      self.updateTypingStatus();
    });

    // Background color input
    this.elements.quoteBgColor.addEventListener('input', function() {
      self.elements.quoteBgColor.style.backgroundColor = self.elements.quoteBgColor.value;
      self.saveToLocalStorage(STORAGE_KEYS.draftQuoteBgColor, self.elements.quoteBgColor.value);
    });

    // Reply text input
    if (this.elements.replyText) {
      this.elements.replyText.addEventListener('input', function() {
        if (self.currentQuoteIdForReply) {
          self.updateTypingStatus(self.currentQuoteIdForReply);
        }
      });
    }

    // Setup typing listeners
    this.setupTypingListeners();

    // Cleanup on page unload
    window.addEventListener('beforeunload', function() {
      if (self.isTyping && self.myTypingRef) {
        self.myTypingRef.set({
          author: self.currentAuthor,
          isTyping: false
        });
      }
    });
  },

  // Setup typing indicator listeners
  setupTypingListeners: function() {
    var self = this;
    
    this.typingRef = this.database.ref('typing');
    this.myTypingRef = this.typingRef.child(this.getVisitorId());

    this.typingRef.on('child_added', function(snapshot) {
      if (snapshot.key !== self.getVisitorId() && snapshot.val().isTyping) {
        self.showTypingIndicator(snapshot.val());
      }
    });

    this.typingRef.on('child_changed', function(snapshot) {
      if (snapshot.key !== self.getVisitorId()) {
        var typingData = snapshot.val();
        if (typingData.isTyping) {
          self.showTypingIndicator(typingData);
          self.playSound('typingSound');
        } else {
          self.hideTypingIndicator();
        }
      }
    });
  },

  // Update typing status
  updateTypingStatus: function(quoteId) {
    var self = this;
    if (!this.currentAuthor) return;

    var isTypingNow = quoteId 
      ? document.getElementById('reply-text-' + quoteId) ? document.getElementById('reply-text-' + quoteId).value.trim() !== '' : false
      : this.elements.quoteText.value.trim() !== '';

    if (isTypingNow !== this.isTyping) {
      this.isTyping = isTypingNow;
      this.myTypingRef.set({
        author: this.currentAuthor,
        isTyping: isTypingNow,
        type: quoteId ? 'reply' : 'quote',
        quoteId: quoteId || null
      })['catch'](function(error) {
        console.error("Error updating typing status:", error);
      });
    }

    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(function() {
      if (self.isTyping) {
        self.isTyping = false;
        self.myTypingRef.set({
          author: self.currentAuthor,
          isTyping: false,
          type: null,
          quoteId: null
        })['catch'](function(error) {
          console.error("Error resetting typing status:", error);
        });
      }
    }, 2000);
  },

  // Show typing indicator
  showTypingIndicator: function(typingData) {
    var self = this;
    if (typingData.author === this.currentAuthor) return;

    var actionText = typingData.type === 'reply' 
      ? 'is Replying...' 
      : 'is Typing...';

    this.elements.typingIndicator.innerHTML = '\
      <span class="typing-dots">\
        <span class="typing-dot"></span>\
        <span class="typing-dot"></span>\
        <span class="typing-dot"></span>\
      </span>\
      <span class="typing-text">' + typingData.author + ' ' + actionText + '</span>\
    ';

    this.elements.typingIndicator.style.display = 'flex';
    this.elements.typingIndicator.style.opacity = '1';

    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(function() {
      self.elements.typingIndicator.style.opacity = '0';
      setTimeout(function() {
        self.elements.typingIndicator.style.display = 'none';
      }, 500);
    }, 5000);
  },

  // Hide typing indicator
  hideTypingIndicator: function() {
    var self = this;
    this.elements.typingIndicator.style.opacity = '0';
    setTimeout(function() {
      self.elements.typingIndicator.style.display = 'none';
    }, 300);
  },

  // ========== CORE FUNCTIONS ==========

  // Show toast notification
  // Replace the showToast method with this improved version
showToast: function(message, isSuccess) {
  if (isSuccess === undefined) isSuccess = true;
  
  try {
    // Check if toast elements exist, if not create them
    if (!this.elements.toast) {
      this.createToastElements();
    }
    
    if (!this.elements.toast || !this.elements.toastMessage) {
      console.error('Toast elements not found');
      // Fallback to alert if toast not available
      alert(message);
      return;
    }
    
    // Set the message
    this.elements.toastMessage.textContent = message;
    
    // Set the class based on success/error
    this.elements.toast.className = isSuccess ? 'toast show' : 'toast error show';
    
    // Auto hide after 3 seconds
    var self = this;
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    
    this.toastTimeout = setTimeout(function() {
      if (self.elements.toast) {
        self.elements.toast.className = 'toast';
      }
    }, 3000);
    
  } catch (error) {
    console.error('Error showing toast:', error);
    // Fallback to alert
    alert(message);
  }
},

// Add this new method to create toast elements if they don't exist
createToastElements: function() {
  try {
    // Check if toast container already exists in DOM
    var toast = document.getElementById('toast');
    var toastMessage = document.getElementById('toastMessage');
    
    if (!toast) {
      // Create toast container
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      
      // Create toast message element
      toastMessage = document.createElement('span');
      toastMessage.id = 'toastMessage';
      
      // Append message to toast
      toast.appendChild(toastMessage);
      
      // Append toast to body
      document.body.appendChild(toast);
    }
    
    if (!toastMessage) {
      toastMessage = document.getElementById('toastMessage');
      if (!toastMessage && toast) {
        toastMessage = document.createElement('span');
        toastMessage.id = 'toastMessage';
        toast.appendChild(toastMessage);
      }
    }
    
    // Update elements cache
    this.elements.toast = toast;
    this.elements.toastMessage = toastMessage;
    
  } catch (error) {
    console.error('Error creating toast elements:', error);
  }
},

// Also update the cacheElements method to ensure toast elements are found

  // Play sound
  playSound: function(soundId) {
    try {
      var sound = document.getElementById(soundId);
      if (sound) {
        sound.currentTime = 0;
        sound.play()['catch'](function(e) { 
          console.log("Could not play sound:", e);
        });
      }
    } catch (error) {
      console.error("Error playing sound:", error);
    }
  },

  // Get initials from name
  getInitials: function(name) {
    if (!name) return 'U';
    return name.split(' ').map(function(word) { 
      return word[0]; 
    }).join('').toUpperCase().substring(0, 2);
  },

  // Toggle reply panel
  toggleReplyPanel: function(quoteId) {
    if (quoteId) {
      this.currentQuoteIdForReply = quoteId;
      this.loadReplies(quoteId);
      this.elements.replyPanel.classList.add('active');
      document.body.style.overflow = "hidden";
    } else {
      this.elements.replyPanel.classList.remove('active');
      this.currentQuoteIdForReply = null;
      document.body.style.overflow = "auto";
    }
  },

  // Submit reply
  submitReply: function() {
    var self = this;
    if (!this.currentQuoteIdForReply) return;

    var replyText = this.elements.replyText.value.trim();
    var author = this.currentAuthor || 'Anonymous';

    if (!replyText) {
      this.showToast('Reply cannot be empty!', false);
      return;
    }

    if (this.hasProhibitedContent(replyText)) {
      this.showToast('Your reply contains words that are not allowed. Please remove them.', false);
      return;
    }

    if (this.containsLinks(replyText)) {
      this.showToast('Links are not allowed in replies. Please remove them.', false);
      return;
    }

    var newReply = {
      text: replyText,
      author: author,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      likes: 0,
      likedBy: {}
    };

    this.elements.replyText.value = '';

    this.database.ref('quotes/' + this.currentQuoteIdForReply + '/replies').push(newReply)
      .then(function() {
        self.playSound('replySound');
        self.showToast('You Replied!');
        self.loadReplies(self.currentQuoteIdForReply);
      })
      ['catch'](function(error) {
        console.error("Error adding reply:", error);
        self.showToast('Error adding reply: ' + error.message, false);
      });
  },

  // Load replies for a quote
  loadReplies: function(quoteId) {
    var self = this;
    var repliesContainer = this.elements.replyPanelContent;
    repliesContainer.innerHTML = '<div class="loading-replies">Loading replies...</div>';

    this.database.ref('quotes/' + quoteId + '/replies').on('value', function(snapshot) {
      repliesContainer.innerHTML = '';

      if (!snapshot.exists()) {
        repliesContainer.innerHTML = '<div class="no-replies">No replies yet</div>';
        return;
      }

      var repliesArray = [];
      snapshot.forEach(function(childSnapshot) {
        var replyData = childSnapshot.val();
        replyData.id = childSnapshot.key;
        repliesArray.push(replyData);
      });

      repliesArray.sort(function(a, b) { 
        return a.createdAt - b.createdAt; 
      });

      repliesArray.forEach(function(reply) {
        var replyDiv = document.createElement('div');
        replyDiv.className = 'reply-card';

        var likes = reply.likes || 0;
        var likedBy = reply.likedBy || {};
        var isLiked = likedBy[self.getVisitorId()];
        var isAuthor = self.currentAuthor && reply.author === self.currentAuthor;

        replyDiv.innerHTML = '\
          <div class="reply-header">\
            <div class="reply-avatar">' + self.getInitials(reply.author) + '</div>\
            <div class="reply-author">' + reply.author + '</div>\
          </div>\
          <div class="reply-text">' + reply.text + '</div>\
          <div class="reply-meta">\
            <small>' + self.formatDateTimeWithGMT(reply.createdAt) + '</small>\
            <div class="reply-actions">\
              <button class="btn-like-reply ' + (isLiked ? 'liked' : '') + '" \
                      onclick="app.toggleReplyLike(\'' + quoteId + '\', \'' + reply.id + '\')">\
                <i class="fas fa-thumbs-up"></i>\
                <span class="like-count">' + likes + '</span>\
              </button>\
              ' + (isAuthor ? '\
              <button class="btn-delete-reply" \
                      onclick="app.deleteReply(\'' + quoteId + '\', \'' + reply.id + '\')">\
                <i class="fas fa-trash"></i>\
              </button>' : '') + '\
            </div>\
          </div>\
        ';
        repliesContainer.appendChild(replyDiv);
      });
    }, function(error) {
      repliesContainer.innerHTML = '<div class="error-replies">Error loading replies: ' + error.message + '</div>';
    });
  },

  // Show shimmer loading
  showShimmerLoading: function() {
    var quotesContainer = this.elements.quotesContainer;
    
    // Create shimmer container if it doesn't exist
    if (!this.elements.shimmerContainer) {
      this.elements.shimmerContainer = document.createElement('div');
      this.elements.shimmerContainer.id = 'shimmerContainer';
      this.elements.shimmerContainer.className = 'shimmer-container';
      quotesContainer.appendChild(this.elements.shimmerContainer);
    }
    
    // Generate 5 shimmer cards
    var shimmerHTML = '';
    for (var i = 0; i < 5; i++) {
      shimmerHTML += '\
        <div class="shimmer-card">\
          <div class="shimmer-header">\
            <div class="shimmer-avatar shimmer-animation"></div>\
            <div class="shimmer-info">\
              <div class="shimmer-line shimmer-animation" style="width: 120px;"></div>\
              <div class="shimmer-line shimmer-animation" style="width: 80px; margin-top: 8px;"></div>\
            </div>\
          </div>\
          <div class="shimmer-content">\
            <div class="shimmer-line shimmer-animation" style="width: 100%;"></div>\
            <div class="shimmer-line shimmer-animation" style="width: 95%; margin-top: 8px;"></div>\
            <div class="shimmer-line shimmer-animation" style="width: 90%; margin-top: 8px;"></div>\
          </div>\
          <div class="shimmer-footer">\
            <div class="shimmer-line shimmer-animation" style="width: 60px;"></div>\
            <div class="shimmer-line shimmer-animation" style="width: 60px;"></div>\
            <div class="shimmer-line shimmer-animation" style="width: 60px;"></div>\
          </div>\
        </div>\
      ';
    }
    
    this.elements.shimmerContainer.innerHTML = shimmerHTML;
    this.elements.shimmerContainer.style.display = 'block';
  },

  // Hide shimmer loading
  hideShimmerLoading: function() {
    if (this.elements.shimmerContainer) {
      this.elements.shimmerContainer.style.display = 'none';
    }
  },

  // Load quotes
  loadQuotes: function() {
    var self = this;
    var quotesContainer = this.elements.quotesContainer;
    
    // Show shimmer loading effect
    this.showShimmerLoading();

    this.database.ref('quotes').on('value', function(snapshot) {
      // Hide shimmer effect
      self.hideShimmerLoading();
      
      quotesContainer.innerHTML = '';

      if (!snapshot.exists()) {
        quotesContainer.innerHTML = '\
        <div class="empty-state">\
          <i class="fas fa-quote-right"></i>\
          <h3>No quotes yet</h3>\
          <p>Be the first to share a quote!</p>\
        </div>';
        return;
      }

      var quotesArray = [];
      snapshot.forEach(function(childSnapshot) {
        var quoteData = childSnapshot.val();
        quoteData.id = childSnapshot.key;
        quotesArray.push(quoteData);
      });

      quotesArray.sort(function(a, b) { 
        return b.createdAt - a.createdAt; 
      });

      quotesArray.forEach(function(quote) {
        var likedBy = quote.likedBy || {};
        var isLiked = self.likedQuotes[quote.id] || likedBy[self.getVisitorId()];
        if (likedBy[self.getVisitorId()]) {
          self.likedQuotes[quote.id] = true;
          self.saveToLocalStorage(STORAGE_KEYS.likedQuotes, JSON.stringify(self.likedQuotes));
        }

        var quoteDiv = document.createElement('div');
        quoteDiv.className = 'quote-card';
        quoteDiv.id = 'quote-' + quote.id;

        if (quote.bgColor) {
          quoteDiv.style.backgroundColor = quote.bgColor;
        }

        var sanitizedText = self.sanitizeText(quote.text);
        var replyCount = quote.replies ? Object.keys(quote.replies).length : 0;

        var quoteMenu = self.currentAuthor && quote.author === self.currentAuthor 
          ? '<div class="quote-menu">\
              <button class="btn-menu" onclick="app.toggleQuoteMenu(\'' + quote.id + '\', event)">\
                <i class="fas fa-ellipsis-vertical"></i>\
              </button>\
              <div id="menu-content-' + quote.id + '" class="quote-menu-content">\
                <button onclick="app.startEditQuote(\'' + quote.id + '\', \'' + quote.text.replace(/'/g, "\\'") + '\')">\
                  <i class="fas fa-edit"></i> Edit\
                </button>\
                <button class="delQuote" onclick="app.deleteQuote(\'' + quote.id + '\')">\
                  <i class="fas fa-trash"></i> Delete\
                </button>\
              </div>\
            </div>'
          : '';

        quoteDiv.innerHTML = '\
          ' + quoteMenu + '\
          <div class="quote-header">\
            <div class="user-avatar">' + self.getInitials(quote.author) + '</div>\
            <div class="user-info">\
              <div class="quote-author">' + quote.author + '</div>\
              <div class="timestamp">' + self.formatDateTimeWithGMT(quote.createdAt) + '</div>\
            </div>\
          </div>\
          \
          <div class="quote-text" style="color: ' + self.getTextColor(quote.bgColor) + ';">"' + sanitizedText + '"</div>\
          \
          <div class="quote-actions-bottom">\
            <div class="action-buttons">\
              <button class="action-btn ' + (isLiked ? 'liked' : '') + '" onclick="app.toggleLike(\'' + quote.id + '\')">\
                <i class="' + (isLiked ? 'fas' : 'far') + ' fa-thumbs-up"></i> \
                <span class="like-count">' + (quote.likes || 0) + '</span>\
              </button>\
              \
              <button class="btn-toggle-replies" onclick="app.toggleReplyPanel(\'' + quote.id + '\')">\
                <i class="fas fa-reply"></i> ' + replyCount + ' ' + (replyCount === 1 ? 'Reply' : 'Replies') + '\
              </button>\
              \
              <button class="action-btn-copy" onclick="app.copyToClipboard(\'' + quote.text.replace(/'/g, "\\'") + ' By ' + quote.author.replace(/'/g, "\\'") + '\')">\
                <i class="far fa-copy"></i> Copy\
              </button>\
            </div>\
          </div>\
        ';

        quotesContainer.appendChild(quoteDiv);
      });
    }, function(error) {
      // Hide shimmer on error
      self.hideShimmerLoading();
      
      quotesContainer.innerHTML = '\
      <div class="empty-state">\
        <i class="fas fa-exclamation-triangle"></i>\
        <h3>Error loading quotes</h3>\
        <p>' + error.message + '</p>\
      </div>';
    });
  },

  // Check if name is taken
  isNameTaken: function(name) {
    var self = this;
    return this.database.ref('quotes').orderByChild('author').equalTo(name).once('value')
      .then(function(snapshot) {
        return snapshot.exists();
      });
  },

  // Check for prohibited content
  hasProhibitedContent: function(text) {
    var lowerText = text.toLowerCase();
    for (var i = 0; i < prohibitedWords.length; i++) {
      if (lowerText.indexOf(prohibitedWords[i]) !== -1) {
        return true;
      }
    }
    return false;
  },

  // Check for links
  containsLinks: function(text) {
    var urlRegex = /(https?:\/\/[^\s]+)/g;
    return urlRegex.test(text);
  },

  // Sanitize text
  sanitizeText: function(text) {
    var urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, function(match) {
      return '<span class="non-clickable-link">' + match + '</span>';
    });
  },

  // Copy to clipboard
  copyToClipboard: function(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    document.body.appendChild(textarea);
    textarea.select();

    try {
      var successful = document.execCommand('copy');
      this.playSound('copySound');
      this.showToast(successful ? 'Copied!' : 'Failed to copy');
    } catch (err) {
      this.showToast('Failed to copy: ' + err, false);
    }

    document.body.removeChild(textarea);
  },

  // Get text color based on background
  getTextColor: function(bgColor) {
    if (!bgColor) return '#1e1e1e';
    var color = bgColor.substring(1);
    var rgb = parseInt(color, 16);
    var r = (rgb >> 16) & 0xff;
    var g = (rgb >> 8) & 0xff;
    var b = (rgb >> 0) & 0xff;
    var luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luma < 120 ? '#ffffff' : '#1e1e1e';
  },

  // Format date time
  formatDateTimeWithGMT: function(timestamp) {
    if (!timestamp) return 'Unknown time';
    var date = new Date(timestamp);
    var now = new Date();
    var diffMs = now - date;
    var diffMins = Math.floor(diffMs / 60000);
    var diffHours = Math.floor(diffMs / 3600000);
    var diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return diffMins + ' min' + (diffMins > 1 ? 's' : '') + ' ago';
    if (diffHours < 24) return diffHours + ' hour' + (diffHours > 1 ? 's' : '') + ' ago';
    if (diffDays < 7) return diffDays + ' day' + (diffDays > 1 ? 's' : '') + ' ago';

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  // Get visitor ID
  getVisitorId: function() {
    var visitorId = localStorage.getItem(STORAGE_KEYS.visitorId);
    if (!visitorId) {
      try {
        visitorId = 'visitor_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem(STORAGE_KEYS.visitorId, visitorId);
      } catch (e) {
        console.error('Error creating visitor ID:', e);
        visitorId = 'temp_visitor_' + Date.now();
      }
    }
    return visitorId;
  },

  // Toggle like on quote
  toggleLike: function(quoteId) {
    var self = this;
    var visitorId = this.getVisitorId();
    var quoteRef = this.database.ref('quotes/' + quoteId);

    quoteRef.transaction(function(quote) {
      if (quote) {
        if (!quote.likedBy) {
          quote.likedBy = {};
        }

        if (quote.likedBy[visitorId]) {
          // Unlike
          quote.likes = (quote.likes || 1) - 1;
          delete quote.likedBy[visitorId];
          self.likedQuotes[quoteId] = false;
        } else {
          self.playSound('mySound');
          // Like
          quote.likes = (quote.likes || 0) + 1;
          quote.likedBy[visitorId] = true;
          self.likedQuotes[quoteId] = true;
        }
      }
      return quote;
    }, function(error, committed) {
      if (error) {
        console.error("Error updating like:", error);
        self.showToast("Error updating like: " + error.message, false);
      } else if (committed) {
        self.saveToLocalStorage(STORAGE_KEYS.likedQuotes, JSON.stringify(self.likedQuotes));
      }
    });
  },

  // Toggle like on reply
  toggleReplyLike: function(quoteId, replyId) {
    var self = this;
    var visitorId = this.getVisitorId();
    var replyRef = this.database.ref('quotes/' + quoteId + '/replies/' + replyId);

    replyRef.transaction(function(reply) {
      if (reply) {
        if (!reply.likedBy) {
          reply.likedBy = {};
        }

        if (reply.likedBy[visitorId]) {
          // Unlike
          reply.likes = (reply.likes || 1) - 1;
          delete reply.likedBy[visitorId];
        } else {
          self.playSound('replyLike');
          // Like
          reply.likes = (reply.likes || 0) + 1;
          reply.likedBy[visitorId] = true;
        }
      }
      return reply;
    }, function(error, committed) {
      if (error) {
        console.error("Error updating reply like:", error);
        self.showToast("Error updating reply like: " + error.message, false);
      }
    });
  },

  // Delete quote
  deleteQuote: function(quoteId) {
    var self = this;
    this.database.ref('quotes/' + quoteId).remove()
      .then(function() {
        self.showToast('Deleted!');
      })
      ['catch'](function(error) {
        console.error("Error deleting quote:", error);
        self.showToast('Error deleting quote: ' + error.message, false);
      });
  },

  // Delete reply
  deleteReply: function(quoteId, replyId) {
    var self = this;
    this.database.ref('quotes/' + quoteId + '/replies/' + replyId).remove()
      .then(function() {
        self.showToast('Reply deleted!');
        self.loadReplies(quoteId);
      })
      ['catch'](function(error) {
        console.error("Error deleting reply:", error);
        self.showToast('Error deleting reply: ' + error.message, false);
      });
  },

  // Toggle quote menu
  toggleQuoteMenu: function(quoteId, event) {
    event.stopPropagation();
    var menuContent = document.getElementById('menu-content-' + quoteId);
    var allMenus = document.querySelectorAll('.quote-menu-content');

    for (var i = 0; i < allMenus.length; i++) {
      var menu = allMenus[i];
      if (menu !== menuContent) {
        menu.style.display = 'none';
      }
    }

    menuContent.style.display = menuContent.style.display === 'block' ? 'none' : 'block';
  },

  // Start editing quote
  startEditQuote: function(quoteId, currentText) {
    var self = this;
    var quoteDiv = document.getElementById('quote-' + quoteId);
    var quoteTextElement = quoteDiv.querySelector('.quote-text');

    var editTextarea = document.createElement('textarea');
    editTextarea.value = currentText;
    editTextarea.className = 'edit-textarea';

    var saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.className = 'save-edit-btn';
    saveButton.onclick = function() { 
      self.saveEditQuote(quoteId, editTextarea.value); 
    };

    var cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'cancel-edit-btn';
    cancelButton.onclick = function() { 
      self.cancelEditQuote(quoteId, currentText); 
    };

    var editControls = document.createElement('div');
    editControls.className = 'edit-controls';
    editControls.appendChild(saveButton);
    editControls.appendChild(cancelButton);

    quoteTextElement.parentNode.replaceChild(editTextarea, quoteTextElement);
    quoteDiv.querySelector('.quote-actions-bottom').style.display = 'none';
    quoteDiv.appendChild(editControls);
  },

  // Save edited quote
  saveEditQuote: function(quoteId, newText) {
    var self = this;
    if (!newText.trim()) {
      this.showToast('Quote cannot be empty!', false);
      return;
    }

    if (this.hasProhibitedContent(newText)) {
      this.showToast('Your quote contains words that are not allowed. Please remove them.', false);
      return;
    }

    if (this.containsLinks(newText)) {
      this.showToast('Links are not allowed in quotes. Please remove them.', false);
      return;
    }

    this.database.ref('quotes/' + quoteId + '/text').set(newText.trim())
      .then(function() {
        self.showToast('Edited!');
        self.playSound('postSound');
        self.loadQuotes();
      })
      ['catch'](function(error) {
        console.error("Error updating quote:", error);
        self.showToast('Error updating quote: ' + error.message, false);
      });
  },

  // Cancel editing quote
  cancelEditQuote: function(quoteId, originalText) {
    var quoteDiv = document.getElementById('quote-' + quoteId);
    var editTextarea = quoteDiv.querySelector('.edit-textarea');
    var editControls = quoteDiv.querySelector('.edit-controls');

    var quoteTextElement = document.createElement('div');
    quoteTextElement.className = 'quote-text';
    quoteTextElement.textContent = '"' + originalText + '"';

    editTextarea.parentNode.replaceChild(quoteTextElement, editTextarea);
    editControls.parentNode.removeChild(editControls);
    quoteDiv.querySelector('.quote-actions-bottom').style.display = 'flex';
  },

  // Add new quote
  addQuote: function() {
    var self = this;
    var author = this.elements.quoteAuthor.value.trim();
    var text = this.elements.quoteText.value.trim();
    var bgColor = this.elements.quoteBgColor.value;

    if (!author) {
      this.showToast('Please enter your name!', false);
      this.elements.quoteAuthor.focus();
      return;
    }

    if (!text) {
      this.showToast('Please enter a quote!', false);
      this.elements.quoteText.focus();
      return;
    }

    if (this.hasProhibitedContent(text)) {
      this.showToast('Your quote contains words that are not allowed. Please remove them.', false);
      return;
    }

    if (this.containsLinks(text)) {
      this.showToast('Links are not allowed in quotes. Please remove them.', false);
      return;
    }

    if (author !== this.currentAuthor) {
      this.isNameTaken(author).then(function(taken) {
        if (taken) {
          self.showToast('This name is already taken. Please choose another one.', false);
          return;
        }
        self.saveAuthorAndAddQuote(author, text, bgColor);
      });
    } else {
      this.saveAuthorAndAddQuote(author, text, bgColor);
    }
  },

  // Save author and add quote
  saveAuthorAndAddQuote: function(author, text, bgColor) {
    var self = this;
    this.currentAuthor = author;
    this.saveToLocalStorage(STORAGE_KEYS.quoteAuthor, author);
    this.elements.quoteAuthor.readOnly = true;

    var newQuote = {
      text: text,
      author: author,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      likes: 0,
      bgColor: bgColor || '',
      likedBy: {}
    };

    this.elements.quoteText.value = '';

    this.database.ref('quotes').push(newQuote)
      .then(function() {
        self.clearLocalStorage(STORAGE_KEYS.draftQuoteText);
        self.playSound('postSound');
        self.showToast('Posted!');
      })
      ['catch'](function(error) {
        console.error("Error adding quote:", error);
        self.showToast('Error adding quote: ' + error.message, false);
      });
  },

  // ========== UTILITY FUNCTIONS ==========

  // Save to localStorage
  saveToLocalStorage: function(key, value) {
    try {
      if (value && value.trim() !== '') {
        localStorage.setItem(key, value);
      } else {
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.error('Error saving to localStorage:', e);
    }
  },

  // Load from localStorage
  loadFromLocalStorage: function(key) {
    try {
      return localStorage.getItem(key) || '';
    } catch (e) {
      console.error('Error reading from localStorage:', e);
      return '';
    }
  },

  // Clear localStorage key
  clearLocalStorage: function(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error('Error clearing localStorage:', e);
    }
  }
};

// Make app globally available
window.app = app;

// Auto-initialize if DOM is already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    app.init();
  });
} else {
  app.init();
}