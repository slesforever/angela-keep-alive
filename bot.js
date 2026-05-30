// 在 bot.js 的 messageCreate 事件區塊中：
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim().toLowerCase();

    // 抽卡指令直接放在這裡
    if (msg === '!pull' || msg === '!10pulls') {
        // 1. 動態引入資料檔
        const { identities } = await import('./identitiesData.js');
        
        // 2. 設定 UP (這裡也可以獨立出來，但為了簡單先寫在這)
        const up = { '000': "［蜘蛛巢：指環 父輩］鴻璐", '00': "［黑獸 巳支部］格里高爾" };
        
        const count = (msg === '!10pulls') ? 10 : 1;
        let results = [];

        for (let i = 0; i < count; i++) {
            const rand = Math.random();
            let rarity = (rand < 0.029) ? '000' : (rand < 0.13) ? '00' : '0';
            
            // 運算：讀取 identities 物件
            let character;
            const pool = identities[rarity]; // 從你原本的檔案讀取！
            
            if (up[rarity] && Math.random() < 0.5) {
                character = up[rarity];
            } else {
                character = pool[Math.floor(Math.random() * pool.length)];
            }
            results.push(`${character} (${rarity === '000' ? '★★★' : rarity === '00' ? '★★' : '★'})`);
        }
        
        return message.reply(count === 10 ? `✨ **十連抽結果：**\n${results.join('\n')}` : `🎯 **單抽結果：**\n${results[0]}`);
    }

    // ... 下面接你原本的推播指令 ...
});
