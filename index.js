const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// 1. 建立一個簡單的網頁伺服器，讓 Render 和 GitHub 鬧鐘可以來踢門（Keep Alive）
app.get('/', (req, res) => {
    res.send('Angela 運作中！');
});

app.listen(PORT, () => {
    console.log(`網頁伺服器已在連接埠 ${PORT} 啟動`);
});

// 2. Discord 機器人主程式
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`🤖 遵從您的指示，Angela 已成功登入為：${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 測試指令
    if (message.content === '!ping') {
        message.reply('pong！');
    }
});

// ⚠️ 請在這裡貼上你的 Discord Bot Token ⚠️
const TOKEN = "你的Discord機器人Token";

client.login(TOKEN).catch(err => {
    console.error("❌ 機器人登入失敗，請檢查 Token 是否正確：", err);
});
