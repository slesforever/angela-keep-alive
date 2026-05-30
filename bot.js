import { Client, GatewayIntentBits } from 'discord.js';
import { pullIdentity } from './gachaLogic.js';

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

client.on('messageCreate', (message) => {
    // 忽略機器人自己的訊息
    if (message.author.bot) return;

    // 處理 !pull (單抽)
    if (message.content === '!pull') {
        // 這裡設定機率：例如給 1% 三星，9% 二星，90% 一星
        const roll = Math.random();
        let rarity = '0';
        if (roll < 0.01) rarity = '000';
        else if (roll < 0.10) rarity = '00';

        const result = pullIdentity(rarity);
        message.reply(`🎯 抽卡結果：\n**${result}** (稀有度: ${rarity})`);
    }

    // 處理 !10pulls (十連抽)
    if (message.content === '!10pulls') {
        let results = [];
        for (let i = 0; i < 10; i++) {
            const roll = Math.random();
            let rarity = '0';
            if (roll < 0.01) rarity = '000';
            else if (roll < 0.10) rarity = '00';
            
            results.push(pullIdentity(rarity));
        }
        
        message.reply(`✨ 十連抽結果：\n${results.map((res, i) => `${i+1}. ${res}`).join('\n')}`);
    }
});

client.login('你的_BOT_TOKEN_在這裡');
