// 在你的 bot.js 最上方加入這一行
import { pullIdentity } from './gachaLogic.js';

// 然後在 messageCreate 的判斷區塊裡直接使用：
if (msg === '!pull' || msg === '!10pulls') {
    const isTenPull = msg === '!10pulls';
    const count = isTenPull ? 10 : 1;
    let results = [];

    for (let i = 0; i < count; i++) {
        const rand = Math.random();
        let rarity = '0';
        if (rand < 0.029) rarity = '000'; 
        else if (rand < 0.13) rarity = '00'; 
        
        results.push(`${pullIdentity(rarity)} (${rarity === '000' ? '★★★' : rarity === '00' ? '★★' : '★'})`);
    }

    const replyMsg = isTenPull 
        ? `✨ **十連抽結果：**\n${results.join('\n')}`
        : `🎯 **單抽結果：**\n${results[0]}`;
    
    return message.reply(replyMsg);
}
