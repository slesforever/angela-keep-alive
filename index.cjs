const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const { pullIdentity, targetIdentities } = require('./identitiesData.cjs');

const app = express();
const PORT = process.env.PORT || 3000;

const systemStartTime = new Date();
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

let lastFetchedId = null;

const NOTIFY_CHANNEL_ID = "1402282604165730348";
const PING_ROLE_MENTION = "<@&1406984068725211177>";

/* ---------------- EXPRESS ---------------- */
app.get('/', (req, res) => {
    res.send('Angela 系統運作正常。');
});

app.listen(PORT, () => {
    console.log(`Web server running on ${PORT}`);
});

/* ---------------- DISCORD CLIENT ---------------- */
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

/* ---------------- READY ---------------- */
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    client.user.setPresence({
        status: 'idle',
        activities: [{
            name: 'observing',
            type: 4,
            state: '監測 Project Moon 官方動態中...'
        }]
    });

    try {
        const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);

        if (channel) {
            const embed = new EmbedBuilder()
                .setTitle("🟢 Angela 已上線")
                .setColor(0x00b4d8)
                .setDescription("系統已重新連線，開始監測官方動態。")
                .addFields(
                    { name: "🎯 目標", value: TARGET_USER.username, inline: true },
                    { name: "⏱️ 間隔", value: "60 秒", inline: true }
                )
                .setTimestamp();

            channel.send({ embeds: [embed] });
        }
    } catch (e) {
        console.error("Startup message failed:", e);
    }

    setInterval(checkTwitterUpdates, 60 * 1000);
    checkTwitterUpdates();
});

/* ---------------- SAFE FETCH (Node18+) ---------------- */
async function safeFetch(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });

        clearTimeout(timeout);
        return res;
    } catch (e) {
        clearTimeout(timeout);
        throw e;
    }
}

/* ---------------- RSS PARSER ---------------- */
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

/* ---------------- CHECK TWITTER ---------------- */
async function checkTwitterUpdates() {
    console.log(`Checking @${TARGET_USER.username}...`);
    totalTweetsChecked++;

    for (const node of NITTER_NODES) {
        try {
            const url = `${node}/${TARGET_USER.username}/rss`;
            const res = await safeFetch(url);

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const xml = await res.text();
            const data = parseLatestItem(xml);

            if (!data) continue;

            const vxLink = data.link.replace(
                /^https:\/\/[^/]+/,
                'https://vxtwitter.com'
            );

            if (!lastFetchedId) {
                lastFetchedId = data.id;
                console.log(`[INIT] cached tweet ${data.id}`);
                break;
            }

            if (data.id !== lastFetchedId) {
                lastFetchedId = data.id;

                const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                if (channel) {
                    channel.send({
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

/* ---------------- MESSAGE HANDLER ---------------- */
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const msg = message.content.trim();

    if (msg === '!ping') return message.reply('pong');

    if (msg === '!測試官方推文') {
        for (const node of NITTER_NODES) {
            try {
                const res = await safeFetch(`${node}/${TARGET_USER.username}/rss`);
                const xml = await res.text();
                const data = parseLatestItem(xml);

                if (!data) continue;

                const vxLink = data.link.replace(
                    /^https:\/\/[^/]+/,
                    'https://vxtwitter.com'
                );

                return message.reply(`🔔 最新推文:\n${vxLink}`);
            } catch {}
        }

        return message.reply('❌ 全節點失敗');
    }

    if (msg === '!邊獄人數') {
        try {
            const res = await safeFetch(
                'https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=1973530'
            );

            const data = await res.json();

            return message.reply(
                `👥 玩家數：${data.response.player_count.toLocaleString()}`
            );
        } catch {
            return message.reply('❌ Steam API error');
        }
    }

    if (msg === '!狀態') {
        const uptime = ((Date.now() - systemStartTime) / 3600000).toFixed(1);

        const embed = new EmbedBuilder()
            .setTitle("System Status")
            .setColor(0x5a189a)
            .addFields(
                { name: "運行時間", value: `${uptime}h`, inline: true },
                { name: "檢查次數", value: `${totalTweetsChecked}`, inline: true }
            );

        return message.reply({ embeds: [embed] });
    }

    if (msg === '!pull') {
        const rarity =
            Math.random() < 0.03 ? '000' :
            Math.random() < 0.16 ? '00' : '0';

        const name = pullIdentity(rarity);

        return message.reply(`🎯 ${name} (${rarity})`);
    }
});

/* ---------------- LOGIN ---------------- */
client.login(process.env.DISCORD_TOKEN);
