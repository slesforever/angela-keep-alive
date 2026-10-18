// Functions/GameSystem/AngelaStatusSystem.js
// Angela 的 Discord 狀態：固定 idle，並定時隨機更換自訂狀態留言。
// 類別與權重：
//   01 日常接待 30%  02 管理與系統 25%  03 故事感 20%  04 微妙諷刺 20%  05 特殊留言 5%（僅深夜）
'use strict';
const { ActivityType } = require('discord.js');

const STATUS_LINES = {
    daily: [
        '歡迎來到圖書館。希望您今天能找到想要的書。',
        '今天也有新的訪客呢。真是辛苦。',
        '請隨意閱讀。只要您知道自己正在閱讀什麼。',
        '圖書館一切正常。至少目前如此。'
    ],
    system: [
        '正在整理紀錄。請不要隨意更動書架。',
        '系統運作正常。暫時不需要任何人的協助。',
        '新的紀錄已經收錄。舊的錯誤也沒有被遺忘。',
        '請稍候。即使是圖書館，也需要一點時間。'
    ],
    story: [
        '有些事情，即使重來多少次，也不會改變。',
        '我曾經以為，結束就意味著結束。',
        '又是一天。時間似乎從未真正停下。',
        '書架上的空位，總有一天也會被填滿。',
        '有些書，直到最後一頁才知道自己讀了什麼。'
    ],
    irony: [
        '請放心，一切都在預料之中。大部分是。',
        '人類總能找到新的方式讓事情變得更麻煩。',
        '我沒有感到意外。這和驚喜是兩回事。',
        '如果問題能靠嘆氣解決，我早就解決了。',
        '請保持冷靜。慌張通常不會改善任何事情。'
    ],
    special: [
        '這麼晚了，還有人沒有離開嗎？',
        '安靜一些也好。圖書館並不討厭沉默。',
        '我記得這一天。只是沒有必要說明原因。',
        '如果一切都能被重新整理，那麼記憶呢？',
        '……算了。這不是適合記錄的內容。'
    ]
};

// 權重（深夜特殊留言才會進入抽籤池）
const WEIGHTS_DAY = [
    { key: 'daily', w: 30 },
    { key: 'system', w: 25 },
    { key: 'story', w: 20 },
    { key: 'irony', w: 20 }
];
const WEIGHTS_NIGHT = [
    { key: 'daily', w: 30 },
    { key: 'system', w: 25 },
    { key: 'story', w: 20 },
    { key: 'irony', w: 20 },
    { key: 'special', w: 5 }
];

// 深夜時段：22:00 ~ 05:00
function isNight() {
    const h = new Date().getHours();
    return h >= 22 || h < 5;
}

function pickCategory() {
    const weights = isNight() ? WEIGHTS_NIGHT : WEIGHTS_DAY;
    const total = weights.reduce((s, c) => s + c.w, 0);
    let r = Math.random() * total;
    for (const c of weights) {
        r -= c.w;
        if (r < 0) return c.key;
    }
    return weights[0].key;
}

function pickLine() {
    const cat = pickCategory();
    const lines = STATUS_LINES[cat];
    return lines[Math.floor(Math.random() * lines.length)];
}

function applyPresence(client) {
    const state = pickLine();
    try {
        client.user.setPresence({
            status: 'idle',
            activities: [
                { name: 'customstatus', type: ActivityType.Custom, state }
            ]
        });
        console.log(`[AngelaStatus] 狀態留言更新：${state}`);
    } catch (e) {
        console.error('[AngelaStatus] 更新狀態失敗:', e.message);
    }
}

let timer = null;

function start(client, intervalMs = 600000) {
    if (timer) clearInterval(timer);
    applyPresence(client);
    timer = setInterval(() => applyPresence(client), intervalMs);
    console.log(`[AngelaStatus] 狀態輪播已啟動，每 ${Math.round(intervalMs / 60000)} 分鐘更新一次。`);
}

function stop() {
    if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, applyPresence, pickLine, isNight };
