// Functions/GameSystem/Data/SinnersData.js
// 12位罪人 LCB 身份詳細戰鬥數據
// 技能格式：clashbase(碰撞基礎值) / coins(硬幣數) / clashpower(每硬幣加成) / attack(攻擊傷害)
// 迴避格式：coins / clashpower / defense
// 反擊格式：clashable(可被碰撞) / coins / clashpower / attack / defense
// 防禦格式：defense / coins / clashpower

const SINNERS = {
    '李箱': {
        name: '李箱', nameEn: 'Yi Sang',
        hp: 74, defLevel: 25, minSpd: 4, maxSpd: 9,
        primarySin: '嫉',
        skills: {
            skill1: { name: '鳥爪',       type: '斬', sin: '嫉', clashbase: 3, coins: 3, clashpower: 2, attack: 6,  effect: null },
            skill2: { name: '裂縫',       type: '刺', sin: '幽', clashbase: 4, coins: 2, clashpower: 3, attack: 8,  effect: { name: '流血', stacks: 2 } },
            skill3: { name: '思維概念化', type: '斬', sin: '嫉', clashbase: 3, coins: 5, clashpower: 3, attack: 13, effect: { name: '破裂', stacks: 3 } },
        },
        evade:        { coins: 2, clashpower: 3, defense: 3 },
        counter_true: { clashable: true,  coins: 2, clashpower: 4, attack: 5, defense: 0 },
        counter_false:{ clashable: false, coins: 0, clashpower: 0, attack: 0, defense: 4 },
        defense:      { defense: 5, coins: 1, clashpower: 2 },
        passive: { name: '孤島', desc: 'HP低於50%時，所有技能碰撞力量+2' },
    },
    '浮士德': {
        name: '浮士德', nameEn: 'Faust',
        hp: 70, defLevel: 28, minSpd: 3, maxSpd: 7,
        primarySin: '傲',
        skills: {
            skill1: { name: '扯線',   type: '刺', sin: '傲', clashbase: 5, coins: 2, clashpower: 3, attack: 9,  effect: null },
            skill2: { name: '紡絲',   type: '鈍', sin: '傲', clashbase: 3, coins: 4, clashpower: 2, attack: 8,  effect: { name: '束縛', stacks: 1 } },
            skill3: { name: '手術刀', type: '斬', sin: '嫉', clashbase: 4, coins: 3, clashpower: 4, attack: 12, effect: { name: '流血', stacks: 3 } },
        },
        evade:        { coins: 1, clashpower: 4, defense: 4 },
        counter_true: { clashable: true,  coins: 2, clashpower: 5, attack: 6, defense: 2 },
        counter_false:{ clashable: false, coins: 0, clashpower: 0, attack: 0, defense: 6 },
        defense:      { defense: 6, coins: 1, clashpower: 3 },
        passive: { name: '理性邏輯', desc: '贏得碰撞後，下回合所有技能+1力量' },
    },
    '堂吉訶德': {
        name: '堂吉訶德', nameEn: 'Don Quixote',
        hp: 64, defLevel: 20, minSpd: 5, maxSpd: 10,
        primarySin: '貪',
        skills: {
            skill1: { name: '突刺',         type: '刺', sin: '貪', clashbase: 3, coins: 2, clashpower: 2, attack: 5,  effect: null },
            skill2: { name: '衝擊',         type: '鈍', sin: '憤', clashbase: 4, coins: 3, clashpower: 3, attack: 9,  effect: { name: '震顫', stacks: 2 } },
            skill3: { name: '幻想騎士之劍', type: '斬', sin: '貪', clashbase: 3, coins: 5, clashpower: 3, attack: 14, effect: { name: '震顫', stacks: 3 } },
        },
        evade:        { coins: 2, clashpower: 4, defense: 2 },
        counter_true: { clashable: true,  coins: 3, clashpower: 3, attack: 7, defense: 0 },
        counter_false:{ clashable: false, coins: 0, clashpower: 0, attack: 5, defense: 2 },
        defense:      { defense: 4, coins: 1, clashpower: 2 },
        passive: { name: '幻想勇者', desc: '戰鬥開始時，所有技能力量+1' },
    },
    '良秀': {
        name: '良秀', nameEn: 'Ryōshū',
        hp: 57, defLevel: 20, minSpd: 4, maxSpd: 8,
        primarySin: '情',
        skills: {
            skill1: { name: '砍削',   type: '斬', sin: '情', clashbase: 3, coins: 3, clashpower: 2, attack: 5,  effect: { name: '流血', stacks: 2 } },
            skill2: { name: '大動脈', type: '斬', sin: '情', clashbase: 4, coins: 3, clashpower: 3, attack: 9,  effect: { name: '流血', stacks: 4 } },
            skill3: { name: '藝術刀', type: '斬', sin: '幽', clashbase: 4, coins: 4, clashpower: 3, attack: 13, effect: { name: '流血', stacks: 6 } },
        },
        evade:        { coins: 3, clashpower: 3, defense: 2 },
        counter_true: { clashable: true,  coins: 2, clashpower: 4, attack: 5, defense: 0 },
        counter_false:{ clashable: false, coins: 0, clashpower: 0, attack: 3, defense: 3 },
        defense:      { defense: 3, coins: 1, clashpower: 2 },
        passive: { name: '以痛為美', desc: '敵人流血層數≥5時，自身傷害+20%' },
    },
    '默爾索': {
        name: '默爾索', nameEn: 'Meursault',
        hp: 78, defLevel: 35, minSpd: 2, maxSpd: 6,
        primarySin: '怠',
        skills: {
            skill1: { name: '拳擊', type: '鈍', sin: '怠', clashbase: 5, coins: 2, clashpower: 2, attack: 8,  effect: null },
            skill2: { name: '壓制', type: '鈍', sin: '怠', clashbase: 5, coins: 3, clashpower: 3, attack: 12, effect: { name: '倒地', stacks: 1 } },
            skill3: { name: '終結', type: '鈍', sin: '傲', clashbase: 5, coins: 4, clashpower: 4, attack: 16, effect: { name: '倒地', stacks: 2 } },
        },
        evade:        { coins: 1, clashpower: 2, defense: 6 },
        counter_true: { clashable: true,  coins: 2, clashpower: 3, attack: 4, defense: 5 },
        counter_false:{ clashable: false, coins: 0, clashpower: 0, attack: 0, defense: 8 },
        defense:      { defense: 9, coins: 0, clashpower: 0 },
        passive: { name: '漠然', desc: '受到傷害時，20%機率減半傷害' },
    },
    '鴻璐': {
        name: '鴻璐', nameEn: 'Hong Lu',
        hp: 60, defLevel: 20, minSpd: 4, maxSpd: 9,
        primarySin: '貪',
        skills: {
            skill1: { name: '飛踢',   type: '鈍', sin: '貪', clashbase: 4, coins: 2, clashpower: 2, attack: 6,  effect: null },
            skill2: { name: '快斬',   type: '斬', sin: '貪', clashbase: 3, coins: 4, clashpower: 2, attack: 7,  effect: { name: '流血', stacks: 1 } },
            skill3: { name: '雙刀旋', type: '斬', sin: '貪', clashbase: 4, coins: 4, clashpower: 3, attack: 12, effect: { name: '流血', stacks: 3 } },
        },
        evade:        { coins: 2, clashpower: 3, defense: 3 },
        counter_true: { clashable: true,  coins: 2, clashpower: 3, attack: 5, defense: 2 },
        counter_false:{ clashable: false, coins: 0, clashpower: 0, attack: 4, defense: 3 },
        defense:      { defense: 4, coins: 1, clashpower: 2 },
        passive: { name: '豪門手段', desc: '以最低力量技能攻擊時，傷害+15%' },
    },
    '希斯克里夫': {
        name: '希斯克里夫', nameEn: 'Heathcliff',
        hp: 70, defLevel: 28, minSpd: 4, maxSpd: 9,
        primarySin: '憤',
        skills: {
            skill1: { name: '拳打',     type: '鈍', sin: '憤', clashbase: 4, coins: 2, clashpower: 3, attack: 8,  effect: null },
            skill2: { name: '怒擊',     type: '鈍', sin: '憤', clashbase: 4, coins: 3, clashpower: 3, attack: 11, effect: { name: '燃燒', stacks: 2 } },
            skill3: { name: '熔炎重擊', type: '鈍', sin: '憤', clashbase: 4, coins: 4, clashpower: 4, attack: 15, effect: { name: '燃燒', stacks: 4 } },
        },
        evade:        { coins: 2, clashpower: 3, defense: 3 },
        counter_true: { clashable: true,  coins: 2, clashpower: 4, attack: 6, defense: 2 },
        counter_false:{ clashable: false, coins: 0, clashpower: 0, attack: 5, defense: 3 },
        defense:      { defense: 4, coins: 1, clashpower: 2 },
        passive: { name: '怒火', desc: 'HP低於30%時，技能力量+3' },
    },
    '以實瑪利': {
        name: '以實瑪利', nameEn: 'Ishmael',
        hp: 66, defLevel: 22, minSpd: 4, maxSpd: 8,
        primarySin: '怠',
        skills: {
            skill1: { name: '魚叉',   type: '刺', sin: '怠', clashbase: 3, coins: 3, clashpower: 2, attack: 6,  effect: { name: '流血', stacks: 1 } },
            skill2: { name: '潮浪',   type: '鈍', sin: '怠', clashbase: 4, coins: 3, clashpower: 2, attack: 9,  effect: { name: '震顫', stacks: 2 } },
            skill3: { name: '深海壓', type: '刺', sin: '幽', clashbase: 4, coins: 4, clashpower: 3, attack: 13, effect: { name: '沉沒', stacks: 3 } },
        },
        evade:        { coins: 2, clashpower: 3, defense: 3 },
        counter_true: { clashable: true,  coins: 2, clashpower: 3, attack: 4, defense: 3 },
        counter_false:{ clashable: false, coins: 0, clashpower: 0, attack: 3, defense: 5 },
        defense:      { defense: 5, coins: 1, clashpower: 2 },
        passive: { name: '航海者', desc: '受到震顫時免疫並轉化為+1力量' },
    },
    '羅佳': {
        name: '羅佳', nameEn: 'Rodion',
        hp: 60, defLevel: 20, minSpd: 4, maxSpd: 8,
        primarySin: '幽',
        skills: {
            skill1: { name: '錘擊',  type: '鈍', sin: '幽', clashbase: 4, coins: 2, clashpower: 2, attack: 7,  effect: { name: '震顫', stacks: 1 } },
            skill2: { name: '連鎖',  type: '鈍', sin: '幽', clashbase: 4, coins: 3, clashpower: 3, attack: 10, effect: { name: '震顫', stacks: 2 } },
            skill3: { name: '地震衝', type: '鈍', sin: '幽', clashbase: 3, coins: 5, clashpower: 3, attack: 14, effect: { name: '震顫', stacks: 4 } },
        },
        evade:        { coins: 2, clashpower: 2, defense: 4 },
        counter_true: { clashable: true,  coins: 2, clashpower: 3, attack: 4, defense: 3 },
        counter_false:{ clashable: false, coins: 0, clashpower: 0, attack: 3, defense: 5 },
        defense:      { defense: 5, coins: 1, clashpower: 2 },
        passive: { name: '歡鬧', desc: '讓敵人倒地時，回復10HP' },
    },
    '辛克萊': {
        name: '辛克萊', nameEn: 'Sinclair',
        hp: 66, defLevel: 22, minSpd: 5, maxSpd: 9,
        primarySin: '幽',
        skills: {
            skill1: { name: '斬擊',     type: '斬', sin: '幽', clashbase: 3, coins: 2, clashpower: 2, attack: 5,  effect: null },
            skill2: { name: '恐懼刃',   type: '斬', sin: '幽', clashbase: 3, coins: 3, clashpower: 3, attack: 9,  effect: { name: '破裂', stacks: 2 } },
            skill3: { name: '絕望迴旋', type: '斬', sin: '幽', clashbase: 3, coins: 4, clashpower: 4, attack: 13, effect: { name: '破裂', stacks: 4 } },
        },
        evade:        { coins: 2, clashpower: 3, defense: 3 },
        counter_true: { clashable: true,  coins: 2, clashpower: 3, attack: 4, defense: 2 },
        counter_false:{ clashable: false, coins: 0, clashpower: 0, attack: 3, defense: 4 },
        defense:      { defense: 4, coins: 1, clashpower: 2 },
        passive: { name: '新生', desc: 'HP低於20%時，一次性回復20HP並移除所有負面狀態' },
    },
    '奧提斯': {
        name: '奧提斯', nameEn: 'Outis',
        hp: 70, defLevel: 28, minSpd: 4, maxSpd: 8,
        primarySin: '傲',
        skills: {
            skill1: { name: '劍術基礎', type: '斬', sin: '傲', clashbase: 4, coins: 2, clashpower: 2, attack: 6,  effect: null },
            skill2: { name: '指揮突擊', type: '斬', sin: '傲', clashbase: 4, coins: 3, clashpower: 3, attack: 10, effect: null },
            skill3: { name: '軍刃連擊', type: '斬', sin: '傲', clashbase: 4, coins: 4, clashpower: 3, attack: 13, effect: { name: '流血', stacks: 2 } },
        },
        evade:        { coins: 2, clashpower: 3, defense: 4 },
        counter_true: { clashable: true,  coins: 2, clashpower: 4, attack: 5, defense: 3 },
        counter_false:{ clashable: false, coins: 0, clashpower: 0, attack: 3, defense: 5 },
        defense:      { defense: 5, coins: 1, clashpower: 2 },
        passive: { name: '軍事部署', desc: '隊伍中有其他罪人時，力量+1' },
    },
    '格里高爾': {
        name: '格里高爾', nameEn: 'Gregor',
        hp: 66, defLevel: 25, minSpd: 3, maxSpd: 7,
        primarySin: '嫉',
        skills: {
            skill1: { name: '甲殼鉗',  type: '斬', sin: '嫉', clashbase: 3, coins: 3, clashpower: 2, attack: 6,  effect: null },
            skill2: { name: '甲殼衝',  type: '刺', sin: '嫉', clashbase: 4, coins: 3, clashpower: 3, attack: 10, effect: { name: '燃燒', stacks: 2 } },
            skill3: { name: '蟲鳴迴響', type: '刺', sin: '嫉', clashbase: 4, coins: 4, clashpower: 3, attack: 13, effect: { name: '燃燒', stacks: 4 } },
        },
        evade:        { coins: 2, clashpower: 3, defense: 3 },
        counter_true: { clashable: true,  coins: 3, clashpower: 3, attack: 5, defense: 3 },
        counter_false:{ clashable: false, coins: 0, clashpower: 0, attack: 4, defense: 4 },
        defense:      { defense: 4, coins: 1, clashpower: 2 },
        passive: { name: '蛻變', desc: '流血或燃燒狀態下，受傷時30%機率觸發反擊' },
    },
};

const SINNER_NAMES = Object.keys(SINNERS);

// 連結提升消耗（T1→T2→T3→T4）
const UPTIE_COSTS = [0, 20, 40, 80, 150];

// 根據稀有度計算身份基礎數值（非LCB身份使用）
function calculateIdentityStats(name, rarity) {
    let hp = 170, atk = 50, def = 15, speed = 6, clashPower = 8, coinPower = 2;
    if (rarity === '00')          { hp = 200; atk = 70;  def = 17; speed = 8;  clashPower = 10; coinPower = 3; }
    if (rarity === '000')         { hp = 350; atk = 130; def = 20; speed = 10; clashPower = 30; coinPower = 6; }
    if (rarity === '0000')        { hp = 400; atk = 150; def = 27; speed = 15; clashPower = 42; coinPower = 8; }
    if (rarity === 'Special')     { hp = 500; atk = 200; def = 25; speed = 17; clashPower = 37; coinPower = 9; }
    if (rarity === 'Color Fixer') { hp = 750; atk = 320; def = 30; speed = 17; clashPower = 50; coinPower = 12; }
    if (rarity === 'Egos')        { hp = 200; atk = 22;  def = 15; speed = 5;  clashPower = 16; coinPower = 4; }
    return { name, rarity, hp, maxHp: hp, atk, def, speed, sanity: 0, clashPower, coinPower, coins: 3 };
}

// 取得技能陣列（從 skills 物件）
function getSkillList(sinner) {
    const s = sinner.skills;
    return [s.skill1, s.skill2, s.skill3].filter(Boolean);
}

function getSinnerData(name) { return SINNERS[name] || null; }

module.exports = { SINNERS, SINNER_NAMES, UPTIE_COSTS, getSinnerData, calculateIdentityStats, getSkillList };
