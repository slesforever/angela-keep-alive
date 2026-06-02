// Functions/GameSystem/Pulls/PullSystem.js
const { EmbedBuilder } = require('discord.js');
const identitiesData = require('./identitiesData.js');

async function executePull(client, message) {
    // 【關鍵】動態引入 PacksAndData.js 的雲端讀寫工具
    const { loadUserInventory, saveUserInventory } = require('../PacksAndData.js');
    
    const msg = message.content.trim();
    const userId = message.author.id;
    
    let pullCount = 1;
    if (msg === '!十連' || msg.includes('10')) {
        pullCount = 10;
    }

    // Step 1. 先從指定頻道資料庫撈出玩家以前存下來的舊背包
    const userInventory = await loadUserInventory(client, userId);

    const results = [];
    const all000 = identitiesData.pool["000"];
    const all00 = identitiesData.pool["00"];
    const all0 = identitiesData.pool["0"];
    const allEgos = identitiesData.pool["Egos"];
    const rateUp000 = identitiesData.upTargets["000"] || [];

    // Step 2. 開始抽卡演算法
    for (let i = 0; i < pullCount; i++) {
        const rate = Math.random() * 100;
        let reward = "";

        if (rate < 1.5) { 
            reward = allEgos[Math.floor(Math.random() * allEgos.length)];
        } else if (rate < 4.5) { 
            if (rateUp000.length && Math.random() > 0.5) {
                reward = `✨ [★3 RateUp] ${rateUp000[Math.floor(Math.random() * rateUp000.length)]}`;
            } else {
                reward = `★3 ${all000[Math.floor(Math.random() * all000.length)]}`;
            }
        } else if (rate < 20) { 
            reward = `★2 ${all00[Math.floor(Math.random() * all00.length)]}`;
        } else { 
            reward = `★1 ${all0[Math.floor(Math.random() * all0.length)]}`;
        }
        
        results.push(reward);
        userInventory.push(reward); // 將新獎勵源源不絕地塞進歷史背包陣列中
    }

    // Step 3. 將融合了新獎勵的完整背包，當場打包成 JSON 發射回 1510947300212477972 頻道
    await saveUserInventory(client, userId, userInventory);

    // Step 4. 回報前端玩家
    const pullEmbed = new EmbedBuilder()
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setTitle(pullCount === 10 ? '🚂 腦葉物資梅菲斯特號 - 十連抽取報告' : '🚂 腦葉物資梅菲斯特號 - 單次抽取報告')
        .setColor(pullCount === 10 ? 0xff4757 : 0xeccc68)
        .setDescription(`### 🎁 抽取結果如下：\n${results.map((r, idx) => `${idx + 1}. ${r}`).join('\n')}\n\n💾 *「數據已成功同步備份至指定核心觀測頻道。」*`)
        .setFooter({ text: '「主管，每一次人格提取，都是在向平行世界借調可能性。」— Angela' })
        .setTimestamp();

    return message.reply({ embeds: [pullEmbed] });
}

module.exports = { executePull };
