const translations = {
  en: {
    title: '📢 Subscription Check',
    subtitle: 'Login via Telegram to verify your channel subscription',
    subscribed_title: 'You are subscribed!',
    subscribed_text1: 'Thank you for subscribing to our channel',
    subscribed_text2: 'You have full access to all features',
    not_subscribed_title: 'Subscription not found',
    not_subscribed_text: 'To continue, you need to subscribe to our Telegram channel',
    btn_subscribe: '📢 Subscribe to channel',
    btn_recheck: '🔄 Check again',
    btn_logout: '🚪 Logout',
    error_loading: 'Loading error. Please reload the page.',
    error_connection: 'Connection error:',
    error_still_not_subscribed: '⚠️ Subscription still not found. Make sure you have subscribed to the channel.',
    error_check: 'Check error:',
    error_timeout: 'Request timeout. Please try again.',
    error_auth_failed: 'Authentication failed. Please try again.',
    error_rate_limit: 'Too many requests. Please wait a moment.',
    confirm_logout: 'Are you sure you want to logout?',
    error_user_not_found: 'User session not found. Please login again.'
  },
  uk: {
    title: '📢 Перевірка підписки',
    subtitle: 'Увійдіть через Telegram, щоб перевірити вашу підписку на канал',
    subscribed_title: 'Ви підписані!',
    subscribed_text1: 'Дякуємо за підписку на наш канал',
    subscribed_text2: 'Ви маєте повний доступ до всіх функцій',
    not_subscribed_title: 'Підписка не знайдена',
    not_subscribed_text: 'Для продовження вам потрібно підписатися на наш Telegram канал',
    btn_subscribe: '📢 Підписатися на канал',
    btn_recheck: '🔄 Перевірити знову',
    btn_logout: '🚪 Вийти',
    error_loading: 'Помилка завантаження. Перезавантажте сторінку.',
    error_connection: 'Помилка з\'єднання:',
    error_still_not_subscribed: '⚠️ Підписка все ще не знайдена. Переконайтеся, що ви підписалися на канал.',
    error_check: 'Помилка перевірки:',
    error_timeout: 'Час очікування запиту вичерпано. Спробуйте ще раз.',
    error_auth_failed: 'Помилка автентифікації. Спробуйте ще раз.',
    error_rate_limit: 'Забагато запитів. Зачекайте трохи.',
    confirm_logout: 'Ви впевнені, що хочете вийти?',
    error_user_not_found: 'Сесію користувача не знайдено. Будь ласка, увійдіть знову.'
  },
  ru: {
    title: '📢 Проверка подписки',
    subtitle: 'Войдите через Telegram, чтобы проверить вашу подписку на канал',
    subscribed_title: 'Вы подписаны!',
    subscribed_text1: 'Спасибо за подписку на наш канал',
    subscribed_text2: 'У вас есть полный доступ ко всем функциям',
    not_subscribed_title: 'Подписка не найдена',
    not_subscribed_text: 'Для продолжения вам нужно подписаться на наш Telegram канал',
    btn_subscribe: '📢 Подписаться на канал',
    btn_recheck: '🔄 Проверить снова',
    btn_logout: '🚪 Выйти',
    error_loading: 'Ошибка загрузки. Перезагрузите страницу.',
    error_connection: 'Ошибка соединения:',
    error_still_not_subscribed: '⚠️ Подписка все еще не найдена. Убедитесь, что вы подписались на канал.',
    error_check: 'Ошибка проверки:',
    error_timeout: 'Время ожидания запроса истекло. Попробуйте еще раз.',
    error_auth_failed: 'Ошибка аутентификации. Попробуйте еще раз.',
    error_rate_limit: 'Слишком много запросов. Подождите немного.',
    confirm_logout: 'Вы уверены, что хотите выйти?',
    error_user_not_found: 'Сессия пользователя не найдена. Пожалуйста, войдите снова.'
  }
};

let currentLang = 'en';

function setLanguage(lang) {
  currentLang = lang;
  updatePageLanguage();
  
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-lang="${lang}"]`).classList.add('active');
}

function t(key) {
  return translations[currentLang][key] || translations['en'][key] || key;
}

function updatePageLanguage() {
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