// Functions/GameSystem/GiveAwaySystem.js
const { EmbedBuilder } = require('discord.js');

// 儲存全局的關卡獎勵倍率，預設為 1 倍
let currentBuffMultiplier = 1;

async function handleGiveAway(client, message) {
    // 核心管理權限檢查
    if (!message.member.permissions.has('Administrator')) {
        return message.reply('「很抱歉主管，您當前的精神權限不足以發動全系統物資撥款。」');
    }

    const args = message.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();

    // =================【 1. 特定人撥款：!givelunacy @玩家 數量 】=================
    if (command === '!givelunacy') {
        const targetUser = message.mentions.users.first();
        const amount = parseInt(args[2]);

        if (!targetUser || isNaN(amount)) {
            return message.reply('❌ 報告主管，發放格式錯誤。請使用：`!givelunacy @玩家 數量` (例如：`!givelunacy @Angela 1300`)');
        }

        // 動態載入資料庫模組，直接將狂氣打入該玩家的頻道存檔中
        const { loadUserInventory, saveUserInventory } = require('./PacksAndData.js');
        
        const loadingMsg = await message.reply(`「正在連線至核心通道，嘗試為 <@${targetUser.id}> 進行精神物資對齊...」`);
        
        // 撈出舊背包 ➔ 塞入新道具 ➔ 回寫存檔
        const userInventory = await loadUserInventory(client, targetUser.id);
        userInventory.push(`💎 狂氣 x${amount}`);
        await saveUserInventory(client, targetUser.id, userInventory);

        const giveUserEmbed = new EmbedBuilder()
            .setTitle('💎 腦葉行政中心 - 單人精神物資撥款')
            .setColor(0x00b4d8)
            .setDescription(`### **發放對象：** <@${targetUser.id}>\n### **撥款項目：** 💎 **狂氣 x${amount}**\n\n「物資已精確折射並寫入該主管的個人雲端收容倉庫。」`)
            .setFooter({ text: '發放人：核心管理 AI 安潔拉' })
            .setTimestamp();

        return loadingMsg.edit({ content: null, embeds: [giveUserEmbed] });
    }

    // =================【 2. 全服獎勵公告：!updaterewards (絕不 @everyone) 】=================
    if (command === '!updaterewards') {
        const rewardEmbed = new EmbedBuilder()
            .setTitle('🎁 邊獄公司 - 全伺服器特別補償發放')
            .setColor(0xffa502)
            .setDescription(`### **全體發放項目：**\n• 📦 **狂氣 (Lunacy) x1300**\n• 🚂 **特別提取券 x1**\n\n「因應精神監測脈衝不穩進行的架構重組，補償已正式下發。請各位主管抽空檢視個人倉庫。」`)
            .setFooter({ text: '發放人：核心管理 AI 安潔拉' })
            .setTimestamp();

        // 遵照主管吩咐，移除了所有 @everyone 字眼，乾淨俐落發送
        return message.channel.send({ embeds: [rewardEmbed] });
    }

    // =================【 3. 調整獎勵倍率：!updatebuff 倍數 】=================
    if (command === '!updatebuff') {
        const multiplier = parseFloat(args[1]);
        if (isNaN(multiplier) || multiplier <= 0) {
            return message.reply('❌ 報告主管，設定失敗。請使用：`!updatebuff 倍數` (例如：`!updatebuff 2.5`)');
        }

        currentBuffMultiplier = multiplier;

        const buffEmbed = new EmbedBuilder()
            .setTitle('⚡ 腦葉核心能量塔 - 獎勵脈衝過載')
            .setColor(0xa55eea)
            .setDescription(`### 📢 **全服關卡報酬倍率已調整為：【 ${currentBuffMultiplier} 倍 】**\n\n「當前區域的精神增幅器已調整完畢。現在執行 \`!stage\` 壓制異想體，將會獲得加倍的戰利品回報。」`)
            .setFooter({ text: '核心能量塔控制台 — Angela' })
            .setTimestamp();

        return message.channel.send({ embeds: [buffEmbed] });
    }
}

// 導出函數與動態獲取倍率的閉包，供 Stages.js 讀取
module.exports = { 
    handleGiveAway, 
    getBuffMultiplier: () => currentBuffMultiplier 
};
