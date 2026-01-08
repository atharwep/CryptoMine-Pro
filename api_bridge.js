/**
 * CryptoMine Pro - Frontend API Bridge
 */

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyMZIu2zNWf8jYI8oNcEqInNeZDA9_4yvM6LZD0h2po4R_0mB6xhbsAUbQSn8QXB_DB/exec';
const API_KEY = 'CRYPTO_SECURE_KEY_2026'; // يجب أن يطابق المفتاح في GAS

const API = {
    async call(action, data = {}, method = 'GET') {
        const url = new URL(SCRIPT_URL);
        const options = {
            method: 'POST',
            body: JSON.stringify({ action, data, key: API_KEY })
        };

        if (method === 'GET') {
            url.searchParams.append('action', action);
            url.searchParams.append('data', JSON.stringify(data));
            url.searchParams.append('key', API_KEY);
            delete options.body;
            options.method = 'GET';
        }

        try {
            const response = await fetch(url.toString(), options);
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            return { error: 'Connection failed' };
        }
    },

    // User Actions
    async login(email, password) {
        return await this.call('login', { email, password }, 'POST');
    },

    async register(name, email, password) {
        return await this.call('register', { username: name, email, password }, 'POST');
    },

    // Data Fetching
    async getDashboardData(userId) {
        const stats = await this.call('get_user_stats', { user_id: userId });
        const transactions = await this.call('get_transactions', { user_id: userId });
        const contracts = await this.call('get_user_contracts', { user_id: userId });
        return { stats, transactions, contracts };
    },

    async getPlans() {
        return await this.call('get_plans');
    },

    // Wallet Actions
    async requestWithdrawal(userId, amount, currency, address) {
        return await this.call('request_withdrawal', {
            user_id: userId,
            amount,
            currency,
            address,
            type: 'Withdrawal',
            status: 'Pending',
            created_at: new Date()
        }, 'POST');
    },

    // Admin Actions
    async getAllUsers() {
        return await this.call('get_all_users');
    },

    async approveWithdrawal(txId) {
        return await this.call('approve_withdrawal', { tx_id: txId }, 'POST');
    }
};

// Web3 Wallet Integration
const Web3Wallet = {
    async connect() {
        if (typeof window.ethereum !== 'undefined') {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                const account = accounts[0];
                localStorage.setItem('connected_wallet', account);
                return account;
            } catch (error) {
                console.error('Wallet connection failed:', error);
                return null;
            }
        } else {
            alert('يرجى تثبيت MetaMask أو متصفح يدعم Web3');
            return null;
        }
    },
    getConnected() {
        return localStorage.getItem('connected_wallet');
    }
};

// Direct Support
const Support = {
    whatsapp: '966500000000', // استبدل برقمك
    openWhatsApp(message = 'أهلاً، أحتاج إلى مساعدة بخصوص حسابي في CryptoMine Pro') {
        const url = `https://wa.me/${this.whatsapp}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    }
};

// Global User State
const UserState = {
    get() {
        return JSON.parse(localStorage.getItem('user')) || null;
    },
    set(user) {
        localStorage.setItem('user', JSON.stringify(user));
    },
    logout() {
        localStorage.removeItem('user');
        window.location.href = 'auth.html';
    },
    isAdmin() {
        const user = this.get();
        return user && user.role === 'admin';
    }
};
