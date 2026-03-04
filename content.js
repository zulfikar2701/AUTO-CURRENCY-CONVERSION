(() => {
  // Suffix pattern for K (thousands), M/Mn (millions), B/Bn (billions)
  const SUFFIX = '(?:\\s?[KkMmBb][Nn]?)?';
  const NUM = '\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?' + SUFFIX;
  const NUM_EU = '\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{1,2})?' + SUFFIX;
  // Indonesian/dot-separated format: 12.900.000 (dots as thousands, no decimals)
  const NUM_DOT = '\\d{1,3}(?:\\.\\d{3})+' + SUFFIX;

  const CURRENCY_PATTERNS = [
    // IDR: Rp12.900.000, Rp 500.000, Rp100000
    { regex: new RegExp('Rp\\.?\\s?' + NUM_DOT, 'g'), currencies: ['IDR'] },
    { regex: new RegExp('Rp\\.?\\s?' + NUM, 'g'), currencies: ['IDR'] },
    // USD: $100, $ 1,000.50, US$500, $77M, $1.5B
    { regex: new RegExp('US\\$\\s?' + NUM, 'g'), currencies: ['USD'] },
    { regex: new RegExp('\\$\\s?' + NUM, 'g'), currencies: ['USD'] },
    // EUR: €100, 100€, 1.000,50€, €77M
    { regex: new RegExp('€\\s?' + NUM_EU, 'g'), currencies: ['EUR'] },
    { regex: new RegExp(NUM_EU + '\\s?€', 'g'), currencies: ['EUR'] },
    // GBP: £100, £1,000.50, £77M
    { regex: new RegExp('£\\s?' + NUM, 'g'), currencies: ['GBP'] },
    // JPY/CNY ambiguous: ¥100, ¥1,000, ¥77M
    { regex: new RegExp('¥\\s?' + NUM, 'g'), currencies: ['JPY', 'CNY'] },
    // CNY specific: 元
    { regex: new RegExp(NUM + '\\s?元', 'g'), currencies: ['CNY'] },
    // Explicit currency codes: USD 100, EUR 1,000.50, JPY 77M, IDR 500.000, etc.
    { regex: new RegExp('IDR\\s?' + NUM_DOT, 'g'), currencies: ['IDR'] },
    { regex: new RegExp('IDR\\s?' + NUM, 'g'), currencies: ['IDR'] },
    { regex: new RegExp('USD\\s?' + NUM, 'g'), currencies: ['USD'] },
    { regex: new RegExp('EUR\\s?' + NUM_EU, 'g'), currencies: ['EUR'] },
    { regex: new RegExp('GBP\\s?' + NUM, 'g'), currencies: ['GBP'] },
    { regex: new RegExp('JPY\\s?' + NUM, 'g'), currencies: ['JPY'] },
    { regex: new RegExp('(?:CNY|RMB)\\s?' + NUM, 'g'), currencies: ['CNY'] },
  ];

  let rates = {};
  let targetCurrency = 'USD';
  let enabled = true;
  let tooltip = null;
  let observer = null;
  let processedNodes = new WeakSet();

  function parseAmount(text) {
    // Remove currency symbols and codes
    let cleaned = text
      .replace(/US\$/g, '')
      .replace(/Rp\.?/g, '')
      .replace(/[$€£¥元]/g, '')
      .replace(/\b(?:USD|EUR|GBP|JPY|CNY|RMB|IDR)\b/g, '')
      .trim();

    // Detect and remove suffix multiplier (K, M, Mn, B, Bn)
    let multiplier = 1;
    const suffixMatch = cleaned.match(/([KkMmBb][Nn]?)\s*$/);
    if (suffixMatch) {
      const suffix = suffixMatch[1].toUpperCase();
      if (suffix === 'K') multiplier = 1_000;
      else if (suffix === 'M' || suffix === 'MN') multiplier = 1_000_000;
      else if (suffix === 'B' || suffix === 'BN') multiplier = 1_000_000_000;
      cleaned = cleaned.replace(/[KkMmBb][Nn]?\s*$/, '').trim();
    }

    // Handle dot-as-thousands format (IDR, etc.): 12.900.000 → 12900000
    // Pattern: digits with dots as separators and NO comma → dots are thousands
    if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
      cleaned = cleaned.replace(/\./g, '');
    }
    // Handle European format: 1.000,50 → 1000.50
    else if (/\d{1,3}\.\d{3}/.test(cleaned) && cleaned.includes(',')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
    return parseFloat(cleaned) * multiplier;
  }

  function formatCurrency(amount, currency) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: currency === 'JPY' ? 0 : 2,
        maximumFractionDigits: currency === 'JPY' ? 0 : 2,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  }

  function convert(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) return amount;
    if (rates[fromCurrency] && rates[fromCurrency][toCurrency]) {
      return amount * rates[fromCurrency][toCurrency];
    }
    return null;
  }

  function createTooltip() {
    if (tooltip) return;
    tooltip = document.createElement('div');
    tooltip.className = 'acc-tooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
  }

  function showTooltip(element, currencies, amount) {
    createTooltip();
    const lines = [];
    for (const fromCurrency of currencies) {
      if (fromCurrency === targetCurrency) {
        lines.push(`<div class="acc-tooltip-line">${formatCurrency(amount, fromCurrency)} <span class="acc-tooltip-note">(already ${targetCurrency})</span></div>`);
        continue;
      }
      const converted = convert(amount, fromCurrency, targetCurrency);
      if (converted !== null) {
        const label = currencies.length > 1 ? `<span class="acc-tooltip-label">If ${fromCurrency}:</span> ` : '';
        lines.push(`<div class="acc-tooltip-line">${label}${formatCurrency(converted, targetCurrency)}</div>`);
      } else {
        lines.push(`<div class="acc-tooltip-line acc-tooltip-error">Rate unavailable for ${fromCurrency}</div>`);
      }
    }

    tooltip.innerHTML = `
      <div class="acc-tooltip-header">Converted to ${targetCurrency}</div>
      ${lines.join('')}
    `;
    tooltip.style.display = 'block';

    // Position tooltip
    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    let top = rect.top - tooltipRect.height - 8;
    let left = rect.left + (rect.width - tooltipRect.width) / 2;

    // Flip below if not enough space above
    if (top < 4) {
      top = rect.bottom + 8;
    }
    // Keep within viewport horizontally
    left = Math.max(4, Math.min(left, window.innerWidth - tooltipRect.width - 4));

    tooltip.style.top = `${top + window.scrollY}px`;
    tooltip.style.left = `${left + window.scrollX}px`;
  }

  function hideTooltip() {
    if (tooltip) {
      tooltip.style.display = 'none';
    }
  }

  function processTextNode(textNode) {
    if (processedNodes.has(textNode)) return;

    const text = textNode.textContent;
    if (!text || text.trim().length === 0) return;

    // Skip script/style/input elements
    const parent = textNode.parentNode;
    if (!parent) return;
    const tagName = parent.tagName;
    if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'TEXTAREA' || tagName === 'INPUT' || tagName === 'NOSCRIPT') return;
    if (parent.classList && parent.classList.contains('acc-currency')) return;
    if (parent.classList && parent.classList.contains('acc-tooltip')) return;
    if (parent.isContentEditable) return;

    const matches = [];

    for (const pattern of CURRENCY_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;
      while ((match = regex.exec(text)) !== null) {
        const overlaps = matches.some(
          (m) => match.index < m.index + m.length && match.index + match[0].length > m.index
        );
        if (!overlaps) {
          matches.push({
            index: match.index,
            length: match[0].length,
            text: match[0],
            currencies: pattern.currencies,
            amount: parseAmount(match[0]),
          });
        }
      }
    }

    if (matches.length === 0) return;

    processedNodes.add(textNode);

    // Sort by position forward
    matches.sort((a, b) => a.index - b.index);

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    for (const match of matches) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
      }

      const span = document.createElement('span');
      span.className = 'acc-currency';
      span.textContent = match.text;
      span.dataset.currencies = JSON.stringify(match.currencies);
      span.dataset.amount = match.amount;

      span.addEventListener('mouseenter', () => {
        showTooltip(span, match.currencies, match.amount);
      });
      span.addEventListener('mouseleave', hideTooltip);

      fragment.appendChild(span);
      lastIndex = match.index + match.length;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    parent.replaceChild(fragment, textNode);
  }

  // Fallback: scan elements where currency symbol and amount are in separate child elements
  // e.g. <span>¥</span><span>600</span> inside a container
  let processedElements = new WeakSet();

  function scanElementText(element) {
    if (processedElements.has(element)) return;
    // Skip if already processed by text node pass
    if (element.querySelector('.acc-currency')) return;

    const text = element.textContent;
    if (!text || text.trim().length === 0) return;

    for (const pattern of CURRENCY_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      const match = regex.exec(text);
      if (match) {
        const amount = parseAmount(match[0]);
        if (isNaN(amount) || amount === 0) continue;

        processedElements.add(element);
        element.classList.add('acc-currency');
        element.dataset.accOriginal = 'true';
        element.dataset.currencies = JSON.stringify(pattern.currencies);
        element.dataset.amount = amount;

        element.addEventListener('mouseenter', () => {
          showTooltip(element, pattern.currencies, amount);
        });
        element.addEventListener('mouseleave', hideTooltip);
        return; // one match per element is enough
      }
    }
  }

  function scanDocument() {
    if (!document.body) return;

    // Pass 1: text node scanning (handles simple cases like "$100" in one text node)
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    textNodes.forEach(processTextNode);

    // Pass 2: element-level scanning for split structures
    // Look for small container elements whose textContent matches a currency pattern
    // but weren't caught by the text node pass
    const candidates = document.body.querySelectorAll(
      '[data-testid*="price"], [class*="price"], [class*="Price"], [class*="cost"], [class*="Cost"], [class*="amount"], [class*="Amount"], [class*="currency"], [class*="Currency"]'
    );
    candidates.forEach(scanElementText);

    // Also scan small leaf-ish elements (few children) that might contain split currency
    // This catches cases without semantic class names
    document.body.querySelectorAll('span, div, p, a, li, td, th, dt, dd, label').forEach((el) => {
      if (processedElements.has(el)) return;
      if (el.querySelector('.acc-currency')) return;
      // Only check small elements (avoid scanning huge containers)
      if (el.children.length > 10) return;
      if (el.textContent.length > 100) return;
      // Must have at least one child element (otherwise text node pass would have caught it)
      if (el.children.length === 0) return;
      scanElementText(el);
    });
  }

  function setupObserver() {
    if (!document.body) return;
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      if (!enabled) return;
      let hasNewNodes = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasNewNodes = true;
          break;
        }
      }
      if (hasNewNodes) {
        clearTimeout(setupObserver._timeout);
        setupObserver._timeout = setTimeout(scanDocument, 300);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function removeHighlights() {
    document.querySelectorAll('.acc-currency').forEach((el) => {
      if (el.dataset.accOriginal === undefined) {
        // This was a wrapped text node span we created — replace with text
        const textNode = document.createTextNode(el.textContent);
        el.parentNode.replaceChild(textNode, el);
      } else {
        // This was an existing element we tagged — just remove the class and listeners
        el.classList.remove('acc-currency');
        delete el.dataset.currencies;
        delete el.dataset.amount;
      }
    });
    processedNodes = new WeakSet();
    processedElements = new WeakSet();
    hideTooltip();
  }

  async function init() {
    try {
      const [settingsResponse, ratesResponse] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'getSettings' }),
        chrome.runtime.sendMessage({ type: 'getRates' }),
      ]);

      targetCurrency = settingsResponse.targetCurrency;
      enabled = settingsResponse.enabled;
      rates = ratesResponse.rates;

      if (enabled) {
        if (Object.keys(rates).length > 0) {
          scanDocument();
          setupObserver();
        } else {
          // Rates not ready yet — wait for them via storage change
          console.log('Auto Currency: waiting for exchange rates...');
          setupObserver();
        }
      }
    } catch (err) {
      console.error('Auto Currency: init failed', err);
    }

    // Listen for settings changes
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') {
        if (changes.targetCurrency) {
          targetCurrency = changes.targetCurrency.newValue;
          if (enabled) {
            removeHighlights();
            scanDocument();
          }
        }
        if (changes.enabled) {
          enabled = changes.enabled.newValue;
          if (enabled) {
            scanDocument();
            setupObserver();
          } else {
            removeHighlights();
            if (observer) observer.disconnect();
          }
        }
      }
      if (area === 'local' && changes.rates) {
        rates = changes.rates.newValue;
        if (enabled) {
          removeHighlights();
          scanDocument();
        }
      }
    });
  }

  init();
})();
