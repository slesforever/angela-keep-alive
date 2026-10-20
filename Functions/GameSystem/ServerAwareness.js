// Functions/GameSystem/ServerAwareness.js
// 伺服器感知系統：讓 AI 像個一直待在伺服器裡的人，知道這裡發生的所有大小事
// 記錄：各頻道最近聊天摘要、語音狀態變化（進出/靜音/直播）、成員進出伺服器、語音頻道現況快照
'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR        = path.join(process.cwd(), 'data', 'ai-awareness');
const MAX_EVENTS      = 80;              // 每個伺服器最多保留 80 筆事件（存檔）
const DIGEST_EVENTS   = 25;              // 每次提供給 AI 的最近事件數
const DIGEST_WINDOW_MS = 6 * 3600 * 1000; // 只取 6 小時內的動態
const MSG_PREVIEW     = 80;              // 每則訊息摘要長度
const SAVE_DEBOUNCE_MS = 15 * 1000;      // 15 秒 debounce 落盤

const logs  = new Map();  // guildId -> [{t, text}]
const dirty = new Set();
let saveTimer = null;
let _client = null;
let isAiChannel = function () { return false; };

function fileFor(g) { return path.join(DATA_DIR, g + '.json'); }

function load(g) {
    if (logs.has(g)) return logs.get(g);
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(fileFor(g), 'utf8')); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    logs.set(g, arr);
    return arr;
}

function flush() {
    for (const g of dirty) {
        try {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(fileFor(g), JSON.stringify(logs.get(g) || [], null, 2), 'utf8');
        } catch (e) { console.error('[Awareness] 儲存失敗:', e.message); }
    }
    dirty.clear();
}

function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(function () { saveTimer = null; flush(); }, SAVE_DEBOUNCE_MS);
}

function push(g, text) {
    if (!g) return;
    const arr = load(g);
    arr.push({ t: Date.now(), text: String(text || '').slice(0, 220) });
    while (arr.length > MAX_EVENTS) arr.shift();
    dirty.add(g);
    scheduleSave();
}

function fmtTime(ts) {
    const d = new Date(ts);
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// 語音頻道現況：誰現在在語音/舞台頻道裡
function voiceSnapshot(guild) {
    const parts = [];
    for (const ch of guild.channels.cache.values()) {
        if (ch.type !== 2 && ch.type !== 13) continue; // GuildVoice / GuildStageVoice
        const members = [...ch.members.values()].filter(function (m) { return !m.user.bot; });
        if (!members.length) continue;
        parts.push('「' + ch.name + '」: ' + members.map(function (m) { return m.displayName; }).join('、'));
    }
    return parts.length ? '（現在）語音頻道上有人：' + parts.join('；') : '';
}

function init(client, opts) {
    _client = client;
    isAiChannel = (opts && typeof opts.isAiChannel === 'function') ? opts.isAiChannel : function () { return false; };

    // 各頻道聊天摘要（AI 頻道本身已有對話記憶，跳過避免重複）
    client.on('messageCreate', function (msg) {
        try {
            if (!msg.guild || msg.author.bot) return;
            const content = (msg.cleanContent || '').trim();
            if (!content || content.startsWith('!!') || content.startsWith('/')) return;
            if (isAiChannel(msg.guild.id, msg.channel.id)) return;
            const name = (msg.member && msg.member.displayName) || msg.author.displayName || msg.author.username;
            push(msg.guild.id, '[' + msg.channel.name + '] ' + name + ': ' + content.replace(/\s+/g, ' ').slice(0, MSG_PREVIEW));
        } catch (e) { console.error('[Awareness] message 事件失敗:', e.message); }
    });

    // 語音狀態：加入/離開/移動/開關麥/音訊/直播
    client.on('voiceStateUpdate', function (oldState, newState) {
        try {
            const g = (newState.guild && newState.guild.id) || (oldState.guild && oldState.guild.id);
            if (!g) return;
            const name = (newState.member && newState.member.displayName) || (oldState.member && oldState.member.displayName) || '某人';
            const oldCh = oldState.channel ? oldState.channel.name : null;
            const newCh = newState.channel ? newState.channel.name : null;
            if (!oldCh && newCh) push(g, '🎧 ' + name + ' 加入了語音頻道「' + newCh + '」');
            else if (oldCh && !newCh) push(g, '🎧 ' + name + ' 離開了語音頻道「' + oldCh + '」');
            else if (oldCh && newCh && oldCh !== newCh) push(g, '🎧 ' + name + ' 從「' + oldCh + '」移動到「' + newCh + '」');
            else if (newCh) {
                if (oldState.selfMute !== newState.selfMute) push(g, '🎧 ' + name + ' 在「' + newCh + '」' + (newState.selfMute ? '關麥了' : '開麥了'));
                else if (oldState.selfDeaf !== newState.selfDeaf) push(g, '🎧 ' + name + ' 在「' + newCh + '」' + (newState.selfDeaf ? '關掉音訊了' : '打開音訊了'));
                else if (oldState.streaming !== newState.streaming) push(g, '🎧 ' + name + ' 在「' + newCh + '」' + (newState.streaming ? '開啟了直播' : '結束了直播'));
            }
        } catch (e) { console.error('[Awareness] voice 事件失敗:', e.message); }
    });

    // 成員進出伺服器
    client.on('guildMemberAdd', function (m) { try { push(m.guild.id, '👋 ' + (m.displayName || '新成員') + ' 加入了伺服器'); } catch (e) {} });
    client.on('guildMemberRemove', function (m) { try { push(m.guild.id, '👋 ' + (m.displayName || '有人') + ' 離開了伺服器'); } catch (e) {} });

    process.on('exit', flush);
    console.log('[Awareness] 伺服器感知系統已載入 (頻道動態 + 語音狀態 + 成員進出)');
}

// 產生「伺服器近況」文字，注入 AI 的 system instruction
function getDigest(guildId) {
    try {
        const now = Date.now();
        const events = load(guildId).filter(function (e) { return now - e.t < DIGEST_WINDOW_MS; }).slice(-DIGEST_EVENTS);
        const lines = events.map(function (e) { return fmtTime(e.t) + ' ' + e.text; });
        const g = _client && _client.guilds && _client.guilds.cache ? _client.guilds.cache.get(guildId) : null;
        if (g) {
            const snap = voiceSnapshot(g);
            if (snap) lines.push(snap);
        }
        return lines.join('\n');
    } catch (e) { return ''; }
}

module.exports = { init: init, getDigest: getDigest };
