'use strict';

const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const identitiesData = require('../Functions/GameSystem/Pulls/identitiesData.js');
const { executePull } = require('../Functions/GameSystem/Pulls/PullSystem.js');

function createBannerEmbed(banner) {
    const rateUpS3 = banner.rateUp.S3?.length ? banner.rateUp.S3.join('\n• ') : '無';
    const rateUpEGO = banner.rateUp.EGOS?.length ? banner.rateUp.EGOS.join('\n• ') : '無';

    return new EmbedBuilder()
        .setTitle(`🚂 ${banner.name}`)
        .setDescription(banner.description)
        .setColor(0xffa502)
        .addFields(
            { name: '✨ ★★★ UP 機率提升人格', value: rateUpS3.startsWith('•') ? rateUpS3 : `• ${rateUpS3}`, inline: false },
            { name: '🔮 E.G.O UP 機率提升', value: rateUpEGO.startsWith('•') ? rateUpEGO : `• ${rateUpEGO}`, inline: false },
            { name: '💰 提取花費', value: `單抽：**${banner.cost.single}** 狂氣\n十連：**${banner.cost.ten}** 狂氣`, inline: false }
        )
        .setFooter({ text: '點擊下方按鈕進行提取（結果將會單獨發送）' });
}

function createPullButtons(bannerId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pull_${bannerId}_1`)
            .setLabel('單抽 (130狂氣)')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`pull_${bannerId}_10`)
            .setLabel('十連 (1300狂氣)')
            .setStyle(ButtonStyle.Success)
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pull')
        .setDescription('開啟狂氣提取介面'),

    async execute(interaction) {
        const banners = identitiesData.BANNERS;

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_banner')
            .setPlaceholder('選擇要提取的卡池...');

        Object.values(banners).forEach(b => {
            selectMenu.addOptions({
                label: b.name,
                description: b.description.substring(0, 50),
                value: b.id,
            });
        });

        const rowSelect = new ActionRowBuilder().addComponents(selectMenu);

        const defaultBanner = banners['dawn_office'] || Object.values(banners)[0];
        const embed = createBannerEmbed(defaultBanner);
        const rowButtons = createPullButtons(defaultBanner.id);

        const response = await interaction.reply({
            embeds: [embed],
            components: [rowSelect, rowButtons],
            fetchReply: true
        });

        const collector = response.createMessageComponentCollector({
            time: 120000
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '這不是你的抽卡介面！', ephemeral: true });
            }

            if (i.isStringSelectMenu()) {
                const selectedKey = i.values[0];
                const banner = banners[selectedKey];
                const newEmbed = createBannerEmbed(banner);
                const newButtons = createPullButtons(banner.id);

                await i.update({
                    embeds: [newEmbed],
                    components: [rowSelect, newButtons]
                });
            }

            if (i.isButton()) {
                const [action, bannerId, countStr] = i.customId.split('_');
                if (action === 'pull') {
                    await i.deferReply();
                    await executePull(interaction.client, i.user, bannerId, parseInt(countStr), i);
                }
            }
        });
    }
};
