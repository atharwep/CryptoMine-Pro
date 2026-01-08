/**
 * CryptoMine Pro - Google Apps Script Bridge
 * This script should be deployed as a Web App with 'Execute as me' and 'Anyone has access'.
 */

const SPREADSHEET_ID = '1-gMr-LbUOL6bz5H8WW_eORu-3D2lqqAXNKxn76nIFD8';
const API_KEY = 'CRYPTO_SECURE_KEY_2026'; // مفتاح أمان لمنع الوصول غير المصرح به
const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

function validateKey(key) {
  return key === API_KEY;
}

/**
 * Initializes the database by creating necessary sheets and headers if they don't exist.
 * Run this function once from the Apps Script editor.
 */
function initDatabase() {
  const sheets = {
    'Users': ['id', 'username', 'email', 'password', 'role', 'balance_usdt', 'referral_code', 'referred_by', 'created_at'],
    'MiningPlans': ['id', 'name', 'price', 'hash_power', 'duration_days', 'daily_return'],
    'Transactions': ['id', 'user_id', 'type', 'amount', 'currency', 'address', 'status', 'tx_hash', 'created_at'],
    'UserContracts': ['id', 'user_id', 'plan_id', 'start_date', 'end_date', 'earned_amount', 'status']
  };

  for (const [name, headers] of Object.entries(sheets)) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f2a900').setFontColor('#000000');
    }
  }

  // Remove default sheet if empty
  const defaultSheet = ss.getSheetByName('الورقة1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getLastRow() === 0) {
    try { ss.deleteSheet(defaultSheet); } catch (e) { }
  }

  return "Database initialized successfully!";
}

function doGet(e) {
  if (!validateKey(e.parameter.key)) return jsonResponse({ error: 'Unauthorized access' });
  const action = e.parameter.action;
  const data = JSON.parse(e.parameter.data || '{}');

  try {
    switch (action) {
      case 'get_user': return jsonResponse(getUser(data.email));
      case 'get_plans': return jsonResponse(getRows('MiningPlans'));
      case 'get_transactions': return jsonResponse(getRowsByFilter('Transactions', 'user_id', data.user_id));
      case 'get_user_contracts': return jsonResponse(getRowsByFilter('UserContracts', 'user_id', data.user_id));
      case 'get_all_users': return jsonResponse(getRows('Users'));
      case 'get_pending_withdrawals': return jsonResponse(getRowsByFilter('Transactions', 'status', 'Pending'));
      case 'init': return jsonResponse({ message: initDatabase() });
      default: return jsonResponse({ error: 'Invalid action' });
    }
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  const postData = JSON.parse(e.postData.contents);
  if (!validateKey(postData.key)) return jsonResponse({ error: 'Unauthorized access' });
  const action = postData.action;
  const data = postData.data;

  try {
    switch (action) {
      case 'register': return jsonResponse(registerUser(data));
      case 'login': return jsonResponse(loginUser(data));
      case 'deposit_notification': return jsonResponse(addRow('Transactions', data));
      case 'request_withdrawal': return jsonResponse(addRow('Transactions', data));
      case 'purchase_plan': return jsonResponse(purchasePlan(data));
      case 'update_user': return jsonResponse(updateRow('Users', 'id', data.id, data));
      case 'approve_withdrawal': return jsonResponse(approveTransaction(data.tx_id));
      case 'approve_deposit': return jsonResponse(approveTransaction(data.tx_id));
      default: return jsonResponse({ error: 'Invalid action' });
    }
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// --- Helper Functions ---

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getRows(sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  return data.map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function getRowsByFilter(sheetName, key, value) {
  return getRows(sheetName).filter(row => row[key] == value);
}

function addRow(sheetName, rowObj) {
  const sheet = ss.getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const newRow = headers.map(h => rowObj[h] || '');
  sheet.appendRow(newRow);
  return { success: true };
}

function approveTransaction(txId) {
  const transaction = getRows('Transactions').find(t => t.id == txId);
  if (transaction && transaction.status === 'Pending') {
    updateRow('Transactions', 'id', txId, { status: 'Completed', updated_at: new Date() });

    // إذا كان إيداع، نقوم بتحديث رصيد المستخدم ومعالجة العمولات
    if (transaction.type === 'Deposit') {
      const user = getRows('Users').find(u => u.id == transaction.user_id);
      if (user) {
        const newBalance = Number(user.balance_usdt) + Number(transaction.amount);
        updateRow('Users', 'id', user.id, { balance_usdt: newBalance });
        processReferralCommission(user.id, transaction.amount);
      }
    }
    return { success: true };
  }
  return { error: 'Transaction not found or already processed' };
}

function updateRow(sheetName, key, value, updateData) {
  const sheet = ss.getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  for (let i = 1; i < data.length; i++) {
    const keyIndex = headers.indexOf(key);
    if (data[i][keyIndex] == value) {
      for (const [k, v] of Object.entries(updateData)) {
        const colIndex = headers.indexOf(k);
        if (colIndex !== -1) {
          sheet.getRange(i + 1, colIndex + 1).setValue(v);
        }
      }
      return { success: true };
    }
  }
  return { error: 'Row not found' };
}

function registerUser(data) {
  const users = getRows('Users');
  if (users.find(u => u.email === data.email)) return { error: 'Email already exists' };

  // التحقق من كود الإحالة إذا وجد
  let referredBy = '';
  if (data.referral_code_input) {
    const referrer = users.find(u => u.referral_code === data.referral_code_input);
    if (referrer) referredBy = referrer.id;
  }

  data.id = Utilities.getUuid();
  data.role = 'user';
  data.balance_usdt = 0;
  data.referral_code = Math.random().toString(36).substring(2, 8).toUpperCase();
  data.referred_by = referredBy;
  data.created_at = new Date();

  // إرسال الإيميل jjbb3782@gmail.com كأدمن تلقائياً لتجنب أي تلاعب
  if (data.email === 'jjbb3782@gmail.com') data.role = 'admin';

  addRow('Users', data);
  return { success: true, user: data };
}

/**
 * معالجة العمولات عند الإيداع
 */
function processReferralCommission(userId, depositAmount) {
  const user = getRows('Users').find(u => u.id == userId);
  if (user && user.referred_by) {
    const commission = depositAmount * 0.10; // عمولة 10%
    const referrer = getRows('Users').find(u => u.id == user.referred_by);
    if (referrer) {
      const newBalance = Number(referrer.balance_usdt) + commission;
      updateRow('Users', 'id', referrer.id, { balance_usdt: newBalance });
      // تسجيل معاملة عمولة
      addRow('Transactions', {
        id: Utilities.getUuid(),
        user_id: referrer.id,
        type: 'Referral Commission',
        amount: commission,
        currency: 'USDT',
        status: 'Completed',
        created_at: new Date()
      });
    }
  }
}

function loginUser(data) {
  const user = getRows('Users').find(u => u.email === data.email && u.password === data.password);
  if (user) {
    // تحديد لوحة الإدارة فقط لهذا الإيميل
    if (user.email === 'jjbb3782@gmail.com') {
      user.role = 'admin';
    } else {
      user.role = 'user';
    }
    return { success: true, user: user };
  }
  return { error: 'Invalid credentials' };
}
