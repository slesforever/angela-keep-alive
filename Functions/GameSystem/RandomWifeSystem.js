'use strict';

const { EmbedBuilder } = require('discord.js');

const SUPER_ADMIN_ID = '1330463890122735642';

const REACTIONS_POSITIVE = [
    '哇，看來你們很有緣呢！',
    '命運的齒輪轉動了……這個配對我給過。',
    '嘿嘿，這個人當你老婆應該不錯吧？',
    '抽到了抽到了！快去跟她說嗎？',
    '這個組合我覺得可以，真的。',
    '嗯……算你有眼光，這個不錯。',
    '恭喜！你今天的運氣都用在這裡了。',
];

const REACTIONS_FUNNY = [
    '嗯……這個嘛，我就不評論了。',
    '祝你好運，真的。',
    '這個配對嘛……挺有意思的。',
    '我什麼都沒說。',
    '命運有時候就是喜歡開玩笑呢。',
    '抽到這個……你確定要認嗎？',
];

const REACTIONS_SELF = [
    '抽到自己當老婆？你也太自戀了吧。',
    '一個人也可以很快樂的，加油。',
    '自己是最好的老婆，沒毛病。',
    '獨善其身，我尊重這個選擇。',
];

const COMPATIBILITY_COMMENTS = [
    { min: 90, text: '天作之合！這個機率比我出包還低。' },
    { min: 75, text: '蠻配的喔，可以試試看相處。' },
    { min: 60, text: '還行，至少不是最差的。' },
    { min: 40, text: '普普通通，看你們怎麼經營了。' },
    { min: 20, text: '有點勉強……但誰說一定不行呢。' },
    { min: 0, text: '呃，這個，你們可能需要很多耐心。' },
];

function seededRandom(seed) {
    let hash = 0;
    const str = String(seed) + new Date().toISOString().slice(0, 10);
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % 101;
}

async function handleRandomWife(client, interaction) {
    const guild = interaction.guild;
    if (!guild) {
        return interaction.reply({ content: '這個指令只能在伺服器裡用喔。', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    try {
        await guild.members.fetch({ force: true });
    } catch {}

    const members = [...guild.members.cache.values()].filter(
        m => !m.user.bot && m.id !== interaction.user.id
    );

    if (members.length === 0) {
        return interaction.editReply({ content: '伺服器裡除了你跟機器人沒別人了，沒辦法抽啦。' });
    }

    const chosen = members[Math.floor(Math.random() * members.length)];
    const compatibility = seededRandom(interaction.user.id + chosen.id);

    let reaction;
    if (chosen.id === interaction.user.id) {
        reaction = REACTIONS_SELF[Math.floor(Math.random() * REACTIONS_SELF.length)];
    } else if (compatibility >= 60) {
        reaction = REACTIONS_POSITIVE[Math.floor(Math.random() * REACTIONS_POSITIVE.length)];
    } else {
        reaction = REACTIONS_FUNNY[Math.floor(Math.random() * REACTIONS_FUNNY.length)];
    }

    let compatComment = COMPATIBILITY_COMMENTS.find(c => compatibility >= c.min)?.text || '';

    const isSpecialTarget = chosen.id === SUPER_ADMIN_ID;
    let specialNote = '';
    if (isSpecialTarget) {
        specialNote = '\n\n*你抽到了最高主管。我也不知道該恭喜你還是同情你。*';
    }

    const embed = new EmbedBuilder()
        .setTitle('隨機老婆抽取')
        .setColor(0xe91e63)
        .setThumbnail(chosen.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: '你的老婆', value: `**${chosen.displayName}** ${chosen.toString()}`, inline: false },
            { name: '契合度', value: `**${compatibility}%** — ${compatComment}`, inline: false },
            { name: 'AI 評語', value: reaction + specialNote, inline: false },
        )
        .setFooter({ text: '純娛樂功能，跟結婚系統無關。每天可以抽好玩的。' })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed], content: `${interaction.user} 你的老婆出爐了！` });
}

module.exports = { handleRandomWife };
