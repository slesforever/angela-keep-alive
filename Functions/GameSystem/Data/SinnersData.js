// Functions/GameSystem/Data/SinnersData.js
// 12位罪人的基礎數據（以LCB身分為準）
// type: 斬/刺/鈍  sin: 憤/情/怠/貪/幽/傲/嫉

const SINNERS = {
    '李箱': {
        name: '李箱', nameEn: 'Yi Sang',
        hp: 74, defLevel: 25, minSpd: 4, maxSpd: 9,
        primarySin: '嫉',
        skills: [
            { name: '鳥爪',       type: '斬', sin: '嫉', coins: 3, base: 3, coin: 2, effect: null },
            { name: '裂縫',       type: '刺', sin: '幽', coins: 3, base: 4, coin: 2, effect: { name: '流血', stacks: 2 } },
            { name: '思維概念化', type: '斬', sin: '嫉', coins: 5, base: 2, coin: 3, effect: { name: '破裂', stacks: 3 } },
        ],
        passive: { name: '孤島', desc: 'HP低於50%時，所有技能碰撞力量+2' },
    },
    '浮士德': {
        name: '浮士德', nameEn: 'Faust',
        hp: 70, defLevel: 28, minSpd: 3, maxSpd: 7,
        primarySin: '傲',
        skills: [
            { name: '扯線',   type: '刺', sin: '傲', coins: 2, base: 5, coin: 3, effect: null },
            { name: '紡絲',   type: '鈍', sin: '傲', coins: 4, base: 3, coin: 2, effect: { name: '束縛', stacks: 1 } },
            { name: '手術刀', type: '斬', sin: '嫉', coins: 4, base: 3, coin: 3, effect: { name: '流血', stacks: 3 } },
        ],
        passive: { name: '理性邏輯', desc: '贏得碰撞後，下一回合所有技能+1力量' },
    },
    '堂吉訶德': {
        name: '堂吉訶德', nameEn: 'Don Quixote',
        hp: 64, defLevel: 20, minSpd: 5, maxSpd: 10,
        primarySin: '貪',
        skills: [
            { name: '突刺',       type: '刺', sin: '貪', coins: 2, base: 3, coin: 2, effect: null },
            { name: '衝擊',       type: '鈍', sin: '憤', coins: 3, base: 4, coin: 3, effect: { name: '震顫', stacks: 2 } },
            { name: '幻想騎士之劍', type: '斬', sin: '貪', coins: 5, base: 2, coin: 3, effect: { name: '震顫', stacks: 3 } },
        ],
        passive: { name: '幻想勇者', desc: '戰鬥開始時，所有技能力量+1' },
    },
    '良秀': {
        name: '良秀', nameEn: 'Ryōshū',
        hp: 57, defLevel: 20, minSpd: 4, maxSpd: 8,
        primarySin: '情',
        skills: [
            { name: '砍削',   type: '斬', sin: '情', coins: 3, base: 3, coin: 2, effect: { name: '流血', stacks: 2 } },
            { name: '大動脈', type: '斬', sin: '情', coins: 3, base: 4, coin: 3, effect: { name: '流血', stacks: 4 } },
            { name: '藝術刀', type: '斬', sin: '幽', coins: 5, base: 3, coin: 3, effect: { name: '流血', stacks: 6 } },
        ],
        passive: { name: '以痛為美', desc: '敵人流血層數≥5時，自身傷害+20%' },
    },
    '默爾索': {
        name: '默爾索', nameEn: 'Meursault',
        hp: 78, defLevel: 35, minSpd: 2, maxSpd: 6,
        primarySin: '怠',
        skills: [
            { name: '拳擊',   type: '鈍', sin: '怠', coins: 2, base: 5, coin: 2, effect: null },
            { name: '壓制',   type: '鈍', sin: '怠', coins: 3, base: 5, coin: 3, effect: { name: '倒地', stacks: 1 } },
            { name: '終結',   type: '鈍', sin: '傲', coins: 4, base: 5, coin: 4, effect: { name: '倒地', stacks: 2 } },
        ],
        passive: { name: '漠然', desc: '受到傷害時，20%機率減半傷害' },
    },
    '鴻璐': {
        name: '鴻璐', nameEn: 'Hong Lu',
        hp: 60, defLevel: 20, minSpd: 4, maxSpd: 9,
        primarySin: '貪',
        skills: [
            { name: '飛踢',   type: '鈍', sin: '貪', coins: 2, base: 4, coin: 2, effect: null },
            { name: '快斬',   type: '斬', sin: '貪', coins: 4, base: 3, coin: 2, effect: { name: '流血', stacks: 1 } },
            { name: '雙刀旋', type: '斬', sin: '貪', coins: 5, base: 3, coin: 3, effect: { name: '流血', stacks: 3 } },
        ],
        passive: { name: '豪門手段', desc: '攻擊力量最低的技能時，傷害+15%' },
    },
    '希斯克里夫': {
        name: '希斯克里夫', nameEn: 'Heathcliff',
        hp: 70, defLevel: 28, minSpd: 4, maxSpd: 9,
        primarySin: '憤',
        skills: [
            { name: '拳打',   type: '鈍', sin: '憤', coins: 2, base: 4, coin: 3, effect: null },
            { name: '怒擊',   type: '鈍', sin: '憤', coins: 3, base: 4, coin: 3, effect: { name: '燃燒', stacks: 2 } },
            { name: '熔炎重擊', type: '鈍', sin: '憤', coins: 4, base: 4, coin: 4, effect: { name: '燃燒', stacks: 4 } },
        ],
        passive: { name: '怒火', desc: 'HP低於30%時，技能力量+3' },
    },
    '以實瑪利': {
        name: '以實瑪利', nameEn: 'Ishmael',
        hp: 66, defLevel: 22, minSpd: 4, maxSpd: 8,
        primarySin: '怠',
        skills: [
            { name: '魚叉',   type: '刺', sin: '怠', coins: 3, base: 3, coin: 2, effect: { name: '流血', stacks: 1 } },
            { name: '潮浪',   type: '鈍', sin: '怠', coins: 3, base: 4, coin: 2, effect: { name: '震顫', stacks: 2 } },
            { name: '深海壓', type: '刺', sin: '幽', coins: 5, base: 3, coin: 3, effect: { name: '沉沒', stacks: 3 } },
        ],
        passive: { name: '航海者', desc: '受到震顫時，免疫並轉化為+1力量' },
    },
    '羅佳': {
        name: '羅佳', nameEn: 'Rodion',
        hp: 60, defLevel: 20, minSpd: 4, maxSpd: 8,
        primarySin: '幽',
        skills: [
            { name: '錘擊',   type: '鈍', sin: '幽', coins: 2, base: 4, coin: 2, effect: { name: '震顫', stacks: 1 } },
            { name: '連鎖',   type: '鈍', sin: '幽', coins: 3, base: 4, coin: 3, effect: { name: '震顫', stacks: 2 } },
            { name: '地震衝',  type: '鈍', sin: '幽', coins: 5, base: 3, coin: 3, effect: { name: '震顫', stacks: 4 } },
        ],
        passive: { name: '歡鬧', desc: '讓敵人倒地時，回復10HP' },
    },
    '辛克萊': {
        name: '辛克萊', nameEn: 'Sinclair',
        hp: 66, defLevel: 22, minSpd: 5, maxSpd: 9,
        primarySin: '幽',
        skills: [
            { name: '斬擊',   type: '斬', sin: '幽', coins: 2, base: 3, coin: 2, effect: null },
            { name: '恐懼刃', type: '斬', sin: '幽', coins: 3, base: 3, coin: 3, effect: { name: '破裂', stacks: 2 } },
            { name: '絕望迴旋', type: '斬', sin: '幽', coins: 4, base: 3, coin: 4, effect: { name: '破裂', stacks: 4 } },
        ],
        passive: { name: '新生', desc: 'HP低於20%時，一次性回復20HP並移除所有負面狀態' },
    },
    '奧提斯': {
        name: '奧提斯', nameEn: 'Outis',
        hp: 70, defLevel: 28, minSpd: 4, maxSpd: 8,
        primarySin: '傲',
        skills: [
            { name: '劍術基礎', type: '斬', sin: '傲', coins: 2, base: 4, coin: 2, effect: null },
            { name: '指揮突擊', type: '斬', sin: '傲', coins: 3, base: 4, coin: 3, effect: null },
            { name: '軍刃連擊', type: '斬', sin: '傲', coins: 5, base: 3, coin: 3, effect: { name: '流血', stacks: 2 } },
        ],
        passive: { name: '軍事部署', desc: '隊伍中有其他罪人時，力量+1' },
    },
    '格里高爾': {
        name: '格里高爾', nameEn: 'Gregor',
        hp: 66, defLevel: 25, minSpd: 3, maxSpd: 7,
        primarySin: '嫉',
        skills: [
            { name: '甲殼鉗', type: '斬', sin: '嫉', coins: 3, base: 3, coin: 2, effect: null },
            { name: '甲殼衝', type: '刺', sin: '嫉', coins: 3, base: 4, coin: 3, effect: { name: '燃燒', stacks: 2 } },
            { name: '蟲鳴迴響', type: '刺', sin: '嫉', coins: 4, base: 4, coin: 3, effect: { name: '燃燒', stacks: 4 } },
        ],
        passive: { name: '蛻變', desc: '流血或燃燒狀態下，受傷時有30%機率觸發反擊' },
    },
};

const SINNER_NAMES = Object.keys(SINNERS);

const UPTIE_COSTS = [0, 20, 40, 80, 150];

function getSinnerData(name) {
    return SINNERS[name] || null;
}

module.exports = { SINNERS, SINNER_NAMES, UPTIE_COSTS, getSinnerData };
