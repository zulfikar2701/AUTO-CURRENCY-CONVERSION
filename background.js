const SOURCE_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'IDR'];
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

async function fetchRatesForCurrency(base) {
  const url = `https://api.frankfurter.app/latest?from=${base}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch rates for ${base}`);
  return response.json();
}

async function fetchAllRates() {
  const rates = {};
  const results = await Promise.allSettled(
    SOURCE_CURRENCIES.map(async (currency) => {
      const data = await fetchRatesForCurrency(currency);
      if (data && data.rates && typeof data.rates === 'object') {
        rates[currency] = data.rates;
      } else {
        console.error(`Invalid rate data for ${currency}`);
      }
    })
  );

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`Failed to fetch rates for ${SOURCE_CURRENCIES[i]}:`, result.reason);
    }
  });

  return rates;
}

async function updateRates() {
  try {
    const rates = await fetchAllRates();
    await chrome.storage.local.set({
      rates,
      ratesTimestamp: Date.now()
    });
    console.log('Exchange rates updated successfully');
  } catch (error) {
    console.error('Failed to update exchange rates:', error);
  }
}

async function getRatesIfStale() {
  const data = await chrome.storage.local.get(['rates', 'ratesTimestamp']);
  if (!data.rates || !data.ratesTimestamp || Date.now() - data.ratesTimestamp > CACHE_DURATION) {
    await updateRates();
  }
}

// Fetch rates on install and startup
chrome.runtime.onInstalled.addListener(() => {
  updateRates();
  // Set default target currency
  chrome.storage.sync.get(['targetCurrency', 'enabled'], (data) => {
    if (!data.targetCurrency) {
      chrome.storage.sync.set({ targetCurrency: 'USD' });
    }
    if (data.enabled === undefined) {
      chrome.storage.sync.set({ enabled: true });
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  getRatesIfStale();
});

// Periodic refresh via alarm
chrome.alarms.create('refreshRates', { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refreshRates') {
    updateRates();
  }
});

// Respond to messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  if (message.type === 'getRates') {
    chrome.storage.local.get(['rates']).then((data) => {
      sendResponse({ rates: data.rates || {} });
    });
    return true; // async response
  }

  if (message.type === 'getSettings') {
    chrome.storage.sync.get(['targetCurrency', 'enabled']).then((data) => {
      sendResponse({
        targetCurrency: data.targetCurrency || 'USD',
        enabled: data.enabled !== false
      });
    });
    return true;
  }
});
