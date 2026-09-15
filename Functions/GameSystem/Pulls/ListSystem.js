// Functions/GameSystem/Pulls/ListSystem.js
    'use strict';
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    const PullSystem = require('./PullSystem.js');
    const identitiesData = require('./identitiesData.js');
const { getLanguage } = require('../LanguageSystem.js');
    const TIER_ORDER = ['COLOR_FIXER','ABN_ANGELA','ABN_ALEPH','ABN_WAW','ABN_HE','ABN_TETH','ABN_ZAYIN','SPECIAL','S4','EGOS','S3','S2','S1'];
    const TIER_LABELS = { COLOR_FIXER:'🔴 Color Fixer', ABN_ANGELA:'🕊️ 異想體 ANGELA', ABN_ALEPH:'🟣 異想體 ALEPH', ABN_WAW:'🔵 異想體 WAW', ABN_HE:'🟢 異想體 HE', ABN_TETH:'🟡 異想體 TETH', ABN_ZAYIN:'⚪ 異想體 ZAYIN', SPECIAL:'🌌 Special', S4:'👑 0000', EGOS:'🔮 E.G.O', S3:'✨ 000 三星', S2:'⭐ 00 二星', S1:'▫️ 0 一星' };
    const TIER_LABELS_EN = { COLOR_FIXER:'🔴 Color Fixer', ABN_ANGELA:'🕊️ Abnormality ANGELA', ABN_ALEPH:'🟣 Abnormality ALEPH', ABN_WAW:'🔵 Abnormality WAW', ABN_HE:'🟢 Abnormality HE', ABN_TETH:'🟡 Abnormality TETH', ABN_ZAYIN:'⚪ Abnormality ZAYIN', SPECIAL:'🌌 Special', S4:'👑 0000', EGOS:'🔮 E.G.O', S3:'✨ 000 Three-Star', S2:'⭐ 00 Two-Star', S1:'▫️ 0 One-Star' };
const BUTTON_LABELS_EN = { COLOR_FIXER:'Color', ABN_ANGELA:'ANGELA', ABN_ALEPH:'ALEPH', ABN_WAW:'WAW', ABN_HE:'HE', ABN_TETH:'TETH', ABN_ZAYIN:'ZAYIN', SPECIAL:'Special', S4:'0000', EGOS:'E.G.O', S3:'000 3★', S2:'00 2★', S1:'0 1★' };
function displayName(name, language) { const parts = String(name || '').split(' / '); return language === 'en' && parts.length > 1 ? parts[parts.length - 1] : parts[0]; }
const BUTTON_LABELS = { COLOR_FIXER:'色彩', ABN_ANGELA:'ANGELA', ABN_ALEPH:'ALEPH', ABN_WAW:'WAW', ABN_HE:'HE', ABN_TETH:'TETH', ABN_ZAYIN:'ZAYIN', SPECIAL:'特殊', S4:'0000', EGOS:'E.G.O', S3:'000 三星', S2:'00 二星', S1:'0 一星' };
    function getBanner() { const banners = identitiesData?.BANNERS || {}; return banners.standard || Object.values(banners).find(Boolean) || {}; }
    function buildEntries() {
      const base = PullSystem.BASE_WEIGHTS || {}; const abn = PullSystem.ABN_WEIGHTS || {}; const banner = getBanner(); const entries = [];
      for (const tier of TIER_ORDER) {
          const pool = typeof PullSystem.getPool === 'function' ? PullSystem.getPool(tier) : [];
          if (!pool.length) continue;
          const baseRate = tier.startsWith('ABN_') ? (Number(base.ABN || 0) / 100) * (Number(abn[tier] || 0) / 100) : Number(base[tier] || 0) / 100;
          if (!baseRate) continue;
          const upList = typeof PullSystem.getRateUpList === 'function' ? PullSystem.getRateUpList(banner, tier) : [];
          const up = new Set(upList.filter(name => pool.includes(name))); const normalRate = baseRate / pool.length; const upRate = up.size ? baseRate * 0.5 / up.size : 0;
          for (const name of pool) entries.push({ name, tier, rate: normalRate + (up.has(name) ? upRate : 0), isUp: up.has(name) });
      }
      return entries;
    }
    function formatRate(rate) { const percent = rate * 100; return percent < 0.01 ? percent.toFixed(4) + '%' : percent.toFixed(2) + '%'; }
    function buildRarityRows(active, language, disabled = false) { const rows = []; for (let i = 0; i < TIER_ORDER.length; i += 5) { const labels = language === 'en' ? BUTTON_LABELS_EN : BUTTON_LABELS; const buttons = TIER_ORDER.slice(i, i + 5).map(tier => new ButtonBuilder().setCustomId('list:filter:' + tier).setLabel(labels[tier]).setStyle(active === tier ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(disabled)); rows.push(new ActionRowBuilder().addComponents(buttons)); } return rows; }
    function render(entries, filter, query, page, timerUsed = false, disabled = false, expiresAt = Date.now() + 60000, language = 'en') {
      const filtered = entries.filter(item => (filter === 'ALL' || item.tier === filter) && (!query || item.name.toLowerCase().includes(query.toLowerCase()) || TIER_LABELS[item.tier].toLowerCase().includes(query.toLowerCase())));
      const perPage = 12; const pages = Math.max(1, Math.ceil(filtered.length / perPage)); const safePage = Math.min(Math.max(0, page), pages - 1); const chunk = filtered.slice(safePage * perPage, (safePage + 1) * perPage);
      const text = chunk.length ? chunk.map(item => (item.isUp ? '> 🔺 **' : '• ') + displayName(item.name, language) + (item.isUp ? '**' : '') + ' (' + formatRate(item.rate) + ')' + (item.isUp ? ' **[UP!]**' : '')).join('\n') : '沒有符合的資料。';
      const title = query ? (language === 'en' ? '🔎 Rate Search: ' : '🔎 機率查詢：') + query : (filter === 'ALL' ? (language === 'en' ? '📋 Full Extraction Rates' : '📋 完整提取機率清單') : (language === 'en' ? TIER_LABELS_EN[filter] + ' Rate List' : TIER_LABELS[filter] + ' 機率清單'));
      const embed = new EmbedBuilder().setTitle(title).setColor(0x00b4d8).setDescription(text).addFields({ name: language === 'en' ? '📊 Rate Info' : '📊 機率說明', value: language === 'en' ? 'Includes base rarity, abnormality sub-rarity, and current rate-up adjustments.' : '包含基礎稀有度、異想體內部稀有度與當期 UP 修正。', inline: false }).setFooter({ text: (language === 'en' ? 'Page ' : '第 ') + (safePage + 1) + (language === 'en' ? ' / ' : ' / ') + pages + (language === 'en' ? ' ｜ ' + filtered.length + ' entries' : ' 頁 ｜ 顯示 ' + filtered.length + ' 項') + ' ｜ ' + (language === 'en' ? '⏱️ ' + Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)) + 's remaining' : '⏱️ 剩餘 ' + Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)) + ' 秒') });
      const controls = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('list:prev').setLabel(language === 'en' ? '◀️ Previous' : '◀️ 上一頁').setStyle(ButtonStyle.Primary).setDisabled(disabled || safePage === 0), new ButtonBuilder().setCustomId('list:next').setLabel(language === 'en' ? 'Next ▶️' : '下一頁 ▶️').setStyle(ButtonStyle.Primary).setDisabled(disabled || safePage >= pages - 1), new ButtonBuilder().setCustomId('list:all').setLabel(language === 'en' ? '📋 All' : '📋 全部').setStyle(ButtonStyle.Primary).setDisabled(disabled), new ButtonBuilder().setCustomId('list:search').setLabel(language === 'en' ? '🔎 Search Name' : '🔎 名稱查詢').setStyle(ButtonStyle.Success).setDisabled(disabled), new ButtonBuilder().setCustomId('list:extend').setLabel(language === 'en' ? '⏱️ +1 minute' : '⏱️ +1 分鐘').setStyle(ButtonStyle.Secondary).setDisabled(disabled || timerUsed));
      return { embeds: [embed], components: [...buildRarityRows(filter, language, disabled), controls] };
    }
    async function getReplyMessage(message, payload) { const sent = await message.reply(payload); if (sent?.createMessageComponentCollector) return sent; if (message.interaction?.fetchReply) return message.interaction.fetchReply(); return sent; }
    async function handleList(client, message) {
      try {
          const entries = buildEntries(); if (!entries.length) return message.reply('❌ 目前提取池沒有可顯示的資料。');
          const language = getLanguage(message.author.id); let filter = 'ALL'; let query = ''; let timerUsed = false; let startedAt = Date.now(); let expiresAt = startedAt + 60000; let view = render(entries, filter, query, page, timerUsed, false, expiresAt, language);
          const reply = await getReplyMessage(message, view); if (!reply?.createMessageComponentCollector) return;
          const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
        const timerTicker = setInterval(() => { if (!collector.ended) { const live = render(entries, filter, query, page, timerUsed, false, expiresAt, language); reply.edit({ embeds: live.embeds, components: live.components }).catch(() => {}); } }, 5000);
          collector.on('collect', async interaction => {
              if (interaction.user.id !== message.author.id) return interaction.reply({ content: '❌ 這不是你的機率清單。', ephemeral: true });
              if (interaction.customId === 'list:extend') {
                if (timerUsed) return interaction.reply({ content: '⏱️ 這個清單的延長按鈕只能使用一次。', ephemeral: true });
                timerUsed = true;
                expiresAt = startedAt + 120000;
                const remaining = Math.max(1000, expiresAt - Date.now());
                collector.resetTimer({ time: remaining });
                view = render(entries, filter, query, page, timerUsed, false, expiresAt, language);
                await interaction.update({ embeds: view.embeds, components: view.components });
                return;
            }
            if (interaction.customId === 'list:search') {
                  const modal = new ModalBuilder().setCustomId('list:search-modal').setTitle('查詢人格 / E.G.O 名稱').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('list:query').setLabel('輸入名稱或關鍵字').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80).setPlaceholder('例如：Don、E.G.O、ALEPH')));
                  await interaction.showModal(modal);
                  try { const submitted = await interaction.awaitModalSubmit({ time: 30000, filter: i => i.user.id === message.author.id && i.customId === 'list:search-modal' }); query = submitted.fields.getTextInputValue('list:query').trim(); filter = 'ALL'; page = 0; view = render(entries, filter, query, page, timerUsed); await submitted.deferUpdate(); await reply.edit({ embeds: view.embeds, components: view.components }); } catch {}
                  return;
              }
              if (interaction.customId === 'list:all') { filter = 'ALL'; query = ''; page = 0; } else if (interaction.customId === 'list:prev') page -= 1; else if (interaction.customId === 'list:next') page += 1; else if (interaction.customId.startsWith('list:filter:')) { filter = interaction.customId.slice('list:filter:'.length); query = ''; page = 0; }
              view = render(entries, filter, query, page, timerUsed, false, expiresAt, language); await interaction.update({ embeds: view.embeds, components: view.components });
          });
          collector.on('end', () => { clearInterval(timerTicker); const ended = render(entries, filter, query, page, true, true, expiresAt, language); reply.edit({ components: ended.components }).catch(() => {}); });
      } catch (error) { console.error('List Command Error:', error); if (!message.interaction?.replied) message.reply('❌ 讀取清單時發生錯誤，請稍後再試。').catch(() => {}); }
    }
    module.exports = { handleList, buildEntries };
    