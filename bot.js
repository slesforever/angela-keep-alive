client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const msg = message.content.trim();

    // 1. 優先處理抽卡指令 (一定要放在最前面，避免被其他 return 阻斷)
    if (msg === '!pull' || msg === '!10pulls') {
        try {
            const { pullIdentity } = await import('./gachaLogic.js');
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
        } catch (err) {
            console.error("抽卡模組載入失敗:", err);
            return message.reply("❌ 抽卡系統無法運作，請檢查模組路徑。");
        }
    }

    // 2. 接著才是原本的 !ping 和其他指令
    if (msg === '!ping') return message.reply('pong！');
    
    // ... 後面接原本的其他指令 (管理員, lc, !狀態 等)
});
