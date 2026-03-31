// ==UserScript==
// @name         ShoppingPad
// @namespace    http://tampermonkey.net/
// @version      1.3
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
// @grant        GM_addStyle
// @run-at       document-start
// @license      MIT 
// ==/UserScript==

(function () {
    'use strict';

    /* ---------- CONFIG ---------- */
    const DEFAULT_MAX_VISITS = 3;
    const SESSION_DURATION = 3600000; // 1 hour in milliseconds

    /* ---------- STORAGE ---------- */
    const SK = {
        COUNT: 'ab_visit_count',
        WEEK: 'ab_week_number',
        LIST: 'ab_shopping_list',
        MAX: 'ab_max_visits',
        THEME: 'ab_theme',
        SESSION_START: 'ab_session_start'
    };

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

    function resetIfNewWeek() {
        try {
            const cur = getWeekKey();
            if (localStorage.getItem(SK.WEEK) !== cur) {
                localStorage.setItem(SK.COUNT, '0');
                localStorage.setItem(SK.WEEK, cur);
            }
        } catch (e) {
            console.error('Storage error', e);
        }
    }

    function daysUntilMonday() {
        const day = new Date().getDay();
        return (8 - day) % 7 || 7;
    }

    /* ---------- STATE ---------- */
    const getMax = () => parseInt(localStorage.getItem(SK.MAX) || DEFAULT_MAX_VISITS, 10);
    const setMax = n => localStorage.setItem(SK.MAX, n);
    const getCount = () => parseInt(localStorage.getItem(SK.COUNT) || '0', 10);
    const getRemaining = () => Math.max(0, getMax() - getCount());
    const isBlocked = () => getRemaining() === 0;
    const consume = () => localStorage.setItem(SK.COUNT, getCount() + 1);

    /* ---------- SESSION ---------- */
    function startSession() {
        localStorage.setItem(SK.SESSION_START, Date.now().toString());
    }
    function isSessionActive() {
        const start = localStorage.getItem(SK.SESSION_START);
        if (!start) return false;
        const now = Date.now();
        return (now - parseInt(start, 10)) < SESSION_DURATION;
    }

    /* ---------- LIST ---------- */
    const getList = () => JSON.parse(localStorage.getItem(SK.LIST) || '[]');
    const saveList = l => localStorage.setItem(SK.LIST, JSON.stringify(l));
    function addItem(text) {
        if (!text.trim()) return false;
        const l = getList();
        l.push({ text: text.trim(), added: new Date().toISOString(), checked: false });
        saveList(l);
        return true;
    }
    function removeItem(i) {
        const l = getList(); l.splice(i, 1); saveList(l);
    }
    function toggleItemCheck(i) {
        const l = getList();
        l[i].checked = !l[i].checked;
        saveList(l);
    }
    const fmtDate = iso => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });

    /* ---------- THEME ---------- */
    const getTheme = () => localStorage.getItem(SK.THEME) || 'light';
    const setTheme = t => localStorage.setItem(SK.THEME, t);
    function applyTheme() {
        document.documentElement.setAttribute('data-ab-theme', getTheme());
    }

    function toggleTheme() {
        const next = getTheme() === 'light' ? 'dark' : 'light';
        setTheme(next);
        applyTheme();
        document.querySelectorAll('.ab-pill').forEach(btn => {
            btn.textContent = next === 'light' ? '☽ Dark' : '☀ Light';
        });
        document.querySelectorAll('.ab-add input').forEach(input => {
            input.style.backgroundColor = 'var(--input)';
        });
    }

    /* ---------- CSS INJECTION (unified) ---------- */
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
`;

    function injectCSS() {
        if (typeof GM_addStyle !== 'undefined') {
            // Tampermonkey environment
            GM_addStyle(cssText);
        } else {
            // Chrome extension – attach to <html> (safe at document-start)
            const style = document.createElement('style');
            style.textContent = cssText;
            document.documentElement.appendChild(style);
        }
    }

    /* ---------- SHARED CARD BUILDER ---------- */
    function buildCard(blocked, compact = false) {
        const card = document.createElement('div');
        card.className = 'ab-card';

        const top = document.createElement('div');
        top.className = 'ab-top';
        top.innerHTML = `
<span class="ab-word">ShoppingPad</span>
<button class="ab-pill">${getTheme() === 'light' ? '☽ Dark' : '☀ Light'}</button>
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
                    ? `You've used your ${getMax()} shopping sessions this week. You can still put things down here and buy them when your sessions reset.`
                    : `You have ${getRemaining()} sessions left this week. You can browse now, or just leave items on the pad to buy everything at once later.`}
        </div>
        <div class="ab-chip">
        <span>${blocked ? 'Resets in' : 'Sessions left'}</span>
        <b>${blocked ? daysUntilMonday() + ' days' : getRemaining() + ' of ' + getMax()}</b>
        </div>
        ${!blocked ? '<button class="ab-btn">Start 1-hour session</button>' : ''}
        <div class="ab-sec">Your pad</div>
        `;
        } else {
            body.innerHTML += `<div class="ab-sec">Shopping list</div>`;
        }

        const listWrap = document.createElement('div');
        const inputElement = buildList(listWrap, compact);
        body.appendChild(listWrap);

        card.append(top, body);

        const themeBtn = top.querySelector('button');
        themeBtn.onclick = (e) => {
            e.preventDefault();
            toggleTheme();
        };

        if (!blocked && !compact) {
            const startBtn = body.querySelector('.ab-btn');
            if (startBtn) {
                startBtn.onclick = () => {
                    consume();
                    startSession();
                    document.getElementById('ab-overlay')?.remove();
                    createWidget();
                };
            }
        }

        if (compact && inputElement) {
            setTimeout(() => inputElement.focus(), 0);
        }

        return card;
    }

    /* ---------- LIST BUILDER ---------- */
    function buildList(container, compact = false) {
        container.innerHTML = '';
        const list = getList();

        const wrap = document.createElement('div');
        wrap.className = 'ab-list';

        if (!list.length) {
            wrap.innerHTML = '<div style="text-align:center;color:var(--text-lo);padding:10px;border:1px dashed var(--border);border-radius:10px">Nothing here yet.</div>';
        } else {
            list.forEach((item, i) => {
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
                    cb.addEventListener('change', () => {
                        toggleItemCheck(i);
                        if (cb.checked) row.classList.add('checked');
                        else row.classList.remove('checked');
                    });
                }

                row.querySelector('button').onclick = () => {
                    removeItem(i);
                    buildList(container, compact);
                };
                wrap.appendChild(row);
            });
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

        const handleAdd = () => {
            if (addItem(input.value)) {
                input.value = '';
                const newInput = buildList(container, compact);
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

    /* ---------- OVERLAY ---------- */
    function showOverlay(blocked) {
        const existingOverlay = document.getElementById('ab-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }

        const o = document.createElement('div');
        o.id = 'ab-overlay';
        o.appendChild(buildCard(blocked, false));

        document.body.classList.add('ab-hide-content');
        document.body.appendChild(o);
        o.offsetHeight;
        document.body.classList.remove('ab-hide-content');
    }

    /* ---------- WIDGET ---------- */
    let panel;

    function createWidget() {
        if (document.getElementById('ab-widget-icon')) return;

        const icon = document.createElement('div');
        icon.id = 'ab-widget-icon';
        icon.textContent = '⊟';
        icon.onclick = togglePanel;

        panel = document.createElement('div');
        panel.id = 'ab-widget-panel';

        document.body.append(icon, panel);
    }

    function togglePanel() {
        if (panel.style.display === 'block') {
            panel.style.display = 'none';
        } else {
            panel.innerHTML = '';
            panel.appendChild(buildCard(false, true));
            panel.style.display = 'block';
        }
    }

    /* ---------- INIT ---------- */
    function run() {
        resetIfNewWeek();
        applyTheme();

        if (isSessionActive()) {
            createWidget();
        } else if (isBlocked()) {
            showOverlay(true);
        } else {
            showOverlay(false);
        }
    }

    // 1. Hide the page immediately (body will be hidden via CSS)
    const styleHide = document.createElement('style');
    styleHide.textContent = `body { visibility: hidden !important; }`;
    document.documentElement.appendChild(styleHide);

    // 2. Inject the full CSS (themes, layout) – unified
    injectCSS();

    // 3. Wait for DOM ready, then run the main logic
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            styleHide.remove();
            run();
        });
    } else {
        styleHide.remove();
        run();
    }
})();