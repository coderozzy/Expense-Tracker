

class ExpenseTracker {
    constructor() {
        this.db = null;
        this.isOnline = navigator.onLine;
        this.deferredPrompt = null;
        this.currentLocation = null;
        
        this.init();
    }

    async init() {
        try {
            await this.initDatabase();
            await this.registerServiceWorker();
            this.setupEventListeners();
            this.setupConnectionMonitoring();
            this.setupInstallPrompt();
            this.loadExpenses();
            this.updateDashboard();
            
            console.log('Expense Tracker initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Expense Tracker:', error);
            this.showMessage('Failed to initialize application', 'error');
        }
    }

    async initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('ExpenseTrackerDB', 1);
            
            request.onerror = () => {
                reject(new Error('Failed to open database'));
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains('expenses')) {
                    const expenseStore = db.createObjectStore('expenses', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });

                    expenseStore.createIndex('date', 'date', { unique: false });
                    expenseStore.createIndex('category', 'category', { unique: false });
                    expenseStore.createIndex('amount', 'amount', { unique: false });
                    expenseStore.createIndex('offline', 'offline', { unique: false });
                }

                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                console.log('Registering Service Worker...');
                const registration = await navigator.serviceWorker.register('/js/service-worker.js');
                console.log('Service Worker registered successfully:', registration);

                if (navigator.serviceWorker.controller) {
                    console.log('Service Worker is controlling the page');
                } else {
                    console.log('Service Worker is not controlling the page yet');
                }

                registration.addEventListener('updatefound', () => {
                    console.log('Service Worker update found');
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        console.log('Service Worker state changed:', newWorker.state);
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('New Service Worker available, forcing update');
                            newWorker.postMessage({ action: 'skipWaiting' });
                            window.location.reload();
                        }
                    });
                });

                navigator.serviceWorker.addEventListener('message', (event) => {
                    console.log('Message from Service Worker:', event.data);
                });
                
            } catch (error) {
                console.error('Service Worker registration failed:', error);
                this.showMessage('Service Worker registration failed. Offline features may not work.', 'error');
            }
        } else {
            console.log('Service Worker not supported in this browser');
            this.showMessage('Service Worker not supported. Offline features will not work.', 'error');
        }
    }

    setupEventListeners() {
        
        const dashboardBtn = document.getElementById('dashboardBtn');
        const addExpenseBtn = document.getElementById('addExpenseBtn');
        const historyBtn = document.getElementById('historyBtn');

        [dashboardBtn, addExpenseBtn, historyBtn].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const viewName = btn.id.replace('Btn', '');
                    this.showView(viewName);
                });
                
                btn.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const viewName = btn.id.replace('Btn', '');
                    this.showView(viewName);
                });
            }
        });

        document.getElementById('expenseForm').addEventListener('submit', (e) => this.handleExpenseSubmit(e));

        const locationBtn = document.getElementById('getLocationBtn');
        if (locationBtn) {
            locationBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.getCurrentLocation();
            });
            locationBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.getCurrentLocation();
            });
        }

        document.getElementById('receiptPhoto').addEventListener('change', (e) => this.handlePhotoUpload(e));

        document.getElementById('categoryFilter').addEventListener('change', () => this.filterExpenses());
        document.getElementById('dateFilter').addEventListener('change', () => this.filterExpenses());

        const installBtn = document.getElementById('installBtn');
        const dismissBtn = document.getElementById('dismissInstall');
        const simpleInstallBtn = document.getElementById('simpleInstallBtn');
        
        [installBtn, dismissBtn, simpleInstallBtn].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const action = btn.id;
                    switch(action) {
                        case 'installBtn': this.installApp(); break;
                        case 'dismissInstall': this.dismissInstallPrompt(); break;
                        case 'simpleInstallBtn': this.simpleInstall(); break;
                    }
                });
                
                btn.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const action = btn.id;
                    switch(action) {
                        case 'installBtn': this.installApp(); break;
                        case 'dismissInstall': this.dismissInstallPrompt(); break;
                        case 'simpleInstallBtn': this.simpleInstall(); break;
                    }
                });
            }
        });

        document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
    }

    setupConnectionMonitoring() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.updateConnectionStatus();
            this.syncOfflineData();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateConnectionStatus();
        });
        
        this.updateConnectionStatus();
    }

    setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallPrompt();
        });
        
        window.addEventListener('appinstalled', () => {
            console.log('PWA was installed');
            this.hideInstallPrompt();
        });
    }

    showView(viewName) {
        console.log('Switching to view:', viewName, 'Online:', this.isOnline);
        
        try {
            
            document.querySelectorAll('.view').forEach(view => {
                view.classList.remove('active');
            });

            document.querySelectorAll('.nav-btn').forEach(btn => {
                btn.classList.remove('active');
            });

            const targetView = document.getElementById(`${viewName}View`);
            const targetBtn = document.getElementById(`${viewName}Btn`);
            
            if (targetView && targetBtn) {
                targetView.classList.add('active');
                targetBtn.classList.add('active');

                setTimeout(() => {
                    
                    if (viewName === 'dashboard') {
                        this.updateDashboard();
                    } else if (viewName === 'history') {
                        this.loadExpenses();
                    }
                    
                    console.log('Successfully switched to view:', viewName);

                    this.updateConnectionStatus();
                }, 50);
            } else {
                console.error('View or button not found:', viewName);
                this.showMessage(`View ${viewName} not found`, 'error');
            }
        } catch (error) {
            console.error('Error switching view:', error);
            this.showMessage('Error switching view', 'error');
        }
    }

    async handleExpenseSubmit(event) {
        event.preventDefault();

        const amount = parseFloat(document.getElementById('expenseAmount').value);
        const description = document.getElementById('expenseDescription').value.trim();
        const category = document.getElementById('expenseCategory').value;
        const date = document.getElementById('expenseDate').value;
        const location = document.getElementById('expenseLocation').value.trim() || this.currentLocation;

        if (!amount || isNaN(amount) || amount <= 0) {
            this.showMessage('Please enter a valid amount', 'error');
            return;
        }
        
        if (!description) {
            this.showMessage('Please enter a description', 'error');
            return;
        }
        
        if (!category) {
            this.showMessage('Please select a category', 'error');
            return;
        }
        
        if (!date) {
            this.showMessage('Please select a date', 'error');
            return;
        }
        
        const expense = {
            amount: amount,
            description: description,
            category: category,
            date: date,
            location: location,
            photo: await this.getPhotoData(),
            timestamp: new Date().toISOString(),
            offline: !this.isOnline
        };
        
        try {
            await this.saveExpense(expense);
            this.showMessage('Expense added successfully!', 'success');

            await this.loadExpenses();
            this.updateDashboard();
            
            event.target.reset();
            document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
            document.getElementById('photoPreview').innerHTML = '';
            this.currentLocation = null;

            this.showView('dashboard');
            
        } catch (error) {
            console.error('Failed to save expense:', error);
            this.showMessage('Failed to save expense. Please try again.', 'error');
        }
    }

    async saveExpense(expense) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['expenses'], 'readwrite');
            const store = transaction.objectStore('expenses');
            const request = store.add(expense);
            
            request.onsuccess = () => {
                console.log('Expense saved successfully');
                resolve();
            };
            
            request.onerror = () => {
                reject(new Error('Failed to save expense'));
            };
        });
    }

    async loadExpenses() {
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['expenses'], 'readonly');
            const store = transaction.objectStore('expenses');
            const request = store.getAll();
            
            request.onsuccess = () => {
                
                this.expenses = request.result
                    .filter(expense => {
                        
                        return expense && 
                               expense.description && 
                               expense.amount && 
                               expense.category && 
                               expense.date &&
                               !isNaN(parseFloat(expense.amount));
                    })
                    .sort((a, b) => {
                        
                        const dateA = new Date(a.date);
                        const dateB = new Date(b.date);
                        return dateB - dateA;
                    });
                
                this.displayExpenses();
                resolve();
            };
            
            request.onerror = () => {
                console.error('Failed to load expenses');
                this.expenses = [];
                this.displayExpenses();
                resolve();
            };
        });
    }

    displayExpenses() {
        const currentView = document.querySelector('.view.active').id;
        
        if (currentView === 'dashboardView') {
            this.displayRecentExpenses();
        } else if (currentView === 'historyView') {
            this.displayAllExpenses();
        }
    }

    displayRecentExpenses() {
        const container = document.getElementById('recentExpensesList');

        if (!this.expenses || this.expenses.length === 0) {
            container.innerHTML = '<p class="no-data">No expenses yet. Add your first expense!</p>';
            return;
        }
        
        const recentExpenses = this.expenses.slice(0, 5);
        container.innerHTML = recentExpenses.map(expense => this.createExpenseHTML(expense)).join('');
    }

    displayAllExpenses() {
        const container = document.getElementById('expensesHistoryList');
        const filteredExpenses = this.getFilteredExpenses();
        
        if (filteredExpenses.length === 0) {
            container.innerHTML = '<p class="no-data">No expenses found.</p>';
            return;
        }
        
        container.innerHTML = filteredExpenses.map(expense => this.createExpenseHTML(expense)).join('');
    }

    getFilteredExpenses() {
        let filtered = [...this.expenses];
        
        const categoryFilter = document.getElementById('categoryFilter').value;
        const dateFilter = document.getElementById('dateFilter').value;
        
        if (categoryFilter) {
            filtered = filtered.filter(expense => expense.category === categoryFilter);
        }
        
        if (dateFilter) {
            filtered = filtered.filter(expense => expense.date === dateFilter);
        }
        
        return filtered;
    }

    createExpenseHTML(expense) {
        const categoryEmojis = {
            food: '🍔',
            transport: '🚗',
            shopping: '🛍️',
            entertainment: '🎬',
            bills: '💡',
            health: '🏥',
            other: '📦'
        };
        
        const categoryNames = {
            food: 'Food & Dining',
            transport: 'Transportation',
            shopping: 'Shopping',
            entertainment: 'Entertainment',
            bills: 'Bills & Utilities',
            health: 'Healthcare',
            other: 'Other'
        };

        let displayDate;
        if (expense.date) {
            try {
                
                if (typeof expense.date === 'number') {
                    displayDate = new Date(expense.date).toLocaleDateString();
                } else {
                    
                    displayDate = new Date(expense.date).toLocaleDateString();
                }
            } catch (error) {
                displayDate = 'Invalid Date';
            }
        } else {
            displayDate = 'No Date';
        }

        const amount = parseFloat(expense.amount);
        const displayAmount = isNaN(amount) ? '0.00' : amount.toFixed(2);

        const categoryEmoji = categoryEmojis[expense.category] || '📦';
        const categoryName = categoryNames[expense.category] || 'Other';

        const locationDisplay = expense.location && expense.location !== 'null' && expense.location !== 'undefined' 
            ? `<span>📍 ${expense.location}</span>` 
            : '';

        const photoDisplay = expense.photo 
            ? `<div class="expense-photo">
                 <img src="${expense.photo}" alt="Receipt photo" class="receipt-thumbnail" onclick="showPhotoModal('${expense.photo}')">
               </div>` 
            : '';
        
        return `
            <div class="expense-item">
                <div class="expense-info">
                    <div class="expense-description">${expense.description || 'No Description'}</div>
                    <div class="expense-meta">
                        <span class="expense-category">${categoryEmoji} ${categoryName}</span>
                        <span>${displayDate}</span>
                        ${locationDisplay}
                        ${expense.offline ? '<span>📱 Offline</span>' : ''}
                    </div>
                    ${photoDisplay}
                </div>
                <div class="expense-amount">$${displayAmount}</div>
            </div>
        `;
    }

    updateDashboard() {
        if (!this.expenses || this.expenses.length === 0) {
            document.getElementById('totalExpenses').textContent = '$0.00';
            document.getElementById('monthlyExpenses').textContent = '$0.00';
            document.getElementById('categoryCount').textContent = '0';
            return;
        }
        
        const totalExpenses = this.expenses.reduce((sum, expense) => {
            const amount = parseFloat(expense.amount);
            return sum + (isNaN(amount) ? 0 : amount);
        }, 0);
        
        const currentMonth = new Date().toISOString().slice(0, 7);
        const monthlyExpenses = this.expenses
            .filter(expense => expense.date && expense.date.startsWith(currentMonth))
            .reduce((sum, expense) => {
                const amount = parseFloat(expense.amount);
                return sum + (isNaN(amount) ? 0 : amount);
            }, 0);
        
        const categories = new Set(this.expenses
            .filter(expense => expense.category)
            .map(expense => expense.category));
        
        document.getElementById('totalExpenses').textContent = `$${totalExpenses.toFixed(2)}`;
        document.getElementById('monthlyExpenses').textContent = `$${monthlyExpenses.toFixed(2)}`;
        document.getElementById('categoryCount').textContent = categories.size;
    }

    filterExpenses() {
        this.displayAllExpenses();
    }

    async getCurrentLocation() {
        if (!navigator.geolocation) {
            this.showMessage('Geolocation is not supported by this browser.', 'error');
            return;
        }
        
        const locationBtn = document.getElementById('getLocationBtn');
        const locationInput = document.getElementById('expenseLocation');
        
        locationBtn.textContent = '⏳';
        locationBtn.disabled = true;
        
        try {
            const position = await this.getCurrentPosition();
            const { latitude, longitude } = position.coords;

            const location = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            this.currentLocation = location;
            locationInput.value = location;
            
            this.showMessage('Location obtained successfully!', 'success');
            
        } catch (error) {
            console.error('Geolocation error:', error);
            this.showMessage('Failed to get location. Please check permissions.', 'error');
        } finally {
            locationBtn.textContent = '📍';
            locationBtn.disabled = false;
        }
    }

    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000 
            });
        });
    }

    handlePhotoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('photoPreview');
            preview.innerHTML = `
                <img src="${e.target.result}" alt="Receipt preview" style="max-width: 200px; max-height: 200px; border-radius: 8px;">
                <button type="button" onclick="this.parentElement.innerHTML=''" style="margin-top: 0.5rem; padding: 0.25rem 0.5rem; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">Remove</button>
            `;
        };
        reader.readAsDataURL(file);
    }

    async getPhotoData() {
        const fileInput = document.getElementById('receiptPhoto');
        if (!fileInput.files[0]) return null;
        
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(fileInput.files[0]);
        });
    }

    updateConnectionStatus() {
        const statusElement = document.getElementById('connectionStatus');
        const textElement = document.getElementById('connectionText');

        this.isOnline = navigator.onLine;
        
        if (this.isOnline) {
            statusElement.className = 'connection-status online';
            textElement.textContent = 'You\'re online';
        } else {
            statusElement.className = 'connection-status offline';
            textElement.textContent = 'You\'re offline - data will sync when connected';
        }
        
        console.log('Connection status updated:', this.isOnline ? 'Online' : 'Offline');
    }

    async syncOfflineData() {
        if (!this.isOnline) return;
        
        try {
            
            console.log('Syncing offline data...');

            const transaction = this.db.transaction(['expenses'], 'readwrite');
            const store = transaction.objectStore('expenses');
            const request = store.getAll();
            
            request.onsuccess = () => {
                const expenses = request.result;
                const offlineExpenses = expenses.filter(expense => expense.offline);
                
                if (offlineExpenses.length > 0) {
                    this.showMessage(`${offlineExpenses.length} offline expenses synced!`, 'success');

                    offlineExpenses.forEach(expense => {
                        expense.offline = false;
                        store.put(expense);
                    });
                }
            };
            
        } catch (error) {
            console.error('Failed to sync offline data:', error);
        }
    }

    showInstallPrompt() {
        const prompt = document.getElementById('installPrompt');
        prompt.classList.add('show');
    }

    hideInstallPrompt() {
        const prompt = document.getElementById('installPrompt');
        prompt.classList.remove('show');
    }

    dismissInstallPrompt() {
        this.hideInstallPrompt();
        this.deferredPrompt = null;
    }

    async installApp() {
        if (!this.deferredPrompt) return;
        
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        
        console.log(`User response to the install prompt: ${outcome}`);
        this.deferredPrompt = null;
        this.hideInstallPrompt();
    }

    simpleInstall() {
        
        if (this.deferredPrompt) {
            this.installApp();
            return;
        }

        const userAgent = navigator.userAgent.toLowerCase();
        let message = '';
        
        if (userAgent.includes('safari') && userAgent.includes('mobile')) {
            message = '📱 Safari: Tap Share button (📤) → "Add to Home Screen"';
        } else if (userAgent.includes('chrome')) {
            message = '📱 Chrome: Menu (⋮) → "Install app" or look for install icon (⬇️) in address bar';
        } else if (userAgent.includes('firefox')) {
            message = '📱 Firefox: Menu (⋮) → "Install"';
        } else {
            message = '📱 Look for "Add to Home Screen" or "Install" option in browser menu';
        }
        
        this.showMessage(message, 'info');

        setTimeout(() => {
            const installBtn = document.getElementById('simpleInstallBtn');
            if (installBtn) {
                installBtn.style.display = 'none';
            }
        }, 5000);
    }

    showMessage(message, type = 'info') {
        
        const existingMessages = document.querySelectorAll('.message');
        existingMessages.forEach(msg => msg.remove());

        const messageElement = document.createElement('div');
        messageElement.className = `message ${type}`;
        messageElement.textContent = message;

        const mainContent = document.querySelector('.main-content');
        mainContent.insertBefore(messageElement, mainContent.firstChild);

        setTimeout(() => {
            messageElement.remove();
        }, 5000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.expenseTracker = new ExpenseTracker();
});

window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const view = urlParams.get('view');
    
    if (view && window.expenseTracker) {
        window.expenseTracker.showView(view);
    }
});

window.clearExpenseDatabase = async function() {
    if (confirm('Are you sure you want to clear all expense data? This cannot be undone.')) {
        try {
            const request = indexedDB.deleteDatabase('ExpenseTrackerDB');
            request.onsuccess = () => {
                alert('Database cleared successfully. Page will reload.');
                location.reload();
            };
            request.onerror = () => {
                alert('Failed to clear database.');
            };
        } catch (error) {
            alert('Error clearing database: ' + error.message);
        }
    }
};

window.showPhotoModal = function(photoSrc) {
    
    let modal = document.getElementById('photoModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'photoModal';
        modal.className = 'photo-modal';
        modal.innerHTML = `
            <div class="photo-modal-content">
                <span class="photo-modal-close">&times;</span>
                <img id="modalPhoto" src="" alt="Receipt photo" class="modal-photo">
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.photo-modal-close').onclick = () => {
            modal.style.display = 'none';
        };
        
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }

    document.getElementById('modalPhoto').src = photoSrc;
    modal.style.display = 'block';
};
