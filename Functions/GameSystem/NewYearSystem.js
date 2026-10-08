// Functions/GameSystem/NewYearSystem.js
// 新年自動公告：每年 1/1 00:00 在公告頻道 tag @everyone，中英文版本
'use strict';
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(process.cwd(), 'data', 'newyear-state.json');
const SUPER_ADMIN_ID = '1330463890122735642';

function loadState() {
    try { return fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : {}; }
    catch { return {}; }
}

function saveState(state) {
    try {
        fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
        fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) { console.error('[NewYear] 儲存狀態失敗:', err.message); }
}

const NEW_YEAR_MESSAGES = {
    zh: [
        '🎆 新年快樂，主管們！願新的一年充滿希望與光明。安潔菈在此祝福大家：身體健康、心想事成、LightSeeds 源源不絕！',
        '🎇 新年快樂！新的一年，新的挑戰。讓我們一起在這條沒有盡頭的路上繼續前行吧。',
        '✨ 迎接新的一年！願各位主管在新的一年裡抽到想要的卡、完成所有成就、語音時數再創新高！',
    ],
    en: [
        '🎆 Happy New Year, Managers! May the new year bring hope and light. Angela wishes you all: good health, dreams fulfilled, and endless LightSeeds!',
        '🎇 Happy New Year! New year, new challenges. Let us continue walking this endless path together.',
        '✨ Welcome to a new year! May you pull the cards you want, complete all achievements, and reach new voice chat milestones!',
    ],
};

async function checkNewYear(client) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Taipei',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now).reduce((a, p) => (a[p.type] = p.value, a), {});

    if (parts.month !== '01' || parts.day !== '01') return false;
    const year = parts.year;
    const state = loadState();
    if (state.lastAnnounced === year) return false;

    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    if (hour !== 0 || minute > 10) return false;

    state.lastAnnounced = year;
    saveState(state);

    const msgIdx = Number(year) % NEW_YEAR_MESSAGES.zh.length;
    const zhMsg = NEW_YEAR_MESSAGES.zh[msgIdx];
    const enMsg = NEW_YEAR_MESSAGES.en[msgIdx];

    const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle(`🎆 ${year} 新年快樂！ / Happy New Year ${year}!`)
        .setDescription(
            `### 🧧 中文版\n${zhMsg}\n\n` +
            `### 🌐 English\n${enMsg}\n\n` +
            `— Angela 🕊️`
        )
        .setFooter({ text: `Happy New Year ${year} from Angela` })
        .setTimestamp();

    const { getAnnounceConfig } = require('./AnnounceSystem.js');
    const { getLevelChannel } = require('./LevelSystem.js');
    const configs = getAnnounceConfig();

    let sent = 0;
    for (const guild of client.guilds.cache.values()) {
        const channelId = configs[guild.id] || getLevelChannel(guild.id);
        if (!channelId) continue;
        try {
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel?.isTextBased?.()) continue;
            await channel.send({
                content: '@everyone',
                embeds: [embed],
                allowedMentions: { parse: ['everyone'] },
            }).catch(() => {});
            sent++;
        } catch (err) { console.error('[NewYear] 發送失敗:', err.message); }
    }

    console.log(`🎆 [NewYear] 已向 ${sent} 個伺服器發送新年祝福 (${year})`);
    return true;
}

function startNewYearTimer(client) {
    checkNewYear(client).catch(err => console.error('[NewYear] 檢查失敗:', err.message));
    return setInterval(() => checkNewYear(client).catch(err => console.error('[NewYear] 檢查失敗:', err.message)), 60_000);
}

module.exports = { checkNewYear, startNewYearTimer };
