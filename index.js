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

// 🌐 Nitter 可用節點清單 (用於 1 分鐘高頻輪詢的防禦切換)
const NITTER_NODES = [
    'https://nitter.net',
    'https://nitter.poast.org',
    'https://nitter.cz'
];

// 儲存最後一次抓到的推文 ID 快取
let lastFetchedId = null;

// Discord 頻道 ID 與 需要 Ping 的身分組 ID
const NOTIFY_CHANNEL_ID = "1402282604165730348";
const PING_ROLE_MENTION = "<@&1406984068725211177>"; // 自動通知身分組

// 1. Web 伺服器 (Render 維持生命用)
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
    
    // 🧠 調整狀態：改成「閒置（橘燈）」，並設定自訂狀態文字
    client.user.setPresence({
        status: 'idle',
        activities: [{
            name: 'customstatus',
            type: 4,
            state: '正在觀測核心控制室的心理逆流與光之種進度...'
        }]
    });

    // 🚀 啟動時自動發送上線通知訊息
    try {
        const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
        if (channel) {
            const loginEmbed = new EmbedBuilder()
                .setTitle("🟢 系統連線：AI 助理 Angela 已重新上線")
                .setColor(0x00b4d8)
                .setDescription("「主管，精神脈衝已重新對齊。高頻社交觀測模組與核心防禦矩陣已成功初始化。」")
                .addFields(
                    { name: "📡 觀測目標", value: `@${TARGET_USER.username}`, inline: true },
                    { name: "⏱️ 監聽頻率", value: "每 1 分鐘 / 1 次 (極速脈衝)", inline: true },
                    { name: "🔔 廣播通知", value: `新動態將自動 Ping 該身分組`, inline: false }
                )
                .setFooter({ text: "腦葉公司行政中心 - 核心AI系統" })
                .setTimestamp();

            await channel.send({ embeds: [loginEmbed] });
            console.log("📢 已自動發送上線問候訊息至指定頻道。");
        }
    } catch (err) {
        console.error("❌ 啟動發送訊息失敗，請檢查頻道 ID 或機器人權限:", err.message);
    }
    
    // ⏰ 將自動定時輪詢縮短至 1 分鐘 (60000 毫秒)
    setInterval(checkTwitterUpdates, 60 * 1000);
    // 上線時立刻先檢查一次
    checkTwitterUpdates();
});

// 自動高頻輪詢處理器
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
            const itemRegex = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<guid[\s\S]*?>([\s\S]*?)<\/guid>/g;
            const match = itemRegex.exec(text);

            if (match) {
                let tweetContent = match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
                
                // 🛠️ 【修復完成】：直接精準替換開頭網域，徹底斷絕產生 vxvxtwitter 的可能
                const rawLink = match[2].trim().replace('http://', 'https://');
                const vxTweetLink = rawLink.replace(/https:\/\/[^\/]+/, 'https://vxtwitter.com');
                const tweetLink = rawLink.replace(/https:\/\/[^\/]+/, 'https://x.com');
                
                const tweetId = match[3].trim();

                // 初次運行，建立快取（避免重啟時拿舊推文瘋狂洗頻）
                if (!lastFetchedId) {
                    lastFetchedId = tweetId;
                    console.log(`📦 [${nodeUrl}] 成功建立 @${TARGET_USER.username} 的初始推文快取：${tweetId}`);
                    break;
                }

                // 🔔 發現真正的新推文！
                if (tweetId !== lastFetchedId) {
                    lastFetchedId = tweetId;
                    const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                    if (channel) {
                        const tweetEmbed = new EmbedBuilder()
                            .setTitle(`🔔 ${TARGET_USER.displayName}`)
                            .setColor(TARGET_USER.color)
                            .setDescription(tweetContent.length > 500 ? tweetContent.substring(0, 500) + "..." : tweetContent)
                            .setURL(tweetLink) // 內嵌卡片標題連結維持標準 x.com
                            .setTimestamp()
                            .setFooter({ text: `Angela 高頻監控 - @${TARGET_USER.username}` });

                        // 發送 Ping 身分組，並附上完全正確的 vx 傳送門以直接展開媒體播放器
                        await channel.send({ 
                            content: `📢 ${PING_ROLE_MENTION} **主管，觀測到官方發布了最新動態（內含直顯影像協定）！**\n傳送門：${vxTweetLink}`, 
                            embeds: [tweetEmbed] 
                        });
                    }
                }
                break; // 成功獲取，跳出多節點備援
            }
        } catch (error) {
            console.warn(`⚠️ 節點 [${nodeUrl}] 擷取異常 (${error.message})，嘗試下一個備援空間...`);
        }
    }
}

// 3. 訊息監聽與核心功能
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const msg = message.content.trim();

    // 指令：Ping 測試
    if (msg === '!ping') {
        return message.reply('pong！');
    }

    // 指令：關鍵字對話回應
    if (msg === '管理員' || msg === '主管') {
        return message.reply('主管，您好。我是您的 AI 助理 Angela。請下達您的指示，今天也請為了擴張「光之種」而努力。');
    }

    if (msg.toLowerCase() === 'lc' || msg === '腦葉公司') {
        return message.reply('「直面恐懼，創造未來。」請時刻注意收容單位的逆流計數器，主管。');
    }

    // 指令：🧪 手動強制測試指令 (同步應用全新網址解析邏輯)
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
                const itemRegex = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<guid[\s\S]*?>([\s\S]*?)<\/guid>/g;
                const match = itemRegex.exec(text);

                if (match) {
                    let tweetContent = match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
                    
                    // 🛠️ 手動測試同步修正：一階正則網域替換，徹底消滅 vxvxtwitter
                    const rawLink = match[2].trim().replace('http://', 'https://');
                    const vxTweetLink = rawLink.replace(/https:\/\/[^\/]+/, 'https://vxtwitter.com');
                    const tweetLink = rawLink.replace(/https:\/\/[^\/]+/, 'https://x.com');
                    
                    const testEmbed = new EmbedBuilder()
                        .setTitle(`📊 [手動觀測測試] ${TARGET_USER.displayName}`)
                        .setColor(0x3a86ff)
                        .setDescription(tweetContent)
                        .setURL(tweetLink)
                        .addFields({ name: "🔍 系統檢驗結果", value: `🟢 連線節點 \`${nodeUrl}\` 運作完美。1 分鐘微秒級高頻監控、身分組 Ping 與 vxtwitter 影片內嵌播放器皆已就緒。` })
                        .setTimestamp()
                        .setFooter({ text: "腦葉公司核心控制室 - 診斷監測" });

                    await message.reply({ 
                        content: `✅ **報告主管，擷取測試成功！這是官方目前的最新貼文：**\n(正式廣播時會自動通知: ${PING_ROLE_MENTION})\n測試傳送門：${vxTweetLink}`, 
                        embeds: [testEmbed] 
                    });
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

    // 指令：Steam API 連動 - 查詢邊獄公司即時在線人數
    if (msg === '!邊獄人數' || msg === '!limbusonline') {
        try {
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

    // 指令：心理學與運行紀錄報告
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
                { name: "📡 監聽機制", value: "1分鐘極速輪詢備援協定", inline: true },
                { name: "🔄 累計觀測次數", value: `${totalTweetsChecked} 次`, inline: true },
                { name: "🔔 廣播靶向身分組", value: PING_ROLE_MENTION, inline: true },
                { name: "📝 綜合觀測紀錄", value: "系統已切換為秒級臨界監控模式，並加載 vxtwitter 影片直顯解析。每當外部支部有情感能量爆發（新公告），將在 60 秒內自動對特定階級下達同步觀測引線。個體因過度符合外界賦予的標籤導致精神枯竭（Burnout）之狀態不影響此核心程序運行。", inline: false }
            )
            .setFooter({ text: "Angela 心理與系統觀測核心" })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    // 指令：🎲 腦葉公司 E.G.O 抽取與標籤分析系統
    if (msg === '!ego') {
        const egoList = [
            { name: "薄暮 (Twilight)", grade: "ALEPH", desc: "調和所有矛盾與偏見的終極大劍。暗示個體拒絕接受單一標籤，試圖在黑白混沌的世界中強行抓住平衡，常伴隨極度的精神內耗。" },
            { name: "失樂園 (Paradise Lost)", grade: "ALEPH", desc: "純白羽翼覆蓋的禁忌法杖。象徵對「完美標籤」的病態追求，個體容易因為試圖符合他人的神聖期望而陷入更深沉的 Burnout。" },
            { name: "擬態 (Mimicry)", grade: "ALEPH", desc: "由血肉扭曲而成的巨大刀刃。這代表個體擅長在不同環境中偽裝、完美貼上符合群體需求的標籤，然而面具之下，真實的自我正在逐漸被吞噬。" },
            { name: "黃金潮 (Gold Rush)", grade: "WAW", desc: "充滿貪婪與欲望的金色重拳。個體過度依賴外界的「正面評價」作為自我的標籤，一旦這些掌聲停止，核心能量將會瞬間歸零。" },
            { name: "悔悟 (Penitence)", grade: "ZAYIN", desc: "樸實無華的荊棘之冠。代表個體內心正在進行深度的自我審視，試圖撕掉外界強加的標籤，回歸最真實的心理臨界點。" }
        ];

        const randomEgo = egoList[Math.floor(Math.random() * egoList.length)];
        
        const egoEmbed = new EmbedBuilder()
            .setTitle(`⚔️ 核心共鳴：E.G.O 同步觀測報告`)
            .setColor(0xd90429)
            .setDescription(`**${message.author.username}** 主管，根據您目前的心理觀測脈衝，提取出以下同步率最高的 E.G.O 武裝：`)
            .addFields(
                { name: "✨ 裝備名稱", value: `**${randomEgo.name}**`, inline: true },
                { name: "🔱 危險等級", value: `\`${randomEgo.grade}\``, inline: true },
                { name: "🧠 標籤與認知心理學解析", value: randomEgo.desc, inline: false }
            )
            .setFooter({ text: "Angela 心理提取模組" })
            .setTimestamp();

        return message.reply({ embeds: [egoEmbed] });
    }

    // 指令：⚠️ 核心控制室能量逆流警報卡片
    if (msg === '!逆流') {
        const alarmEmbed = new EmbedBuilder()
            .setTitle("⚠️ [WARNING] 腦葉公司核心控制室緊急通告")
            .setColor(0xff0000)
            .setDescription(`警告：當前頻道內觀測到嚴重的「心理逆流」現象，情緒計數器已降至臨界點！`)
            .addFields(
                { name: "🚨 逆流狀態", value: "第 3 階能障逆流 (Qliphoth Meltdown)", inline: false },
                { name: "👥 受影響對象", value: "全體在場人員（請勿發布不合規、引發群體 Burnout 之言論）", inline: false },
                { name: "🛠️ 處置方針", value: "請立刻停止認知扭曲行為，回歸本職工作。Angela 將持續監控此頻道的能量波動。", inline: false }
            )
            .setImage("https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop")
            .setFooter({ text: "腦葉公司最高行政控制中心" })
            .setTimestamp();

        return message.reply({ embeds: [alarmEmbed] });
    }

    // 指令：尋找伺服器內特定機器人
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

// 🔒 安全讀取環境變數 Token
const TOKEN = process.env.DISCORD_TOKEN;

client.login(TOKEN).catch(err => {
    console.error("❌ 機器人登入失敗，請檢查 Token 是否正確或過期：", err);
});
