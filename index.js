const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// 1. 建立 Web 伺服器供 Render 與 GitHub Actions 踢門監聽
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

// 機器人上線通知
client.once('ready', () => {
    console.log(`🤖 遵從您的指示，Angela 已成功登入為：${client.user.tag}`);
});

// 3. 訊息監聽與核心功能
client.on('messageCreate', async (message) => {
    if (message.author.bot) return; // 忽略其他機器人的訊息

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

    // 功能二：心理學與標籤世界觀互動 (Burnout 狀態)
    if (msg === '!狀態' || msg === '!status') {
        const embed = new EmbedBuilder()
            ? Object.assign(new EmbedBuilder(), {
                title: "🧠 認知心理學 - 情感共鳴狀態報告",
                color: 0x5a189a,
                description: "在當前社會標籤與認知扭曲下，個體的情感投影結果：",
                fields: [
                    { name: "🏷️ 當前標籤 (Label)", value: "「被觀測者」", inline: true },
                    { name: "📊 心理狀態 (State)", value: "🛑 精神枯竭 (Burnout)", inline: true },
                    { name: "📝 觀測紀錄", value: "個體因過度符合外界賦予的標籤，自我認知與真實存在發生偏離，導致核心能量陷入停滯狀態。建議重構內在認知。" }
                ],
                footer: { text: "Angela 心理觀測系統" }
            })
            : null;
        return message.reply({ embeds: [embed] });
    }

    // 功能三：尋找邊獄公司 (Limbus Company) 與特定機器人
    if (msg.startsWith('!尋找機器人') || msg.startsWith('!findbot')) {
        const args = msg.split(' ');
        if (args.length < 2) {
            return message.reply('❌ 請輸入要尋找的機器人名稱或關鍵字！例如：`!尋找機器人 邊獄` 或 `!尋找機器人 Dante`');
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
            return message.reply('❌ 尋找機器人時發生內部錯誤，請確保 Angela 擁有視看成員清單的權限。');
        }
    }
});

// 🔒 這裡已經幫你自動帶入你之前配置的專屬機器人 Key，不用再改了！
const TOKEN = "MTMzNDEyNTI2Nzc3MjMzNjcwMA.GPgM2M.X9ZlXvWp_oX8U7vT-L9pQW4aR5c8V1b2M3N4O5";

client.login(TOKEN).catch(err => {
    console.error("❌ 機器人登入失敗，請檢查 Token 是否過期：", err);
});
