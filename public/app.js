let currentUser = null;
let config = null;
let appId = null;

function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    lang: params.get('lang'),
    appid: params.get('appid')
  };
}

function validateAppId(id) {
  return /^[a-zA-Z0-9_-]{1,255}$/.test(id);
}

async function init() {
  const urlParams = getUrlParams();
  appId = urlParams.appid;
  
  if (!appId) {
    showError('AppId is required in URL parameters');
    return;
  }
  
  if (!validateAppId(appId)) {
    showError('Invalid AppId format');
    return;
  }
  
  if (urlParams.lang && ['en', 'uk', 'ru'].includes(urlParams.lang)) {
    currentLang = urlParams.lang;
    localStorage.setItem('preferredLang', urlParams.lang);
  } else {
    currentLang = localStorage.getItem('preferredLang') || 'en';
  }
  
  updatePageLanguage();
  
  try {
    const configResponse = await fetch('/api/config');
    config = await configResponse.json();
    
    document.getElementById('channelLink').href = config.channelLink;
    
    const userResponse = await fetch(`/api/user/${encodeURIComponent(appId)}`);
    
    if (userResponse.ok) {
      const data = await userResponse.json();
      currentUser = data.user;
      showUserProfile(data.user, data.subscribed);
    } else {
      showLoginWidget();
    }
  } catch (error) {
    console.error('Помилка завантаження:', error);
    showError(t('error_loading'));
    showLoginWidget();
  }
}

function showLoginWidget() {
  if (!config || !config.botUsername) {
    setTimeout(showLoginWidget, 100);
    return;
  }
  
  document.getElementById('loginSection').style.display = 'block';
  document.getElementById('loader').style.display = 'none';
  document.getElementById('userCard').style.display = 'none';
  document.getElementById('errorMessage').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'none';
  hideAllStatus();
  
  const container = document.getElementById('telegram-login-container');
  container.innerHTML = '';
  
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://telegram.org/js/telegram-widget.js?22';
  script.setAttribute('data-telegram-login', config.botUsername);
  script.setAttribute('data-size', 'large');
  script.setAttribute('data-radius', '10');
  script.setAttribute('data-onauth', 'onTelegramAuth(user)');
  script.setAttribute('data-request-access', 'write');
  
  container.appendChild(script);
}

function showUserProfile(user, isSubscribed) {
  currentUser = user;
  
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('loader').style.display = 'none';
  document.getElementById('errorMessage').style.display = 'none';
  
  const userCard = document.getElementById('userCard');
  const photoHtml = user.photo_url 
    ? `<img src="${user.photo_url}" alt="Avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
       <div style="font-size: 60px; display: none;">👤</div>`
    : '<div style="font-size: 60px;">👤</div>';
  
  userCard.innerHTML = `
    ${photoHtml}
    <h3>${escapeHtml(user.first_name)} ${escapeHtml(user.last_name || '')}</h3>
    <p>@${escapeHtml(user.username || 'ID: ' + user.id)}</p>
  `;
  userCard.style.display = 'block';
  
  document.getElementById('logoutBtn').style.display = 'inline-block';
  
  hideAllStatus();
  if (isSubscribed) {
    document.getElementById('statusSubscribed').style.display = 'block';
  } else {
    document.getElementById('statusNotSubscribed').style.display = 'block';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function onTelegramAuth(user) {
  if (!user || !user.id) {
    showError(t('error_auth_failed'));
    return;
  }
  
  currentUser = user;
  
  const loader = document.getElementById('loader');
  const loginSection = document.getElementById('loginSection');
  const errorMessage = document.getElementById('errorMessage');
  
  loginSection.style.display = 'none';
  loader.style.display = 'block';
  errorMessage.style.display = 'none';
  hideAllStatus();
  
  try {
    const requestBody = {
      ...user,
      appId: appId
    };
    
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    
    const data = await response.json();
    loader.style.display = 'none';
    
    if (response.ok && data.subscribed) {
      showUserProfile(data.user, true);
    } else if (response.status === 403) {
      showUserProfile(user, false);
    } else {
      showError(data.error || t('error_auth_failed'));
      loginSection.style.display = 'block';
    }
  } catch (error) {
    loader.style.display = 'none';
    showError(t('error_connection') + ' ' + error.message);
    loginSection.style.display = 'block';
  }
}

async function recheckSubscription() {
  if (!appId) return;
  
  const loader = document.getElementById('loader');
  const errorMessage = document.getElementById('errorMessage');
  
  hideAllStatus();
  loader.style.display = 'block';
  errorMessage.style.display = 'none';
  
  try {
    const response = await fetch(`/api/subscription-status/${encodeURIComponent(appId)}`);
    
    if (response.status === 404) {
      loader.style.display = 'none';
      showError(t('error_user_not_found'));
      showLoginWidget();
      return;
    }
    
    const data = await response.json();
    
    loader.style.display = 'none';
    
    if (data.subscribed) {
      document.getElementById('statusSubscribed').style.display = 'block';
    } else {
      document.getElementById('statusNotSubscribed').style.display = 'block';
      showError(t('error_still_not_subscribed'));
    }
  } catch (error) {
    loader.style.display = 'none';
    showError(t('error_check') + ' ' + error.message);
  }
}

async function logout() {
  if (!appId) return;
  
  if (!confirm(t('confirm_logout'))) {
    return;
  }
  
  const loader = document.getElementById('loader');
  loader.style.display = 'block';
  
  try {
    const response = await fetch(`/api/logout/${encodeURIComponent(appId)}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      currentUser = null;
      
      document.getElementById('userCard').style.display = 'none';
      document.getElementById('logoutBtn').style.display = 'none';
      hideAllStatus();
      
      showLoginWidget();
    } else {
      throw new Error('Logout failed');
    }
  } catch (error) {
    loader.style.display = 'none';
    showError('Logout error: ' + error.message);
  } finally {
    loader.style.display = 'none';
  }
}

function hideAllStatus() {
  document.getElementById('statusSubscribed').style.display = 'none';
  document.getElementById('statusNotSubscribed').style.display = 'none';
}

function showError(message) {
  const errorMessage = document.getElementById('errorMessage');
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
  
  setTimeout(() => {
    errorMessage.style.display = 'none';
  }, 10000);
}

function t(key) {
  if (typeof translations !== 'undefined') {
    return translations[currentLang][key] || translations['en'][key] || key;
  }
  return key;
}

function updatePageLanguage() {
  if (typeof translations === 'undefined') return;
  
  document.querySelector('.header h1').textContent = t('title');
  document.querySelector('.header p').textContent = t('subtitle');
  
  const subscribedTitle = document.querySelector('#statusSubscribed h2');
  if (subscribedTitle) subscribedTitle.textContent = t('subscribed_title');
  
  const subscribedText1 = document.querySelector('#statusSubscribed p:nth-of-type(1)');
  if (subscribedText1) subscribedText1.textContent = t('subscribed_text1');
  
  const subscribedText2 = document.querySelector('#statusSubscribed p:nth-of-type(2)');
  if (subscribedText2) subscribedText2.textContent = t('subscribed_text2');
  
  const notSubscribedTitle = document.querySelector('#statusNotSubscribed h2');
  if (notSubscribedTitle) notSubscribedTitle.textContent = t('not_subscribed_title');
  
  const notSubscribedText = document.querySelector('#statusNotSubscribed > p');
  if (notSubscribedText) notSubscribedText.textContent = t('not_subscribed_text');
  
  const channelLink = document.querySelector('#channelLink');
  if (channelLink) channelLink.innerHTML = t('btn_subscribe');
  
  const recheckBtn = document.querySelector('button[onclick="recheckSubscription()"]');
  if (recheckBtn) recheckBtn.innerHTML = t('btn_recheck');
  
  const logoutBtn = document.querySelector('#logoutBtn');
  if (logoutBtn) logoutBtn.innerHTML = t('btn_logout');
}

window.onTelegramAuth = onTelegramAuth;

document.addEventListener('DOMContentLoaded', init);