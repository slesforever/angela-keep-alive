// Functions/GameSystem/PacksAndData.js
const { EmbedBuilder } = require('discord.js');

// 主管指定的專屬資料庫儲存頻道
const STORAGE_CHANNEL_ID = '1510947300212477972';

/**
 * 核心機制：從 Discord 指定頻道資料庫讀取玩家背包 JSON
 */
async function loadUserInventory(client, userId) {
    try {
        const channel = await client.channels.fetch(STORAGE_CHANNEL_ID);
        if (!channel) {
            console.error('❌ 找不到指定的儲存頻道，請檢查機器人權限。');
            return [];
        }

        // 抓取該頻道最近的 100 則備份訊息
        const messages = await channel.messages.fetch({ limit: 100 });
        
        // 尋找該玩家最新發布的那一筆存檔紀錄
        const targetMsg = messages.find(m => m.content.startsWith(`📥 DATA_SAVE || ${userId} ||`));

        if (targetMsg) {
            const parts = targetMsg.content.split(' || ');
            const jsonStr = parts[2]; // 提取出 JSON 字串
            return JSON.parse(jsonStr);
        }
    } catch (err) {
        console.error(`❌ 讀取玩家 ${userId} 頻道存檔失敗:`, err.message);
    }
    return []; // 若無紀錄則回傳空背包
}

/**
 * 核心機制：將玩家最新的背包數據轉為字串，射入 Discord 頻道存檔
 */
async function saveUserInventory(client, userId, inventory) {
    try {
        const channel = await client.channels.fetch(STORAGE_CHANNEL_ID);
        if (!channel) return;

        // 使用特殊格式前綴，方便 loadUserInventory 進行精準字串切割與過濾
        const formatContent = `📥 DATA_SAVE || ${userId} || ${JSON.stringify(inventory)}`;
        await channel.send(formatContent);
        console.log(`💾 [核心資料庫] 玩家 ${userId} 的最新數據已成功上傳至儲存頻道！`);
    } catch (err) {
        console.error(`❌ 寫入玩家 ${userId} 頻道存檔失敗:`, err.message);
    }
}

/**
 * 指令解析大門
 */
async function handleInventory(client, message) {
    const userId = message.author.id;
    const msg = message.content.trim();

    // 1. 處理 !list (顯示當前物資總池)
    if (msg.startsWith('!list')) {
        const identitiesData = require('./Pulls/identitiesData.js');
        const listEmbed = new EmbedBuilder()
            .setTitle('📂 Angela 檔案庫 - 當前可提取物資總覽')
            .setColor(0x74b9ff)
            .addFields(
                { name: '🔮 E.G.O 池', value: identitiesData.pool["Egos"].join('、\n') || '無' },
                { name: '🔥 精英 000 人格', value: identitiesData.pool["000"].join('、\n') || '無' },
                { name: '⭐ 標準 00 人格', value: identitiesData.pool["00"].join('、\n') || '無' }
            )
            .setFooter({ text: '輸入 !pull 或 !十連 即可消耗狂氣進行人格提取。' });
        return message.reply({ embeds: [listEmbed] });
    }

    // 2. 處理 !pack 或 !bag (從頻道資料庫即時同步並渲染)
    if (msg.startsWith('!pack') || msg === '!bag') {
        // 給予玩家讀取反饋，因為抓取 Discord 訊息需要約 0.5 秒的時間
        const loadingMsg = await message.reply('「主管，正在從腦葉核心紀錄通道中，遠端對齊您的個人收容數據...」');

        // 呼叫頻道資料庫讀取
        const userInventory = await loadUserInventory(client, userId);

        if (userInventory.length === 0) {
            return loadingMsg.edit('「主管，您的個人收容室在核心通道中空空如也。請先使用 `!pull` 提取您的人格。」');
        }

        // 統計重覆獲得的道具數量
        const itemCounts = {};
        userInventory.forEach(item => {
            itemCounts[item] = (itemCounts[item] || 0) + 1;
        });

        const inventoryList = Object.entries(itemCounts)
            .map(([item, count]) => `• **${item}** x${count}`)
            .join('\n');

        const packEmbed = new EmbedBuilder()
            .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
            .setTitle('🗃️ 邊獄公司 - 員工個人收容倉庫 (雲端備份版)')
            .setColor(0x2ed573)
            .setDescription(`### **當前已同步的人格與自我 (E.G.O)：**\n\n${inventoryList}`)
            .setFooter({ text: `儲存軌道識別碼: ${userId} | 總計 ${userInventory.length} 件收容物` })
            .setTimestamp();

        return loadingMsg.edit({ content: null, embeds: [packEmbed] });
    }
}

module.exports = { handleInventory, loadUserInventory, saveUserInventory };
