// Functions/GameSystem/LanguageSystem.js
// 每位玩家的中文/英文偏好；供所有新系統與後續文案逐步共用
'use strict';
const fs = require('fs');
const path = require('path');
const CONFIG_PATH = path.join(process.cwd(), 'data', 'language-preferences.json');
function read() { try { return fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {}; } catch { return {}; } }
function write(data) { fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true }); fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8'); }
function getLanguage(userId) { return read()[userId] || 'zh'; }
function setLanguage(userId, language) { const data = read(); data[userId] = language === 'en' ? 'en' : 'zh'; write(data); return data[userId]; }
function languageName(language) { return language === 'en' ? 'English' : '繁體中文'; }
function pick(language, zh, en) { return language === 'en' ? en : zh; }
module.exports = { getLanguage, setLanguage, languageName, pick };
