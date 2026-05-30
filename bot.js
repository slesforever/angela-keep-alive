const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { pullIdentity } = require('./identitiesData.js'); // 引入你的抽卡模組

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Angela 系統運作正常。'));
app.listen(PORT, () => console.log(`網頁伺服器已在連接埠 ${PORT} 啟動`));

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] 
});

// 這裡放入你原本所有的推播邏輯函數 (checkTwitterUpdates 等)
// ... (請將你原有的推播函數放在這裡) ...

client.once('ready', () => {
    console.log(`🤖 Angela 已成功登入為：${client.user.tag}`);
    // 這裡放入你原本的 setInterval 啟動邏輯
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim();

    // 1. 抽卡系統 (優先處理)
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


});

client.login(process.env.DISCORD_TOKEN);
