const targetSelect = document.getElementById('targetCurrency');
const enabledToggle = document.getElementById('enabled');
const statusText = document.getElementById('status');

// Load saved settings
chrome.storage.sync.get(['targetCurrency', 'enabled'], (data) => {
  targetSelect.value = data.targetCurrency || 'USD';
  enabledToggle.checked = data.enabled !== false;
  updateStatus(enabledToggle.checked);
});

// Save target currency on change
targetSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ targetCurrency: targetSelect.value });
});

// Save enabled state on change
enabledToggle.addEventListener('change', () => {
  const isEnabled = enabledToggle.checked;
  chrome.storage.sync.set({ enabled: isEnabled });
  updateStatus(isEnabled);
});

function updateStatus(isEnabled) {
  statusText.textContent = isEnabled
    ? 'Detecting: USD, EUR, GBP, JPY, CNY'
    : 'Extension disabled';
  statusText.className = isEnabled ? 'status' : 'status disabled';
}
