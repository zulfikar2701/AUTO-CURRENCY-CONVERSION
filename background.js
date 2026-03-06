const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

async function fetchAllRates() {
  // Single API call using EUR as base (ECB native base currency)
  // This returns EUR → X rates for all supported currencies
  const url = 'https://api.frankfurter.app/latest?from=EUR';
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch rates');
  const data = await response.json();

  if (!data || !data.rates || typeof data.rates !== 'object') {
    throw new Error('Invalid rate data');
  }

  // Add EUR itself (rate to itself = 1)
  const eurRates = { ...data.rates, EUR: 1 };
  const currencies = Object.keys(eurRates);

  // Compute all cross-rates: rates[A][B] = eurRates[B] / eurRates[A]
  const rates = {};
  for (const from of currencies) {
    rates[from] = {};
    for (const to of currencies) {
      if (from === to) continue;
      rates[from][to] = eurRates[to] / eurRates[from];
    }
  }

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
    getRatesIfStale();
  }
});

// Respond to messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;

  if (message.type === 'getRates') {
    chrome.storage.local.get(['rates']).then((data) => {
      sendResponse({ rates: data.rates || {} });
    });
    return true; // async response
  }

  if (message.type === 'getSettings') {
    chrome.storage.sync.get(['targetCurrency', 'enabled', 'blockedSites']).then((data) => {
      sendResponse({
        targetCurrency: data.targetCurrency || 'USD',
        enabled: data.enabled !== false,
        blockedSites: data.blockedSites || []
      });
    });
    return true;
  }
});
