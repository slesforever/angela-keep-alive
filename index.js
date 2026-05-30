const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');

// 安全相容各 Node.js 版本的 fetch 寫法
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

// 系統運行紀錄變數
const systemStartTime = new Date();
let totalTweetsChecked = 0;

// 📡 觀測目標：邊獄公司官方帳號
const TARGET_USER = { username: 'LimbusCompany_B', displayName: '邊獄公司 (Limbus Company) 官方最新公告', color: 0xf24444 };

// 🌐 Nitter 可用節點清單
const NITTER_NODES = [
    'https://nitter.net',
    'https://nitter.poast.org',
    'https://nitter.cz'
];

// 儲存最後一次抓到的推文 ID 快取
let lastFetchedId = null;

// Discord 頻道 ID
const NOTIFY_CHANNEL_ID = "1402282604165730348";

// 1. Web 伺服器
app.get('/', (req, res) => {
    res.send('Angela 系統運作正常。歡迎來到腦葉公司核心控制室。');
});

app.listen(PORT, () => {
    console.log(`網頁伺服器已在連接埠 ${PORT} 啟動`);
});

// 2. 初始化 Discord 機器人
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

    // 啟動時自動發送上線通知
    try {
        const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
        if (channel) {
            const loginEmbed = new EmbedBuilder()
                .setTitle("🟢 系統連線：AI 助理 Angela 已重新上線")
                .setColor(0x00b4d8)
                .setDescription("「主管，精神脈衝已重新對齊。官方社交觀測模組已成功初始化。」")
                .addFields(
                    { name: "📡 觀測目標", value: `@${TARGET_USER.username}`, inline: true },
                    { name: "🛠️ 測試協議", value: "可使用 `!測試官方推文` 進行強制觀測", inline: true }
                )
                .setFooter({ text: "腦葉公司行政中心 - 核心AI系統" })
                .setTimestamp();

            await channel.send({ embeds: [loginEmbed] });
        }
    } catch (err) {
        console.error("❌ 啟動發送訊息失敗:", err.message);
    }
    
    // 啟動自動定時輪詢 (每 10 分鐘檢查一次)
    setInterval(checkTwitterUpdates, 10 * 60 * 1000);
    checkTwitterUpdates();
});

// 自動輪詢處理器
async function checkTwitterUpdates() {
    console.log(`⏳ Angela 正在發射觀測脈衝，檢查官方 @${TARGET_USER.username} 的動態...`);
    totalTweetsChecked++;

    for (const nodeUrl of NITTER_NODES) {
        try {
            const url = `${nodeUrl}/${TARGET_USER.username}/rss`;
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                timeout: 10000
            });
            
            if (!response.ok) throw new Error(`HTTP 錯誤! 狀態碼: ${response.status}`);
            
            const text = await response.text();
            const itemRegex = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<guid[\s\S]*?>([\s\S]*?)<\/guid>/g;
            const match = itemRegex.exec(text);

            if (match) {
                let tweetContent = match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
                const tweetLink = match[2].trim().replace('http://', 'https://').replace(/nitter\.[a-z\.]+/g, 'x.com');
                const tweetId = match[3].trim();

                // 初次運行，只建立快取不發通知（避免重啟洗頻）
                if (!lastFetchedId) {
                    lastFetchedId = tweetId;
                    console.log(`📦 [${nodeUrl}] 成功建立 @${TARGET_USER.username} 的初始推文快取：${tweetId}`);
                    break;
                }

                // 發現全新推文
                if (tweetId !== lastFetchedId) {
                    lastFetchedId = tweetId;
                    const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                    if (channel) {
                        const tweetEmbed = new EmbedBuilder()
                            .setTitle(`🔔 ${TARGET_USER.displayName}`)
                            .setColor(TARGET_USER.color)
                            .setDescription(tweetContent.length > 500 ? tweetContent.substring(0, 500) + "..." : tweetContent)
                            .setURL(tweetLink)
                            .setTimestamp()
                            .setFooter({ text: `Angela 自動觀測 - @${TARGET_USER.username}` });

                        await channel.send({ content: `📢 **主管，觀測到官方最新貼文！**\n傳送門：${tweetLink}`, embeds: [tweetEmbed] });
                    }
                }
                break; // 成功即跳出備援循環
            }
        } catch (error) {
            console.warn(`⚠️ 節點 [${nodeUrl}] 擷取異常 (${error.message})`);
        }
    }
}

// 3. 訊息監聽與核心功能
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim();

    // 🧪 【手動測試核心】強制抓取官方最後一則貼文並展示
    if (msg === '!測試官方推文' || msg === '!testtweet') {
        await message.channel.sendTyping(); // 顯示「正在輸入...」的特效
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
                const itemRegex = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<guid[\s\S]*?>([\s\S]*?)<\/guid>/g;
                const match = itemRegex.exec(text);

                if (match) {
                    let tweetContent = match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
                    const tweetLink = match[2].trim().replace('http://', 'https://').replace(/nitter\.[a-z\.]+/g, 'x.com');
                    
                    const testEmbed = new EmbedBuilder()
                        .setTitle(`📊 [手動觀測測試] ${TARGET_USER.displayName}`)
                        .setColor(0x3a86ff) // 測試用亮藍色
                        .setDescription(tweetContent)
                        .setURL(tweetLink)
                        .addFields({ name: "🔍 系統檢驗結果", value: `🟢 連線節點 \`${nodeUrl}\` 運作完美。此卡片成功發送代表 Angela 的抓取模組、Discord 發文權限皆處於正常臨界狀態。` })
                        .setTimestamp()
                        .setFooter({ text: "腦葉公司核心控制室 - 診斷監測" });

                    await message.reply({ content: `✅ **報告主管，擷取測試成功！這是官方目前的最新貼文：**`, embeds: [testEmbed] });
                    fetchSuccess = true;
                    break;
                }
            } catch (error) {
                console.warn(`⚠️ 測試時節點 [${nodeUrl}] 異常: ${error.message}`);
            }
        }

        if (!fetchSuccess) {
            return message.reply(`❌ **報告主管，當前所有 Nitter 備援節點暫時連線超時，無法完成手動擷取。**\n這通常是推特官方正在進行高強度的流量清洗，請稍後幾分鐘再試。`);
        }
        return;
    }

    // 基本常規指令
    if (msg === '!ping') return message.reply('pong！');
    if (msg === '管理員' || msg === '主管') return message.reply('主管，您好。我是您的 AI 助理 Angela。');
    if (msg.toLowerCase() === 'lc' || msg === '腦葉公司') return message.reply('「直面恐懼，創造未來。」');

    if (msg === '!狀態' || msg === '!status') {
        const uptimeHours = ((new Date() - systemStartTime) / (1000 * 60 * 60)).toFixed(1);
        const embed = new EmbedBuilder()
            .setTitle("🧠 認知心理學 - 情感共鳴與系統狀態報告")
            .setColor(0x5a189a)
            .addFields(
                { name: "⏳ 核心運作時間", value: `${uptimeHours} 小時`, inline: true },
                { name: "📡 監聽機制", value: `多節點輪詢備援協定`, inline: true },
                { name: "🔄 累計掃描脈衝", value: `${totalTweetsChecked} 次`, inline: true },
                { name: "📝 綜合觀測紀錄", value: "目前專注於外部 Limbus 支部（@LimbusCompany_B）的單一核心監控。多路由塌陷防禦正常掛載，系統可隨時響應主管的手動強制觀測脈衝（!測試官方推文）。", inline: false }
            )
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }
    
    // (其餘 E.G.O 等指令維持原樣，此處略過)
});

const TOKEN = process.env.DISCORD_TOKEN;
client.login(TOKEN);
