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
const { getLanguage } = require('./GameSystem/LanguageSystem.js');

function localizedIdentityName(value, language) {
  const name = String(value || '');
  const parts = name.split(' / ');
  if (parts.length < 2) return name;
  return language === 'en' ? parts.slice(1).join(' / ').trim() : parts[0].trim();
}

function bannerName(banner, language, fallback = '') {
  if (language === 'en' && banner?.nameEn) return banner.nameEn;
  return localizedIdentityName(banner?.name || fallback, language);
}

function bannerDescription(banner, language) {
  if (language === 'en' && banner?.descriptionEn) return banner.descriptionEn;
  return localizedIdentityName(banner?.description || '', language);
}

// ─────────────────────────────────────────────
// 工具：取得所有有效卡池
// ─────────────────────────────────────────────

function getBanners() {
  return identitiesData?.BANNERS || {};
}

// ─────────────────────────────────────────────
// 建立卡池資訊 Embed
// ─────────────────────────────────────────────

function createBannerEmbed(banner, language = 'zh') {
  const en = language === 'en';
  if (!banner) {
    return new EmbedBuilder()
      .setTitle(en ? '🚂 LightSeeds Pulls' : '🚂 LightSeeds 提取')
      .setColor(0xff0000)
      .setDescription(en ? '❌ No pull banners are currently available.' : '❌ 目前沒有可用的提取卡池。');
  }

  const rateUp = banner.rateUp || {};

  const displayNames = values => (Array.isArray(values) ? values.filter(Boolean) : [])
    .map(value => localizedIdentityName(value, language));
  const rateUpS3 = displayNames(rateUp.S3);
  const rateUpS2 = displayNames(rateUp.S2);
  const rateUpEGO = displayNames(rateUp.EGOS);
  const rateUpSpecial = displayNames(rateUp.SPECIAL);

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
    rateUpText = en ? 'No rate-up identities are configured.' : '目前沒有設定 Rate Up 對象。';
  }

  const singleCost = banner.cost?.single ?? 130;
  const tenCost = banner.cost?.ten ?? 1300;

  const seasonLabels = en
    ? { 0: 'Standard', 1: 'S1 Orientation', 2: 'S2 Reminiscence', 3: 'S3 Bon Voyage', 4: 'S4 Clear All Cathy', 5: 'S5 Oblivion', 6: 'S6 The Flower Song', 7: 'S7 Spider’s Thread', 8: 'S8 PUNCTUM', walp: 'Walpurgis Night' }
    : { 0: '恆常', 1: 'S1 Orientation', 2: 'S2 Reminiscence', 3: 'S3 Bon Voyage', 4: 'S4 Clear All Cathy', 5: 'S5 Oblivion', 6: 'S6 葬花吟', 7: 'S7 蜘蛛之糸', 8: 'S8 PUNCTUM', walp: '瓦夜 Walpurgis' };
  const sLabel = seasonLabels[banner.season ?? 0] ?? '';
  const titlePrefix = sLabel ? `[${sLabel}] ` : '';
  const name = bannerName(banner, language, en ? 'Untitled Banner' : '未命名卡池');

  return new EmbedBuilder()
    .setTitle(`🚂 ${titlePrefix}${name}`)
    .setDescription(bannerDescription(banner, language) || (en ? 'No details are available for this banner.' : '目前沒有提供此卡池的詳細說明。'))
    .setColor(0xffa502)
    .addFields(
      {
        name: '✨ Rate Up',
        value: rateUpText.slice(0, 1024),
        inline: false,
      },
      {
        name: en ? '💰 Pull Cost' : '💰 提取花費',
        value: en
          ? `Single: **${singleCost} LightSeeds**\nTen pulls: **${tenCost} LightSeeds**`
          : `單抽：**${singleCost} LightSeeds**\n十連：**${tenCost} LightSeeds**`,
        inline: false,
      }
    )
    .setFooter({
      text: en ? 'Use the controls below to pull. Results are only visible to you.' : '選擇下方按鈕進行提取｜抽卡結果將只顯示給你',
    });
}

// ─────────────────────────────────────────────
// 建立卡池選擇器
// ─────────────────────────────────────────────

function createBannerSelectMenu(banners, language = 'zh') {
  const en = language === 'en';
  const seasonLabels = en
    ? { 0: 'Standard', 1: 'S1', 2: 'S2', 3: 'S3', 4: 'S4', 5: 'S5', 6: 'S6', 7: 'S7', 8: 'S8', walp: 'Walpurgis' }
    : { 0: '恆常', 1: 'S1', 2: 'S2', 3: 'S3', 4: 'S4', 5: 'S5', 6: 'S6', 7: 'S7', 8: 'S8', walp: '瓦夜' };
  const seasonOrder = (s) => { const n = Number(s); if (!isNaN(n)) return n; return 999; };
  const options = Object.entries(banners)
    .filter(([bannerKey, banner]) => banner && bannerKey)
    .sort(([, a], [, b]) => seasonOrder(a.season ?? 0) - seasonOrder(b.season ?? 0))
    .slice(0, 25)
    .map(([bannerKey, banner]) => {
      const sLabel = seasonLabels[banner.season ?? 0] ?? '';
      const prefix = sLabel ? `[${sLabel}] ` : '';
      return {
        label: String(prefix + bannerName(banner, language, banner.id || bannerKey)).slice(0, 100),
        description: String(bannerDescription(banner, language) || (en ? 'No banner details' : '沒有卡池說明')).slice(0, 100),
        value: String(bannerKey),
      };
    });

  const menu = new StringSelectMenuBuilder()
    .setCustomId('pull_select_banner')
    .setPlaceholder(en ? '🚂 Select a pull banner...' : '🚂 選擇要進行提取的卡池...');

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

function createPullButtons(banner, bannerKey, language = 'zh') {
  const en = language === 'en';
  const finalBannerKey = String(bannerKey || 'standard');

  const singleCost = banner?.cost?.single ?? 130;
  const tenCost = banner?.cost?.ten ?? 1300;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pull_execute_${finalBannerKey}_1`)
      .setLabel(`${en ? 'Single pull' : '單抽'} (${singleCost} LightSeeds)`)
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`pull_execute_${finalBannerKey}_10`)
      .setLabel(`${en ? '10 pulls' : '十連'} (${tenCost} LightSeeds)`)
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
  // 優先回 standard（恆常），沒有才取第一個
  if (banners.standard) {
    return { key: 'standard', banner: banners.standard };
  }
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
  data: new SlashCommandBuilder().setName('pull_limbuscompany').setDescription('開啟 LightSeeds 提取介面'),

  async execute(interaction) {
    const language = getLanguage(interaction.user.id);
    const en = language === 'en';
    // ─────────────────────────────────
    // 取得卡池
    // ─────────────────────────────────

    const banners = getBanners();

    if (!Object.keys(banners).length) {
      return interaction.reply({
        content: en ? '❌ No pull banners are currently available.' : '❌ 目前沒有任何可用的抽卡卡池。',
        ephemeral: true,
      });
    }

    // ─────────────────────────────────
    // 取得預設卡池
    // ─────────────────────────────────

    const defaultBannerData = getDefaultBanner(banners);

    if (!defaultBannerData) {
      return interaction.reply({
        content: en ? '❌ No usable pull banner was found.' : '❌ 找不到可用的抽卡卡池。',
        ephemeral: true,
      });
    }

    const defaultBannerKey = defaultBannerData.key;
    const defaultBanner = defaultBannerData.banner;

    // ─────────────────────────────────
    // 建立 UI
    // ─────────────────────────────────

    const selectRow = createBannerSelectMenu(banners, language);
    let buttonRow = createPullButtons(defaultBanner, defaultBannerKey, language);

    const embed = createBannerEmbed(defaultBanner, language);

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
          content: en ? '❌ This pull menu belongs to another user.' : '❌ 這不是你的抽卡介面。',
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
              content: en ? '❌ Could not read the selected banner.' : '❌ 無法取得選擇的卡池。',
              ephemeral: true,
            });
          }

          const selectedBanner = banners[bannerKey];

          if (!selectedBanner) {
            return componentInteraction.reply({
              content: en ? '❌ This banner could not be found.' : '❌ 找不到這個卡池。',
              ephemeral: true,
            });
          }

          const newEmbed = createBannerEmbed(selectedBanner, language);
          const newButtons = createPullButtons(selectedBanner, bannerKey, language);

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
              content: en ? '❌ Invalid pull count.' : '❌ 無效的抽卡次數。',
              ephemeral: true,
            });
          }

          // ─────────────────
          // 驗證卡池
          // ─────────────────

          if (!banners[bannerKey]) {
            return componentInteraction.reply({
              content: en ? '❌ The selected banner could not be found.' : '❌ 找不到指定的卡池。',
              ephemeral: true,
            });
          }

          // ─────────────────
          // 延遲回覆 
          // ─────────────────

          await componentInteraction.deferReply({
            ephemeral: false,
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
          content: (en ? '❌ The pull menu encountered an error:\n' : '❌ 抽卡介面發生錯誤：\n') + `\`${error.message}\``,
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
