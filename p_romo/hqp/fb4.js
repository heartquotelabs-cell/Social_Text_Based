// ========== SCRIPT LOADER WITH RETRY ==========
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
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      
      script.onload = () => {
        console.log(`✓ Loaded: ${url}`);
        loadedCount++;
        
        // Update loading progress if elements exist
        const loadingProgress = document.getElementById('loadingProgress');
        const loadingText = document.getElementById('loadingText');
        
        if (loadingProgress) {
          const percentage = Math.round((loadedCount / totalScripts) * 100);
          loadingProgress.style.width = percentage + '%';
        }
        
        if (loadingText) {
          loadingText.textContent = `Loading... (${loadedCount}/${totalScripts})`;
        }
        
        resolve();
      };
      
      script.onerror = () => {
        console.warn(`✗ Failed to load: ${url} (attempt ${attempt + 1}/${maxRetries + 1})`);
        
        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = 1000 * Math.pow(2, attempt);
          setTimeout(() => {
            loadScript(url, attempt + 1).then(resolve).catch(reject);
          }, delay);
        } else {
          reject(new Error(`Failed to load script after ${maxRetries + 1} attempts: ${url}`));
        }
      };
      
      document.body.appendChild(script);
    });
  }

  async function loadAllScripts() {
    try {
      for (let i = 0; i < scripts.length; i++) {
        await loadScript(scripts[i]);
      }
      console.log('All Firebase scripts loaded successfully');
      
      // Hide loading state if it exists
      const loadingState = document.getElementById('loadingState');
      if (loadingState) loadingState.style.display = 'none';
      
      // Initialize the app after scripts are loaded
      if (typeof app !== 'undefined' && app.init) {
        app.init();
      }
    } catch (error) {
      console.error('Failed to load Firebase scripts:', error);
      
      // Show error in UI
      const errorModal = document.getElementById('errorModal');
      const errorTitle = document.getElementById('errorTitle');
      const errorMessage = document.getElementById('errorMessage');
      
      if (errorModal && errorTitle && errorMessage) {
        errorTitle.textContent = 'Connection Failed';
        errorMessage.textContent = 'Unable to load required resources. Please check your connection.';
        errorModal.classList.add('active');
        
        // Setup retry button
        const retryBtn = document.getElementById('manualRetryBtn');
        if (retryBtn) {
          retryBtn.onclick = () => {
            errorModal.classList.remove('active');
            loadFirebaseScripts(); // Retry loading
          };
        }
        
        // Auto-retry countdown
        let countdown = 10;
        const countdownEl = document.getElementById('autoRetryCountdown');
        const interval = setInterval(() => {
          countdown--;
          if (countdownEl) countdownEl.textContent = countdown;
          
          if (countdown <= 0) {
            clearInterval(interval);
            errorModal.classList.remove('active');
            loadFirebaseScripts(); // Auto retry
          }
        }, 1000);
      }
    }
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
const STORAGE_KEYS = {
  likedQuotes: 'likedQuotes',
  draftQuoteText: 'draftQuoteText',
  draftReplyPrefix: 'draftReply_',
  draftQuoteBgColor: 'draftQuoteBgColor',
  quoteAuthor: 'quoteAuthor',
  visitorId: 'visitorId'
};

// Prohibited words list
const prohibitedWords = ['spam', 'badword', 'inappropriate'];

// Main Application Object
const app = {
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
  init() {
    try {
      // Initialize Firebase
      const firebaseApp = firebase.initializeApp(firebaseConfig);
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
      this.showToast('Failed to initialize application. Please refresh.', false);
    }
  },

  // Cache DOM elements
  cacheElements() {
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
      toastMessage: document.getElementById('toastMessage')
    };
  },

  // Load saved data from localStorage
  loadSavedData() {
    try {
      // Load liked quotes
      this.likedQuotes = JSON.parse(localStorage.getItem(STORAGE_KEYS.likedQuotes)) || {};
      
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
  setupEventListeners() {
    // Quote text input
    this.elements.quoteText.addEventListener('input', () => {
      this.saveToLocalStorage(STORAGE_KEYS.draftQuoteText, this.elements.quoteText.value);
      this.updateTypingStatus();
    });

    // Background color input
    this.elements.quoteBgColor.addEventListener('input', () => {
      this.elements.quoteBgColor.style.backgroundColor = this.elements.quoteBgColor.value;
      this.saveToLocalStorage(STORAGE_KEYS.draftQuoteBgColor, this.elements.quoteBgColor.value);
    });

    // Reply text input
    if (this.elements.replyText) {
      this.elements.replyText.addEventListener('input', () => {
        if (this.currentQuoteIdForReply) {
          this.updateTypingStatus(this.currentQuoteIdForReply);
        }
      });
    }

    // Setup typing listeners
    this.setupTypingListeners();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      if (this.isTyping && this.myTypingRef) {
        this.myTypingRef.set({
          author: this.currentAuthor,
          isTyping: false
        });
      }
    });
  },

  // Setup typing indicator listeners
  setupTypingListeners() {
    this.typingRef = this.database.ref('typing');
    this.myTypingRef = this.typingRef.child(this.getVisitorId());

    this.typingRef.on('child_added', (snapshot) => {
      if (snapshot.key !== this.getVisitorId() && snapshot.val().isTyping) {
        this.showTypingIndicator(snapshot.val());
      }
    });

    this.typingRef.on('child_changed', (snapshot) => {
      if (snapshot.key !== this.getVisitorId()) {
        const typingData = snapshot.val();
        if (typingData.isTyping) {
          this.showTypingIndicator(typingData);
          this.playSound('typingSound');
        } else {
          this.hideTypingIndicator();
        }
      }
    });
  },

  // Update typing status
  updateTypingStatus(quoteId = null) {
    if (!this.currentAuthor) return;

    const isTypingNow = quoteId 
      ? document.getElementById(`reply-text-${quoteId}`)?.value.trim() !== ''
      : this.elements.quoteText.value.trim() !== '';

    if (isTypingNow !== this.isTyping) {
      this.isTyping = isTypingNow;
      this.myTypingRef.set({
        author: this.currentAuthor,
        isTyping: isTypingNow,
        type: quoteId ? 'reply' : 'quote',
        quoteId: quoteId || null
      }).catch(error => {
        console.error("Error updating typing status:", error);
      });
    }

    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      if (this.isTyping) {
        this.isTyping = false;
        this.myTypingRef.set({
          author: this.currentAuthor,
          isTyping: false,
          type: null,
          quoteId: null
        }).catch(error => {
          console.error("Error resetting typing status:", error);
        });
      }
    }, 2000);
  },

  // Show typing indicator
  showTypingIndicator(typingData) {
    if (typingData.author === this.currentAuthor) return;

    const actionText = typingData.type === 'reply' 
      ? 'is Replying...' 
      : 'is Typing...';

    this.elements.typingIndicator.innerHTML = `
      <span class="typing-dots">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </span>
      <span class="typing-text">${typingData.author} ${actionText}</span>
    `;

    this.elements.typingIndicator.style.display = 'flex';
    this.elements.typingIndicator.style.opacity = '1';

    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.elements.typingIndicator.style.opacity = '0';
      setTimeout(() => {
        this.elements.typingIndicator.style.display = 'none';
      }, 500);
    }, 5000);
  },

  // Hide typing indicator
  hideTypingIndicator() {
    this.elements.typingIndicator.style.opacity = '0';
    setTimeout(() => {
      this.elements.typingIndicator.style.display = 'none';
    }, 300);
  },

  // ========== CORE FUNCTIONS ==========

  // Show toast notification
  showToast(message, isSuccess = true) {
    try {
      this.elements.toast.className = isSuccess ? 'toast show' : 'toast error show';
      this.elements.toastMessage.textContent = message;
      setTimeout(() => { 
        this.elements.toast.className = 'toast'; 
      }, 1500);
    } catch (error) {
      console.error('Error showing toast:', error);
    }
  },

  // Play sound
  playSound(soundId) {
    try {
      const sound = document.getElementById(soundId);
      if (sound) {
        sound.currentTime = 0;
        sound.play().catch(e => console.log("Could not play sound:", e));
      }
    } catch (error) {
      console.error("Error playing sound:", error);
    }
  },

  // Get initials from name
  getInitials(name) {
    if (!name) return 'U';
    return name.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2);
  },

  // Toggle reply panel
  toggleReplyPanel(quoteId = null) {
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
  submitReply() {
    if (!this.currentQuoteIdForReply) return;

    const replyText = this.elements.replyText.value.trim();
    const author = this.currentAuthor || 'Anonymous';

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

    const newReply = {
      text: replyText,
      author: author,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      likes: 0,
      likedBy: {}
    };

    this.elements.replyText.value = '';

    this.database.ref(`quotes/${this.currentQuoteIdForReply}/replies`).push(newReply)
      .then(() => {
        this.playSound('replySound');
        this.showToast('You Replied!');
        this.loadReplies(this.currentQuoteIdForReply);
      })
      .catch(error => {
        console.error("Error adding reply:", error);
        this.showToast('Error adding reply: ' + error.message, false);
      });
  },

  // Load replies for a quote
  loadReplies(quoteId) {
    const repliesContainer = this.elements.replyPanelContent;
    repliesContainer.innerHTML = '<div class="loading-replies">Loading replies...</div>';

    this.database.ref(`quotes/${quoteId}/replies`).on('value', (snapshot) => {
      repliesContainer.innerHTML = '';

      if (!snapshot.exists()) {
        repliesContainer.innerHTML = '<div class="no-replies">No replies yet</div>';
        return;
      }

      const repliesArray = [];
      snapshot.forEach((childSnapshot) => {
        repliesArray.push({
          id: childSnapshot.key,
          ...childSnapshot.val()
        });
      });

      repliesArray.sort((a, b) => a.createdAt - b.createdAt);

      repliesArray.forEach((reply) => {
        const replyDiv = document.createElement('div');
        replyDiv.className = 'reply-card';

        const likes = reply.likes || 0;
        const likedBy = reply.likedBy || {};
        const isLiked = likedBy[this.getVisitorId()];
        const isAuthor = this.currentAuthor && reply.author === this.currentAuthor;

        replyDiv.innerHTML = `
          <div class="reply-header">
            <div class="reply-avatar">${this.getInitials(reply.author)}</div>
            <div class="reply-author">${reply.author}</div>
          </div>
          <div class="reply-text">${reply.text}</div>
          <div class="reply-meta">
            <small>${this.formatDateTimeWithGMT(reply.createdAt)}</small>
            <div class="reply-actions">
              <button class="btn-like-reply ${isLiked ? 'liked' : ''}" 
                      onclick="app.toggleReplyLike('${quoteId}', '${reply.id}')">
                <i class="fas fa-thumbs-up"></i>
                <span class="like-count">${likes}</span>
              </button>
              ${isAuthor ? `
              <button class="btn-delete-reply" 
                      onclick="app.deleteReply('${quoteId}', '${reply.id}')">
                <i class="fas fa-trash"></i>
              </button>` : ''}
            </div>
          </div>
        `;
        repliesContainer.appendChild(replyDiv);
      });
    }, (error) => {
      repliesContainer.innerHTML = `<div class="error-replies">Error loading replies: ${error.message}</div>`;
    });
  },

  // Load quotes
  loadQuotes() {
    const quotesContainer = this.elements.quotesContainer;
    
    // Clear shimmer loading
    quotesContainer.innerHTML = '';

    this.database.ref('quotes').on('value', (snapshot) => {
      quotesContainer.innerHTML = '';
      
      if (!snapshot.exists()) {
        quotesContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-quote-right"></i>
          <h3>No quotes yet</h3>
          <p>Be the first to share a quote!</p>
        </div>`;
        return;
      }

      const quotesArray = [];
      snapshot.forEach((childSnapshot) => {
        quotesArray.push({
          id: childSnapshot.key,
          ...childSnapshot.val()
        });
      });

      quotesArray.sort((a, b) => b.createdAt - a.createdAt);

      quotesArray.forEach((quote) => {
        const likedBy = quote.likedBy || {};
        const isLiked = this.likedQuotes[quote.id] || likedBy[this.getVisitorId()];
        if (likedBy[this.getVisitorId()]) {
          this.likedQuotes[quote.id] = true;
          this.saveToLocalStorage(STORAGE_KEYS.likedQuotes, JSON.stringify(this.likedQuotes));
        }

        const quoteDiv = document.createElement('div');
        quoteDiv.className = 'quote-card';
        quoteDiv.id = `quote-${quote.id}`;

        if (quote.bgColor) {
          quoteDiv.style.backgroundColor = quote.bgColor;
        }

        const sanitizedText = this.sanitizeText(quote.text);
        const replyCount = quote.replies ? Object.keys(quote.replies).length : 0;

        const quoteMenu = this.currentAuthor && quote.author === this.currentAuthor 
          ? `<div class="quote-menu">
              <button class="btn-menu" onclick="app.toggleQuoteMenu('${quote.id}', event)">
                <i class="fas fa-ellipsis-vertical"></i>
              </button>
              <div id="menu-content-${quote.id}" class="quote-menu-content">
                <button onclick="app.startEditQuote('${quote.id}', '${quote.text.replace(/'/g, "\\'")}')">
                  <i class="fas fa-edit"></i> Edit
                </button>
                <button class="delQuote" onclick="app.deleteQuote('${quote.id}')">
                  <i class="fas fa-trash"></i> Delete
                </button>
              </div>
            </div>`
          : '';

        quoteDiv.innerHTML = `
          ${quoteMenu}
          <div class="quote-header">
            <div class="user-avatar">${this.getInitials(quote.author)}</div>
            <div class="user-info">
              <div class="quote-author">${quote.author}</div>
              <div class="timestamp">${this.formatDateTimeWithGMT(quote.createdAt)}</div>
            </div>
          </div>
          
          <div class="quote-text" style="color: ${this.getTextColor(quote.bgColor)};">"${sanitizedText}"</div>
          
          <div class="quote-actions-bottom">
            <div class="action-buttons">
              <button class="action-btn ${isLiked ? 'liked' : ''}" onclick="app.toggleLike('${quote.id}')">
                <i class="${isLiked ? 'fas' : 'far'} fa-thumbs-up"></i> 
                <span class="like-count">${quote.likes || 0}</span>
              </button>
              
              <button class="btn-toggle-replies" onclick="app.toggleReplyPanel('${quote.id}')">
                <i class="fas fa-reply"></i> ${replyCount} ${replyCount === 1 ? 'Reply' : 'Replies'}
              </button>
              
              <button class="action-btn-copy" onclick="app.copyToClipboard('${quote.text.replace(/'/g, "\\'")} By ${quote.author.replace(/'/g, "\\'")}')">
                <i class="far fa-copy"></i> Copy
              </button>
            </div>
          </div>
        `;

        quotesContainer.appendChild(quoteDiv);
      });
    }, (error) => {
      quotesContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Error loading quotes</h3>
        <p>${error.message}</p>
      </div>`;
    });
  },

  // Check if name is taken
  async isNameTaken(name) {
    const snapshot = await this.database.ref('quotes').orderByChild('author').equalTo(name).once('value');
    return snapshot.exists();
  },

  // Check for prohibited content
  hasProhibitedContent(text) {
    const lowerText = text.toLowerCase();
    return prohibitedWords.some(word => lowerText.includes(word));
  },

  // Check for links
  containsLinks(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return urlRegex.test(text);
  },

  // Sanitize text
  sanitizeText(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, match => {
      return `<span class="non-clickable-link">${match}</span>`;
    });
  },

  // Copy to clipboard
  copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
      const successful = document.execCommand('copy');
      this.playSound('copySound');
      this.showToast(successful ? 'Copied!' : 'Failed to copy');
    } catch (err) {
      this.showToast('Failed to copy: ' + err, false);
    }
    
    document.body.removeChild(textarea);
  },

  // Get text color based on background
  getTextColor(bgColor) {
    if (!bgColor) return '#1e1e1e';
    const color = bgColor.substring(1);
    const rgb = parseInt(color, 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luma < 120 ? '#ffffff' : '#1e1e1e';
  },

  // Format date time
  formatDateTimeWithGMT(timestamp) {
    if (!timestamp) return 'Unknown time';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  // Get visitor ID
  getVisitorId() {
    let visitorId = localStorage.getItem(STORAGE_KEYS.visitorId);
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
  toggleLike(quoteId) {
    const visitorId = this.getVisitorId();
    const quoteRef = this.database.ref(`quotes/${quoteId}`);

        quoteRef.transaction((quote) => {
      if (quote) {
        if (!quote.likedBy) {
          quote.likedBy = {};
        }

        if (quote.likedBy[visitorId]) {
          // Unlike
          quote.likes = (quote.likes || 1) - 1;
          delete quote.likedBy[visitorId];
          this.likedQuotes[quoteId] = false;
        } else {
          this.playSound('mySound');
          // Like
          quote.likes = (quote.likes || 0) + 1;
          quote.likedBy[visitorId] = true;
          this.likedQuotes[quoteId] = true;
        }
      }
      return quote;
    }, (error, committed) => {
      if (error) {
        console.error("Error updating like:", error);
        this.showToast("Error updating like: " + error.message, false);
      } else if (committed) {
        this.saveToLocalStorage(STORAGE_KEYS.likedQuotes, JSON.stringify(this.likedQuotes));
      }
    });
  },

  // Toggle like on reply
  toggleReplyLike(quoteId, replyId) {
    const visitorId = this.getVisitorId();
    const replyRef = this.database.ref(`quotes/${quoteId}/replies/${replyId}`);

    replyRef.transaction((reply) => {
      if (reply) {
        if (!reply.likedBy) {
          reply.likedBy = {};
        }

        if (reply.likedBy[visitorId]) {
          // Unlike
          reply.likes = (reply.likes || 1) - 1;
          delete reply.likedBy[visitorId];
        } else {
          this.playSound('replyLike');
          // Like
          reply.likes = (reply.likes || 0) + 1;
          reply.likedBy[visitorId] = true;
        }
      }
      return reply;
    }, (error, committed) => {
      if (error) {
        console.error("Error updating reply like:", error);
        this.showToast("Error updating reply like: " + error.message, false);
      }
    });
  },

  // Delete quote
  deleteQuote(quoteId) {
    this.database.ref(`quotes/${quoteId}`).remove()
      .then(() => {
        this.showToast('Deleted!');
      })
      .catch(error => {
        console.error("Error deleting quote:", error);
        this.showToast('Error deleting quote: ' + error.message, false);
      });
  },

  // Delete reply
  deleteReply(quoteId, replyId) {
    this.database.ref(`quotes/${quoteId}/replies/${replyId}`).remove()
      .then(() => {
        this.showToast('Reply deleted!');
        this.loadReplies(quoteId);
      })
      .catch(error => {
        console.error("Error deleting reply:", error);
        this.showToast('Error deleting reply: ' + error.message, false);
      });
  },

  // Toggle quote menu
  toggleQuoteMenu(quoteId, event) {
    event.stopPropagation();
    const menuContent = document.getElementById(`menu-content-${quoteId}`);
    const allMenus = document.querySelectorAll('.quote-menu-content');

    allMenus.forEach(menu => {
      if (menu !== menuContent) {
        menu.style.display = 'none';
      }
    });

    menuContent.style.display = menuContent.style.display === 'block' ? 'none' : 'block';
  },

  // Start editing quote
  startEditQuote(quoteId, currentText) {
    const quoteDiv = document.getElementById(`quote-${quoteId}`);
    const quoteTextElement = quoteDiv.querySelector('.quote-text');

    const editTextarea = document.createElement('textarea');
    editTextarea.value = currentText;
    editTextarea.className = 'edit-textarea';

    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.className = 'save-edit-btn';
    saveButton.onclick = () => this.saveEditQuote(quoteId, editTextarea.value);

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'cancel-edit-btn';
    cancelButton.onclick = () => this.cancelEditQuote(quoteId, currentText);

    const editControls = document.createElement('div');
    editControls.className = 'edit-controls';
    editControls.appendChild(saveButton);
    editControls.appendChild(cancelButton);

    quoteTextElement.replaceWith(editTextarea);
    quoteDiv.querySelector('.quote-actions-bottom').style.display = 'none';
    quoteDiv.appendChild(editControls);
  },

  // Save edited quote
  saveEditQuote(quoteId, newText) {
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

    this.database.ref(`quotes/${quoteId}/text`).set(newText.trim())
      .then(() => {
        this.showToast('Edited!');
        this.playSound('postSound');
        this.loadQuotes();
      })
      .catch(error => {
        console.error("Error updating quote:", error);
        this.showToast('Error updating quote: ' + error.message, false);
      });
  },

  // Cancel editing quote
  cancelEditQuote(quoteId, originalText) {
    const quoteDiv = document.getElementById(`quote-${quoteId}`);
    const editTextarea = quoteDiv.querySelector('.edit-textarea');
    const editControls = quoteDiv.querySelector('.edit-controls');

    const quoteTextElement = document.createElement('div');
    quoteTextElement.className = 'quote-text';
    quoteTextElement.textContent = `"${originalText}"`;

    editTextarea.replaceWith(quoteTextElement);
    editControls.remove();
    quoteDiv.querySelector('.quote-actions-bottom').style.display = 'flex';
  },

  // Add new quote
  addQuote() {
    const author = this.elements.quoteAuthor.value.trim();
    const text = this.elements.quoteText.value.trim();
    const bgColor = this.elements.quoteBgColor.value;

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
      this.isNameTaken(author).then(taken => {
        if (taken) {
          this.showToast('This name is already taken. Please choose another one.', false);
          return;
        }
        this.saveAuthorAndAddQuote(author, text, bgColor);
      });
    } else {
      this.saveAuthorAndAddQuote(author, text, bgColor);
    }
  },

  // Save author and add quote
  saveAuthorAndAddQuote(author, text, bgColor) {
    this.currentAuthor = author;
    this.saveToLocalStorage(STORAGE_KEYS.quoteAuthor, author);
    this.elements.quoteAuthor.readOnly = true;

    const newQuote = {
      text: text,
      author: author,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      likes: 0,
      bgColor: bgColor || '',
      likedBy: {}
    };

    this.elements.quoteText.value = '';

    this.database.ref('quotes').push(newQuote)
      .then(() => {
        this.clearLocalStorage(STORAGE_KEYS.draftQuoteText);
        this.playSound('postSound');
        this.showToast('Posted!');
      })
      .catch(error => {
        console.error("Error adding quote:", error);
        this.showToast('Error adding quote: ' + error.message, false);
      });
  },

  // ========== UTILITY FUNCTIONS ==========

  // Save to localStorage
  saveToLocalStorage(key, value) {
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
  loadFromLocalStorage(key) {
    try {
      return localStorage.getItem(key) || '';
    } catch (e) {
      console.error('Error reading from localStorage:', e);
      return '';
    }
  },

  // Clear localStorage key
  clearLocalStorage(key) {
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
  document.addEventListener('DOMContentLoaded', () => {
    app.init();
  });
} else {
  app.init();
}