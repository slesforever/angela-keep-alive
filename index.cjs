const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const express = require('express');
const {
    pullIdentity,
    pullUpIdentity
} = require('./identitiesData.cjs');

if (typeof fetch !== 'function') {
    throw new Error('這個專案需要 Node.js 18+，Render 請設定 Node 20.x。');
}

const app = express();
const PORT = process.env.PORT || 3000;

const systemStartTime = Date.now();
let totalTweetsChecked = 0;

const TARGET_USER = {
    username: 'LimbusCompany_B',
    displayName: '邊獄公司 (Limbus Company) 官方最新公告'
};

const NITTER_NODES = [
    'https://nitter.net',
    'https://nitter.poast.org',
    'https://nitter.cz'
];

const NOTIFY_CHANNEL_ID = '1402282604165730348';
const PING_ROLE_MENTION = '<@&1406984068725211177>';

let lastFetchedId = null;

app.get('/', (_, res) => {
    res.send('Angela 系統運作正常。');
});

app.listen(PORT, () => {
    console.log(`Web server running on ${PORT}`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

function buildRarity() {
    const r = Math.random();
    if (r < 0.029) return '000';
    if (r < 0.157) return '00';
    return '0';
}

function withTimeout(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { controller, timer };
}

async function safeFetch(url, options = {}) {
    const { controller, timer } = withTimeout(8000);

    try {
        const res = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                ...(options.headers || {})
            }
        });
        return res;
    } finally {
        clearTimeout(timer);
    }
}

function parseLatestItem(xml) {
    const itemMatch = xml.match(/<item>[\s\S]*?<\/item>/);
    if (!itemMatch) return null;

    const item = itemMatch[0];
    const link = item.match(/<link>(.*?)<\/link>/)?.[1];
    const guid = item.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1];

    if (!link || !guid) return null;

    return {
        link: link.trim().replace('http://', 'https://'),
        id: guid.trim()
    };
}

async function checkTwitterUpdates() {
    console.log(`Checking @${TARGET_USER.username}...`);
    totalTweetsChecked++;

    for (const node of NITTER_NODES) {
        try {
            const url = `${node}/${TARGET_USER.username}/rss`;
            const res = await safeFetch(url);

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const xml = await res.text();
            const data = parseLatestItem(xml);
            if (!data) continue;

            const vxLink = data.link.replace(/^https:\/\/[^/]+/, 'https://vxtwitter.com');

            if (!lastFetchedId) {
                lastFetchedId = data.id;
                console.log(`[INIT] cached tweet ${data.id}`);
                break;
            }

            if (data.id !== lastFetchedId) {
                lastFetchedId = data.id;

                const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                if (channel && typeof channel.send === 'function') {
                    await channel.send({
                        content: `🔔 ${PING_ROLE_MENTION}\n${vxLink}`
                    });
                }
            }

            break;
        } catch (err) {
            console.warn(`[${node}] failed: ${err.message}`);
        }
    }
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    client.user.setPresence({
        status: 'idle',
        activities: [{
            name: '監測 Project Moon 官方動態中...',
            type: ActivityType.Watching
        }]
    });

    try {
        const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
        if (channel && typeof channel.send === 'function') {
            const embed = new EmbedBuilder()
                .setTitle('🟢 Angela 已上線')
                .setColor(0x00b4d8)
                .setDescription('系統已重新連線，開始監測官方動態。')
                .addFields(
                    { name: '🎯 目標', value: TARGET_USER.username, inline: true },
                    { name: '⏱️ 間隔', value: '60 秒', inline: true }
                )
                .setTimestamp();

            await channel.send({ embeds: [embed] });
        }
    } catch (e) {
        console.error('Startup message failed:', e.message);
    }

    setInterval(checkTwitterUpdates, 60 * 1000);
    await checkTwitterUpdates();
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const msg = message.content.trim();

    if (msg === '!ping') {
        return message.reply('pong');
    }

    if (msg === '!testtweet' || msg === '!測試官方推文') {
        await message.channel.sendTyping();

        for (const node of NITTER_NODES) {
            try {
                const url = `${node}/${TARGET_USER.username}/rss`;
                const res = await safeFetch(url);

                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const xml = await res.text();
                const data = parseLatestItem(xml);
                if (!data) continue;

                const vxLink = data.link.replace(/^https:\/\/[^/]+/, 'https://vxtwitter.com');
                return message.reply(`🔔 最新推文:\n${vxLink}`);
            } catch (err) {
                console.warn(`[${node}] test failed: ${err.message}`);
            }
        }

        return message.reply('❌ 全節點失敗');
    }

    if (msg === '!邊獄人數' || msg === '!limbusonline') {
        try {
            const res = await safeFetch('https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=1973530');
            const data = await res.json();

            if (data?.response?.result === 1) {
                return message.reply(`👥 玩家數：${data.response.player_count.toLocaleString()}`);
            }

            return message.reply('❌ 無法取得數據');
        } catch {
            return message.reply('❌ Steam API error');
        }
    }

    if (msg === '!狀態' || msg === '!status') {
        const uptime = ((Date.now() - systemStartTime) / 3600000).toFixed(1);

        const embed = new EmbedBuilder()
            .setTitle('系統狀態')
            .setColor(0x5a189a)
            .addFields(
                { name: '運行時間', value: `${uptime}h`, inline: true },
                { name: '檢查次數', value: `${totalTweetsChecked}`, inline: true }
            )
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    if (msg === '!pull') {
        const rarity = buildRarity();
        const up = pullUpIdentity(rarity);

        let result = pullIdentity(rarity);
        if (up && Math.random() < 0.25) {
            result = `✨ [UP!] ${up}`;
        }

        return message.reply(`🎯 **單抽結果：**\n${result} (${rarity})`);
    }

    if (msg === '!10pulls') {
        const results = [];

        for (let i = 0; i < 10; i++) {
            const rarity = buildRarity();
            const up = pullUpIdentity(rarity);

            let result = pullIdentity(rarity);
            if (up && Math.random() < 0.25) {
                result = `✨ [UP!] ${up}`;
            }

            results.push(`${result} (${rarity})`);
        }

        return message.reply(`✨ **十連抽結果：**\n${results.join('\n')}`);
    }

    if (msg === '!up' || msg === '!banner') {
        return message.reply(
            [
                '📌 **目前 UP 設定**',
                `000：${pullUpIdentity('000') ? '有' : '無'}`,
                `00：${pullUpIdentity('00') ? '有' : '無'}`,
                `0：${pullUpIdentity('0') ? '有' : '無'}`
            ].join('\n')
        );
    }
});

client.login(process.env.DISCORD_TOKEN);
