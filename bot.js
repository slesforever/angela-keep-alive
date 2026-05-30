client.on('messageCreate', (message) => {
    // 強制測試：完全不篩選，只要你發任何訊息，它就回傳
    if (message.content === '!debug') {
        message.reply("Angela 系統核心接收成功！");
    }
});
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Angela 系統運作正常。'));
app.listen(PORT, () => console.log(`伺服器啟動於 ${PORT}`));

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] 
});

client.once('ready', () => {
    console.log(`🤖 Angela 已上線: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- 抽卡系統區塊 ---
    if (message.content === '!pull' || message.content === '!10pulls') {
        try {
            // 動態引入，確保不受 require/import 混用影響
            const { pullIdentity } = await import('./gachaLogic.js');
            const isTen = message.content === '!10pulls';
            let results = [];
            
            for (let i = 0; i < (isTen ? 10 : 1); i++) {
                const rand = Math.random();
                let rarity = rand < 0.029 ? '000' : rand < 0.13 ? '00' : '0';
                results.push(`${pullIdentity(rarity)} (${rarity === '000' ? '★★★' : rarity === '00' ? '★★' : '★'})`);
            }
            return message.reply(isTen ? `✨ **十連抽：**\n${results.join('\n')}` : `🎯 **單抽：**\n${results[0]}`);
        } catch (err) {
            console.error("抽卡錯誤:", err);
            return message.reply("❌ 抽卡模組載入失敗，請確認檔案路徑。");
        }
    }

    // --- 原本的推播指令與其他功能 ---
    if (message.content === '!ping') return message.reply('pong！');
    if (message.content === '!狀態') {
        return message.reply('🧠 系統運作正常，目前監測機制：1分鐘極速輪詢。');
    }
    // ... 在這裡放入你原本其他的 if 判斷 ...
});

client.login(process.env.DISCORD_TOKEN);
