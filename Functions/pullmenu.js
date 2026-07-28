'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const identitiesData = require('./GameSystem/Pulls/identitiesData.js');

const { executePull } = require('./GameSystem/Pulls/PullSystem.js');

// ─────────────────────────────────────────────
// 工具：取得所有有效卡池
// ─────────────────────────────────────────────

function getBanners() {
  return identitiesData?.BANNERS || {};
}

// ─────────────────────────────────────────────
// 建立卡池資訊 Embed
// ─────────────────────────────────────────────

function createBannerEmbed(banner) {
  if (!banner) {
    return new EmbedBuilder()
      .setTitle('🚂 狂氣提取')
      .setColor(0xff0000)
      .setDescription('❌ 目前沒有可用的提取卡池。');
  }

  const rateUp = banner.rateUp || {};

  const rateUpS3 = Array.isArray(rateUp.S3) ? rateUp.S3.filter(Boolean) : [];
  const rateUpS2 = Array.isArray(rateUp.S2) ? rateUp.S2.filter(Boolean) : [];
  const rateUpEGO = Array.isArray(rateUp.EGOS) ? rateUp.EGOS.filter(Boolean) : [];
  const rateUpSpecial = Array.isArray(rateUp.SPECIAL) ? rateUp.SPECIAL.filter(Boolean) : [];

  let rateUpText = '';

  if (rateUpS3.length) {
    rateUpText += `✨ **★★★ UP**\n` + `• ${rateUpS3.join('\n• ')}\n\n`;
  }

  if (rateUpS2.length) {
    rateUpText += `⭐ **★★ UP**\n` + `• ${rateUpS2.join('\n• ')}\n\n`;
  }

  if (rateUpEGO.length) {
    rateUpText += `🔮 **E.G.O UP**\n` + `• ${rateUpEGO.join('\n• ')}\n\n`;
  }

  if (rateUpSpecial.length) {
    rateUpText += `🌌 **Special UP**\n` + `• ${rateUpSpecial.join('\n• ')}\n\n`;
  }

  if (!rateUpText) {
    rateUpText = '目前沒有設定 Rate Up 對象。';
  }

  const singleCost = banner.cost?.single ?? 130;
  const tenCost = banner.cost?.ten ?? 1300;

  return new EmbedBuilder()
    .setTitle(`🚂 ${banner.name || '未命名卡池'}`)
    .setDescription(banner.description || '目前沒有提供此卡池的詳細說明。')
    .setColor(0xffa502)
    .addFields(
      {
        name: '✨ Rate Up',
        value: rateUpText.slice(0, 1024),
        inline: false,
      },
      {
        name: '💰 提取花費',
        value: `單抽：**${singleCost} 狂氣**\n` + `十連：**${tenCost} 狂氣**`,
        inline: false,
      }
    )
    .setFooter({
      text: '選擇下方按鈕進行提取｜抽卡結果將只顯示給你',
    });
}

// ─────────────────────────────────────────────
// 建立卡池選擇器
// ─────────────────────────────────────────────

function createBannerSelectMenu(banners) {
  const options = Object.entries(banners)
    .filter(([bannerKey, banner]) => banner && bannerKey)
    .slice(0, 25)
    .map(([bannerKey, banner]) => ({
      label: String(banner.name || banner.id || bannerKey).slice(0, 100),
      description: String(banner.description || '沒有卡池說明').slice(0, 100),
      value: String(bannerKey),
    }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId('pull_select_banner')
    .setPlaceholder('🚂 選擇要進行提取的卡池...');

  if (options.length > 0) {
    menu.addOptions(options);
  } else {
    menu.setDisabled(true);
  }

  return new ActionRowBuilder().addComponents(menu);
}

// ─────────────────────────────────────────────
// 建立抽卡按鈕
// ─────────────────────────────────────────────

function createPullButtons(banner, bannerKey) {
  const finalBannerKey = String(bannerKey || 'standard');

  const singleCost = banner?.cost?.single ?? 130;
  const tenCost = banner?.cost?.ten ?? 1300;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pull_execute_${finalBannerKey}_1`)
      .setLabel(`單抽 (${singleCost} 狂氣)`)
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`pull_execute_${finalBannerKey}_10`)
      .setLabel(`十連 (${tenCost} 狂氣)`)
      .setStyle(ButtonStyle.Success)
  );
}

// ─────────────────────────────────────────────
// 停用抽卡介面
// ─────────────────────────────────────────────

function disableComponents(components) {
  return components.map((row) => {
    const newRow = ActionRowBuilder.from(row);

    newRow.components.forEach((component) => {
      component.setDisabled(true);
    });

    return newRow;
  });
}

// ─────────────────────────────────────────────
// 找預設卡池
// ─────────────────────────────────────────────

function getDefaultBanner(banners) {
  const entry = Object.entries(banners).find(([bannerKey, banner]) => banner && bannerKey);

  if (!entry) {
    return null;
  }

  return {
    key: entry[0],
    banner: entry[1],
  };
}

// ─────────────────────────────────────────────
// Slash Command
// ─────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder().setName('pull').setDescription('開啟狂氣提取介面'),

  async execute(interaction) {
    // ─────────────────────────────────
    // 取得卡池
    // ─────────────────────────────────

    const banners = getBanners();

    if (!Object.keys(banners).length) {
      return interaction.reply({
        content: '❌ 目前沒有任何可用的抽卡卡池。',
        ephemeral: true,
      });
    }

    // ─────────────────────────────────
    // 取得預設卡池
    // ─────────────────────────────────

    const defaultBannerData = getDefaultBanner(banners);

    if (!defaultBannerData) {
      return interaction.reply({
        content: '❌ 找不到可用的抽卡卡池。',
        ephemeral: true,
      });
    }

    const defaultBannerKey = defaultBannerData.key;
    const defaultBanner = defaultBannerData.banner;

    // ─────────────────────────────────
    // 建立 UI
    // ─────────────────────────────────

    const selectRow = createBannerSelectMenu(banners);
    let buttonRow = createPullButtons(defaultBanner, defaultBannerKey);

    const embed = createBannerEmbed(defaultBanner);

    // ─────────────────────────────────
    // 發送抽卡介面
    // ─────────────────────────────────

    const response = await interaction.reply({
      embeds: [embed],
      components: [selectRow, buttonRow],
      fetchReply: true,
    });

    // ─────────────────────────────────
    // 建立 Collector
    // ─────────────────────────────────

    const collector = response.createMessageComponentCollector({
      time: 120000,
    });

    collector.on('collect', async (componentInteraction) => {
      // ─────────────────────────
      // 只允許原玩家操作
      // ─────────────────────────

      if (componentInteraction.user.id !== interaction.user.id) {
        return componentInteraction.reply({
          content: '❌ 這不是你的抽卡介面。',
          ephemeral: true,
        });
      }

      try {
        // ─────────────────────
        // 選擇卡池
        // ─────────────────────

        if (
          componentInteraction.isStringSelectMenu() &&
          componentInteraction.customId === 'pull_select_banner'
        ) {
          const bannerKey = componentInteraction.values?.[0];

          if (!bannerKey) {
            return componentInteraction.reply({
              content: '❌ 無法取得選擇的卡池。',
              ephemeral: true,
            });
          }

          const selectedBanner = banners[bannerKey];

          if (!selectedBanner) {
            return componentInteraction.reply({
              content: '❌ 找不到這個卡池。',
              ephemeral: true,
            });
          }

          const newEmbed = createBannerEmbed(selectedBanner);
          const newButtons = createPullButtons(selectedBanner, bannerKey);

          buttonRow = newButtons; // keep collector's "end" handler in sync

          await componentInteraction.update({
            embeds: [newEmbed],
            components: [selectRow, newButtons],
          });

          return;
        }

        // ─────────────────────
        // 執行抽卡
        // ─────────────────────

        if (
          componentInteraction.isButton() &&
          componentInteraction.customId.startsWith('pull_execute_')
        ) {
          const parts = componentInteraction.customId.split('_');

          // 最後一段為抽卡次數
          const count = parseInt(parts.pop(), 10);

          // 其餘部分重新組合，取得 BANNERS 外層 Key
          const bannerKey = parts.slice(2).join('_');

          // ─────────────────
          // 驗證抽卡次數
          // ─────────────────

          if (!Number.isInteger(count) || ![1, 10].includes(count)) {
            return componentInteraction.reply({
              content: '❌ 無效的抽卡次數。',
              ephemeral: true,
            });
          }

          // ─────────────────
          // 驗證卡池
          // ─────────────────

          if (!banners[bannerKey]) {
            return componentInteraction.reply({
              content: '❌ 找不到指定的卡池。',
              ephemeral: true,
            });
          }

          // ─────────────────
          // 延遲回覆（結果只顯示給玩家本人）
          // ─────────────────

          await componentInteraction.deferReply({
            ephemeral: true,
          });

          // ─────────────────
          // 執行抽卡
          // ─────────────────

          await executePull(
            componentInteraction.client,
            componentInteraction.user,
            bannerKey,
            count,
            componentInteraction
          );

          return;
        }
      } catch (error) {
        console.error('[PullMenu] Component Error:', error);

        const errorMessage = {
          content: `❌ 抽卡介面發生錯誤：\n` + `\`${error.message}\``,
        };

        if (componentInteraction.deferred || componentInteraction.replied) {
          await componentInteraction.editReply(errorMessage).catch(() => {});
        } else {
          await componentInteraction
            .reply({
              ...errorMessage,
              ephemeral: true,
            })
            .catch(() => {});
        }
      }
    });

    // ─────────────────────────────────
    // Collector 結束
    // ─────────────────────────────────

    collector.on('end', async () => {
      try {
        const disabledRows = disableComponents([selectRow, buttonRow]);

        await interaction.editReply({
          components: disabledRows,
        });
      } catch {
        // 訊息已被刪除或無法更新時忽略
      }
    });
  },
};
