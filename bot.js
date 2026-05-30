// 在 bot.js 最上方
const { pullIdentity } = require('./identitiesData.js');

// 在 client.on('messageCreate', ...) 區塊中：
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim().toLowerCase();

    if (msg === '!pull' || msg === '!10pulls') {
        const count = (msg === '!10pulls') ? 10 : 1;
        let results = [];

        for (let i = 0; i < count; i++) {
            const rand = Math.random();
            let rarity = (rand < 0.029) ? '000' : (rand < 0.13) ? '00' : '0';
            
            // 直接呼叫剛剛引入的函數
            results.push(`${pullIdentity(rarity)} (${rarity === '000' ? '★★★' : rarity === '00' ? '★★' : '★'})`);
        }
        
        return message.reply(count === 10 ? `✨ **十連抽結果：**\n${results.join('\n')}` : `🎯 **單抽結果：**\n${results[0]}`);
    }
    // ... 原本的推播代碼 ...
});
