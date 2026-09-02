// Functions/GameSystem/ShopSystem.js
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const {
    getOrCreatePlayer, savePlayerData
} = require('./PacksAndData.js');
const { getLevelFromXp } = require('./LevelSystem.js');

const DATA_DIR = path.join(process.cwd(), 'data');
const SHOP_PATH = path.join(DATA_DIR, 'shop-items.json');
const SALES_PATH = path.join(DATA_DIR, 'shop-sales.json');
const SUPER_ADMIN_ID = '1330463890122735642';

function readJson(file, fallback) {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        console.error(`[Shop] 讀取 ${path.basename(file)} 失敗:`, err.message);
    }
    return fallback;
}

function writeJson(file, value) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(temp, file);
}

function getItems() {
    const items = readJson(SHOP_PATH, []);
    return Array.isArray(items) ? items : [];
}

function saveItems(items) { writeJson(SHOP_PATH, items); }
function getSales() {
    const sales = readJson(SALES_PATH, []);
    return Array.isArray(sales) ? sales : [];
}
function saveSales(sales) { writeJson(SALES_PATH, sales); }

function formatCost(item) {
    const costs = [];
    if (item.lightSeedsPrice > 0) costs.push(`🌱 ${item.lightSeedsPrice.toLocaleString()}`);
    if (item.starCoinsPrice > 0) costs.push(`⭐ ${item.starCoinsPrice.toLocaleString()}`);
    return costs.join(' + ') || '免費';
}

function itemEmbed(item, index) {
    const stock = item.stock === null ? '無限' : `${item.stock} 件`;
    const requirements = [];
    if (item.minLevel > 0) requirements.push(`Lv.${item.minLevel}+`);
    requirements.push(`剩餘 ${stock}`);
    return [
        `**${index}. ${item.name}**`,
        item.info ? item.info : null,
        `價格：**${formatCost(item)}**`,
        `條件：${requirements.join(' ｜ ')}`,
    ].filter(Boolean).join('\n');
}

function buildShopPayload() {
    const items = getItems().filter(item => item.active !== false);
    const embed = new EmbedBuilder()
        .setTitle('🛒 Angela 物資商城')
        .setColor(0x9b59b6)
        .setDescription(items.length
            ? items.slice(0, 25).map(itemEmbed).join('\n\n')
            : '目前商城沒有上架商品。')
        .setFooter({ text: '購買後會產生序號；請保留購買訊息直到 Sles 確認交付。' })
        .setTimestamp();

    const rows = [];
    for (let i = 0; i < Math.min(items.length, 25); i += 5) {
        rows.push(new ActionRowBuilder().addComponents(
            ...items.slice(i, i + 5).map(item => new ButtonBuilder()
                .setCustomId(`shop_buy:${item.id}`)
                .setLabel(`購買 ${item.name}`.slice(0, 80))
                .setStyle(ButtonStyle.Primary))
        ));
    }
    return { embeds: [embed], components: rows };
}

function makeCode() {
    return `ANG-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function purchaseDetails(sale, before, after) {
    return [
        `**商品：** ${sale.itemName}`,
        `**序號：** \`${sale.code}\``,
        `**購買者：** <@${sale.userId}>`,
        `**購買時間：** <t:${Math.floor(new Date(sale.createdAt).getTime() / 1000)}:F>`,
        '',
        `**扣款前：** 🌱 ${before.lightSeeds.toLocaleString()} ｜ ⭐ ${before.starCoins.toLocaleString()}`,
        `**扣款後：** 🌱 ${after.lightSeeds.toLocaleString()} ｜ ⭐ ${after.starCoins.toLocaleString()}`,
        `**等級核准：** ✅ Lv.${sale.level} 符合 Lv.${sale.minLevel} 門檻`,
        '',
        '⚠️ **請不要關閉這則購買訊息，直到 Sles 確認你已收到商品。**',
    ].join('\n');
}

async function handleShop(client, interaction) {
    const payload = buildShopPayload();
    const response = await interaction.reply({ ...payload, ephemeral: true, fetchReply: true });
    if (!payload.components.length) return response;

    const collector = response.createMessageComponentCollector({ time: 10 * 60 * 1000 });
    collector.on('collect', async component => {
        if (component.user.id !== interaction.user.id) {
            return component.reply({ content: '❌ 這不是你的商城介面。', ephemeral: true });
        }
        if (!component.customId.startsWith('shop_buy:')) return;
        await handlePurchase(client, component, component.customId.slice('shop_buy:'.length));
    });
    collector.on('end', () => response.edit({ components: [] }).catch(() => {}));
    return response;
}

async function handlePurchase(client, interaction, itemId) {
    const item = getItems().find(entry => entry.id === itemId && entry.active !== false);
    if (!item) return interaction.reply({ content: '❌ 商品已下架或不存在。', ephemeral: true });

    const player = getOrCreatePlayer(client, interaction.user.id, interaction.user.username);
    const level = getLevelFromXp(player.xp || 0).level;
    if (level < item.minLevel) {
        return interaction.reply({ content: `❌ 等級不足，需要 **Lv.${item.minLevel}**，你目前是 Lv.${level}。`, ephemeral: true });
    }
    if (item.stock !== null && item.stock <= 0) {
        return interaction.reply({ content: '❌ 商品已售罄。', ephemeral: true });
    }

    const before = {
        lightSeeds: Number(player.lightSeeds || 0),
        starCoins: Number(player.starCoins || 0),
    };
    if (before.lightSeeds < item.lightSeedsPrice || before.starCoins < item.starCoinsPrice) {
        return interaction.reply({
            content: `❌ 貨幣不足。\n需要：${formatCost(item)}\n目前：🌱 ${before.lightSeeds.toLocaleString()} ｜ ⭐ ${before.starCoins.toLocaleString()}`,
            ephemeral: true,
        });
    }

    player.lightSeeds = before.lightSeeds - item.lightSeedsPrice;
    player.starCoins = before.starCoins - item.starCoinsPrice;
    if (item.stock !== null) item.stock -= 1;
    saveItems(getItems().map(entry => entry.id === item.id ? item : entry));
    savePlayerData(client, interaction.user.id, player);

    const sale = {
        code: makeCode(),
        itemId: item.id,
        itemName: item.name,
        itemInfo: item.info || '',
        userId: interaction.user.id,
        username: interaction.user.username,
        minLevel: item.minLevel,
        level,
        createdAt: new Date().toISOString(),
        status: 'pending',
    };
    const sales = getSales();
    sales.push(sale);
    saveSales(sales);

    const after = { lightSeeds: player.lightSeeds, starCoins: player.starCoins };
    const details = purchaseDetails(sale, before, after);
    await interaction.reply({
        embeds: [new EmbedBuilder()
            .setTitle('✅ 購買成功｜等待 Sles 交付')
            .setColor(0xf1c40f)
            .setDescription(details)
            .setFooter({ text: '這是你的兌換序號，請完整提供給 Sles。' })
            .setTimestamp()],
        ephemeral: true,
    });

    try {
        const admin = await client.users.fetch(SUPER_ADMIN_ID);
        await admin.send({
            content: `🔔 <@${SUPER_ADMIN_ID}> 有新的商城購買，請確認交付。`,
            allowedMentions: { users: [SUPER_ADMIN_ID] },
            embeds: [new EmbedBuilder()
                .setTitle('🛒 新商城訂單')
                .setColor(0xe67e22)
                .setDescription(details)
                .addFields({ name: '商品資訊', value: item.info || '未填寫' })
                .setTimestamp()],
        });
    } catch (err) {
        console.error('[Shop] 無法私訊 Sles:', err.message);
    }
}

function isSles(interaction) { return interaction.user?.id === SUPER_ADMIN_ID; }

function addItem(options) {
    const items = getItems();
    const item = {
        id: `item-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        name: options.name,
        info: options.info || '',
        lightSeedsPrice: options.lightSeedsPrice || 0,
        starCoinsPrice: options.starCoinsPrice || 0,
        minLevel: options.minLevel || 0,
        stock: options.stock > 0 ? options.stock : null,
        active: true,
        createdAt: new Date().toISOString(),
    };
    items.push(item);
    saveItems(items);
    return item;
}

function removeItem(itemId) {
    const items = getItems();
    const item = items.find(entry => entry.id === itemId && entry.active !== false);
    if (!item) return null;
    item.active = false;
    item.removedAt = new Date().toISOString();
    saveItems(items);
    return item;
}

function confirmSale(code) {
    const sales = getSales();
    const sale = sales.find(entry => entry.code.toUpperCase() === String(code).toUpperCase());
    if (!sale) return null;
    sale.status = 'delivered';
    sale.deliveredAt = new Date().toISOString();
    saveSales(sales);
    return sale;
}

async function handleShopAdmin(interaction, action) {
    if (!isSles(interaction)) return interaction.reply({ content: '⛔ 此商城管理指令僅限 Sles。', ephemeral: true });

    if (action === 'add') {
        const item = addItem({
            name: interaction.options.getString('name'),
            info: interaction.options.getString('info'),
            lightSeedsPrice: interaction.options.getInteger('lightseeds'),
            starCoinsPrice: interaction.options.getInteger('starcoins'),
            minLevel: interaction.options.getInteger('minlevel'),
            stock: interaction.options.getInteger('stock'),
        });
        return interaction.reply({ content: `✅ 已上架 **${item.name}**。\n商品 ID：\`${item.id}\`\n價格：${formatCost(item)}`, ephemeral: true });
    }
    if (action === 'remove') {
        const item = removeItem(interaction.options.getString('item_id'));
        return interaction.reply({ content: item ? `✅ 已下架 **${item.name}**。` : '❌ 找不到上架中的商品。', ephemeral: true });
    }
    if (action === 'confirm') {
        const sale = confirmSale(interaction.options.getString('code'));
        if (!sale) return interaction.reply({ content: '❌ 找不到這個序號。', ephemeral: true });
        return interaction.reply({ content: `✅ 已標記序號 \`${sale.code}\` 為已交付，購買者：<@${sale.userId}>。`, allowedMentions: { users: [sale.userId] } });
    }
}

module.exports = {
    handleShop,
    handleShopAdmin,
    getItems,
    getSales,
};
