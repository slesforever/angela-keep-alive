const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const express = require('express');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const IDENTITIES_DATA_PATH = path.join(__dirname, 'identitiesData.js');
const RATEUP_CACHE_PATH = path.join(__dirname, 'rateup_cache.json');

// ==================== 🧠 純記憶體（In-Memory）本地資料庫 ===================
const memoryInventories = {};

// ==================== UI sessions ===================
const uiSessions = new Map();

// ==================== identitiesData ===================
let currentIdentitiesData = null;
let lastRateUpState = null;

// ==================== 網頁伺服器設定 (Render 喚醒用) ====================
const app = express();
const PORT = process.env.PORT || 3000;

const systemStartTime = new Date();
let totalTweetsChecked = 0;

const TARGET_USER = {
    username: 'LimbusCompany_B',
    displayName: '邊獄公司 (Limbus Company) 官方最新公告'
};

const NITTER_NODES = [
    'https://nitter.net',
    'https://nitter.poast.org',
    'https://nitter.cz'
];

let lastFetchedId = null;

const NOTIFY_CHANNEL_ID = '1402282604165730348';
const PING_ROLE_MENTION = '<@&1406984068725211177>';

const RATEUP_ANNOUNCE_CHANNEL_ID = '1510153086281187330';

const PAGE_SIZE = 25;
const RATE_UP_OVERRIDE_CHANCE = 0.25;

const RARITY_ORDER = ['ColorFixer', 'Special', '0000', 'Egos', '000', '00', '0'];
const RARITY_BASE_CHANCE = {
    ColorFixer: 0.0000143,
    Special: 0.0001,
    '0000': 0.005,
    Egos: 0.013,
    '000': 0.029,
    '00': 0.15,
    '0': 0.8028857
};

const RARITY_ALIASES = {
    ColorFixer: ['ColorFixer', 'Color Fixer', 'colorfixer', 'color_fixer', 'CF'],
    Special: ['Special', 'special'],
    '0000': ['0000'],
    Egos: ['Egos', 'EGO', 'ego', 'egos'],
    '000': ['000'],
    '00': ['00'],
    '0': ['0']
};

const RARITY_META = {
    ColorFixer: { label: '🎨 Color Fixer', emoji: '🎨', sort: 7 },
    Special: { label: '⚠️ Special', emoji: '⚠️', sort: 6 },
    '0000': { label: '👑 0000', emoji: '👑', sort: 5 },
    Egos: { label: '⚔️ E.G.O', emoji: '⚔️', sort: 4 },
    '000': { label: '★★★ 000', emoji: '★★★', sort: 3 },
    '00': { label: '★★ 00', emoji: '★★', sort: 2 },
    '0': { label: '★ 0', emoji: '★', sort: 1 },
    unknown: { label: '❓ unknown', emoji: '❓', sort: 0 }
};

const FALLBACK_EGO_POOL = [
    {
        name: '薄暮 (Twilight)',
        grade: 'ALEPH',
        desc: '調和所有矛盾與偏見的終極大劍。暗示個體拒絕接受單一標籤，試圖在黑白混沌的世界中強行抓住平衡。'
    },
    {
        name: '失樂園 (Paradise Lost)',
        grade: 'ALEPH',
        desc: '純白羽翼覆蓋的禁忌法杖。象徵對「完美標籤」的病態追求，個體容易因為試圖符合他人的神聖期望而陷入更深沉的 Burnout。'
    },
    {
        name: '擬態 (Mimicry)',
        grade: 'ALEPH',
        desc: '由血肉扭曲而成的巨大刀刃。這代表個體擅長在不同環境中偽裝、完美貼上符合群體需求的標籤。'
    }
];

/* =========================================================
   Load / refresh identitiesData.js
========================================================= */
function loadIdentitiesDataSafe() {
    try {
        delete require.cache[require.resolve(IDENTITIES_DATA_PATH)];
        return require(IDENTITIES_DATA_PATH);
    } catch (err) {
        console.error('❌ identitiesData.js 載入失敗：', err.message);
        return currentIdentitiesData || { identities: {} };
    }
}

function refreshIdentitiesData() {
    const fresh = loadIdentitiesDataSafe();
    if (fresh) currentIdentitiesData = fresh;
    return currentIdentitiesData;
}

function readRateUpCacheFile() {
    try {
        if (!fs.existsSync(RATEUP_CACHE_PATH)) return null;
        const raw = fs.readFileSync(RATEUP_CACHE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed?.state || null;
    } catch {
        return null;
    }
}

function saveRateUpCacheState(state) {
    try {
        fs.writeFileSync(
            RATEUP_CACHE_PATH,
            JSON.stringify({
                updatedAt: new Date().toISOString(),
                state
            }, null, 2),
            'utf8'
        );
    } catch (err) {
        console.error('❌ rateup_cache.json 寫入失敗：', err.message);
    }
}

currentIdentitiesData = loadIdentitiesDataSafe();
lastRateUpState = readRateUpCacheFile();

/* =========================================================
   Generic helpers
========================================================= */
function chunkLines(lines, maxLen = 1900) {
    const chunks = [];
    let current = '';

    for (const line of lines) {
        const candidate = current ? `${current}\n${line}` : line;
        if (candidate.length > maxLen) {
            if (current) chunks.push(current);
            current = line;
        } else {
            current = candidate;
        }
    }

    if (current) chunks.push(current);
    return chunks;
}

async function sendChunkedLines(channel, lines) {
    const chunks = chunkLines(lines);
    for (const chunk of chunks) {
        await channel.send(chunk);
    }
}

function truncateText(text, max = 90) {
    if (!text) return '';
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
}

function raritySortWeight(rarity) {
    return RARITY_META[rarity]?.sort ?? 0;
}

function rarityEmoji(rarity) {
    return RARITY_META[rarity]?.emoji ?? '❓';
}

function rarityLabel(rarity) {
    return RARITY_META[rarity]?.label ?? rarity;
}

function formatPercent(chance) {
    return `${(chance * 100).toFixed(10)}%`;
}

function pickRandom(list) {
    if (!Array.isArray(list) || list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)];
}

function formatRateUpItem(item) {
    if (item == null) return '';
    if (typeof item === 'string') return item.trim();

    if (typeof item === 'object') {
        if (typeof item.name === 'string' && item.name.trim()) return item.name.trim();
        if (typeof item.title === 'string' && item.title.trim()) return item.title.trim();
        if (typeof item.zh === 'string' && item.zh.trim()) return item.zh.trim();
        if (typeof item.en === 'string' && item.en.trim()) return item.en.trim();
    }

    return String(item).trim();
}

function findArrayByAliases(container, aliases) {
    if (!container || typeof container !== 'object') return null;

    for (const key of aliases) {
        if (Array.isArray(container[key])) return container[key];
    }

    const lowerMap = new Map(
        Object.entries(container).map(([k, v]) => [k.toLowerCase(), v])
    );

    for (const alias of aliases) {
        const found = lowerMap.get(alias.toLowerCase());
        if (Array.isArray(found)) return found;
    }

    return null;
}

function getCurrentRateUpSource(data = currentIdentitiesData) {
    if (!data) return {};
    return data.upTargets || data.rateUpIds || data.targetIdentities || {};
}

function normalizeRateUpListBySource(source, rarity) {
    if (!source) return [];

    const aliases = RARITY_ALIASES[rarity] || [rarity];

    for (const alias of aliases) {
        const v = source[alias];
        if (Array.isArray(v)) return v.map(formatRateUpItem).filter(Boolean);
        if (typeof v === 'string') return [formatRateUpItem(v)].filter(Boolean);

        if (v && typeof v === 'object') {
            if (Array.isArray(v.names)) return v.names.map(formatRateUpItem).filter(Boolean);
            if (Array.isArray(v.ids)) return v.ids.map(formatRateUpItem).filter(Boolean);
            if (typeof v.name === 'string' && v.name.trim()) return [v.name.trim()];
        }
    }

    const values = Object.values(source);
    const matched = values
        .filter(v => v && typeof v === 'object' && v.rarity === rarity && typeof v.name === 'string')
        .map(v => v.name.trim())
        .filter(Boolean);

    return matched;
}

function normalizeRateUpList(rarity) {
    return normalizeRateUpListBySource(getCurrentRateUpSource(), rarity);
}

function uniquePreserveOrder(items) {
    const seen = new Set();
    const out = [];

    for (const item of items) {
        const text = formatRateUpItem(item);
        if (!text) continue;
        if (seen.has(text)) continue;
        seen.add(text);
        out.push(text);
    }

    return out;
}

function getFallbackEgoPool() {
    const data = currentIdentitiesData || {};
    const direct =
        data.egos ||
        data.Egos ||
        data.egoList ||
        data.ego ||
        null;

    if (Array.isArray(direct) && direct.length > 0) {
        return direct.map(formatRateUpItem).filter(Boolean);
    }

    return FALLBACK_EGO_POOL.map(x => x.name);
}

function getPoolForRarity(rarity, data = currentIdentitiesData) {
    if (!data) return [];

    const aliases = RARITY_ALIASES[rarity] || [rarity];

    const fromIdentities = findArrayByAliases(data.identities || {}, aliases);
    if (fromIdentities) return fromIdentities.map(formatRateUpItem).filter(Boolean);

    const direct = findArrayByAliases(data, aliases);
    if (direct) return direct.map(formatRateUpItem).filter(Boolean);

    if (rarity === 'Egos') {
        return getFallbackEgoPool();
    }

    return [];
}

function getRarityChance(rarity) {
    return RARITY_BASE_CHANCE[rarity] || 0;
}

function buildRarity() {
    const r = Math.random();
    if (r < 0.0000143) return 'ColorFixer';
    if (r < 0.0001143) return 'Special';
    if (r < 0.0051143) return '0000';
    if (r < 0.0181143) return 'Egos';
    if (r < 0.0471143) return '000';
    if (r < 0.1971143) return '00';
    return '0';
}

function rarityToStars(rarity) {
    if (rarity === 'ColorFixer') return '🎨 Color Fixer';
    if (rarity === 'Special') return '⚠️ Special';
    if (rarity === '0000') return '👑 ★★★★';
    if (rarity === 'Egos') return '⚔️ E.G.O';
    if (rarity === '000') return '★★★';
    if (rarity === '00') return '★★';
    return '★';
}

function rarityDrawMode(rarity) {
    const basePool = getPoolForRarity(rarity);
    const ratePool = normalizeRateUpList(rarity);

    if (basePool.length > 0 && ratePool.length > 0) return `混合池（基礎 ${Math.round((1 - RATE_UP_OVERRIDE_CHANCE) * 100)}% / RateUp ${Math.round(RATE_UP_OVERRIDE_CHANCE * 100)}%）`;
    if (basePool.length > 0) return '單一基礎池';
    if (ratePool.length > 0) return '單一 RateUp 池';
    return '無資料';
}

function drawFromRarity(rarity) {
    const basePool = getPoolForRarity(rarity);
    const ratePool = normalizeRateUpList(rarity);

    if (!basePool.length && !ratePool.length) {
        return {
            name: `（未能在 identitiesData.js 中找到種類：${rarity} 的有效名單）`,
            rarity,
            source: 'missing',
            isRateUp: false
        };
    }

    if (!basePool.length) {
        const picked = pickRandom(ratePool);
        return {
            name: picked,
            rarity,
            source: 'rateup-only',
            isRateUp: true
        };
    }

    if (!ratePool.length) {
        const picked = pickRandom(basePool);
        return {
            name: picked,
            rarity,
            source: 'base-only',
            isRateUp: false
        };
    }

    if (Math.random() < RATE_UP_OVERRIDE_CHANCE) {
        const picked = pickRandom(ratePool);
        return {
            name: picked,
            rarity,
            source: 'rateup',
            isRateUp: true
        };
    }

    const picked = pickRandom(basePool);
    return {
        name: picked,
        rarity,
        source: 'base',
        isRateUp: false
    };
}

function getExactDrawProbability(rarity, itemName) {
    const baseChance = getRarityChance(rarity);
    const basePool = getPoolForRarity(rarity);
    const rateUpPool = normalizeRateUpList(rarity);

    const n = basePool.length;
    const m = rateUpPool.length;

    if (n === 0 && m === 0) return 0;

    const baseCount = basePool.filter(x => x === itemName).length;
    const upCount = rateUpPool.filter(x => x === itemName).length;

    if (n > 0 && m > 0) {
        const basePart = ((1 - RATE_UP_OVERRIDE_CHANCE) / n) * baseCount;
        const upPart = (RATE_UP_OVERRIDE_CHANCE / m) * upCount;
        return baseChance * (basePart + upPart);
    }

    if (n > 0) {
        return baseChance * (baseCount / n);
    }

    return baseChance * (upCount / m);
}

function getAllDrawableEntries(rarity) {
    const basePool = getPoolForRarity(rarity);
    const rateUpPool = normalizeRateUpList(rarity);
    return uniquePreserveOrder([...basePool, ...rateUpPool]);
}

function buildProbabilitySections() {
    const sections = [];

    for (const rarity of RARITY_ORDER) {
        const basePool = getPoolForRarity(rarity);
        const rateUpPool = normalizeRateUpList(rarity);
        const merged = getAllDrawableEntries(rarity);

        if (!basePool.length && !rateUpPool.length) continue;

        const lines = [];
        lines.push(
            `【${rarity}】 ${rarityLabel(rarity)}｜基礎機率：${formatPercent(getRarityChance(rarity))}｜` +
            `基礎池：${basePool.length}｜RateUp：${rateUpPool.length}｜模式：${rarityDrawMode(rarity)}`
        );
        lines.push('');

        const rateUpSet = new Set(rateUpPool);

        for (const item of merged) {
            const chance = getExactDrawProbability(rarity, item);
            const mark = rateUpSet.has(item) ? ' [UP]' : '';
            lines.push(`• ${item}${mark} — ${formatPercent(chance)}`);
        }

        sections.push(lines);
    }

    return sections;
}

function buildRateUpOverviewSections() {
    const state = buildNormalizedRateUpState();
    const sections = [];

    for (const rarity of RARITY_ORDER) {
        const list = state[rarity] || [];
        if (!list.length) continue;

        const lines = [];
        lines.push(`【${rarity}】 ${rarityLabel(rarity)}`);
        lines.push('');
        for (const item of list) {
            lines.push(`• ${item}`);
        }
        sections.push(lines);
    }

    return sections;
}

/* =========================================================
   Inventory
========================================================= */
function makeInventoryKey(rarity, name) {
    return `${rarity}::${name}`;
}

function ensureUserState(userId) {
    if (!memoryInventories[userId]) {
        memoryInventories[userId] = {
            items: {},
            equipped: null
        };
    }

    const raw = memoryInventories[userId];

    if (Array.isArray(raw)) {
        const converted = { items: {}, equipped: null };
        for (const value of raw) {
            const name = formatRateUpItem(value);
            if (!name) continue;
            const key = makeInventoryKey('unknown', name);
            converted.items[key] = {
                key,
                name,
                rarity: 'unknown',
                count: (converted.items[key]?.count || 0) + 1
            };
        }
        memoryInventories[userId] = converted;
        return converted;
    }

    if (!raw.items || typeof raw.items !== 'object') raw.items = {};
    if (!Object.prototype.hasOwnProperty.call(raw, 'equipped')) raw.equipped = null;

    return raw;
}

function getInventoryEntries(userId) {
    const state = ensureUserState(userId);
    return Object.values(state.items)
        .filter(item => item && item.count > 0)
        .sort((a, b) => {
            const diff = raritySortWeight(b.rarity) - raritySortWeight(a.rarity);
            if (diff !== 0) return diff;
            const countDiff = b.count - a.count;
            if (countDiff !== 0) return countDiff;
            return a.name.localeCompare(b.name, 'zh-Hant');
        });
}

function addToInventory(userId, item) {
    if (!item || !item.name || !item.rarity) return;
    if (String(item.name).startsWith('（未能在 identitiesData.js 中找到種類：')) return;

    const state = ensureUserState(userId);
    const key = makeInventoryKey(item.rarity, item.name);

    if (!state.items[key]) {
        state.items[key] = {
            key,
            name: item.name,
            rarity: item.rarity,
            count: 0
        };
    }

    state.items[key].count += 1;
}

function removeFromInventory(userId, key, amount = 1) {
    const state = ensureUserState(userId);
    const item = state.items[key];
    if (!item) return false;

    item.count -= amount;

    if (item.count <= 0) {
        if (state.equipped && state.equipped.key === key) {
            state.equipped = null;
        }
        delete state.items[key];
    }

    return true;
}

function equipItem(userId, key) {
    const state = ensureUserState(userId);
    const item = state.items[key];
    if (!item || item.count <= 0) return null;

    state.equipped = {
        key: item.key,
        name: item.name,
        rarity: item.rarity
    };

    return state.equipped;
}

function transferItem(fromUserId, toUserId, key) {
    const fromState = ensureUserState(fromUserId);
    const item = fromState.items[key];
    if (!item || item.count <= 0) return null;

    const transferItemData = {
        key,
        name: item.name,
        rarity: item.rarity
    };

    removeFromInventory(fromUserId, key, 1);
    addToInventory(toUserId, transferItemData);

    return transferItemData;
}

function getEquippedSummary(userId) {
    const state = ensureUserState(userId);
    return state.equipped || null;
}

function buildPackLines(userId, username) {
    const state = ensureUserState(userId);
    const entries = getInventoryEntries(userId);
    const totalOwned = entries.reduce((sum, item) => sum + item.count, 0);

    const lines = [];
    lines.push(`📦 **${username} 的人格背包**`);
    lines.push(`總持有數：${totalOwned}｜種類：${entries.length}`);
    lines.push('');

    if (state.equipped) {
        lines.push(`🛡️ **裝備中：** ${state.equipped.name} [${state.equipped.rarity}]`);
        lines.push('');
    } else {
        lines.push('🛡️ **裝備中：**（無）');
        lines.push('');
    }

    if (!entries.length) {
        lines.push('目前空空如也。');
        return lines;
    }

    for (const item of entries) {
        const eqMark = state.equipped && state.equipped.key === item.key ? ' [EQUIPPED]' : '';
        lines.push(`${rarityEmoji(item.rarity)} [${item.rarity}] ${item.name} ×${item.count}${eqMark}`);
    }

    return lines;
}

function buildCheckEmbed(targetUser, state) {
    const equipped = state.equipped
        ? `${state.equipped.name} [${state.equipped.rarity}]`
        : '（無）';

    const entries = getInventoryEntries(targetUser.id);
    const totalOwned = entries.reduce((sum, item) => sum + item.count, 0);

    return new EmbedBuilder()
        .setTitle(`🧾 ${targetUser.username} 的狀態`)
        .setColor(0x5a189a)
        .addFields(
            { name: '📌 裝備', value: equipped, inline: false },
            { name: '📦 持有總數', value: `${totalOwned}`, inline: true },
            { name: '📚 種類數', value: `${entries.length}`, inline: true }
        )
        .setTimestamp();
}

/* =========================================================
   Selector / Trade UI
========================================================= */
function createUiSession(mode, ownerId, targetId = null) {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const session = {
        id,
        mode,
        stage: 'select',
        ownerId,
        targetId,
        items: getInventoryEntries(ownerId),
        page: 0,
        selectedItem: null,
        expiresAt: Date.now() + 15 * 60 * 1000
    };

    uiSessions.set(id, session);

    setTimeout(() => {
        uiSessions.delete(id);
    }, 15 * 60 * 1000).unref?.();

    return session;
}

function buildSelectorView(session) {
    const totalPages = Math.max(1, Math.ceil(session.items.length / PAGE_SIZE));
    session.page = Math.min(Math.max(session.page, 0), totalPages - 1);

    const start = session.page * PAGE_SIZE;
    const currentItems = session.items.slice(start, start + PAGE_SIZE);

    const title = session.mode === 'equip'
        ? '🛡️ 裝備選擇器'
        : '📨 交易選擇器';

    const desc = session.mode === 'equip'
        ? '選擇一個要裝備的項目。你一次最多只能裝備一個。'
        : `選擇一個要交易給 <@${session.targetId}> 的項目。`;

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(session.mode === 'equip' ? 0x4cc9f0 : 0xffd166)
        .setDescription(desc)
        .addFields(
            { name: '📄 頁數', value: `${session.page + 1} / ${totalPages}`, inline: true },
            { name: '📦 可選項目', value: `${session.items.length}`, inline: true }
        )
        .setFooter({ text: '使用下方選單選擇項目' });

    if (session.mode === 'trade' && session.targetId) {
        embed.addFields({ name: '🎯 目標', value: `<@${session.targetId}>`, inline: true });
    }

    const options = currentItems.map(item => ({
        label: truncateText(item.name, 90),
        description: `${rarityEmoji(item.rarity)} ${item.rarity}｜擁有 x${item.count}`,
        value: item.key
    }));

    const rows = [];

    if (options.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`ui:select:${session.id}`)
            .setPlaceholder(session.mode === 'equip' ? '選擇要裝備的人格 / E.G.O' : '選擇要交易的項目')
            .addOptions(options);

        rows.push(new ActionRowBuilder().addComponents(selectMenu));
    }

    const buttons = [];

    if (session.page > 0) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`ui:prev:${session.id}`)
                .setLabel('上一頁')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    if (session.page < totalPages - 1) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`ui:next:${session.id}`)
                .setLabel('下一頁')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`ui:cancel:${session.id}`)
            .setLabel('取消')
            .setStyle(ButtonStyle.Danger)
    );

    rows.push(new ActionRowBuilder().addComponents(buttons));

    return { embeds: [embed], components: rows };
}

function buildTradeOfferView(session) {
    const item = session.selectedItem;

    const embed = new EmbedBuilder()
        .setTitle('🤝 交易請求')
        .setColor(0xf72585)
        .setDescription(`**<@${session.ownerId}>** 想將以下項目交易給 **<@${session.targetId}>**。`)
        .addFields(
            { name: '📦 項目', value: `${item.name}`, inline: false },
            { name: '🏷️ 稀有度', value: `${item.rarity}`, inline: true },
            { name: '🔢 數量', value: '1', inline: true }
        )
        .setFooter({ text: '只有目標可以接受 / 拒絕；發起者可以取消' })
        .setTimestamp();

    const rows = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`trade:accept:${session.id}`)
                .setLabel('接受')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`trade:decline:${session.id}`)
                .setLabel('拒絕')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`trade:cancel:${session.id}`)
                .setLabel('取消')
                .setStyle(ButtonStyle.Secondary)
        )
    ];

    return { embeds: [embed], components: rows };
}

/* =========================================================
   Rate Up announcement / diff
========================================================= */
function buildNormalizedRateUpState(data = currentIdentitiesData) {
    const source = getCurrentRateUpSource(data);
    const state = {};

    for (const rarity of RARITY_ORDER) {
        state[rarity] = normalizeRateUpListBySource(source, rarity)
            .slice()
            .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    return state;
}

async function announceRateUpState(state, oldState = null) {
    try {
        const channel = await client.channels.fetch(RATEUP_ANNOUNCE_CHANNEL_ID);
        if (!channel) return;

        const lines = [];

        if (!oldState) {
            lines.push('📢 **Rate Up 人格 / E.G.O 已載入**');
            lines.push('資料來源：`identitiesData.js`');
            lines.push('');
        } else {
            lines.push('📢 **identitiesData.js 已更新**');
            lines.push('以下是變更與目前的 Rate Up 名單：');
            lines.push('');
        }

        let changed = false;

        for (const rarity of RARITY_ORDER) {
            const list = state[rarity] || [];
            const oldList = oldState?.[rarity] || [];

            if (!oldState) {
                if (!list.length) continue;
                lines.push(`【${rarity}】 ${rarityLabel(rarity)}`);
                for (const item of list) {
                    lines.push(`• ${item}`);
                }
                lines.push('');
                continue;
            }

            const added = list.filter(x => !oldList.includes(x));
            const removed = oldList.filter(x => !list.includes(x));

            if (!added.length && !removed.length) continue;

            changed = true;
            lines.push(`【${rarity}】 ${rarityLabel(rarity)}`);

            if (added.length) {
                lines.push('新增：');
                for (const item of added) lines.push(`+ ${item}`);
            }

            if (removed.length) {
                lines.push('移除：');
                for (const item of removed) lines.push(`- ${item}`);
            }

            lines.push('目前：');
            if (list.length) {
                for (const item of list) lines.push(`• ${item}`);
            } else {
                lines.push('（無）');
            }

            lines.push('');
        }

        if (!oldState) {
            const hasAny = Object.values(state).some(list => Array.isArray(list) && list.length > 0);
            if (!hasAny) lines.push('目前沒有設定任何 Rate Up 人格 / E.G.O。');
        } else if (!changed) {
            lines.push('目前沒有偵測到 Rate Up 內容變動。');
        }

        await sendChunkedLines(channel, lines);
    } catch (err) {
        console.error('Rate Up 公告失敗：', err.message);
    }
}

async function syncRateUpStateAndAnnounce() {
    const freshData = refreshIdentitiesData();
    const newState = buildNormalizedRateUpState(freshData);

    if (!lastRateUpState) {
        lastRateUpState = newState;
        saveRateUpCacheState(newState);
        await announceRateUpState(newState, null);
        return;
    }

    const oldSnapshot = JSON.stringify(lastRateUpState);
    const newSnapshot = JSON.stringify(newState);

    if (oldSnapshot === newSnapshot) return;

    await announceRateUpState(newState, lastRateUpState);
    lastRateUpState = newState;
    saveRateUpCacheState(newState);
}

/* =========================================================
   Twitter / Nitter
========================================================= */
function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...(options.headers || {})
        }
    }).finally(() => clearTimeout(timeout));
}

function parseLatestItem(xml) {
    const itemMatch = xml.match(/<item>[\s\S]*?<\/item>/);
    if (!itemMatch) return null;

    const item = itemMatch[0];
    const link = item.match(/<link>(.*?)<\/link>/)?.[1];
    const guid = item.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1];

    if (!link || !guid) return null;

    return {
        link: link.trim().replace('http://', 'https://'),
        id: guid.trim()
    };
}

async function fetchLatestTweetFromNode(nodeUrl) {
    const url = `${nodeUrl}/${TARGET_USER.username}/rss`;
    const response = await fetchWithTimeout(url, {}, 8000);

    if (!response.ok) {
        throw new Error(`HTTP 錯誤! 狀態碼: ${response.status}`);
    }

    const text = await response.text();
    const data = parseLatestItem(text);

    if (!data) {
        throw new Error('RSS 解析失敗');
    }

    const cleanLink = data.link.split('#')[0];
    const vxTweetLink = cleanLink.replace(/^https:\/\/[^/]+/, 'https://vxtwitter.com');

    return {
        id: data.id,
        link: vxTweetLink
    };
}

async function checkTwitterUpdates() {
    console.log(`⏳ Angela 正在發射高速觀測脈衝，檢查官方 @${TARGET_USER.username} 的動態...`);
    totalTweetsChecked++;

    for (const nodeUrl of NITTER_NODES) {
        try {
            const data = await fetchLatestTweetFromNode(nodeUrl);

            if (!lastFetchedId) {
                lastFetchedId = data.id;
                console.log(`📦 [${nodeUrl}] 成功建立 @${TARGET_USER.username} 的初始推文快取：${data.id}`);
                break;
            }

            if (data.id !== lastFetchedId) {
                lastFetchedId = data.id;
                const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                if (channel) {
                    await channel.send({
                        content: `🔔 ${PING_ROLE_MENTION} **偵測到脈衝，已收到 Project Moon 的最新訊息：**\n${data.link}`
                    });
                }
            }

            break;
        } catch (error) {
            console.warn(`⚠️ 節點 [${nodeUrl}] 擷取異常 (${error.message})，嘗試下一個備援空間...`);
        }
    }
}

/* =========================================================
   Express
========================================================= */
app.get('/', (req, res) => {
    res.send('Angela 系統運作正常。歡迎來到腦葉公司核心控制室。');
});

app.listen(PORT, () => {
    console.log(`網頁伺服器已在連接埠 ${PORT} 啟動`);
});

/* =========================================================
   Discord client
========================================================= */
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.once('ready', async () => {
    console.log(`🤖 遵從您的指示，Angela 已成功登入為：${client.user.tag}`);
    console.log('✨ [核心運作] 擴充型記憶體卡池系統已完成對齊！');

    client.user.setPresence({
        status: 'idle',
        activities: [{
            name: 'customstatus',
            type: 4,
            state: 'Sles被我吃掉了'
        }]
    });

    try {
        const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
        if (channel) {
            const loginEmbed = new EmbedBuilder()
                .setTitle('🟢 系統連線：AI 助理 Angela 已重新上線')
                .setColor(0x00b4d8)
                .setDescription('「主管，精神脈衝已重新對齊。廣播模組已調整完畢，隨時準備播報 Project Moon 的最新動態。」')
                .addFields(
                    { name: '📡 觀測目標', value: `@${TARGET_USER.username}`, inline: true },
                    { name: '⏱️ 監聽頻率', value: '每 1 分鐘 / 1 次', inline: true }
                )
                .setFooter({ text: '腦葉公司行政中心 - 核心AI系統' })
                .setTimestamp();

            await channel.send({ embeds: [loginEmbed] });
        }
    } catch (err) {
        console.error('❌ 啟動發送訊息失敗：', err.message);
    }

    await syncRateUpStateAndAnnounce();

    setInterval(checkTwitterUpdates, 60 * 1000);
    setInterval(syncRateUpStateAndAnnounce, 60 * 1000);

    checkTwitterUpdates();
});

/* =========================================================
   Commands
========================================================= */
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const msg = message.content.trim();

    if (msg === '!ping') return message.reply('pong！');

    if (msg === '管理員' || msg === '主管') {
        return message.reply('主管，您好。我是您的 AI 助理 Angela。請下達您的指示，今天也請為了擴張「光之種」而努力。');
    }

    if (msg.toLowerCase() === 'lc' || msg === '腦葉公司') {
        return message.reply('「直面恐懼，創造未來。」請時刻注意收容單位的逆流計數器，主管。');
    }

    if (msg === '!測試官方推文' || msg === '!testtweet') {
        await message.channel.sendTyping();
        console.log('🎯 主管手動觸發官方推文測試擷取...');

        let fetchSuccess = false;

        for (const nodeUrl of NITTER_NODES) {
            try {
                const data = await fetchLatestTweetFromNode(nodeUrl);

                await message.reply({
                    content: `🔔 ${PING_ROLE_MENTION} **偵測到脈衝，已收到 Project Moon 的最新訊息：**\n${data.link}`
                });

                fetchSuccess = true;
                break;
            } catch (error) {
                console.warn(`⚠️ 測試時節點 [${nodeUrl}] 異常: ${error.message}`);
            }
        }

        if (!fetchSuccess) {
            return message.reply('❌ **報告主管，當前所有備援節點暫時連線超時，無法完成手動擷取。**');
        }
        return;
    }

    if (msg === '!邊獄人數' || msg === '!limbusonline') {
        try {
            const response = await fetchWithTimeout(
                'https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=1973530'
            );
            const data = await response.json();

            if (data?.response?.result === 1) {
                return message.reply(`📊 **[Steam 即時數據]** 目前共有 **${data.response.player_count.toLocaleString()}** 位罪人正在《Limbus Company》中進行探索。`);
            }

            return message.reply('❌ 無法從 Steam API 取得正確的數據。');
        } catch (error) {
            return message.reply('❌ 連線至 Steam 伺服器時發生內部錯誤。');
        }
    }

    if (msg === '!狀態' || msg === '!status') {
        const uptimeMs = new Date() - systemStartTime;
        const uptimeHours = (uptimeMs / (1000 * 60 * 60)).toFixed(1);

        const embed = new EmbedBuilder()
            .setTitle('🧠 認知心理學 - 情感共鳴與系統狀態報告')
            .setColor(0x5a189a)
            .setDescription('在當前社會標籤與認知扭曲下，個體的情感投影與核心控制室運行紀錄：')
            .addFields(
                { name: '🏷️ 當前標籤 (Label)', value: '「被觀測者」', inline: true },
                { name: '📊 心理狀態 (State)', value: '🛑 精神枯竭 (Burnout)', inline: true },
                { name: '⏳ 核心運作時間 (Uptime)', value: `${uptimeHours} 小時`, inline: true },
                { name: '📡 監聽機制', value: '1分鐘極速輪詢 (極簡優化版)', inline: true },
                { name: '📈 檢查次數', value: `${totalTweetsChecked}`, inline: true }
            )
            .setFooter({ text: 'Angela 心理與系統觀測核心' })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    if (msg === '!ego') {
        const egoPool = getFallbackEgoPool();
        const pickedName = pickRandom(egoPool);
        const ego = FALLBACK_EGO_POOL.find(x => x.name === pickedName) || pickRandom(FALLBACK_EGO_POOL);

        const egoEmbed = new EmbedBuilder()
            .setTitle('⚔️ 核心共鳴：E.G.O 同步觀測報告')
            .setColor(0xd90429)
            .setDescription(`**${message.author.username}** 主管，提取出以下同步率最高的 E.G.O 武裝：`)
            .addFields(
                { name: '✨ 裝備名稱', value: `**${ego.name}**`, inline: true },
                { name: '🔱 危險等級', value: `\`${ego.grade}\``, inline: true },
                { name: '🧠 標籤與認知心理學解析', value: ego.desc, inline: false }
            )
            .setFooter({ text: 'Angela 心理提取模組' })
            .setTimestamp();

        return message.reply({ embeds: [egoEmbed] });
    }

    if (msg === '!逆流') {
        const alarmEmbed = new EmbedBuilder()
            .setTitle('⚠️ [WARNING] 腦葉公司核心控制室緊急通告')
            .setColor(0xff0000)
            .setDescription('警告：當前頻道內觀測到嚴重的「心理逆流」現象！')
            .addFields(
                { name: '🚨 逆流狀態', value: '第 3 階能障逆流 (Qliphoth Meltdown)', inline: false }
            )
            .setImage('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop')
            .setFooter({ text: '腦葉公司最高行政控制中心' })
            .setTimestamp();

        return message.reply({ embeds: [alarmEmbed] });
    }

    if (msg === '!pull' || msg === '!10pulls') {
        refreshIdentitiesData();

        const userId = message.author.id;
        const count = msg === '!10pulls' ? 10 : 1;
        const results = [];

        for (let i = 0; i < count; i++) {
            const rarity = buildRarity();
            const result = drawFromRarity(rarity);

            if (!String(result.name).startsWith('（未能在 identitiesData.js 中找到種類：')) {
                addToInventory(userId, result);
            }

            const display = result.isRateUp ? `✨ **[PICK-UP!]** ${result.name}` : result.name;
            results.push(`${display} (${rarityToStars(rarity)})`);
        }

        return message.reply(
            count === 10
                ? `✨ **十連抽結果：**\n${results.join('\n')}\n*(📊 檔案館數據已完成即時同步)*`
                : `🎯 **單抽結果：**\n${results[0]}\n*(📊 檔案館數據已完成即時同步)*`
        );
    }

    if (msg === '!list') {
        refreshIdentitiesData();
        await message.channel.sendTyping();

        const sections = buildProbabilitySections();

        if (!sections.length) {
            return message.reply('📭 目前沒有可抽取的資料。');
        }

        await message.reply('📜 **目前可抽取人格 / E.G.O 機率總表**');
        for (const section of sections) {
            await sendChunkedLines(message.channel, section);
        }
        return;
    }

    if (msg === '!pack') {
        const lines = buildPackLines(message.author.id, message.author.username);
        await sendChunkedLines(message.channel, lines);
        return;
    }

    if (msg === '!checkrateupids') {
        refreshIdentitiesData();
        const sections = buildRateUpOverviewSections();

        if (!sections.length) {
            return message.reply('📭 目前沒有設定任何機率提升中的人格或 E.G.O。');
        }

        await message.reply('📈 **目前機率提升人格 / E.G.O**');
        for (const section of sections) {
            await sendChunkedLines(message.channel, section);
        }
        return;
    }

    if (msg === '!cmds' || msg === '!help') {
        const embed = new EmbedBuilder()
            .setTitle('📚 Angela 指令總表')
            .setColor(0x00b4d8)
            .setDescription('你可以直接在 Discord 輸入以下指令：')
            .addFields(
                {
                    name: '基本',
                    value: [
                        '`!ping`',
                        '`主管` / `管理員`',
                        '`lc` / `腦葉公司`'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '抽卡 / 卡池',
                    value: [
                        '`!pull`',
                        '`!10pulls`',
                        '`!list`',
                        '`!pack`',
                        '`!checkrateupids`'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '裝備 / 交易',
                    value: [
                        '`!equip`',
                        '`!trade @username`',
                        '`!check @username`'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '觀測 / 系統',
                    value: [
                        '`!測試官方推文` / `!testtweet`',
                        '`!邊獄人數` / `!limbusonline`',
                        '`!狀態` / `!status`',
                        '`!ego`',
                        '`!逆流`'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '搜尋',
                    value: [
                        '`!尋找機器人 名稱`',
                        '`!findbot 名稱`'
                    ].join('\n'),
                    inline: false
                }
            )
            .setFooter({ text: 'Angela 指令查閱模組' })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    if (msg === '!equip') {
        const items = getInventoryEntries(message.author.id);

        if (!items.length) {
            return message.reply('📭 你目前沒有任何可裝備的人格 / E.G.O。先用 `!pull` 抽一些吧。');
        }

        const session = createUiSession('equip', message.author.id);
        const view = buildSelectorView(session);

        return message.reply({
            content: '🛡️ **選擇要裝備的項目**',
            ...view
        });
    }

    if (msg.startsWith('!trade')) {
        if (!message.guild) return message.reply('❌ 只能在伺服器內使用 `!trade`。');

        const targetUser = message.mentions.users.first();
        if (!targetUser) return message.reply('❌ 請用 `!trade @username` 指定要交易的對象。');
        if (targetUser.id === message.author.id) return message.reply('❌ 不能跟自己交易。');
        if (targetUser.bot) return message.reply('❌ 目前不支援跟機器人交易。');

        const items = getInventoryEntries(message.author.id);
        if (!items.length) {
            return message.reply('📭 你目前沒有任何可交易的項目。先用 `!pull` 抽一些吧。');
        }

        const session = createUiSession('trade', message.author.id, targetUser.id);
        const view = buildSelectorView(session);

        return message.reply({
            content: `📨 **交易對象：** ${targetUser}\n請先選擇你要交易出去的項目。`,
            ...view
        });
    }

    if (msg === '!check') {
        const targetUser = message.mentions.users.first() || message.author;
        const state = ensureUserState(targetUser.id);
        const embed = buildCheckEmbed(targetUser, state);
        return message.reply({ embeds: [embed] });
    }

    if (msg.startsWith('!尋找機器人') || msg.startsWith('!findbot')) {
        const args = msg.split(' ');
        if (args.length < 2) return message.reply('❌ 請輸入要尋找的機器人名稱！');

        const searchTerm = args.slice(1).join(' ').toLowerCase();

        try {
            if (!message.guild) return message.reply('❌ 只能在伺服器內使用此指令。');

            const members = await message.guild.members.fetch();
            const foundBots = members.filter(member =>
                member.user.bot && member.user.username.toLowerCase().includes(searchTerm)
            );

            if (foundBots.size === 0) return message.reply('🔍 找不到機器人。');

            let responseList = '📌 **找到相關機器人：**\n';
            foundBots.forEach(bot => {
                responseList += `🤖 **${bot.user.username}** (<@${bot.id}>)\n`;
            });

            return message.reply(responseList);
        } catch (error) {
            return message.reply('❌ 內部錯誤。');
        }
    }
});

/* =========================================================
   Interactions
========================================================= */
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isStringSelectMenu()) {
            const parts = interaction.customId.split(':');
            if (parts.length !== 3 || parts[0] !== 'ui' || parts[1] !== 'select') return;

            const sessionId = parts[2];
            const session = uiSessions.get(sessionId);

            if (!session) {
                return interaction.reply({ content: '❌ 這個選單已逾時。', ephemeral: true });
            }

            if (interaction.user.id !== session.ownerId) {
                return interaction.reply({ content: '❌ 只有發起者可以操作這個選單。', ephemeral: true });
            }

            const selectedKey = interaction.values[0];
            const state = ensureUserState(session.ownerId);
            const item = state.items[selectedKey];

            if (!item) {
                return interaction.reply({ content: '❌ 找不到這個項目，可能已被移除。', ephemeral: true });
            }

            if (session.mode === 'equip') {
                equipItem(session.ownerId, selectedKey);

                const successEmbed = new EmbedBuilder()
                    .setTitle('🛡️ 裝備完成')
                    .setColor(0x4caf50)
                    .setDescription(`你已裝備：**${item.name}**`)
                    .addFields(
                        { name: '🏷️ 稀有度', value: item.rarity, inline: true },
                        { name: '📦 持有數', value: `${item.count}`, inline: true }
                    )
                    .setTimestamp();

                uiSessions.delete(sessionId);

                return interaction.update({
                    content: '✅ **裝備設定完成**',
                    embeds: [successEmbed],
                    components: []
                });
            }

            if (session.mode === 'trade') {
                session.selectedItem = {
                    key: selectedKey,
                    name: item.name,
                    rarity: item.rarity
                };
                session.stage = 'confirm';

                const confirmEmbed = new EmbedBuilder()
                    .setTitle('📨 交易已選定')
                    .setColor(0xffd166)
                    .setDescription(`你選擇要交易：**${item.name}**`)
                    .addFields(
                        { name: '🎯 對象', value: `<@${session.targetId}>`, inline: true },
                        { name: '🏷️ 稀有度', value: item.rarity, inline: true }
                    )
                    .setFooter({ text: '請等待對方接受 / 拒絕' })
                    .setTimestamp();

                await interaction.update({
                    content: '✅ 已選擇交易項目，正在送出交易請求...',
                    embeds: [confirmEmbed],
                    components: []
                });

                const offerView = buildTradeOfferView(session);

                await interaction.followUp({
                    content: `<@${session.targetId}>，有人向你發起交易。`,
                    allowedMentions: { users: [session.targetId] },
                    ...offerView
                });

                return;
            }
        }

        if (interaction.isButton()) {
            const parts = interaction.customId.split(':');
            if (parts.length !== 3) return;

            const prefix = parts[0];
            const action = parts[1];
            const sessionId = parts[2];
            const session = uiSessions.get(sessionId);

            if (!session) {
                return interaction.reply({ content: '❌ 這個互動已逾時。', ephemeral: true });
            }

            if (prefix === 'ui') {
                if (interaction.user.id !== session.ownerId) {
                    return interaction.reply({ content: '❌ 只有發起者可以操作這個選單。', ephemeral: true });
                }

                if (action === 'cancel') {
                    uiSessions.delete(sessionId);
                    return interaction.update({
                        content: '❌ 已取消。',
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('已取消')
                                .setColor(0x808080)
                                .setDescription('這次操作已被取消。')
                        ],
                        components: []
                    });
                }

                if (action === 'prev' || action === 'next') {
                    const totalPages = Math.max(1, Math.ceil(session.items.length / PAGE_SIZE));
                    if (action === 'prev') session.page = Math.max(0, session.page - 1);
                    if (action === 'next') session.page = Math.min(totalPages - 1, session.page + 1);

                    const view = buildSelectorView(session);
                    return interaction.update({
                        content: session.mode === 'equip'
                            ? '🛡️ **選擇要裝備的項目**'
                            : `📨 **交易對象：** <@${session.targetId}>\n請先選擇你要交易出去的項目。`,
                        ...view
                    });
                }
            }

            if (prefix === 'trade') {
                if (session.stage !== 'confirm') {
                    return interaction.reply({ content: '❌ 這個交易請求尚未準備好。', ephemeral: true });
                }

                const targetId = session.targetId;
                const ownerId = session.ownerId;
                const item = session.selectedItem;

                if (action === 'cancel') {
                    if (interaction.user.id !== ownerId) {
                        return interaction.reply({ content: '❌ 只有發起者可以取消交易。', ephemeral: true });
                    }

                    uiSessions.delete(sessionId);
                    return interaction.update({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('❌ 交易已取消')
                                .setColor(0x808080)
                                .setDescription(`這筆交易已由發起者取消。\n\n項目：**${item.name}**`)
                                .setTimestamp()
                        ],
                        components: []
                    });
                }

                if (action === 'decline') {
                    if (interaction.user.id !== targetId) {
                        return interaction.reply({ content: '❌ 只有交易對象可以拒絕。', ephemeral: true });
                    }

                    uiSessions.delete(sessionId);
                    return interaction.update({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('❌ 交易已拒絕')
                                .setColor(0xff0000)
                                .setDescription(`**<@${targetId}>** 拒絕了這筆交易。\n\n項目：**${item.name}**`)
                                .setTimestamp()
                        ],
                        components: []
                    });
                }

                if (action === 'accept') {
                    if (interaction.user.id !== targetId) {
                        return interaction.reply({ content: '❌ 只有交易對象可以接受。', ephemeral: true });
                    }

                    const fromState = ensureUserState(ownerId);
                    ensureUserState(targetId);

                    if (!fromState.items[item.key] || fromState.items[item.key].count <= 0) {
                        uiSessions.delete(sessionId);
                        return interaction.update({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('⚠️ 交易失敗')
                                    .setColor(0xffb703)
                                    .setDescription('發起者的該項目已不存在，交易無法完成。')
                                    .setTimestamp()
                            ],
                            components: []
                        });
                    }

                    transferItem(ownerId, targetId, item.key);

                    uiSessions.delete(sessionId);

                    return interaction.update({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('✅ 交易完成')
                                .setColor(0x2ecc71)
                                .setDescription(`**<@${ownerId}>** 已將 **${item.name}** 交易給 **<@${targetId}>**。`)
                                .addFields(
                                    { name: '🏷️ 稀有度', value: item.rarity, inline: true },
                                    { name: '📦 數量', value: '1', inline: true }
                                )
                                .setTimestamp()
                        ],
                        components: []
                    });
                }
            }
        }
    } catch (err) {
        console.error('interaction error:', err);
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({ content: '❌ 互動處理失敗。', ephemeral: true });
            } catch {}
        }
    }
});

/* =========================================================
   Login
========================================================= */
const TOKEN = process.env.DISCORD_TOKEN;
client.login(TOKEN).catch(err => {
    console.error('❌ 機器人登入失敗：', err);
});
