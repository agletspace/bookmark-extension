const SETTINGS_KEY = 'bm_settings';

const widthSlider  = document.getElementById('width-slider');
const fontSlider   = document.getElementById('font-slider');
const widthVal     = document.getElementById('width-val');
const fontVal      = document.getElementById('font-val');
const colorBg      = document.getElementById('color-bg');
const colorFolder  = document.getElementById('color-folder');
const colorLink    = document.getElementById('color-link');
const savedMsg     = document.getElementById('saved-msg');

const DEFAULTS = {
  popupWidth: 360,
  fontSize: 13,
  colorBg: '#1e1e2e',
  colorFolder: '#89b4fa',
  colorLink: '#cdd6f4',
};

// Load saved settings
chrome.storage.local.get([SETTINGS_KEY], (result) => {
  const s = Object.assign({}, DEFAULTS, result[SETTINGS_KEY] || {});
  widthSlider.value = s.popupWidth;
  fontSlider.value  = s.fontSize;
  colorBg.value     = s.colorBg;
  colorFolder.value = s.colorFolder;
  colorLink.value   = s.colorLink;
  updateLabels();
});

widthSlider.addEventListener('input', updateLabels);
fontSlider.addEventListener('input',  updateLabels);

function updateLabels() {
  widthVal.textContent = widthSlider.value + ' px';
  fontVal.textContent  = fontSlider.value  + ' px';
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
    colorBg:     colorBg.value,
    colorFolder: colorFolder.value,
    colorLink:   colorLink.value,
  };
  chrome.storage.local.set({ [SETTINGS_KEY]: settings }, () => {
    savedMsg.classList.add('show');
    setTimeout(() => savedMsg.classList.remove('show'), 2000);
  });
});
