const fs = require('fs');
const path = require('path');
const express = require('express');
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require('discord.js');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

/* =========================
   Paths / Storage
========================= */
const DATA_DIR = path.join(__dirname, 'data');
const PLAYERS_DB_PATH = path.join(DATA_DIR, 'players.json');
const RATEUP_CACHE_PATH = path.join(DATA_DIR, 'rateup_cache.json');
const TWITTER_CACHE_PATH = path.join(DATA_DIR, 'twitter_cache.json');
const STEAM_CACHE_PATH = path.join(DATA_DIR, 'steam_cache.json');
const IDENTITIES_DATA_PATH = path.join(__dirname, 'identitiesData.js');

/* =========================
   Config
========================= */
const PORT = process.env.PORT || 3000;
const NOTIFY_CHANNEL_ID = '1402282604165730348';
const PING_ROLE_MENTION = '<@&1406984068725211177>';
const RATEUP_ANNOUNCE_CHANNEL_ID = '1510153086281187330';
const LUNACY_ADMIN_NAME = 'sles_forever';
const LUNACY_ADMIN_ID = process.env.LUNACY_ADMIN_ID || '';

const TARGET_USER = {
    username: 'LimbusCompany_B',
    displayName: '邊獄公司 (Limbus Company) 官方最新公告'
};

const NITTER_NODES = [
    'https://nitter.net',
    'https://nitter.poast.org',
    'https://nitter.cz'
];

const RSS_STEAM_NEWS = 'https://store.steampowered.com/feeds/news/app/1973530/?l=tchinese';

const LIST_RARITY_ORDER = ['0', '00', '000', 'Egos', '0000', 'Color Fixer', 'Special'];
const DRAW_RARITY_ORDER = ['Color Fixer', 'Special', '0000', 'Egos', '000', '00', '0'];

const RARITY_ALIASES = {
    'Color Fixer': ['Color Fixer', 'ColorFixer', 'colorfixer', 'color_fixer', 'CF'],
    'Special': ['Special', 'special'],
    '0000': ['0000'],
    'Egos': ['Egos', 'EGO', 'ego', 'egos', 'E.g.o', 'E.G.O'],
    '000': ['000'],
    '00': ['00'],
    '0': ['0']
};

const RARITY_BASE_CHANCE = {
    'Color Fixer': 0.0000143,
    'Special': 0.0001,
    '0000': 0.005,
    'Egos': 0.013,
    '000': 0.029,
    '00': 0.15,
    '0': 0.8028857
};

const RARITY_SORT = {
    '0': 1,
    '00': 2,
    '000': 3,
    'Egos': 4,
    '0000': 5,
    'Color Fixer': 6,
    'Special': 7
};

const PULL_COST = {
    one: 130,
    ten: 1300
};

const LIST_PAGE_SIZE = 8;
const TEAM_PAGE_SIZE = 20;
const RATE_UP_OVERRIDE_CHANCE = 0.25;

const BASE_STATS = {
    '0': { atk: 70, hp: 240, def: 24, speed: 4 },
    '00': { atk: 110, hp: 360, def: 35, speed: 5 },
    '000': { atk: 160, hp: 540, def: 50, speed: 6 },
    'Egos': { atk: 220, hp: 760, def: 64, speed: 7 },
    '0000': { atk: 280, hp: 900, def: 80, speed: 7 },
    'Color Fixer': { atk: 420, hp: 1300, def: 110, speed: 9 },
    'Special': { atk: 350, hp: 1100, def: 95, speed: 8 }
};

const FALLBACK_EGO_POOL = [
    {
        name: '薄暮 (Twilight)',
        grade: 'ALEPH',
        desc: '調和所有矛盾與偏見的終極大劍。'
    },
    {
        name: '失樂園 (Paradise Lost)',
        grade: 'ALEPH',
        desc: '純白羽翼覆蓋的禁忌法杖。'
    },
    {
        name: '擬態 (Mimicry)',
        grade: 'ALEPH',
        desc: '由血肉扭曲而成的巨大刀刃。'
    }
];

const STAGE_CONFIGS = {
    easy:   { label: '沒難度', enemyName: '訓練型收容目標', power: 1200, rewardWin: 50, rewardLose: 10 },
    normal: { label: '輕鬆',   enemyName: '低風險異常體',     power: 2200, rewardWin: 80, rewardLose: 15 },
    medium: { label: '中等',   enemyName: '中層高壓目標',     power: 3500, rewardWin: 120, rewardLose: 20 },
    hard:   { label: '難',     enemyName: '危險級試煉',       power: 5200, rewardWin: 180, rewardLose: 30 },
    hell:   { label: '地獄',   enemyName: '末日級收容危機',   power: 7500, rewardWin: 260, rewardLose: 40 }
};

/* =========================
   Runtime state
========================= */
const app = express();
const systemStartTime = new Date();
let totalTweetsChecked = 0;
let lastFetchedId = null;
let lastSteamNewsId = null;

let currentIdentitiesData = null;
let identitiesSnapshot = '';
let lastRateUpState = null;

const playersDb = loadJsonSafe(PLAYERS_DB_PATH, {});
const twitterCache = loadJsonSafe(TWITTER_CACHE_PATH, { lastTweetId: null });
const steamCache = loadJsonSafe(STEAM_CACHE_PATH, { lastNewsId: null });

const listSessions = new Map();
const teamSessions = new Map();
const stageSessions = new Map();

/* =========================
   File helpers
========================= */
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function loadJsonSafe(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

function saveJsonSafe(filePath, data) {
    try {
        ensureDataDir();
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error(`❌ 無法寫入 ${path.basename(filePath)}:`, err.message);
    }
}

/* =========================
   Text / parser helpers
========================= */
function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scanBalanced(text, startIndex, openChar, closeChar) {
    let depth = 0;
    let inString = null;
    let escape = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = startIndex; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];

        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                inBlockComment = false;
                i++;
            }
            continue;
        }
        if (inString) {
            if (escape) {
                escape = false;
            } else if (ch === '\\') {
                escape = true;
            } else if (ch === inString) {
                inString = null;
            }
            continue;
        }

        if (ch === '/' && next === '/') {
            inLineComment = true;
            i++;
            continue;
        }
        if (ch === '/' && next === '*') {
            inBlockComment = true;
            i++;
            continue;
        }
        if (ch === '"' || ch === "'") {
            inString = ch;
            continue;
        }

        if (ch === openChar) depth++;
        else if (ch === closeChar) {
            depth--;
            if (depth === 0) return i;
        }
    }

    return -1;
}

function extractObjectBlock(text, objectName) {
    const re = new RegExp(`\\b(?:const|let|var)\\s+${escapeRegex(objectName)}\\s*=\\s*\\{`, 'm');
    const match = re.exec(text);
    if (!match) return null;

    const openIndex = text.indexOf('{', match.index);
    if (openIndex < 0) return null;

    const closeIndex = scanBalanced(text, openIndex, '{', '}');
    if (closeIndex < 0) return null;

    return text.slice(openIndex + 1, closeIndex);
}

function extractStringLiterals(text) {
    const out = [];
    let i = 0;

    while (i < text.length) {
        const ch = text[i];
        if (ch === '"' || ch === "'") {
            const quote = ch;
            i++;
            let str = '';
            let escape = false;

            while (i < text.length) {
                const c = text[i];
                if (escape) {
                    str += c;
                    escape = false;
                } else if (c === '\\') {
                    escape = true;
                } else if (c === quote) {
                    break;
                } else {
                    str += c;
                }
                i++;
            }

            out.push(str);
        }
        i++;
    }

    return out;
}

function extractArrayLiteralByKey(block, key) {
    const re = new RegExp(`['"]${escapeRegex(key)}['"]\\s*:\\s*\\[`, 'm');
    const match = re.exec(block);
    if (!match) return [];

    const openIndex = block.indexOf('[', match.index);
    if (openIndex < 0) return [];

    const closeIndex = scanBalanced(block, openIndex, '[', ']');
    if (closeIndex < 0) return [];

    const arrayText = block.slice(openIndex + 1, closeIndex);
    return extractStringLiterals(arrayText);
}

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

function chunkText(text, maxLen = 1900) {
    const chunks = [];
    for (let i = 0; i < text.length; i += maxLen) {
        chunks.push(text.slice(i, i + maxLen));
    }
    return chunks;
}

async function sendChunkedLines(channel, lines) {
    for (const chunk of chunkLines(lines)) {
        await channel.send(chunk);
    }
}

function truncateText(text, max = 90) {
    if (!text) return '';
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
}

function pickRandom(list) {
    if (!Array.isArray(list) || list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)];
}

function raritySortWeight(rarity) {
    return RARITY_SORT[rarity] ?? 0;
}

function rarityEmoji(rarity) {
    if (rarity === 'Color Fixer') return '🎨';
    if (rarity === 'Special') return '⚠️';
    if (rarity === '0000') return '👑';
    if (rarity === 'Egos') return '⚔️';
    if (rarity === '000') return '★★★';
    if (rarity === '00') return '★★';
    return '★';
}

function formatPercent(chance) {
    return `${(chance * 100).toFixed(10)}%`;
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

/* =========================
   identitiesData.js loading
========================= */
function parseIdentitiesDataText(text) {
    const identitiesBlock = extractObjectBlock(text, 'identities');
    const upTargetsBlock = extractObjectBlock(text, 'upTargets');

    const identities = {};
    const upTargets = {};

    for (const rarity of DRAW_RARITY_ORDER) {
        identities[rarity] = identitiesBlock
            ? extractArrayLiteralByKey(identitiesBlock, rarity).map(formatRateUpItem).filter(Boolean)
            : [];
        upTargets[rarity] = upTargetsBlock
            ? extractArrayLiteralByKey(upTargetsBlock, rarity).map(formatRateUpItem).filter(Boolean)
            : [];
    }

    return {
        identities,
        upTargets,
        pullIdentity(rarity) {
            const pool = identities[rarity] || [];
            if (!pool.length) return '（該稀有度沒有資料）';
            return pool[Math.floor(Math.random() * pool.length)];
        },
        pullUpIdentity(rarity) {
            const pool = upTargets[rarity] || [];
            if (!pool.length) return null;
            return pool[Math.floor(Math.random() * pool.length)];
        }
    };
}

function loadIdentitiesDataSafe() {
    try {
        const raw = fs.readFileSync(IDENTITIES_DATA_PATH, 'utf8');
        const parsed = parseIdentitiesDataText(raw);
        const snap = `${raw.length}|${Object.keys(parsed.identities).join(',')}`;
        if (snap !== identitiesSnapshot) {
            console.log('Loaded identities keys:', Object.keys(parsed.identities));
            identitiesSnapshot = snap;
        }
        return parsed;
    } catch (err) {
        console.error('❌ identitiesData.js 載入失敗：', err.message);
        return currentIdentitiesData || {
            identities: {},
            upTargets: {},
            pullIdentity: (rarity) => `（該稀有度沒有資料：${rarity}）`,
            pullUpIdentity: () => null
        };
    }
}

function refreshIdentitiesData() {
    currentIdentitiesData = loadIdentitiesDataSafe();
    return currentIdentitiesData;
}

currentIdentitiesData = loadIdentitiesDataSafe();

/* =========================
   Pool / probability helpers
========================= */
function getCurrentRateUpSource(data = currentIdentitiesData) {
    if (!data) return {};
    if (data.upTargets && typeof data.upTargets === 'object') return data.upTargets;
    if (data.rateUpIds && typeof data.rateUpIds === 'object') return data.rateUpIds;
    if (data.targetIdentities && typeof data.targetIdentities === 'object') return data.targetIdentities;
    return {};
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
    return values
        .filter(v => v && typeof v === 'object' && v.rarity === rarity && typeof v.name === 'string')
        .map(v => v.name.trim())
        .filter(Boolean);
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
    const direct = data.Egos || data.egos || data.egoList || data.ego || null;

    if (Array.isArray(direct) && direct.length > 0) {
        return direct.map(formatRateUpItem).filter(Boolean);
    }

    return FALLBACK_EGO_POOL.map(x => x.name);
}

function getPoolForRarity(rarity, data = currentIdentitiesData) {
    if (!data) return [];

    const aliases = RARITY_ALIASES[rarity] || [rarity];
    const identitiesBlock = data.identities && typeof data.identities === 'object'
        ? data.identities
        : data;

    const fromIdentities = findArrayByAliases(identitiesBlock, aliases);
    if (fromIdentities) return fromIdentities.map(formatRateUpItem).filter(Boolean);

    if (rarity === 'Egos') return getFallbackEgoPool();

    return [];
}

function getRarityChance(rarity) {
    return RARITY_BASE_CHANCE[rarity] || 0;
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

    if (n > 0) return baseChance * (baseCount / n);
    return baseChance * (upCount / m);
}

function getAllDrawableEntries(rarity) {
    const basePool = getPoolForRarity(rarity);
    const rateUpPool = normalizeRateUpList(rarity);
    return uniquePreserveOrder([...basePool, ...rateUpPool]);
}

function buildRarity(minRarity = '0') {
    const minIndex = DRAW_RARITY_ORDER.indexOf(minRarity);
    const allowed = DRAW_RARITY_ORDER.slice(0, minIndex >= 0 ? minIndex + 1 : DRAW_RARITY_ORDER.length);
    const picks = allowed.map(r => ({ value: r, weight: RARITY_BASE_CHANCE[r] || 0 }));
    const total = picks.reduce((sum, p) => sum + p.weight, 0);
    if (total <= 0) return '0';

    let r = Math.random() * total;
    for (const p of picks) {
        r -= p.weight;
        if (r <= 0) return p.value;
    }

    return picks[picks.length - 1].value;
}

function rarityToStars(rarity) {
    if (rarity === 'Color Fixer') return '🎨 Color Fixer';
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

    if (basePool.length > 0 && ratePool.length > 0) {
        return `混合池（基礎 ${Math.round((1 - RATE_UP_OVERRIDE_CHANCE) * 100)}% / RateUp ${Math.round(RATE_UP_OVERRIDE_CHANCE * 100)}%）`;
    }
    if (basePool.length > 0) return '單一基礎池';
    if (ratePool.length > 0) return '單一 RateUp 池';
    return '無資料';
}

function buildCatalog() {
    const data = refreshIdentitiesData();
    const items = [];

    for (const rarity of DRAW_RARITY_ORDER) {
        const basePool = getPoolForRarity(rarity, data);
        const ratePool = normalizeRateUpList(rarity);
        const merged = uniquePreserveOrder([...basePool, ...ratePool]);
        const rateUpSet = new Set(ratePool);

        for (const name of merged) {
            const stats = deriveStats(name, rarity);
            items.push({
                key: `${rarity}::${name}`,
                rarity,
                name,
                atk: stats.atk,
                hp: stats.hp,
                def: stats.def,
                speed: stats.speed,
                baseChance: getRarityChance(rarity),
                exactChance: getExactDrawProbability(rarity, name),
                isRateUp: rateUpSet.has(name)
            });
        }
    }

    const orderMap = Object.fromEntries(LIST_RARITY_ORDER.map((r, i) => [r, i]));
    items.sort((a, b) => {
        const rw = (orderMap[a.rarity] ?? 99) - (orderMap[b.rarity] ?? 99);
        if (rw !== 0) return rw;
        return a.name.localeCompare(b.name, 'zh-Hant');
    });

    return items;
}

function getCatalogByRarity(filter) {
    const catalog = buildCatalog();
    if (!filter) return catalog;
    if (filter === 'up') return catalog.filter(x => x.isRateUp);
    return catalog.filter(x => x.rarity === filter);
}

function normalizeRarityArg(arg) {
    if (!arg) return null;
    const raw = String(arg).trim().toLowerCase().replace(/\s+/g, '');
    if (['colorfixer', 'cf', 'color'].includes(raw)) return 'Color Fixer';
    if (['special'].includes(raw)) return 'Special';
    if (['0000'].includes(raw)) return '0000';
    if (['ego', 'egos', 'e.g.o', 'e.g.o.'].includes(raw)) return 'Egos';
    if (['000'].includes(raw)) return '000';
    if (['00'].includes(raw)) return '00';
    if (['0'].includes(raw)) return '0';
    if (['up', 'rateup'].includes(raw)) return 'up';
    return null;
}

function deriveStats(name, rarity) {
    const base = BASE_STATS[rarity] || BASE_STATS['0'];
    const h = hash32(`${rarity}::${name}`);

    const atkSwing = (((h & 0xff) / 255) - 0.5) * 0.22;
    const hpSwing = ((((h >> 8) & 0xff) / 255) - 0.5) * 0.28;
    const defSwing = ((((h >> 16) & 0xff) / 255) - 0.5) * 0.20;
    const spdSwing = ((((h >> 24) & 0xff) / 255) - 0.5) * 2;

    return {
        atk: Math.max(1, Math.round(base.atk * (1 + atkSwing))),
        hp: Math.max(1, Math.round(base.hp * (1 + hpSwing))),
        def: Math.max(1, Math.round(base.def * (1 + defSwing))),
        speed: Math.max(1, Math.round(base.speed + spdSwing))
    };
}

function hash32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/* =========================
   Player storage
========================= */
function defaultPlayerRecord(userId, username = '') {
    return {
        userId,
        username,
        lunacy: 0,
        items: {},
        equipped: null,
        team: [],
        starterGranted: false,
        totalPulls: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function grantStarterRoster(record) {
    if (record.starterGranted) return record;

    const starters = getPoolForRarity('0');
    for (const name of starters) {
        const stats = deriveStats(name, '0');
        const key = `0::${name}`;
        if (!record.items[key]) {
            record.items[key] = {
                key,
                name,
                rarity: '0',
                atk: stats.atk,
                hp: stats.hp,
                def: stats.def,
                speed: stats.speed,
                count: 0
            };
        }
        record.items[key].count += 1;
    }

    record.starterGranted = true;
    record.updatedAt = new Date().toISOString();
    return record;
}

function ensurePlayerRecord(user) {
    const userId = typeof user === 'string' ? user : user.id;
    const username = typeof user === 'string' ? '' : (user.username || user.globalName || '');

    if (!playersDb[userId]) {
        playersDb[userId] = defaultPlayerRecord(userId, username);
        grantStarterRoster(playersDb[userId]);
        saveJsonSafe(PLAYERS_DB_PATH, playersDb);
    } else {
        if (username && playersDb[userId].username !== username) {
            playersDb[userId].username = username;
            playersDb[userId].updatedAt = new Date().toISOString();
        }
        if (!playersDb[userId].items) playersDb[userId].items = {};
        if (!Object.prototype.hasOwnProperty.call(playersDb[userId], 'equipped')) playersDb[userId].equipped = null;
        if (!Array.isArray(playersDb[userId].team)) playersDb[userId].team = [];
        if (!Object.prototype.hasOwnProperty.call(playersDb[userId], 'starterGranted')) playersDb[userId].starterGranted = false;
        grantStarterRoster(playersDb[userId]);
    }

    return playersDb[userId];
}

function savePlayers() {
    saveJsonSafe(PLAYERS_DB_PATH, playersDb);
}

function getInventoryEntries(userId) {
    const state = ensurePlayerRecord(userId);
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
    if (String(item.name).startsWith('（該稀有度沒有資料）')) return;

    const state = ensurePlayerRecord(userId);
    const key = `${item.rarity}::${item.name}`;

    if (!state.items[key]) {
        state.items[key] = {
            key,
            name: item.name,
            rarity: item.rarity,
            atk: item.atk || deriveStats(item.name, item.rarity).atk,
            hp: item.hp || deriveStats(item.name, item.rarity).hp,
            def: item.def || deriveStats(item.name, item.rarity).def,
            speed: item.speed || deriveStats(item.name, item.rarity).speed,
            count: 0
        };
    }

    state.items[key].count += 1;
    state.updatedAt = new Date().toISOString();
    savePlayers();
}

function removeFromInventory(userId, key, amount = 1) {
    const state = ensurePlayerRecord(userId);
    const item = state.items[key];
    if (!item) return false;

    item.count -= amount;
    if (item.count <= 0) {
        if (state.equipped && state.equipped.key === key) state.equipped = null;
        delete state.items[key];
    }

    state.updatedAt = new Date().toISOString();
    savePlayers();
    return true;
}

function equipItem(userId, key) {
    const state = ensurePlayerRecord(userId);
    const item = state.items[key];
    if (!item || item.count <= 0) return null;

    state.equipped = {
        key: item.key,
        name: item.name,
        rarity: item.rarity,
        atk: item.atk,
        hp: item.hp,
        def: item.def,
        speed: item.speed
    };

    state.updatedAt = new Date().toISOString();
    savePlayers();
    return state.equipped;
}

function getBalance(userId) {
    return Number(ensurePlayerRecord(userId).lunacy || 0);
}

function addBalance(userId, amount) {
    const state = ensurePlayerRecord(userId);
    state.lunacy = getBalance(userId) + Math.floor(amount);
    state.updatedAt = new Date().toISOString();
    savePlayers();
    return state.lunacy;
}

function spendBalance(userId, amount) {
    const state = ensurePlayerRecord(userId);
    const current = getBalance(userId);
    if (current < amount) return false;
    state.lunacy = current - amount;
    state.updatedAt = new Date().toISOString();
    savePlayers();
    return true;
}

function isLunacyAdmin(message) {
    const name = (message.author.username || '').toLowerCase();
    const globalName = (message.author.globalName || '').toLowerCase();
    return (
        name === LUNACY_ADMIN_NAME.toLowerCase() ||
        globalName === LUNACY_ADMIN_NAME.toLowerCase() ||
        (LUNACY_ADMIN_ID && message.author.id === LUNACY_ADMIN_ID)
    );
}

function getTeamKeys(userId) {
    const state = ensurePlayerRecord(userId);
    if (!Array.isArray(state.team)) state.team = [];
    return state.team;
}

function setTeamKeys(userId, keys) {
    const state = ensurePlayerRecord(userId);
    state.team = Array.from(new Set(keys)).slice(0, 7);
    state.updatedAt = new Date().toISOString();
    savePlayers();
}

function getItemsByKeys(userId, keys) {
    const state = ensurePlayerRecord(userId);
    const out = [];
    for (const key of keys) {
        const item = state.items[key];
        if (item && item.count > 0) out.push(item);
    }
    return out;
}

function getBattleSquad(userId) {
    const keys = getTeamKeys(userId);
    const items = getItemsByKeys(userId, keys).slice(0, 7);
    return items.map(item => {
        const equippedBonus = ensurePlayerRecord(userId).equipped?.key === item.key ? 1.15 : 1.0;
        const power = Math.round(((item.atk * 2.7) + (item.hp * 0.25) + (item.def * 1.8) + (item.speed * 10)) * equippedBonus);
        return { ...item, power };
    });
}

function ensureGuildMembersDb(guild) {
    return guild.members.fetch().then(members => {
        let created = 0;
        for (const member of members.values()) {
            if (member.user.bot) continue;
            if (!playersDb[member.id]) created++;
            ensurePlayerRecord(member.user);
        }
        savePlayers();
        return created;
    });
}

/* =========================
   Display helpers
========================= */
function buildPlayerSummaryEmbed(targetUser) {
    const state = ensurePlayerRecord(targetUser.id);
    const entries = getInventoryEntries(targetUser.id);
    const totalOwned = entries.reduce((sum, item) => sum + item.count, 0);
    const equipped = state.equipped ? `${state.equipped.name} [${state.equipped.rarity}]` : '（無）';
    const team = Array.isArray(state.team) && state.team.length
        ? state.team.map(key => state.items[key]?.name || key).join('\n')
        : '（尚未設定）';

    return new EmbedBuilder()
        .setTitle(`🧾 ${targetUser.username} 的資料`)
        .setColor(0x5a189a)
        .addFields(
            { name: '💠 Lunacy', value: `${getBalance(targetUser.id).toLocaleString()}`, inline: true },
            { name: '📦 持有總數', value: `${totalOwned}`, inline: true },
            { name: '📚 種類數', value: `${entries.length}`, inline: true },
            { name: '🛡️ 裝備', value: equipped, inline: false },
            { name: '👥 隊伍', value: team, inline: false }
        )
        .setTimestamp();
}

function buildInventoryLines(targetUser) {
    const state = ensurePlayerRecord(targetUser.id);
    const entries = getInventoryEntries(targetUser.id);
    const totalOwned = entries.reduce((sum, item) => sum + item.count, 0);

    const lines = [];
    lines.push(`📦 **${targetUser.username} 的背包**`);
    lines.push(`💠 Lunacy：**${getBalance(targetUser.id).toLocaleString()}**`);
    lines.push(`持有總數：${totalOwned}｜種類：${entries.length}`);
    lines.push('');

    if (state.equipped) {
        lines.push(`🛡️ **裝備中：** ${state.equipped.name} [${state.equipped.rarity}]`);
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

function buildRateUpOverviewSections() {
    const source = getCurrentRateUpSource();
    const sections = [];

    for (const rarity of DRAW_RARITY_ORDER) {
        const list = normalizeRateUpListBySource(source, rarity);
        if (!list.length) continue;
        const lines = [];
        lines.push(`【${rarity}】`);
        for (const item of list) lines.push(`• ${item}`);
        sections.push(lines);
    }

    return sections;
}

function buildProbabilitySections() {
    const sections = [];

    for (const rarity of DRAW_RARITY_ORDER) {
        const basePool = getPoolForRarity(rarity);
        const ratePool = normalizeRateUpList(rarity);
        const merged = getAllDrawableEntries(rarity);

        if (!basePool.length && !ratePool.length) continue;

        const lines = [];
        lines.push(`【${rarity}】 ${rarity}｜基礎機率：${formatPercent(getRarityChance(rarity))}｜基礎池：${basePool.length}｜RateUp：${ratePool.length}｜模式：${rarityDrawMode(rarity)}`);
        lines.push('');

        const rateUpSet = new Set(ratePool);

        for (const item of merged) {
            const chance = getExactDrawProbability(rarity, item);
            const mark = rateUpSet.has(item) ? ' [UP]' : '';
            lines.push(`• ${item}${mark} — ${formatPercent(chance)}`);
        }

        sections.push(lines);
    }

    return sections;
}

function buildCatalogPage(catalog, page = 0) {
    const totalPages = Math.max(1, Math.ceil(catalog.length / LIST_PAGE_SIZE));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const start = safePage * LIST_PAGE_SIZE;
    const slice = catalog.slice(start, start + LIST_PAGE_SIZE);

    const lines = slice.map((item, idx) => {
        const order = start + idx + 1;
        const up = item.isRateUp ? ' [UP]' : '';
        return `${order}. [${item.rarity}] ${truncateText(item.name, 60)}${up}\n   ATK ${item.atk}｜HP ${item.hp}｜DEF ${item.def}｜SPD ${item.speed}｜機率 ${formatPercent(item.exactChance)}`;
    });

    return { page: safePage, totalPages, lines };
}

/* =========================
   Pull logic
========================= */
function drawFromRarity(rarity) {
    const basePool = getPoolForRarity(rarity);
    const ratePool = normalizeRateUpList(rarity);

    if (!basePool.length && !ratePool.length) {
        return {
            name: `（該稀有度沒有資料）`,
            rarity,
            source: 'missing',
            isRateUp: false
        };
    }

    if (!basePool.length) {
        const picked = pickRandom(ratePool);
        return { name: picked, rarity, source: 'rateup-only', isRateUp: true };
    }

    if (!ratePool.length) {
        const picked = pickRandom(basePool);
        return { name: picked, rarity, source: 'base-only', isRateUp: false };
    }

    if (Math.random() < RATE_UP_OVERRIDE_CHANCE) {
        const picked = pickRandom(ratePool);
        return { name: picked, rarity, source: 'rateup', isRateUp: true };
    }

    const picked = pickRandom(basePool);
    return { name: picked, rarity, source: 'base', isRateUp: false };
}

function rollOne(minRarity = '0') {
    const rarity = buildRarity(minRarity);
    const result = drawFromRarity(rarity);
    const stats = deriveStats(result.name, rarity);
    return {
        rarity,
        name: result.name,
        isRateUp: result.isRateUp,
        atk: stats.atk,
        hp: stats.hp,
        def: stats.def,
        speed: stats.speed
    };
}

/* =========================
   Battle logic
========================= */
function simulateStageBattle(squad, difficultyKey) {
    const cfg = STAGE_CONFIGS[difficultyKey];

    const playerPower = squad.reduce((sum, u) => {
        const equippedBonus = u.equipped ? 1.12 : 1.0;
        return sum + Math.round(((u.atk * 2.7) + (u.hp * 0.25) + (u.def * 1.8) + (u.speed * 10)) * equippedBonus);
    }, 0);

    const roll = 0.92 + Math.random() * 0.16;
    const finalPlayerPower = Math.round(playerPower * roll);

    const win = finalPlayerPower >= cfg.power;
    const reward = win ? cfg.rewardWin : cfg.rewardLose;

    return {
        win,
        reward,
        enemyName: cfg.enemyName,
        difficultyLabel: cfg.label,
        teamPower: finalPlayerPower,
        enemyPower: cfg.power,
        logs: [
            `我方戰力：${finalPlayerPower}`,
            `敵方戰力：${cfg.power}`,
            win ? '結果：勝利' : '結果：失敗'
        ]
    };
}

/* =========================
   UI Sessions
========================= */
function createSession(type, ownerId, payload = {}) {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const session = {
        id,
        type,
        ownerId,
        page: 0,
        createdAt: Date.now(),
        expiresAt: Date.now() + 15 * 60 * 1000,
        ...payload
    };

    if (type === 'list') listSessions.set(id, session);
    if (type === 'team') teamSessions.set(id, session);
    if (type === 'stage') stageSessions.set(id, session);

    setTimeout(() => {
        listSessions.delete(id);
        teamSessions.delete(id);
        stageSessions.delete(id);
    }, 15 * 60 * 1000).unref?.();

    return session;
}

function buildListEmbed(session) {
    const { page, totalPages, lines } = buildCatalogPage(session.catalog, session.page);

    return new EmbedBuilder()
        .setTitle('📜 目前可抽取的人格 / E.G.O')
        .setColor(0x00b4d8)
        .setDescription(`頁數：${page + 1} / ${totalPages}｜總數：${session.catalog.length}${session.filter ? `｜篩選：${session.filter}` : ''}`)
        .addFields({
            name: '內容',
            value: lines.length ? lines.join('\n\n').slice(0, 3800) : '目前沒有資料。',
            inline: false
        })
        .setFooter({ text: '使用按鈕翻頁' })
        .setTimestamp();
}

function buildListComponents(session) {
    const totalPages = Math.max(1, Math.ceil(session.catalog.length / LIST_PAGE_SIZE));
    const rows = [];
    const buttons = [];

    if (session.page > 0) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`list:prev:${session.id}`)
                .setLabel('上一頁')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    if (session.page < totalPages - 1) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`list:next:${session.id}`)
                .setLabel('下一頁')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`list:close:${session.id}`)
            .setLabel('關閉')
            .setStyle(ButtonStyle.Danger)
    );

    rows.push(new ActionRowBuilder().addComponents(buttons));
    return rows;
}

function buildTeamEmbed(session) {
    const state = ensurePlayerRecord(session.ownerId);
    const entries = getInventoryEntries(session.ownerId);
    const totalPages = Math.max(1, Math.ceil(entries.length / TEAM_PAGE_SIZE));
    const safePage = Math.min(Math.max(0, session.page), totalPages - 1);
    const start = safePage * TEAM_PAGE_SIZE;
    const slice = entries.slice(start, start + TEAM_PAGE_SIZE);

    const pickedNames = session.picked.map(key => state.items[key]?.name || key);
    const desc = [
        `頁數：${safePage + 1} / ${totalPages}`,
        `已選：${session.picked.length} / 7`
    ].join('｜');

    const embed = new EmbedBuilder()
        .setTitle('🧩 選擇你的 7 人隊伍')
        .setColor(0x4cc9f0)
        .setDescription(desc)
        .addFields(
            {
                name: '已選隊伍',
                value: pickedNames.length ? pickedNames.map((x, i) => `${i + 1}. ${x}`).join('\n') : '（尚未選擇）',
                inline: false
            },
            {
                name: '可選項目',
                value: slice.length ? slice.map((x, i) => `${start + i + 1}. [${x.rarity}] ${x.name} ×${x.count}`).join('\n') : '（沒有可選項目）',
                inline: false
            }
        )
        .setFooter({ text: '先選最多 7 個，然後按完成' })
        .setTimestamp();

    const options = slice.slice(0, 25).map(item => ({
        label: truncateText(item.name, 100),
        description: `${item.rarity}｜ATK ${item.atk}｜HP ${item.hp}｜DEF ${item.def}｜SPD ${item.speed}｜x${item.count}`,
        value: item.key
    }));

    const rows = [];
    if (options.length) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`team:select:${session.id}`)
            .setPlaceholder('選擇要加入隊伍的人格')
            .setMaxValues(Math.min(7, options.length))
            .addOptions(options);

        rows.push(new ActionRowBuilder().addComponents(selectMenu));
    }

    const buttons = [];
    if (session.page > 0) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`team:prev:${session.id}`)
                .setLabel('上一頁')
                .setStyle(ButtonStyle.Secondary)
        );
    }
    if (session.page < totalPages - 1) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`team:next:${session.id}`)
                .setLabel('下一頁')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`team:clear:${session.id}`)
            .setLabel('清除')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`team:finish:${session.id}`)
            .setLabel('完成')
            .setStyle(ButtonStyle.Success)
    );

    rows.push(new ActionRowBuilder().addComponents(buttons));
    return { embeds: [embed], components: rows };
}

function buildStageEmbed() {
    return new EmbedBuilder()
        .setTitle('⚔️ 關卡選擇')
        .setColor(0xd90429)
        .setDescription('選一個難度，系統會使用你已設定好的 7 人隊伍進行戰鬥。')
        .addFields(
            { name: '沒難度', value: '適合練習。', inline: true },
            { name: '輕鬆', value: '穩定可過。', inline: true },
            { name: '中等', value: '開始有壓力。', inline: true },
            { name: '難', value: '較高要求。', inline: true },
            { name: '地獄', value: '高風險高獎勵。', inline: true }
        )
        .setFooter({ text: '戰鬥會依你設定的隊伍與人格數值計算' })
        .setTimestamp();
}

function buildStageComponents(session) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`stage:easy:${session.id}`).setLabel('沒難度').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`stage:normal:${session.id}`).setLabel('輕鬆').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`stage:medium:${session.id}`).setLabel('中等').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`stage:hard:${session.id}`).setLabel('難').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`stage:hell:${session.id}`).setLabel('地獄').setStyle(ButtonStyle.Danger)
        )
    ];
}

function buildStageResultEmbed(session, result) {
    const squadLines = session.squad.map((u, idx) => `${idx + 1}. [${u.rarity}] ${u.name}｜ATK ${u.atk}｜HP ${u.hp}｜DEF ${u.def}｜SPD ${u.speed}`);

    return new EmbedBuilder()
        .setTitle(`⚔️ 關卡結果：${result.win ? '勝利' : '失敗'}`)
        .setColor(result.win ? 0x2ecc71 : 0xe63946)
        .setDescription(
            [
                `難度：${result.difficultyLabel}`,
                `敵人：${result.enemyName}`,
                `獎勵 Lunacy：${result.reward}`,
                `結果：${result.win ? '通關' : '撤退'}`
            ].join('\n')
        )
        .addFields(
            { name: '我方隊伍', value: squadLines.length ? squadLines.join('\n') : '（無）', inline: false },
            { name: '戰鬥紀錄', value: result.logs.join('\n') || '（無）', inline: false },
            { name: '剩餘戰力', value: `我方 ${result.teamPower}｜敵方 ${result.enemyPower}`, inline: false }
        )
        .setTimestamp();
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
            new ButtonBuilder().setCustomId(`trade:accept:${session.id}`).setLabel('接受').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`trade:decline:${session.id}`).setLabel('拒絕').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`trade:cancel:${session.id}`).setLabel('取消').setStyle(ButtonStyle.Secondary)
        )
    ];

    return { embeds: [embed], components: rows };
}

/* =========================
   Steam / Twitter checks
========================= */
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

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                ...(options.headers || {})
            }
        });
    } finally {
        clearTimeout(timeout);
    }
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
    console.log(`⏳ Angela 正在檢查 @${TARGET_USER.username} 的動態...`);
    totalTweetsChecked++;

    for (const nodeUrl of NITTER_NODES) {
        try {
            const data = await fetchLatestTweetFromNode(nodeUrl);

            if (!lastFetchedId) {
                lastFetchedId = data.id;
                twitterCache.lastTweetId = data.id;
                saveJsonSafe(TWITTER_CACHE_PATH, twitterCache);
                console.log(`📦 [${nodeUrl}] 成功建立初始推文快取：${data.id}`);
                break;
            }

            if (data.id !== lastFetchedId) {
                lastFetchedId = data.id;
                twitterCache.lastTweetId = data.id;
                saveJsonSafe(TWITTER_CACHE_PATH, twitterCache);

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

async function checkSteamNews() {
    try {
        const response = await fetchWithTimeout(RSS_STEAM_NEWS, {}, 8000);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const xml = await response.text();
        const latest = parseLatestItem(xml);
        if (!latest) return;

        if (!lastSteamNewsId) {
            lastSteamNewsId = latest.id;
            steamCache.lastNewsId = latest.id;
            saveJsonSafe(STEAM_CACHE_PATH, steamCache);
            console.log(`📦 已建立 Steam News 初始快取：${latest.id}`);
            return;
        }

        if (latest.id !== lastSteamNewsId) {
            lastSteamNewsId = latest.id;
            steamCache.lastNewsId = latest.id;
            saveJsonSafe(STEAM_CACHE_PATH, steamCache);

            const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
            if (channel) {
                await channel.send({
                    content: `🔔 **Steam 官方新聞更新**\n${latest.link}`
                });
            }
        }
    } catch (err) {
        console.warn(`⚠️ Steam News 擷取異常 (${err.message})`);
    }
}

/* =========================
   Express
========================= */
app.get('/', (req, res) => {
    res.send('Angela 系統運作正常。歡迎來到腦葉公司核心控制室。');
});

app.listen(PORT, () => {
    console.log(`網頁伺服器已在連接埠 ${PORT} 啟動`);
});

/* =========================
   Discord client
========================= */
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

    client.user.setPresence({
        status: 'idle',
        activities: [{
            name: 'customstatus',
            type: 4,
            state: '正在觀測核心控制室的心理逆流與光之種進度...'
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

    refreshIdentitiesData();
    await syncRateUpStateAndAnnounce();

    if (twitterCache.lastTweetId) lastFetchedId = twitterCache.lastTweetId;
    if (steamCache.lastNewsId) lastSteamNewsId = steamCache.lastNewsId;

    setInterval(checkTwitterUpdates, 60 * 1000);
    setInterval(checkSteamNews, 60 * 1000);
    setInterval(syncRateUpStateAndAnnounce, 60 * 1000);

    checkTwitterUpdates();
    checkSteamNews();
});

/* =========================
   Rate Up announce
========================= */
function buildNormalizedRateUpState(data = currentIdentitiesData) {
    const source = getCurrentRateUpSource(data);
    const state = {};

    for (const rarity of DRAW_RARITY_ORDER) {
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

        for (const rarity of DRAW_RARITY_ORDER) {
            const list = state[rarity] || [];
            const oldList = oldState?.[rarity] || [];

            if (!oldState) {
                if (!list.length) continue;
                lines.push(`【${rarity}】 ${rarity}`);
                for (const item of list) lines.push(`• ${item}`);
                lines.push('');
                continue;
            }

            const added = list.filter(x => !oldList.includes(x));
            const removed = oldList.filter(x => !list.includes(x));

            if (!added.length && !removed.length) continue;

            changed = true;
            lines.push(`【${rarity}】 ${rarity}`);

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
            const hasAny = Object.values(state).some(arr => Array.isArray(arr) && arr.length > 0);
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
        saveJsonSafe(RATEUP_CACHE_PATH, { updatedAt: new Date().toISOString(), state: newState });
        await announceRateUpState(newState, null);
        return;
    }

    const oldSnapshot = JSON.stringify(lastRateUpState);
    const newSnapshot = JSON.stringify(newState);

    if (oldSnapshot === newSnapshot) return;

    await announceRateUpState(newState, lastRateUpState);
    lastRateUpState = newState;
    saveJsonSafe(RATEUP_CACHE_PATH, { updatedAt: new Date().toISOString(), state: newState });
}

/* =========================
   Commands
========================= */
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    ensurePlayerRecord(message.author);

    const raw = message.content.trim();
    const [cmd, ...args] = raw.split(/\s+/);
    const lower = cmd.toLowerCase();

    if (cmd === '!ping') return message.reply('pong！');

    if (cmd === '管理員' || cmd === '主管') {
        return message.reply('主管，您好。我是您的 AI 助理 Angela。請下達您的指示。');
    }

    if (lower === 'lc' || cmd === '腦葉公司') {
        return message.reply('「直面恐懼，創造未來。」請時刻注意收容單位的逆流計數器，主管。');
    }

    if (cmd === '!lunacy' || cmd === '!balance') {
        return message.reply(`💠 **${message.author.username} 的 Lunacy**：**${getBalance(message.author.id).toLocaleString()}**`);
    }

    if (cmd === '!givelunacy') {
        if (!isLunacyAdmin(message)) {
            return message.reply('❌ 只有 `sles_forever` 可以使用這個指令。');
        }

        const target = message.mentions.users.first();
        const amount = Number(args[1]);

        if (!target) return message.reply('❌ 請輸入 `!givelunacy @username amount`');
        if (!Number.isFinite(amount) || amount <= 0) return message.reply('❌ amount 必須是正整數。');

        const newBal = addBalance(target.id, Math.floor(amount));
        return message.reply(`✅ 已給予 **${target.username}** **${Math.floor(amount).toLocaleString()}** Lunacy。現在餘額：**${newBal.toLocaleString()}**`);
    }

    if (cmd === '!updaterewards') {
        if (!isLunacyAdmin(message)) {
            return message.reply('❌ 只有 `sles_forever` 可以使用這個指令。');
        }
        if (!message.guild) return message.reply('❌ 只能在伺服器內使用。');

        const created = await ensureGuildMembersDb(message.guild);
        return message.reply(`✅ 已完成伺服器成員資料庫初始化，新增 ${created} 位成員資料。`);
    }

    if (cmd === '!測試官方推文' || lower === '!testtweet') {
        await message.channel.sendTyping();
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

    if (cmd === '!邊獄人數' || lower === '!limbusonline') {
        try {
            const response = await fetchWithTimeout(
                'https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=1973530'
            );
            const data = await response.json();

            if (data?.response?.result === 1) {
                return message.reply(`📊 **[Steam 即時數據]** 目前共有 **${data.response.player_count.toLocaleString()}** 位罪人正在《Limbus Company》中進行探索。`);
            }

            return message.reply('❌ 無法從 Steam API 取得正確的數據。');
        } catch {
            return message.reply('❌ 連線至 Steam 伺服器時發生內部錯誤。');
        }
    }

    if (cmd === '!狀態' || lower === '!status') {
        const uptimeMs = Date.now() - systemStartTime.getTime();
        const uptimeHours = (uptimeMs / 3600000).toFixed(1);

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

    if (cmd === '!ego') {
        const egoList = [
            {
                name: '薄暮 (Twilight)',
                grade: 'ALEPH',
                desc: '調和所有矛盾與偏見的終極大劍。'
            },
            {
                name: '失樂園 (Paradise Lost)',
                grade: 'ALEPH',
                desc: '純白羽翼覆蓋的禁忌法杖。'
            },
            {
                name: '擬態 (Mimicry)',
                grade: 'ALEPH',
                desc: '由血肉扭曲而成的巨大刀刃。'
            }
        ];

        const randomEgo = pickRandom(egoList);
        const egoEmbed = new EmbedBuilder()
            .setTitle('⚔️ 核心共鳴：E.G.O 同步觀測報告')
            .setColor(0xd90429)
            .setDescription(`**${message.author.username}** 主管，提取出以下同步率最高的 E.G.O 武裝：`)
            .addFields(
                { name: '✨ 裝備名稱', value: `**${randomEgo.name}**`, inline: true },
                { name: '🔱 危險等級', value: `\`${randomEgo.grade}\``, inline: true },
                { name: '🧠 簡述', value: randomEgo.desc, inline: false }
            )
            .setFooter({ text: 'Angela 心理提取模組' })
            .setTimestamp();

        return message.reply({ embeds: [egoEmbed] });
    }

    if (cmd === '!逆流') {
        const alarmEmbed = new EmbedBuilder()
            .setTitle('⚠️ [WARNING] 腦葉公司核心控制室緊急通告')
            .setColor(0xff0000)
            .setDescription('警告：當前頻道內觀測到嚴重的「心理逆流」現象！')
            .addFields(
                { name: '🚨 逆流狀態', value: '第 3 階能障逆流 (Qliphoth Meltdown)', inline: false }
            )
            .setTimestamp();

        return message.reply({ embeds: [alarmEmbed] });
    }

    if (cmd === '!pull' || cmd === '!10pulls') {
        refreshIdentitiesData();

        const userId = message.author.id;
        const count = cmd === '!10pulls' ? 10 : 1;
        const cost = count === 10 ? PULL_COST.ten : PULL_COST.one;
        const bal = getBalance(userId);

        if (bal < cost) {
            return message.reply(`❌ Lunacy 不足。需要 **${cost}**，你現在只有 **${bal}**。`);
        }

        if (!spendBalance(userId, cost)) {
            return message.reply('❌ 扣款失敗。');
        }

        const results = [];
        let hadNonZeroInFirstNine = false;

        for (let i = 0; i < count; i++) {
            let rarity;
            if (count === 10 && i === 9 && !hadNonZeroInFirstNine) {
                rarity = buildRarity('00');
            } else {
                rarity = buildRarity();
            }

            if (count === 10 && i < 9 && rarity !== '0') {
                hadNonZeroInFirstNine = true;
            }

            const rolled = drawFromRarity(rarity);
            const stats = deriveStats(rolled.name, rarity);
            addToInventory(userId, {
                name: rolled.name,
                rarity,
                atk: stats.atk,
                hp: stats.hp,
                def: stats.def,
                speed: stats.speed
            });

            const display = rolled.isRateUp ? `✨ **[PICK-UP!]** ${rolled.name}` : rolled.name;
            results.push(`${display} (${rarityToStars(rarity)})`);
        }

        const state = ensurePlayerRecord(userId);
        state.totalPulls = (state.totalPulls || 0) + count;
        state.updatedAt = new Date().toISOString();
        savePlayers();

        return message.reply(
            count === 10
                ? `✨ **十連抽結果：**\n${results.join('\n')}\n*(💠 已扣除 ${cost} Lunacy)*`
                : `🎯 **單抽結果：**\n${results[0]}\n*(💠 已扣除 ${cost} Lunacy)*`
        );
    }

    if (cmd === '!list') {
        refreshIdentitiesData();
        await message.channel.sendTyping();

        const filter = normalizeRarityArg(args[0]);
        const catalog = getCatalogByRarity(filter);

        if (!catalog.length) {
            return message.reply('📭 目前沒有可抽取的資料。');
        }

        const session = createSession('list', message.author.id, {
            filter: filter || null,
            catalog,
            page: 0
        });

        return message.reply({
            embeds: [buildListEmbed(session)],
            components: buildListComponents(session)
        });
    }

    if (cmd === '!checkrateupids') {
        refreshIdentitiesData();
        const sections = buildRateUpOverviewSections();
        if (!sections.length) return message.reply('📭 目前沒有設定任何機率提升中的人格或 E.G.O。');

        await message.reply('📈 **目前機率提升人格 / E.G.O**');
        for (const section of sections) {
            await sendChunkedLines(message.channel, section);
        }
        return;
    }

    if (cmd === '!pack') {
        const lines = buildInventoryLines(message.author);
        await sendChunkedLines(message.channel, lines);
        return;
    }

    if (cmd === '!check') {
        const target = message.mentions.users.first() || message.author;
        ensurePlayerRecord(target);
        const embed = buildPlayerSummaryEmbed(target);
        const lines = buildInventoryLines(target);
        await message.reply({ embeds: [embed] });
        await sendChunkedLines(message.channel, lines.slice(4));
        return;
    }

    if (cmd === '!cmds' || lower === '!help') {
        const embed = new EmbedBuilder()
            .setTitle('📚 Angela 指令總表')
            .setColor(0x00b4d8)
            .setDescription('你可以直接在 Discord 輸入以下指令：')
            .addFields(
                {
                    name: '基本',
                    value: ['`!ping`', '`主管` / `管理員`', '`lc` / `腦葉公司`'].join('\n'),
                    inline: false
                },
                {
                    name: 'Lunacy',
                    value: ['`!lunacy`', '`!balance`', '`!givelunacy @username amount`'].join('\n'),
                    inline: false
                },
                {
                    name: '抽卡 / 卡池',
                    value: ['`!pull`', '`!10pulls`', '`!list [rarity|up]`', '`!pack`', '`!checkrateupids`'].join('\n'),
                    inline: false
                },
                {
                    name: '裝備 / 交易',
                    value: ['`!equip`', '`!trade @username`', '`!check @username`'].join('\n'),
                    inline: false
                },
                {
                    name: '隊伍 / 關卡',
                    value: ['`!stageteam`', '`!stages`', '`!updaterewards`'].join('\n'),
                    inline: false
                },
                {
                    name: '觀測 / 系統',
                    value: ['`!測試官方推文` / `!testtweet`', '`!邊獄人數` / `!limbusonline`', '`!狀態` / `!status`', '`!ego`', '`!逆流`'].join('\n'),
                    inline: false
                },
                {
                    name: '搜尋',
                    value: ['`!尋找機器人 名稱`', '`!findbot 名稱`'].join('\n'),
                    inline: false
                }
            )
            .setFooter({ text: 'Angela 指令查閱模組' })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    if (cmd === '!equip') {
        const items = getInventoryEntries(message.author.id);
        if (!items.length) return message.reply('📭 你目前沒有任何可裝備的人格 / E.G.O。先用 `!pull` 抽一些吧。');

        const options = items.slice(0, 25).map(item => ({
            label: `${item.name}`.slice(0, 100),
            description: `${item.rarity}｜ATK ${item.atk}｜HP ${item.hp}｜DEF ${item.def}｜SPD ${item.speed}｜x${item.count}`,
            value: item.key
        }));

        const menu = new StringSelectMenuBuilder()
            .setCustomId(`equip:select:${message.author.id}`)
            .setPlaceholder('選擇要裝備的項目')
            .addOptions(options);

        return message.reply({
            content: '🛡️ **選擇要裝備的項目**',
            components: [new ActionRowBuilder().addComponents(menu)]
        });
    }

    if (cmd === '!trade') {
        const target = message.mentions.users.first();
        if (!message.guild) return message.reply('❌ 只能在伺服器內使用 `!trade`。');
        if (!target) return message.reply('❌ 請用 `!trade @username` 指定要交易的對象。');
        if (target.id === message.author.id) return message.reply('❌ 不能跟自己交易。');
        if (target.bot) return message.reply('❌ 目前不支援跟機器人交易。');

        const items = getInventoryEntries(message.author.id);
        if (!items.length) return message.reply('📭 你目前沒有任何可交易的項目。');

        const options = items.slice(0, 25).map(item => ({
            label: `${item.name}`.slice(0, 100),
            description: `${item.rarity}｜ATK ${item.atk}｜HP ${item.hp}｜DEF ${item.def}｜SPD ${item.speed}｜x${item.count}`,
            value: item.key
        }));

        const menu = new StringSelectMenuBuilder()
            .setCustomId(`trade:select:${message.author.id}:${target.id}`)
            .setPlaceholder('選擇要交易出去的項目')
            .addOptions(options);

        return message.reply({
            content: `📨 **交易對象：** ${target}\n請先選擇你要交易的項目。`,
            components: [new ActionRowBuilder().addComponents(menu)]
        });
    }

    if (cmd === '!stageteam') {
        const items = getInventoryEntries(message.author.id);
        if (!items.length) return message.reply('📭 你目前沒有任何人格可編隊。');

        const session = createSession('team', message.author.id, {
            picked: getTeamKeys(message.author.id).slice(),
            page: 0
        });

        return message.reply({
            embeds: [buildTeamEmbed(session)],
            components: buildTeamComponents(session)
        });
    }

    if (cmd === '!stages') {
        const teamKeys = getTeamKeys(message.author.id);
        if (!teamKeys.length) {
            return message.reply('📭 你還沒有設定隊伍，請先用 `!stageteam` 選 7 人。');
        }

        const session = createSession('stage', message.author.id, {});
        return message.reply({
            embeds: [buildStageEmbed()],
            components: buildStageComponents(session)
        });
    }

    if (cmd === '!尋找機器人' || lower === '!findbot') {
        if (!message.guild) return message.reply('❌ 只能在伺服器內使用此指令。');

        const searchTerm = args.join(' ').slice(cmd.length).trim().toLowerCase();
        if (!searchTerm) return message.reply('❌ 請輸入要尋找的機器人名稱！');

        try {
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
        } catch {
            return message.reply('❌ 內部錯誤。');
        }
    }
});

/* =========================
   Team builder components
========================= */
function buildTeamComponents(session) {
    const state = ensurePlayerRecord(session.ownerId);
    const entries = getInventoryEntries(session.ownerId);
    const totalPages = Math.max(1, Math.ceil(entries.length / TEAM_PAGE_SIZE));
    session.page = Math.min(Math.max(0, session.page), totalPages - 1);

    const start = session.page * TEAM_PAGE_SIZE;
    const slice = entries.slice(start, start + TEAM_PAGE_SIZE);

    const options = slice.slice(0, 25).map(item => ({
        label: truncateText(item.name, 100),
        description: `${item.rarity}｜ATK ${item.atk}｜HP ${item.hp}｜DEF ${item.def}｜SPD ${item.speed}｜x${item.count}`,
        value: item.key
    }));

    const rows = [];
    if (options.length) {
        const select = new StringSelectMenuBuilder()
            .setCustomId(`team:select:${session.id}`)
            .setPlaceholder('選擇要加入隊伍的人格')
            .setMaxValues(Math.min(7, options.length))
            .addOptions(options);

        rows.push(new ActionRowBuilder().addComponents(select));
    }

    const buttons = [];
    if (session.page > 0) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`team:prev:${session.id}`)
                .setLabel('上一頁')
                .setStyle(ButtonStyle.Secondary)
        );
    }
    if (session.page < totalPages - 1) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`team:next:${session.id}`)
                .setLabel('下一頁')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`team:clear:${session.id}`)
            .setLabel('清除')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`team:finish:${session.id}`)
            .setLabel('完成')
            .setStyle(ButtonStyle.Success)
    );

    rows.push(new ActionRowBuilder().addComponents(buttons));
    return rows;
}

/* =========================
   Interaction handlers
========================= */
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isStringSelectMenu()) {
            const parts = interaction.customId.split(':');

            if (parts[0] === 'equip' && parts[1] === 'select') {
                const ownerId = parts[2];
                if (interaction.user.id !== ownerId) {
                    return interaction.reply({ content: '❌ 只有發起者可以操作這個選單。', ephemeral: true });
                }

                const key = interaction.values[0];
                const state = ensurePlayerRecord(ownerId);
                const item = state.items[key];
                if (!item) return interaction.reply({ content: '❌ 找不到這個項目。', ephemeral: true });

                equipItem(ownerId, key);

                const embed = new EmbedBuilder()
                    .setTitle('🛡️ 裝備完成')
                    .setColor(0x4caf50)
                    .setDescription(`你已裝備：**${item.name}**`)
                    .addFields(
                        { name: '🏷️ 稀有度', value: item.rarity, inline: true },
                        { name: 'ATK', value: `${item.atk}`, inline: true },
                        { name: 'HP', value: `${item.hp}`, inline: true }
                    )
                    .setTimestamp();

                return interaction.update({
                    content: '✅ **裝備設定完成**',
                    embeds: [embed],
                    components: []
                });
            }

            if (parts[0] === 'trade' && parts[1] === 'select') {
                const ownerId = parts[2];
                const targetId = parts[3];
                if (interaction.user.id !== ownerId) {
                    return interaction.reply({ content: '❌ 只有發起者可以操作這個選單。', ephemeral: true });
                }

                const key = interaction.values[0];
                const state = ensurePlayerRecord(ownerId);
                const item = state.items[key];
                if (!item) return interaction.reply({ content: '❌ 找不到這個項目。', ephemeral: true });

                const sessionId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
                const tradeSession = {
                    id: sessionId,
                    ownerId,
                    targetId,
                    itemKey: key,
                    itemName: item.name,
                    itemRarity: item.rarity
                };
                stageSessions.set(`trade:${sessionId}`, tradeSession);

                const embed = new EmbedBuilder()
                    .setTitle('📨 交易已選定')
                    .setColor(0xffd166)
                    .setDescription(`你選擇要交易：**${item.name}**`)
                    .addFields(
                        { name: '🎯 對象', value: `<@${targetId}>`, inline: true },
                        { name: '🏷️ 稀有度', value: item.rarity, inline: true }
                    )
                    .setFooter({ text: '請等待對方接受 / 拒絕' })
                    .setTimestamp();

                await interaction.update({
                    content: '✅ 已選擇交易項目，正在送出交易請求...',
                    embeds: [embed],
                    components: []
                });

                const offerView = buildTradeOfferView(tradeSession);
                return interaction.followUp({
                    content: `<@${targetId}>，有人向你發起交易。`,
                    allowedMentions: { users: [targetId] },
                    ...offerView
                });
            }

            if (parts[0] === 'team' && parts[1] === 'select') {
                const sessionId = parts[2];
                const session = teamSessions.get(sessionId);

                if (!session) {
                    return interaction.reply({ content: '❌ 這個隊伍選單已逾時。', ephemeral: true });
                }

                if (interaction.user.id !== session.ownerId) {
                    return interaction.reply({ content: '❌ 只有發起者可以操作這個選單。', ephemeral: true });
                }

                const picks = interaction.values;
                for (const key of picks) {
                    if (session.picked.length >= 7) break;
                    if (!session.picked.includes(key)) session.picked.push(key);
                }

                return interaction.update({
                    embeds: [buildTeamEmbed(session)],
                    components: buildTeamComponents(session)
                });
            }
        }

        if (interaction.isButton()) {
            const parts = interaction.customId.split(':');

            if (parts[0] === 'list') {
                const action = parts[1];
                const sessionId = parts[2];
                const session = listSessions.get(sessionId);

                if (!session) return interaction.reply({ content: '❌ 這個清單已逾時。', ephemeral: true });
                if (interaction.user.id !== session.ownerId) return interaction.reply({ content: '❌ 只有發起者可以操作這個清單。', ephemeral: true });

                if (action === 'close') {
                    listSessions.delete(sessionId);
                    return interaction.update({ content: '✅ 已關閉清單。', embeds: [], components: [] });
                }

                const totalPages = Math.max(1, Math.ceil(session.catalog.length / LIST_PAGE_SIZE));
                if (action === 'prev') session.page = Math.max(0, session.page - 1);
                if (action === 'next') session.page = Math.min(totalPages - 1, session.page + 1);

                return interaction.update({
                    embeds: [buildListEmbed(session)],
                    components: buildListComponents(session)
                });
            }

            if (parts[0] === 'team') {
                const action = parts[1];
                const sessionId = parts[2];
                const session = teamSessions.get(sessionId);

                if (!session) return interaction.reply({ content: '❌ 這個隊伍選單已逾時。', ephemeral: true });
                if (interaction.user.id !== session.ownerId) return interaction.reply({ content: '❌ 只有發起者可以操作這個隊伍。', ephemeral: true });

                const entries = getInventoryEntries(session.ownerId);
                const totalPages = Math.max(1, Math.ceil(entries.length / TEAM_PAGE_SIZE));

                if (action === 'prev') session.page = Math.max(0, session.page - 1);
                if (action === 'next') session.page = Math.min(totalPages - 1, session.page + 1);
                if (action === 'clear') session.picked = [];
                if (action === 'finish') {
                    if (!session.picked.length) {
                        return interaction.reply({ content: '❌ 你還沒有選隊伍。', ephemeral: true });
                    }
                    setTeamKeys(session.ownerId, session.picked.slice(0, 7));
                    teamSessions.delete(sessionId);

                    const state = ensurePlayerRecord(session.ownerId);
                    const teamNames = state.team.map(key => state.items[key]?.name || key).join('\n');

                    return interaction.update({
                        content: '✅ 隊伍已設定完成。',
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('🧩 隊伍已保存')
                                .setColor(0x2ecc71)
                                .setDescription(teamNames || '（空）')
                                .setTimestamp()
                        ],
                        components: []
                    });
                }

                return interaction.update({
                    embeds: [buildTeamEmbed(session)],
                    components: buildTeamComponents(session)
                });
            }

            if (parts[0] === 'stage') {
                const difficulty = parts[1];
                const sessionId = parts[2];
                const session = stageSessions.get(sessionId);

                if (!session) return interaction.reply({ content: '❌ 這個關卡已逾時。', ephemeral: true });
                if (interaction.user.id !== session.ownerId) return interaction.reply({ content: '❌ 只有發起者可以開始這場關卡。', ephemeral: true });

                const cfg = STAGE_CONFIGS[difficulty];
                if (!cfg) return interaction.reply({ content: '❌ 無效的難度。', ephemeral: true });

                const squad = getBattleSquad(session.ownerId);
                if (!squad.length) {
                    return interaction.reply({ content: '❌ 你沒有可出戰的人格。請先用 `!stageteam` 設定隊伍。', ephemeral: true });
                }

                session.squad = squad;
                const result = simulateStageBattle(squad, difficulty);

                const reward = result.reward;
                addBalance(session.ownerId, reward);

                stageSessions.delete(sessionId);

                return interaction.update({
                    embeds: [buildStageResultEmbed(session, result)],
                    components: []
                });
            }

            if (parts[0] === 'trade') {
                const action = parts[1];
                const sessionId = parts[2];
                const tradeSession = stageSessions.get(`trade:${sessionId}`);

                if (!tradeSession) return interaction.reply({ content: '❌ 這筆交易已逾時。', ephemeral: true });

                const { ownerId, targetId, itemKey, itemName, itemRarity } = tradeSession;

                if (action === 'cancel') {
                    if (interaction.user.id !== ownerId) return interaction.reply({ content: '❌ 只有發起者可以取消交易。', ephemeral: true });
                    stageSessions.delete(`trade:${sessionId}`);
                    return interaction.update({ content: '❌ 交易已取消。', embeds: [], components: [] });
                }

                if (action === 'decline') {
                    if (interaction.user.id !== targetId) return interaction.reply({ content: '❌ 只有交易對象可以拒絕。', ephemeral: true });
                    stageSessions.delete(`trade:${sessionId}`);
                    return interaction.update({
                        content: `❌ **${interaction.user.username}** 拒絕了交易。`,
                        embeds: [],
                        components: []
                    });
                }

                if (action === 'accept') {
                    if (interaction.user.id !== targetId) return interaction.reply({ content: '❌ 只有交易對象可以接受。', ephemeral: true });

                    const fromState = ensurePlayerRecord(ownerId);
                    ensurePlayerRecord(targetId);

                    if (!fromState.items[itemKey] || fromState.items[itemKey].count <= 0) {
                        stageSessions.delete(`trade:${sessionId}`);
                        return interaction.update({
                            content: '❌ 交易失敗，來源項目不存在。',
                            embeds: [],
                            components: []
                        });
                    }

                    transferItem(ownerId, targetId, itemKey);
                    stageSessions.delete(`trade:${sessionId}`);

                    return interaction.update({
                        content: `✅ **${itemName}** 已成功交易給 <@${targetId}>。`,
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('✅ 交易完成')
                                .setColor(0x2ecc71)
                                .setDescription(`**<@${ownerId}>** 將 **${itemName}** 交易給 **<@${targetId}>**。`)
                                .addFields({ name: '🏷️ 稀有度', value: itemRarity, inline: true })
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

/* =========================
   Guild events
========================= */
client.on('guildMemberAdd', async (member) => {
    if (!member.user.bot) {
        ensurePlayerRecord(member.user);
        savePlayers();
    }
});

client.on('guildCreate', async (guild) => {
    try {
        await ensureGuildMembersDb(guild);
    } catch {}
});

/* =========================
   Initial load
========================= */
ensureDataDir();
refreshIdentitiesData();
savePlayers();
saveJsonSafe(RATEUP_CACHE_PATH, lastRateUpState || { state: null });
saveJsonSafe(TWITTER_CACHE_PATH, twitterCache);
saveJsonSafe(STEAM_CACHE_PATH, steamCache);

/* =========================
   Login
========================= */
const TOKEN = process.env.DISCORD_TOKEN;
client.login(TOKEN).catch(err => {
    console.error('❌ 機器人登入失敗：', err);
});
