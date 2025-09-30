require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const path = require('path');
const mysql = require('mysql2/promise');

console.log('🔍 Environment variables debug:');
console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? '✅ found' : '❌ not found');
console.log('BOT_USERNAME:', process.env.BOT_USERNAME || '❌ not found');
console.log('CHANNEL_ID:', process.env.CHANNEL_ID || '❌ not found');
console.log('CHANNEL_INVITE_LINK:', process.env.TELEGRAM_CHANNEL_INVITE_LINK || '⚠️ not set (will be auto-generated)');
console.log('MYSQL_HOST:', process.env.MYSQL_HOST || '❌ not found');

const app = express();

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use(express.static(path.join(__dirname, 'public')));

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME;
const CHANNEL_ID = process.env.CHANNEL_ID;
const CHANNEL_INVITE_LINK = process.env.TELEGRAM_CHANNEL_INVITE_LINK;
const CACHE_TTL = 300000;

let pool;
const subscriptionCache = new Map();

async function initDatabase() {
  try {
    pool = await mysql.createPool({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: process.env.MYSQL_PORT || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        app_id VARCHAR(100) PRIMARY KEY,
        user_id BIGINT NOT NULL,
        first_name VARCHAR(35),
        last_name VARCHAR(35),
        username VARCHAR(35),
        photo_url TEXT,
        is_subscribed BOOLEAN DEFAULT FALSE,
        last_check TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_last_check (last_check)
      )
    `;

    await pool.execute(createTableQuery);
    console.log('✅ Database initialized');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

async function validateChannelId() {
  try {
    const botInfoResponse = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getMe`,
      { timeout: 5000 }
    );
    
    const botId = botInfoResponse.data.result.id;
    
    const response = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`,
      {
        params: { 
          chat_id: CHANNEL_ID,
          user_id: botId 
        },
        timeout: 5000
      }
    );
    
    const status = response.data.result.status;
    
    if (['creator', 'administrator'].includes(status)) {
      console.log('✅ Channel found, bot has administrator rights');
      return true;
    } else {
      console.warn('⚠️ Bot found the channel but is not an administrator!');
      console.warn('💡 Add the bot as channel administrator to check subscriptions');
      return false;
    }
  } catch (error) {
    console.error('❌ Channel validation error:', error.response?.data || error.message);
    console.error('⚠️ Channel not found or bot is not added to the channel!');
    console.error('💡 Make sure that:');
    console.error('   1. CHANNEL_ID is correct:');
    console.error('      - @username (for public channels)');
    console.error('      - -100xxxxxxxxxx (for private/hidden channels)');
    console.error('   2. Bot is added as channel administrator');
    console.error('   3. Bot has rights to view channel members');
    return false;
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, data] of subscriptionCache.entries()) {
    if (now - data.timestamp > CACHE_TTL) {
      subscriptionCache.delete(key);
    }
  }
}, 60000);

if (!BOT_TOKEN || !BOT_USERNAME || !CHANNEL_ID) {
  console.error('❌ Error: Required environment variables not found!');
  process.exit(1);
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input.replace(/[<>]/g, '');
}

function sanitizeForDB(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return typeof value === 'string' ? sanitizeInput(value) : value;
}

function validateAppId(appId) {
  const regex = /^[a-zA-Z0-9_-]{1,255}$/;
  return regex.test(appId);
}

function validateTelegramAuth(data) {
  const { hash, appId, ...authData } = data;
  
  if (!hash || !authData.id || !authData.auth_date) {
    return false;
  }
  
  const checkString = Object.keys(authData)
    .sort()
    .map(key => `${key}=${authData[key]}`)
    .join('\n');
  
  const secretKey = crypto
    .createHash('sha256')
    .update(BOT_TOKEN)
    .digest();
  
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex');
  
  const authDate = parseInt(authData.auth_date);
  const currentTime = Math.floor(Date.now() / 1000);
  const isRecent = (currentTime - authDate) < 86400;
  
  return calculatedHash === hash && isRecent;
}

async function checkChannelSubscription(userId, useCache = true) {
  const cacheKey = `sub_${userId}`;
  
  if (useCache && subscriptionCache.has(cacheKey)) {
    const cached = subscriptionCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.subscribed;
    }
  }
  
  try {
    const response = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`,
      {
        params: {
          chat_id: CHANNEL_ID,
          user_id: userId
        },
        timeout: 5000
      }
    );
    
    const status = response.data.result.status;
    const isSubscribed = ['creator', 'administrator', 'member'].includes(status);
    
    subscriptionCache.set(cacheKey, {
      subscribed: isSubscribed,
      timestamp: Date.now()
    });
    
    return isSubscribed;
  } catch (error) {
    if (error.response?.data?.error_code === 429) {
      console.error('⚠️ Telegram API rate limit reached');
      if (subscriptionCache.has(cacheKey)) {
        return subscriptionCache.get(cacheKey).subscribed;
      }
    }
    
    if (error.response) {
      console.error('❌ Telegram API error:', error.response.data);
    } else if (error.code === 'ECONNABORTED') {
      console.error('⏱️ Telegram API timeout');
    } else {
      console.error('Subscription check error:', error.message);
    }
    return false;
  }
}

async function backgroundSubscriptionCheck() {
  let connection;
  try {
    console.log('🔄 Starting background subscription check...');
    
    connection = await pool.getConnection();
    
    const [users] = await connection.execute(
      'SELECT app_id, user_id FROM users'
    );
    
    console.log(`📊 Found ${users.length} users to check`);
    
    let updatedCount = 0;
    let errorCount = 0;
    
    for (const user of users) {
      try {
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const isSubscribed = await checkChannelSubscription(user.user_id, false);
        
        await connection.execute(
          'UPDATE users SET is_subscribed = ?, last_check = NOW() WHERE app_id = ?',
          [isSubscribed, user.app_id]
        );
        
        updatedCount++;
        
      } catch (error) {
        errorCount++;
        console.error(`❌ User check error ${user.app_id}:`, error.message);
      }
    }
    
    console.log(`✅ Background check completed: updated ${updatedCount}, errors ${errorCount}`);
    
  } catch (error) {
    console.error('❌ Critical background check error:', error);
  } finally {
    if (connection) connection.release();
  }
}

const BACKGROUND_CHECK_INTERVAL = 4 * 60 * 60 * 1000;
let backgroundCheckTimer;

function startBackgroundCheck() {
  setTimeout(() => {
    backgroundSubscriptionCheck();
    
    backgroundCheckTimer = setInterval(() => {
      backgroundSubscriptionCheck();
    }, BACKGROUND_CHECK_INTERVAL);
    
  }, 60000);
  
  console.log('⏰ Background subscription check configured (every 4 hours)');
}

function stopBackgroundCheck() {
  if (backgroundCheckTimer) {
    clearInterval(backgroundCheckTimer);
    console.log('⏸️ Background subscription check stopped');
  }
}

app.get('/api/config', (req, res) => {
  const channelLink = CHANNEL_INVITE_LINK || 
    (CHANNEL_ID.startsWith('@') 
      ? `https://t.me/${CHANNEL_ID.substring(1)}` 
      : `https://t.me/your_channel`);
    
  res.json({
    botUsername: BOT_USERNAME,
    channelLink: channelLink
  });
});

app.get('/api/user/:appId', async (req, res) => {
  let connection;
  try {
    const appId = req.params.appId;
    
    if (!appId || !validateAppId(appId)) {
      return res.status(400).json({ error: 'Invalid AppId' });
    }
    
    connection = await pool.getConnection();
    
    const [rows] = await connection.execute(
      'SELECT * FROM users WHERE app_id = ?',
      [appId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = rows[0];
    const now = new Date();
    const lastCheck = user.last_check ? new Date(user.last_check) : new Date(0);
    const timeDiff = now - lastCheck;
    
    let isSubscribed = Boolean(user.is_subscribed);
    
    if (timeDiff > 60000) {
      isSubscribed = await checkChannelSubscription(user.user_id);
      
      await connection.execute(
        'UPDATE users SET is_subscribed = ?, last_check = NOW() WHERE app_id = ?',
        [isSubscribed, appId]
      );
    }
    
    res.json({
      user: {
        id: user.user_id,
        first_name: sanitizeInput(user.first_name),
        last_name: sanitizeInput(user.last_name),
        username: sanitizeInput(user.username),
        photo_url: user.photo_url
      },
      subscribed: Boolean(isSubscribed)
    });
    
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connection) connection.release();
  }
});

app.post('/api/auth', async (req, res) => {
  let connection;
  try {
    const authData = req.body;
    const appId = authData.appId;
    
    if (!appId || !validateAppId(appId)) {
      return res.status(400).json({ error: 'Invalid AppId' });
    }
    
    if (!authData.id || typeof authData.id !== 'number') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    const isValid = validateTelegramAuth(authData);
    
    if (!isValid) {
      return res.status(401).json({ 
        error: 'Invalid authentication data or expired (>24 hours)' 
      });
    }
    
    const isSubscribed = await checkChannelSubscription(authData.id, false);
    
    connection = await pool.getConnection();
    
    await connection.execute(
      `INSERT INTO users (app_id, user_id, first_name, last_name, username, photo_url, is_subscribed, last_check) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       first_name = VALUES(first_name),
       last_name = VALUES(last_name),
       username = VALUES(username),
       photo_url = VALUES(photo_url),
       is_subscribed = VALUES(is_subscribed),
       last_check = NOW()`,
      [
        appId, 
        authData.id, 
        sanitizeForDB(authData.first_name), 
        sanitizeForDB(authData.last_name), 
        sanitizeForDB(authData.username), 
        sanitizeForDB(authData.photo_url), 
        isSubscribed
      ]
    );
    
    if (!isSubscribed) {
      return res.status(403).json({ 
        error: 'Channel subscription required',
        subscribed: false,
        appId: appId
      });
    }
    
    res.json({
      success: true,
      user: {
        id: authData.id,
        first_name: sanitizeInput(authData.first_name),
        last_name: sanitizeInput(authData.last_name),
        username: sanitizeInput(authData.username),
        photo_url: authData.photo_url
      },
      subscribed: true,
      appId: appId
    });
    
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connection) connection.release();
  }
});

app.delete('/api/logout/:appId', async (req, res) => {
  let connection;
  try {
    const appId = req.params.appId;
    
    if (!appId || !validateAppId(appId)) {
      return res.status(400).json({ error: 'Invalid AppId' });
    }
    
    connection = await pool.getConnection();
    
    const [result] = await connection.execute(
      'DELETE FROM users WHERE app_id = ?', 
      [appId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const cacheKey = `sub_${appId}`;
    subscriptionCache.delete(cacheKey);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error during logout:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connection) connection.release();
  }
});

app.get('/api/subscription-status/:appId', async (req, res) => {
  let connection;
  try {
    const appId = req.params.appId;
    
    if (!appId || !validateAppId(appId)) {
      return res.status(400).json({ error: 'Invalid AppId' });
    }
    
    connection = await pool.getConnection();
    
    const [rows] = await connection.execute(
      'SELECT is_subscribed, last_check FROM users WHERE app_id = ?',
      [appId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = rows[0];
    
    res.json({ 
      subscribed: Boolean(user.is_subscribed),
      appId: appId,
      lastCheck: user.last_check
    });
    
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({ error: 'Subscription check error' });
  } finally {
    if (connection) connection.release();
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing connections...');
  stopBackgroundCheck();
  if (pool) {
    await pool.end();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing connections...');
  stopBackgroundCheck();
  if (pool) {
    await pool.end();
  }
  process.exit(0);
});

const PORT = process.env.PORT || 3000;

initDatabase()
  .then(() => validateChannelId())
  .then((isValid) => {
    if (!isValid) {
      console.error('⚠️ WARNING: Channel is not valid, but server started for debugging');
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 Server started on http://under.if.ua:${PORT}`);
      console.log(`📱 Bot: @${BOT_USERNAME}`);
      console.log(`📢 Channel: ${CHANNEL_ID}`);
      console.log(`🔗 Invite Link: ${CHANNEL_INVITE_LINK || 'auto-generated'}`);
      
      startBackgroundCheck();
    });
  })
  .catch(err => {
    console.error('Failed to initialize:', err);
    process.exit(1);
  });