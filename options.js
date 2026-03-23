const SETTINGS_KEY = 'bm_settings';

const widthSlider  = document.getElementById('width-slider');
const fontSlider   = document.getElementById('font-slider');
const widthVal     = document.getElementById('width-val');
const fontVal      = document.getElementById('font-val');
const fontFamily   = document.getElementById('font-family');
const fontCustom   = document.getElementById('font-family-custom');
const fontPreview  = document.getElementById('font-preview');
const colorBg      = document.getElementById('color-bg');
const colorFolder  = document.getElementById('color-folder');
const colorLink    = document.getElementById('color-link');
const savedMsg     = document.getElementById('saved-msg');

const SYSTEM_FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Yu Gothic', Meiryo, sans-serif";

const FONT_OPTIONS = [
  { value: SYSTEM_FONT_STACK, label: 'システム標準' },
  { value: "'Yu Gothic UI', 'Yu Gothic', Meiryo, sans-serif", label: 'Yu Gothic / Meiryo' },
  { value: "Meiryo, 'MS PGothic', sans-serif", label: 'Meiryo' },
  { value: "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif", label: 'Hiragino Sans' },
  { value: "'BIZ UDPGothic', 'Yu Gothic UI', sans-serif", label: 'BIZ UDPGothic' },
  { value: 'custom', label: 'カスタム指定' },
];

const DEFAULTS = {
  popupWidth: 360,
  fontSize: 13,
  fontFamily: SYSTEM_FONT_STACK,
  colorBg: '#1e1e2e',
  colorFolder: '#89b4fa',
  colorLink: '#cdd6f4',
};

fontFamily.innerHTML = FONT_OPTIONS.map((option) => (
  `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`
)).join('');

// Load saved settings
chrome.storage.local.get([SETTINGS_KEY], (result) => {
  const s = Object.assign({}, DEFAULTS, result[SETTINGS_KEY] || {});
  widthSlider.value = s.popupWidth;
  fontSlider.value  = s.fontSize;
  syncFontControls(s.fontFamily);
  colorBg.value     = s.colorBg;
  colorFolder.value = s.colorFolder;
  colorLink.value   = s.colorLink;
  updateLabels();
  updateFontPreview();
});

widthSlider.addEventListener('input', updateLabels);
fontSlider.addEventListener('input',  updateLabels);
fontFamily.addEventListener('change', () => {
  toggleCustomFontInput();
  updateFontPreview();
});
fontCustom.addEventListener('input', updateFontPreview);

function updateLabels() {
  widthVal.textContent = widthSlider.value + ' px';
  fontVal.textContent  = fontSlider.value  + ' px';
}

function syncFontControls(savedFontFamily) {
  const matched = FONT_OPTIONS.find((option) => option.value !== 'custom' && option.value === savedFontFamily);
  if (matched) {
    fontFamily.value = matched.value;
    fontCustom.value = '';
  } else {
    fontFamily.value = 'custom';
    fontCustom.value = savedFontFamily || '';
  }
  toggleCustomFontInput();
}

function toggleCustomFontInput() {
  const isCustom = fontFamily.value === 'custom';
  fontCustom.classList.toggle('hidden', !isCustom);
}

function getSelectedFontFamily() {
  if (fontFamily.value === 'custom') {
    return fontCustom.value.trim() || DEFAULTS.fontFamily;
  }
  return fontFamily.value;
}

function updateFontPreview() {
  fontPreview.style.fontFamily = getSelectedFontFamily();
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Reset buttons
document.querySelectorAll('.btn-reset').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = document.getElementById(btn.dataset.target);
    target.value = btn.dataset.default;
  });
});

// Save
document.getElementById('btn-save').addEventListener('click', () => {
  const settings = {
    popupWidth:  parseInt(widthSlider.value),
    fontSize:    parseInt(fontSlider.value),
    fontFamily:  getSelectedFontFamily(),
    colorBg:     colorBg.value,
    colorFolder: colorFolder.value,
    colorLink:   colorLink.value,
  };
  chrome.storage.local.set({ [SETTINGS_KEY]: settings }, () => {
    savedMsg.classList.add('show');
    setTimeout(() => savedMsg.classList.remove('show'), 2000);
  });
});