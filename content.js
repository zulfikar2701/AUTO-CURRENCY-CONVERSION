(() => {
  const CURRENCY_PATTERNS = [
    // USD: $100, $ 1,000.50, US$500
    { regex: /US\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/g, currencies: ['USD'] },
    { regex: /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/g, currencies: ['USD'] },
    // EUR: €100, 100€, 1.000,50€
    { regex: /€\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?/g, currencies: ['EUR'] },
    { regex: /\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?\s?€/g, currencies: ['EUR'] },
    // GBP: £100, £1,000.50
    { regex: /£\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/g, currencies: ['GBP'] },
    // JPY/CNY ambiguous: ¥100, ¥1,000
    { regex: /¥\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/g, currencies: ['JPY', 'CNY'] },
    // CNY specific: 元
    { regex: /\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\s?元/g, currencies: ['CNY'] },
    // Explicit currency codes: USD 100, EUR 1,000.50, etc.
    { regex: /USD\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/g, currencies: ['USD'] },
    { regex: /EUR\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?/g, currencies: ['EUR'] },
    { regex: /GBP\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/g, currencies: ['GBP'] },
    { regex: /JPY\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/g, currencies: ['JPY'] },
    { regex: /(?:CNY|RMB)\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/g, currencies: ['CNY'] },
  ];

  let rates = {};
  let targetCurrency = 'USD';
  let enabled = true;
  let tooltip = null;
  let observer = null;
  let processedNodes = new WeakSet();

  function parseAmount(text) {
    // Remove currency symbols and codes
    let cleaned = text.replace(/[US$€£¥元]/g, '').replace(/USD|EUR|GBP|JPY|CNY|RMB/g, '').trim();
    // Handle European format: 1.000,50 → 1000.50
    if (/\d{1,3}\.\d{3}/.test(cleaned) && cleaned.includes(',')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
    return parseFloat(cleaned);
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
    if (!parent || parent.closest('script, style, textarea, input, .acc-currency, .acc-tooltip')) return;
    if (parent.isContentEditable) return;

    const matches = [];

    for (const pattern of CURRENCY_PATTERNS) {
      // Reset regex lastIndex
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;
      while ((match = regex.exec(text)) !== null) {
        // Skip if this range overlaps with an existing match
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

    // Sort by position (reverse to process from end to start)
    matches.sort((a, b) => b.index - a.index);

    processedNodes.add(textNode);

    const fragment = document.createDocumentFragment();
    let remainingText = text;

    // Rebuild from the sorted matches (reversed)
    const forwardMatches = [...matches].reverse();
    let lastIndex = 0;

    for (const match of forwardMatches) {
      // Add text before this match
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(remainingText.substring(lastIndex, match.index)));
      }

      // Create wrapped span
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

    // Add remaining text
    if (lastIndex < remainingText.length) {
      fragment.appendChild(document.createTextNode(remainingText.substring(lastIndex)));
    }

    parent.replaceChild(fragment, textNode);
  }

  function scanDocument() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          if (processedNodes.has(node)) return NodeFilter.FILTER_REJECT;
          const parent = node.parentNode;
          if (parent && parent.closest('script, style, textarea, input, .acc-currency, .acc-tooltip')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    textNodes.forEach(processTextNode);
  }

  function setupObserver() {
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
        // Debounce scanning
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
    document.querySelectorAll('.acc-currency').forEach((span) => {
      const textNode = document.createTextNode(span.textContent);
      span.parentNode.replaceChild(textNode, span);
    });
    processedNodes = new WeakSet();
    hideTooltip();
  }

  async function init() {
    // Get settings and rates
    const [settingsResponse, ratesResponse] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'getSettings' }),
      chrome.runtime.sendMessage({ type: 'getRates' }),
    ]);

    targetCurrency = settingsResponse.targetCurrency;
    enabled = settingsResponse.enabled;
    rates = ratesResponse.rates;

    if (enabled && Object.keys(rates).length > 0) {
      scanDocument();
      setupObserver();
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
