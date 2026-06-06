// Functions/GameSystem/Stages.js 
'use strict';

const { EmbedBuilder } = require('discord.js');

let getBuffMultiplier = () => 1;
try {
    ({ getBuffMultiplier } = require('./GiveAwaySystem.js'));
} catch {}

const STAGE_OUTCOMES = [
    {
        success: true,
        emoji: '🎉',
        text: '完美戰術！迷宮異想體被完全壓制，關鍵共鳴觸發！',
        base: 300,
        fragments: 2,
        thread: 15,
    },
    {
        success: true,
        emoji: '⚔️',
        text: '陷入混亂狀態，但靠著人格共鳴險勝！',
        base: 150,
        fragments: 1,
        thread: 8,
    },
    {
        success: true,
        emoji: '🛡️',
        text: '穩健戰術壓制成功，未有人格侵蝕。',
        base: 200,
        fragments: 1,
        thread: 10,
    },
    {
        success: false,
        emoji: '💀',
        text: '精神值 (SP) 歸零，全隊陷入恐慌並發生侵蝕！戰線崩潰。',
        base: 0,
        fragments: 0,
        thread: 0,
    },
    {
        success: false,
        emoji: '😰',
        text: '異想體突然變異，措手不及導致撤退。',
        base: 30,
        fragments: 0,
        thread: 0,
    },
];

const STAGE_MODS = {
    easy:   { reward: 0.85, label: '簡單' },
    normal: { reward: 1.00, label: '一般' },
    hard:   { reward: 1.35, label: '困難' },
};

async function handleStage(client, message) {
    const args = message.content.trim().split(/\s+/);
    const tier = (args[1] || 'normal').toLowerCase();
    const mod = STAGE_MODS[tier] || STAGE_MODS.normal;

    const outcome = STAGE_OUTCOMES[Math.floor(Math.random() * STAGE_OUTCOMES.length)];
    const buff = getBuffMultiplier();

    const lunacy = Math.floor(outcome.base * buff * mod.reward);
    const thread = Math.floor((outcome.thread || 0) * mod.reward);

    const desc = [
        `**難度：** ${mod.label}`,
        `**結果：** ${outcome.emoji} ${outcome.text}`,
        '',
        outcome.success
            ? `**獲得：** 💎 狂氣 ×${lunacy}${outcome.fragments ? `、 📦 碎片禮盒 ×${outcome.fragments}` : ''}${thread ? `、 🧵 紡錘 ×${thread}` : ''}${buff > 1 ? ` _(${buff}× 加成中)_` : ''}`
            : `**獲得：** ─（撤退無獎勵）`,
    ].join('\n');

    const embed = new EmbedBuilder()
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setTitle('🚨 腦葉收容區 — 抑制戰況回報')
        .setColor(outcome.success ? (lunacy >= 250 ? 0x2ed573 : 0xeccc68) : 0xff4757)
        .setDescription(desc)
        .setFooter({ text: buff > 1 ? `⚡ 當前獎勵倍率：${buff}×` : '使用 !stage 再次挑戰' })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

module.exports = { handleStage };
