import { identities } from './identitiesData.js';

export const rateUpTargets = {
    '000': ["［蜘蛛巢：指環 父輩］鴻璐"],
    '00': ["［黑獸 巳支部］格里高爾"]
};

export function pullIdentity(rarity) {
    const pool = identities[rarity];
    const targets = rateUpTargets[rarity] || [];
    
    // 50% 機率觸發 UP
    if (targets.length > 0 && Math.random() < 0.5) {
        return targets[Math.floor(Math.random() * targets.length)];
    }
    return pool[Math.floor(Math.random() * pool.length)];
}
