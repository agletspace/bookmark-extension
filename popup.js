const SETTINGS_KEY = 'bm_settings';
const OPEN_KEY = 'bm_open_folders';

const DEFAULTS = {
  popupWidth: 360,
  fontSize: 13,
  colorBg: '#1e1e2e',
  colorFolder: '#89b4fa',
  colorLink: '#cdd6f4',
};

let openFolders = new Set();
let faviconObserver = null;

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadSettings(), buildTree()]);
  document.addEventListener('click', removeCtxMenu);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') removeCtxMenu();
  });
});

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_KEY, OPEN_KEY], (result) => {
      const s = Object.assign({}, DEFAULTS, result[SETTINGS_KEY] || {});
      openFolders = new Set(result[OPEN_KEY] || []);

      document.body.style.fontSize = s.fontSize + 'px';
      document.body.style.width = s.popupWidth + 'px';
      document.body.style.maxHeight = '600px';

      const root = document.documentElement;
      root.style.setProperty('--bg', s.colorBg);
      root.style.setProperty('--bg2', adjustColor(s.colorBg, -10));
      root.style.setProperty('--folder', s.colorFolder);
      root.style.setProperty('--link', s.colorLink);
      resolve();
    });
  });
}

function adjustColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function saveOpenFolders() {
  chrome.storage.local.set({ [OPEN_KEY]: [...openFolders] });
}

async function buildTree() {
  isMoving = false;
  const treeEl = document.getElementById('tree');
  treeEl.innerHTML = '';
  ensureFaviconObserver();

  return new Promise((resolve) => {
    chrome.bookmarks.getTree((tree) => {
      const frag = document.createDocumentFragment();
      tree[0].children.forEach((child) => frag.appendChild(renderNode(child, 0)));
      treeEl.appendChild(frag);
      resolve();
    });
  });
}

function ensureFaviconObserver() {
  if (faviconObserver || typeof IntersectionObserver === 'undefined') return;
  faviconObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        const src = img.dataset.src;
        if (src && !img.src) img.src = src;
        faviconObserver.unobserve(img);
      });
    },
    { root: null, rootMargin: '120px', threshold: 0 }
  );
}

function createFaviconImg(domain, iconEl) {
  const img = document.createElement('img');
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.dataset.src =
    'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=16';
  img.onerror = () => {
    iconEl.textContent = '*';
  };
  if (faviconObserver) faviconObserver.observe(img);
  else img.src = img.dataset.src;
  return img;
}

function appendChildren(folderNode, depth, childrenEl) {
  if (childrenEl.dataset.loaded === '1') return;
  const frag = document.createDocumentFragment();
  (folderNode.children || []).forEach((child) => frag.appendChild(renderNode(child, depth + 1)));
  childrenEl.appendChild(frag);
  childrenEl.dataset.loaded = '1';
}

function renderNode(bm, depth) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node';
  wrapper.dataset.bmId = bm.id;
  wrapper.dataset.bmParentId = bm.parentId || '';

  const row = document.createElement('div');
  row.className = 'tree-row';
  row.style.paddingLeft = 8 + depth * 16 + 'px';

  const isFolder = !bm.url;

  const toggle = document.createElement('span');
  toggle.className = 'tree-toggle' + (isFolder ? '' : ' leaf');
  toggle.textContent = '▸';
  row.appendChild(toggle);

  const icon = document.createElement('span');
  icon.className = 'tree-icon';
  if (isFolder) {
    icon.textContent = '📁';
  } else {
    try {
      const domain = new URL(bm.url).hostname;
      const img = createFaviconImg(domain, icon);
      icon.appendChild(img);
    } catch (e) {
      icon.textContent = '*';
    }
  }
  row.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'tree-label ' + (isFolder ? 'is-folder' : 'is-link');
  label.textContent = bm.title || bm.url || 'Untitled';
  row.appendChild(label);

  wrapper.appendChild(row);

  let childrenEl = null;
  if (isFolder) {
    childrenEl = document.createElement('div');
    childrenEl.className = 'tree-children';
    const isOpen = openFolders.has(bm.id);
    if (!isOpen) {
      childrenEl.classList.add('collapsed');
    } else {
      toggle.classList.add('open');
      icon.textContent = '📂';
      appendChildren(bm, depth, childrenEl);
    }
    wrapper.appendChild(childrenEl);
  }

  row.addEventListener('click', (e) => {
    if (e.target.classList.contains('rename-input')) return;
    if (document.getElementById('ctx-menu')) return;

    if (isFolder) {
      const collapsed = childrenEl.classList.toggle('collapsed');
      toggle.classList.toggle('open', !collapsed);
      icon.textContent = collapsed ? '📁' : '📂';
      if (collapsed) {
        openFolders.delete(bm.id);
      } else {
        appendChildren(bm, depth, childrenEl);
        openFolders.add(bm.id);
      }
      saveOpenFolders();
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.update(tabs[0].id, { url: bm.url }, () => window.close());
      } else {
        chrome.tabs.update({ url: bm.url }, () => window.close());
      }
    });
  });

  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showCtxMenu(e, bm, isFolder, icon, label);
  });

  setupDrag(row, bm, isFolder);
  return wrapper;
}

// 笏笏笏 Drag (pointer-events based) 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
let dragState = null;
// dragState = { id, parentId, srcIndex, ghost, active }
let isMoving = false;

function setupDrag(row, bm, isFolder) {
  row.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.classList.contains('rename-input')) return;

    const startX = e.clientX, startY = e.clientY;
    let started = false;

    const onMove = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!started && Math.sqrt(dx*dx + dy*dy) < 5) return;

      if (!started) {
        started = true;
        // Create ghost
        const ghost = row.cloneNode(true);
        ghost.style.cssText = 'position:fixed;pointer-events:none;opacity:0.7;z-index:9999;' +
          'background:var(--bg2);border:1px solid var(--border);border-radius:4px;' +
          'padding:3px 8px;width:' + row.offsetWidth + 'px;font-size:inherit;';
        document.body.appendChild(ghost);
        row.classList.add('dragging');
        dragState = { id: bm.id, parentId: bm.parentId, srcIndex: bm.index, ghost, active: true };
      }

      if (dragState) {
        dragState.ghost.style.left = (ev.clientX + 20) + 'px';
        dragState.ghost.style.top  = (ev.clientY + 20) + 'px';
        updateDropIndicator(ev.clientX, ev.clientY);
      }
    };

    const onUp = (ev) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      if (!started || !dragState) return;

      row.classList.remove('dragging');
      dragState.ghost.remove();

      executeMove(ev.clientX, ev.clientY);
      dragState = null;
      clearIndicators();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// Find the row element at given coordinates (excluding ghost)
function getRowAt(x, y) {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    const row = el.closest('.tree-row');
    if (row && !row.classList.contains('dragging')) return row;
  }
  return null;
}

function updateDropIndicator(x, y) {
  clearIndicators();
  const row = getRowAt(x, y);
  if (!row) return;

  const wrapper = row.closest('.tree-node');
  if (!wrapper) return;

  // Don't indicate on self
  const bmId = wrapper.dataset ? wrapper.dataset.bmId : null;
  if (dragState && bmId === dragState.id) return;

  const rect = row.getBoundingClientRect();
  const relY = y - rect.top;
  const isFolder = row.querySelector('.tree-toggle:not(.leaf)') !== null;

  if (isFolder) {
    const q = rect.height / 4;
    if      (relY < q)               row.classList.add('drag-over-above');
    else if (relY > rect.height - q) row.classList.add('drag-over-below');
    else                             row.classList.add('drag-over-into');
  } else {
    if (relY < rect.height / 2) row.classList.add('drag-over-above');
    else                         row.classList.add('drag-over-below');
  }
}

function executeMove(x, y) {
  if (isMoving) return;
  isMoving = true;

  const row = getRowAt(x, y);
  if (!row || !dragState) {
    isMoving = false;
    return;
  }

  const wrapper = row.closest('.tree-node');
  if (!wrapper) {
    isMoving = false;
    return;
  }

  const rect = row.getBoundingClientRect();
  const relY = y - rect.top;
  const isFolderRow = row.querySelector('.tree-toggle:not(.leaf)') !== null;
  let above;
  let into;

  if (isFolderRow) {
    const q = rect.height / 4;
    above = relY < q;
    into = relY >= q && relY <= rect.height - q;
  } else {
    above = relY < rect.height / 2;
    into = false;
  }

  const tgtBmId = wrapper.dataset.bmId;
  if (!tgtBmId || tgtBmId === dragState.id) {
    isMoving = false;
    return;
  }

  const srcId = dragState.id;

  if (into) {
    chrome.bookmarks.move(srcId, { parentId: tgtBmId }, () => {
      isMoving = false;
      buildTree();
    });
    return;
  }

  chrome.bookmarks.get([srcId, tgtBmId], (results) => {
    if (!results || results.length < 2) {
      isMoving = false;
      return;
    }

    const srcBm = results.find((r) => r.id === srcId);
    const tgtBm = results.find((r) => r.id === tgtBmId);
    if (!srcBm || !tgtBm) {
      isMoving = false;
      return;
    }

    const tgtParent = tgtBm.parentId;
    const sameParent = srcBm.parentId === tgtParent;

    if (!sameParent) {
      const finalIdx = above ? tgtBm.index : tgtBm.index + 1;
      chrome.bookmarks.move(srcId, { parentId: tgtParent, index: Math.max(0, finalIdx) }, () => {
        isMoving = false;
        buildTree();
      });
      return;
    }

    chrome.bookmarks.getChildren(tgtParent, (siblings) => {
      if (!siblings) {
        isMoving = false;
        return;
      }

      const srcIdx = siblings.findIndex((s) => s.id === srcId);
      const tgtIdx = siblings.findIndex((s) => s.id === tgtBmId);
      if (srcIdx < 0 || tgtIdx < 0) {
        isMoving = false;
        return;
      }

      let finalIdx;
      if (above) {
        finalIdx = srcIdx < tgtIdx ? tgtIdx - 1 : tgtIdx;
      } else {
        finalIdx = srcIdx < tgtIdx ? tgtIdx + 1 : tgtIdx + 1;
      }

      chrome.bookmarks.move(srcId, { parentId: tgtParent, index: Math.max(0, finalIdx) }, () => {
        isMoving = false;
        buildTree();
      });
    });
  });
}

function clearIndicators() {
  document.querySelectorAll('.drag-over-above, .drag-over-below, .drag-over-into')
    .forEach(el => el.classList.remove('drag-over-above', 'drag-over-below', 'drag-over-into'));
}

// 笏笏笏 Context Menu 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
function showCtxMenu(e, bm, isFolder, icon, label) {
  removeCtxMenu();
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.id = 'ctx-menu';

  const items = [];
  if (!isFolder) {
    items.push({ icon: '↗', text: 'Open New Tab', action: () => chrome.tabs.create({ url: bm.url }) });
    items.push({
      icon: '⧉',
      text: 'Copy URL',
      action: () => {
        navigator.clipboard.writeText(bm.url);
        showToast('URL copied');
      },
    });
    items.push({ icon: '✎', text: 'Rename', action: () => startRename(bm, label) });
    items.push({ icon: '🗑', text: 'Delete', danger: true, action: () => confirmDelete(bm, isFolder) });
  } else {
    items.push({ icon: '✎', text: 'Rename', action: () => startRename(bm, label) });
    items.push({ icon: '🗑', text: 'Delete', danger: true, action: () => confirmDelete(bm, isFolder) });
  }

  items.forEach((item) => {
    if (item.sep) {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.appendChild(sep);
      return;
    }

    const el = document.createElement('div');
    el.className = 'ctx-item' + (item.danger ? ' danger' : '');
    const iconEl = document.createElement('span');
    iconEl.className = 'ctx-icon';
    iconEl.textContent = item.icon || '';
    const textEl = document.createElement('span');
    textEl.textContent = item.text;
    el.appendChild(iconEl);
    el.appendChild(textEl);
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      removeCtxMenu();
      item.action();
    });
    menu.appendChild(el);
  });

  document.body.appendChild(menu);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = e.clientX;
  let y = e.clientY;
  if (x + 180 > vw) x = vw - 185;
  if (y + menu.offsetHeight + 10 > vh) y = vh - menu.offsetHeight - 10;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

function removeCtxMenu() {
  const m = document.getElementById('ctx-menu');
  if (m) m.remove();
}

// 笏笏笏 Rename 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
function startRename(bm, labelEl) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = bm.title || '';
  labelEl.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== bm.title) {
      chrome.bookmarks.update(bm.id, { title: newTitle }, () => buildTree());
    } else {
      input.replaceWith(labelEl);
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { input.replaceWith(labelEl); }
  });
  input.addEventListener('blur', commit);
}

// 笏笏笏 Create Folder 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
function createFolder(parentId) {
  showModal({
    title: 'Create Folder',
    placeholder: 'Folder name',
    confirmText: 'Create',
    onConfirm: (name) => {
      if (!name.trim()) return;
      chrome.bookmarks.create({ parentId, title: name.trim() }, () => {
        openFolders.add(parentId);
        saveOpenFolders();
        buildTree();
      });
    },
  });
}

// 笏笏笏 Delete 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
function confirmDelete(bm, isFolder) {
  const label = isFolder ? 'Folder: ' + bm.title : 'Bookmark: ' + (bm.title || bm.url);
  showConfirm({
    message: label + ' - delete this item?',
    onConfirm: () => {
      if (isFolder) chrome.bookmarks.removeTree(bm.id, () => buildTree());
      else chrome.bookmarks.remove(bm.id, () => buildTree());
    },
  });
}

// 笏笏笏 Modal helpers 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
function showModal({ title, placeholder, confirmText, onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal">' +
      '<div class="modal-title">' + title + '</div>' +
      '<input type="text" class="modal-input" placeholder="' + placeholder + '" />' +
      '<div class="modal-actions">' +
        '<button class="modal-btn secondary">Cancel</button>' +
        '<button class="modal-btn primary">' + confirmText + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  const input = overlay.querySelector('.modal-input');
  input.focus();
  overlay.querySelectorAll('.modal-btn')[0].addEventListener('click', () => overlay.remove());
  overlay.querySelectorAll('.modal-btn')[1].addEventListener('click', () => {
    onConfirm(input.value);
    overlay.remove();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      onConfirm(input.value);
      overlay.remove();
    }
    if (e.key === 'Escape') overlay.remove();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function showConfirm({ message, onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal">' +
      '<div class="modal-title">Confirm</div>' +
      '<div class="modal-body">' + message + '</div>' +
      '<div class="modal-actions">' +
        '<button class="modal-btn secondary">Cancel</button>' +
        '<button class="modal-btn danger-btn">Delete</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.querySelectorAll('.modal-btn')[0].addEventListener('click', () => overlay.remove());
  overlay.querySelectorAll('.modal-btn')[1].addEventListener('click', () => {
    onConfirm();
    overlay.remove();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// 笏笏笏 Toast 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}











