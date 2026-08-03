// Functions/GameSystem/Stages.js
const { EmbedBuilder } = require('discord.js');
const { getBuffMultiplier } = require('./GiveAwaySystem.js');
const { addXp } = require('./LevelSystem.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');

const STAGE_OUTCOMES = [
    { success:true,  emoji:'🎉', text:'完美戰術！迷宮異想體被完全壓制，關鍵共鳴觸發！', base:300, fragments:2 },
    { success:true,  emoji:'⚔️', text:'陷入混亂狀態，但靠著人格共鳴險勝！',              base:150, fragments:1 },
    { success:true,  emoji:'🛡️', text:'穩健戰術壓制成功，未有人格侵蝕。',               base:200, fragments:1 },
    { success:false, emoji:'💀', text:'精神值 (SP) 歸零，全隊陷入恐慌並發生侵蝕！戰線崩潰。', base:0, fragments:0 },
    { success:false, emoji:'😰', text:'異想體突然變異，措手不及導致撤退。',               base:30,  fragments:0 },
];

async function handleStage(client, message) {
    const outcome = STAGE_OUTCOMES[Math.floor(Math.random() * STAGE_OUTCOMES.length)];
    const buff    = getBuffMultiplier();
    const lightSeeds = Math.floor(outcome.base * buff);
    const frags   = outcome.fragments;

    // ── 實際儲存獎勵到玩家資料 ─────────────────────────────────
    const player = getOrCreatePlayer(null, message.author.id, message.author.username);
    if (outcome.success) {
        player.lightSeeds = (player.lightSeeds || 0) + lightSeeds;
        player.fragments  = (player.fragments  || 0) + frags;
    }
    savePlayerData(null, message.author.id, player);

    // 關卡 XP 獎勵
    if (outcome.success) {
        const stageXp = lightSeeds >= 200 ? 20 : lightSeeds >= 100 ? 15 : 10;
        addXp(client, message.author.id, message.author.username, stageXp, message.guild?.id).catch(() => {});
    } else {
        addXp(client, message.author.id, message.author.username, 3, message.guild?.id).catch(() => {});
    }

    const desc = [
        `**結果：** ${outcome.emoji} ${outcome.text}`,
        '',
        outcome.success
            ? `**獲得：** 🌱 LightSeeds ×${lightSeeds}${frags ? `、📦 人格碎片 ×${frags}` : ''}${buff > 1 ? ` _(×${buff} 加成中)_` : ''}`
            : '**獲得：** ─（撤退無獎勵）',
    ].join('\n');

    return message.reply({
        embeds: [new EmbedBuilder()
            .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
            .setTitle('🚨 腦葉收容區 — 抑制戰況回報')
            .setColor(outcome.success ? (lightSeeds >= 250 ? 0x2ed573 : 0xeccc68) : 0xff4757)
            .setDescription(desc)
            .setFooter({ text: buff > 1 ? `⚡ 當前獎勵倍率：${buff}×` : '使用 !stage 再次挑戰' })
            .setTimestamp()]
    });
}

module.exports = { handleStage };
