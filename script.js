// ==UserScript==
// @name         ShoppingPad
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Slows down impulse buying. Accumulate, consider, decide.
// @author       anrinion
// @match        https://www.amazon.com/*
// @match        https://www.amazon.de/*
// @match        https://www.amazon.co.uk/*
// @match        https://www.amazon.fr/*
// @match        https://www.amazon.it/*
// @match        https://www.amazon.es/*
// @match        https://www.amazon.ca/*
// @match        https://www.amazon.com.mx/*
// @match        https://www.amazon.com.br/*
// @match        https://www.amazon.in/*
// @match        https://www.amazon.co.jp/*
// @match        https://www.amazon.com.au/*
// @match        https://www.amazon.nl/*
// @match        https://www.amazon.pl/*
// @match        https://www.amazon.se/*
// @match        https://www.amazon.sa/*
// @match        https://www.amazon.eg/*
// @match        https://www.amazon.ae/*
// @match        https://www.amazon.tr/*
// @match        https://www.amazon.be/*
// @match        https://www.amazon.sg/*
// @match        https://www.amazon.co.za/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    /* ---------- CONFIG ---------- */
    const DEFAULT_MAX_VISITS = 3;
    const DEFAULT_SESSION_DURATION_MS = 3600000; // 1 hour

    /* ---------- STORAGE KEYS ---------- */
    const SK = {
        COUNT: 'ab_visit_count',
        WEEK: 'ab_week_number',
        LIST: 'ab_shopping_list',
        MAX: 'ab_max_visits',
        THEME: 'ab_theme',
        SESSION_START: 'ab_session_start',
        SESSION_DURATION: 'ab_session_duration_ms'
    };

    /* ---------- UNIFIED ASYNC STORAGE ---------- */
    const isTampermonkey = typeof GM_getValue !== 'undefined';

    async function storageGet(key, defaultValue) {
        if (isTampermonkey) {
            const value = GM_getValue(key, defaultValue);
            return value;
        } else {
            return new Promise((resolve) => {
                chrome.storage.local.get([key], (result) => {
                    resolve(result[key] !== undefined ? result[key] : defaultValue);
                });
            });
        }
    }

    async function storageSet(key, value) {
        if (isTampermonkey) {
            GM_setValue(key, value);
            return Promise.resolve();
        } else {
            return new Promise((resolve) => {
                chrome.storage.local.set({ [key]: value }, resolve);
            });
        }
    }

    /* ---------- WEEK ---------- */
    function getWeekKey() {
        const now = new Date();
        const day = now.getDay();
        const diff = (day + 6) % 7;
        const monday = new Date(now);
        monday.setDate(now.getDate() - diff);
        monday.setHours(0, 0, 0, 0);
        return monday.toISOString().split('T')[0];
    }

    async function resetIfNewWeek() {
        try {
            const cur = getWeekKey();
            const storedWeek = await storageGet(SK.WEEK, '');
            if (storedWeek !== cur) {
                await storageSet(SK.COUNT, '0');
                await storageSet(SK.WEEK, cur);
            }
        } catch (e) {
            console.error('Storage error', e);
        }
    }

    function daysUntilMonday() {
        const day = new Date().getDay();
        return (8 - day) % 7 || 7;
    }

    /* ---------- SESSION SETTINGS ---------- */
    async function getMax() {
        const val = await storageGet(SK.MAX, DEFAULT_MAX_VISITS);
        return parseInt(val, 10);
    }
    async function setMax(n) {
        await storageSet(SK.MAX, n);
    }

    async function getSessionDuration() {
        const val = await storageGet(SK.SESSION_DURATION, DEFAULT_SESSION_DURATION_MS);
        return parseInt(val, 10);
    }
    async function setSessionDuration(durationMs) {
        await storageSet(SK.SESSION_DURATION, durationMs);
    }

    async function getCount() {
        const val = await storageGet(SK.COUNT, '0');
        return parseInt(val, 10);
    }
    async function getRemaining() {
        const max = await getMax();
        const count = await getCount();
        return Math.max(0, max - count);
    }
    async function isBlocked() {
        return (await getRemaining()) === 0;
    }
    async function consume() {
        const count = await getCount();
        await storageSet(SK.COUNT, count + 1);
    }

    /* ---------- SESSION ---------- */
    async function startSession() {
        await storageSet(SK.SESSION_START, Date.now().toString());
    }
    async function isSessionActive() {
        const start = await storageGet(SK.SESSION_START, null);
        if (!start) return false;
        const duration = await getSessionDuration();
        const now = Date.now();
        return (now - parseInt(start, 10)) < duration;
    }

    /* ---------- LIST ---------- */
    async function getList() {
        const list = await storageGet(SK.LIST, '[]');
        return JSON.parse(list);
    }
    async function saveList(l) {
        await storageSet(SK.LIST, JSON.stringify(l));
    }
    async function addItem(text) {
        if (!text.trim()) return false;
        const l = await getList();
        l.push({ text: text.trim(), added: new Date().toISOString(), checked: false });
        await saveList(l);
        return true;
    }
    async function removeItem(i) {
        const l = await getList();
        l.splice(i, 1);
        await saveList(l);
    }
    async function toggleItemCheck(i) {
        const l = await getList();
        l[i].checked = !l[i].checked;
        await saveList(l);
    }
    const fmtDate = iso => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });

    /* ---------- THEME ---------- */
    async function getTheme() {
        return await storageGet(SK.THEME, 'light');
    }
    async function setTheme(t) {
        await storageSet(SK.THEME, t);
    }
    async function applyTheme() {
        const theme = await getTheme();
        document.documentElement.setAttribute('data-ab-theme', theme);
    }
    async function toggleTheme() {
        const current = await getTheme();
        const next = current === 'light' ? 'dark' : 'light';
        await setTheme(next);
        await applyTheme();
        // Update existing UI elements
        document.querySelectorAll('.ab-pill').forEach(btn => {
            if (btn.id === 'ab-theme-btn') btn.textContent = next === 'light' ? '☽ Dark' : '☀ Light';
        });
        document.querySelectorAll('.ab-add input').forEach(input => {
            input.style.backgroundColor = 'var(--input)';
        });
    }

    /* ---------- CSS INJECTION ---------- */
    const cssText = `
@import url('https://fonts.googleapis.com/css2?family=Inter:400;500;600;700&display=swap');

/* Hide body until overlay is ready – prevents flicker */
body.ab-hide-content {
    visibility: hidden !important;
}

:root[data-ab-theme="light"] {
    --page: #e4e4e9;
    --surface: #fff;
    --surface2: #f4f4f8;
    --border: #dddde6;
    --text-hi: #111114;
    --text-mid: #70707a;
    --text-lo: #b0b0bc;
    --accent: #0066cc;
    --accent-lo: #e6f0fd;
    --danger: #c62828;
    --input: #ffffff;
    --shadow: 0 24px 60px rgba(0, 0, 0, .14), 0 4px 12px rgba(0, 0, 0, .06);
}

:root[data-ab-theme="dark"] {
    --page: #09090b;
    --surface: #18181b;
    --surface2: #27272a;
    --border: #3f3f46;
    --text-hi: #fafafa;
    --text-mid: #a1a1aa;
    --text-lo: #52525b;
    --accent: #60a5fa;
    --accent-lo: #172554;
    --danger: #f87171;
    --input: #27272a;
    --shadow: 0 24px 60px rgba(0, 0, 0, .5), 0 4px 12px rgba(0, 0, 0, .3);
}

#ab-overlay {
    position: fixed;
    inset: 0;
    z-index: 999999;
    background: var(--page);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: Inter, system-ui;
}

.ab-card {
    width: 100%;
    max-width: 480px;
    background: var(--surface);
    border-radius: 18px;
    box-shadow: var(--shadow);
    overflow: hidden;
}

.ab-top {
    display: flex;
    justify-content: space-between;
    padding: 14px 20px;
    background: var(--surface2);
    border-bottom: 1px solid var(--border);
}

.ab-word {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-lo);
}

.ab-pill {
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    cursor: pointer;
    background: var(--surface);
    color: var(--text-mid);
}

.ab-pill:hover {
    background: var(--surface);
    border-color: var(--text-lo);
    color: var(--text-hi);
}

.ab-body {
    padding: 28px;
}

.ab-eyebrow {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--accent);
}

.ab-heading {
    font-size: 28px;
    font-weight: 700;
    margin: 10px 0;
    color: var(--text-hi);
}

.ab-heading.blocked {
    color: var(--danger);
}

.ab-sub {
    font-size: 14px;
    color: var(--text-mid);
    margin-bottom: 20px;
    line-height: 1.5;
}

.ab-chip {
    display: inline-flex;
    gap: 8px;
    background: var(--accent-lo);
    padding: 6px 14px;
    border-radius: 999px;
    margin-bottom: 20px;
    color: var(--text-mid);
}

.ab-chip b {
    color: var(--accent);
}

.ab-btn {
    width: 100%;
    padding: 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: transparent;
    cursor: pointer;
    margin-bottom: 20px;
    color: var(--text-mid);
}

.ab-btn:hover {
    background: var(--surface2);
    border-color: var(--text-lo);
    color: var(--text-hi);
}

.ab-sec {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-lo);
    margin-bottom: 8px;
}

.ab-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.ab-item {
    display: flex;
    gap: 8px;
    padding: 8px;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--text-hi);
}

.ab-item span:first-child {
    flex: 1;
}

.ab-item .item-text {
    flex: 1;
}

.ab-item button {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-lo);
    width: 20px;
    height: 20px;
    line-height: 1;
}

.ab-item button:hover {
    color: var(--danger);
}

.ab-item.checked .item-text {
    text-decoration: line-through;
    color: var(--text-lo);
}

.ab-add {
    display: flex;
    gap: 6px;
    margin-top: 6px;
}

.ab-add input {
    flex: 1;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--input);
    color: var(--text-hi);
    outline: none;
    font-family: inherit;
    transition: border-color 0.15s, box-shadow 0.15s;
}

.ab-add input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-lo);
}

.ab-add button {
    padding: 0 16px;
    border: none;
    border-radius: 8px;
    background: var(--accent);
    color: #fff;
    cursor: pointer;
    font-weight: 600;
}

#ab-widget-icon {
    position: fixed;
    bottom: 18px;
    right: 18px;
    width: 44px;
    height: 44px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 999999;
    color: var(--text-mid);
    font-size: 18px;
}

#ab-widget-panel {
    position: fixed;
    bottom: 72px;
    right: 18px;
    width: 320px;
    display: none;
    z-index: 999999;
}

/* Settings Modal */
#ab-settings-modal {
    position: fixed;
    inset: 0;
    z-index: 1000000;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: Inter, system-ui;
}

.ab-modal-card {
    background: var(--surface);
    border-radius: 18px;
    box-shadow: var(--shadow);
    width: 320px;
    padding: 24px;
}

.ab-modal-card h3 {
    margin-top: 0;
    margin-bottom: 16px;
    color: var(--text-hi);
}

.ab-modal-field {
    margin-bottom: 16px;
}

.ab-modal-field label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    margin-bottom: 6px;
    color: var(--text-mid);
}

.ab-modal-field input {
    width: 100%;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--input);
    color: var(--text-hi);
    font-family: inherit;
}

.ab-modal-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 20px;
}

.ab-modal-actions button {
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface2);
    cursor: pointer;
    color: var(--text-hi);
}

.ab-modal-actions button:first-child {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
}

.ab-modal-actions button:first-child:hover {
    background: var(--accent);
    filter: brightness(0.9);
}

.ab-modal-actions button:hover {
    background: var(--surface);
}
`;

    function injectCSS() {
        if (typeof GM_addStyle !== 'undefined') {
            GM_addStyle(cssText);
        } else {
            const style = document.createElement('style');
            style.textContent = cssText;
            document.documentElement.appendChild(style);
        }
    }

    /* ---------- SHARED CARD BUILDER (ASYNC) ---------- */
    async function buildCard(blocked, compact = false) {
        const theme = await getTheme();
        const max = await getMax();
        const remaining = await getRemaining();

        const card = document.createElement('div');
        card.className = 'ab-card';

        const top = document.createElement('div');
        top.className = 'ab-top';
        top.innerHTML = `
            <span class="ab-word">ShoppingPad</span>
            <div style="display: flex; gap: 8px;">
                <button class="ab-pill" id="ab-theme-btn">${theme === 'light' ? '☽ Dark' : '☀ Light'}</button>
                <button class="ab-pill" id="ab-settings-btn">⚙️</button>
            </div>
        `;

        const body = document.createElement('div');
        body.className = 'ab-body';

        if (!compact) {
            body.innerHTML += `
                <div class="ab-eyebrow">${blocked ? 'Access restricted' : 'Checkpoint'}</div>
                <div class="ab-heading ${blocked ? 'blocked' : ''}">
                ${blocked ? 'Done for the week.' : 'Start a shopping session?'}
                </div>
                <div class="ab-sub">
                ${blocked
                    ? `You've used your ${max} shopping sessions this week. You can still put things down here and buy them when your sessions reset.`
                    : `You have ${remaining} sessions left this week. You can browse now, or just leave items on the pad to buy everything at once later.`}
                </div>
                <div class="ab-chip">
                <span>${blocked ? 'Resets in' : 'Sessions left'}</span>
                <b>${blocked ? daysUntilMonday() + ' days' : remaining + ' of ' + max}</b>
                </div>
                ${!blocked ? '<button class="ab-btn">Start shopping session</button>' : ''}
                <div class="ab-sec">Your pad</div>
            `;
        } else {
            body.innerHTML += `<div class="ab-sec">Shopping list</div>`;
        }

        const listWrap = document.createElement('div');
        const inputElement = await buildList(listWrap, compact);
        body.appendChild(listWrap);

        card.append(top, body);

        // Theme button
        const themeBtn = top.querySelector('#ab-theme-btn');
        if (themeBtn) {
            themeBtn.onclick = async (e) => {
                e.preventDefault();
                await toggleTheme();
            };
        }

        // Settings button
        const settingsBtn = top.querySelector('#ab-settings-btn');
        if (settingsBtn) {
            settingsBtn.onclick = (e) => {
                e.preventDefault();
                showSettingsModal();
            };
        }

        if (!blocked && !compact) {
            const startBtn = body.querySelector('.ab-btn');
            if (startBtn) {
                startBtn.onclick = async () => {
                    await consume();
                    await startSession();
                    await refreshUI(); // Refresh the UI after starting session
                };
            }
        }

        if (compact && inputElement) {
            setTimeout(() => inputElement.focus(), 0);
        }

        return card;
    }

    /* ---------- SETTINGS MODAL ---------- */
    async function showSettingsModal() {
        // Remove existing modal if any
        const existing = document.getElementById('ab-settings-modal');
        if (existing) existing.remove();

        const max = await getMax();
        const durationMs = await getSessionDuration();
        const durationMin = Math.round(durationMs / 60000);

        const modal = document.createElement('div');
        modal.id = 'ab-settings-modal';
        modal.innerHTML = `
            <div class="ab-modal-card">
                <h3>Settings</h3>
                <div class="ab-modal-field">
                    <label>Max sessions per week</label>
                    <input type="number" id="ab-max-sessions" min="1" value="${max}" step="1">
                </div>
                <div class="ab-modal-field">
                    <label>Session length (minutes)</label>
                    <input type="number" id="ab-session-length" min="1" value="${durationMin}" step="1">
                </div>
                <div class="ab-modal-actions">
                    <button id="ab-save-settings">Save</button>
                    <button id="ab-cancel-settings">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const saveBtn = modal.querySelector('#ab-save-settings');
        const cancelBtn = modal.querySelector('#ab-cancel-settings');

        saveBtn.onclick = async () => {
            const newMax = parseInt(modal.querySelector('#ab-max-sessions').value, 10);
            const newLengthMin = parseInt(modal.querySelector('#ab-session-length').value, 10);
            const newDurationMs = newLengthMin * 60000;

            if (isNaN(newMax) || newMax < 1) return;
            if (isNaN(newLengthMin) || newLengthMin < 1) return;

            await setMax(newMax);
            await setSessionDuration(newDurationMs);

            modal.remove();
            await refreshUI();
        };

        cancelBtn.onclick = () => {
            modal.remove();
        };
    }

    /* ---------- LIST BUILDER (ASYNC) ---------- */
    async function buildList(container, compact = false) {
        container.innerHTML = '';
        const list = await getList();

        const wrap = document.createElement('div');
        wrap.className = 'ab-list';

        if (!list.length) {
            wrap.innerHTML = '<div style="text-align:center;color:var(--text-lo);padding:10px;border:1px dashed var(--border);border-radius:10px">Nothing here yet.</div>';
        } else {
            for (let i = 0; i < list.length; i++) {
                const item = list[i];
                const row = document.createElement('div');
                row.className = 'ab-item';

                if (item.checked) {
                    row.classList.add('checked');
                }

                let checkboxHtml = '';
                if (compact) {
                    checkboxHtml = `<input type="checkbox" class="ab-checkbox" style="cursor:pointer;" ${item.checked ? 'checked' : ''}>`;
                }

                row.innerHTML = `
${checkboxHtml}
<span class="item-text">${escapeHtml(item.text)}</span>
<span style="font-size:11px;color:var(--text-lo)">${fmtDate(item.added)}</span>
<button>×</button>
`;

                if (compact) {
                    const cb = row.querySelector('.ab-checkbox');
                    cb.addEventListener('change', async () => {
                        await toggleItemCheck(i);
                        if (cb.checked) row.classList.add('checked');
                        else row.classList.remove('checked');
                    });
                }

                row.querySelector('button').onclick = async () => {
                    await removeItem(i);
                    await buildList(container, compact);
                };
                wrap.appendChild(row);
            }
        }

        container.appendChild(wrap);

        const add = document.createElement('div');
        add.className = 'ab-add';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Add to list…';
        input.style.backgroundColor = 'var(--input)';

        const btn = document.createElement('button');
        btn.textContent = 'Add';

        const handleAdd = async () => {
            if (await addItem(input.value)) {
                input.value = '';
                const newInput = await buildList(container, compact);
                if (newInput) {
                    newInput.focus();
                }
            }
        };

        btn.onclick = (e) => {
            e.preventDefault();
            handleAdd();
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
            }
        });

        add.append(input, btn);
        container.appendChild(add);

        return input;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /* ---------- OVERLAY (ASYNC) ---------- */
    async function showOverlay(blocked) {
        const existingOverlay = document.getElementById('ab-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }

        const o = document.createElement('div');
        o.id = 'ab-overlay';
        const card = await buildCard(blocked, false);
        o.appendChild(card);
        document.body.appendChild(o);
    }

    /* ---------- WIDGET (ASYNC) ---------- */
    let panel;

    async function createWidget() {
        if (document.getElementById('ab-widget-icon')) return;

        const icon = document.createElement('div');
        icon.id = 'ab-widget-icon';
        icon.textContent = '⊟';
        icon.onclick = togglePanel;

        panel = document.createElement('div');
        panel.id = 'ab-widget-panel';

        document.body.append(icon, panel);
    }

    async function togglePanel() {
        if (panel.style.display === 'block') {
            panel.style.display = 'none';
        } else {
            panel.innerHTML = '';
            const card = await buildCard(false, true);
            panel.appendChild(card);
            panel.style.display = 'block';
        }
    }

    /* ---------- REFRESH UI ---------- */
    async function refreshUI() {
        // Remove existing overlay and widget
        const overlay = document.getElementById('ab-overlay');
        if (overlay) overlay.remove();
        const icon = document.getElementById('ab-widget-icon');
        if (icon) icon.remove();
        const panelDiv = document.getElementById('ab-widget-panel');
        if (panelDiv) panelDiv.remove();

        // Re-run the main logic
        await run();
    }

    /* ---------- INIT (ASYNC) ---------- */
    async function run() {
        await resetIfNewWeek();
        await applyTheme();

        const active = await isSessionActive();
        const blocked = await isBlocked();

        if (active) {
            await createWidget();
        } else if (blocked) {
            await showOverlay(true);
        } else {
            await showOverlay(false);
        }
    }

    // 1. Hide the page immediately (style will be removed after UI is ready)
    const styleHide = document.createElement('style');
    styleHide.textContent = `body { visibility: hidden !important; }`;
    document.documentElement.appendChild(styleHide);

    // 2. Inject CSS
    injectCSS();

    // 3. Wait for DOM ready, then run async init and finally reveal the page
    async function initAndReveal() {
        try {
            await run();               // this adds overlay or widget (async)
        } catch (err) {
            console.error('ShoppingPad init error:', err);
        } finally {
            // Now the UI is in place – remove the global hiding style
            styleHide.remove();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initAndReveal();
        });
    } else {
        initAndReveal();
    }
})();