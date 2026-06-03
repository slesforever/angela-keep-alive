// Functions/GameSystem/CharacterSystem.js
// 罪人資訊、連結提升、裝備管理（支援 60 級 + 碎片/經驗卷）
const { EmbedBuilder } = require('discord.js');
const { SINNERS, SINNER_NAMES, UPTIE_COSTS, getSkillList } = require('./Data/SinnersData.js');
const { getOrCreatePlayer, savePlayerData, calcLevelCost } = require('./PacksAndData.js');

// ─── !sinner ──────────────────────────────────────────────────
async function handleSinner(_client, message) {
    const args = message.content.trim().split(/\s+/);
    const name = args.slice(1).join(' ');

    const player = getOrCreatePlayer(null, message.author.id, message.author.username);

    if (!name) {
        const lines = SINNER_NAMES.map(n => {
            const sd  = player.sinners?.[n] || {};
            const ut  = sd.uptie || 1;
            const lv  = player.identityLevels?.[`LCB ${n}`] || player.identityLevels?.[n] || 1;
            return `• **${n}** Lv.${lv}/60 ｜ T${ut} ｜ 裝備：${sd.equippedIdentity ? sd.equippedIdentity.slice(0,24) : 'LCB'}`;
        });
        return message.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📋 全罪人狀態')
                .setColor(0x74b9ff)
                .setDescription(lines.join('\n'))
                .addFields(
                    { name:'🧵 紡錘', value:`${player.thread}`, inline:true },
                    { name:'📦 人格碎片', value:`${player.fragments||0}`, inline:true },
                    { name:'📜 經驗卷', value:`${player.expScrolls||0}`, inline:true },
                )
                .setFooter({ text:'!sinner [罪人名] 查看詳細 ｜ !uptie [名] 連結提升' })]
        });
    }

    if (!SINNERS[name]) return message.reply(`❌ 找不到「${name}」\n可用：${SINNER_NAMES.join('、')}`);

    const s    = SINNERS[name];
    const sd   = player.sinners?.[name] || { uptie:1, equippedIdentity:`LCB ${name}` };
    const lv   = player.identityLevels?.[`LCB ${name}`] || player.identityLevels?.[name] || 1;
    const ut   = sd.uptie || 1;
    const stars = '◆'.repeat(ut) + '◇'.repeat(4-ut);

    const skills = getSkillList(s);
    const skillLines = skills.map((sk, i) =>
        `**${i+1}.${sk.name}** [${sk.type}/${sk.sin}]\n` +
        `　基礎:${sk.clashbase} 硬幣:${sk.coins}×+${sk.clashpower} 攻:${sk.attack}${sk.effect?` → ${sk.effect.name}×${sk.effect.stacks}`:''}`
    ).join('\n');

    const nextCost  = calcLevelCost(lv, 1);
    const uptieCost = ut < 4 ? UPTIE_COSTS[ut] : null;

    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle(`👤 ${s.name} / ${s.nameEn}`)
            .setColor(0x5865f2)
            .addFields(
                { name:'📊 等級',     value:`Lv.**${lv}** / 60`, inline:true },
                { name:'🔗 連結',     value:`${stars} (T${ut})`,  inline:true },
                { name:'⚡ 速度',     value:`${s.minSpd}~${s.maxSpd}`, inline:true },
                { name:'❤️ 基礎HP',  value:`${s.hp}`,            inline:true },
                { name:'🛡️ 防禦等級',value:`${s.defLevel}`,      inline:true },
                { name:'✨ 主罪業',   value:`${s.primarySin}`,    inline:true },
                { name:'⚔️ 主動技能', value:skillLines,           inline:false },
                { name:'🌟 被動',    value:`**${s.passive.name}**：${s.passive.desc}`, inline:false },
                { name:'🔧 裝備人格', value:sd.equippedIdentity || `LCB ${name}`, inline:false },
                { name:'📈 升1級費用', value:`碎片×${nextCost.frags}${nextCost.scrolls?` + 卷×${nextCost.scrolls}`:''}`, inline:true },
                uptieCost
                    ? { name:'🔗 下次連結提升', value:`🧵 紡錘×${uptieCost}`, inline:true }
                    : { name:'🔗 連結提升',     value:'已達最高 T4',          inline:true },
            )
            .setFooter({ text:`使用 !pack 的🔼人格培育升等 ｜ !uptie ${name} 連結提升` })]
    });
}

// ─── !uptie ───────────────────────────────────────────────────
async function handleUptie(_client, message) {
    const args = message.content.trim().split(/\s+/);
    const name = args.slice(1).join(' ');
    if (!name) return message.reply('❌ 用法：`!uptie [罪人名]`');
    if (!SINNERS[name]) return message.reply(`❌ 找不到「${name}」`);

    const player = getOrCreatePlayer(null, message.author.id, message.author.username);
    if (!player.sinners) player.sinners = {};
    if (!player.sinners[name]) player.sinners[name] = { uptie:1, equippedIdentity:`LCB ${name}` };

    const sd = player.sinners[name];
    if (sd.uptie >= 4) return message.reply(`「${name}」已達最高連結等級 T4。`);

    const cost = UPTIE_COSTS[sd.uptie];
    if (player.thread < cost) return message.reply(`❌ 紡錘不足！需要 🧵×${cost}，目前 🧵×${player.thread}`);

    player.thread -= cost;
    sd.uptie += 1;
    savePlayerData(null, message.author.id, player);

    const stars = '◆'.repeat(sd.uptie) + '◇'.repeat(4-sd.uptie);
    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('🔗 連結提升成功！')
            .setColor(0xffd166)
            .setDescription(`**${name}** → T${sd.uptie} ${stars}\n消耗：🧵 ×${cost}　剩餘：🧵 ×${player.thread}`)
            .setTimestamp()]
    });
}

// ─── !equip ───────────────────────────────────────────────────
async function handleEquip(_client, message) {
    const m = message.content.trim().match(/^!equip\s+(.+?)\s*\|\s*(.+)$/);
    if (!m) return message.reply('❌ 用法：`!equip [罪人名] | [人格名稱]`');
    const [, sinnerName, identityName] = m;
    if (!SINNERS[sinnerName]) return message.reply(`❌ 找不到「${sinnerName}」`);

    const player = getOrCreatePlayer(null, message.author.id, message.author.username);
    if (!player.sinners) player.sinners = {};
    if (!player.sinners[sinnerName]) player.sinners[sinnerName] = { uptie:1, equippedIdentity:`LCB ${sinnerName}` };
    player.sinners[sinnerName].equippedIdentity = identityName.trim();
    savePlayerData(null, message.author.id, player);

    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('🔧 裝備更新').setColor(0x2ed573)
            .setDescription(`**${sinnerName}** 現在裝備：\n${identityName.trim()}`)
            .setTimestamp()]
    });
}

// ─── !threads ─────────────────────────────────────────────────
async function handleThreads(_client, message) {
    const player = getOrCreatePlayer(null, message.author.id, message.author.username);
    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('🧵 資源查詢').setColor(0xa55eea)
            .addFields(
                { name:'🧵 紡錘',   value:`${player.thread}`,      inline:true },
                { name:'📦 人格碎片',value:`${player.fragments||0}`,inline:true },
                { name:'📜 經驗卷', value:`${player.expScrolls||0}`,inline:true },
            )
            .setDescription(
                '**連結提升費用：**\nT1→T2：×20　T2→T3：×40　T3→T4：×80\n\n' +
                '**人格升等費用（每一級）：**\nLv1-20：碎片×(等級×5)\nLv21-40：碎片×(等級×8) + 卷×1\nLv41-60：碎片×(等級×12) + 卷×3'
            )
            .setFooter({ text:'在 !pack 的🔼人格培育介面進行升等' })
            .setTimestamp()]
    });
}

module.exports = { handleSinner, handleUptie, handleEquip, handleThreads };
