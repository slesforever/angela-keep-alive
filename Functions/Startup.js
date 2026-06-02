/ Functions/Startup.js
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');

const identitiesData    = require('./GameSystem/Pulls/identitiesData.js');
const { startNewsCheckLoop } = require('./Newscheck.js');
const { handleCommands }     = require('./Commanders.js');

const NOTIFY_CHANNEL_ID       = process.env.NOTIFY_CHANNEL_ID       || '1402282604165730348';
const RATEUP_ANNOUNCE_CHANNEL  = process.env.RATEUP_ANNOUNCE_CHANNEL || '1510153086281187330';
const PORT = process.env.PORT || 3000;

// ─── Keep-alive HTTP server（Render 需要綁定 port）───────────
const app = express();
app.get('/', (_, res) => res.send('Angela is online.'));
app.get('/health', (_, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.listen(PORT, () => console.log(`🌐 HTTP server 已啟動 port ${PORT}`));

// ─── Discord client ───────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

// ─── 工具函式 ─────────────────────────────────────────────────
function rarityLabel(rarity) {
    const map = {
        'Color Fixer': '👑 Color Fixer',
        'Special':     '🌀 Special',
        '0000':        '✨ ★★★★',
        'Egos':        '🔮 E.G.O',
        '000':         '★★★',
        '00':          '★★',
        '0':           '★',
    };
    return map[rarity] || rarity;
}

async function announceCurrentRateUps(botClient) {
    try {
        const channel = await botClient.channels.fetch(RATEUP_ANNOUNCE_CHANNEL);
        if (!channel) return;

        const up = identitiesData.upTargets || {};
        const sections = Object.entries(up)
            .filter(([, v]) => Array.isArray(v) && v.length)
            .map(([r, items]) =>
                `### ${rarityLabel(r)}\n${items.map(i => `• ${i}`).join('\n')}`
            );

        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffd166)
                    .setTitle('📢 Rate Up 人格與物資資料已成功載入')
                    .setDescription(sections.length ? sections.join('\n\n') : '目前沒有設定任何 Rate Up 對象。')
                    .setTimestamp(),
            ],
        });
    } catch (err) {
        console.error('Rate Up 公告失敗:', err.message);
    }
}

// ─── 訊息監聽 ─────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    try {
        await handleCommands(client, message);
    } catch (err) {
        console.error('❌ 指令錯誤:', err.message);
        message.reply('「系統發生內部錯誤，請稍後再試。」').catch(() => {});
    }
});

// ─── 上線事件（修復：ready → clientReady）────────────────────
client.once('clientReady', async () => {
    console.log(`🤖 Angela 系統脈衝對齊。已激活：${client.user.tag}`);

    client.user.setPresence({
        status: 'idle',
        activities: [{ name: 'customstatus', type: 4, state: 'Sles被我吃掉了' }],
    });

    // 上線報告
    try {
        const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
        if (channel) {
            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('🟢 系統連線：AI 助理 Angela 已重新上線')
                        .setColor(0x00b4d8)
                        .setDescription(
                            '「主管，精神脈衝已重新對齊。\n' +
                            '核心系統與指令發射器已就緒，隨時待命。」\n\n' +
                            '輸入 `!help` 查看全部指令。'
                        )
                        .setTimestamp(),
                ],
            });
        }
    } catch (err) {
        console.error('❌ 上線報告失敗:', err.message);
    }

    await announceCurrentRateUps(client);

    startNewsCheckLoop(client);
    console.log('📡 [排程] Newscheck 循環已啟動');
});

// ─── 錯誤保護（避免 uncaught exception 讓 bot 整個掛掉）──────
client.on('error', err => console.error('Discord 客戶端錯誤:', err.message));
process.on('unhandledRejection', err => console.error('未捕捉的 Promise 拒絕:', err));

// ─── 登入 ─────────────────────────────────────────────────────
const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN || TOKEN === 'DISCORD_TOKEN') {
    console.error('❌ 請設定環境變數 DISCORD_TOKEN');
    process.exit(1);
}
client.login(TOKEN);
