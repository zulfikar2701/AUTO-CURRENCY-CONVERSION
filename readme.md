<p align="center">
  <img src="/icons/logo.svg" alt="Auto Currency Conversion" width="600"/>
</p>

# Auto Currency Conversion

This project is vibe-coded by Claude Opus 4.6

A browser extension for Chrome and Edge that detects currencies on any webpage and shows converted amounts when you hover over them.

Supports USD ($), EUR (€), GBP (£), JPY (¥), and CNY (¥/元) with conversion to any of 20 popular target currencies.

## Features

- Automatic detection of currency amounts on any webpage
- Hover tooltip showing the converted value in your chosen currency
- Handles common formats: `$1,000.50`, `€100`, `1.000,50€`, `¥10,000`, `£77M`, `$1.5B`
- Works with shorthand suffixes (K, M, B) for thousands, millions, and billions
- Handles pages where the currency symbol and amount are in separate HTML elements
- Exchange rates sourced from the European Central Bank via [frankfurter.app](https://www.frankfurter.app/), updated every 6 hours
- No API key required

## Supported Target Currencies

USD, EUR, GBP, JPY, CNY, IDR, SGD, MYR, THB, PHP, VND, KRW, INR, TWD, HKD, AUD, CAD, NZD, CHF, SEK

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge)
3. Enable **Developer mode** in the top right corner
4. Click **Load unpacked** and select the project folder

## Usage

Once installed, the extension runs automatically on all pages.

- Currency amounts on a page will appear with a **dotted underline**
- **Hover** over any underlined amount to see the converted value
- Click the **extension icon** in the toolbar to:
  - Change your target currency
  - Turn the extension on or off

When `¥` is detected, both JPY and CNY conversions are shown since the symbol is shared.

## Project Structure

```
├── manifest.json     Extension configuration (Manifest V3)
├── background.js     Service worker for fetching and caching exchange rates
├── content.js        Page scanning, currency detection, and tooltip logic
├── content.css       Styling for underlines and tooltips
├── popup.html        Extension popup interface
├── popup.js          Popup logic
├── popup.css         Popup styling
└── icons/            Extension icons
```

## Notes

- Exchange rates are cached locally and refreshed every 6 hours
- The extension requires no special permissions beyond storage and access to the frankfurter.app API
- Rates are provided by the European Central Bank — there may be slight differences compared to live market rates

## License

MIT
