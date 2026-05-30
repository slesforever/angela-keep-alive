// 在 bot.js 最上面
import { pullIdentity } from './identitiesData.js'; 

// 在你的 messageCreate 監聽區塊中：
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content === '!pull' || message.content === '!10pulls') {
        const count = message.content === '!10pulls' ? 10 : 1;
        let results = [];

        for (let i = 0; i < count; i++) {
            const rand = Math.random();
            let rarity = rand < 0.029 ? '000' : rand < 0.13 ? '00' : '0';
            results.push(`${pullIdentity(rarity)} (${rarity === '000' ? '★★★' : '★★'})`);
        }
        
        message.reply(count === 10 ? `✨ 十連抽：\n${results.join('\n')}` : `🎯 單抽：${results[0]}`);
    }
});
