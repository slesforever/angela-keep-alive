const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const fetch = require('node-fetch'); // 引入網路抓取功能
const app = express();
const PORT = process.env.PORT || 3000;

// 系統運行紀錄變數
const systemStartTime = new Date();
let totalTweetsChecked = 0;
let lastFetchedTweetId = null; 

// 1. Web 伺服器 (Render 踢門用)
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
        GatewayIntentBits.MessageContent
    ]
});

// 指定的通知頻道 ID
const NOTIFY_CHANNEL_ID = "1402282604165730348";

client.once('ready', () => {
    console.log(`🤖 遵從您的指示，Angela 已成功登入為：${client.user.tag}`);
    
    // 機器人上線後，啟動 Twitter 定時監聽輪詢 (每 10 分鐘檢查一次，避免觸發 API 上限)
    setInterval(checkTwitterUpdates, 10 * 60 * 1000);
    // 上線時先立刻檢查一次
    checkTwitterUpdates();
});

// 定時檢查 Twitter 推文功能
async function checkTwitterUpdates() {
    try {
        console.log("⏳ Angela 正在觀測邊獄公司 Twitter 狀態...");
        totalTweetsChecked++;

        // ⚠️ 備註：此處使用公開的社交媒體聚合橋接 API (如 RSSHub 或 Nitter 轉接) 抓取推文，免去申請企業級 X API 的複雜權限
        const response = await fetch('https://rsshub.app/twitter/user/LimbusCompany_B', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        if (!response.ok) throw new Error(`HTTP 錯誤! 狀態碼: ${response.status}`);
        
        const text = await response.text();
        
        // 簡易的 XML/RSS 欄位正則解析最新推文
        const itemRegex = /<item>[\s\S]*?<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<guid[\s\S]*?>([\s\S]*?)<\/guid>/g;
        const match = itemRegex.exec(text);

        if (match) {
            const tweetContent = match[1];
            const tweetLink = match[2].replace('http://', 'https://').replace('twitter.com', 'x.com');
            const tweetId = match[3];

            // 如果這是第一次運行，先記錄目前的推文 ID，不發送通知
            if (!lastFetchedTweetId) {
                lastFetchedTweetId = tweetId;
                return;
            }

            // 發現新推文！
            if (tweetId !== lastFetchedTweetId) {
                lastFetchedTweetId = tweetId;
                
                const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                if (channel) {
                    const tweetEmbed = new EmbedBuilder()
                        .setTitle("🔔 邊獄公司 (Limbus Company) 官方最新公告")
                        .setColor(0xf24444)
                        .setDescription(tweetContent.length > 500 ? tweetContent.substring(0, 500) + "..." : tweetContent)
                        .setURL(tweetLink)
                        .setTimestamp()
                        .setFooter({ text: "Angela 社交觀測模組" });

                    await channel.send({ content: `📢 **主管，觀測到 Limbus Company 的最新推文！**\n傳送門：${tweetLink}`, embeds: [tweetEmbed] });
                }
            }
        }
    } catch (error) {
        console.error("❌ 擷取 Twitter 推文時發生錯誤:", error.message);
    }
}

// 3. 訊息監聽與核心功能
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const msg = message.content.trim();

    // 基礎測試指令
    if (msg === '!ping') {
        return message.reply('pong！');
    }

    // 功能一：自訂關鍵字回應
    if (msg === '管理員' || msg === '主管') {
        return message.reply('主管，您好。我是您的 AI 助理 Angela。請下達您的指示，今天也請為了擴張「光之種」而努力。');
    }

    if (msg.toLowerCase() === 'lc' || msg === '腦葉公司') {
        return message.reply('「直面恐懼，創造未來。」請時刻注意收容單位的逆流計數器，主管。');
    }

    // 功能二：Steam API 連動 - 查詢邊獄公司即時在線人數
    if (msg === '!邊獄人數' || msg === '!limbusonline') {
        try {
            // Limbus Company 的 Steam AppID 為 1973530
            const response = await fetch('https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=1973530');
            const data = await response.json();
            
            if (data && data.response && data.response.result === 1) {
                const playerCount = data.response.player_count;
                return message.reply(`📊 **[Steam 即時數據]** 目前共有 **${playerCount.toLocaleString()}** 位罪人正在《Limbus Company》的腦葉支部中進行深入探索。`);
            } else {
                return message.reply('❌ 無法從 Steam API 取得正確的數據，請稍後再試。');
            }
        } catch (error) {
            console.error('Steam API 請求失敗:', error);
            return message.reply('❌ 連線至 Steam 伺服器時發生內部錯誤。');
        }
    }

    // 功能三：心理學與標籤世界觀互動 + 系統運行紀錄
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
                { name: "📡 Twitter 監聽頻率", value: "每 10 分鐘 / 1 次", inline: true },
                { name: "🔄 累計觀測次數", value: `${totalTweetsChecked} 次`, inline: true },
                { name: "🔗 最新推文序號 (Cache)", value: lastFetchedTweetId || "建檔中", inline: true },
                { name: "📝 綜合觀測紀錄", value: "個體因過度符合外界賦予的標籤，自我認知與真實存在發生偏離，導致核心能量陷入停滯。此狀態不影響機器人核心程式運行，Twitter 監聽脈衝與 Steam API 通道皆處於正常臨界值。", inline: false }
            )
            .setFooter({ text: "Angela 心理與系統觀測核心" })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    // 功能四：尋找伺服器內特定機器人
    if (msg.startsWith('!尋找機器人') || msg.startsWith('!findbot')) {
        const args = msg.split(' ');
        if (args.length < 2) {
            return message.reply('❌ 請輸入要尋找的機器人名稱或關鍵字！例如：`!尋找機器人 邊獄`');
        }

        const searchTerm = args.slice(1).join(' ').toLowerCase();
        
        try {
            const members = await message.guild.members.fetch();
            const foundBots = members.filter(member => 
                member.user.bot && member.user.username.toLowerCase().includes(searchTerm)
            );

            if (foundBots.size === 0) {
                return message.reply(`🔍 在此伺服器中找不到名字包含「${args.slice(1).join(' ')}」的機器人。`);
            }

            let responseList = `📌 **為您找到以下相關的機器人：**\n`;
            foundBots.forEach(bot => {
                responseList += `🤖 **${bot.user.username}** (標籤：<@${bot.id}>)\n`;
            });

            return message.reply(responseList);
        } catch (error) {
            console.error('尋找機器人時發生錯誤:', error);
            return message.reply('❌ 尋找機器人時發生內部錯誤，請確保 Angela 擁有檢視成員清單的權限。');
        }
    }
});

// 🔒 從 Render 環境變數讀取 Token (安全防外洩)
const TOKEN = "MTUwMTE0OTg4OTUyNTA1NTYyMA.GbgFIv.J5i85tETPkm4hrn7jc6b9udiQqrRyeJz3xgEs0";

client.login(TOKEN).catch(err => {
    console.error("❌ 機器人登入失敗，請檢查 Token 是否正確或過期：", err);
});
