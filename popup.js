const targetSelect = document.getElementById('targetCurrency');
const enabledToggle = document.getElementById('enabled');
const statusText = document.getElementById('status');
const toggleSiteBtn = document.getElementById('toggleSite');
const currentSiteText = document.getElementById('currentSite');

let currentHostname = '';
let blockedSites = [];

// Get the active tab's hostname
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0] && tabs[0].url) {
    try {
      currentHostname = new URL(tabs[0].url).hostname;
      currentSiteText.textContent = currentHostname;
    } catch {
      currentSiteText.textContent = 'N/A';
    }
  }
  loadSettings();
});

function loadSettings() {
  chrome.storage.sync.get(['targetCurrency', 'enabled', 'blockedSites'], (data) => {
    targetSelect.value = data.targetCurrency || 'USD';
    enabledToggle.checked = data.enabled !== false;
    blockedSites = data.blockedSites || [];
    updateStatus(enabledToggle.checked);
    updateSiteButton();
  });
}

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

// Toggle current site blocking
toggleSiteBtn.addEventListener('click', () => {
  if (!currentHostname) return;

  const index = blockedSites.indexOf(currentHostname);
  if (index === -1) {
    blockedSites.push(currentHostname);
  } else {
    blockedSites.splice(index, 1);
  }

  chrome.storage.sync.set({ blockedSites }, () => {
    updateSiteButton();
    // Reload the tab to apply changes
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.reload(tabs[0].id);
    });
  });
});

function updateSiteButton() {
  if (!currentHostname) {
    toggleSiteBtn.style.display = 'none';
    return;
  }
  const isBlocked = blockedSites.includes(currentHostname);
  toggleSiteBtn.textContent = isBlocked ? 'Enable on this site' : 'Disable on this site';
  toggleSiteBtn.className = isBlocked ? 'btn-site blocked' : 'btn-site';
}

function updateStatus(isEnabled) {
  statusText.textContent = isEnabled
    ? 'Detecting: USD, EUR, GBP, JPY, CNY, IDR'
    : 'Extension disabled';
  statusText.className = isEnabled ? 'status' : 'status disabled';
}
