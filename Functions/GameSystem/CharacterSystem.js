// Functions/GameSystem/CharacterSystem.js
// 角色等級、連結提升(Uptie)、絲線(Thread)管理

const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { SINNERS, SINNER_NAMES, UPTIE_COSTS } = require('./Data/SinnersData.js');

const CHAR_CHANNEL_ID = process.env.CHAR_CHANNEL_ID || process.env.NOTIFY_CHANNEL_ID || '1402282604165730348';
const charCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

// ─── 資料格式 ─────────────────────────────────────────────────
function defaultCharData() {
    const sinners = {};
    for (const name of SINNER_NAMES) {
        sinners[name] = {
            level: 1,
            uptie: 1,
            equippedIdentity: `［邊獄公司 罪人］${name}`,
            exp: 0,
        };
    }
    return {
        sinners,
        threads: 0,
        ego_coupons: 0,
        totalBattles: 0,
        totalWins: 0,
    };
}

async function loadCharData(client, userId) {
    const cached = charCache.get(userId);
    if (cached && Date.now() - cached.time < CACHE_TTL) return JSON.parse(JSON.stringify(cached.data));

    try {
        const channel = await client.channels.fetch(CHAR_CHANNEL_ID);
        if (!channel) return defaultCharData();
        const msgs = await channel.messages.fetch({ limit: 100 });
        const found = msgs.find(m => m.author.bot && m.content.startsWith(`⚔️ CHAR_SAVE || ${userId} ||`));
        if (found) {
            const data = JSON.parse(found.content.split(' || ')[2]);
            charCache.set(userId, { data, time: Date.now() });
            return JSON.parse(JSON.stringify(data));
        }
    } catch (e) {
        console.error(`[CharSystem] 讀取失敗 ${userId}:`, e.message);
    }
    return defaultCharData();
}

async function saveCharData(client, userId, data) {
    charCache.set(userId, { data: JSON.parse(JSON.stringify(data)), time: Date.now() });
    try {
        const channel = await client.channels.fetch(CHAR_CHANNEL_ID);
        if (!channel) return;
        await channel.send(`⚔️ CHAR_SAVE || ${userId} || ${JSON.stringify(data)}`);
    } catch (e) {
        console.error(`[CharSystem] 儲存失敗 ${userId}:`, e.message);
    }
}

// ─── 顯示罪人狀態 ─────────────────────────────────────────────
function buildSinnerEmbed(sinner, sinnerData) {
    const uptieStars = '◆'.repeat(sinnerData.uptie) + '◇'.repeat(4 - sinnerData.uptie);
    const nextUptie = sinnerData.uptie < 4 ? UPTIE_COSTS[sinnerData.uptie] : null;
    const skills = sinner.skills.map((sk, i) =>
        `\`${i + 1}.\` **${sk.name}** [${sk.type}/${sk.sin}] 幣×${sk.coins} 基礎:${sk.base} 硬幣:+${sk.coin}` +
        (sk.effect ? ` → ${sk.effect.name}×${sk.effect.stacks}` : '')
    ).join('\n');

    return new EmbedBuilder()
        .setTitle(`👤 ${sinner.name} / ${sinner.nameEn}`)
        .setColor(0x5865f2)
        .addFields(
            { name: '📊 狀態', value: `Lv.**${sinnerData.level}** ｜ 連結提升：${uptieStars}`, inline: true },
            { name: '❤️ 基礎HP', value: `${sinner.hp}`, inline: true },
            { name: '⚡ 速度', value: `${sinner.minSpd}~${sinner.maxSpd}`, inline: true },
            { name: '⚔️ 技能（主動）', value: skills, inline: false },
            { name: '🌟 被動', value: `**${sinner.passive.name}**：${sinner.passive.desc}`, inline: false },
            { name: '🔧 裝備身分', value: sinnerData.equippedIdentity, inline: false },
            nextUptie
                ? { name: '🔗 下一階連結提升費用', value: `🧵 絲線 ×${nextUptie}`, inline: true }
                : { name: '🔗 連結提升', value: '已達最高等級（T4）', inline: true }
        )
        .setFooter({ text: `主要罪業：${sinner.primarySin} | 防禦等級：${sinner.defLevel}` });
}

// ─── 指令：!sinner [罪人名] ────────────────────────────────────
async function handleSinner(client, message) {
    const args = message.content.trim().split(/\s+/);
    const name = args.slice(1).join(' ');

    if (!name) {
        const { loadCharData: lcd } = require('./CharacterSystem.js');
        const data = await loadCharData(client, message.author.id);
        const lines = SINNER_NAMES.map(n => {
            const sd = data.sinners[n] || { level: 1, uptie: 1 };
            return `• **${n}** Lv.${sd.level} T${sd.uptie}`;
        });
        const embed = new EmbedBuilder()
            .setTitle('📋 所有罪人狀態')
            .setColor(0x74b9ff)
            .setDescription(lines.join('\n'))
            .addFields({ name: '🧵 絲線', value: `${data.threads}`, inline: true })
            .setFooter({ text: '使用 !sinner [罪人名] 查看詳細資訊' });
        return message.reply({ embeds: [embed] });
    }

    const sinner = SINNERS[name];
    if (!sinner) {
        return message.reply(`❌ 找不到罪人「${name}」。\n可用名稱：${SINNER_NAMES.join('、')}`);
    }
    const charData = await loadCharData(client, message.author.id);
    const sinnerData = charData.sinners[name] || { level: 1, uptie: 1, equippedIdentity: `LCB ${name}` };
    return message.reply({ embeds: [buildSinnerEmbed(sinner, sinnerData)] });
}

// ─── 指令：!uptie [罪人名] ─────────────────────────────────────
async function handleUptie(client, message) {
    const args = message.content.trim().split(/\s+/);
    const name = args.slice(1).join(' ');
    if (!name) return message.reply('❌ 用法：`!uptie [罪人名]`');

    const sinner = SINNERS[name];
    if (!sinner) return message.reply(`❌ 找不到罪人「${name}」`);

    const charData = await loadCharData(client, message.author.id);
    const sd = charData.sinners[name];

    if (sd.uptie >= 4) return message.reply(`「${name}」已達最高連結等級 T4。`);

    const cost = UPTIE_COSTS[sd.uptie];
    if (charData.threads < cost) {
        return message.reply(`❌ 絲線不足！需要 🧵×${cost}，目前擁有 🧵×${charData.threads}`);
    }

    charData.threads -= cost;
    sd.uptie += 1;
    await saveCharData(client, message.author.id, charData);

    const tierStars = '◆'.repeat(sd.uptie) + '◇'.repeat(4 - sd.uptie);
    const embed = new EmbedBuilder()
        .setTitle(`🔗 連結提升成功！`)
        .setColor(0xffd166)
        .setDescription(`**${name}** 的連結等級提升至 **T${sd.uptie}** ${tierStars}\n消耗：🧵 絲線 ×${cost}\n剩餘：🧵 ${charData.threads}`)
        .setTimestamp();
    return message.reply({ embeds: [embed] });
}

// ─── 指令：!equip [罪人名] [身分名] ───────────────────────────
async function handleEquip(client, message) {
    const content = message.content.trim();
    const match = content.match(/^!equip\s+(.+?)\s*\|\s*(.+)$/);
    if (!match) {
        return message.reply('❌ 用法：`!equip [罪人名] | [身分名稱]`\n例：`!equip 李箱 | ［劍契 殺手］李箱`');
    }
    const [, sinnerName, identityName] = match;
    if (!SINNERS[sinnerName]) return message.reply(`❌ 找不到罪人「${sinnerName}」`);

    const charData = await loadCharData(client, message.author.id);
    charData.sinners[sinnerName].equippedIdentity = identityName.trim();
    await saveCharData(client, message.author.id, charData);

    const embed = new EmbedBuilder()
        .setTitle('🔧 裝備更新')
        .setColor(0x2ed573)
        .setDescription(`**${sinnerName}** 現在裝備：\n${identityName.trim()}`)
        .setTimestamp();
    return message.reply({ embeds: [embed] });
}

// ─── 指令：!threads ────────────────────────────────────────────
async function handleThreads(client, message) {
    const charData = await loadCharData(client, message.author.id);
    const embed = new EmbedBuilder()
        .setTitle('🧵 絲線持有量')
        .setColor(0xa55eea)
        .setDescription(
            `目前擁有：**🧵 ${charData.threads} 絲線**\n\n` +
            `**連結提升消耗：**\n` +
            `T1→T2：🧵×20\nT2→T3：🧵×40\nT3→T4：🧵×80\nT4 最高：🧵×150 (已滿)\n\n` +
            `_絲線可透過戰鬥勝利或完成鏡光迷宮樓層獲得。_`
        )
        .setTimestamp();
    return message.reply({ embeds: [embed] });
}

module.exports = {
    loadCharData,
    saveCharData,
    handleSinner,
    handleUptie,
    handleEquip,
    handleThreads,
};
