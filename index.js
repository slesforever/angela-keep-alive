const { pullIdentity } = require('angela-keep-alive/identitiesData.js');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

const systemStartTime = new Date();
let totalTweetsChecked = 0;

const TARGET_USER = { username: 'LimbusCompany_B', displayName: '邊獄公司 (Limbus Company) 官方最新公告' };

const NITTER_NODES = [
    'https://nitter.net',
    'https://nitter.poast.org',
    'https://nitter.cz'
];

let lastFetchedId = null;

const NOTIFY_CHANNEL_ID = "1402282604165730348";
const PING_ROLE_MENTION = "<@&1406984068725211177>";

app.get('/', (req, res) => {
    res.send('Angela 系統運作正常。歡迎來到腦葉公司核心控制室。');
});

app.listen(PORT, () => {
    console.log(`網頁伺服器已在連接埠 ${PORT} 啟動`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.once('ready', async () => {
    console.log(`🤖 遵從您的指示，Angela 已成功登入為：${client.user.tag}`);
    
    client.user.setPresence({
        status: 'idle',
        activities: [{
            name: 'customstatus',
            type: 4,
            state: '正在觀測核心控制室的心理逆流與光之種進度...'
        }]
    });

    try {
        const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
        if (channel) {
            const loginEmbed = new EmbedBuilder()
                .setTitle("🟢 系統連線：AI 助理 Angela 已重新上線")
                .setColor(0x00b4d8)
                .setDescription("「主管，精神脈衝已重新對齊。廣播模組已調整完畢，隨時準備播報 Project Moon 的最新動態。」")
                .addFields(
                    { name: "📡 觀測目標", value: `@${TARGET_USER.username}`, inline: true },
                    { name: "⏱️ 監聽頻率", value: "每 1 分鐘 / 1 次", inline: true }
                )
                .setFooter({ text: "腦葉公司行政中心 - 核心AI系統" })
                .setTimestamp();

            await channel.send({ embeds: [loginEmbed] });
        }
    } catch (err) {
        console.error("❌ 啟動發送訊息失敗:", err.message);
    }
    
    setInterval(checkTwitterUpdates, 60 * 1000);
    checkTwitterUpdates();
});
// 📡 自動高頻輪詢 (帶有 PING 身分組與極簡影像網址)
async function checkTwitterUpdates() {
    console.log(`⏳ Angela 正在發射高速觀測脈衝，檢查官方 @${TARGET_USER.username} 的動態...`);
    totalTweetsChecked++;

    for (const nodeUrl of NITTER_NODES) {
        try {
            const url = `${nodeUrl}/${TARGET_USER.username}/rss`;
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 8000
            });
            
            if (!response.ok) throw new Error(`HTTP 錯誤! 狀態碼: ${response.status}`);
            
            const text = await response.text();
            const itemRegex = /<item>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<guid[\s\S]*?>([\s\S]*?)<\/guid>/g;
            const match = itemRegex.exec(text);

            if (match) {
                const rawLink = match[1].trim().replace('http://', 'https://');
                const cleanLink = rawLink.split('#')[0]; 
                const vxTweetLink = cleanLink.replace(/https:\/\/[^\/]+/, 'https://vxtwitter.com');
                const tweetId = match[2].trim();

                if (!lastFetchedId) {
                    lastFetchedId = tweetId;
                    console.log(`📦 [${nodeUrl}] 成功建立 @${TARGET_USER.username} 的初始推文快取：${tweetId}`);
                    break;
                }

                if (tweetId !== lastFetchedId) {
                    lastFetchedId = tweetId;
                    const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                    if (channel) {
                        // ✨ 自動輪詢發送
                        await channel.send({ content: `🔔 ${PING_ROLE_MENTION} **偵測到脈衝，已收到 Project Moon 的最新訊息：**\n${vxTweetLink}` });
                    }
                }
                break;
            }
        } catch (error) {
            console.warn(`⚠️ 節點 [${nodeUrl}] 擷取異常 (${error.message})，嘗試下一個備援空間...`);
        }
    }
}

client.on('messageCreate', async (message) => {
    // 檢查機器人本身，避免無限迴圈
    if (message.author.bot) return;

    const msg = message.content.trim();

    // 抽卡邏輯
    if (msg === '!pull' || msg === '!10pulls') {
        const count = (msg === '!10pulls') ? 10 : 1;
        let results = [];
        for (let i = 0; i < count; i++) {
            const rand = Math.random();
            let rarity = (rand < 0.029) ? '000' : (rand < 0.13) ? '00' : '0';
            results.push(`${pullIdentity(rarity)} (${rarity === '000' ? '★★★' : rarity === '00' ? '★★' : '★'})`);
        }
        return message.reply(count === 10 ? `✨ **十連抽結果：**\n${results.join('\n')}` : `🎯 **單抽結果：**\n${results[0]}`);
    }

    if (msg === '!ping') return message.reply('pong！');

    if (msg === '管理員' || msg === '主管') {
        return message.reply('主管，您好。我是您的 AI 助理 Angela。請下達您的指示，今天也請為了擴張「光之種」而努力。');
    }

    if (msg.toLowerCase() === 'lc' || msg === '腦葉公司') {
        return message.reply('「直面恐懼，創造未來。」請時刻注意收容單位的逆流計數器，主管。');
    }

    // 手動指令測試
    if (msg === '!測試官方推文' || msg === '!testtweet') {
        await message.channel.sendTyping();
        console.log(`🎯 主管手動觸發官方推文測試擷取...`);
        
        let fetchSuccess = false;
        
        for (const nodeUrl of NITTER_NODES) {
            try {
                const url = `${nodeUrl}/${TARGET_USER.username}/rss`;
                const response = await fetch(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 8000
                });
                
                if (!response.ok) throw new Error(`HTTP 狀態碼: ${response.status}`);
                
                const text = await response.text();
                const itemRegex = /<item>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<guid[\s\S]*?>([\s\S]*?)<\/guid>/g;
                const match = itemRegex.exec(text);

                if (match) {
                    const rawLink = match[1].trim().replace('http://', 'https://');
                    const cleanLink = rawLink.split('#')[0];
                    const vxTweetLink = cleanLink.replace(/https:\/\/[^\/]+/, 'https://vxtwitter.com');
                    
                    await message.reply({ content: `🔔 ${PING_ROLE_MENTION} **偵測到脈衝，已收到 Project Moon 的最新訊息：**\n${vxTweetLink}` });
                    fetchSuccess = true;
                    break;
                }
            } catch (error) {
                console.warn(`⚠️ 測試時節點 [${nodeUrl}] 異常: ${error.message}`);
            }
        }

        if (!fetchSuccess) {
            return message.reply(`❌ **報告主管，當前所有備援節點暫時連線超時，無法完成手動擷取。**`);
        }
        return;
    }

    if (msg === '!邊獄人數' || msg === '!limbusonline') {
        try {
            const response = await fetch('https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=1973530');
            const data = await response.json();
            if (data && data.response && data.response.result === 1) {
                return message.reply(`📊 **[Steam 即時數據]** 目前共有 **${data.response.player_count.toLocaleString()}** 位罪人正在《Limbus Company》中進行探索。`);
            } else {
                return message.reply('❌ 無法從 Steam API 取得正確的數據。');
            }
        } catch (error) {
            return message.reply('❌ 連線至 Steam 伺服器時發生內部錯誤。');
        }
    }

    if (msg === '!狀態' || msg === '!status') {
        const uptimeMs = new Date() - systemStartTime;
        const uptimeHours = (uptimeMs / (1000 * 60 * 60)).toFixed(1);
        const embed = new EmbedBuilder()
            .setTitle("🧠 認知心理學 - 情感共鳴與系統狀態報告")
            .setColor(0x5a189a)
            .setDescription("在當前社會標籤與認知扭曲下，個體的情感投影與核心控制室運行紀錄：")
            .addFields(
                { name: "🏷️ 當前標籤 (Label)", value: "「被觀測者」", inline: true },
                { name: "📊 心理狀態 (State)", value: "🛑 精神枯竭 (Burnout)", inline: true },
                { name: "⏳ 核心運作時間 (Uptime)", value: `${uptimeHours} 小時`, inline: true },
                { name: "📡 監聽機制", value: "1分鐘極速輪詢 (極簡優化版)", inline: true }
            )
            .setFooter({ text: "Angela 心理與系統觀測核心" })
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    if (msg === '!ego') {
        const egoList = [
            { name: "薄暮 (Twilight)", grade: "ALEPH", desc: "調和所有矛盾與偏見的終極大劍。暗示個體拒絕接受單一標籤，試圖在黑白混沌的世界中強行抓住平衡。" },
            { name: "失樂園 (Paradise Lost)", grade: "ALEPH", desc: "純白羽翼覆蓋的禁忌法杖。象徵對「完美標籤」的病態追求，個體容易因為試圖符合他人的神聖期望而陷入更深沉的 Burnout。" },
            { name: "擬態 (Mimicry)", grade: "ALEPH", desc: "由血肉扭曲而成的巨大刀刃。這代表個體擅長在不同環境中偽裝、完美貼上符合群體需求的標籤。" }
        ];
        const randomEgo = egoList[Math.floor(Math.random() * egoList.length)];
        const egoEmbed = new EmbedBuilder()
            .setTitle(`⚔️ 核心共鳴：E.G.O 同步觀測報告`)
            .setColor(0xd90429)
            .setDescription(`**${message.author.username}** 主管，提取出以下同步率最高的 E.G.O 武裝：`)
            .addFields(
                { name: "✨ 裝備名稱", value: `**${randomEgo.name}**`, inline: true },
                { name: "🔱 危險等級", value: `\`${randomEgo.grade}\``, inline: true },
                { name: "🧠 標籤與認知心理學解析", value: randomEgo.desc, inline: false }
            )
            .setFooter({ text: "Angela 心理提取模組" })
            .setTimestamp();
        return message.reply({ embeds: [egoEmbed] });
    }

    if (msg === '!逆流') {
        const alarmEmbed = new EmbedBuilder()
            .setTitle("⚠️ [WARNING] 腦葉公司核心控制室緊急通告")
            .setColor(0xff0000)
            .setDescription(`警告：當前頻道內觀測到嚴重的「心理逆流」現象！`)
            .addFields(
                { name: "🚨 逆流狀態", value: "第 3 階能障逆流 (Qliphoth Meltdown)", inline: false }
            )
            .setImage("https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop")
            .setFooter({ text: "腦葉公司最高行政控制中心" })
            .setTimestamp();
        return message.reply({ embeds: [alarmEmbed] });
    }

    if (msg.startsWith('!尋找機器人') || msg.startsWith('!findbot')) {
        const args = msg.split(' ');
        if (args.length < 2) return message.reply('❌ 請輸入要尋找的機器人名稱！');
        const searchTerm = args.slice(1).join(' ').toLowerCase();
        try {
            const members = await message.guild.members.fetch();
            const foundBots = members.filter(member => member.user.bot && member.user.username.toLowerCase().includes(searchTerm));
            if (foundBots.size === 0) return message.reply(`🔍 找不到機器人。`);
            let responseList = `📌 **找到相關機器人：**\n`;
            foundBots.forEach(bot => { responseList += `🤖 **${bot.user.username}** (<@${bot.id}>)\n`; });
            return message.reply(responseList);
        } catch (error) {
            return message.reply('❌ 內部錯誤。');
        }
    }
});

const TOKEN = process.env.DISCORD_TOKEN;
client.login(TOKEN).catch(err => {
    console.error("❌ 機器人登入失敗：", err);
});
