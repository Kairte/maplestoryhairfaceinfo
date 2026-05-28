const KAPREKAR_TARGET = '6174';
const KAPREKAR_MATCH_COUNT = 5;
const KAPREKAR_ROUND_COUNT = 5;
const KAPREKAR_MAX_LIFE = 5;
let kaprekarGameState = null;
let kaprekarActionTimer = null;

function clearKaprekarTimers() {
    if (kaprekarActionTimer) {
        clearTimeout(kaprekarActionTimer);
        kaprekarActionTimer = null;
    }
}

function escapeKaprekarHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char] || char));
}

function getKaprekarItemCategory(item) {
    const type = normalizeType(item && item.type);
    return type.includes('face') ? 'face' : 'hair';
}

function getKaprekarCategoryLabel(category) {
    if (category === 'mixed') return 'HAIR & FACE';
    return category === 'face' ? 'FACE' : 'HAIR';
}

function getKaprekarCodeString(item, category) {
    const code = getBaseballCodeString(item);
    if (!code) return '';
    const effectiveCategory = category === 'mixed' ? getKaprekarItemCategory(item) : category;
    return effectiveCategory === 'face'
        ? `${code.slice(0, 2)}${code.slice(3, 5)}`
        : code.slice(0, 4);
}

function isKaprekarDeadCode(code) {
    return /^(\d)\1{3}$/.test(String(code || ''));
}

function runKaprekarStep(code) {
    const digits = String(code || '').padStart(4, '0').slice(0, 4).split('');
    const desc = digits.slice().sort((a, b) => Number(b) - Number(a)).join('');
    const asc = digits.slice().sort((a, b) => Number(a) - Number(b)).join('');
    return String(Number(desc) - Number(asc)).padStart(4, '0');
}

function buildKaprekarSequence(code) {
    const sequence = [];
    let current = String(code || '').padStart(4, '0').slice(0, 4);
    for (let i = 0; i < KAPREKAR_ROUND_COUNT; i += 1) {
        current = runKaprekarStep(current);
        sequence.push(current);
    }
    return sequence;
}

function getKaprekarReachBucket(sequence) {
    const firstHit = Array.isArray(sequence) ? sequence.findIndex((value) => value === KAPREKAR_TARGET) : -1;
    if (firstHit === -1 || firstHit === 4) return 'reach5';
    return `reach${firstHit + 1}`;
}

function getKaprekarItemKey(item, category) {
    return `${category}:${normalizeType(item && item.type)}:${String((item && item.name) || '').trim()}:${getKaprekarCodeString(item, category)}`;
}

function getKaprekarPlayablePool(category) {
    return items
        .filter((item) => {
            const type = normalizeType(item && item.type);
            const isPlayableType = category === 'mixed'
                ? (type.includes('hair') || type.includes('face'))
                : type.includes(category === 'face' ? 'face' : 'hair');
            return isPlayableType
                && !isQmPlaceholderItem(item)
                && getItemNumericCode(item) !== null;
        })
        .map((item) => {
            const code = getKaprekarCodeString(item, category);
            if (!code || code.length !== 4 || isKaprekarDeadCode(code)) return null;
            const itemCategory = getKaprekarItemCategory(item);
            const sequence = buildKaprekarSequence(code);
            return {
                key: getKaprekarItemKey(item, category),
                item,
                category: itemCategory,
                code,
                sequence,
                bucket: getKaprekarReachBucket(sequence)
            };
        })
        .filter(Boolean);
}

function createKaprekarHand(category, blockedKeys = []) {
    const blocked = new Set(blockedKeys);
    const requiredBuckets = ['reach1', 'reach2', 'reach3', 'reach4', 'reach5'];
    const shuffledPool = shuffleBaseballArray(getKaprekarPlayablePool(category));
    const hand = requiredBuckets.map((bucket) => {
        const candidate = shuffledPool.find((entry) => entry.bucket === bucket && !blocked.has(entry.key));
        if (!candidate) {
            throw new Error(`Missing Kaprekar pool for ${category} ${bucket}`);
        }
        blocked.add(candidate.key);
        return {
            ...candidate,
            used: false
        };
    });
    return shuffleBaseballArray(hand);
}

function getKaprekarCurrentCard(owner) {
    return kaprekarGameState && kaprekarGameState[owner] ? kaprekarGameState[owner].currentCard : null;
}

function getKaprekarCurrentValue(owner) {
    const currentCard = getKaprekarCurrentCard(owner);
    if (!currentCard || !Array.isArray(currentCard.sequence)) return '';
    return currentCard.sequence[Math.max(0, Math.min(kaprekarGameState.round - 1, currentCard.sequence.length - 1))] || '';
}

function getKaprekarVisibleDigits(owner, round) {
    const currentCard = getKaprekarCurrentCard(owner);
    if (!currentCard || !Array.isArray(currentCard.sequence)) return ['', '', '', ''];
    const sequence = currentCard.sequence;
    const currentDigits = String(sequence[Math.max(0, Math.min(round - 1, sequence.length - 1))] || '').padStart(4, '0').slice(0, 4).split('');
    if (round >= 5) return currentDigits;
    const revealed = kaprekarGameState && kaprekarGameState.visibleDigits && Array.isArray(kaprekarGameState.visibleDigits[owner])
        ? kaprekarGameState.visibleDigits[owner].slice(0, 4)
        : ['', '', '', ''];
    if (round >= 2 && currentDigits[0] === KAPREKAR_TARGET[0]) {
        revealed[0] = currentDigits[0];
    }
    if (round >= 3 && currentDigits.slice(0, 2).join('') === KAPREKAR_TARGET.slice(0, 2)) {
        revealed[0] = currentDigits[0];
        revealed[1] = currentDigits[1];
    }
    if (round >= 4 && currentDigits.slice(0, 3).join('') === KAPREKAR_TARGET.slice(0, 3)) {
        revealed[0] = currentDigits[0];
        revealed[1] = currentDigits[1];
        revealed[2] = currentDigits[2];
    }
    return revealed;
}

function renderKaprekarLife(owner) {
    const root = document.getElementById(owner === 'player' ? 'kaprekar-player-life' : 'kaprekar-com-life');
    if (!root || !kaprekarGameState) return;
    const value = Math.max(0, Math.min(KAPREKAR_MAX_LIFE, kaprekarGameState[owner].life));
    root.innerHTML = Array.from({ length: KAPREKAR_MAX_LIFE }, (_, index) => `
        <span class="kaprekar-life-dot${index < value ? ' is-on' : ''}"></span>
    `).join('');
}

function getKaprekarCardMarkup(card, owner) {
    if (!card) {
        return `<div class="kaprekar-empty-card">${owner === 'player' ? 'SELECT A CARD' : 'COM READY'}</div>`;
    }
    const isCom = owner === 'com';
    const imageSrc = isCom ? 'boardgame/kaprekar/card/back.png' : resolveItemImageSrc(card.item);
    const altText = isCom ? 'Hidden Kaprekar card' : card.item.name;
    const nameText = isCom ? 'HIDDEN CARD' : card.item.name;
    const metaText = isCom ? 'UNKNOWN MATCH CARD' : `${card.category.toUpperCase()} MATCH CARD`;
    return `
        <div class="kaprekar-card-frame">
            <div class="kaprekar-card-owner">${owner === 'player' ? 'PLAYER CARD' : 'COM CARD'}</div>
            <div class="kaprekar-card-visual"><img src="${escapeKaprekarHtml(imageSrc)}" alt="${escapeKaprekarHtml(altText)}"></div>
            <div class="kaprekar-card-name">${escapeKaprekarHtml(nameText)}</div>
            <div class="kaprekar-card-meta">${escapeKaprekarHtml(metaText)}</div>
        </div>
    `;
}
function renderKaprekarLocks(owner) {
    const root = document.getElementById(owner === 'player' ? 'kaprekar-player-locks' : 'kaprekar-com-locks');
    if (!root || !kaprekarGameState) return;
    const currentValue = getKaprekarCurrentValue(owner);
    const revealAll = Boolean(kaprekarGameState.revealLocks);
    const digits = revealAll ? String(currentValue || '').padStart(4, '0').slice(0, 4).split('') : getKaprekarVisibleDigits(owner, kaprekarGameState.round);
    if (!revealAll && kaprekarGameState.visibleDigits) {
        kaprekarGameState.visibleDigits[owner] = digits.slice(0, 4);
    }
    root.innerHTML = digits.map((digit) => `
        <div class="kaprekar-lock-cell${digit ? ' is-open' : ''}${revealAll ? ' is-reveal' : ''}">${digit || '•'}</div>
    `).join('');
}

function renderKaprekarHand() {
    const root = document.getElementById('kaprekar-player-hand');
    if (!root || !kaprekarGameState) return;
    root.innerHTML = kaprekarGameState.player.hand.map((card, index) => {
        const classes = ['kaprekar-hand-card'];
        if (card.used) classes.push('is-used');
        if (kaprekarGameState.player.currentCard && kaprekarGameState.player.currentCard.key === card.key) classes.push('is-current');
        return `
            <button type="button" class="${classes.join(' ')}" onclick="selectKaprekarPlayerCard(${index})" ${card.used || kaprekarGameState.locked || kaprekarGameState.result ? 'disabled' : ''}>
                <div class="kaprekar-hand-card-visual"><img src="${escapeKaprekarHtml(resolveItemImageSrc(card.item))}" alt="${escapeKaprekarHtml(card.item.name)}"></div>
                <div class="kaprekar-hand-card-name">${escapeKaprekarHtml(card.item.name)}</div>
                <div class="kaprekar-card-meta">${escapeKaprekarHtml(card.code)}</div>
            </button>
        `;
    }).join('');
}

function renderKaprekarGame() {
    if (!kaprekarGameState || kaprekarGameState.mode !== 'game') return;
    const categoryCopy = document.getElementById('kaprekar-category-copy');
    const matchLabel = document.getElementById('kaprekar-match-label');
    const roundLabel = document.getElementById('kaprekar-round-label');
    const statusLabel = document.getElementById('kaprekar-status-label');
    const feedback = document.getElementById('kaprekar-feedback');
    const handCaption = document.getElementById('kaprekar-hand-caption');
    const matchCopy = document.getElementById('kaprekar-match-copy');
    const matchCopySub = document.getElementById('kaprekar-match-copy-sub');
    const matchCardName = document.getElementById('kaprekar-match-card-name');
    const matchCardCode = document.getElementById('kaprekar-match-card-code');
    const declareBtn = document.getElementById('kaprekar-declare-btn');
    const passBtn = document.getElementById('kaprekar-pass-btn');
    const playerCard = document.getElementById('kaprekar-player-card');
    const comCard = document.getElementById('kaprekar-com-card');
    const resultOverlay = document.getElementById('kaprekar-result-overlay');
    const resultTitle = document.getElementById('kaprekar-result-title');
    const resultScore = document.getElementById('kaprekar-result-score');

    if (categoryCopy) categoryCopy.textContent = `${getKaprekarCategoryLabel(kaprekarGameState.category)} CATEGORY`;
    if (matchLabel) matchLabel.textContent = `MATCH ${kaprekarGameState.matchIndex} / ${KAPREKAR_MATCH_COUNT}`;
    if (roundLabel) roundLabel.textContent = `ROUND ${kaprekarGameState.round} / ${KAPREKAR_ROUND_COUNT}`;
    if (statusLabel) statusLabel.textContent = kaprekarGameState.player.currentCard ? 'IN PLAY' : 'WAITING';
    if (feedback) feedback.textContent = kaprekarGameState.feedback;
    if (handCaption) handCaption.textContent = kaprekarGameState.player.currentCard
        ? `MATCH ${kaprekarGameState.matchIndex} IS ACTIVE`
        : `${kaprekarGameState.matchIndex} 경기에서 사용할 카드를 선택해 주십시오.`;
    if (matchCopy) matchCopy.textContent = kaprekarGameState.player.currentCard
        ? `MATCH ${kaprekarGameState.matchIndex} · ROUND ${kaprekarGameState.round}`
        : `MATCH ${kaprekarGameState.matchIndex} READY`;
    if (matchCopySub) matchCopySub.textContent = kaprekarGameState.player.currentCard
        ? (kaprekarGameState.round >= 5 ? 'FINAL REVEAL AUTO RESOLVES THIS MATCH.' : '선언 시, 경기가 종료되며 판정에 따른 라이프 체크가 이루어집니다.')
        : 'PASS BUILDS TOWARD THE NEXT LOCK REVEAL.';
    if (matchCardName) matchCardName.textContent = kaprekarGameState.player.currentCard ? kaprekarGameState.player.currentCard.item.name : 'NO CARD SELECTED';
    if (matchCardCode) matchCardCode.textContent = kaprekarGameState.player.currentCard ? kaprekarGameState.player.currentCard.code : '----';

    renderKaprekarLife('player');
    renderKaprekarLife('com');
    renderKaprekarLocks('player');
    renderKaprekarLocks('com');
    renderKaprekarHand();

    if (playerCard) playerCard.innerHTML = getKaprekarCardMarkup(kaprekarGameState.player.currentCard, 'player');
    if (comCard) comCard.innerHTML = getKaprekarCardMarkup(kaprekarGameState.com.currentCard, 'com');

    const actionDisabled = !kaprekarGameState.player.currentCard || kaprekarGameState.locked || kaprekarGameState.round >= 5 || Boolean(kaprekarGameState.result);
    if (declareBtn) declareBtn.disabled = actionDisabled;
    if (passBtn) passBtn.disabled = actionDisabled;

    if (resultOverlay) resultOverlay.style.display = kaprekarGameState.result ? 'flex' : 'none';
    if (resultTitle && kaprekarGameState.result) resultTitle.textContent = kaprekarGameState.result;
    if (resultScore && kaprekarGameState.result) resultScore.textContent = `PLAYER ${kaprekarGameState.player.life} : ${kaprekarGameState.com.life} COM`;
}

function pickKaprekarComCard() {
    const available = kaprekarGameState.com.hand.filter((card) => !card.used);
    if (!available.length) return null;
    return available[Math.floor(Math.random() * available.length)];
}

function selectKaprekarPlayerCard(index) {
    if (!kaprekarGameState || kaprekarGameState.result || kaprekarGameState.locked || kaprekarGameState.player.currentCard) return;
    const selected = kaprekarGameState.player.hand[index];
    if (!selected || selected.used) return;
    const comCard = pickKaprekarComCard();
    if (!comCard) {
        finishKaprekarGame();
        return;
    }
    selected.used = true;
    comCard.used = true;
    kaprekarGameState.player.currentCard = selected;
    kaprekarGameState.com.currentCard = comCard;
    kaprekarGameState.visibleDigits = { player: ['', '', '', ''], com: ['', '', '', ''] };
    kaprekarGameState.round = 1;
    kaprekarGameState.feedback = 'ROUND 1 · 어떤 자물쇠도 열리지 않습니다.';
    renderKaprekarGame();
}

function getKaprekarComAction() {
    if (!kaprekarGameState || kaprekarGameState.round >= 5) return 'pass';
    const visiblePlayerDigits = Array.isArray(kaprekarGameState.visibleDigits?.player) ? kaprekarGameState.visibleDigits.player : [];
    const targetValue = getKaprekarCurrentValue('player');
    if (kaprekarGameState.round > 1) {
        const requiredPrefix = KAPREKAR_TARGET.slice(0, kaprekarGameState.round - 1);
        if (!visiblePlayerDigits.some((digit) => Boolean(digit)) || !targetValue.startsWith(requiredPrefix)) return 'pass';
    }
    const successChance = [0, 0.18, 0.28, 0.42, 0.58];
    const bluffChance = [0, 0.10, 0.07, 0.05, 0.03];
    const chance = targetValue === KAPREKAR_TARGET
        ? successChance[kaprekarGameState.round] || 0
        : bluffChance[kaprekarGameState.round] || 0;
    return Math.random() < chance ? 'declare' : 'pass';
}
function applyKaprekarDeclaration(attacker, defender, damage, messages, damageEvents) {
    const defenderValue = getKaprekarCurrentValue(defender);
    if (defenderValue === KAPREKAR_TARGET) {
        kaprekarGameState[defender].life = Math.max(0, kaprekarGameState[defender].life - damage);
        if (Array.isArray(damageEvents)) damageEvents.push(defender);
        messages.push(`${attacker.toUpperCase()}의 선언이 적중합니다.`); messages.push(`(${defender.toUpperCase()}의 포인트 -${damage}차감)`);
    } else {
        kaprekarGameState[attacker].life = Math.max(0, kaprekarGameState[attacker].life - damage);
        if (Array.isArray(damageEvents)) damageEvents.push(attacker);
        messages.push(`${attacker.toUpperCase()}의 선언이 실패합니다.`); messages.push(`(${attacker.toUpperCase()}의 포인트 -${damage}차감)`);
    }
}

function handleKaprekarPlayerAction(action) {
    if (!kaprekarGameState || kaprekarGameState.result || !kaprekarGameState.player.currentCard || kaprekarGameState.locked || kaprekarGameState.round >= 5) return;
    kaprekarGameState.locked = true;
    const comAction = getKaprekarComAction();
    const damageEvents = [];
    const damage = kaprekarGameState.round === 1 ? 2 : 1;
    const messages = [];

    if (action === 'declare') {
        applyKaprekarDeclaration('player', 'com', damage, messages, damageEvents);
    } else {
        messages.push('PLAYER PASS');
    }

    if (comAction === 'declare') {
        applyKaprekarDeclaration('com', 'player', damage, messages, damageEvents);
    } else {
        messages.push('COM PASS');
    }

    kaprekarGameState.revealLocks = action === 'declare' || comAction === 'declare';
    const shouldEndMatch = action === 'declare' || comAction === 'declare';
    const finishResolution = () => {
        if (!kaprekarGameState) return;
        if (kaprekarGameState.player.life <= 0 || kaprekarGameState.com.life <= 0) {
            finishKaprekarGame();
            return;
        }
        if (shouldEndMatch) {
            advanceKaprekarMatch();
            return;
        }
        advanceKaprekarRound();
    };

    kaprekarGameState.feedback = messages[0] || '';
    renderKaprekarGame();
    damageEvents.forEach((owner) => createKaprekarLifeBurst(owner));

    if (messages.length > 1) {
        let feedbackIndex = 1;
        const playNextFeedback = () => {
            if (!kaprekarGameState) return;
            kaprekarGameState.feedback = messages[feedbackIndex];
            renderKaprekarGame();
            feedbackIndex += 1;
            if (feedbackIndex < messages.length) {
                kaprekarActionTimer = setTimeout(playNextFeedback, 950);
                return;
            }
            kaprekarActionTimer = setTimeout(finishResolution, 1600);
        };
        kaprekarActionTimer = setTimeout(playNextFeedback, 950);
        return;
    }

    kaprekarActionTimer = setTimeout(finishResolution, 1850);
}


function advanceKaprekarRound() {
    if (!kaprekarGameState || !kaprekarGameState.player.currentCard) return;
    if (kaprekarGameState.round >= 4) {
        kaprekarGameState.round = 5;
        kaprekarGameState.feedback = '최종 결과';
        kaprekarGameState.locked = true;
        renderKaprekarGame();
        kaprekarActionTimer = setTimeout(() => {
            finalizeKaprekarRoundFive();
        }, 1400);
        return;
    }
    kaprekarGameState.round += 1;
    kaprekarGameState.locked = false;
    kaprekarGameState.feedback = `ROUND ${kaprekarGameState.round} · 자물쇠가 1개 해금되었습니다.`;
    renderKaprekarGame();
}

function finalizeKaprekarRoundFive() {
    if (!kaprekarGameState || !kaprekarGameState.player.currentCard) return;
    const recovered = [];
    ['player', 'com'].forEach((owner) => {
        if (getKaprekarCurrentValue(owner) === KAPREKAR_TARGET && kaprekarGameState[owner].life < KAPREKAR_MAX_LIFE) {
            kaprekarGameState[owner].life += 1;
            recovered.push(owner.toUpperCase());
        }
    });
    kaprekarGameState.feedback = recovered.length ? `${recovered.join(' / ')}의 라이프를 1 회복합니다.` : '조건 달성 시, 라이프를 +1 회복합니다.';
    renderKaprekarGame();
    kaprekarActionTimer = setTimeout(() => {
        advanceKaprekarMatch();
    }, 2200);
}

function advanceKaprekarMatch() {
    if (!kaprekarGameState) return;
    if (kaprekarGameState.player.life <= 0 || kaprekarGameState.com.life <= 0 || kaprekarGameState.matchIndex >= KAPREKAR_MATCH_COUNT) {
        finishKaprekarGame();
        return;
    }
    kaprekarGameState.revealLocks = false;
    kaprekarGameState.matchIndex += 1;
    kaprekarGameState.round = 1;
    kaprekarGameState.locked = false;
    kaprekarGameState.player.currentCard = null;
    kaprekarGameState.com.currentCard = null;
    kaprekarGameState.visibleDigits = { player: ['', '', '', ''], com: ['', '', '', ''] };
    kaprekarGameState.feedback = `${kaprekarGameState.matchIndex} 경기에서 사용할 카드를 선택해 주십시오.`;
    renderKaprekarGame();
}

function finishKaprekarGame() {
    if (!kaprekarGameState) return;
    clearKaprekarTimers();
    kaprekarGameState.locked = true;
    kaprekarGameState.player.currentCard = null;
    kaprekarGameState.com.currentCard = null;
    kaprekarGameState.visibleDigits = { player: ['', '', '', ''], com: ['', '', '', ''] };
    kaprekarGameState.result = kaprekarGameState.player.life > kaprekarGameState.com.life
        ? 'WIN'
        : kaprekarGameState.player.life < kaprekarGameState.com.life
            ? 'LOSE'
            : 'DRAW';
    kaprekarGameState.feedback = 'GAME OVER';
    renderKaprekarGame();
}

function retryKaprekarGame() {
    if (!kaprekarGameState) return;
    startKaprekarBoardgame(kaprekarGameState.category);
}

function closeKaprekarResult(event) {
    if (event && event.target && event.target.id !== 'kaprekar-result-overlay') return;
    const overlay = document.getElementById('kaprekar-result-overlay');
    if (!overlay) return;
    overlay.style.display = 'none';
}

function startKaprekarBoardgame(category) {
    const gameCategory = ['hair', 'face', 'mixed'].includes(category) ? category : 'mixed';
    try {
        const playerHand = createKaprekarHand(gameCategory);
        const comHand = createKaprekarHand(gameCategory, playerHand.map((card) => card.key));
        kaprekarGameState = {
            mode: 'game',
            category: gameCategory,
            revealLocks: false,
            matchIndex: 1,
            round: 1,
            locked: false,
            result: null,
            feedback: '1 경기에서 사용할 카드를 선택해 주십시오.',
            player: {
                life: KAPREKAR_MAX_LIFE,
                hand: playerHand,
                currentCard: null
            },
            com: {
                life: KAPREKAR_MAX_LIFE,
                hand: comHand,
                currentCard: null
            }
        }
        clearKaprekarTimers();
        showTab('boardgame-kaprekar-play-section');
        renderKaprekarGame();
    } catch (error) {
        console.error(error);
        alert('KAPREKAR MODE setup failed.');
    }
}
const BASEBALL_REAL_TEAM_OPTIONS = ['Arcane', 'Aurora', 'Bera', 'Croa', 'Elysium', 'Enosis', 'Eos', 'Helios', 'Luna', 'Nova', 'Red', 'Scania', 'Union', 'Zenith'];
const BASEBALL_RANDOM_TEAM_KEY = 'RANDOM';
const BASEBALL_TEAM_OPTIONS = [...BASEBALL_REAL_TEAM_OPTIONS, BASEBALL_RANDOM_TEAM_KEY];
const BASEBALL_CLEANUP_PATTERNS = [
    { key: '123', label: '1번 ~ 3번', slots: [1, 2, 3] },
    { key: '234', label: '2번 ~ 4번', slots: [2, 3, 4] },
    { key: '345', label: '3번 ~ 5번', slots: [3, 4, 5] }
];
let baseballGameState = null;
const BASEBALL_TOKEN_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BASEBALL_LIMITS = { balls: 4, strikes: 3, outs: 3 };
const BASEBALL_DEFAULT_INNINGS = 3;
const BASEBALL_FULL_INNINGS = 9;
const BASEBALL_SWING_SUCCESS = { normal: 0.24, cleanup: 0.32 };
const BASEBALL_COM_READ_CHANCE = { normal: 0.2, cleanup: 1 / 3 };
const BASEBALL_CONTACT_HIT_CHANCE = 0.85;
const BASEBALL_FASTBALL_CONTACT_HIT_CHANCE = 0.70;
const BASEBALL_HIT_TABLE = {
    normal: {
        contact: [
            { key: 'single', text: '1루타', bases: 1, chance: 0.607 },
            { key: 'double', text: '2루타', bases: 2, chance: 0.323 },
            { key: 'triple', text: '3루타', bases: 3, chance: 0.007 },
            { key: 'homerun', text: '홈런', bases: 4, chance: 0.063 }
        ],
        semiContact: [
            { key: 'single', text: '1루타', bases: 1, chance: 0.582 },
            { key: 'double', text: '2루타', bases: 2, chance: 0.336 },
            { key: 'triple', text: '3루타', bases: 3, chance: 0.007 },
            { key: 'homerun', text: '홈런', bases: 4, chance: 0.075 }
        ],
        balance: [
            { key: 'single', text: '1루타', bases: 1, chance: 0.557 },
            { key: 'double', text: '2루타', bases: 2, chance: 0.349 },
            { key: 'triple', text: '3루타', bases: 3, chance: 0.007 },
            { key: 'homerun', text: '홈런', bases: 4, chance: 0.087 }
        ],
        semiPower: [
            { key: 'single', text: '1루타', bases: 1, chance: 0.534 },
            { key: 'double', text: '2루타', bases: 2, chance: 0.359 },
            { key: 'triple', text: '3루타', bases: 3, chance: 0.007 },
            { key: 'homerun', text: '홈런', bases: 4, chance: 0.100 }
        ],
        power: [
            { key: 'single', text: '1루타', bases: 1, chance: 0.511 },
            { key: 'double', text: '2루타', bases: 2, chance: 0.369 },
            { key: 'triple', text: '3루타', bases: 3, chance: 0.007 },
            { key: 'homerun', text: '홈런', bases: 4, chance: 0.113 }
        ]
    },
    cleanup: {
        contact: [
            { key: 'single', text: '1루타', bases: 1, chance: 0.568 },
            { key: 'double', text: '2루타', bases: 2, chance: 0.345 },
            { key: 'triple', text: '3루타', bases: 3, chance: 0.013 },
            { key: 'homerun', text: '홈런', bases: 4, chance: 0.074 }
        ],
        balance: [
            { key: 'single', text: '1루타', bases: 1, chance: 0.54 },
            { key: 'double', text: '2루타', bases: 2, chance: 0.35 },
            { key: 'triple', text: '3루타', bases: 3, chance: 0.013 },
            { key: 'homerun', text: '홈런', bases: 4, chance: 0.097 }
        ],
        power: [
            { key: 'single', text: '1루타', bases: 1, chance: 0.504 },
            { key: 'double', text: '2루타', bases: 2, chance: 0.367 },
            { key: 'triple', text: '3루타', bases: 3, chance: 0.013 },
            { key: 'homerun', text: '홈런', bases: 4, chance: 0.116 }
        ]
    }
};
let baseballActionTimer = null;
let baseballEventTimer = null;
let baseballCautionTimer = null;
let baseballScoreTimer = null;
let baseballIntroTimer = null;

function getBaseballItemKey(item) {
    return [normalizeType(item && item.type), String((item && item.name) || '').trim(), String(getItemNumericCode(item) ?? '')].join('::');
}

function shuffleBaseballArray(source) {
    const array = Array.isArray(source) ? source.slice() : [];
    for (let i = array.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function getBaseballCodeString(item) {
    const code = getItemNumericCode(item);
    return code === null ? '' : String(code).padStart(5, '0');
}

function isBaseballNormalCard(item) {
    const code = getBaseballCodeString(item);
    if (!code || !code.includes('0')) return false;
    return new Set(code.split('')).size === 5;
}

function isBaseballCleanupCard(item) {
    const code = getBaseballCodeString(item);
    if (!code || !code.includes('0')) return false;
    const counts = new Map();
    code.split('').forEach((digit) => {
        counts.set(digit, (counts.get(digit) || 0) + 1);
    });
    if (counts.size !== 4) return false;
    const values = Array.from(counts.values()).sort((a, b) => b - a);
    return values[0] === 2 && values[1] === 1 && values[2] === 1 && values[3] === 1;
}

function getBaseballPlayablePool() {
    return items.filter((item) => {
        if (isQmPlaceholderItem(item)) return false;
        return getItemNumericCode(item) !== null;
    });
}

function sampleBaseballItems(source, count, usedKeys) {
    const picked = [];
    for (const item of shuffleBaseballArray(source)) {
        const key = getBaseballItemKey(item);
        if (usedKeys.has(key)) continue;
        picked.push(item);
        usedKeys.add(key);
        if (picked.length >= count) break;
    }
    return picked;
}

function createBaseballStartingHand(normalPool, cleanupPool, usedKeys) {
    const normalCards = sampleBaseballItems(normalPool, 6, usedKeys);
    const cleanupCards = sampleBaseballItems(cleanupPool, 3, usedKeys);
    return {
        normalCards,
        cleanupCards,
        allCards: shuffleBaseballArray(normalCards.concat(cleanupCards))
    };
}

function getBaseballTeamLogoAsset(team) {
    if (team === BASEBALL_RANDOM_TEAM_KEY) return 'boardgame/baseball/question.png';
    return `boardgame/baseball/Team/Logo/${team}.png`;
}

function getBaseballTeamMiniLogoAsset(team) {
    if (team === BASEBALL_RANDOM_TEAM_KEY) return 'boardgame/baseball/question.png';
    const normalized = String(team || '');
    const name = normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : '';
    return `boardgame/baseball/team/logo/mini/mini${name}.png`;
}

function getBaseballTeamCardAsset(team) {
    if (team === BASEBALL_RANDOM_TEAM_KEY) return 'boardgame/baseball/question.png';
    return `boardgame/baseball/Team/Card/${team}.png`;
}

function getBaseballTeamBackAsset(team) {
    if (team === BASEBALL_RANDOM_TEAM_KEY) return 'boardgame/baseball/question.png';
    return `boardgame/baseball/Team/Card Back/${team}Back.png`;
}

function pickRandomBaseballTeam(excludeTeam = null) {
    const pool = BASEBALL_REAL_TEAM_OPTIONS.filter((team) => team !== excludeTeam);
    const source = pool.length ? pool : BASEBALL_REAL_TEAM_OPTIONS.slice();
    return shuffleBaseballArray(source)[0] || BASEBALL_REAL_TEAM_OPTIONS[0];
}

function resolveBaseballRandomTeams(playerTeam, comTeam) {
    if (playerTeam !== BASEBALL_RANDOM_TEAM_KEY && comTeam !== BASEBALL_RANDOM_TEAM_KEY) {
        return { playerTeam, comTeam };
    }
    const playerResolved = playerTeam === BASEBALL_RANDOM_TEAM_KEY
        ? shuffleBaseballArray(BASEBALL_REAL_TEAM_OPTIONS)[0]
        : playerTeam;
    const comPool = BASEBALL_REAL_TEAM_OPTIONS.filter((team) => team !== playerResolved);
    const comResolved = comTeam === BASEBALL_RANDOM_TEAM_KEY
        ? shuffleBaseballArray(comPool.length ? comPool : BASEBALL_REAL_TEAM_OPTIONS)[0]
        : comTeam;
    return { playerTeam: playerResolved, comTeam: comResolved };
}

function getBaseballCleanupPattern(patternKey) {
    return BASEBALL_CLEANUP_PATTERNS.find((pattern) => pattern.key === patternKey) || BASEBALL_CLEANUP_PATTERNS[0];
}

function getBaseballInningsLimit() {
    if (!baseballGameState) return BASEBALL_DEFAULT_INNINGS;
    return Number(baseballGameState.inningsLimit) === BASEBALL_FULL_INNINGS ? BASEBALL_FULL_INNINGS : BASEBALL_DEFAULT_INNINGS;
}

function getBaseballCleanupCardMarkup(item, team, orderSlot) {
    const name = String((item && item.name) || '').trim() || 'UNKNOWN';
    const code = formatJokerCode(getItemNumericCode(item));
    const art = resolveItemImageSrc(item);
    const teamCard = getBaseballTeamCardAsset(team);
    return `
        <article class="baseball-cleanup-card" style="background-image: url('${teamCard}');">
            <img class="baseball-cleanup-art" src="${art}" alt="${name}">
            <div class="baseball-cleanup-name">${name}</div>
            <div class="baseball-cleanup-code">${code}</div>
        </article>
    `;
}

function renderBaseballSetup() {
    if (!baseballGameState) return;
    const teamList = document.getElementById('baseball-team-list');
    const teamNote = document.getElementById('baseball-team-note');
    const orderButtons = document.getElementById('baseball-order-buttons');
    const cleanupCards = document.getElementById('baseball-cleanup-cards');
    const summary = document.getElementById('baseball-setup-summary');
    const status = document.getElementById('baseball-setup-status');
    const inningsToggle = document.getElementById('baseball-innings-toggle-btn');
    const inningsValue = document.getElementById('baseball-innings-toggle-value');
    if (!teamList || !teamNote || !orderButtons || !cleanupCards || !summary || !status) return;

    const selectedPattern = getBaseballCleanupPattern(baseballGameState.selectedPatternKey);
    const inningsLimit = getBaseballInningsLimit();
    const orderedTeams = BASEBALL_TEAM_OPTIONS.filter((team) => team !== BASEBALL_RANDOM_TEAM_KEY);
    orderedTeams.splice(7, 0, BASEBALL_RANDOM_TEAM_KEY);

    teamList.innerHTML = orderedTeams.map((team) => `
        <button type="button" class="baseball-team-btn ${(team === BASEBALL_RANDOM_TEAM_KEY
            ? baseballGameState.playerTeamSelectionMode === 'random'
            : baseballGameState.playerTeamSelectionMode !== 'random' && team === baseballGameState.playerTeam) ? 'is-active' : ''}" onclick="selectBaseballTeam('${team}')">
            <img src="${getBaseballTeamLogoAsset(team)}" alt="${team}">
            <span>${team}</span>
        </button>
    `).join('');

    const displayPlayerTeam = baseballGameState.playerTeamSelectionMode === 'random'
        ? BASEBALL_RANDOM_TEAM_KEY
        : baseballGameState.playerTeam;
    teamNote.textContent = `PLAYER TEAM ${displayPlayerTeam} / COM TEAM ${baseballGameState.comTeam}`;

    orderButtons.innerHTML = BASEBALL_CLEANUP_PATTERNS.map((pattern) => `
        <button type="button" class="baseball-order-btn ${pattern.key === baseballGameState.selectedPatternKey ? 'is-active' : ''}" onclick="selectBaseballCleanupPattern('${pattern.key}')">${pattern.label}</button>
    `).join('');

    cleanupCards.innerHTML = baseballGameState.player.cleanupCards.map((item, index) => {
        const slot = selectedPattern.slots[index] || (index + 1);
        return getBaseballCleanupCardMarkup(item, baseballGameState.playerTeam, slot);
    }).join('');

    summary.innerHTML = `
        <span>총 9개의 카드 / </span>
        <span>노말 카드 6개 / 클린업 카드 3개</span>
        <span>클린업 순서 ${selectedPattern.label}</span>
        <span> / ${inningsLimit}이닝 기본값</span>
    `;

    status.textContent = `TEAM ${displayPlayerTeam} / 클린업 순서 ${selectedPattern.label} / ${inningsLimit} 이닝`;
    if (inningsToggle) inningsToggle.classList.toggle('is-on', inningsLimit === BASEBALL_FULL_INNINGS);
    if (inningsValue) inningsValue.textContent = inningsLimit === BASEBALL_FULL_INNINGS ? 'ON' : 'OFF';
}

function startBaseballMode() {
    const playablePool = getBaseballPlayablePool();
    const normalPool = playablePool.filter(isBaseballNormalCard);
    const cleanupPool = playablePool.filter(isBaseballCleanupCard);
    if (normalPool.length < 12 || cleanupPool.length < 6) {
        alert('BASEBALL CARD POOL IS NOT READY YET.');
        return;
    }

    const usedKeys = new Set();
    const player = createBaseballStartingHand(normalPool, cleanupPool, usedKeys);
    const com = createBaseballStartingHand(normalPool, cleanupPool, usedKeys);
    const playerTeam = pickRandomBaseballTeam();
    const comTeam = pickRandomBaseballTeam(playerTeam);

    baseballGameState = {
        mode: 'setup',
        player,
        com,
        playerTeam,
        comTeam,
        inningsLimit: BASEBALL_DEFAULT_INNINGS,
        playerTeamSelectionMode: 'random',
        playerBackAsset: getBaseballTeamBackAsset(playerTeam),
        comBackAsset: getBaseballTeamBackAsset(comTeam),
        selectedPatternKey: BASEBALL_CLEANUP_PATTERNS[0].key
    };

    renderBaseballSetup();
    showTab('boardgame-baseball-play-section');
}

function selectBaseballTeam(team) {
    if (!baseballGameState) return;
    baseballGameState.playerTeamSelectionMode = team === BASEBALL_RANDOM_TEAM_KEY ? 'random' : 'fixed';
    baseballGameState.playerTeam = team === BASEBALL_RANDOM_TEAM_KEY ? pickRandomBaseballTeam() : team;
    baseballGameState.comTeam = pickRandomBaseballTeam(baseballGameState.playerTeam);
    baseballGameState.playerBackAsset = getBaseballTeamBackAsset(baseballGameState.playerTeam);
    baseballGameState.comBackAsset = getBaseballTeamBackAsset(baseballGameState.comTeam);
    renderBaseballSetup();
}

function selectBaseballCleanupPattern(patternKey) {
    if (!baseballGameState) return;
    baseballGameState.selectedPatternKey = getBaseballCleanupPattern(patternKey).key;
    renderBaseballSetup();
}

function toggleBaseballInningsMode() {
    if (!baseballGameState || baseballGameState.mode !== 'setup') return;
    baseballGameState.inningsLimit = Number(baseballGameState.inningsLimit) === BASEBALL_FULL_INNINGS ? BASEBALL_DEFAULT_INNINGS : BASEBALL_FULL_INNINGS;
    renderBaseballSetup();
}

function getBaseballCardRole(item) {
    return isBaseballCleanupCard(item) ? 'cleanup' : 'normal';
}

function isBaseballAdjacentDigit(left, right) {
    const a = Number(left);
    const b = Number(right);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return false;
    return Math.abs(a - b) === 1 || (a === 1 && b === 9) || (a === 9 && b === 1);
}

function analyzeBaseballNonZeroDigitShape(item) {
    const code = String(getItemNumericCode(item) ?? '').trim();
    const uniqueDigits = [...new Set(code.split('').filter((digit) => digit !== '0').map((digit) => Number(digit)).filter((digit) => Number.isFinite(digit)))];
    const activeDigits = uniqueDigits.filter((digit) => uniqueDigits.some((other) => isBaseballAdjacentDigit(digit, other)));
    const activeSet = new Set(activeDigits);
    let groupCount = 0;
    const visited = new Set();

    for (const digit of activeDigits) {
        if (visited.has(digit)) continue;
        groupCount += 1;
        const stack = [digit];
        visited.add(digit);
        while (stack.length) {
            const current = stack.pop();
            uniqueDigits.forEach((other) => {
                if (!activeSet.has(other) || visited.has(other)) return;
                if (!isBaseballAdjacentDigit(current, other)) return;
                visited.add(other);
                stack.push(other);
            });
        }
    }

    return {
        uniqueDigits,
        activeDigits,
        activeCount: activeDigits.length,
        groupCount
    };
}

function getBaseballCleanupArchetype(item) {
    if (!isBaseballCleanupCard(item)) return null;
    const shape = analyzeBaseballNonZeroDigitShape(item);
    if (shape.activeCount >= 3) return 'contact';
    if (shape.activeCount >= 2) return 'balance';
    return 'power';
}

function getBaseballNormalArchetype(item) {
    if (isBaseballCleanupCard(item)) return null;
    const shape = analyzeBaseballNonZeroDigitShape(item);
    if (shape.activeCount >= 4) {
        return shape.groupCount <= 1 ? 'contact' : 'semiContact';
    }
    if (shape.activeCount >= 3) return 'balance';
    if (shape.activeCount >= 2) return 'semiPower';
    return 'power';
}

function getBaseballOtherOwner(owner) {
    return owner === 'player' ? 'com' : 'player';
}

function getBaseballOwnerLabel(owner) {
    return owner === 'player' ? 'PLAYER' : 'COM';
}

function getBaseballOwnerState(owner) {
    return baseballGameState && baseballGameState[owner] ? baseballGameState[owner] : null;
}

function clearBaseballTimers() {
    if (baseballActionTimer) { clearTimeout(baseballActionTimer); baseballActionTimer = null; }
    if (baseballEventTimer) { clearTimeout(baseballEventTimer); baseballEventTimer = null; }
    clearBaseballEventPopup();
    if (baseballCautionTimer) { clearTimeout(baseballCautionTimer); baseballCautionTimer = null; }
    if (baseballScoreTimer) { clearTimeout(baseballScoreTimer); baseballScoreTimer = null; }
    if (baseballIntroTimer) { clearTimeout(baseballIntroTimer); baseballIntroTimer = null; }
}

function getBaseballResponseDigits(item) {
    return Array.from(new Set(getBaseballCodeString(item).split('').filter((digit) => digit !== '0')));
}

function createBaseballLineup(ownerState, patternKey) {
    const pattern = getBaseballCleanupPattern(patternKey);
    const lineup = new Array(9).fill(null);
    const cleanupCards = ownerState.cleanupCards.slice();
    const normalCards = shuffleBaseballArray(ownerState.normalCards);
    pattern.slots.forEach((slot, index) => { lineup[slot - 1] = cleanupCards[index] || null; });
    let normalIndex = 0;
    for (let i = 0; i < lineup.length; i += 1) {
        if (!lineup[i]) {
            lineup[i] = normalCards[normalIndex] || null;
            normalIndex += 1;
        }
    }
    return lineup;
}

function createBaseballRunner(owner, card) {
    return { owner, card, id: `${getBaseballOwnerLabel(owner)}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}` };
}

function getBaseballCardMemoryKey(item) {
    if (!item) return '';
    return [item.type || '', item.name || '', item.code ?? '', item.img || ''].join('::');
}

function rememberBaseballPitchDigitForCard(defenseOwner, batter, digit) {
    if (!baseballGameState || defenseOwner !== 'com' || baseballGameState.difficulty !== 'hard' || !batter) return;
    const ownerState = getBaseballOwnerState('com');
    if (!ownerState) return;
    ownerState.pitchMemory = ownerState.pitchMemory || {};
    const cardKey = getBaseballCardMemoryKey(batter);
    if (!cardKey) return;
    const nextDigit = Number(digit);
    if (!Number.isFinite(nextDigit)) return;
    const existing = Array.isArray(ownerState.pitchMemory[cardKey]) ? ownerState.pitchMemory[cardKey] : [];
    if (!existing.includes(nextDigit)) existing.push(nextDigit);
    ownerState.pitchMemory[cardKey] = existing;
}

function getBaseballRunnerAsset(runner) {
    if (!runner || !baseballGameState || baseballGameState.mode !== 'game') return '';
    if (runner.owner === 'player') return baseballGameState.player.teamCardAsset;
    return baseballGameState.com.backAsset || '';
}

function getBaseballCurrentBatter() {
    if (!baseballGameState || baseballGameState.mode !== 'game') return null;
    const offense = getBaseballOwnerState(baseballGameState.offenseOwner);
    if (!offense || !Array.isArray(offense.lineup) || !offense.lineup.length) return null;
    return offense.lineup[offense.lineupIndex % offense.lineup.length] || null;
}

function renderBaseballMiniCardMarkup(item, owner, options = {}) {
    const ownerState = getBaseballOwnerState(owner);
    const reveal = options.reveal !== false;
    const large = !!options.large;
    const active = !!options.active;
    const slot = options.slot || '';
    const slotMarkup = slot ? `<span class="baseball-lineup-slot">${slot}</span>` : '';
    const backAsset = ownerState ? ownerState.backAsset : '';
    const cardAsset = ownerState ? ownerState.teamCardAsset : '';
    const cardClasses = [large ? 'baseball-play-card' : 'baseball-lineup-card'];
    if (active) cardClasses.push('is-active');
    if (!reveal) cardClasses.push('is-back');
    if (!item) return large ? `<article class="${cardClasses.join(' ')}"></article>` : `<div class="baseball-lineup-entry">${slotMarkup}<article class="${cardClasses.join(' ')}"></article></div>`;
    if (!reveal) {
        const cardMarkup = `<article class="${cardClasses.join(' ')} is-back"><div class="${large ? 'baseball-play-card-back' : 'baseball-lineup-card-back'}" style="background-image:url('${backAsset}');"></div></article>`;
        return large ? cardMarkup : `<div class="baseball-lineup-entry">${slotMarkup}${cardMarkup}</div>`;
    }
    const art = resolveItemImageSrc(item);
    const name = String((item && item.name) || '').trim() || 'UNKNOWN';
    const code = formatJokerCode(getItemNumericCode(item));
    const cardMarkup = `<article class="${cardClasses.join(' ')}" style="background-image:url('${cardAsset}');"><div class="${large ? 'baseball-play-art' : 'baseball-lineup-art'}"><img src="${art}" alt="${name}"></div><div class="${large ? 'baseball-play-name' : 'baseball-lineup-name'}">${name}</div><div class="${large ? 'baseball-play-code' : 'baseball-lineup-code'}">${code}</div></article>`;
    return large ? cardMarkup : `<div class="baseball-lineup-entry">${slotMarkup}${cardMarkup}</div>`;
}

function renderBaseballBases() {
    const first = document.getElementById('baseball-base-first');
    const second = document.getElementById('baseball-base-second');
    const third = document.getElementById('baseball-base-third');
    const homeBurst = document.getElementById('baseball-home-burst');
    if (!first || !second || !third || !homeBurst || !baseballGameState || baseballGameState.mode !== 'game') return;
    const renderRunner = (runner) => {
        if (!runner) return '';
        const isCom = runner.owner === 'com';
        return `<div class="baseball-runner-chip ${isCom ? 'is-com' : ''}" style="background-image:url('${getBaseballRunnerAsset(runner)}');"></div>`;
    };
    first.innerHTML = renderRunner(baseballGameState.bases[0]);
    second.innerHTML = renderRunner(baseballGameState.bases[1]);
    third.innerHTML = renderRunner(baseballGameState.bases[2]);
    homeBurst.innerHTML = (baseballGameState.scoringBurst || []).map((runner) => `<div class="baseball-runner-chip is-scoring ${runner.owner === 'com' ? 'is-com' : ''}" style="background-image:url('${getBaseballRunnerAsset(runner)}');"></div>`).join('');
}

function renderBaseballLineupRow(owner) {
    const root = document.getElementById(owner === 'player' ? 'baseball-player-lineup' : 'baseball-com-lineup');
    const ownerState = getBaseballOwnerState(owner);
    if (!root || !ownerState || !Array.isArray(ownerState.lineup)) return;
    root.innerHTML = ownerState.lineup.map((item, index) => renderBaseballMiniCardMarkup(item, owner, {
        reveal: owner === 'player',
        active: baseballGameState.offenseOwner === owner && ownerState.lineupIndex === index,
        slot: index + 1
    })).join('');
}

function renderBaseballPitchTypeStrip() {
    const root = document.getElementById('baseball-pitch-type-strip');
    if (!root) return;
    if (!baseballGameState || baseballGameState.mode !== 'game' || !isBaseballChaosMode()) {
        root.innerHTML = '';
        root.style.display = 'none';
        return;
    }
    const canChoose = baseballGameState.phase === 'pitch' && baseballGameState.defenseOwner === 'player' && !baseballGameState.result;
    const canTake = isBaseballPlayerSwingWindow();
    root.style.display = 'flex';
    const selected = baseballGameState.playerPitchTypeSelection === 'breaking' ? 'breaking' : 'fastball';
    const selectedDirection = getBaseballBreakingDirectionSelection();
    const canChooseBreakingDirection = canChoose && selected === 'breaking';
    root.innerHTML = `
        <div class="baseball-pitch-type-column baseball-pitch-action-column">
            <button class="baseball-pitch-type-btn" type="button" onclick="useBaseballTakePitch()" ${canTake ? '' : 'disabled'}>기다리기</button>
        </div>
        <div class="baseball-pitch-type-column baseball-pitch-choice-column">
            <div class="baseball-pitch-type-row">
                <button class="baseball-pitch-type-btn${selected === 'fastball' ? ' is-active' : ''}" type="button" onclick="setBaseballPitchType('fastball')" ${canChoose ? '' : 'disabled'}>직구</button>
                <div class="baseball-breaking-stack">
                    <button class="baseball-pitch-type-btn${selected === 'breaking' ? ' is-active' : ''}" type="button" onclick="setBaseballPitchType('breaking')" ${canChoose ? '' : 'disabled'}>변화구</button>
                    <div class="baseball-breaking-direction-row">
                        <button class="baseball-breaking-direction-btn${selectedDirection === -1 ? ' is-active' : ''}" type="button" onclick="setBaseballBreakingDirection(-1)" ${canChooseBreakingDirection ? '' : 'disabled'}>←</button>
                        <button class="baseball-breaking-direction-btn${selectedDirection === 1 ? ' is-active' : ''}" type="button" onclick="setBaseballBreakingDirection(1)" ${canChooseBreakingDirection ? '' : 'disabled'}>→</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderBaseballTokenRow() {
    const root = document.getElementById('baseball-token-row');
    if (!root || !baseballGameState || baseballGameState.mode !== 'game') return;
    const canPitch = baseballGameState.phase === 'pitch' && baseballGameState.defenseOwner === 'player';
    const canSwing = baseballGameState.phase === 'climax' && baseballGameState.offenseOwner === 'player';
    const playerCanAct = (canSwing && isBaseballPlayerSwingWindow()) || (canPitch && !baseballGameState.inputLocked);
    root.innerHTML = BASEBALL_TOKEN_VALUES.map((value) => `<button class="joker-token-btn" type="button" onclick="useBaseballToken(${value})" ${playerCanAct ? '' : 'disabled'}>${value}</button>`).join('');
}

function renderBaseballCurrentCard() {
    const root = document.getElementById('baseball-current-card-slot');
    if (!root || !baseballGameState || baseballGameState.mode !== 'game') return;
    const batter = getBaseballCurrentBatter();
    const reveal = baseballGameState.offenseOwner === 'player';
    root.innerHTML = renderBaseballMiniCardMarkup(batter, baseballGameState.offenseOwner, { reveal, large: true });
}

function renderBaseballCountLights(root, value, maxCount, tone) {
    if (!root) return;
    const safeValue = Math.max(0, Math.min(Number(value) || 0, maxCount));
    root.innerHTML = Array.from({ length: maxCount }, (_, index) => {
        const active = index < safeValue ? ' is-on' : '';
        return `<span class="baseball-count-light is-${tone}${active}"></span>`;
    }).join('');
}

function renderBaseballInningScoreboard() {
    const root = document.getElementById('baseball-inning-scoreboard-grid');
    const rowRoot = document.getElementById('baseball-inning-scoreboard-rows');
    const headRoot = document.getElementById('baseball-inning-scoreboard-head');
    const boardRoot = document.getElementById('baseball-inning-scoreboard-wrap');
    if (!root || !baseballGameState) return;
    const inningsLimit = getBaseballInningsLimit();
    const innings = Array.from({ length: inningsLimit }, (_, index) => index);
    const awayOwner = baseballGameState.awayOwner === 'com' ? 'com' : 'player';
    const homeOwner = baseballGameState.homeOwner === 'com' ? 'com' : 'player';
    const awayState = baseballGameState[awayOwner] || {};
    const homeState = baseballGameState[homeOwner] || {};
    const awayScores = Array.isArray(awayState.inningScores) ? awayState.inningScores : [];
    const homeScores = Array.isArray(homeState.inningScores) ? homeState.inningScores : [];
    if (boardRoot) boardRoot.classList.toggle('is-full', inningsLimit === BASEBALL_FULL_INNINGS);
    if (headRoot) {
        headRoot.innerHTML = `${innings.map((inning) => `<span>${inning + 1}</span>`).join('')}<span>R</span>`;
    }
    if (rowRoot) {
        rowRoot.innerHTML = `
            <img src="${getBaseballTeamMiniLogoAsset(awayState.team)}" alt="${awayState.team || 'AWAY'}">
            <img src="${getBaseballTeamMiniLogoAsset(homeState.team)}" alt="${homeState.team || 'HOME'}">
        `;
    }
    const rows = [
        [...innings.map((index) => awayScores[index] ?? 0), awayState.score ?? 0],
        [...innings.map((index) => homeScores[index] ?? 0), homeState.score ?? 0]
    ];
    root.innerHTML = rows.map((row) => row.map((value, index) => {
        const isInningCell = index < innings.length;
        const doubleDigitClass = isInningCell && String(value).length >= 2 ? ' is-double-digit' : '';
        return `<div class="baseball-inning-scoreboard-cell${doubleDigitClass}">${value}</div>`;
    }).join('')).join('');
}

function renderBaseballGame() {
    if (!baseballGameState || baseballGameState.mode !== 'game') return;
    const inningLabel = document.getElementById('baseball-inning-label');
    const homeLabel = document.getElementById('baseball-home-label');
    const guide = document.getElementById('baseball-game-guide');
    const ballCount = document.getElementById('baseball-ball-count');
    const strikeCount = document.getElementById('baseball-strike-count');
    const outCount = document.getElementById('baseball-out-count');
    const resultOverlay = document.getElementById('baseball-result-overlay');
    const playerInningPitchRow = document.getElementById('baseball-player-inning-pitch-row');
    const comInningPitchRow = document.getElementById('baseball-com-inning-pitch-row');
    const playerInningPitchCount = document.getElementById('baseball-player-inning-pitch-count');
    const comInningPitchCount = document.getElementById('baseball-com-inning-pitch-count');
    if (!inningLabel || !homeLabel || !guide || !ballCount || !strikeCount || !outCount) return;
    inningLabel.textContent = `${baseballGameState.inning} ${baseballGameState.half === 'top' ? '회초' : '회말'}`;
    homeLabel.textContent = `HOME ${getBaseballOwnerLabel(baseballGameState.homeOwner)}`;
    renderBaseballCountLights(ballCount, baseballGameState.balls, 3, 'ball');
    renderBaseballCountLights(strikeCount, baseballGameState.strikes, 2, 'strike');
    renderBaseballCountLights(outCount, baseballGameState.outs, 2, 'out');
    const offenseState = getBaseballOwnerState(baseballGameState.offenseOwner);
    const currentPitchOwner = baseballGameState.defenseOwner === 'com' ? 'com' : 'player';
    const playerPitchCountValue = Number(baseballGameState.player?.inningPitchCount) || 0;
    const comPitchCountValue = Number(baseballGameState.com?.inningPitchCount) || 0;
    const getPitchCountToneClass = (count) => count >= 31 ? 'is-danger' : (count >= 21 ? 'is-alert' : (count >= 11 ? 'is-warn' : ''));
    if (playerInningPitchCount) {
        playerInningPitchCount.textContent = String(playerPitchCountValue);
        playerInningPitchCount.className = getPitchCountToneClass(playerPitchCountValue);
    }
    if (comInningPitchCount) {
        comInningPitchCount.textContent = String(comPitchCountValue);
        comInningPitchCount.className = getPitchCountToneClass(comPitchCountValue);
    }
    if (playerInningPitchRow) playerInningPitchRow.style.display = currentPitchOwner === 'player' ? 'flex' : 'none';
    if (comInningPitchRow) comInningPitchRow.style.display = currentPitchOwner === 'com' ? 'flex' : 'none';
    if (baseballGameState.phase === 'pitch') {
        if (isBaseballChaosMode()) {
            guide.textContent = `${getBaseballOwnerLabel(baseballGameState.defenseOwner)} 투수 이닝 / ${getBaseballOwnerLabel(baseballGameState.offenseOwner)} ${offenseState.lineupIndex + 1}번 타자`;
        } else {
            guide.textContent = `${getBaseballOwnerLabel(baseballGameState.defenseOwner)} 투수 이닝 / ${getBaseballOwnerLabel(baseballGameState.offenseOwner)} ${offenseState.lineupIndex + 1}번 타자 `;
        }
    } else {
        guide.textContent = `CAUTION / ${getBaseballOwnerLabel(baseballGameState.offenseOwner)} CLIMAX`;
    }
    renderBaseballCurrentCard();
    renderBaseballLineupRow('com');
    renderBaseballLineupRow('player');
    renderBaseballPitchTypeStrip();
    renderBaseballTokenRow();
    renderBaseballBases();
    renderBaseballInningScoreboard();
    if (resultOverlay && baseballGameState.result) resultOverlay.style.display = 'flex';
}

function clearBaseballEventPopup() {
    const popup = document.getElementById('baseball-event-popup');
    if (!popup) return;
    popup.textContent = '';
    popup.className = 'baseball-event-popup';
}

function showBaseballEvent(message, tone = 'info', duration = 1150) {
    const popup = document.getElementById('baseball-event-popup');
    if (!popup) return;
    popup.textContent = message;
    popup.className = `baseball-event-popup is-visible is-${tone}`;
    if (baseballEventTimer) clearTimeout(baseballEventTimer);
    baseballEventTimer = setTimeout(() => { clearBaseballEventPopup(); }, duration);
}

function getBaseballHomeRunLabel() {
    if (!baseballGameState || !Array.isArray(baseballGameState.bases)) return '홈런';
    const runnerCount = baseballGameState.bases.filter(Boolean).length;
    if (runnerCount >= 3) return '그랜드 슬램';
    if (runnerCount === 2) return '쓰리런 홈런';
    if (runnerCount === 1) return '투런 홈런';
    return '솔로 홈런';
}

function triggerBaseballHomeRunBurst() {
    const popup = document.getElementById('baseball-event-popup');
    if (!popup) return;
    const rect = popup.getBoundingClientRect();
    const centerY = rect.top + (rect.height / 2);
    const burstPoints = [
        rect.left + 18,
        rect.right - 18
    ];

    burstPoints.forEach((x, pointIndex) => {
        for (let i = 0; i < 8; i++) {
            const star = document.createElement('div');
            star.className = 'green-star-particle';
            star.textContent = '✦';
            document.body.appendChild(star);

            const spreadBase = pointIndex === 0 ? Math.PI : 0;
            const angle = spreadBase + ((Math.random() - 0.5) * 1.3);
            const velocity = 26 + Math.random() * 28;
            const tx = Math.cos(angle) * velocity;
            const ty = Math.sin(angle) * velocity;

            star.style.left = `${x}px`;
            star.style.top = `${centerY}px`;
            star.style.setProperty('--tx', `${tx}px`);
            star.style.setProperty('--ty', `${ty}px`);
            star.addEventListener('animationend', () => star.remove());
        }
    });
}

function showBaseballVsIntro() {
    if (!baseballGameState) return;
    const overlay = document.getElementById('baseball-vs-overlay');
    const playerLogo = document.getElementById('baseball-vs-player-logo');
    const comLogo = document.getElementById('baseball-vs-com-logo');
    const playerSide = document.getElementById('baseball-vs-player-side');
    const comSide = document.getElementById('baseball-vs-com-side');
    if (!overlay || !playerLogo || !comLogo || !playerSide || !comSide) return;
    playerLogo.src = getBaseballTeamLogoAsset(baseballGameState.player.team);
    comLogo.src = getBaseballTeamLogoAsset(baseballGameState.com.team);
    playerSide.textContent = baseballGameState.homeOwner === 'player' ? 'HOME' : 'AWAY';
    comSide.textContent = baseballGameState.homeOwner === 'com' ? 'HOME' : 'AWAY';
    overlay.classList.add('is-visible');
}

function hideBaseballVsIntro(delay = 0) {
    const overlay = document.getElementById('baseball-vs-overlay');
    if (!overlay) return;
    if (baseballIntroTimer) clearTimeout(baseballIntroTimer);
    baseballIntroTimer = setTimeout(() => { overlay.classList.remove('is-visible'); }, delay);
}

function showBaseballCaution() {
    const overlay = document.getElementById('baseball-caution-overlay');
    if (!overlay) return;
    if (baseballCautionTimer) clearTimeout(baseballCautionTimer);
    overlay.classList.add('is-visible');
}

function hideBaseballCaution(delay = 450) {
    const overlay = document.getElementById('baseball-caution-overlay');
    if (!overlay) return;
    if (baseballCautionTimer) clearTimeout(baseballCautionTimer);
    baseballCautionTimer = setTimeout(() => { overlay.classList.remove('is-visible'); }, delay);
}

function resetBaseballPitchState() {
    baseballGameState.balls = 0;
    baseballGameState.strikes = 0;
    clearBaseballCurrentPitchContext();
    hideBaseballCaution(0);
}

function clearBaseballCurrentPitchContext() {
    baseballGameState.phase = 'pitch';
    baseballGameState.currentPitchDigit = null;
    baseballGameState.currentClimaxDigit = null;
    baseballGameState.currentPitchType = 'fastball';
    baseballGameState.currentPitchInZone = true;
    baseballGameState.comPitchFocusDigit = null;
    baseballGameState.inputLocked = false;
}

function advanceBaseballBatter(owner) {
    const ownerState = getBaseballOwnerState(owner);
    if (!ownerState || !ownerState.lineup.length) return;
    const currentBatter = ownerState.lineup[ownerState.lineupIndex % ownerState.lineup.length] || null;
    const currentKey = getBaseballCardMemoryKey(currentBatter);
    ownerState.atBatCounts = ownerState.atBatCounts || {};
    if (currentKey) {
        ownerState.atBatCounts[currentKey] = (ownerState.atBatCounts[currentKey] || 0) + 1;
    }
    ownerState.lineupIndex = (ownerState.lineupIndex + 1) % ownerState.lineup.length;
    baseballGameState.currentAtBatKnownDigits = [];
    baseballGameState.comPitchFocusDigit = null;
}

function updateBaseballHalfOwners() {
    baseballGameState.offenseOwner = baseballGameState.half === 'top' ? baseballGameState.awayOwner : baseballGameState.homeOwner;
    baseballGameState.defenseOwner = getBaseballOtherOwner(baseballGameState.offenseOwner);
}

function getBaseballRandomDigit(excluded) {
    const pool = BASEBALL_TOKEN_VALUES.filter((value) => value !== excluded);
    return pool[Math.floor(Math.random() * pool.length)];
}

function isBaseballChaosMode() {
    return !!baseballGameState && baseballGameState.difficulty === 'hard';
}

function getBaseballShiftedDigit(value, delta) {
    const base = Number(value);
    if (!Number.isFinite(base)) return Number(value) || 1;
    return ((base - 1 + delta + 9) % 9) + 1;
}

function getBaseballBreakingDigit(value, explicitDirection = null) {
    const direction = explicitDirection === -1 || explicitDirection === 1
        ? explicitDirection
        : (Math.random() < 0.5 ? 1 : -1);
    return getBaseballShiftedDigit(value, direction);
}

function chooseBaseballComPitchType() {
    if (!isBaseballChaosMode()) return 'fastball';
    return Math.random() < 0.4 ? 'fastball' : 'breaking';
}

function getBaseballPitchControlChance(owner) {
    if (!baseballGameState || baseballGameState.mode !== 'game' || !isBaseballChaosMode()) return 1;
    const ownerState = baseballGameState[owner === 'com' ? 'com' : 'player'] || {};
    const pitchCount = Number(ownerState.inningPitchCount) || 0;
    if (pitchCount <= 10) return 0.9;
    if (pitchCount <= 20) return 0.75;
    if (pitchCount <= 30) return 0.6;
    return 0.45;
}

function setBaseballPitchType(type) {
    if (!baseballGameState || baseballGameState.mode !== 'game' || !isBaseballChaosMode()) return;
    if (baseballGameState.phase !== 'pitch' || baseballGameState.defenseOwner !== 'player' || baseballGameState.result) return;
    baseballGameState.playerPitchTypeSelection = type === 'breaking' ? 'breaking' : 'fastball';
    renderBaseballGame();
}

function getBaseballBreakingDirectionSelection() {
    if (!baseballGameState) return Math.random() < 0.5 ? 1 : -1;
    return baseballGameState.playerBreakingDirectionSelection === -1 ? -1 : 1;
}

function setBaseballBreakingDirection(direction) {
    if (!baseballGameState || baseballGameState.mode !== 'game' || !isBaseballChaosMode()) return;
    if (baseballGameState.phase !== 'pitch' || baseballGameState.defenseOwner !== 'player' || baseballGameState.result) return;
    baseballGameState.playerBreakingDirectionSelection = direction === -1 ? -1 : 1;
    renderBaseballGame();
}

function getBaseballActiveTargetDigit() {
    const shifted = Number(baseballGameState && baseballGameState.currentClimaxDigit);
    if (Number.isFinite(shifted)) return shifted;
    return Number(baseballGameState && baseballGameState.currentPitchDigit);
}

function getBaseballComReadablePitchDigit() {
    const rawPitchDigit = Number(baseballGameState && baseballGameState.currentPitchDigit);
    if (isBaseballChaosMode() && baseballGameState && baseballGameState.defenseOwner === 'player' && Number.isFinite(rawPitchDigit)) {
        return rawPitchDigit;
    }
    return getBaseballActiveTargetDigit();
}

function getBaseballComPitchGuess() {
    const knownDigits = Array.from(new Set(Array.isArray(baseballGameState.currentAtBatKnownDigits) ? baseballGameState.currentAtBatKnownDigits.slice() : []));
    const setFocusDigit = (digit) => {
        const nextDigit = Number(digit);
        baseballGameState.comPitchFocusDigit = Number.isFinite(nextDigit) ? nextDigit : null;
        return nextDigit;
    };
    const resolveFocusedKnownDigit = () => {
        const storedFocus = Number(baseballGameState.comPitchFocusDigit);
        if (Number.isFinite(storedFocus) && knownDigits.includes(storedFocus)) {
            return storedFocus;
        }
        if (!knownDigits.length) {
            baseballGameState.comPitchFocusDigit = null;
            return null;
        }
        return setFocusDigit(knownDigits[Math.floor(Math.random() * knownDigits.length)]);
    };
    if (baseballGameState.balls >= 3 && knownDigits.length) {
        const focusDigit = resolveFocusedKnownDigit();
        if (baseballGameState.strikes >= 2 && knownDigits.length > 1) {
            const otherDigits = knownDigits.filter((digit) => Number(digit) !== Number(focusDigit));
            if (otherDigits.length && Math.random() < 0.20) {
                return setFocusDigit(otherDigits[Math.floor(Math.random() * otherDigits.length)]);
            }
        }
        return setFocusDigit(focusDigit);
    }
    if (baseballGameState.difficulty === 'hard') {
        if (knownDigits.length >= 4) {
            const lockedDigit = knownDigits[Math.floor(Math.random() * knownDigits.length)];
            return setFocusDigit(lockedDigit);
        }
        const batter = getBaseballCurrentBatter();
        const batterKey = getBaseballCardMemoryKey(batter);
        const offenseState = getBaseballOwnerState(baseballGameState.offenseOwner);
        const comState = getBaseballOwnerState('com');
        const atBatCounts = offenseState && offenseState.atBatCounts ? offenseState.atBatCounts : {};
        const pitchMemory = comState && comState.pitchMemory ? comState.pitchMemory : {};
        const rememberedDigits = batterKey && Array.isArray(pitchMemory[batterKey]) ? pitchMemory[batterKey].slice() : [];
        const mergedDigits = Array.from(new Set([...knownDigits, ...rememberedDigits]));
        const canUseCurrentAtBatMemory = knownDigits.length > 0;
        const canUseStoredMemory = (atBatCounts[batterKey] || 0) >= 1 && rememberedDigits.length > 0;
        if ((canUseCurrentAtBatMemory || canUseStoredMemory) && mergedDigits.length && Math.random() < 0.7) {
            const rememberedDigit = mergedDigits[Math.floor(Math.random() * mergedDigits.length)];
            return setFocusDigit(rememberedDigit);
        }
    }
    baseballGameState.comPitchFocusDigit = null;
    return getBaseballRandomDigit(null);
}

function getBaseballComSwingGuess() {
    const batter = getBaseballCurrentBatter();
    const currentPitch = getBaseballComReadablePitchDigit();
    const digits = getBaseballResponseDigits(batter);
    const role = getBaseballCardRole(batter);
    if (baseballGameState.difficulty === 'hard' && digits.length) {
        if (isBaseballChaosMode() && baseballGameState.defenseOwner === 'player' && Number.isFinite(currentPitch)) {
            const guessedPitchType = Math.random() < 0.4 ? 'fastball' : 'breaking';
            let targetDigit = currentPitch;
            if (guessedPitchType === 'breaking') {
                targetDigit = Math.random() < 0.5
                    ? getBaseballShiftedDigit(currentPitch, 1)
                    : getBaseballShiftedDigit(currentPitch, -1);
            }
            if (digits.includes(String(targetDigit))) return targetDigit;
            return Number(digits[Math.floor(Math.random() * digits.length)]);
        }
        if (Number.isFinite(currentPitch) && digits.includes(String(currentPitch))) {
            const roll = Math.random();
            if (roll < 0.4) return currentPitch;
            if (roll < 0.7) return getBaseballShiftedDigit(currentPitch, 1);
            return getBaseballShiftedDigit(currentPitch, -1);
        }
        return Number(digits[Math.floor(Math.random() * digits.length)]);
    }
    if (baseballGameState.difficulty === 'normal' && digits.length) {
        return Number(digits[Math.floor(Math.random() * digits.length)]);
    }
    if (digits.includes(String(currentPitch)) && Math.random() < BASEBALL_SWING_SUCCESS[role]) return currentPitch;
    return getBaseballRandomDigit(currentPitch);
}

function queueBaseballActor() {
    if (!baseballGameState || baseballGameState.mode !== 'game' || baseballGameState.result) return;
    if (baseballActionTimer) { clearTimeout(baseballActionTimer); baseballActionTimer = null; }
    if (baseballGameState.phase === 'pitch' && baseballGameState.defenseOwner === 'com') {
        baseballActionTimer = setTimeout(() => {
            baseballActionTimer = null;
            const comPitchType = chooseBaseballComPitchType();
            handleBaseballPitchGuess(getBaseballComPitchGuess(), 'com', comPitchType);
        }, 1400);
        return;
    }
    if (baseballGameState.phase === 'climax' && baseballGameState.offenseOwner === 'com') {
        baseballActionTimer = setTimeout(() => {
            baseballActionTimer = null;
            if (Math.random() < getBaseballTakePitchChance()) {
                handleBaseballTakePitch('com');
                return;
            }
            handleBaseballBatterGuess(getBaseballComSwingGuess(), 'com');
        }, 1500);
    }
}

function isBaseballPlayerSwingWindow() {
    return !!baseballGameState
        && baseballGameState.mode === 'game'
        && !baseballGameState.result
        && baseballGameState.phase === 'climax'
        && baseballGameState.offenseOwner === 'player'
        && Number.isFinite(Number(baseballGameState.currentPitchDigit))
        && !baseballActionTimer;
}

function getBaseballTakePitchChance() {
    if (!baseballGameState || baseballGameState.mode !== 'game') return 0;
    if (baseballGameState.balls === 3 && baseballGameState.strikes === 0) return 0.5;
    const pitcherState = getBaseballOwnerState(baseballGameState.defenseOwner);
    const pitchCount = Number(pitcherState?.inningPitchCount) || 0;
    if (pitchCount <= 10) return 0.10;
    if (pitchCount <= 20) return 0.25;
    if (pitchCount <= 30) return 0.40;
    return 0.55;
}

function useBaseballToken(value) {
    if (!baseballGameState || baseballGameState.mode !== 'game' || baseballGameState.result) return;
    if (baseballGameState.inputLocked && !isBaseballPlayerSwingWindow()) return;
    if (baseballGameState.phase === 'pitch' && baseballGameState.defenseOwner === 'player') {
        handleBaseballPitchGuess(value, 'player');
        return;
    }
    if (baseballGameState.phase === 'climax' && baseballGameState.offenseOwner === 'player') {
        handleBaseballBatterGuess(value, 'player');
    }
}

function handleBaseballTakePitch(owner) {
    if (!baseballGameState || baseballGameState.mode !== 'game' || baseballGameState.result) return;
    if (baseballGameState.phase !== 'climax' || owner !== baseballGameState.offenseOwner) return;
    if (owner === 'player' && !isBaseballPlayerSwingWindow()) return;
    if (owner === 'player') baseballGameState.inputLocked = true;
    const inZone = baseballGameState.currentPitchInZone !== false;
    hideBaseballCaution(520);
    if (!inZone) {
        baseballGameState.balls += 1;
        showBaseballEvent('BALL', 'ball', 850);
        renderBaseballGame();
        if (baseballGameState.balls >= BASEBALL_LIMITS.balls) {
            baseballActionTimer = setTimeout(() => {
                showBaseballEvent('볼넷', 'info', 1000);
                processBaseballWalk();
            }, 880);
            return;
        }
        baseballActionTimer = setTimeout(() => {
            if (!baseballGameState || baseballGameState.mode !== 'game' || baseballGameState.result) return;
            clearBaseballCurrentPitchContext();
            renderBaseballGame();
            queueBaseballActor();
        }, 880);
        return;
    }
    baseballGameState.strikes += 1;
    showBaseballEvent('STRIKE', 'out', 900);
    renderBaseballGame();
    baseballActionTimer = setTimeout(() => {
        if (!baseballGameState || baseballGameState.mode !== 'game') return;
        if (baseballGameState.strikes >= BASEBALL_LIMITS.strikes) {
            recordBaseballStrikeout(baseballGameState.offenseOwner, baseballGameState.defenseOwner);
            recordBaseballPitchingOuts(baseballGameState.defenseOwner, 1);
            baseballGameState.outs += 1;
            showBaseballEvent('OUT', 'out', 950);
            renderBaseballGame();
            baseballActionTimer = setTimeout(() => { finalizeBaseballOut(); }, 900);
            return;
        }
        clearBaseballCurrentPitchContext();
            renderBaseballGame();
            queueBaseballActor();
    }, 900);
}

function useBaseballTakePitch() {
    handleBaseballTakePitch('player');
}

function createBaseballStatLine() {
    return {
        batting: {
            atBats: 0,
            hits: 0,
            walks: 0,
            strikeouts: 0,
            singles: 0,
            doubles: 0,
            triples: 0,
            homeRuns: 0,
            totalBases: 0,
            sacFlies: 0
        },
        pitching: {
            outsRecorded: 0,
            hitsAllowed: 0,
            errors: 0,
            walksAllowed: 0,
            strikeouts: 0,
            earnedRunsAllowed: 0,
            totalPitchCount: 0
        }
    };
}

function ensureBaseballStats(owner) {
    const ownerState = getBaseballOwnerState(owner);
    if (!ownerState) return null;
    ownerState.stats = ownerState.stats || createBaseballStatLine();
    ownerState.stats.batting = ownerState.stats.batting || createBaseballStatLine().batting;
    ownerState.stats.pitching = ownerState.stats.pitching || createBaseballStatLine().pitching;
    ownerState.stats.pitching.totalPitchCount = Number(ownerState.stats.pitching.totalPitchCount) || 0;
    return ownerState.stats;
}

function incrementBaseballPitchCount(owner) {
    const ownerState = getBaseballOwnerState(owner);
    if (!ownerState) return;
    ownerState.inningPitchCount = (Number(ownerState.inningPitchCount) || 0) + 1;
    const stats = ensureBaseballStats(owner);
    if (!stats) return;
    stats.pitching.totalPitchCount = (Number(stats.pitching.totalPitchCount) || 0) + 1;
}

function resetBaseballInningPitchCounts() {
    ['player', 'com'].forEach((owner) => {
        const ownerState = getBaseballOwnerState(owner);
        if (!ownerState) return;
        ownerState.inningPitchCount = 0;
    });
}

function recordBaseballPitchingOuts(owner, count = 1) {
    const stats = ensureBaseballStats(owner);
    if (!stats) return;
    stats.pitching.outsRecorded += count;
}

function recordBaseballBatterAtBat(owner, options = {}) {
    const stats = ensureBaseballStats(owner);
    if (!stats) return;
    stats.batting.atBats += 1;
    if (options.strikeout) stats.batting.strikeouts += 1;
}

function recordBaseballWalkStats(batterOwner, pitcherOwner) {
    const batterStats = ensureBaseballStats(batterOwner);
    const pitcherStats = ensureBaseballStats(pitcherOwner);
    if (batterStats) batterStats.batting.walks += 1;
    if (pitcherStats) pitcherStats.pitching.walksAllowed += 1;
}

function recordBaseballHitStats(batterOwner, pitcherOwner, outcome) {
    const batterStats = ensureBaseballStats(batterOwner);
    const pitcherStats = ensureBaseballStats(pitcherOwner);
    if (batterStats) {
        batterStats.batting.atBats += 1;
        batterStats.batting.hits += 1;
        batterStats.batting.totalBases += outcome.bases;
        if (outcome.key === 'single') batterStats.batting.singles += 1;
        else if (outcome.key === 'double') batterStats.batting.doubles += 1;
        else if (outcome.key === 'triple') batterStats.batting.triples += 1;
        else if (outcome.key === 'homerun') batterStats.batting.homeRuns += 1;
    }
    if (pitcherStats) {
        pitcherStats.pitching.hitsAllowed += 1;
    }
}

function recordBaseballSacFly(owner) {
    const stats = ensureBaseballStats(owner);
    if (!stats) return;
    stats.batting.sacFlies += 1;
}

function recordBaseballStrikeout(batterOwner, pitcherOwner) {
    const batterStats = ensureBaseballStats(batterOwner);
    const pitcherStats = ensureBaseballStats(pitcherOwner);
    if (batterStats) {
        batterStats.batting.atBats += 1;
        batterStats.batting.strikeouts += 1;
    }
    if (pitcherStats) pitcherStats.pitching.strikeouts += 1;
}

function recordBaseballError(defenseOwner) {
    const defenseStats = ensureBaseballStats(defenseOwner);
    if (!defenseStats) return;
    defenseStats.pitching.errors += 1;
}

function formatBaseballStatRate(numerator, denominator, digits = 3) {
    if (!denominator) return '0.000';
    return (numerator / denominator).toFixed(digits);
}

function formatBaseballEra(earnedRuns, outsRecorded) {
    if (!outsRecorded) return earnedRuns > 0 ? 'INF' : '0.00';
    return ((earnedRuns * 27) / outsRecorded).toFixed(2);
}

function formatBaseballWhip(hitsAllowed, walksAllowed, outsRecorded) {
    if (!outsRecorded) return (hitsAllowed + walksAllowed) > 0 ? 'INF' : '0.00';
    return (((hitsAllowed + walksAllowed) * 3) / outsRecorded).toFixed(2);
}

function formatBaseballKbb(strikeouts, walksAllowed) {
    if (!walksAllowed) return strikeouts > 0 ? 'INF' : '0.00';
    return (strikeouts / walksAllowed).toFixed(2);
}

function getBaseballRecordStats(owner) {
    const stats = ensureBaseballStats(owner) || createBaseballStatLine();
    const batting = stats.batting;
    const pitching = stats.pitching;
    const atBats = batting.atBats;
    const obpDenominator = batting.atBats + batting.walks + batting.sacFlies;
    const average = atBats ? batting.hits / atBats : 0;
    const onBase = obpDenominator ? (batting.hits + batting.walks) / obpDenominator : 0;
    const slugging = atBats ? batting.totalBases / atBats : 0;
    return {
        pitching: {
            era: formatBaseballEra(pitching.earnedRunsAllowed, pitching.outsRecorded),
            hitsAllowed: String(pitching.hitsAllowed),
            errors: String(pitching.errors || 0),
            strikeouts: String(pitching.strikeouts),
            kbb: formatBaseballKbb(pitching.strikeouts, pitching.walksAllowed),
            whip: formatBaseballWhip(pitching.hitsAllowed, pitching.walksAllowed, pitching.outsRecorded)
        },
        batting: {
            hits: String(batting.hits),
            homeRuns: String(batting.homeRuns),
            walks: String(batting.walks),
            average: average.toFixed(3),
            onBase: onBase.toFixed(3),
            slugging: slugging.toFixed(3),
            ops: (onBase + slugging).toFixed(3)
        }
    };
}

function scoreBaseballRunner(runner) {
    const ownerState = getBaseballOwnerState(runner.owner);
    if (!ownerState) return;
    ownerState.score += 1;
    const defenseStats = ensureBaseballStats(getBaseballOtherOwner(runner.owner));
    if (defenseStats) defenseStats.pitching.earnedRunsAllowed += 1;
    const inningsLimit = getBaseballInningsLimit();
    ownerState.inningScores = Array.isArray(ownerState.inningScores) ? ownerState.inningScores : Array.from({ length: inningsLimit }, () => 0);
    const inningIndex = Math.max(0, Math.min(inningsLimit - 1, (Number(baseballGameState?.inning) || 1) - 1));
    ownerState.inningScores[inningIndex] = (ownerState.inningScores[inningIndex] || 0) + 1;
}

function maybeFinishBaseballWalkOff() {
    if (!baseballGameState || baseballGameState.mode !== 'game') return false;
    if (baseballGameState.inning !== getBaseballInningsLimit() || baseballGameState.half !== 'bottom') return false;
    const homeState = getBaseballOwnerState(baseballGameState.homeOwner);
    const awayState = getBaseballOwnerState(baseballGameState.awayOwner);
    if (!homeState || !awayState) return false;
    if (homeState.score > awayState.score) {
        finishBaseballGame();
        return true;
    }
    return false;
}

function triggerBaseballScoreBurst(scoredRunners) {
    if (!baseballGameState || !scoredRunners.length) return;
    baseballGameState.scoringBurst = scoredRunners.slice();
    renderBaseballGame();
    if (baseballScoreTimer) clearTimeout(baseballScoreTimer);
    baseballScoreTimer = setTimeout(() => {
        if (!baseballGameState || baseballGameState.mode !== 'game') return;
        baseballGameState.scoringBurst = [];
        renderBaseballGame();
    }, 720);
}

function advanceBaseballRunnersByHit(baseCount, batterOwner, batterCard) {
    const nextBases = [null, null, null];
    const scored = [];
    baseballGameState.bases.forEach((runner, index) => {
        if (!runner) return;
        const target = index + 1 + baseCount;
        if (target > 3) scored.push(runner);
        else nextBases[target - 1] = runner;
    });
    const batterRunner = createBaseballRunner(batterOwner, batterCard);
    if (baseCount >= 4) scored.push(batterRunner);
    else nextBases[baseCount - 1] = batterRunner;
    baseballGameState.bases = nextBases;
    scored.forEach(scoreBaseballRunner);
    if (maybeFinishBaseballWalkOff()) return true;
    triggerBaseballScoreBurst(scored);
    return false;
}

function advanceBaseballRunnersByWalk(batterOwner, batterCard) {
    const bases = baseballGameState.bases.slice();
    const scored = [];
    if (bases[0] && bases[1] && bases[2]) { scored.push(bases[2]); bases[2] = null; }
    if (bases[0] && bases[1]) { bases[2] = bases[1]; bases[1] = null; }
    if (bases[0]) { bases[1] = bases[0]; bases[0] = null; }
    bases[0] = createBaseballRunner(batterOwner, batterCard);
    baseballGameState.bases = bases;
    scored.forEach(scoreBaseballRunner);
    if (maybeFinishBaseballWalkOff()) return true;
    triggerBaseballScoreBurst(scored);
    return false;
}

function applyBaseballDoublePlayBaseState(scoredRunner = null) {
    const runnerOnSecond = baseballGameState.bases[1];
    const canAdvanceSecondToThird = baseballGameState.outs === 0 && !!runnerOnSecond && (!baseballGameState.bases[2] || !!scoredRunner);

    baseballGameState.bases[0] = null;
    if (scoredRunner) {
        baseballGameState.bases[2] = null;
    }
    if (canAdvanceSecondToThird) {
        baseballGameState.bases[2] = runnerOnSecond;
        baseballGameState.bases[1] = null;
    }
}

function applyBaseballSecondRunnerOutBaseState(batterOwner, batterCard) {
    const runnerOnThird = baseballGameState.bases[2];
    const runnerOnSecond = baseballGameState.bases[1];

    baseballGameState.bases[0] = createBaseballRunner(batterOwner, batterCard);
    baseballGameState.bases[1] = null;

    if (runnerOnThird) {
        baseballGameState.bases[2] = runnerOnThird;
        return;
    }
    baseballGameState.bases[2] = runnerOnSecond || null;
}

function maybeAdvanceBaseballRunnerFromSecondToThird(chance) {
    if (!baseballGameState || baseballGameState.outs > 1) return false;
    if (!baseballGameState.bases[1] || baseballGameState.bases[2]) return false;
    if (Math.random() >= chance) return false;
    baseballGameState.bases[2] = baseballGameState.bases[1];
    baseballGameState.bases[1] = null;
    return true;
}

function rollBaseballHitType(item) {
    const role = getBaseballCardRole(item);
    const table = role === 'cleanup'
        ? (BASEBALL_HIT_TABLE.cleanup[getBaseballCleanupArchetype(item)] || BASEBALL_HIT_TABLE.cleanup.balance)
        : (BASEBALL_HIT_TABLE.normal[getBaseballNormalArchetype(item)] || BASEBALL_HIT_TABLE.normal.balance || []);
    let roll = Math.random();
    for (const outcome of table) {
        roll -= outcome.chance;
        if (roll <= 0) return outcome;
    }
    return table[table.length - 1];
}

function finishBaseballGame() {
    if (!baseballGameState || baseballGameState.mode !== 'game') return;
    clearBaseballTimers();
    const resultTitle = document.getElementById('baseball-result-title');
    const resultScore = document.getElementById('baseball-result-score');
    const resultPitches = document.getElementById('baseball-result-pitches');
    const overlay = document.getElementById('baseball-result-overlay');
    const playerScore = baseballGameState.player.score;
    const comScore = baseballGameState.com.score;
    baseballGameState.result = playerScore > comScore ? 'WIN' : playerScore < comScore ? 'LOSE' : 'DRAW';
    if (resultTitle) resultTitle.textContent = baseballGameState.result;
    if (resultScore) resultScore.textContent = `PLAYER ${playerScore} : ${comScore} COM`;
    if (resultPitches) resultPitches.textContent = `TOTAL PITCHES · PLAYER ${Number(baseballGameState.player?.stats?.pitching?.totalPitchCount) || 0} / COM ${Number(baseballGameState.com?.stats?.pitching?.totalPitchCount) || 0}`;
    if (overlay) overlay.style.display = 'flex';
    renderBaseballGame();
}

function maybeFinishBaseballGame() {
    if (!baseballGameState || baseballGameState.mode !== 'game') return true;
    if (baseballGameState.inning === getBaseballInningsLimit() && baseballGameState.half === 'top' && baseballGameState.outs >= BASEBALL_LIMITS.outs) {
        const homeScore = getBaseballOwnerState(baseballGameState.homeOwner).score;
        const awayScore = getBaseballOwnerState(baseballGameState.awayOwner).score;
        if (homeScore > awayScore) { finishBaseballGame(); return true; }
    }
    if (baseballGameState.inning === getBaseballInningsLimit() && baseballGameState.half === 'bottom' && baseballGameState.outs >= BASEBALL_LIMITS.outs) {
        finishBaseballGame();
        return true;
    }
    return false;
}

function advanceBaseballHalfInning() {
    baseballGameState.bases = [null, null, null];
    baseballGameState.scoringBurst = [];
    if (maybeFinishBaseballGame()) return;
    if (baseballGameState.half === 'top') baseballGameState.half = 'bottom';
    else { baseballGameState.inning += 1; baseballGameState.half = 'top'; resetBaseballInningPitchCounts(); }
    baseballGameState.outs = 0;
    resetBaseballPitchState();
    updateBaseballHalfOwners();
    renderBaseballGame();
    showBaseballEvent('INNING CHANGE', 'info', 1000);
    queueBaseballActor();
}

function finalizeBaseballOut() {
    advanceBaseballBatter(baseballGameState.offenseOwner);
    if (baseballGameState.outs >= BASEBALL_LIMITS.outs) {
        advanceBaseballHalfInning();
        return;
    }
    resetBaseballPitchState();
    renderBaseballGame();
    queueBaseballActor();
}

function processBaseballGroundOut(options = {}) {
    const allowError = options.allowError !== false;
    if (allowError && Math.random() < 0.02) {
        const batter = getBaseballCurrentBatter();
        recordBaseballBatterAtBat(baseballGameState.offenseOwner);
        recordBaseballError(baseballGameState.defenseOwner);
        showBaseballEvent('실책', 'info', 1050);
        hideBaseballCaution(520);
        renderBaseballGame();
        baseballActionTimer = setTimeout(() => {
            if (!baseballGameState || baseballGameState.mode !== 'game') return;
            if (advanceBaseballRunnersByHit(1, baseballGameState.offenseOwner, batter)) return;
            advanceBaseballBatter(baseballGameState.offenseOwner);
            resetBaseballPitchState();
            renderBaseballGame();
            queueBaseballActor();
        }, 920);
        return;
    }
    const batter = getBaseballCurrentBatter();
    const hasRunnerOnFirst = !!baseballGameState.bases[0];
    const canDoublePlay = hasRunnerOnFirst && baseballGameState.outs <= 1;
    if (!canDoublePlay) {
        recordBaseballBatterAtBat(baseballGameState.offenseOwner);
        recordBaseballPitchingOuts(baseballGameState.defenseOwner, 1);
        baseballGameState.outs += 1;
        const advancedRunner = maybeAdvanceBaseballRunnerFromSecondToThird(0.3);
        showBaseballEvent('땅볼 아웃', 'out', 980);
        hideBaseballCaution(520);
        renderBaseballGame();
        if (advancedRunner) {
            baseballActionTimer = setTimeout(() => {
                if (!baseballGameState || baseballGameState.mode !== 'game') return;
                showBaseballEvent('2루 주자 진루', 'info', 900);
                renderBaseballGame();
                baseballActionTimer = setTimeout(() => { finalizeBaseballOut(); }, 680);
            }, 520);
            return;
        }
        baseballActionTimer = setTimeout(() => { finalizeBaseballOut(); }, 920);
        return;
    }

    if (Math.random() < 0.1) {
        recordBaseballBatterAtBat(baseballGameState.offenseOwner);
        recordBaseballPitchingOuts(baseballGameState.defenseOwner, 1);
        applyBaseballSecondRunnerOutBaseState(baseballGameState.offenseOwner, batter);
        baseballGameState.outs += 1;
        showBaseballEvent('2루 주자 아웃', 'out', 1020);
        hideBaseballCaution(520);
        renderBaseballGame();
        baseballActionTimer = setTimeout(() => { finalizeBaseballOut(); }, 920);
        return;
    }

    const canScoreFromThird = baseballGameState.outs === 0
        && !!baseballGameState.bases[2]
        && Math.random() < 0.5;
    const scoredRunner = canScoreFromThird ? baseballGameState.bases[2] : null;

    recordBaseballBatterAtBat(baseballGameState.offenseOwner);
    recordBaseballPitchingOuts(baseballGameState.defenseOwner, 2);
    applyBaseballDoublePlayBaseState(scoredRunner);
    baseballGameState.outs += 2;
    showBaseballEvent('병살타', 'out', 1080);
    hideBaseballCaution(520);
    renderBaseballGame();

    if (scoredRunner) {
        baseballActionTimer = setTimeout(() => {
            if (!baseballGameState || baseballGameState.mode !== 'game') return;
            scoreBaseballRunner(scoredRunner);
            triggerBaseballScoreBurst([scoredRunner]);
            showBaseballEvent('3루 주자 득점', 'hit', 900);
            renderBaseballGame();
            if (maybeFinishBaseballWalkOff()) return;
            baseballActionTimer = setTimeout(() => { finalizeBaseballOut(); }, 680);
        }, 520);
        return;
    }

    baseballActionTimer = setTimeout(() => { finalizeBaseballOut(); }, 920);
}

function processBaseballFlyOut(options = {}) {
    const allowError = options.allowError !== false;
    if (allowError && Math.random() < 0.02) {
        const batter = getBaseballCurrentBatter();
        recordBaseballBatterAtBat(baseballGameState.offenseOwner);
        recordBaseballError(baseballGameState.defenseOwner);
        showBaseballEvent('실책', 'info', 1050);
        hideBaseballCaution(520);
        renderBaseballGame();
        baseballActionTimer = setTimeout(() => {
            if (!baseballGameState || baseballGameState.mode !== 'game') return;
            if (advanceBaseballRunnersByHit(1, baseballGameState.offenseOwner, batter)) return;
            advanceBaseballBatter(baseballGameState.offenseOwner);
            resetBaseballPitchState();
            renderBaseballGame();
            queueBaseballActor();
        }, 920);
        return;
    }
    const canSacrificeFly = !!baseballGameState.bases[2] && baseballGameState.outs <= 1 && Math.random() < 0.7;
    if (canSacrificeFly) {
        const scoredRunner = baseballGameState.bases[2];
        baseballGameState.bases[2] = null;
        scoreBaseballRunner(scoredRunner);
        recordBaseballSacFly(baseballGameState.offenseOwner);
        recordBaseballPitchingOuts(baseballGameState.defenseOwner, 1);
        baseballGameState.outs += 1;
        showBaseballEvent('희생 플라이', 'hit', 1080);
        hideBaseballCaution(520);
        triggerBaseballScoreBurst([scoredRunner]);
        renderBaseballGame();
        if (maybeFinishBaseballWalkOff()) return;
        baseballActionTimer = setTimeout(() => { finalizeBaseballOut(); }, 920);
        return;
    }
    recordBaseballBatterAtBat(baseballGameState.offenseOwner);
    recordBaseballPitchingOuts(baseballGameState.defenseOwner, 1);
    baseballGameState.outs += 1;
    const advancedRunner = maybeAdvanceBaseballRunnerFromSecondToThird(0.5);
    showBaseballEvent('뜬공 아웃', 'out', 980);
    hideBaseballCaution(520);
    renderBaseballGame();
    if (advancedRunner) {
        baseballActionTimer = setTimeout(() => {
            if (!baseballGameState || baseballGameState.mode !== 'game') return;
            showBaseballEvent('2루 주자 진루', 'info', 900);
            renderBaseballGame();
            baseballActionTimer = setTimeout(() => { finalizeBaseballOut(); }, 680);
        }, 520);
        return;
    }
    baseballActionTimer = setTimeout(() => { finalizeBaseballOut(); }, 920);
}

function processBaseballWalk() {
    const batter = getBaseballCurrentBatter();
    recordBaseballWalkStats(baseballGameState.offenseOwner, baseballGameState.defenseOwner);
    if (advanceBaseballRunnersByWalk(baseballGameState.offenseOwner, batter)) return;
    advanceBaseballBatter(baseballGameState.offenseOwner);
    resetBaseballPitchState();
    renderBaseballGame();
    queueBaseballActor();
}

function processBaseballHit(outcome) {
    const batter = getBaseballCurrentBatter();
    recordBaseballHitStats(baseballGameState.offenseOwner, baseballGameState.defenseOwner, outcome);
    if (advanceBaseballRunnersByHit(outcome.bases, baseballGameState.offenseOwner, batter)) return;
    advanceBaseballBatter(baseballGameState.offenseOwner);
    resetBaseballPitchState();
    renderBaseballGame();
    queueBaseballActor();
}

function processBaseballDefensiveGem(outcome) {
    const isHomeRunRobbery = outcome && outcome.key === 'homerun';
    const canGemDoublePlay = outcome && outcome.key === 'single' && !!baseballGameState?.bases?.[0] && baseballGameState.outs <= 1 && Math.random() < 0.5;
    showBaseballEvent('호수비', 'info', 820);
    createBaseballDefensiveGemBurst(document.querySelector('#boardgame-baseball-game-section .baseball-main-board'));
    hideBaseballCaution(520);
    renderBaseballGame();
    baseballActionTimer = setTimeout(() => {
        if (!baseballGameState || baseballGameState.mode !== 'game') return;
        if (isHomeRunRobbery) {
            processBaseballFlyOut({ allowError: false });
            return;
        }
        if (canGemDoublePlay) {
            const canScoreFromThird = baseballGameState.outs === 0
                && !!baseballGameState.bases[2]
                && Math.random() < 0.5;
            const scoredRunner = canScoreFromThird ? baseballGameState.bases[2] : null;
            recordBaseballBatterAtBat(baseballGameState.offenseOwner);
            recordBaseballPitchingOuts(baseballGameState.defenseOwner, 2);
            applyBaseballDoublePlayBaseState(scoredRunner);
            baseballGameState.outs += 2;
            showBaseballEvent('병살타', 'out', 1080);
            renderBaseballGame();
            if (scoredRunner) {
                baseballActionTimer = setTimeout(() => {
                    if (!baseballGameState || baseballGameState.mode !== 'game') return;
                    scoreBaseballRunner(scoredRunner);
                    triggerBaseballScoreBurst([scoredRunner]);
                    showBaseballEvent('3루 주자 득점', 'hit', 900);
                    renderBaseballGame();
                    if (maybeFinishBaseballWalkOff()) return;
                    baseballActionTimer = setTimeout(() => { finalizeBaseballOut(); }, 680);
                }, 520);
                return;
            }
            baseballActionTimer = setTimeout(() => { finalizeBaseballOut(); }, 920);
            return;
        }
        recordBaseballBatterAtBat(baseballGameState.offenseOwner);
        recordBaseballPitchingOuts(baseballGameState.defenseOwner, 1);
        baseballGameState.outs += 1;
        showBaseballEvent('아웃', 'out', 950);
        renderBaseballGame();
        baseballActionTimer = setTimeout(() => { finalizeBaseballOut(); }, 900);
    }, 620);
}

function handleBaseballPitchGuess(value, owner, explicitPitchType = null) {
    if (!baseballGameState || baseballGameState.mode !== 'game' || baseballGameState.result) return;
    if (baseballGameState.phase !== 'pitch' || owner !== baseballGameState.defenseOwner) return;
    if (owner === 'player' && baseballGameState.inputLocked) return;
    incrementBaseballPitchCount(owner);
    const batter = getBaseballCurrentBatter();
    if (!batter) return;
    if (owner === 'player') baseballGameState.inputLocked = true;
    const code = getBaseballCodeString(batter);
    if (code.includes(String(value))) {
        const baseDigit = Number(value);
        const chaosPitchType = isBaseballChaosMode()
            ? ((explicitPitchType || (owner === 'player' ? baseballGameState.playerPitchTypeSelection : 'fastball')) === 'breaking' ? 'breaking' : 'fastball')
            : 'fastball';
        const pitchInZone = !isBaseballChaosMode() || Math.random() < getBaseballPitchControlChance(owner);
        baseballGameState.currentPitchDigit = baseDigit;
        baseballGameState.currentPitchType = chaosPitchType;
        baseballGameState.currentPitchInZone = pitchInZone;
        baseballGameState.currentClimaxDigit = chaosPitchType === 'breaking'
            ? getBaseballBreakingDigit(baseDigit, owner === 'player' ? getBaseballBreakingDirectionSelection() : null)
            : baseDigit;
        baseballGameState.currentAtBatKnownDigits = Array.isArray(baseballGameState.currentAtBatKnownDigits) ? baseballGameState.currentAtBatKnownDigits : [];
        if (!baseballGameState.currentAtBatKnownDigits.includes(baseDigit)) {
            baseballGameState.currentAtBatKnownDigits.push(baseDigit);
        }
        rememberBaseballPitchDigitForCard(owner, batter, value);
        baseballGameState.phase = 'climax';
        baseballGameState.inputLocked = false;
        showBaseballCaution();
        renderBaseballGame();
        queueBaseballActor();
        return;
    }
    baseballGameState.balls += 1;
    showBaseballEvent('BALL', 'ball', 850);
    renderBaseballGame();
    if (baseballGameState.balls >= BASEBALL_LIMITS.balls) {
        baseballActionTimer = setTimeout(() => {
            showBaseballEvent('볼넷', 'info', 1000);
            processBaseballWalk();
        }, 880);
        return;
    }
    if (baseballGameState.defenseOwner === 'com') {
        baseballActionTimer = setTimeout(() => { queueBaseballActor(); }, 980);
    } else {
        baseballActionTimer = setTimeout(() => {
            if (!baseballGameState || baseballGameState.mode !== 'game' || baseballGameState.result) return;
            baseballGameState.inputLocked = false;
            renderBaseballGame();
        }, 880);
    }
}

function handleBaseballBatterGuess(value, owner) {
    if (!baseballGameState || baseballGameState.mode !== 'game' || baseballGameState.result) return;
    if (baseballGameState.phase !== 'climax' || owner !== baseballGameState.offenseOwner) return;
    if (owner === 'player' && baseballGameState.inputLocked && !isBaseballPlayerSwingWindow()) return;
        const pitchDigit = getBaseballActiveTargetDigit();
    if (owner === 'player') baseballGameState.inputLocked = true;
    const guessDigit = Number(value);
    const matched = guessDigit === pitchDigit;
    const pitchInZone = baseballGameState.currentPitchInZone !== false;
    const groundOutDigit = getBaseballShiftedDigit(pitchDigit, 1);
    const flyOutDigit = getBaseballShiftedDigit(pitchDigit, -1);
    if (!matched) {
        if (pitchInZone && (guessDigit === groundOutDigit || guessDigit === flyOutDigit)) {
            if (Math.random() < 0.3) {
                if (baseballGameState.strikes < (BASEBALL_LIMITS.strikes - 1)) baseballGameState.strikes += 1;
                if (baseballGameState.strikes > (BASEBALL_LIMITS.strikes - 1)) baseballGameState.strikes = BASEBALL_LIMITS.strikes - 1;
                showBaseballEvent('FOUL', 'foul', 950);
                hideBaseballCaution(520);
                baseballActionTimer = setTimeout(() => {
                    baseballGameState.phase = 'pitch';
                    baseballGameState.currentPitchDigit = null;
                    baseballGameState.currentClimaxDigit = null;
                    baseballGameState.currentPitchType = 'fastball';
                        baseballGameState.comPitchFocusDigit = null;
    baseballGameState.inputLocked = false;
                    renderBaseballGame();
                    queueBaseballActor();
                }, 920);
                renderBaseballGame();
                return;
            }
            if (guessDigit === groundOutDigit) processBaseballGroundOut();
            else processBaseballFlyOut();
            return;
        }
        baseballGameState.strikes += 1;
        showBaseballEvent('STRIKE', 'out', 900);
        hideBaseballCaution(520);
        renderBaseballGame();
        baseballActionTimer = setTimeout(() => {
            if (!baseballGameState || baseballGameState.mode !== 'game') return;
            if (baseballGameState.strikes >= BASEBALL_LIMITS.strikes) {
                recordBaseballStrikeout(baseballGameState.offenseOwner, baseballGameState.defenseOwner);
                recordBaseballPitchingOuts(baseballGameState.defenseOwner, 1);
                baseballGameState.outs += 1;
                showBaseballEvent('OUT', 'out', 950);
                renderBaseballGame();
                baseballActionTimer = setTimeout(() => { finalizeBaseballOut(); }, 900);
                return;
            }
            baseballGameState.phase = 'pitch';
            baseballGameState.currentPitchDigit = null;
            baseballGameState.currentClimaxDigit = null;
            baseballGameState.currentPitchType = 'fastball';
                baseballGameState.comPitchFocusDigit = null;
    baseballGameState.inputLocked = false;
            renderBaseballGame();
            queueBaseballActor();
        }, 900);
        return;
    }
    const contactHitChance = baseballGameState.currentPitchType === 'fastball'
        ? BASEBALL_FASTBALL_CONTACT_HIT_CHANCE
        : BASEBALL_CONTACT_HIT_CHANCE;
    if (Math.random() > contactHitChance) {
        if (baseballGameState.strikes < (BASEBALL_LIMITS.strikes - 1)) baseballGameState.strikes += 1;
        if (baseballGameState.strikes > (BASEBALL_LIMITS.strikes - 1)) baseballGameState.strikes = BASEBALL_LIMITS.strikes - 1;
        showBaseballEvent('FOUL', 'foul', 950);
        hideBaseballCaution(520);
        baseballActionTimer = setTimeout(() => {
            baseballGameState.phase = 'pitch';
            baseballGameState.currentPitchDigit = null;
            baseballGameState.currentClimaxDigit = null;
            baseballGameState.currentPitchType = 'fastball';
                baseballGameState.comPitchFocusDigit = null;
    baseballGameState.inputLocked = false;
            renderBaseballGame();
            queueBaseballActor();
        }, 920);
        renderBaseballGame();
        return;
    }
    const hitOutcome = rollBaseballHitType(getBaseballCurrentBatter());
    const defensiveGemChance = hitOutcome.key === 'homerun'
        ? 0.05
        : (isBaseballChaosMode() ? 0.10 : 0.20);
    if (Math.random() < defensiveGemChance) {
        processBaseballDefensiveGem(hitOutcome);
        return;
    }
    const hitMessage = hitOutcome.key === 'homerun' ? getBaseballHomeRunLabel() : hitOutcome.text;
    showBaseballEvent(hitMessage, 'hit', 1100);
    if (hitOutcome.key === 'homerun') triggerBaseballHomeRunBurst();
    hideBaseballCaution(520);
    baseballActionTimer = setTimeout(() => { processBaseballHit(hitOutcome); }, 920);
    renderBaseballGame();
}

function confirmBaseballSetup() {
    if (!baseballGameState || baseballGameState.mode !== 'setup') return;
    openBaseballDifficultyModal();
}

function openBaseballDifficultyModal() {
    const overlay = document.getElementById('baseball-difficulty-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
}

function closeBaseballDifficultyModal(event) {
    if (event && event.target && event.target.id !== 'baseball-difficulty-overlay') return;
    const overlay = document.getElementById('baseball-difficulty-overlay');
    if (!overlay) return;
    overlay.style.display = 'none';
}

function formatBaseballGuidePercent(value) {
    return `${(value * 100).toFixed(1)}%`;
}

function getBaseballGuideHitRows(tableGroup, cardType = 'normal') {
    return Object.entries(tableGroup).map(([key, outcomes]) => {
        const single = outcomes.find((item) => item.key === 'single')?.chance || 0;
        const doubleHit = outcomes.find((item) => item.key === 'double')?.chance || 0;
        const triple = outcomes.find((item) => item.key === 'triple')?.chance || 0;
        const homerun = outcomes.find((item) => item.key === 'homerun')?.chance || 0;
        const labelMap = cardType === 'cleanup'
            ? {
                contact: '교타형 (1 차이나는 숫자가 3가지)',
                balance: '밸런스형 (1 차이나는 숫자가 2가지)',
                power: '거포형 (1 차이나는 숫자가 없는 경우)'
            }
            : {
                contact: '교타형 (1 차이나는 숫자가 4가지 + 1쌍 구조)',
                semiContact: '준교타형 (1 차이나는 숫자가 4가지 + 2쌍 구조)',
                balance: '밸런스형 (1 차이나는 숫자가 3가지)',
                semiPower: '준거포형 (1 차이나는 숫자가 2가지)',
                power: '거포형 (1 차이나는 숫자가 없는 경우)'
            };
        return `
            <div class="baseball-guide-list">
                <span><strong>${labelMap[key] || key}</strong></span>
                <span>1B ${formatBaseballGuidePercent(single)}</span>
                <span>2B ${formatBaseballGuidePercent(doubleHit)}</span>
                <span>3B ${formatBaseballGuidePercent(triple)}</span>
                <span>HR ${formatBaseballGuidePercent(homerun)}</span>
            </div>
        `;
    }).join('');
}

function renderBaseballGuideContent() {
    const root = document.getElementById('baseball-guide-content');
    if (!root) return;

    root.innerHTML = `
        <div class="baseball-guide-section">
            <strong>일반 확률 가이드</strong>
            <div class="baseball-guide-list">
                <span>직구 적중 타격 확률</span>
                <span>안타 ${formatBaseballGuidePercent(BASEBALL_FASTBALL_CONTACT_HIT_CHANCE)}</span>
                <span>파울 ${formatBaseballGuidePercent(1 - BASEBALL_FASTBALL_CONTACT_HIT_CHANCE)}</span>
            </div>
            <div class="baseball-guide-list">
                <span>변화구 적중 타격 확률</span>
                <span>안타 ${formatBaseballGuidePercent(BASEBALL_CONTACT_HIT_CHANCE)}</span>
                <span>파울 ${formatBaseballGuidePercent(1 - BASEBALL_CONTACT_HIT_CHANCE)}</span>
            </div>
            <div class="baseball-guide-list">
                <span>일반 카드 숫자 법칙</span>
                <span>아이템 코드 0 제외</span>
                <span>적중 숫자 4개</span>
            </div>
            <div class="baseball-guide-list">
                <span>클린업 카드 숫자 법칙</span>
                <span>아이템 코드 0 제외</span>
                <span>적중 숫자 3개</span>
            </div>
            <div class="baseball-guide-list">
                <span>변동 숫자 확률 (+1 / -1)</span>
                <span>파울 30.0%</span>
                <span>땅볼 아웃(+1) / 뜬공 아웃(-1) 70.0%</span>
            </div>
            <div class="baseball-guide-list">
                <span>기본 병살타 확률</span>
                <span>땅볼 아웃 + 1루 주자</span>
                <span>90.0%</span>
            </div>
            <div class="baseball-guide-list">
                <span>희생 플라이 확률</span>
                <span>3루 주자 + 1아웃 이하</span>
                <span>70.0%</span>
            </div>
            <div class="baseball-guide-list">
                <span>호수비 확률</span>
                <span>1루타 / 2루타 / 3루타 일반 20.0% · CHAOS 10.0%</span>
                <span>홈런 5.0%</span>
            </div>
            <div class="baseball-guide-list">
                <span>필드 내 실책 확률</span>
                <span>2.0%</span>
                <span>1루타 허용</span>
            </div>
            <div class="baseball-guide-list">
                <span>호수비 이후 병살타 확률</span>
                <span>50.0%</span>
                <span>1아웃 이하에서 주자 1루시 발동</span>
            </div>
        </div>
        <div class="baseball-guide-section">
            <strong>CHAOS 모드 확률</strong>
            <div class="baseball-guide-list">
                <span>COM 투구 구종 선택</span>
                <span>직구 40.0%</span>
                <span>변화구 60.0%</span>
            </div>
            <div class="baseball-guide-list">
                <span>COM 타격 갈래 (적중 숫자 기준)</span>
                <span>적중 숫자 40.0%</span>
                <span>+1 타격 30.0% / -1 타격 30.0%</span>
            </div>
            <div class="baseball-guide-list">
                <span>변화구 목표 숫자</span>
                <span>원래 적중 숫자 사용 없음</span>
                <span>+1 50.0% / -1 50.0%</span>
            </div>
            <div class="baseball-guide-list">
                <span>COM 투수 적중 숫자 기억</span>
                <span>기억 숫자 활용 70.0%</span>
                <span>나머지 30.0%는 기존 랜덤</span>
            </div>
            <div class="baseball-guide-list">
                <span>COM 투수 적중 숫자 완전 발견</span>
                <span>일반 카드 4개 발견시 100.0%</span>
                <span>적중 숫자 중에서만 선택</span>
            </div>
            <div class="baseball-guide-list">
                <span>COM 투수 풀카운트 보정</span>
                <span>볼카운트 3 이상시 현재 적중 숫자 우선 100.0%</span>
                <span>3볼 2스트라이크시 선택 숫자 유지 80.0% / 다른 적중 숫자 20.0%</span>
            </div>
        </div>
        <div class="baseball-guide-section">
            <strong>일반 카드 타격 비율</strong>
            ${getBaseballGuideHitRows(BASEBALL_HIT_TABLE.normal, 'normal')}
            
        </div>
        <div class="baseball-guide-section">
            <strong>클린업 카드 타격 비율</strong>
            ${getBaseballGuideHitRows(BASEBALL_HIT_TABLE.cleanup, 'cleanup')}
            
        </div>
    `;
}

function openBaseballGuideModal() {
    const overlay = document.getElementById('baseball-guide-overlay');
    if (!overlay) return;
    renderBaseballGuideContent();
    overlay.style.display = 'flex';
}

function closeBaseballGuideModal(event) {
    if (event && event.target && event.target.id !== 'baseball-guide-overlay') return;
    const overlay = document.getElementById('baseball-guide-overlay');
    if (!overlay) return;
    overlay.style.display = 'none';
}

function renderBaseballRecordContent() {
    const root = document.getElementById('baseball-record-content');
    if (!root || !baseballGameState || baseballGameState.mode !== 'game') return;
    const playerStats = getBaseballRecordStats('player');
    const comStats = getBaseballRecordStats('com');
    const renderGrid = (title, playerValues, comValues) => `
        <div class="baseball-guide-section">
            <strong>${title}</strong>
            <div class="baseball-record-grid">
                <div></div>
                <div class="baseball-record-head">PLAYER</div>
                <div class="baseball-record-head">COM</div>
                ${playerValues.map((item, index) => `
                    <div class="baseball-record-label">${item.label}</div>
                    <div class="baseball-record-value">${item.value}</div>
                    <div class="baseball-record-value">${comValues[index].value}</div>
                `).join('')}
            </div>
        </div>
    `;
    const pitchingRows = [
        { label: 'ERA', value: playerStats.pitching.era },
        { label: 'H', value: playerStats.pitching.hitsAllowed },
        { label: 'E', value: playerStats.pitching.errors },
        { label: 'SO', value: playerStats.pitching.strikeouts },
        { label: 'K/BB', value: playerStats.pitching.kbb },
        { label: 'WHIP', value: playerStats.pitching.whip }
    ];
    const comPitchingRows = [
        { label: 'ERA', value: comStats.pitching.era },
        { label: 'H', value: comStats.pitching.hitsAllowed },
        { label: 'E', value: comStats.pitching.errors },
        { label: 'SO', value: comStats.pitching.strikeouts },
        { label: 'K/BB', value: comStats.pitching.kbb },
        { label: 'WHIP', value: comStats.pitching.whip }
    ];
    const battingRows = [
        { label: 'H', value: playerStats.batting.hits },
        { label: 'HR', value: playerStats.batting.homeRuns },
        { label: 'BB', value: playerStats.batting.walks },
        { label: 'AVG', value: playerStats.batting.average },
        { label: 'OBP', value: playerStats.batting.onBase },
        { label: 'SLG', value: playerStats.batting.slugging },
        { label: 'OPS', value: playerStats.batting.ops }
    ];
    const comBattingRows = [
        { label: 'H', value: comStats.batting.hits },
        { label: 'HR', value: comStats.batting.homeRuns },
        { label: 'BB', value: comStats.batting.walks },
        { label: 'AVG', value: comStats.batting.average },
        { label: 'OBP', value: comStats.batting.onBase },
        { label: 'SLG', value: comStats.batting.slugging },
        { label: 'OPS', value: comStats.batting.ops }
    ];
    root.innerHTML = `
        ${renderGrid('PITCHING', pitchingRows, comPitchingRows)}
        ${renderGrid('BATTING', battingRows, comBattingRows)}
    `;
}

function openBaseballRecordModal() {
    const overlay = document.getElementById('baseball-record-overlay');
    if (!overlay) return;
    renderBaseballRecordContent();
    overlay.style.display = 'flex';
}

function closeBaseballRecordModal(event) {
    if (event && event.target && event.target.id !== 'baseball-record-overlay') return;
    const overlay = document.getElementById('baseball-record-overlay');
    if (!overlay) return;
    overlay.style.display = 'none';
}

function startBaseballGameWithDifficulty(difficulty) {
    if (!baseballGameState || baseballGameState.mode !== 'setup') return;
    closeBaseballDifficultyModal();
    clearBaseballTimers();
    const setupState = baseballGameState;
    const inningsLimit = Number(setupState.inningsLimit) === BASEBALL_FULL_INNINGS ? BASEBALL_FULL_INNINGS : BASEBALL_DEFAULT_INNINGS;
    const resolvedTeams = resolveBaseballRandomTeams(setupState.playerTeam, setupState.comTeam);
    const homeOwner = Math.random() < 0.5 ? 'player' : 'com';
    const awayOwner = getBaseballOtherOwner(homeOwner);
    const playerPatternKey = setupState.selectedPatternKey;
    const comPatternKey = shuffleBaseballArray(BASEBALL_CLEANUP_PATTERNS)[0].key;
    baseballGameState = {
        mode: 'game',
        difficulty: difficulty === 'hard' ? 'hard' : (difficulty === 'normal' ? 'normal' : 'easy'),
        playerPitchTypeSelection: 'fastball',
        playerBreakingDirectionSelection: Math.random() < 0.5 ? -1 : 1,
        currentPitchType: 'fastball',
        currentPitchInZone: true,
        currentClimaxDigit: null,
        comPitchFocusDigit: null,
        inningsLimit,
        homeOwner,
        awayOwner,
        inning: 1,
        half: 'top',
        offenseOwner: awayOwner,
        defenseOwner: homeOwner,
        balls: 0,
        strikes: 0,
        outs: 0,
        phase: 'pitch',
        currentPitchDigit: null,
        inputLocked: false,
        currentAtBatKnownDigits: [],
        bases: [null, null, null],
        scoringBurst: [],
        result: null,
        player: {
            team: resolvedTeams.playerTeam,
            teamCardAsset: getBaseballTeamCardAsset(resolvedTeams.playerTeam),
            backAsset: getBaseballTeamBackAsset(resolvedTeams.playerTeam),
            normalCards: setupState.player.normalCards.slice(),
            cleanupCards: setupState.player.cleanupCards.slice(),
            selectedPatternKey: playerPatternKey,
            lineup: [],
            lineupIndex: 0,
            score: 0,
            inningScores: Array.from({ length: inningsLimit }, () => 0),
            inningPitchCount: 0,
            atBatCounts: {},
            pitchMemory: {},
            stats: createBaseballStatLine()
        },
        com: {
            team: resolvedTeams.comTeam,
            teamCardAsset: getBaseballTeamCardAsset(resolvedTeams.comTeam),
            backAsset: getBaseballTeamBackAsset(resolvedTeams.comTeam),
            normalCards: setupState.com.normalCards.slice(),
            cleanupCards: setupState.com.cleanupCards.slice(),
            selectedPatternKey: comPatternKey,
            lineup: [],
            lineupIndex: 0,
            score: 0,
            inningScores: Array.from({ length: inningsLimit }, () => 0),
            inningPitchCount: 0,
            atBatCounts: {},
            pitchMemory: {},
            stats: createBaseballStatLine()
        }
    };
    baseballGameState.player.lineup = createBaseballLineup(baseballGameState.player, baseballGameState.player.selectedPatternKey);
    baseballGameState.com.lineup = createBaseballLineup(baseballGameState.com, baseballGameState.com.selectedPatternKey);
    baseballGameState.currentAtBatKnownDigits = [];
    clearBaseballEventPopup();
    const overlay = document.getElementById('baseball-result-overlay');
    if (overlay) overlay.style.display = 'none';
    closeBaseballRecordModal();
    renderBaseballGame();
    showTab('boardgame-baseball-game-section');
    showBaseballVsIntro();
    hideBaseballVsIntro(1600);
    baseballActionTimer = setTimeout(() => {
        if (!baseballGameState || baseballGameState.mode !== 'game') return;
        queueBaseballActor();
    }, 1650);
}

function openBaseballHowToImage() {
    return false;
}

function startQuinter9Boardgame(category) {
    alert('준비 중입니다.');
}

const BLOSSOM_STARTING_LIFE = 5000;
const BLOSSOM_STARTING_HAND = 5;
const BLOSSOM_CARDS_PER_SEASON = 6;
const BLOSSOM_DRAW_FAIL_DAMAGE = 1000;
const BLOSSOM_SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const BLOSSOM_DEVLOCK_PASSWORD = '13427728';
let blossomModeDeveloperUnlocked = false;
const BLOSSOM_SEASON_LABELS = {
    spring: '봄',
    summer: '여름',
    autumn: '가을',
    winter: '겨울'
};
const BLOSSOM_STAGE_BACKGROUNDS = {
    spring: "url('boardgame/blossom/stage/Spring%20Background.png')",
    summer: "url('boardgame/blossom/stage/Summer%20Background.png')",
    autumn: "url('boardgame/blossom/stage/Autumn%20Background.png')",
    winter: "url('boardgame/blossom/stage/Winter%20Background.png')"
};
const BLOSSOM_STAGE_CENTER_OFFSETS = {
    spring: { x: '50%', y: '50%' },
    summer: { x: '50.8%', y: '50%' },
    autumn: { x: '50%', y: '50%' },
    winter: { x: '50%', y: '50%' }
};
const BLOSSOM_CARD_FRAMES = {
    spring: "url('boardgame/blossom/card/spring.png')",
    summer: "url('boardgame/blossom/card/summer.png')",
    autumn: "url('boardgame/blossom/card/autumn.png')",
    winter: "url('boardgame/blossom/card/winter.png')"
};
const BLOSSOM_EFFECTS = {
    1: { name: '입춘', season: 'spring', effectType: '간섭형', text: '자신의 공격 카드 공격력을 1턴만 2배로 조정' },
    2: { name: '우수', season: 'spring', effectType: '즉발형', text: '이 카드가 파괴되었을 때 생존 점수 감소 무력화' },
    3: { name: '경칩', season: 'spring', effectType: '간섭형', text: '자신의 수비 카드 수비력을 1턴만 2배로 조정' },
    4: { name: '춘분', season: 'spring', effectType: '선택형', text: '패 1장을 버리고 카드 1장 드로우' },
    5: { name: '청명', season: 'spring', effectType: '즉발형', text: '파괴 시 생존 점수 감소량 50% 적용' },
    6: { name: '곡우', season: 'spring', effectType: '선택형', text: '필드의 모든 공격/수비 카드를 파괴' },
    7: { name: '입하', season: 'summer', effectType: '선택형', text: '상대 수비 카드의 공격력과 수비력을 맞바꾼다' },
    8: { name: '소만', season: 'summer', effectType: '간섭형', text: '상대 카드 절기 선택형 효과 1회 무효' },
    9: { name: '망종', season: 'summer', effectType: '즉발형', text: '유리 상성 공격 시 공격력 3배, 공격 후 파괴' },
    10: { name: '하지', season: 'summer', effectType: '선택형', text: '자신의 수비력을 1턴만 공격력에 합산' },
    11: { name: '소서', season: 'summer', effectType: '선택형', text: '상대 패 1장 랜덤 파괴' },
    12: { name: '대서', season: 'summer', effectType: '즉발형', text: '패의 여름 카드 수만큼 여름 카드 공격력/수비력 +300' },
    13: { name: '입추', season: 'autumn', effectType: '간섭형', text: '패 1장을 버리고 절기 카드 효과 무효화' },
    14: { name: '처서', season: 'autumn', effectType: '즉발형', text: '파괴 시 해당 영역에 패의 카드 즉시 배치 가능' },
    15: { name: '백로', season: 'autumn', effectType: '선택형', text: '자신의 공격력을 1턴만 수비력에 합산' },
    16: { name: '추분', season: 'autumn', effectType: '선택형', text: '생존 점수 절반 이하일 경우 카드 1장 드로우' },
    17: { name: '한로', season: 'autumn', effectType: '즉발형', text: '상대 상성 효과로 인한 공격력 증가 무효' },
    18: { name: '상강', season: 'autumn', effectType: '즉발형', text: '필드에 있는 동안 매 턴 상대 수비력 -100' },
    19: { name: '입동', season: 'winter', effectType: '즉발형', text: '배치된 턴 포함 2턴 동안 양쪽 모두 공격 선언 불가' },
    20: { name: '소설', season: 'winter', effectType: '즉발형', text: '매 턴 공격력 -100 / 수비력 +100, 공격력 0이면 파괴' },
    21: { name: '대설', season: 'winter', effectType: '즉발형', text: '수비 카드 파괴 시 겨울 카드 수만큼 추가 피해' },
    22: { name: '동지', season: 'winter', effectType: '즉발형', text: '공격 선언하지 않은 상대 공격 카드를 턴 종료 후 파괴' },
    23: { name: '소한', season: 'winter', effectType: '즉발형', text: '수비 카드 파괴 시 상대 공격 카드 공격력 감소' },
    24: { name: '대한', season: 'winter', effectType: '선택형', text: '필드의 겨울 카드 수만큼 상대 패를 1장씩 랜덤 파괴' }
};
let blossomGameState = null;
let blossomComTurnTimer = null;
let blossomEffectTimer = null;
let blossomEffectNoticeTimer = null;
let blossomCardUid = 1;

function getBlossomStageTerms(season) {
    return Object.values(BLOSSOM_EFFECTS).filter((effect) => effect && effect.season === season);
}

function pickRandomBlossomStage() {
    const season = BLOSSOM_SEASONS[Math.floor(Math.random() * BLOSSOM_SEASONS.length)] || 'spring';
    const terms = getBlossomStageTerms(season);
    const pickedTerm = terms.length ? terms[Math.floor(Math.random() * terms.length)] : null;
    return {
        season,
        seasonLabel: BLOSSOM_SEASON_LABELS[season] || season,
        termName: pickedTerm ? pickedTerm.name : `${BLOSSOM_SEASON_LABELS[season] || season} 절기`,
        background: BLOSSOM_STAGE_BACKGROUNDS[season] || ''
    };
}

function getBlossomCardCategory(item) {
    return normalizeType(item && item.type).includes('face') ? 'face' : 'hair';
}

function getBlossomSeasonFrame(season) {
    return BLOSSOM_CARD_FRAMES[season] || BLOSSOM_CARD_FRAMES.spring;
}

function getBlossomStageAccent(season) {
    switch (season) {
        case 'spring':
            return '#eadb83';
        case 'summer':
            return '#83d6f1';
        case 'autumn':
            return '#f0a25a';
        case 'winter':
            return '#d9dde3';
        default:
            return '#eadb83';
    }
}

function getBlossomCodeString(item) {
    const code = getBaseballCodeString(item);
    if (!code) return '';
    const normalized = String(code).padStart(5, '0').slice(0, 5);
    return getBlossomCardCategory(item) === 'face'
        ? `${normalized.slice(0, 2)}0${normalized.slice(3, 5)}`
        : `${normalized.slice(0, 4)}0`;
}

function isBlossomDeadCode(code) {
    return /^(\d)\1{3}$/.test(String(code || ''));
}

function getBlossomDigitSum(code) {
    return String(code || '').split('').reduce((sum, digit) => sum + Number(digit), 0);
}

function getBlossomSeasonBySum(sum) {
    if (sum >= 1 && sum <= 6) return 'spring';
    if (sum >= 7 && sum <= 12) return 'summer';
    if (sum >= 13 && sum <= 18) return 'autumn';
    if (sum >= 19 && sum <= 24) return 'winter';
    return '';
}

function getBlossomItemKey(item) {
    return `${getBlossomCardCategory(item)}:${normalizeType(item && item.type)}:${String((item && item.name) || '').trim()}:${getBlossomCodeString(item)}`;
}

function getBlossomPlayablePool() {
    if (typeof items === 'undefined' || !Array.isArray(items)) return [];
    const seen = new Set();
    return items
        .filter((item) => {
            const type = normalizeType(item && item.type);
            return (type.includes('hair') || type.includes('face'))
                && !isQmPlaceholderItem(item)
                && getItemNumericCode(item) !== null;
        })
        .map((item) => {
            const code = getBlossomCodeString(item);
            if (!code || code.length !== 5 || isBlossomDeadCode(code)) return null;
            const sum = getBlossomDigitSum(code);
            if (sum < 1 || sum > 24) return null;
            const key = getBlossomItemKey(item);
            if (seen.has(key)) return null;
            seen.add(key);
            const season = getBlossomSeasonBySum(sum);
            const effect = BLOSSOM_EFFECTS[sum];
            return {
                key,
                item,
                code,
                sum,
                season,
                seasonLabel: BLOSSOM_SEASON_LABELS[season] || '',
                attack: Number(code.slice(0, 2)) * 10,
                defense: Number(code.slice(2, 4)) * 10,
                imgSrc: resolveItemImageSrc(item),
                termName: effect ? effect.name : `절기 ${sum}`,
                effectType: effect ? effect.effectType : '선택형',
                effectText: effect ? effect.text : ''
            };
        })
        .filter(Boolean);
}

function shuffleBlossomArray(list) {
    const copy = Array.isArray(list) ? list.slice() : [];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function buildBlossomDeck(owner) {
    const pool = getBlossomPlayablePool();
    const bySeason = { spring: [], summer: [], autumn: [], winter: [] };
    pool.forEach((entry) => {
        if (bySeason[entry.season]) bySeason[entry.season].push(entry);
    });

    const deck = [];
    BLOSSOM_SEASONS.forEach((season) => {
        const picks = shuffleBlossomArray(bySeason[season]).slice(0, BLOSSOM_CARDS_PER_SEASON);
        picks.forEach((entry) => {
            deck.push({
                uid: `blossom-${owner}-${blossomCardUid++}`,
                key: entry.key,
                owner,
                item: entry.item,
                name: String((entry.item && entry.item.name) || '').trim(),
                category: getBlossomCardCategory(entry.item),
                imgSrc: entry.imgSrc,
                code: entry.code,
                sum: entry.sum,
                season: entry.season,
                seasonLabel: entry.seasonLabel,
                attack: entry.attack,
                defense: entry.defense,
                termName: entry.termName,
                effectType: entry.effectType,
                effectText: entry.effectText,
                usedEffect: false
            });
        });
    });

    if (deck.length !== BLOSSOM_CARDS_PER_SEASON * BLOSSOM_SEASONS.length) return [];
    return shuffleBlossomArray(deck);
}

function clearBlossomTimers() {
    if (blossomComTurnTimer) {
        clearTimeout(blossomComTurnTimer);
        blossomComTurnTimer = null;
    }
    if (blossomEffectTimer) {
        clearTimeout(blossomEffectTimer);
        blossomEffectTimer = null;
    }
    if (blossomEffectNoticeTimer) {
        clearTimeout(blossomEffectNoticeTimer);
        blossomEffectNoticeTimer = null;
    }
    document.querySelectorAll('.blossom-slot-card.is-effect-bursting').forEach((el) => el.classList.remove('is-effect-bursting'));
}

function pushBlossomLog(message) {
    if (!blossomGameState) return;
    blossomGameState.logs.unshift(String(message || ''));
    blossomGameState.logs = blossomGameState.logs.slice(0, 7);
}

function getBlossomField(owner) {
    return owner === 'com' ? blossomGameState.comField : blossomGameState.playerField;
}

function getBlossomHand(owner) {
    return owner === 'com' ? blossomGameState.comHand : blossomGameState.playerHand;
}

function getBlossomDeck(owner) {
    return owner === 'com' ? blossomGameState.comDeck : blossomGameState.playerDeck;
}

function getBlossomDiscard(owner) {
    return owner === 'com' ? blossomGameState.comDiscard : blossomGameState.playerDiscard;
}

function getBlossomOwnerLabel(owner) {
    return owner === 'com' ? 'COM' : 'PLAYER';
}

function getBlossomOpponent(owner) {
    return owner === 'com' ? 'player' : 'com';
}

function getBlossomEffectCard(owner) {
    return getBlossomField(owner).effect || null;
}

function findBlossomFieldCardRefByUid(uid) {
    if (!blossomGameState || !uid) return null;
    for (const owner of ['player', 'com']) {
        const field = getBlossomField(owner);
        for (const zone of ['attack', 'defense', 'effect']) {
            const card = field[zone];
            if (card && card.uid === uid) return { owner, zone, card };
        }
    }
    return null;
}

function getBlossomFieldCardByUid(uid) {
    const ref = findBlossomFieldCardRefByUid(uid);
    return ref ? ref.card : null;
}

function getBlossomZoneLabel(zone) {
    if (zone === 'attack') return '공격';
    if (zone === 'defense') return '수비';
    if (zone === 'effect') return '효과';
    return '필드';
}

function isBlossomRecurringEffectCard(card) {
    if (!card) return false;
    return ['상강', '소설', '입동'].includes(card.termName);
}

function resetBlossomTurnModifiers() {
    if (!blossomGameState) return;
    const prev = blossomGameState.turnModifiers || {};
    blossomGameState.turnModifiers = {
        playerAttackMultiplier: 1,
        comAttackMultiplier: 1,
        playerDefenseMultiplier: 1,
        comDefenseMultiplier: 1,
        playerAttackAddDefenseUntilTurn: Number(prev.playerAttackAddDefenseUntilTurn || 0),
        comAttackAddDefenseUntilTurn: Number(prev.comAttackAddDefenseUntilTurn || 0),
        playerDefenseAddAttackUntilTurn: Number(prev.playerDefenseAddAttackUntilTurn || 0),
        comDefenseAddAttackUntilTurn: Number(prev.comDefenseAddAttackUntilTurn || 0)
    };
}

function ensureBlossomEffectState() {
    if (!blossomGameState) return null;
    if (!blossomGameState.effectState) {
        blossomGameState.effectState = {
            playerChoiceNullify: 0,
            comChoiceNullify: 0,
            playerEffectSuppressed: 0,
            comEffectSuppressed: 0,
            chainCount: 0
        };
    }
    if (!blossomGameState.turnModifiers) resetBlossomTurnModifiers();
    return blossomGameState.effectState;
}

function getBlossomChainCount() {
    const effectState = ensureBlossomEffectState();
    return effectState ? Number(effectState.chainCount || 0) : 0;
}

function incrementBlossomChainCount() {
    const effectState = ensureBlossomEffectState();
    if (!effectState) return 0;
    effectState.chainCount = Math.min(6, Number(effectState.chainCount || 0) + 1);
    return effectState.chainCount;
}

function countBlossomSeasonCardsOnField(season) {
    if (!blossomGameState) return 0;
    let count = 0;
    ['player', 'com'].forEach((owner) => {
        const field = getBlossomField(owner);
        ['attack', 'defense', 'effect'].forEach((zone) => {
            const card = field[zone];
            if (card && card.season === season) count += 1;
        });
    });
    return count;
}

function getBlossomFieldCardRefs(owner = null) {
    if (!blossomGameState) return [];
    const owners = owner ? [owner] : ['player', 'com'];
    const refs = [];
    owners.forEach((fieldOwner) => {
        const field = getBlossomField(fieldOwner);
        ['attack', 'defense', 'effect'].forEach((zone) => {
            const card = field[zone];
            if (card) refs.push({ owner: fieldOwner, zone, card });
        });
    });
    return refs;
}

function countBlossomSeasonCardsInHand(owner, season) {
    return getBlossomHand(owner).filter((card) => card && card.season === season).length;
}

function countBlossomTermCardsOnField(owner, termName) {
    return getBlossomFieldCardRefs(owner).filter((ref) => ref.card.termName === termName).length;
}

function getBlossomCardStatSnapshot(card, owner = null, zone = null) {
    if (!card) return { attack: 0, defense: 0 };
    let attack = Number(card.attack || 0);
    let defense = Number(card.defense || 0);
    if (owner && card.season === 'summer') {
        const daeseoCount = countBlossomTermCardsOnField(owner, '대서');
        if (daeseoCount > 0) {
            const bonus = countBlossomSeasonCardsInHand(owner, 'summer') * 300 * daeseoCount;
            attack += bonus;
            defense += bonus;
        }
    }
    const state = blossomGameState;
    const modifiers = state ? (state.turnModifiers || {}) : {};
    const currentTurn = state ? Number(state.turnNumber || 0) : 0;
    if (owner && zone === 'attack' && currentTurn <= Number(modifiers[`${owner}AttackAddDefenseUntilTurn`] || 0)) {
        const alliedDefense = getBlossomField(owner).defense;
        if (alliedDefense && alliedDefense.uid !== card.uid) attack += Number(alliedDefense.defense || 0);
    }
    if (owner && zone === 'defense' && currentTurn <= Number(modifiers[`${owner}DefenseAddAttackUntilTurn`] || 0)) {
        const alliedAttack = getBlossomField(owner).attack;
        if (alliedAttack && alliedAttack.uid !== card.uid) defense += Number(alliedAttack.attack || 0);
    }
    return { attack, defense };
}

function getBlossomDamageAfterDestroyEffect(card, damage) {
    const baseDamage = Math.max(0, Number(damage || 0));
    if (!card || baseDamage <= 0) return baseDamage;
    if (card.termName === '우수') {
        pushBlossomLog(`${card.name}의 우수 효과로 생존 점수 감소가 무효화되었습니다.`);
        return 0;
    }
    if (card.termName === '청명') {
        const reduced = Math.floor(baseDamage / 2);
        pushBlossomLog(`${card.name}의 청명 효과로 생존 점수 감소량이 절반으로 줄었습니다.`);
        return reduced;
    }
    return baseDamage;
}

function triggerBlossomDestroyedCardFollowUp(owner, zone, card) {
    if (!card) return;
    if (card.termName === '처서' && (zone === 'attack' || zone === 'defense')) {
        const replacement = getBestBlossomHandCard(owner, zone);
        if (replacement && placeBlossomCard(owner, replacement.uid, zone)) {
            pushBlossomLog(`${card.name}의 처서 효과로 ${replacement.name} 카드가 즉시 ${getBlossomZoneLabel(zone)} 영역에 배치되었습니다.`);
        }
    }
}

function applyBlossomStartOfTurnImmediateEffects(owner) {
    if (!blossomGameState || blossomGameState.gameOver) return;
    const opponent = getBlossomOpponent(owner);
    const opponentField = getBlossomField(opponent);
    const ownerRefs = getBlossomFieldCardRefs(owner);

    ownerRefs.filter((ref) => ref.card.termName === '상강').forEach((ref) => {
        const defender = opponentField.defense;
        if (!defender) return;
        defender.defense = Math.max(0, Number(defender.defense || 0) - 100);
        pushBlossomLog(`${ref.card.name}의 상강 효과로 ${defender.name}의 수비력이 100 감소했습니다.`);
        if (defender.defense <= 0) {
            const destroyed = destroyBlossomFieldCard(opponent, 'defense');
            pushBlossomLog(`${destroyed.name}의 수비력이 0이 되어 파괴되었습니다.`);
            triggerBlossomDestroyedCardFollowUp(opponent, 'defense', destroyed);
        }
    });

    ownerRefs.filter((ref) => ref.card.termName === '소설').forEach((ref) => {
        const currentRef = findBlossomFieldCardRefByUid(ref.card.uid);
        if (!currentRef) return;
        currentRef.card.attack = Math.max(0, Number(currentRef.card.attack || 0) - 100);
        currentRef.card.defense = Math.max(0, Number(currentRef.card.defense || 0) + 100);
        pushBlossomLog(`${currentRef.card.name}의 소설 효과로 공격력은 100 감소하고 수비력은 100 증가했습니다.`);
        if (currentRef.card.attack <= 0) {
            const destroyed = destroyBlossomFieldCard(currentRef.owner, currentRef.zone);
            pushBlossomLog(`${destroyed.name}의 공격력이 0이 되어 파괴되었습니다.`);
            triggerBlossomDestroyedCardFollowUp(currentRef.owner, currentRef.zone, destroyed);
        }
    });
}

function applyBlossomEndOfTurnImmediateEffects(activeOwner) {
    if (!blossomGameState || blossomGameState.gameOver) return;
    const opponent = getBlossomOpponent(activeOwner);
    const activeAttackCard = getBlossomField(activeOwner).attack;
    if (!blossomGameState.hasDeclaredAttack && activeAttackCard && countBlossomTermCardsOnField(opponent, '동지') > 0) {
        const destroyed = destroyBlossomFieldCard(activeOwner, 'attack');
        pushBlossomLog(`동지 효과로 ${getBlossomOwnerLabel(activeOwner)}의 공격 카드 ${destroyed.name}가 턴 종료 후 파괴되었습니다.`);
        triggerBlossomDestroyedCardFollowUp(activeOwner, 'attack', destroyed);
    }
}

function drawBlossomCard(owner, options = {}) {
    const deck = getBlossomDeck(owner);
    const hand = getBlossomHand(owner);
    if (!deck.length) {
        if (!options.silent) {
            blossomGameState[`${owner}Life`] = Math.max(0, blossomGameState[`${owner}Life`] - BLOSSOM_DRAW_FAIL_DAMAGE);
            pushBlossomLog(`${getBlossomOwnerLabel(owner)}는 드로우에 실패해 생존 점수 1000을 잃었습니다.`);
            createBlossomLifeBurst(owner);
            checkBlossomGameOver();
        }
        return null;
    }
    const card = deck.shift();
    hand.push(card);
    return card;
}

function drawBlossomCards(owner, amount) {
    let drawn = 0;
    for (let i = 0; i < amount; i += 1) {
        const card = drawBlossomCard(owner);
        if (!card) break;
        drawn += 1;
    }
    return drawn;
}

function discardRandomBlossomHandCards(owner, amount) {
    const hand = getBlossomHand(owner);
    const discard = getBlossomDiscard(owner);
    let removed = 0;
    while (hand.length && removed < amount) {
        const index = Math.floor(Math.random() * hand.length);
        const [card] = hand.splice(index, 1);
        if (!card) break;
        discard.push(card);
        removed += 1;
    }
    return removed;
}

function createBlossomSlotBurst(owner, zone) {
    const target = document.getElementById(`blossom-${owner}-${zone}-slot`);
    if (target) createJokerCountBurst(target);
}

function createBlossomLifeBurst(owner) {
    const target = document.getElementById(`blossom-${owner}-life-panel`);
    if (target) createJokerCountBurst(target);
}

function getBlossomSlotCardElement(owner, zone) {
    const slot = document.getElementById(`blossom-${owner}-${zone}-slot`);
    return slot ? slot.querySelector('.blossom-slot-card') : null;
}

function queueBlossomEffectSequence(owner, card, onApply) {
    if (!blossomGameState || !card || typeof onApply !== 'function') return;
    clearBlossomTimers();
    blossomGameState.effectAnimating = true;
    renderBlossomGame();

    const fieldRef = findBlossomFieldCardRefByUid(card.uid);
    const burstTarget = fieldRef
        ? (getBlossomSlotCardElement(fieldRef.owner, fieldRef.zone) || document.getElementById(`blossom-${fieldRef.owner}-${fieldRef.zone}-slot`))
        : (getBlossomSlotCardElement(owner, 'effect') || document.getElementById(`blossom-${owner}-effect-slot`));
    if (burstTarget) {
        burstTarget.classList.add('is-effect-bursting');
        createJokerCountBurst(burstTarget);
    }

    blossomEffectTimer = setTimeout(() => {
        if (burstTarget) burstTarget.classList.remove('is-effect-bursting');
        showCenterNotice(`${getBlossomOwnerLabel(owner)}의 효과 발동 · ${card.termName}`);
        blossomEffectNoticeTimer = setTimeout(() => {
            try {
                onApply();
            } finally {
                if (blossomGameState) blossomGameState.effectAnimating = false;
                blossomEffectTimer = null;
                blossomEffectNoticeTimer = null;
                renderBlossomGame();
            }
        }, 1650);
    }, 560);
}

function destroyBlossomFieldCard(owner, zone) {
    const field = getBlossomField(owner);
    const card = field[zone];
    if (!card) return null;
    field[zone] = null;
    if (blossomGameState && blossomGameState.selectedFieldCardId === card.uid) {
        blossomGameState.selectedFieldCardId = null;
    }
    getBlossomDiscard(owner).push(card);
    createBlossomSlotBurst(owner, zone);
    return card;
}

function prepareBlossomEffectCard(card, owner) {
    if (!card) return card;
    card.effectPlacedOwner = owner;
    card.effectPlacedTurn = blossomGameState ? blossomGameState.turnNumber : 0;
    card.effectExpiresOnTurn = (blossomGameState ? blossomGameState.turnNumber : 0) + 3;
    return card;
}

function clearBlossomEffectCardMeta(card) {
    if (!card) return card;
    delete card.effectPlacedOwner;
    delete card.effectPlacedTurn;
    delete card.effectExpiresOnTurn;
    return card;
}

function expireBlossomEffectSlots(nextOwner) {
    const state = blossomGameState;
    if (!state) return;
    ['player', 'com'].forEach((owner) => {
        const effectCard = getBlossomField(owner).effect;
        if (!effectCard) return;
        if (effectCard.effectPlacedOwner === owner && Number(effectCard.effectExpiresOnTurn || 0) <= state.turnNumber && nextOwner !== owner) {
            destroyBlossomFieldCard(owner, 'effect');
            pushBlossomLog(`${getBlossomOwnerLabel(owner)}의 효과 카드 ${effectCard.name}가 3턴 유지 후 파괴되었습니다.`);
        }
    });
}

function getBlossomAttackMultiplier(attackerSeason, defenderSeason) {
    if ((attackerSeason === 'spring' || attackerSeason === 'summer') && defenderSeason === 'winter') return 2;
    if (attackerSeason === 'autumn' && defenderSeason === 'summer') return 2;
    if (attackerSeason === 'winter' && defenderSeason === 'autumn') return 2;
    return 1;
}

function getBlossomDisplayedPanelCard() {
    if (!blossomGameState) return null;
    const handCard = blossomGameState.playerHand.find((card) => card.uid === blossomGameState.selectedCardId);
    if (handCard) return handCard;
    const fieldCard = getBlossomFieldCardByUid(blossomGameState.selectedFieldCardId);
    if (fieldCard) return fieldCard;
    return getBlossomEffectCard('player');
}

function getBlossomManualEffectCardRef(owner = 'player') {
    if (!blossomGameState) return null;
    const selectedRef = findBlossomFieldCardRefByUid(blossomGameState.selectedFieldCardId);
    if (selectedRef && selectedRef.owner === owner) return selectedRef;
    const effectCard = getBlossomEffectCard(owner);
    return effectCard ? { owner, zone: 'effect', card: effectCard } : null;
}

function getBlossomAvailableInterferenceRefs(owner = 'player', excludeUid = '') {
    return getBlossomFieldCardRefs(owner).filter((ref) => {
        const card = ref.card;
        return !!card
            && card.uid !== excludeUid
            && card.effectType === '간섭형'
            && canBlossomCardUseManualEffect(card);
    });
}

function openBlossomInterferencePrompt(owner, sourceOwner, originalCardUid, optionCardUids) {
    if (!blossomGameState) return;
    blossomGameState.interferencePrompt = {
        owner,
        sourceOwner,
        originalCardUid,
        optionCardUids: Array.isArray(optionCardUids) ? optionCardUids.slice() : []
    };
    renderBlossomGame();
}

function closeBlossomInterferencePrompt() {
    if (!blossomGameState) return;
    blossomGameState.interferencePrompt = null;
    renderBlossomGame();
}

function triggerBlossomInterferenceCard(cardUid) {
    if (!blossomGameState || blossomGameState.gameOver || blossomGameState.effectAnimating) return;
    const promptState = blossomGameState.interferencePrompt;
    const selectedRef = findBlossomFieldCardRefByUid(cardUid);
    if (!promptState || !selectedRef || selectedRef.owner !== promptState.owner) {
        closeBlossomInterferencePrompt();
        return;
    }
    blossomGameState.interferencePrompt = null;
    blossomGameState.selectedCardId = null;
    blossomGameState.selectedFieldCardId = cardUid;
    renderBlossomGame();
    useBlossomEffectCard({
        owner: promptState.owner,
        bypassInterferencePrompt: true,
        silentUnavailable: true,
        onComplete: () => {
            if (!blossomGameState || blossomGameState.gameOver) return;
            const originalRef = findBlossomFieldCardRefByUid(promptState.originalCardUid);
            if (!originalRef || !originalRef.card) {
                if (promptState.sourceOwner === 'com') queueBlossomComAttackAndEnd();
                return;
            }
            blossomGameState.selectedCardId = null;
            blossomGameState.selectedFieldCardId = promptState.originalCardUid;
            useBlossomEffectCard({
                owner: promptState.sourceOwner || 'player',
                bypassInterferencePrompt: true,
                silentUnavailable: true,
                onComplete: () => {
                    if (promptState.sourceOwner === 'com') queueBlossomComAttackAndEnd();
                }
            });
        }
    });
}

function resumeBlossomAfterReplacementPrompt() {
    if (!blossomGameState || blossomGameState.gameOver || blossomGameState.replacementPrompt) return;
    renderBlossomGame();
    if (blossomGameState.turnOwner === 'com') {
        clearBlossomTimers();
        blossomComTurnTimer = setTimeout(() => {
            if (!blossomGameState || blossomGameState.gameOver || blossomGameState.turnOwner !== 'com' || blossomGameState.replacementPrompt) return;
            endBlossomTurn();
        }, 420);
    }
}

function openBlossomReplacementPrompt(owner, zone, sourceCardUid) {
    if (!blossomGameState) return false;
    const hand = getBlossomHand(owner);
    if (!hand.length) return false;
    blossomGameState.replacementPrompt = {
        owner,
        zone,
        sourceCardUid,
        optionCardUids: hand.map((card) => card.uid)
    };
    blossomGameState.selectedCardId = null;
    blossomGameState.selectedFieldCardId = null;
    renderBlossomGame();
    return true;
}

function closeBlossomReplacementPrompt() {
    if (!blossomGameState) return;
    blossomGameState.replacementPrompt = null;
    resumeBlossomAfterReplacementPrompt();
}

function chooseBlossomReplacementCard(cardUid) {
    if (!blossomGameState || blossomGameState.gameOver || blossomGameState.effectAnimating) return;
    const promptState = blossomGameState.replacementPrompt;
    if (!promptState) return;
    const selectedCard = getBlossomHand(promptState.owner).find((card) => card.uid === cardUid);
    if (!selectedCard) {
        closeBlossomReplacementPrompt();
        return;
    }
    blossomGameState.replacementPrompt = null;
    if (!placeBlossomCard(promptState.owner, cardUid, promptState.zone)) {
        pushBlossomLog('처서 효과로 카드를 배치하지 못했습니다.');
        resumeBlossomAfterReplacementPrompt();
        return;
    }
    const field = getBlossomField(promptState.owner);
    blossomGameState.selectedFieldCardId = field[promptState.zone] ? field[promptState.zone].uid : null;
    pushBlossomLog(`처서 효과로 ${selectedCard.name} 카드가 즉시 ${getBlossomZoneLabel(promptState.zone)} 영역에 배치되었습니다.`);
    resumeBlossomAfterReplacementPrompt();
}

function continueBlossomOriginalEffect() {
    if (!blossomGameState || blossomGameState.gameOver || blossomGameState.effectAnimating) return;
    const promptState = blossomGameState.interferencePrompt;
    if (!promptState) return;
    blossomGameState.interferencePrompt = null;
    blossomGameState.selectedCardId = null;
    blossomGameState.selectedFieldCardId = promptState.originalCardUid || null;
    renderBlossomGame();
    useBlossomEffectCard({
        owner: promptState.sourceOwner || 'player',
        bypassInterferencePrompt: true,
        silentUnavailable: true,
        onComplete: () => {
            if (promptState.sourceOwner === 'com') queueBlossomComAttackAndEnd();
        }
    });
}

function canBlossomCardUseManualEffect(card) {
    if (!card) return false;
    if (!(card.effectType === '선택형' || card.effectType === '간섭형')) return false;
    return !card.usedEffect || isBlossomRecurringEffectCard(card);
}

function canUseBlossomEffectCard(owner = 'player') {
    const state = blossomGameState;
    if (!state || state.gameOver || state.turnOwner !== owner) return false;
    const effectRef = getBlossomManualEffectCardRef(owner);
    const effectCard = effectRef ? effectRef.card : null;
    if (!canBlossomCardUseManualEffect(effectCard)) return false;
    const effectState = ensureBlossomEffectState();
    if (!effectState || getBlossomChainCount() >= 6) return false;
    if (Number(effectState[`${owner}EffectSuppressed`] || 0) > 0) return true;
    return true;
}

function isBlossomAttackLocked() {
    if (!blossomGameState) return false;
    const currentTurn = Number(blossomGameState.turnNumber || 0);
    if (currentTurn === 1 && blossomGameState.turnOwner === blossomGameState.firstOwner) return true;
    if (currentTurn <= Number(blossomGameState.attackLockUntilTurn || 0)) return true;
    return getBlossomFieldCardRefs().some((ref) => {
        const effectCard = ref.card;
        if (!effectCard || effectCard.termName !== '입동') return false;
        const placedTurn = Number(effectCard.effectPlacedTurn || 0);
        return (currentTurn - placedTurn) < 2;
    });
}

function getBlossomAttackLockReason() {
    if (!blossomGameState) return '';
    const currentTurn = Number(blossomGameState.turnNumber || 0);
    if (currentTurn === 1 && blossomGameState.turnOwner === blossomGameState.firstOwner) {
        return '선공 첫 턴에는 공격 선언을 할 수 없습니다.';
    }
    if (currentTurn <= Number(blossomGameState.attackLockUntilTurn || 0)) {
        return '효과로 이번 턴에는 공격 선언을 할 수 없습니다.';
    }
    const winterLock = getBlossomFieldCardRefs().some((ref) => {
        const effectCard = ref.card;
        if (!effectCard || effectCard.termName !== '입동') return false;
        const placedTurn = Number(effectCard.effectPlacedTurn || 0);
        return (currentTurn - placedTurn) < 2;
    });
    return winterLock ? '입동 효과로 이번 턴에는 공격 선언을 할 수 없습니다.' : '';
}

function renderBlossomSlot(card, owner, zone) {
    if (!card) return 'EMPTY';
    const title = `${escapeKaprekarHtml(card.termName)} · ${escapeKaprekarHtml(card.effectType)}\n${escapeKaprekarHtml(card.effectText)}`;
    const frame = escapeKaprekarHtml(getBlossomSeasonFrame(card.season));
    const selected = blossomGameState && blossomGameState.selectedFieldCardId === card.uid ? ' is-selected' : '';
    const stats = getBlossomCardStatSnapshot(card, owner, zone);
    return `<button class="blossom-slot-card${selected}" type="button" onclick="selectBlossomFieldCard('${owner}', '${zone}')" title="${title}" style="--blossom-card-frame:${frame};"><div class="blossom-slot-name">${escapeKaprekarHtml(card.name)}</div><img src="${escapeKaprekarHtml(card.imgSrc)}" alt="${escapeKaprekarHtml(card.name)}" onerror="this.onerror=null;this.src='boardgame/QUESTION.png';"><div class="blossom-slot-meta">ATK ${stats.attack} / DEF ${stats.defense}</div></button>`;
}

function renderBlossomHandCard(card) {
    const selected = blossomGameState && blossomGameState.selectedCardId === card.uid ? ' is-selected' : '';
    const title = `${escapeKaprekarHtml(card.termName)} · ${escapeKaprekarHtml(card.effectType)}\n${escapeKaprekarHtml(card.effectText)}`;
    const frame = escapeKaprekarHtml(getBlossomSeasonFrame(card.season));
    return `<button class="blossom-hand-card${selected}" type="button" onclick="selectBlossomHandCard('${escapeKaprekarHtml(card.uid)}')" title="${title}" style="--blossom-card-frame:${frame};"><div class="blossom-card-title">${escapeKaprekarHtml(card.name)}</div><img src="${escapeKaprekarHtml(card.imgSrc)}" alt="${escapeKaprekarHtml(card.name)}" onerror="this.onerror=null;this.src='boardgame/QUESTION.png';"><div class="blossom-card-meta">ATK ${card.attack} / DEF ${card.defense}</div><div class="blossom-card-submeta">${escapeKaprekarHtml(card.seasonLabel)} · ${escapeKaprekarHtml(card.termName)} · ${escapeKaprekarHtml(card.effectType)}</div></button>`;
}

function renderBlossomSelectedPanel() {
    if (!blossomGameState) return;
    const selected = getBlossomDisplayedPanelCard();
    const panel = document.getElementById('blossom-selected-panel');
    if (!panel) return;
    const chainCount = getBlossomChainCount();
    const selectedFieldRef = findBlossomFieldCardRefByUid(blossomGameState.selectedFieldCardId);
    const effectRef = getBlossomManualEffectCardRef('player');
    const effectCard = effectRef ? effectRef.card : null;
    const canUseEffect = canUseBlossomEffectCard('player');
    const previewedCard = selectedFieldRef ? selectedFieldRef.card : selected;
    const previewIsEffectTarget = !!(previewedCard && effectCard && previewedCard.uid === effectCard.uid);
    const canUseEffectButton = canUseEffect && previewIsEffectTarget && !blossomGameState.effectAnimating && !blossomGameState.interferencePrompt && previewedCard.effectType !== '즉발형' && !blossomGameState.replacementPrompt;
    const useEffectLabel = previewedCard && previewedCard.effectType === '즉발형'
        ? '즉발형 자동 적용'
        : effectCard
            ? (canUseEffect ? `${effectCard.effectType} 효과 사용` : '효과 사용 완료')
            : '효과 사용';
    const headHtml = `<div class="blossom-selected-head"><div class="blossom-selected-title">CARD DETAIL</div><div class="blossom-selected-tools"><div class="blossom-chain-pill">CHAIN ${chainCount}/6</div><button class="blossom-selected-use-btn" type="button" onclick="useBlossomEffectCard()" ${canUseEffectButton ? '' : 'disabled'}>${escapeKaprekarHtml(useEffectLabel)}</button></div></div>`;
    if (!selected) {
        panel.innerHTML = `${headHtml}<div class="blossom-selected-copy">손패에서 카드를 선택하면 코드, 절기, 효과가 이곳에 표시됩니다. 공격 / 수비 / 효과 영역 중 원하는 칸에 배치할 수 있습니다.</div>`;
        return;
    }
    const sourceLabel = selectedFieldRef && selectedFieldRef.card.uid === selected.uid
        ? `${getBlossomOwnerLabel(selectedFieldRef.owner)} ${getBlossomZoneLabel(selectedFieldRef.zone)} 슬롯`
        : selected === effectCard
            ? '효과 슬롯'
            : '손패 선택';
    const usageLabel = canBlossomCardUseManualEffect(selected) ? '' : ((selected.effectType === '선택형' || selected.effectType === '간섭형') && selected.usedEffect ? ' · 사용 완료' : '');
    const statRef = selectedFieldRef && selectedFieldRef.card.uid === selected.uid
        ? selectedFieldRef
        : (effectRef && effectRef.card.uid === selected.uid ? effectRef : null);
    const stats = statRef ? getBlossomCardStatSnapshot(selected, statRef.owner, statRef.zone) : { attack: selected.attack, defense: selected.defense };
    panel.innerHTML = `${headHtml}<div class="blossom-selected-copy"><strong>${escapeKaprekarHtml(selected.name)}</strong><br>${escapeKaprekarHtml(sourceLabel)} · 코드 ${escapeKaprekarHtml(selected.code)} · ${escapeKaprekarHtml(selected.seasonLabel)} · ${escapeKaprekarHtml(selected.termName)}<br>ATK ${stats.attack} / DEF ${stats.defense}<br>${escapeKaprekarHtml(selected.effectType)}${usageLabel} · ${escapeKaprekarHtml(selected.effectText)}</div>`;
}
function checkBlossomGameOver() {
    const state = blossomGameState;
    if (!state) return false;
    if (state.gameOver) return true;
    if (state.playerLife > 0 && state.comLife > 0) return false;

    state.gameOver = true;
    state.selectedCardId = null;
    state.selectedFieldCardId = null;
    clearBlossomTimers();

    if (state.playerLife <= 0 && state.comLife <= 0) {
        state.resultTitle = 'DRAW';
    } else if (state.playerLife > state.comLife) {
        state.resultTitle = 'WIN';
    } else if (state.playerLife < state.comLife) {
        state.resultTitle = 'LOSE';
    } else {
        state.resultTitle = 'DRAW';
    }

    pushBlossomLog(`GAME OVER · PLAYER ${Math.max(0, state.playerLife)} : ${Math.max(0, state.comLife)} COM`);
    return true;
}

function renderBlossomGame() {
    const state = blossomGameState;
    if (!state) return;

    const shell = document.querySelector("#boardgame-blossom-play-section .blossom-play-shell");
    const board = document.querySelector("#boardgame-blossom-play-section .blossom-board");
    const turnValue = document.getElementById("blossom-turn-value");
    const currentValue = document.getElementById("blossom-current-value");
    const firstValue = document.getElementById("blossom-first-value");
    const stageValue = document.getElementById("blossom-stage-value");
    const playerLife = document.getElementById("blossom-player-life");
    const comLife = document.getElementById("blossom-com-life");
    const boardLog = document.getElementById("blossom-board-log");
    const playerDeckCount = document.getElementById("blossom-player-deck");
    const comDeckCount = document.getElementById("blossom-com-deck");
    const playerHandCount = document.getElementById("blossom-player-hand-count");
    const comHandCount = document.getElementById("blossom-com-hand-count");
    const playerHand = document.getElementById("blossom-hand");
    const resultOverlay = document.getElementById("blossom-result-overlay");
    const resultTitle = document.getElementById("blossom-result-title");
    const resultSubtitle = document.getElementById("blossom-result-subtitle");
    const interferenceOverlay = document.getElementById("blossom-interference-overlay");
    const interferenceCopy = document.getElementById("blossom-interference-copy");
    const interferenceList = document.getElementById("blossom-interference-list");
    const replacementOverlay = document.getElementById("blossom-replacement-overlay");
    const replacementCopy = document.getElementById("blossom-replacement-copy");
    const replacementList = document.getElementById("blossom-replacement-list");
    const placeAttackBtn = document.getElementById("blossom-place-attack-btn");
    const placeDefenseBtn = document.getElementById("blossom-place-defense-btn");
    const placeEffectBtn = document.getElementById("blossom-place-effect-btn");
    const attackBtn = document.getElementById("blossom-attack-btn");
    const endTurnBtn = document.getElementById("blossom-end-turn-btn");

    if (shell) shell.style.setProperty("--blossom-accent", getBlossomStageAccent(state.stageSeason));
    if (board) board.style.setProperty("--blossom-stage-background", state.stageBackground || "");

    if (turnValue) turnValue.textContent = String(state.turnNumber || 0);
    if (currentValue) currentValue.textContent = getBlossomOwnerLabel(state.turnOwner);
    if (firstValue) firstValue.textContent = getBlossomOwnerLabel(state.firstOwner);
    if (stageValue) stageValue.textContent = state.stageLabel || [state.stageSeasonLabel, state.stageTermName].filter(Boolean).join(" · ") || "-";
    if (playerLife) playerLife.textContent = String(Math.max(0, state.playerLife || 0));
    if (comLife) comLife.textContent = String(Math.max(0, state.comLife || 0));
    if (boardLog) {
        const visibleLogs = state.logs && state.logs.length ? state.logs.slice(0, 5) : ["BLOSSOM MODE READY"];
        boardLog.textContent = visibleLogs.join('\n');
    }
    if (playerDeckCount) playerDeckCount.textContent = String(state.playerDeck.length);
    if (comDeckCount) comDeckCount.textContent = String(state.comDeck.length);
    if (playerHandCount) playerHandCount.textContent = String(state.playerHand.length);
    if (comHandCount) comHandCount.textContent = String(state.comHand.length);

    const slotConfigs = [
        ["blossom-com-defense-slot", state.comField.defense, "com", "defense"],
        ["blossom-com-effect-slot", state.comField.effect, "com", "effect"],
        ["blossom-com-attack-slot", state.comField.attack, "com", "attack"],
        ["blossom-player-defense-slot", state.playerField.defense, "player", "defense"],
        ["blossom-player-effect-slot", state.playerField.effect, "player", "effect"],
        ["blossom-player-attack-slot", state.playerField.attack, "player", "attack"]
    ];

    slotConfigs.forEach(([id, card, owner, zone]) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (card) {
            el.classList.remove("is-empty");
            el.innerHTML = renderBlossomSlot(card, owner, zone);
        } else {
            el.classList.add("is-empty");
            el.textContent = 'EMPTY';
        }
    });

    if (playerHand) {
        playerHand.innerHTML = state.playerHand.length
            ? state.playerHand.map(renderBlossomHandCard).join("")
            : `<div class="blossom-selected-copy">드로우할 카드가 없거나 손패가 비어 있습니다.</div>`;
    }

    renderBlossomSelectedPanel();

    const promptState = state.interferencePrompt || null;
    if (interferenceOverlay && interferenceCopy && interferenceList) {
        if (promptState) {
            const optionRefs = (promptState.optionCardUids || [])
                .map((uid) => findBlossomFieldCardRefByUid(uid))
                .filter((ref) => ref && ref.owner === promptState.owner && ref.card && canBlossomCardUseManualEffect(ref.card));
            if (!optionRefs.length) {
                state.interferencePrompt = null;
                interferenceOverlay.hidden = true;
                interferenceOverlay.style.display = 'none';
                interferenceList.innerHTML = '';
            } else {
                const originalRef = findBlossomFieldCardRefByUid(promptState.originalCardUid);
                const originalName = originalRef && originalRef.card ? originalRef.card.termName : '현재 절기';
                interferenceCopy.textContent = '사용 가능한 간섭형 절기 카드가 있습니다. ' + originalName + ' 효과보다 먼저 사용하시겠습니까?';
                interferenceList.innerHTML = optionRefs.map((ref) => `<button class="blossom-interference-option" type="button" onclick="triggerBlossomInterferenceCard('${ref.card.uid}')">${escapeKaprekarHtml(ref.card.termName)} · ${escapeKaprekarHtml(ref.card.name)}<br>${escapeKaprekarHtml(getBlossomZoneLabel(ref.zone))} 슬롯 · ${escapeKaprekarHtml(ref.card.effectText)}</button>`).join('');
                interferenceOverlay.hidden = false;
                interferenceOverlay.style.display = 'flex';
            }
        } else {
            interferenceOverlay.hidden = true;
            interferenceOverlay.style.display = 'none';
            interferenceList.innerHTML = '';
        }
    }

    const replacementState = state.replacementPrompt || null;
    if (replacementOverlay && replacementCopy && replacementList) {
        if (replacementState) {
            const replacementCards = getBlossomHand(replacementState.owner).filter((card) => (replacementState.optionCardUids || []).includes(card.uid));
            if (!replacementCards.length) {
                state.replacementPrompt = null;
                replacementOverlay.hidden = true;
                replacementOverlay.style.display = 'none';
                replacementList.innerHTML = '';
            } else {
                replacementCopy.textContent = `${getBlossomZoneLabel(replacementState.zone)} 영역에 즉시 배치할 카드를 선택해 주세요.`;
                replacementList.innerHTML = replacementCards.map((card) => `<button class="blossom-interference-option" type="button" onclick="chooseBlossomReplacementCard('${card.uid}')">${escapeKaprekarHtml(card.name)}<br>${escapeKaprekarHtml(card.seasonLabel)} · ${escapeKaprekarHtml(card.termName)} · ATK ${card.attack} / DEF ${card.defense}</button>`).join('');
                replacementOverlay.hidden = false;
                replacementOverlay.style.display = 'flex';
            }
        } else {
            replacementOverlay.hidden = true;
            replacementOverlay.style.display = 'none';
            replacementList.innerHTML = '';
        }
    }
    const selectedHandCard = state.playerHand.find((card) => card.uid === state.selectedCardId) || null;
    const playerTurnActive = state.turnOwner === "player" && !state.gameOver && !state.effectAnimating && !state.interferencePrompt && !state.replacementPrompt;
    if (placeAttackBtn) placeAttackBtn.disabled = !playerTurnActive || !selectedHandCard || !!state.playerField.attack;
    if (placeDefenseBtn) placeDefenseBtn.disabled = !playerTurnActive || !selectedHandCard || !!state.playerField.defense;
    if (placeEffectBtn) placeEffectBtn.disabled = !playerTurnActive || !selectedHandCard || !!state.playerField.effect;
    if (attackBtn) attackBtn.disabled = !playerTurnActive || !state.playerField.attack || !!state.hasDeclaredAttack || isBlossomAttackLocked();
    if (endTurnBtn) endTurnBtn.disabled = !playerTurnActive;

    if (resultOverlay) {
        resultOverlay.hidden = !state.gameOver;
        resultOverlay.style.display = state.gameOver ? "flex" : "none";
    }
    if (resultTitle) resultTitle.textContent = state.resultTitle || "RESULT";
    if (resultSubtitle) resultSubtitle.textContent = `PLAYER ${Math.max(0, state.playerLife || 0)} : ${Math.max(0, state.comLife || 0)} COM`;
}

function selectBlossomHandCard(cardId) {
    if (!blossomGameState || blossomGameState.turnOwner !== 'player' || blossomGameState.gameOver || blossomGameState.replacementPrompt) return;
    blossomGameState.selectedFieldCardId = null;
    blossomGameState.selectedCardId = blossomGameState.selectedCardId === cardId ? null : cardId;
    renderBlossomGame();
}

function selectBlossomFieldCard(owner, zone) {
    if (!blossomGameState || blossomGameState.gameOver || blossomGameState.replacementPrompt) return;
    const card = getBlossomField(owner)[zone];
    if (!card) return;
    blossomGameState.selectedCardId = null;
    blossomGameState.selectedFieldCardId = blossomGameState.selectedFieldCardId === card.uid ? null : card.uid;
    renderBlossomGame();
}

function removeBlossomHandCard(owner, cardId) {
    const hand = getBlossomHand(owner);
    const index = hand.findIndex((card) => card.uid === cardId);
    if (index === -1) return null;
    return hand.splice(index, 1)[0];
}

function placeBlossomCard(owner, cardId, zone) {
    const field = getBlossomField(owner);
    if (field[zone]) return false;
    const card = removeBlossomHandCard(owner, cardId);
    if (!card) return false;
    if (zone === 'effect') prepareBlossomEffectCard(card, owner);
    else clearBlossomEffectCardMeta(card);
    field[zone] = card;
    if (card.termName === '입동' && blossomGameState) {
        blossomGameState.attackLockUntilTurn = Math.max(Number(blossomGameState.attackLockUntilTurn || 0), Number(blossomGameState.turnNumber || 0) + 1);
    }
    return true;
}

function placeSelectedBlossomCard(zone) {
    const state = blossomGameState;
    if (!state || state.gameOver || state.effectAnimating) return;
    if (state.turnOwner !== 'player') {
        showCenterNotice('플레이어 턴에만 카드를 배치할 수 있습니다.');
        return;
    }
    const selectedCard = state.playerHand.find((card) => card.uid === state.selectedCardId);
    if (!selectedCard) {
        showCenterNotice('먼저 손패에서 카드를 선택해 주세요.');
        return;
    }
    const field = getBlossomField('player');
    if (field[zone]) {
        showCenterNotice(getBlossomZoneLabel(zone) + ' 영역에는 이미 카드가 배치되어 있습니다.');
        return;
    }
    const placed = placeBlossomCard('player', selectedCard.uid, zone);
    if (!placed) {
        showCenterNotice('카드를 배치하지 못했습니다.');
        return;
    }
    state.selectedCardId = null;
    state.selectedFieldCardId = field[zone] ? field[zone].uid : null;
    pushBlossomLog('PLAYER가 ' + selectedCard.name + ' 카드를 ' + getBlossomZoneLabel(zone) + ' 영역에 배치했습니다.');
    renderBlossomGame();
}

function useBlossomEffectCard(options = {}) {
    const state = blossomGameState;
    const effectOwner = options && options.owner === 'com' ? 'com' : 'player';
    const bypassInterferencePrompt = !!(options && options.bypassInterferencePrompt);
    const silentUnavailable = !!(options && options.silentUnavailable);
    const onComplete = typeof (options && options.onComplete) === 'function' ? options.onComplete : null;
    if (!state || state.gameOver || state.turnOwner !== effectOwner || state.effectAnimating || state.replacementPrompt) return false;
    const effectRef = getBlossomManualEffectCardRef(effectOwner);
    const effectCard = effectRef ? effectRef.card : null;
    if (!canBlossomCardUseManualEffect(effectCard)) {
        if (!silentUnavailable) showCenterNotice('사용 가능한 선택형 / 간섭형 효과 카드가 없습니다.');
        if (onComplete) onComplete(false);
        return false;
    }
    if (getBlossomChainCount() >= 6) {
        if (!silentUnavailable) showCenterNotice('이번 턴에는 효과 체인을 더 이상 사용할 수 없습니다.');
        if (onComplete) onComplete(false);
        return false;
    }

    if (!bypassInterferencePrompt && effectCard && effectCard.effectType !== '간섭형') {
        const interferenceOwner = effectOwner === 'com' ? 'player' : null;
        const interferenceRefs = interferenceOwner ? getBlossomAvailableInterferenceRefs(interferenceOwner, effectCard.uid) : [];
        if (interferenceRefs.length) {
            openBlossomInterferencePrompt(interferenceOwner, effectOwner, effectCard.uid, interferenceRefs.map((ref) => ref.card.uid));
            return false;
        }
    }

    queueBlossomEffectSequence(effectOwner, effectCard, () => {
        const latestState = blossomGameState;
        if (!latestState || latestState.gameOver) return;
        const latestEffectCard = getBlossomFieldCardByUid(effectCard.uid);
        if (!latestEffectCard) return;
        const latestEffectState = ensureBlossomEffectState();
        const suppressedKey = `${effectOwner}EffectSuppressed`;
        if (Number(latestEffectState[suppressedKey] || 0) > 0) {
            latestEffectState[suppressedKey] = Math.max(0, Number(latestEffectState[suppressedKey] || 0) - 1);
            if (!isBlossomRecurringEffectCard(latestEffectCard)) latestEffectCard.usedEffect = true;
            incrementBlossomChainCount();
            pushBlossomLog(`${getBlossomOwnerLabel(effectOwner)}의 효과 카드 ${latestEffectCard.name} 사용이 무효화되었습니다.`);
            renderBlossomGame();
            if (onComplete) onComplete(false);
            return;
        }

        const opponent = getBlossomOpponent(effectOwner);
        const opponentField = getBlossomField(opponent);
        const modifiers = latestState.turnModifiers || {};
        const ownerLabel = getBlossomOwnerLabel(effectOwner);
        const opponentLabel = getBlossomOwnerLabel(opponent);
        let handled = true;
        let logMessage = '';

        switch (latestEffectCard.termName) {
            case '입춘':
                modifiers[`${effectOwner}AttackMultiplier`] = 2;
                logMessage = `입춘 효과로 ${ownerLabel} 공격 카드 공격력이 이번 턴 2배가 됩니다.`;
                break;
            case '경칩':
                modifiers[`${effectOwner}DefenseMultiplier`] = 2;
                logMessage = `경칩 효과로 ${ownerLabel} 수비 카드 수비력이 이번 턴 2배가 됩니다.`;
                break;
            case '춘분': {
                const removed = discardRandomBlossomHandCards(effectOwner, 1);
                if (removed <= 0) {
                    handled = false;
                    break;
                }
                const drawn = drawBlossomCards(effectOwner, 1);
                logMessage = `춘분 효과로 ${ownerLabel}가 패 1장을 버리고 카드 ${drawn}장을 드로우했습니다.`;
                break;
            }
            case '곡우': {
                ['player', 'com'].forEach((fieldOwner) => {
                    ['attack', 'defense'].forEach((zone) => {
                        const card = getBlossomField(fieldOwner)[zone];
                        if (!card) return;
                        const destroyed = destroyBlossomFieldCard(fieldOwner, zone);
                        if (destroyed) triggerBlossomDestroyedCardFollowUp(fieldOwner, zone, destroyed);
                    });
                });
                logMessage = '곡우 효과로 양쪽의 공격/수비 카드가 모두 파괴되었습니다.';
                break;
            }
            case '입하': {
                const target = opponentField.defense;
                if (!target) {
                    handled = false;
                    break;
                }
                const nextAttack = Number(target.defense || 0);
                const nextDefense = Number(target.attack || 0);
                target.attack = nextAttack;
                target.defense = nextDefense;
                logMessage = `입하 효과로 ${target.name}의 공격력과 수비력이 서로 바뀌었습니다.`;
                break;
            }
            case '소만':
                latestEffectState[`${opponent}EffectSuppressed`] = Math.max(0, Number(latestEffectState[`${opponent}EffectSuppressed`] || 0) + 1);
                logMessage = `소만 효과로 ${opponentLabel}의 다음 선택형/간섭형 효과 1회를 무효화합니다.`;
                break;
            case '하지':
                modifiers[`${effectOwner}AttackAddDefenseUntilTurn`] = Math.max(Number(modifiers[`${effectOwner}AttackAddDefenseUntilTurn`] || 0), Number(latestState.turnNumber || 0) + 2);
                logMessage = `하지 효과로 ${ownerLabel} 공격 카드 공격력에 수비 카드 수비력이 2턴 동안 합산됩니다.`;
                break;
            case '소서': {
                const removed = discardRandomBlossomHandCards(opponent, 1);
                if (removed <= 0) {
                    handled = false;
                    break;
                }
                logMessage = `소서 효과로 ${opponentLabel}의 패 1장이 랜덤 파괴되었습니다.`;
                break;
            }
            case '입추': {
                const removed = discardRandomBlossomHandCards(effectOwner, 1);
                if (removed <= 0) {
                    handled = false;
                    break;
                }
                latestEffectState[`${opponent}EffectSuppressed`] = Math.max(0, Number(latestEffectState[`${opponent}EffectSuppressed`] || 0) + 1);
                logMessage = `입추 효과로 패 1장을 버리고 ${opponentLabel}의 다음 절기 효과 1회를 무효화합니다.`;
                break;
            }
            case '백로':
                modifiers[`${effectOwner}DefenseAddAttackUntilTurn`] = Math.max(Number(modifiers[`${effectOwner}DefenseAddAttackUntilTurn`] || 0), Number(latestState.turnNumber || 0) + 2);
                logMessage = `백로 효과로 ${ownerLabel} 수비 카드 수비력에 공격 카드 공격력이 2턴 동안 합산됩니다.`;
                break;
            case '추분': {
                if (latestState[`${effectOwner}Life`] > Math.floor(BLOSSOM_STARTING_LIFE / 2)) {
                    handled = false;
                    break;
                }
                const drawn = drawBlossomCards(effectOwner, 1);
                logMessage = `추분 효과로 ${ownerLabel}가 카드 ${drawn}장을 추가 드로우했습니다.`;
                break;
            }
            case '대한': {
                const winterCount = getBlossomFieldCardRefs(effectOwner).filter((ref) => ref.card.season === 'winter').length;
                if (winterCount <= 0) {
                    handled = false;
                    break;
                }
                const removed = discardRandomBlossomHandCards(opponent, winterCount);
                logMessage = `대한 효과로 ${ownerLabel} 필드의 겨울 카드 ${winterCount}장 기준, ${opponentLabel} 패 ${removed}장이 랜덤 파괴되었습니다.`;
                break;
            }
            default:
                handled = false;
                break;
        }

        latestState.turnModifiers = modifiers;

        if (!handled) {
            if (!silentUnavailable) showCenterNotice('현재 상황에서는 해당 효과를 사용할 수 없습니다.');
            renderBlossomGame();
            if (onComplete) onComplete(false);
            return;
        }

        if (!isBlossomRecurringEffectCard(latestEffectCard)) latestEffectCard.usedEffect = true;
        incrementBlossomChainCount();
        if (logMessage) pushBlossomLog(logMessage);
        checkBlossomGameOver();
        renderBlossomGame();
        if (onComplete) onComplete(true);
    });
    return true;
}

function resolveBlossomAttack(owner) {
    const state = blossomGameState;
    if (!state || state.gameOver) return;
    const opponent = getBlossomOpponent(owner);
    const attackerField = getBlossomField(owner);
    const defenderField = getBlossomField(opponent);
    const attacker = attackerField.attack;
    if (!attacker) return;
    const modifiers = state.turnModifiers || {};

    const defender = defenderField.defense;
    const attackerStats = getBlossomCardStatSnapshot(attacker, owner, 'attack');
    const defenderStats = defender ? getBlossomCardStatSnapshot(defender, opponent, 'defense') : { attack: 0, defense: 0 };

    const baseMultiplier = defender ? getBlossomAttackMultiplier(attacker.season, defender.season) : 1;
    let multiplier = baseMultiplier;
    if (defender && defender.termName === '한로' && baseMultiplier > 1) {
        multiplier = 1;
        pushBlossomLog(`${defender.name}의 한로 효과로 상성 공격력 증가가 무효화되었습니다.`);
    }
    if (attacker.termName === '망종' && multiplier > 1) {
        multiplier = 3;
        pushBlossomLog(`${attacker.name}의 망종 효과로 상성 공격력이 3배로 강화됩니다.`);
    } else if (multiplier > 1) {
        pushBlossomLog(`${attacker.seasonLabel} 카드 상성 발동! ${attacker.name}의 공격력이 ${multiplier}배가 됩니다.`);
    }

    const attackMultiplier = Number(modifiers[`${owner}AttackMultiplier`] || 1);
    const defenseMultiplier = Number(modifiers[`${opponent}DefenseMultiplier`] || 1);
    const effectiveAttack = attackerStats.attack * multiplier * attackMultiplier;
    const effectiveDefense = defender ? (defenderStats.defense * defenseMultiplier) : 0;

    if (!defender) {
        state[`${opponent}Life`] = Math.max(0, state[`${opponent}Life`] - effectiveAttack);
        pushBlossomLog(`${getBlossomOwnerLabel(owner)}의 직접 공격! ${effectiveAttack} 피해를 입힙니다.`);
        createBlossomLifeBurst(opponent);
        checkBlossomGameOver();
        renderBlossomGame();
        return;
    }

    if (effectiveAttack > effectiveDefense) {
        const damage = effectiveAttack - effectiveDefense;
        const destroyedDefense = destroyBlossomFieldCard(opponent, 'defense');
        let finalDamage = getBlossomDamageAfterDestroyEffect(destroyedDefense, damage);
        let extraDamage = 0;
        if (attacker.termName === '대설') {
            extraDamage = countBlossomSeasonCardsInHand(owner, 'winter') * 100;
            if (extraDamage > 0) pushBlossomLog(`${attacker.name}의 대설 효과로 추가 피해 ${extraDamage}가 발생합니다.`);
        }
        state[`${opponent}Life`] = Math.max(0, state[`${opponent}Life`] - finalDamage - extraDamage);
        pushBlossomLog(`${attacker.name}가 ${destroyedDefense.name}를 파괴하고 ${finalDamage + extraDamage} 피해를 입혔습니다.`);
        createBlossomLifeBurst(opponent);
        if (attacker.termName === '소한' && defenderField.attack) {
            defenderField.attack.attack = Math.max(0, Number(defenderField.attack.attack || 0) - damage);
            pushBlossomLog(`${attacker.name}의 소한 효과로 ${defenderField.attack.name}의 공격력이 ${damage} 감소했습니다.`);
            if (defenderField.attack.attack <= 0) {
                const destroyedAttack = destroyBlossomFieldCard(opponent, 'attack');
                pushBlossomLog(`${destroyedAttack.name}의 공격력이 0이 되어 파괴되었습니다.`);
                triggerBlossomDestroyedCardFollowUp(opponent, 'attack', destroyedAttack);
            }
        }
        triggerBlossomDestroyedCardFollowUp(opponent, 'defense', destroyedDefense);
        if (attacker.termName === '망종' && multiplier >= 3) {
            const destroyedAttacker = destroyBlossomFieldCard(owner, 'attack');
            if (destroyedAttacker) {
                pushBlossomLog(`${destroyedAttacker.name}의 망종 효과로 공격 후 카드가 파괴됩니다.`);
                triggerBlossomDestroyedCardFollowUp(owner, 'attack', destroyedAttacker);
            }
        }
    } else if (effectiveAttack < effectiveDefense) {
        const damage = effectiveDefense - effectiveAttack;
        const destroyedAttack = destroyBlossomFieldCard(owner, 'attack');
        const finalDamage = getBlossomDamageAfterDestroyEffect(destroyedAttack, damage);
        state[`${owner}Life`] = Math.max(0, state[`${owner}Life`] - finalDamage);
        pushBlossomLog(`${destroyedAttack.name}의 공격이 막혔습니다. ${finalDamage} 피해를 받고 공격 카드가 파괴됩니다.`);
        createBlossomLifeBurst(owner);
        triggerBlossomDestroyedCardFollowUp(owner, 'attack', destroyedAttack);
    } else {
        const destroyedAttack = destroyBlossomFieldCard(owner, 'attack');
        const destroyedDefense = destroyBlossomFieldCard(opponent, 'defense');
        pushBlossomLog('공격력과 수비력이 같아 양쪽 카드가 모두 파괴되었습니다.');
        triggerBlossomDestroyedCardFollowUp(owner, 'attack', destroyedAttack);
        triggerBlossomDestroyedCardFollowUp(opponent, 'defense', destroyedDefense);
    }

    checkBlossomGameOver();
    renderBlossomGame();
}

function triggerBlossomAttack() {
    if (!blossomGameState || blossomGameState.turnOwner !== 'player' || blossomGameState.gameOver || blossomGameState.effectAnimating || blossomGameState.replacementPrompt) return;
    if (isBlossomAttackLocked()) {
        showCenterNotice(getBlossomAttackLockReason() || '이번 턴에는 공격 선언을 할 수 없습니다.');
        return;
    }
    if (!blossomGameState.playerField.attack) {
        showCenterNotice('공격 카드가 없습니다.');
        return;
    }
    if (blossomGameState.hasDeclaredAttack) {
        showCenterNotice('이번 턴에는 이미 공격을 선언했습니다.');
        return;
    }
    blossomGameState.hasDeclaredAttack = true;
    resolveBlossomAttack('player');
}

function getBestBlossomHandCard(owner, zone) {
    const hand = getBlossomHand(owner);
    if (!hand.length) return null;
    if (zone === 'effect') {
        return hand.slice().sort((a, b) => ((a.attack + a.defense) - (b.attack + b.defense)) || (a.sum - b.sum))[0] || null;
    }
    const key = zone === 'attack' ? 'attack' : 'defense';
    return hand.slice().sort((a, b) => (b[key] - a[key]) || ((b.attack + b.defense) - (a.attack + a.defense)))[0] || null;
}

function queueBlossomComTurn() {
    clearBlossomTimers();
    blossomComTurnTimer = setTimeout(handleBlossomComTurn, 1300);
}

function queueBlossomComAttackAndEnd() {
    blossomComTurnTimer = setTimeout(() => {
        if (!blossomGameState || blossomGameState.gameOver || blossomGameState.turnOwner !== 'com' || blossomGameState.replacementPrompt) return;
        if (isBlossomAttackLocked()) {
            pushBlossomLog(getBlossomAttackLockReason() || '이번 턴에는 공격 선언이 봉쇄되었습니다.');
        } else if (blossomGameState.comField.attack && !blossomGameState.hasDeclaredAttack) {
            blossomGameState.hasDeclaredAttack = true;
            resolveBlossomAttack('com');
        }
        blossomComTurnTimer = setTimeout(() => {
            if (!blossomGameState || blossomGameState.gameOver || blossomGameState.turnOwner !== 'com' || blossomGameState.replacementPrompt) return;
            endBlossomTurn();
        }, 1100);
    }, 900);
}

function handleBlossomComTurn() {
    const state = blossomGameState;
    if (!state || state.gameOver || state.turnOwner !== 'com' || state.replacementPrompt) return;
    const placeComCardIfNeeded = (zone, role) => {
        if (!blossomGameState || blossomGameState.gameOver || blossomGameState.turnOwner !== 'com' || blossomGameState.replacementPrompt) return false;
        if (blossomGameState.comField[zone]) return false;
        const card = getBestBlossomHandCard('com', role);
        if (!card || !placeBlossomCard('com', card.uid, zone)) return false;
        pushBlossomLog(`COM이 ${card.name} 카드를 ${getBlossomZoneLabel(zone)} 영역에 배치했습니다.`);
        renderBlossomGame();
        return true;
    };
    const tryComEffectUse = () => {
        if (!blossomGameState || blossomGameState.gameOver || blossomGameState.turnOwner !== 'com' || blossomGameState.replacementPrompt) return;
        if (!canUseBlossomEffectCard('com')) {
            queueBlossomComAttackAndEnd();
            return;
        }
        useBlossomEffectCard({
            owner: 'com',
            silentUnavailable: true,
            onComplete: () => {
                queueBlossomComAttackAndEnd();
            }
        });
    };
    const placementSteps = [
        () => placeComCardIfNeeded('defense', 'defense'),
        () => placeComCardIfNeeded('attack', 'attack'),
        () => placeComCardIfNeeded('effect', 'effect')
    ];
    let stepIndex = 0;
    const runNextStep = () => {
        if (!blossomGameState || blossomGameState.gameOver || blossomGameState.turnOwner !== 'com' || blossomGameState.replacementPrompt) return;
        if (stepIndex >= placementSteps.length) {
            blossomComTurnTimer = setTimeout(tryComEffectUse, 760);
            return;
        }
        placementSteps[stepIndex++]();
        blossomComTurnTimer = setTimeout(runNextStep, 620);
    };
    runNextStep();
}

function startBlossomTurn(owner) {
    const state = blossomGameState;
    if (!state || state.gameOver) return;
    state.turnOwner = owner;
    resetBlossomTurnModifiers();
    const effectState = ensureBlossomEffectState();
    if (effectState) effectState.chainCount = 0;
    expireBlossomEffectSlots(owner);
    state.selectedCardId = null;
    state.selectedFieldCardId = null;
    state.hasDeclaredAttack = false;
    applyBlossomStartOfTurnImmediateEffects(owner);
    if (checkBlossomGameOver()) return;
    const drawn = drawBlossomCard(owner);
    if (drawn) {
        pushBlossomLog(`${getBlossomOwnerLabel(owner)}가 카드를 1장 드로우했습니다.`);
    }
    if (checkBlossomGameOver()) return;
    renderBlossomGame();
    showBlossomDrawNotice(owner, () => {
        if (owner === 'com') queueBlossomComTurn();
    });
}

function endBlossomTurn() {
    const state = blossomGameState;
    if (!state || state.gameOver || state.effectAnimating || state.replacementPrompt) return;
    applyBlossomEndOfTurnImmediateEffects(state.turnOwner);
    if (checkBlossomGameOver()) return;
    state.turnNumber += 1;
    startBlossomTurn(state.turnOwner === 'player' ? 'com' : 'player');
}

function initializeBlossomGame() {
    clearBlossomTimers();
    const playerDeck = buildBlossomDeck('player');
    const comDeck = buildBlossomDeck('com');
    const stage = pickRandomBlossomStage();
    if (playerDeck.length !== 24 || comDeck.length !== 24) {
        showCenterNotice('절기 카드를 구성하지 못했습니다.');
        return false;
    }
    const firstOwner = Math.random() < 0.5 ? 'player' : 'com';
    blossomGameState = {
        playerLife: BLOSSOM_STARTING_LIFE,
        comLife: BLOSSOM_STARTING_LIFE,
        playerDeck,
        comDeck,
        playerHand: [],
        comHand: [],
        playerDiscard: [],
        comDiscard: [],
        playerField: { attack: null, defense: null, effect: null },
        comField: { attack: null, defense: null, effect: null },
        stageSeason: stage.season,
        stageSeasonLabel: stage.seasonLabel,
        stageTermName: stage.termName,
        stageLabel: `${stage.seasonLabel} · ${stage.termName}`,
        stageBackground: stage.background,
        firstOwner,
        turnOwner: firstOwner,
        turnNumber: 1,
        selectedCardId: null,
        selectedFieldCardId: null,
        hasDeclaredAttack: false,
        effectState: {
            playerChoiceNullify: 0,
            comChoiceNullify: 0,
            playerEffectSuppressed: 0,
            comEffectSuppressed: 0,
            chainCount: 0
        },
        turnModifiers: {
            playerAttackMultiplier: 1,
            comAttackMultiplier: 1,
            playerDefenseMultiplier: 1,
            comDefenseMultiplier: 1,
            playerAttackAddDefenseUntilTurn: 0,
            comAttackAddDefenseUntilTurn: 0,
            playerDefenseAddAttackUntilTurn: 0,
            comDefenseAddAttackUntilTurn: 0
        },
        logs: ['BLOSSOM MODE READY'],
        gameOver: false,
        resultTitle: 'RESULT',
        effectAnimating: false,
        attackLockUntilTurn: 0,
        interferencePrompt: null,
        replacementPrompt: null
    };
    for (let i = 0; i < BLOSSOM_STARTING_HAND; i += 1) {
        drawBlossomCard('player', { silent: true });
        drawBlossomCard('com', { silent: true });
    }
    pushBlossomLog(`랜덤 스테이지 · ${blossomGameState.stageLabel}`);
    pushBlossomLog(`${getBlossomOwnerLabel(blossomGameState.firstOwner)}가 선공입니다.`);
    return true;
}

function startBlossomMode() {
    if (!initializeBlossomGame()) return;
    showTab('boardgame-blossom-play-section');
    renderBlossomGame();
    startBlossomTurn(blossomGameState.firstOwner);
}

function requestBlossomModeStart() {
    if (blossomModeDeveloperUnlocked) {
        startBlossomMode();
        return;
    }
    openBlossomDevlock();
}

function openBlossomDevlock() {
    const overlay = document.getElementById('blossom-devlock-overlay');
    const input = document.getElementById('blossom-devlock-input');
    const error = document.getElementById('blossom-devlock-error');
    if (!overlay) return;
    if (error) error.textContent = '';
    if (input) input.value = '';
    overlay.hidden = false;
    overlay.style.display = 'flex';
    setTimeout(() => {
        if (input) input.focus();
    }, 30);
}

function closeBlossomDevlock() {
    const overlay = document.getElementById('blossom-devlock-overlay');
    const input = document.getElementById('blossom-devlock-input');
    const error = document.getElementById('blossom-devlock-error');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.style.display = 'none';
    if (input) input.value = '';
    if (error) error.textContent = '';
}

function submitBlossomDevlock() {
    const input = document.getElementById('blossom-devlock-input');
    const error = document.getElementById('blossom-devlock-error');
    const value = input ? String(input.value || '').trim() : '';
    if (value === BLOSSOM_DEVLOCK_PASSWORD) {
        blossomModeDeveloperUnlocked = true;
        closeBlossomDevlock();
        startBlossomMode();
        return;
    }
    if (error) error.textContent = '비밀번호가 올바르지 않습니다.';
    if (input) {
        input.value = '';
        input.focus();
    }
}

function handleBlossomDevlockKeydown(event) {
    if (!event) return;
    if (event.key === 'Enter') {
        event.preventDefault();
        submitBlossomDevlock();
    } else if (event.key === 'Escape') {
        event.preventDefault();
        closeBlossomDevlock();
    }
}

const BLOSSOM_ROUND_MAX = 5;
const BLOSSOM_ROUND_WIN_TARGET = 3;
const BLOSSOM_ROUND_CARD_COUNT = 4;
const BLOSSOM_ROUND_SEASON_LIMIT = 3;
const BLOSSOM_ROUND_FIELD_LAYOUT = [
    { slot: 0, owner: 'player' },
    { slot: 1, owner: 'com' },
    { slot: 2, owner: 'player' },
    { slot: 3, owner: 'com' },
    { slot: 4, owner: 'player' },
    { slot: 5, owner: 'com' },
    { slot: 6, owner: 'player' },
    { slot: 7, owner: 'com' }
];
const BLOSSOM_ROUND_MATCHUP = {
    spring: 'winter',
    summer: 'spring',
    autumn: 'summer',
    winter: 'autumn'
};

function buildBlossomRoundDeck(owner) {
    const pool = getBlossomPlayablePool();
    const bySeason = { spring: [], summer: [], autumn: [], winter: [] };
    pool.forEach((entry) => {
        if (entry && bySeason[entry.season]) bySeason[entry.season].push(entry);
    });
    const deck = [];
    BLOSSOM_SEASONS.forEach((season) => {
        let pickedEntries = [];
        if (season === 'spring') {
            pickedEntries = shuffleBlossomArray(bySeason[season]).slice(0, BLOSSOM_CARDS_PER_SEASON);
        } else {
            const startSum = season === 'summer' ? 7 : season === 'autumn' ? 13 : 19;
            for (let sum = startSum; sum < startSum + BLOSSOM_CARDS_PER_SEASON; sum += 1) {
                const candidates = bySeason[season].filter((entry) => Number(entry.sum || 0) === sum);
                const picked = shuffleBlossomArray(candidates)[0];
                if (picked) pickedEntries.push(picked);
            }
        }
        if (pickedEntries.length < BLOSSOM_CARDS_PER_SEASON) return;
        pickedEntries.forEach((entry, index) => {
            deck.push({
                uid: `blossom-round-${owner}-${blossomCardUid++}`,
                owner,
                season,
                seasonLabel: BLOSSOM_SEASON_LABELS[season] || season,
                value: Number(entry.sum || 0),
                code: entry.code,
                termName: entry.termName || ((BLOSSOM_EFFECTS[entry.sum] && BLOSSOM_EFFECTS[entry.sum].name) || `${BLOSSOM_SEASON_LABELS[season] || season} 절기`),
                name: String((entry.item && entry.item.name) || '').trim(),
                imgSrc: resolveItemImageSrc(entry.item),
                frame: getBlossomSeasonFrame(season),
                used: false,
                orderIndex: index
            });
        });
    });
    return deck.length === BLOSSOM_CARDS_PER_SEASON * BLOSSOM_SEASONS.length ? deck : [];
}

function getBlossomRoundRemainingDeck(owner) {
    if (!blossomGameState) return [];
    const source = owner === 'com' ? blossomGameState.comDeck : blossomGameState.playerDeck;
    return Array.isArray(source) ? source.filter((card) => card && !card.used) : [];
}

function countBlossomSeasonInSelection(list, season) {
    return (Array.isArray(list) ? list : []).filter((card) => card && card.season === season).length;
}

function getBlossomRoundCardByUid(owner, uid) {
    if (!blossomGameState || !uid) return null;
    const source = owner === 'com' ? blossomGameState.comDeck : blossomGameState.playerDeck;
    return Array.isArray(source) ? (source.find((card) => card && card.uid === uid) || null) : null;
}

function getBlossomRoundSelectedCards() {
    if (!blossomGameState) return [];
    return (blossomGameState.playerRoundSelectionIds || [])
        .map((uid) => getBlossomRoundCardByUid('player', uid))
        .filter(Boolean);
}

function getBlossomRoundPendingCards() {
    if (!blossomGameState) return [];
    return (blossomGameState.deckModalSelectionIds || [])
        .map((uid) => getBlossomRoundCardByUid('player', uid))
        .filter(Boolean);
}

function createBlossomRoundCardMarkup(card, owner, extraClass = '') {
    if (!card) return '';
    const ownerClass = owner === 'com' ? 'is-com' : 'is-player';
    const imageSrc = escapeKaprekarHtml(card.imgSrc || 'boardgame/QUESTION.png');
    const name = escapeKaprekarHtml(card.name || 'UNKNOWN');
    const seasonLabel = escapeKaprekarHtml(card.seasonLabel || '');
    const termName = escapeKaprekarHtml(card.termName || '');
    const cardCode = escapeKaprekarHtml(String(card.code || '----'));
    if ((extraClass || 'blossom-submit-card') === 'blossom-submit-card') {
        return `
        <div class="blossom-submit-card ${ownerClass}" style="--blossom-card-frame:${card.frame};">
            <div class="blossom-submit-card-main">
                <div class="blossom-submit-card-title">${name}</div>
                <div class="blossom-card-image">
                    <img src="${imageSrc}" alt="${name}" onerror="this.onerror=null;this.src='boardgame/QUESTION.png';">
                </div>
                <div class="blossom-submit-card-code">${cardCode}</div>
            </div>
        </div>
    `;
    }
    return `
        <div class="${extraClass || 'blossom-submit-card'} ${ownerClass}" style="--blossom-card-frame:${card.frame};">
            <div class="blossom-card-head">
                <span>${seasonLabel}</span>
                <span class="blossom-card-badge">${escapeKaprekarHtml(String(card.value))}</span>
            </div>
            <div class="blossom-card-image">
                <img src="${imageSrc}" alt="${name}" onerror="this.onerror=null;this.src='boardgame/QUESTION.png';">
            </div>
            <div class="blossom-card-foot">
                <div>${name}</div>
                <div class="blossom-card-term">${termName}</div>
            </div>
        </div>
    `;
}

function createBlossomFieldCardMarkup(card) {
    if (!card) return '';
    const ownerClass = card.owner === 'com' ? 'is-com' : 'is-player';
    const label = `${card.owner === 'com' ? 'COM' : 'PLAYER'} ${card.seasonLabel || ''} ${card.termName || ''}`.trim();
    return `<div class="blossom-field-card ${ownerClass}" aria-label="${escapeKaprekarHtml(label)}" title="${escapeKaprekarHtml(label)}" style="--blossom-card-frame:${card.frame};"></div>`;
}

function renderBlossomSubmitGrid() {
    const grid = document.getElementById('blossom-player-submit-grid');
    if (!grid || !blossomGameState) return;
    const cards = getBlossomRoundSelectedCards();
    grid.innerHTML = '';
    for (let i = 0; i < BLOSSOM_ROUND_CARD_COUNT; i += 1) {
        const slot = document.createElement('div');
        slot.className = 'blossom-submit-slot';
        if (cards[i]) {
            slot.innerHTML = createBlossomRoundCardMarkup(cards[i], 'player', 'blossom-submit-card');
        } else {
            slot.textContent = '비어있음';
        }
        grid.appendChild(slot);
    }
}

function renderBlossomField() {
    if (!blossomGameState) return;
    for (let index = 0; index < 8; index += 1) {
        const slot = document.getElementById(`blossom-field-slot-${index}`);
        if (!slot) continue;
        const card = blossomGameState.fieldCards[index] || null;
        if (!card) {
            slot.innerHTML = `${index + 1}`;
            continue;
        }
        slot.innerHTML = createBlossomFieldCardMarkup(card);
    }
}

function renderBlossomFieldModal() {
    const grid = document.getElementById('blossom-field-modal-grid');
    if (!grid || !blossomGameState) return;
    const allCards = Array.isArray(blossomGameState.fieldCards) ? blossomGameState.fieldCards.filter(Boolean) : [];
    const cards = allCards.filter((card) => card.owner === 'player').concat(allCards.filter((card) => card.owner === 'com'));
    if (!cards.length) {
        grid.innerHTML = '<div class="blossom-field-empty" style="grid-column: 1 / -1;">아직 공개된 필드 카드가 없습니다.</div>';
        return;
    }
    grid.innerHTML = cards.map((card) => `
        <div class="blossom-deck-card-stack">
            <div class="blossom-deck-tile ${card.owner === 'com' ? 'is-com' : 'is-player'}" style="--blossom-card-frame:${card.frame}; cursor:default;">
                <div class="blossom-deck-card-main">
                    <div class="blossom-deck-card-title">${escapeKaprekarHtml(card.name)}</div>
                    <div class="blossom-card-image">
                        <img src="${escapeKaprekarHtml(card.imgSrc)}" alt="${escapeKaprekarHtml(card.name)}" onerror="this.onerror=null;this.src='boardgame/QUESTION.png';">
                    </div>
                    <div class="blossom-deck-card-code">${escapeKaprekarHtml(String(card.code || '----'))}</div>
                </div>
            </div>
            <div class="blossom-deck-detail-box">
                <div class="blossom-deck-detail-title">${escapeKaprekarHtml(card.seasonLabel)} · ${escapeKaprekarHtml(card.termName)} · ${escapeKaprekarHtml(String(card.value))}</div>
            </div>
        </div>
    `).join('');
}

function renderBlossomDeckModalRows() {
    const rows = document.getElementById('blossom-deck-rows');
    const selectedCount = document.getElementById('blossom-deck-selected-count');
    const confirmBtn = document.getElementById('blossom-deck-confirm-btn');
    if (!rows || !selectedCount || !confirmBtn || !blossomGameState) return;
    const pendingCards = getBlossomRoundPendingCards();
    selectedCount.innerHTML = `선택한 카드<br>${pendingCards.length} / ${BLOSSOM_ROUND_CARD_COUNT}`;
    confirmBtn.disabled = pendingCards.length !== BLOSSOM_ROUND_CARD_COUNT;
    rows.innerHTML = BLOSSOM_SEASONS.map((season) => {
        const remainingCards = getBlossomRoundRemainingDeck('player')
            .filter((card) => card.season === season)
            .sort((a, b) => Number(a.orderIndex || 0) - Number(b.orderIndex || 0));
        const seasonSelectedCount = countBlossomSeasonInSelection(pendingCards, season);
        const cardsMarkup = remainingCards.map((card) => {
            const isSelected = blossomGameState.deckModalSelectionIds.includes(card.uid);
            const disabledBySeasonLimit = !isSelected && seasonSelectedCount >= BLOSSOM_ROUND_SEASON_LIMIT;
            const disabledByRoundLimit = !isSelected && pendingCards.length >= BLOSSOM_ROUND_CARD_COUNT;
            const disabledClass = (disabledBySeasonLimit || disabledByRoundLimit) ? ' is-disabled' : '';
            const selectedClass = isSelected ? ' is-selected' : '';
            return `
                <div class="blossom-deck-card-stack">
                    <button class="blossom-deck-tile${selectedClass}${disabledClass}" type="button" onclick="toggleBlossomDeckCard('${card.uid}')" ${disabledBySeasonLimit || disabledByRoundLimit ? 'data-disabled="true"' : ''} style="--blossom-card-frame:${card.frame};">
                        <div class="blossom-deck-card-main">
                            <div class="blossom-deck-card-title">${escapeKaprekarHtml(card.name)}</div>
                            <div class="blossom-card-image">
                                <img src="${escapeKaprekarHtml(card.imgSrc)}" alt="${escapeKaprekarHtml(card.name)}" onerror="this.onerror=null;this.src='boardgame/QUESTION.png';">
                            </div>
                            <div class="blossom-deck-card-code">${escapeKaprekarHtml(String(card.code || '----'))}</div>
                        </div>
                    </button>
                    <div class="blossom-deck-detail-box">
                        <div class="blossom-deck-detail-title">${escapeKaprekarHtml(card.termName)} · ${escapeKaprekarHtml(String(card.value))}</div>
                    </div>
                </div>
            `;
        }).join('');
        return `
            <div class="blossom-deck-row">
                <div class="blossom-deck-row-head">
                    <strong>${escapeKaprekarHtml(BLOSSOM_SEASON_LABELS[season] || season)} 계절 라인</strong>
                    <span>남은 수량: ${remainingCards.length}장</span>
                </div>
                <div class="blossom-deck-row-cards">${cardsMarkup}</div>
            </div>
        `;
    }).join('');
}

function updateBlossomStageDisplay() {
    const stage = document.getElementById('blossom-field-stage');
    const stageLabel = document.getElementById('blossom-stage-label');
    if (!stage || !stageLabel || !blossomGameState) return;
    stage.style.setProperty('--blossom-stage-background', blossomGameState.stageBackground || BLOSSOM_STAGE_BACKGROUNDS.spring);
    const centerOffset = BLOSSOM_STAGE_CENTER_OFFSETS[blossomGameState.stageSeason] || BLOSSOM_STAGE_CENTER_OFFSETS.spring;
    stage.style.setProperty('--blossom-center-x', centerOffset.x || '50%');
    stage.style.setProperty('--blossom-center-y', centerOffset.y || '50%');
    stageLabel.textContent = blossomGameState.stageLabel || '사계절 랜덤 스테이지';
}

function renderBlossomRoundLog() {
    const log = document.getElementById('blossom-round-log');
    if (!log || !blossomGameState) return;
    log.textContent = (blossomGameState.logs || []).join('\n');
}

function renderBlossomWinFlowers(owner) {
    if (!blossomGameState) return;
    const root = document.getElementById(owner === 'com' ? 'blossom-com-win-flowers' : 'blossom-player-win-flowers');
    if (!root) return;
    const seasons = owner === 'com' ? blossomGameState.comWinSeasons : blossomGameState.playerWinSeasons;
    const picked = Array.isArray(seasons) ? seasons.slice(0, BLOSSOM_ROUND_WIN_TARGET) : [];
    root.innerHTML = Array.from({ length: BLOSSOM_ROUND_WIN_TARGET }).map((_, index) => {
        const season = picked[index] || '';
        const filled = season ? ' is-filled' : '';
        const seasonClass = season ? ` is-${season}` : '';
        const label = season ? `${BLOSSOM_SEASON_LABELS[season] || season} 승리` : '빈 승리 꽃';
        return `<span class="blossom-win-flower${filled}${seasonClass}" title="${escapeKaprekarHtml(label)}" aria-label="${escapeKaprekarHtml(label)}">✿</span>`;
    }).join('');
}

function renderBlossomGame() {
    if (!blossomGameState) return;
    const deckCount = document.getElementById('blossom-player-deck-count');
    const comDeckCount = document.getElementById('blossom-com-deck-count');
    const roundPill = document.getElementById('blossom-round-pill');
    const startBtn = document.getElementById('blossom-start-round-btn');
    const openBtn = document.getElementById('blossom-open-deck-btn');
    if (deckCount) deckCount.textContent = `${getBlossomRoundRemainingDeck('player').length}장`;
    if (comDeckCount) comDeckCount.textContent = `${getBlossomRoundRemainingDeck('com').length}장`;
    renderBlossomWinFlowers('player');
    renderBlossomWinFlowers('com');
    const displayRound = blossomGameState.awaitingNextRound && !blossomGameState.gameOver
        ? Math.max(1, Math.min((blossomGameState.round || 1) - 1, BLOSSOM_ROUND_MAX))
        : Math.min(blossomGameState.round, BLOSSOM_ROUND_MAX);
    if (roundPill) roundPill.textContent = `ROUND ${displayRound} / ${BLOSSOM_ROUND_MAX} | ${blossomGameState.roundStatusText || '대결 준비 완료'}`;
    if (startBtn) {
        startBtn.textContent = blossomGameState.gameOver
            ? '다시 시작'
            : blossomGameState.awaitingNextRound
                ? '다음 라운드'
                : '라운드 대결 시작';
        startBtn.disabled = !blossomGameState.gameOver
            && !blossomGameState.awaitingNextRound
            && (blossomGameState.playerRoundSelectionIds || []).length !== BLOSSOM_ROUND_CARD_COUNT;
    }
    if (openBtn) openBtn.disabled = blossomGameState.gameOver || !!blossomGameState.awaitingNextRound;
    renderBlossomSubmitGrid();
    renderBlossomField();
    renderBlossomRoundLog();
    updateBlossomStageDisplay();
    renderBlossomDeckModalRows();
    renderBlossomFieldModal();
    syncBlossomMusicPlayback();
}

function openBlossomDeckModal() {
    const modal = document.getElementById('blossom-deck-modal');
    if (!modal || !blossomGameState || blossomGameState.gameOver) return;
    blossomGameState.deckModalSelectionIds = (blossomGameState.playerRoundSelectionIds || []).slice();
    modal.hidden = false;
    renderBlossomDeckModalRows();
}

function closeBlossomDeckModal() {
    const modal = document.getElementById('blossom-deck-modal');
    if (!modal) return;
    modal.hidden = true;
}

function openBlossomFieldModal() {
    const modal = document.getElementById('blossom-field-modal');
    if (!modal || !blossomGameState) return;
    renderBlossomFieldModal();
    modal.hidden = false;
}

function closeBlossomFieldModal() {
    const modal = document.getElementById('blossom-field-modal');
    if (!modal) return;
    modal.hidden = true;
}

function toggleBlossomDeckCard(uid) {
    if (!blossomGameState || !uid) return;
    const card = getBlossomRoundCardByUid('player', uid);
    if (!card || card.used) return;
    const current = new Set(blossomGameState.deckModalSelectionIds || []);
    if (current.has(uid)) {
        current.delete(uid);
    } else {
        const currentCards = Array.from(current).map((id) => getBlossomRoundCardByUid('player', id)).filter(Boolean);
        if (currentCards.length >= BLOSSOM_ROUND_CARD_COUNT) {
            showCenterNotice('이번 라운드에는 4장만 선택할 수 있습니다.');
            return;
        }
        if (countBlossomSeasonInSelection(currentCards, card.season) >= BLOSSOM_ROUND_SEASON_LIMIT) {
            showCenterNotice('같은 계절 카드는 라운드당 최대 3장까지만 선택할 수 있습니다.');
            return;
        }
        current.add(uid);
    }
    blossomGameState.deckModalSelectionIds = Array.from(current);
    renderBlossomDeckModalRows();
}

function confirmBlossomDeckSelection() {
    if (!blossomGameState) return;
    if ((blossomGameState.deckModalSelectionIds || []).length !== BLOSSOM_ROUND_CARD_COUNT) {
        showCenterNotice('이번 라운드에 제출할 4장을 모두 선택해 주세요.');
        return;
    }
    blossomGameState.playerRoundSelectionIds = blossomGameState.deckModalSelectionIds.slice();
    closeBlossomDeckModal();
    renderBlossomGame();
}

function getBlossomRoundSeasonCounts(cards) {
    const counts = { spring: 0, summer: 0, autumn: 0, winter: 0 };
    (cards || []).forEach((card) => {
        if (card && counts[card.season] !== undefined) counts[card.season] += 1;
    });
    return counts;
}

function getBlossomRoundOwnerSeasonSum(cards, season) {
    return (cards || []).filter((card) => card && card.season === season).reduce((sum, card) => sum + Number(card.value || 0), 0);
}

function chooseBlossomWinningSeason(contenders) {
    const scores = {};
    (contenders || []).forEach((season) => {
        let score = 0;
        (contenders || []).forEach((other) => {
            if (season === other) return;
            if (BLOSSOM_ROUND_MATCHUP[season] === other) score += 1;
            if (BLOSSOM_ROUND_MATCHUP[other] === season) score -= 1;
        });
        scores[season] = score;
    });
    const values = Object.values(scores);
    if (!values.length) return { season: '', scores };
    const maxScore = Math.max(...values);
    const finalists = Object.keys(scores).filter((season) => scores[season] === maxScore);
    return { season: finalists.length === 1 ? finalists[0] : '', scores, finalists };
}

function resolveBlossomRoundBattle(playerCards, comCards) {
    const allCards = [].concat(playerCards || [], comCards || []);
    const counts = getBlossomRoundSeasonCounts(allCards);
    const countValues = Object.values(counts);
    const maxCount = countValues.length ? Math.max(...countValues) : 0;
    const contenders = BLOSSOM_SEASONS.filter((season) => counts[season] === maxCount && maxCount > 0);
    const logLines = [];
    logLines.push(`[분석] 필드 분포 -> 봄:${counts.spring}장 | 여름:${counts.summer}장 | 가을:${counts.autumn}장 | 겨울:${counts.winter}장`);
    if (BLOSSOM_SEASONS.every((season) => counts[season] === 2)) {
        logLines.push('[규칙] 사계절 모두 2장씩 배치되어 4자 조건 무승부가 선언되었습니다.');
        return { winner: 'draw', season: '', headline: '무승부 라운드', logLines };
    }
    const winningSeasonInfo = chooseBlossomWinningSeason(contenders);
    let dominantSeason = winningSeasonInfo.season;
    if (contenders.length > 1) {
        logLines.push(`[분석] 최다 계절 후보 -> ${contenders.map((season) => BLOSSOM_SEASON_LABELS[season]).join(', ')} (${maxCount}장 동률)`);
    } else if (contenders.length === 1) {
        logLines.push(`[분석] 최다 계절 -> ${BLOSSOM_SEASON_LABELS[contenders[0]]} (${maxCount}장)`);
    }
    if (contenders.length > 1 && !dominantSeason) {
        logLines.push('[상성 결과] 상성상 우위를 가르는 단일 계절이 없어 이번 라운드는 무승부입니다.');
        return { winner: 'draw', season: '', headline: '무승부 라운드', logLines };
    }
    if (!dominantSeason) {
        logLines.push('[시스템] 우세 계절을 가리지 못해 무승부 처리되었습니다.');
        return { winner: 'draw', season: '', headline: '무승부 라운드', logLines };
    }
    if (contenders.length > 1) {
        logLines.push(`[상성 결과] ${BLOSSOM_SEASON_LABELS[dominantSeason]}이 [${contenders.map((season) => BLOSSOM_SEASON_LABELS[season]).join(', ')}] 중 우세합니다.`);
    }
    const playerSum = getBlossomRoundOwnerSeasonSum(playerCards, dominantSeason);
    const comSum = getBlossomRoundOwnerSeasonSum(comCards, dominantSeason);
    logLines.push(`[합산 점수] ${BLOSSOM_SEASON_LABELS[dominantSeason]} 점수 비교 -> PLAYER: ${playerSum}점 vs COM: ${comSum}점`);
    if (playerSum > comSum) {
        logLines.push('[결과] PLAYER가 더 높은 합산 수치로 계절 점유권을 가져갔습니다!');
        return { winner: 'player', season: dominantSeason, headline: 'PLAYER 라운드 승리!', logLines, playerSum, comSum };
    }
    if (comSum > playerSum) {
        logLines.push('[결과] COM이 더 높은 합산 수치로 계절 점유권을 가져갔습니다!');
        return { winner: 'com', season: dominantSeason, headline: 'COM 라운드 승리!', logLines, playerSum, comSum };
    }
    logLines.push('[결과] 합산 점수까지 동일하여 무승부 처리되었습니다.');
    return { winner: 'draw', season: dominantSeason, headline: '무승부 라운드', logLines, playerSum, comSum };
}

function pickBlossomComPrimarySeason(availableCards) {
    if (!Array.isArray(availableCards) || !availableCards.length) return BLOSSOM_SEASONS[0];
    const availableSeasons = BLOSSOM_SEASONS.filter((season) => availableCards.some((card) => card && card.season === season));
    return shuffleBlossomArray(availableSeasons)[0] || BLOSSOM_SEASONS[0];
}

function chooseBlossomComRoundCards() {
    const availableCards = getBlossomRoundRemainingDeck('com');
    const chosen = [];
    const bySeason = {};
    BLOSSOM_SEASONS.forEach((season) => {
        bySeason[season] = shuffleBlossomArray(availableCards.filter((card) => card && card.season === season));
    });
    const primaryCandidates = BLOSSOM_SEASONS.filter((season) => bySeason[season].length >= BLOSSOM_ROUND_SEASON_LIMIT);
    if (primaryCandidates.length) {
        const primarySeason = shuffleBlossomArray(primaryCandidates)[0];
        chosen.push(...bySeason[primarySeason].slice(0, BLOSSOM_ROUND_SEASON_LIMIT));
        const offSeasonPool = shuffleBlossomArray(
            BLOSSOM_SEASONS
                .filter((season) => season !== primarySeason)
                .flatMap((season) => bySeason[season])
        );
        if (offSeasonPool.length) {
            chosen.push(offSeasonPool[0]);
            return chosen.slice(0, BLOSSOM_ROUND_CARD_COUNT);
        }
        chosen.length = 0;
    }
    const seasonCounts = { spring: 0, summer: 0, autumn: 0, winter: 0 };
    let primarySeason = pickBlossomComPrimarySeason(availableCards);
    const primaryTarget = Math.min(BLOSSOM_ROUND_SEASON_LIMIT, bySeason[primarySeason] ? bySeason[primarySeason].length : 0) || 1;
    while (chosen.length < BLOSSOM_ROUND_CARD_COUNT) {
        let pool = availableCards.filter((card) => !chosen.includes(card) && seasonCounts[card.season] < BLOSSOM_ROUND_SEASON_LIMIT);
        if (!pool.length) break;
        let candidatePool = pool;
        if (seasonCounts[primarySeason] < primaryTarget) {
            const primaryCards = pool.filter((card) => card.season === primarySeason);
            if (primaryCards.length) candidatePool = primaryCards;
        }
        const picked = shuffleBlossomArray(candidatePool)[0];
        if (!picked) break;
        chosen.push(picked);
        seasonCounts[picked.season] += 1;
        if (seasonCounts[primarySeason] >= primaryTarget && chosen.length < BLOSSOM_ROUND_CARD_COUNT) {
            const alternateSeasons = shuffleBlossomArray(BLOSSOM_SEASONS.filter((season) => season !== primarySeason));
            primarySeason = alternateSeasons[0] || primarySeason;
        }
    }
    return chosen.slice(0, BLOSSOM_ROUND_CARD_COUNT);
}

function consumeBlossomRoundCards(owner, ids) {
    const source = owner === 'com' ? blossomGameState.comDeck : blossomGameState.playerDeck;
    const usedCards = [];
    (ids || []).forEach((uid) => {
        const card = source.find((entry) => entry && entry.uid === uid && !entry.used);
        if (!card) return;
        card.used = true;
        usedCards.push(card);
    });
    return usedCards;
}

function updateBlossomRoundField(playerCards, comCards) {
    const fieldCards = new Array(8).fill(null);
    let playerIndex = 0;
    let comIndex = 0;
    BLOSSOM_ROUND_FIELD_LAYOUT.forEach((layout) => {
        if (layout.owner === 'player') {
            fieldCards[layout.slot] = playerCards[playerIndex] || null;
            playerIndex += 1;
        } else {
            fieldCards[layout.slot] = comCards[comIndex] || null;
            comIndex += 1;
        }
    });
    blossomGameState.fieldCards = fieldCards;
}

function finishBlossomMatchIfNeeded() {
    if (!blossomGameState) return false;
    const state = blossomGameState;
    const roundFinished = state.round - 1;
    let title = '';
    let copy = '';
    if (state.playerWins >= BLOSSOM_ROUND_WIN_TARGET) {
        title = 'WIN';
        copy = `축하합니다! PLAYER가 먼저 ${BLOSSOM_ROUND_WIN_TARGET}승을 선점하여 최종 승리했습니다.`;
    } else if (state.comWins >= BLOSSOM_ROUND_WIN_TARGET) {
        title = 'LOSE';
        copy = `COM이 먼저 ${BLOSSOM_ROUND_WIN_TARGET}승을 선점하여 경기를 가져갔습니다.`;
    } else if (roundFinished >= BLOSSOM_ROUND_MAX) {
        if (state.playerWins > state.comWins) {
            title = 'WIN';
            copy = `5라운드 종료 기준 PLAYER가 ${state.playerWins}승으로 최종 승리했습니다.`;
        } else if (state.comWins > state.playerWins) {
            title = 'LOSE';
            copy = `5라운드 종료 기준 COM이 ${state.comWins}승으로 최종 승리했습니다.`;
        } else {
            title = 'DRAW';
            copy = `5라운드 종료 기준 PLAYER ${state.playerWins}승 / COM ${state.comWins}승으로 무승부입니다.`;
        }
    }
    if (!title) return false;
    state.gameOver = true;
    const overlay = document.getElementById('blossom-final-overlay');
    const titleEl = document.getElementById('blossom-final-title');
    const copyEl = document.getElementById('blossom-final-copy');
    if (titleEl) titleEl.textContent = title;
    if (copyEl) copyEl.textContent = copy;
    if (overlay) overlay.hidden = false;
    return true;
}

function prepareBlossomNextRound() {
    if (!blossomGameState || blossomGameState.gameOver || !blossomGameState.awaitingNextRound) return;
    blossomGameState.pendingStage = null;
    blossomGameState.awaitingNextRound = false;
    blossomGameState.roundStatusText = '대결 준비 완료';
    blossomGameState.fieldCards = new Array(8).fill(null);
    renderBlossomGame();
}

function handleBlossomRoundAction() {
    if (!blossomGameState) return;
    if (blossomGameState.gameOver) {
        startBlossomMode();
        return;
    }
    if (blossomGameState.awaitingNextRound && !blossomGameState.gameOver) {
        prepareBlossomNextRound();
        return;
    }
    startBlossomRoundBattle();
}

function startBlossomRoundBattle() {
    if (!blossomGameState || blossomGameState.gameOver) return;
    if ((blossomGameState.playerRoundSelectionIds || []).length !== BLOSSOM_ROUND_CARD_COUNT) {
        showCenterNotice('이번 라운드에 제출할 카드 4장을 모두 선택해 주세요.');
        return;
    }
    const playerCards = consumeBlossomRoundCards('player', blossomGameState.playerRoundSelectionIds);
    const comCards = chooseBlossomComRoundCards();
    consumeBlossomRoundCards('com', comCards.map((card) => card.uid));
    updateBlossomRoundField(playerCards, comCards);
    const resolution = resolveBlossomRoundBattle(playerCards, comCards);
    blossomGameState.logs = resolution.logLines || [];
    blossomGameState.lastRoundWinner = resolution.winner || 'draw';
    blossomGameState.roundStatusText = resolution.headline || '대결 완료';
    if (resolution.winner === 'player') {
        blossomGameState.playerWins += 1;
        blossomGameState.playerWinSeasons.push(blossomGameState.stageSeason || 'spring');
    }
    if (resolution.winner === 'com') {
        blossomGameState.comWins += 1;
        blossomGameState.comWinSeasons.push(blossomGameState.stageSeason || 'spring');
    }
    if (resolution.winner === 'draw') blossomGameState.draws += 1;
    blossomGameState.playerRoundSelectionIds = [];
    blossomGameState.deckModalSelectionIds = [];
    blossomGameState.round += 1;
    if (!finishBlossomMatchIfNeeded()) {
        blossomGameState.awaitingNextRound = true;
        blossomGameState.pendingStage = null;
    }
    renderBlossomGame();
}

function closeBlossomFinalOverlay() {
    const overlay = document.getElementById('blossom-final-overlay');
    if (overlay) overlay.hidden = true;
}

function initializeBlossomGame() {
    clearBlossomTimers();
    const playerDeck = buildBlossomRoundDeck('player');
    const comDeck = buildBlossomRoundDeck('com');
    const stage = pickRandomBlossomStage();
    if (playerDeck.length !== BLOSSOM_CARDS_PER_SEASON * BLOSSOM_SEASONS.length || comDeck.length !== BLOSSOM_CARDS_PER_SEASON * BLOSSOM_SEASONS.length) {
        showCenterNotice('BLOSSOM 덱을 구성하지 못했습니다.');
        return false;
    }
    blossomGameState = {
        mode: 'round-board',
        round: 1,
        playerWins: 0,
        comWins: 0,
        draws: 0,
        playerWinSeasons: [],
        comWinSeasons: [],
        playerDeck,
        comDeck,
        playerRoundSelectionIds: [],
        deckModalSelectionIds: [],
        fieldCards: new Array(8).fill(null),
        stageSeason: stage.season,
        stageLabel: `${stage.seasonLabel} · ${stage.termName}`,
        stageBackground: stage.background,
        roundStatusText: '대결 준비 완료',
        awaitingNextRound: false,
        pendingStage: null,
        lastRoundWinner: '',
        logs: ['[시스템] 보드게임이 리셋되었습니다. DECK 오픈을 눌러 카드를 장착하세요!'],
        gameOver: false
    };
    return true;
}

function startBlossomMode() {
    if (!initializeBlossomGame()) return;
    const overlay = document.getElementById('blossom-final-overlay');
    const deckModal = document.getElementById('blossom-deck-modal');
    const fieldModal = document.getElementById('blossom-field-modal');
    if (overlay) overlay.hidden = true;
    if (deckModal) deckModal.hidden = true;
    if (fieldModal) fieldModal.hidden = true;
    const audio = getBlossomMusicElement();
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
        delete audio.dataset.currentTrack;
    }
    showTab('boardgame-blossom-play-section');
    renderBlossomGame();
    setTimeout(() => {
        syncBlossomMusicPlayback();
    }, 0);
}

function requestBlossomModeStart() {
    if (blossomModeDeveloperUnlocked) {
        startBlossomMode();
        return;
    }
    openBlossomDevlock();
}


const JOKER_MAX_LIFE = 10;
const JOKER_ROUND_COUNT = 5;
const JOKER_TURNS_PER_ROUND = 10;
const JOKER_TOKENS_PER_PLAYER = 5;
const JOKER_TIMER_LIMIT = 300;
const JOKER_STARTING_ROUND_POINT = 5;
const JOKER_TOKEN_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const JOKER_COM_JOKER_CALL_CHANCE = 0.05;
let jokerGameTimer = null;
let jokerGameSecondsLeft = JOKER_TIMER_LIMIT;
let jokerGameState = null;
let jokerMusicEnabled = false;
let jokerMusicVolume = 0.55;
let jokerVolumePanelOpen = false;
let baseballMusicEnabled = false;
let baseballMusicVolume = 0.55;
let baseballVolumePanelOpen = false;
let quinter9MusicEnabled = false;
let quinter9MusicVolume = 0.55;
let quinter9VolumePanelOpen = false;
let blossomMusicEnabled = false;
let blossomMusicVolume = 0.55;
let blossomVolumePanelOpen = false;
const BLOSSOM_BGM_TRACKS = {
    spring: { src: 'boardgame/blossom/Spring.mp3', title: 'SPRING' },
    summer: { src: 'boardgame/blossom/Summer.mp3', title: 'SUMMER' },
    autumn: { src: 'boardgame/blossom/Autumn.mp3', title: 'AUTUMN' },
    winter: { src: 'boardgame/blossom/Winter.mp3', title: 'WINTER' }
};
const QUINTER9_BGM_TRACKS = [
    'boardgame/quinter9/Fairytale.mp3',
    'boardgame/quinter9/Timeless.mp3'
];
let jokerTurnNoticeTimer = null;
let jokerPendingRoundTimer = null;
let jokerPendingComTurnTimer = null;

function getJokerPlayablePool() {
    if (typeof items === 'undefined' || !Array.isArray(items)) return [];
    return items.filter((item) => {
        const code = getItemNumericCode(item);
        if (code === null) return false;
        if (isQmPlaceholderItem(item)) return false;
        return true;
    });
}

function hasJokerRepeatedDigits(item) {
    const code = getItemNumericCode(item);
    if (code === null) return false;
    const value = String(code).padStart(5, '0');
    return new Set(value.split('')).size < value.length;
}

function getJokerCardAssetPath(item) {
    const stampAsset = (getStampInfo(item, daysSince(item && item.date)) || {}).asset;
    const mapping = {
        V: 'Voucher',
        G: 'GoldSilver',
        M: 'MasterLabel',
        S: 'Salon',
        X: 'Collab',
        BW: 'BlackWhite'
    };
    const filename = mapping[stampAsset] || 'Royal';
    return `boardgame/Joker/card/${filename}.png`;
}

function sampleJokerItems(source, count, usedKeys) {
    const pool = source.filter((item) => !usedKeys.has(buildItemKey(item)));
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

function createJokerStartingHand(normalPool, jokerPool, usedKeys) {
    const normalCards = sampleJokerItems(normalPool, 3, usedKeys);
    normalCards.forEach((item) => usedKeys.add(buildItemKey(item)));
    const jokerCards = sampleJokerItems(jokerPool, 2, usedKeys);
    jokerCards.forEach((item) => usedKeys.add(buildItemKey(item)));
    return [...normalCards, ...jokerCards].sort(() => Math.random() - 0.5);
}

function renderJokerLives() {
    const roots = document.querySelectorAll('[data-joker-lives-root]');
    if (!roots.length || !jokerGameState) return;
    roots.forEach((root) => {
        const playerIdx = Number(root.getAttribute('data-joker-lives-root'));
        const life = jokerGameState.players[playerIdx]?.life ?? 0;
        root.innerHTML = Array.from({ length: JOKER_MAX_LIFE }, (_, index) =>
            `<span class="quiz-life ${index < life ? '' : 'lost'}" data-joker-life-player="${playerIdx}" data-joker-life-index="${index}">&#10084;</span>`
        ).join('');
    });
}

function animateJokerLifeLoss(playerIdx, amount) {
    if (!amount) return;
    const player = jokerGameState && jokerGameState.players[playerIdx];
    if (!player) return;
    const startLife = player.life;
    for (let offset = 0; offset < amount; offset++) {
        const lostIndex = startLife - 1 - offset;
        const heartEls = document.querySelectorAll(`[data-joker-life-player="${playerIdx}"][data-joker-life-index="${lostIndex}"]`);
        heartEls.forEach((heartEl) => {
            heartEl.classList.add('bursting');
            createQuizHeartBurst(heartEl);
        });
    }
}
function createJokerCountBurst(target) {
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const x = rect.left + (rect.width / 2);
    const y = rect.top + (rect.height / 2);

    for (let i = 0; i < 8; i++) {
        const particle = document.createElement('div');
        particle.className = 'white-star-particle';
        particle.textContent = '✦';
        document.body.appendChild(particle);

        const angle = Math.random() * Math.PI * 2;
        const velocity = 22 + Math.random() * 24;
        const tx = Math.cos(angle) * velocity;
        const ty = Math.sin(angle) * velocity - 8;

        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        particle.style.setProperty('--tx', `${tx}px`);
        particle.style.setProperty('--ty', `${ty}px`);

        setTimeout(() => particle.remove(), 520);
    }
}

function createKaprekarLifeBurst(owner) {
    const target = document.querySelector(`.kaprekar-board-life-panel.is-${owner}`);
    if (!target) return;
    createJokerCountBurst(target);
}



function createBaseballDefensiveGemBurst(target) {
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const y = rect.top + (rect.height * 0.42);
    const positions = [
        rect.left + (rect.width * 0.18),
        rect.right - (rect.width * 0.18)
    ];

    positions.forEach((x) => {
        for (let i = 0; i < 7; i++) {
            const particle = document.createElement('div');
            particle.className = 'white-star-particle';
            particle.textContent = '✦';
            document.body.appendChild(particle);

            const angle = Math.random() * Math.PI * 2;
            const velocity = 20 + Math.random() * 24;
            const tx = Math.cos(angle) * velocity;
            const ty = Math.sin(angle) * velocity - 6;

            particle.style.left = `${x}px`;
            particle.style.top = `${y}px`;
            particle.style.setProperty('--tx', `${tx}px`);
            particle.style.setProperty('--ty', `${ty}px`);

            setTimeout(() => particle.remove(), 520);
        }
    });
}

function applyJokerLifeChange(playerIdx, amount) {
    if (!jokerGameState || amount <= 0) return;
    const player = jokerGameState.players[playerIdx];
    if (!player) return;
    const nextLife = Math.max(0, player.life - amount);
    animateJokerLifeLoss(playerIdx, player.life - nextLife);
    setTimeout(() => {
        player.life = nextLife;
        renderJokerLives();
    }, 420);
}

function formatJokerCode(code) {
    return code === null ? '-----' : String(code).padStart(5, '0');
}

function getJokerHandLayoutClass(count) {
    if (count >= 5) return 'count-5';
    if (count === 4) return 'count-4';
    if (count === 3) return 'count-3';
    if (count === 2) return 'count-2';
    return 'count-1';
}

function getJokerCardMarkup(item, options = {}) {
    const {
        hidden = false,
        selected = false,
        disabled = false,
        button = false,
        onclick = ''
    } = options;
    const classNames = ['joker-card'];
    if (hidden) classNames.push('joker-card-back');
    if (selected) classNames.push('is-selected');
    if (disabled) classNames.push('is-disabled');
    const attrs = [];
    if (button) {
        attrs.push('type="button"');
        if (onclick) attrs.push(`onclick="${onclick}"`);
        if (disabled) attrs.push('disabled');
    }
    const tag = button ? 'button' : 'div';
    if (hidden || !item) {
        return `<${tag} class="${classNames.join(' ')}" ${attrs.join(' ')}></${tag}>`;
    }
    const code = formatJokerCode(getItemNumericCode(item));
    const imageSrc = resolveItemImageSrc(item);
    return `
        <${tag} class="${classNames.join(' ')}" ${attrs.join(' ')} style="background-image:url('${getJokerCardAssetPath(item)}')">
            <div class="joker-card-art"><img src="${imageSrc}" alt="${item.name || 'ITEM'}"></div>
            <div class="joker-card-name">${item.name || 'ITEM'}</div>
            <div class="joker-card-code">${code}</div>
        </${tag}>
    `;
}

function renderJokerCodeSlots(playerIdx) {
    const root = document.getElementById(`joker-player-${playerIdx + 1}-code`);
    if (!root || !jokerGameState) return;
    const remaining = jokerGameState.remainingCount[playerIdx];
    root.innerHTML = `
        <div class="joker-count-box">
            <span class="joker-count-label">Count</span>
            <strong class="joker-count-value">${remaining}</strong>
        </div>
    `;
}

function renderJokerSelectedCard(playerIdx) {
    const root = document.getElementById(`joker-player-${playerIdx + 1}-selected`);
    if (!root || !jokerGameState) return;
    const selectedIndex = jokerGameState.players[playerIdx].selectedIndex;
    const item = selectedIndex === null ? null : jokerGameState.players[playerIdx].hand[selectedIndex];
    if (!item) {
        root.innerHTML = getJokerCardMarkup(null, { hidden: true });
        return;
    }
    if (jokerGameState.phase === 'round' || jokerGameState.phase === 'round-ready') {
        root.innerHTML = playerIdx === 0
            ? getJokerCardMarkup(item)
            : getJokerCardMarkup(null, { hidden: true });
        return;
    }
    root.innerHTML = getJokerCardMarkup(item);
}

function renderJokerHand(playerIdx) {
    const root = document.getElementById(`joker-player-${playerIdx + 1}-hand`);
    if (!root || !jokerGameState) return;
    const hand = jokerGameState.players[playerIdx].hand;
    const isCom = playerIdx === 1;
    root.className = `joker-draw-grid ${getJokerHandLayoutClass(Math.max(hand.length, 1))}`;
    if (!hand.length) {
        root.innerHTML = '<div class="joker-code-slot">EMPTY</div>';
        return;
    }
    root.innerHTML = hand.map((item, index) => {
        const selected = jokerGameState.players[playerIdx].selectedIndex === index;
        const disabled = jokerGameState.phase !== 'select' || isCom;
        if (isCom) {
            return getJokerCardMarkup(null, {
                button: false,
                hidden: true,
                selected,
                disabled
            });
        }
        return getJokerCardMarkup(item, {
            button: true,
            onclick: isCom ? '' : `selectJokerHandCard(${playerIdx}, ${index})`,
            selected,
            disabled
        });
    }).join('');
}

function renderJokerTokenRow() {
    const roots = document.querySelectorAll('[data-joker-token-row]');
    if (!roots.length || !jokerGameState) return;
    roots.forEach((root) => {
        const rowType = root.getAttribute('data-joker-token-row');
        const playerIdx = rowType === 'top' ? 1 : 0;
        const rowPlayer = jokerGameState.players[playerIdx];
        const isPlayerRow = playerIdx === 0;
        const markup = JOKER_TOKEN_VALUES.map((value) => {
            const isUsed = rowPlayer && rowPlayer.usedTokens.includes(value);
            const isInteractive = jokerGameState.phase === 'round'
                && !!rowPlayer
                && isPlayerRow
                && jokerGameState.activePlayer === 0
                && !isUsed
                && rowPlayer.usedTokens.length < JOKER_TOKENS_PER_PLAYER;
            const className = `joker-token-btn ${isUsed ? 'is-used' : ''} ${isInteractive ? '' : 'is-readonly'}`.trim();
            const onclickAttr = isInteractive ? ' onclick="useJokerToken(' + value + ')"' : '';
            const tabindexAttr = isInteractive ? '' : ' tabindex="-1"';
            return `<button class="${className}" type="button"${onclickAttr}${tabindexAttr}>${value}</button>`;
        }).join('');
        root.innerHTML = markup;
    });
}
function setJokerFeedback(message, color = '#7a4f00') {
    const feedback = document.getElementById('joker-feedback');
    if (!feedback) return;
    feedback.textContent = message || '';
    feedback.style.color = color;
}

function clearJokerPendingTimers() {
    const layer = document.getElementById('joker-turn-notice');
    if (jokerTurnNoticeTimer) {
        clearTimeout(jokerTurnNoticeTimer);
        jokerTurnNoticeTimer = null;
    }
    if (jokerPendingRoundTimer) {
        clearTimeout(jokerPendingRoundTimer);
        jokerPendingRoundTimer = null;
    }
    if (jokerPendingComTurnTimer) {
        clearTimeout(jokerPendingComTurnTimer);
        jokerPendingComTurnTimer = null;
    }
    if (layer) {
        layer.classList.remove('is-visible');
        layer.setAttribute('aria-hidden', 'true');
    }
}

function showJokerTurnNotice(message, duration = 1400) {
    const layer = document.getElementById('joker-turn-notice');
    const text = document.getElementById('joker-turn-notice-text');
    if (!layer || !text) return;
    if (jokerTurnNoticeTimer) {
        clearTimeout(jokerTurnNoticeTimer);
        jokerTurnNoticeTimer = null;
    }
    text.textContent = message || '';
    layer.classList.add('is-visible');
    layer.setAttribute('aria-hidden', 'false');
    jokerTurnNoticeTimer = setTimeout(() => {
        layer.classList.remove('is-visible');
        layer.setAttribute('aria-hidden', 'true');
        jokerTurnNoticeTimer = null;
    }, duration);
}

function updateJokerHud() {
    if (!jokerGameState) return;
    const roundEl = document.getElementById('joker-round-label');
    const turnEl = document.getElementById('joker-turn-label');
    const statusTitle = document.getElementById('joker-status-title');
    const statusText = document.getElementById('joker-status-text');
    const activeText = document.getElementById('joker-active-player');
    const jokerUsage = document.getElementById('joker-joker-usage');
    const point1 = document.getElementById('joker-player-1-turn-point');
    const point2 = document.getElementById('joker-player-2-turn-point');
    const startBtn = document.getElementById('joker-start-round-btn');
    const nextBtn = document.getElementById('joker-next-round-btn');
    const callBtn = document.getElementById('joker-call-btn');

    if (roundEl) roundEl.textContent = `ROUND ${jokerGameState.round} / ${JOKER_ROUND_COUNT}`;
    if (turnEl) {
        if (jokerGameState.phase === 'round') turnEl.textContent = `TURN ${jokerGameState.turn} / ${JOKER_TURNS_PER_ROUND}`;
        else if (jokerGameState.phase === 'round-ready') turnEl.textContent = 'TURN READY';
        else if (jokerGameState.phase === 'resolution') turnEl.textContent = 'ROUND END';
        else if (jokerGameState.phase === 'gameover') turnEl.textContent = 'GAME OVER';
        else turnEl.textContent = 'TURN READY';
    }
    if (statusTitle) {
        if (jokerGameState.phase === 'round') statusTitle.textContent = 'ROUND IN PLAY';
        else if (jokerGameState.phase === 'round-ready') statusTitle.textContent = 'ROUND READY';
        else if (jokerGameState.phase === 'resolution') statusTitle.textContent = 'ROUND RESULT';
        else if (jokerGameState.phase === 'gameover') statusTitle.textContent = 'FINAL RESULT';
        else statusTitle.textContent = '라운드 도우미';
    }
    if (statusText) {
        if (jokerGameState.phase === 'round') {
            statusText.textContent = '숫자 혹은 조커 선언을 통해 상대방의 카드 코드 번호를 유추합니다.';
        } else if (jokerGameState.phase === 'round-ready') {
            statusText.textContent = '상대가 카드를 고르는 중입니다.';
        } else if (jokerGameState.phase === 'resolution') {
            statusText.textContent = '라운드가 종료되었습니다. 확인 후 다음 라운드로 이동하세요.';
        } else if (jokerGameState.phase === 'gameover') {
            statusText.textContent = '경기 종료.';
        } else {
            statusText.textContent = '플레이어와 COM은 카드 한 장씩 선택해주세요.';
        }
    }
    if (activeText) {
        activeText.textContent = `ACTIVE: ${jokerGameState.activePlayer === 0 ? 'PLAYER' : 'COM'}`;
    }
    if (jokerUsage) {
        jokerUsage.textContent = `조커 선언 플레이어 ${jokerGameState.players[0].jokerCallsLeft}회 남음 / COM ${jokerGameState.players[1].jokerCallsLeft}회 남음`;
    }
    if (point1) point1.textContent = `TURN POINT ${jokerGameState.players[0].roundPoint}`;
    if (point2) point2.textContent = `TURN POINT ${jokerGameState.players[1].roundPoint}`;
    if (startBtn) startBtn.style.display = jokerGameState.phase === 'select' ? 'inline-flex' : 'none';
    if (nextBtn) nextBtn.style.display = jokerGameState.phase === 'resolution' ? 'inline-flex' : 'none';
    if (callBtn) {
        const callsLeft = jokerGameState.players[jokerGameState.activePlayer]?.jokerCallsLeft || 0;
        callBtn.disabled = jokerGameState.phase !== 'round' || jokerGameState.activePlayer !== 0 || callsLeft <= 0;
    }
}

function renderJokerBoard() {
    if (!jokerGameState) return;
    renderJokerLives();
    renderJokerHand(0);
    renderJokerHand(1);
    renderJokerCodeSlots(0);
    renderJokerCodeSlots(1);
    renderJokerSelectedCard(0);
    renderJokerSelectedCard(1);
    renderJokerTokenRow();
    updateJokerHud();
}

function selectJokerHandCard(playerIdx, cardIndex) {
    if (!jokerGameState || jokerGameState.phase !== 'select') return;
    if (playerIdx !== 0) return;
    const player = jokerGameState.players[playerIdx];
    if (!player || !player.hand[cardIndex]) return;
    player.selectedIndex = cardIndex;
    renderJokerBoard();
}

function pickRandomJokerHandIndex(playerIdx) {
    const player = jokerGameState && jokerGameState.players[playerIdx];
    if (!player || !player.hand.length) return null;
    return Math.floor(Math.random() * player.hand.length);
}

function getAvailableJokerTokensForPlayer(playerIdx) {
    const player = jokerGameState && jokerGameState.players[playerIdx];
    if (!player) return [];
    return JOKER_TOKEN_VALUES.filter((value) => !player.usedTokens.includes(value));
}

function getJokerCardCountInHand(playerIdx) {
    const player = jokerGameState && jokerGameState.players[playerIdx];
    if (!player || !Array.isArray(player.hand)) return 0;
    return player.hand.filter((item) => item && hasJokerRepeatedDigits(item)).length;
}

function getNormalCardCountInHand(playerIdx) {
    const player = jokerGameState && jokerGameState.players[playerIdx];
    if (!player || !Array.isArray(player.hand)) return 0;
    return player.hand.filter((item) => item && !hasJokerRepeatedDigits(item)).length;
}

function maybeQueueComTurn() {
    if (!jokerGameState || jokerGameState.phase !== 'round' || jokerGameState.activePlayer !== 1) return;
    if (jokerPendingComTurnTimer) {
        clearTimeout(jokerPendingComTurnTimer);
        jokerPendingComTurnTimer = null;
    }
    jokerPendingComTurnTimer = window.setTimeout(() => {
        jokerPendingComTurnTimer = null;
        if (!jokerGameState || jokerGameState.phase !== 'round' || jokerGameState.activePlayer !== 1) return;
        const com = jokerGameState.players[1];
        const playerJokerCardCount = getJokerCardCountInHand(0);
        const playerNormalCardCount = getNormalCardCountInHand(0);
        const availableTokens = getAvailableJokerTokensForPlayer(1);
        let shouldCallJoker = false;
        if (com.jokerCallsLeft > 0) {
            if (playerJokerCardCount > 0 && playerNormalCardCount === 0) shouldCallJoker = true;
            else if (playerJokerCardCount === 0) shouldCallJoker = false;
            else {
                const comJokerCallChance = com.life <= 5 ? 0.025 : JOKER_COM_JOKER_CALL_CHANCE;
                shouldCallJoker = Math.random() < comJokerCallChance;
            }
        }
        if (shouldCallJoker) {
            declareJokerCall();
            return;
        }
        if (!availableTokens.length) {
            resolveJokerRound();
            return;
        }
        const chosenToken = availableTokens[Math.floor(Math.random() * availableTokens.length)];
        useJokerToken(chosenToken);
    }, 1500);
}
function updateJokerTimerDisplay() {
    const bar = document.getElementById('joker-timer-bar');
    const text = document.getElementById('joker-timer-text');
    const ratio = Math.max(0, Math.min(1, jokerGameSecondsLeft / JOKER_TIMER_LIMIT));
    if (bar) bar.style.width = `${ratio * 100}%`;
    if (text) {
        const minutes = String(Math.floor(jokerGameSecondsLeft / 60)).padStart(2, '0');
        const seconds = String(jokerGameSecondsLeft % 60).padStart(2, '0');
        text.textContent = `TIME ${minutes}:${seconds}`;
    }
}
function stopJokerTimer() {
    if (jokerGameTimer) {
        clearInterval(jokerGameTimer);
        jokerGameTimer = null;
    }
}

function startJokerTimer() {
    stopJokerTimer();
    jokerGameSecondsLeft = JOKER_TIMER_LIMIT;
    updateJokerTimerDisplay();
    jokerGameTimer = setInterval(() => {
        jokerGameSecondsLeft = Math.max(0, jokerGameSecondsLeft - 1);
        updateJokerTimerDisplay();
        if (jokerGameSecondsLeft <= 0) {
            stopJokerTimer();
            finishJokerGame('TIME OVER');
        }
    }, 1000);
}

function startJokerMode() {
    const pool = getJokerPlayablePool();
    const normalPool = pool.filter((item) => !hasJokerRepeatedDigits(item));
    const jokerPool = pool.filter((item) => hasJokerRepeatedDigits(item));
    if (normalPool.length < 6 || jokerPool.length < 4) {
        alert('Not enough coded cards to start JOKER mode yet.');
        return;
    }

    const usedKeys = new Set();
    jokerGameState = {
        phase: 'select',
        round: 1,
        turn: 0,
        activePlayer: 0,
        players: [
            {
                life: JOKER_MAX_LIFE,
                hand: createJokerStartingHand(normalPool, jokerPool, usedKeys),
                selectedIndex: null,
                jokerCallsLeft: 2,
                usedTokens: [],
                roundPoint: JOKER_STARTING_ROUND_POINT
            },
            {
                life: JOKER_MAX_LIFE,
                hand: createJokerStartingHand(normalPool, jokerPool, usedKeys),
                selectedIndex: null,
                jokerCallsLeft: 2,
                usedTokens: [],
                roundPoint: JOKER_STARTING_ROUND_POINT
            }
        ],
        remainingCount: [5, 5],
        resolvedByJokerCall: false
    };
    clearJokerPendingTimers();
    setJokerFeedback('');
    renderJokerBoard();
    showTab('boardgame-joker-play-section');
}

function startJokerRound() {
    if (!jokerGameState || jokerGameState.phase !== 'select') return;
    const ready = jokerGameState.players[0].selectedIndex !== null;
    if (!ready) {
        setJokerFeedback('사용하실 카드를 선택하여 주십시오.', '#a36a00');
        return;
    }
    clearJokerPendingTimers();
    jokerGameState.players[1].selectedIndex = null;
    jokerGameState.phase = 'round-ready';
    jokerGameState.turn = 1;
    jokerGameState.activePlayer = Math.random() < 0.5 ? 0 : 1;
    jokerGameState.resolvedByJokerCall = false;
    jokerGameState.players.forEach((player) => {
        player.usedTokens = [];
        player.roundPoint = JOKER_STARTING_ROUND_POINT;
    });
    jokerGameState.remainingCount = [5, 5];
    setJokerFeedback('');
    renderJokerBoard();
    showJokerTurnNotice(jokerGameState.activePlayer === 0 ? '이번 라운드는 선공입니다.' : '이번 라운드는 후공입니다.');
    jokerPendingRoundTimer = window.setTimeout(() => {
        jokerPendingRoundTimer = null;
        if (!jokerGameState || jokerGameState.phase !== 'round-ready') return;
        jokerGameState.players[1].selectedIndex = pickRandomJokerHandIndex(1);
        jokerGameState.phase = 'round';
        setJokerFeedback(`${jokerGameState.activePlayer === 0 ? 'PLAYER' : 'COM'} 의 선공입니다.`, '#7a4f00');
        renderJokerBoard();
        maybeQueueComTurn();
    }, 1500);
}

function useJokerToken(value) {
    if (!jokerGameState || jokerGameState.phase !== 'round') return;
    const activePlayer = jokerGameState.players[jokerGameState.activePlayer];
    const targetIdx = jokerGameState.activePlayer === 0 ? 1 : 0;
    const targetPlayer = jokerGameState.players[targetIdx];
    if (!activePlayer || !targetPlayer) return;
    if (activePlayer.usedTokens.includes(value) || activePlayer.usedTokens.length >= JOKER_TOKENS_PER_PLAYER) return;

    activePlayer.usedTokens.push(value);
    const targetItem = targetPlayer.hand[targetPlayer.selectedIndex];
    const targetCode = formatJokerCode(getItemNumericCode(targetItem));
    const hit = targetCode.includes(String(value));
    if (hit) {
        jokerGameState.remainingCount[targetIdx] = Math.max(0, jokerGameState.remainingCount[targetIdx] - 1);
        createJokerCountBurst(document.getElementById(`joker-player-${targetIdx + 1}-code`));
    }
    activePlayer.roundPoint = Math.max(0, activePlayer.roundPoint - 1);
    const actorText = jokerGameState.activePlayer === 0 ? 'PLAYER가' : 'COM이';
    if (hit) {
        setJokerFeedback(`${actorText} ${value}번을 적중했습니다.`, '#1f8b4c');
    } else {
        setJokerFeedback(`${actorText} ${value}번을 적중하지 못했습니다.`, '#d94841');
    }
    if (jokerGameState.turn >= JOKER_TURNS_PER_ROUND) {
        resolveJokerRound();
        return;
    }
    jokerGameState.turn += 1;
    jokerGameState.activePlayer = targetIdx;
    renderJokerBoard();
    maybeQueueComTurn();
}

function declareJokerCall() {
    if (!jokerGameState || jokerGameState.phase !== 'round') return;
    const callerIdx = jokerGameState.activePlayer;
    const targetIdx = callerIdx === 0 ? 1 : 0;
    const caller = jokerGameState.players[callerIdx];
    const targetItem = jokerGameState.players[targetIdx].hand[jokerGameState.players[targetIdx].selectedIndex];
    if (!caller || !targetItem || caller.jokerCallsLeft <= 0) return;
    caller.jokerCallsLeft -= 1;
    const callerText = callerIdx === 0 ? 'PLAYER가' : 'COM이';
    if (hasJokerRepeatedDigits(targetItem)) {
        applyJokerLifeChange(targetIdx, 5);
        setJokerFeedback(`${callerText} 조커 카드를 적중하여 5 라이프가 차감됩니다.`, '#1f8b4c');
    } else {
        applyJokerLifeChange(callerIdx, 5);
        setJokerFeedback(`${callerText} 조커 카드를 적중하지 못하여 5 라이프를 잃습니다.`, '#d94841');
    }
    jokerGameState.resolvedByJokerCall = true;
    setTimeout(() => resolveJokerRound(), 520);
}
function resolveJokerRound() {
    if (!jokerGameState || jokerGameState.phase !== 'round') return;
    clearJokerPendingTimers();
    stopJokerTimer();
    jokerGameState.phase = 'resolution';
    let resolutionDelay = 0;

    if (!jokerGameState.resolvedByJokerCall) {
        const playerCount = jokerGameState.remainingCount[0];
        const comCount = jokerGameState.remainingCount[1];
        const diff = Math.abs(playerCount - comCount);

        if (diff > 0) {
            const loserIdx = playerCount < comCount ? 0 : 1;
            applyJokerLifeChange(loserIdx, diff);
            setJokerFeedback(`${loserIdx === 0 ? 'PLAYER' : 'COM'}의 라이프가 ${diff} 차감됩니다.`, '#a36a00');
            resolutionDelay = 520;
        } else {
            setJokerFeedback('라운드가 비겼습니다. 라이프가 차감되지 않았습니다.', '#a36a00');
        }
    }

    const finalizeResolution = () => {
        if (!jokerGameState || jokerGameState.phase !== 'resolution') return;
        if (jokerGameState.players.some((player) => player.life <= 0) || jokerGameState.round >= JOKER_ROUND_COUNT) {
            finishJokerGame();
            return;
        }
        renderJokerBoard();
    };

    if (resolutionDelay > 0) {
        jokerPendingRoundTimer = window.setTimeout(() => {
            jokerPendingRoundTimer = null;
            finalizeResolution();
        }, resolutionDelay);
        return;
    }

    finalizeResolution();
}

function prepareNextJokerRound() {
    if (!jokerGameState || jokerGameState.phase !== 'resolution') return;
    clearJokerPendingTimers();
    jokerGameState.players.forEach((player) => {
        if (player.selectedIndex !== null) {
            player.hand.splice(player.selectedIndex, 1);
            player.selectedIndex = null;
        }
    });
    jokerGameState.round += 1;
    jokerGameState.turn = 0;
    jokerGameState.activePlayer = 0;
    jokerGameState.phase = 'select';
    jokerGameState.remainingCount = [5, 5];
    jokerGameState.resolvedByJokerCall = false;
    setJokerFeedback('라운드에 사용할 카드를 선택해주십시오.', '#7a4f00');
    renderJokerBoard();
}

function finishJokerGame(reason = '') {
    if (!jokerGameState) return;
    clearJokerPendingTimers();
    stopJokerTimer();
    jokerGameState.phase = 'gameover';
    renderJokerBoard();

    const p1 = jokerGameState.players[0].life;
    const p2 = jokerGameState.players[1].life;
    let resultText = 'DRAW';
    let resultClass = 'is-draw';
    if (p1 > p2) {
        resultText = 'WIN';
        resultClass = 'is-win';
    } else if (p2 > p1) {
        resultText = 'LOSE';
        resultClass = 'is-lose';
    }
    const resultCopy = reason === 'TIME OVER'
        ? `PLAYER ${p1} / COM ${p2}\nTIME OVER`
        : `PLAYER ${p1} / COM ${p2}`;

    const existing = document.getElementById('joker-result-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'joker-result-overlay';
    overlay.className = 'center-notice-overlay';
    overlay.style.pointerEvents = 'auto';
    overlay.innerHTML = `
        <div class="center-notice-box joker-result-box ${resultClass}" style="pointer-events:auto;">
            <div class="joker-result-content">
                <div class="quinter9-intro-badge">FINAL RESULT</div>
                <div class="joker-result-title">${resultText}</div>
                <div class="joker-result-copy">${resultCopy}</div>
                <div class="joker-result-score">${resultText === 'WIN' ? 'PLAYER 승리' : resultText === 'LOSE' ? 'COM 승리' : '무승부'}</div>
                <div class="joker-result-actions">
                    <button class="btn btn-submit" type="button" onclick="restartJokerMode()">RETRY</button>
                    <button class="btn btn-home" type="button" onclick="closeJokerResultToHome()">HOME</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function closeJokerResultToHome() {
    const overlay = document.getElementById('joker-result-overlay');
    if (overlay) overlay.remove();
    stopJokerTimer();
    jokerGameState = null;
    if (typeof returnToSearch === 'function') {
        returnToSearch();
        return;
    }
    showTab('search-section');
}

function restartJokerMode() {
    const overlay = document.getElementById('joker-result-overlay');
    if (overlay) overlay.remove();
    startJokerMode();
}

function getJokerMusicElement() {
    return document.getElementById('joker-bgm');
}

function setJokerVolumePanelOpen(isOpen) {
    jokerVolumePanelOpen = !!isOpen;
    const control = document.getElementById('joker-music-control');
    if (!control) return;
    control.classList.toggle('is-open', jokerVolumePanelOpen);
}

function updateJokerMusicButton() {
    const button = document.getElementById('joker-music-toggle');
    if (!button) return;
    button.classList.toggle('is-on', jokerMusicEnabled);
    const text = button.querySelector('.btn-text');
    if (text) text.textContent = jokerMusicEnabled ? 'MUSIC ON' : 'MUSIC OFF';
}

function updateJokerVolumeSlider() {
    const slider = document.getElementById('joker-volume-slider');
    if (!slider) return;
    slider.value = String(Math.round(jokerMusicVolume * 100));
}

function playJokerMusic() {
    const audio = getJokerMusicElement();
    if (!audio) return;
    audio.loop = true;
    audio.volume = jokerMusicVolume;
    const playAttempt = audio.play();
    if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(() => {});
    }
}

function stopJokerMusic() {
    const audio = getJokerMusicElement();
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
}

function syncJokerMusicPlayback() {
    const section = document.getElementById('boardgame-joker-play-section');
    const isVisible = !!section && section.style.display !== 'none';
    if (jokerMusicEnabled && isVisible) {
        playJokerMusic();
    } else {
        stopJokerMusic();
    }
    if (!isVisible) {
        setJokerVolumePanelOpen(false);
    }
    updateJokerMusicButton();
    updateJokerVolumeSlider();
}

function toggleJokerMusic() {
    jokerMusicEnabled = !jokerMusicEnabled;
    syncJokerMusicPlayback();
}

function handleJokerMusicButtonClick(event) {
    if (event) event.stopPropagation();
    if (!jokerVolumePanelOpen) {
        setJokerVolumePanelOpen(true);
        return;
    }
    toggleJokerMusic();
}

function setJokerMusicVolume(value) {
    const parsed = Number(value);
    const nextVolume = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) / 100 : jokerMusicVolume;
    jokerMusicVolume = nextVolume;
    const audio = getJokerMusicElement();
    if (audio) audio.volume = jokerMusicVolume;
    updateJokerVolumeSlider();
}

function getBaseballMusicElement() {
    return document.getElementById('baseball-bgm');
}

function getQuinter9MusicElement() {
    return document.getElementById('quinter9-bgm');
}

function pickRandomQuinter9Track(currentSrc = '') {
    const currentName = String(currentSrc || '').split('/').pop();
    const candidates = QUINTER9_BGM_TRACKS.filter((track) => track.split('/').pop() !== currentName);
    const pool = candidates.length ? candidates : QUINTER9_BGM_TRACKS;
    return pool[Math.floor(Math.random() * pool.length)] || QUINTER9_BGM_TRACKS[0];
}

function setQuinter9VolumePanelOpen(isOpen) {
    quinter9VolumePanelOpen = !!isOpen;
    const control = document.getElementById('quinter9-music-control');
    if (!control) return;
    control.classList.toggle('is-open', quinter9VolumePanelOpen);
}

function updateQuinter9MusicButton() {
    const button = document.getElementById('quinter9-music-toggle');
    if (!button) return;
    button.classList.toggle('is-on', quinter9MusicEnabled);
    const text = button.querySelector('.btn-text');
    if (text) text.textContent = quinter9MusicEnabled ? 'ON' : 'OFF';
}

function updateQuinter9VolumeSlider() {
    const slider = document.getElementById('quinter9-volume-slider');
    if (!slider) return;
    slider.value = String(Math.round(quinter9MusicVolume * 100));
}

function playQuinter9Music() {
    const audio = getQuinter9MusicElement();
    if (!audio) return;
    const nextTrack = pickRandomQuinter9Track(audio.dataset.currentTrack || audio.getAttribute('src') || '');
    if (nextTrack) {
        audio.src = nextTrack;
        audio.dataset.currentTrack = nextTrack;
    }
    audio.loop = true;
    audio.volume = quinter9MusicVolume;
    const playAttempt = audio.play();
    if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(() => {});
    }
}

function stopQuinter9Music() {
    const audio = getQuinter9MusicElement();
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
}

function syncQuinter9MusicPlayback() {
    const section = document.getElementById('boardgame-quinter9-play-section');
    const isVisible = !!section && section.style.display !== 'none';
    if (quinter9MusicEnabled && isVisible) {
        playQuinter9Music();
    } else {
        stopQuinter9Music();
    }
    if (!isVisible) {
        setQuinter9VolumePanelOpen(false);
    }
    updateQuinter9MusicButton();
    updateQuinter9VolumeSlider();
}

function toggleQuinter9Music() {
    quinter9MusicEnabled = !quinter9MusicEnabled;
    syncQuinter9MusicPlayback();
}

function handleQuinter9MusicButtonClick(event) {
    if (event) event.stopPropagation();
    if (!quinter9VolumePanelOpen) {
        setQuinter9VolumePanelOpen(true);
        return;
    }
    toggleQuinter9Music();
}

function setQuinter9MusicVolume(value) {
    const parsed = Number(value);
    const nextVolume = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) / 100 : quinter9MusicVolume;
    quinter9MusicVolume = nextVolume;
    const audio = getQuinter9MusicElement();
    if (audio) audio.volume = quinter9MusicVolume;
    updateQuinter9VolumeSlider();
}

function setBaseballVolumePanelOpen(isOpen) {
    baseballVolumePanelOpen = !!isOpen;
    const control = document.getElementById('baseball-music-control');
    if (!control) return;
    control.classList.toggle('is-open', baseballVolumePanelOpen);
}

function updateBaseballMusicButton() {
    const button = document.getElementById('baseball-music-toggle');
    if (!button) return;
    button.classList.toggle('is-on', baseballMusicEnabled);
    const text = button.querySelector('.btn-text');
    if (text) text.textContent = baseballMusicEnabled ? 'MUSIC ON' : 'MUSIC OFF';
}

function updateBaseballVolumeSlider() {
    const slider = document.getElementById('baseball-volume-slider');
    if (!slider) return;
    slider.value = String(Math.round(baseballMusicVolume * 100));
}

function playBaseballMusic() {
    const audio = getBaseballMusicElement();
    if (!audio) return;
    audio.loop = true;
    audio.volume = baseballMusicVolume;
    const playAttempt = audio.play();
    if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(() => {});
    }
}

function stopBaseballMusic() {
    const audio = getBaseballMusicElement();
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
}

function syncBaseballMusicPlayback() {
    const section = document.getElementById('boardgame-baseball-game-section');
    const isVisible = !!section && section.style.display !== 'none';
    if (baseballMusicEnabled && isVisible) {
        playBaseballMusic();
    } else {
        stopBaseballMusic();
    }
    if (!isVisible) {
        setBaseballVolumePanelOpen(false);
    }
    updateBaseballMusicButton();
    updateBaseballVolumeSlider();
}

function toggleBaseballMusic() {
    baseballMusicEnabled = !baseballMusicEnabled;
    syncBaseballMusicPlayback();
}

function handleBaseballMusicButtonClick(event) {
    if (event) event.stopPropagation();
    if (!baseballVolumePanelOpen) {
        setBaseballVolumePanelOpen(true);
        return;
    }
    toggleBaseballMusic();
}

function setBaseballMusicVolume(value) {
    const parsed = Number(value);
    const nextVolume = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) / 100 : baseballMusicVolume;
    baseballMusicVolume = nextVolume;
    const audio = getBaseballMusicElement();
    if (audio) audio.volume = baseballMusicVolume;
    updateBaseballVolumeSlider();
}

function getBlossomMusicElement() {
    return document.getElementById('blossom-bgm');
}

function getBlossomMusicTrack(season = "") {
    return BLOSSOM_BGM_TRACKS[season] || BLOSSOM_BGM_TRACKS.spring;
}

function setBlossomVolumePanelOpen(isOpen) {
    blossomVolumePanelOpen = !!isOpen;
    const control = document.getElementById('blossom-music-control');
    if (!control) return;
    control.classList.toggle('is-open', blossomVolumePanelOpen);
}

function updateBlossomMusicButton() {
    const button = document.getElementById('blossom-music-toggle');
    if (!button) return;
    button.classList.toggle('is-on', blossomMusicEnabled);
    const text = button.querySelector('.btn-text');
    if (text) text.textContent = blossomMusicEnabled ? 'BGM ON' : 'BGM OFF';
}

function updateBlossomVolumeSlider() {
    const slider = document.getElementById('blossom-volume-slider');
    if (!slider) return;
    slider.value = String(Math.round(blossomMusicVolume * 100));
}

function updateBlossomTrackLabel() {
    const label = document.getElementById('blossom-track-name');
    if (!label) return;
    const season = blossomGameState && blossomGameState.stageSeason ? blossomGameState.stageSeason : 'spring';
    const track = getBlossomMusicTrack(season);
    label.textContent = track.title;
}

function playBlossomMusic() {
    const audio = getBlossomMusicElement();
    if (!audio) return;
    const season = blossomGameState && blossomGameState.stageSeason ? blossomGameState.stageSeason : 'spring';
    const track = getBlossomMusicTrack(season);
    let trackChanged = false;
    if (track && track.src && audio.dataset.currentTrack !== track.src) {
        audio.src = track.src;
        audio.dataset.currentTrack = track.src;
        trackChanged = true;
    }
    updateBlossomTrackLabel();
    audio.loop = true;
    audio.volume = blossomMusicVolume;
    if (trackChanged) {
        audio.load();
    }
    if (trackChanged || audio.paused || audio.ended) {
        if (!trackChanged && audio.ended) {
            audio.currentTime = 0;
        }
        const playAttempt = audio.play();
        if (playAttempt && typeof playAttempt.catch === 'function') {
            playAttempt.catch(() => {});
        }
    }
}

function stopBlossomMusic() {
    const audio = getBlossomMusicElement();
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
}

function syncBlossomMusicPlayback() {
    const section = document.getElementById('boardgame-blossom-play-section');
    const isVisible = !!section && section.style.display !== 'none';
    updateBlossomTrackLabel();
    if (blossomMusicEnabled && isVisible) {
        playBlossomMusic();
    } else {
        stopBlossomMusic();
    }
    if (!isVisible) {
        setBlossomVolumePanelOpen(false);
    }
    updateBlossomMusicButton();
    updateBlossomVolumeSlider();
}

function toggleBlossomMusic() {
    blossomMusicEnabled = !blossomMusicEnabled;
    syncBlossomMusicPlayback();
}

function handleBlossomMusicButtonClick(event) {
    if (event) event.stopPropagation();
    if (!blossomVolumePanelOpen) {
        setBlossomVolumePanelOpen(true);
        return;
    }
    toggleBlossomMusic();
}

function setBlossomMusicVolume(value) {
    const parsed = Number(value);
    const nextVolume = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) / 100 : blossomMusicVolume;
    blossomMusicVolume = nextVolume;
    const audio = getBlossomMusicElement();
    if (audio) audio.volume = blossomMusicVolume;
    updateBlossomVolumeSlider();
}

function openJokerHowToImage() {
    const overlay = document.getElementById('joker-howto-image-overlay');
    if (!overlay) return;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
}

function closeJokerHowToImage(event) {
    if (event) event.stopPropagation();
    const overlay = document.getElementById('joker-howto-image-overlay');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
}

const QUINTER9_MODE_CARD_COUNT = 9;
const QUINTER9_MODE_CELL_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const QUINTER9_MODE_CELL_CAP = 5;
const QUINTER9_MODE_CONTROL_THRESHOLD = 3;
let quinter9ModeState = null;
let quinter9ModeComTimer = null;
let quinter9ModeIntroTimer = null;

function clearQuinter9ModeTimers() {
    if (quinter9ModeComTimer) {
        clearTimeout(quinter9ModeComTimer);
        quinter9ModeComTimer = null;
    }
    if (quinter9ModeIntroTimer) {
        clearInterval(quinter9ModeIntroTimer);
        quinter9ModeIntroTimer = null;
    }
}

function getQuinter9ModeCardAssetPath(item) {
    const stampAsset = (getStampInfo(item, daysSince(item && item.date)) || {}).asset;
    const mapping = {
        V: 'voucher',
        G: 'goldsilver',
        M: 'masterlabel',
        S: 'salon',
        X: 'collab',
        BW: 'blackwhite'
    };
    const filename = mapping[stampAsset] || 'royal';
    return `boardgame/quinter9/card/${filename}.png`;
}

function getQuinter9ModePlayablePool() {
    return getJokerPlayablePool().filter((item) => {
        const code = getQuinter9ModeCodeString(item);
        if (!code || code === '-----') return false;
        const zeroCount = getQuinter9ModeZeroCount(item);
        return zeroCount < 3;
    });
}

function getQuinter9ModeZeroCount(item) {
    const code = getQuinter9ModeCodeString(item);
    if (!code || code === '-----') return 0;
    return [...code].filter((digit) => digit === '0').length;
}

function createQuinter9ModeHand(pool, usedKeys) {
    const picked = [];
    const addByZeroCount = (targetZeroCount, targetCount) => {
        const shuffled = [...pool]
            .filter((item) => getQuinter9ModeZeroCount(item) === targetZeroCount)
            .sort(() => Math.random() - 0.5);
        for (const item of shuffled) {
            const key = buildItemKey(item);
            if (usedKeys.has(key)) continue;
            picked.push(item);
            usedKeys.add(key);
            if (picked.filter((pickedItem) => getQuinter9ModeZeroCount(pickedItem) === targetZeroCount).length >= targetCount) break;
        }
    };

    addByZeroCount(1, 6);
    addByZeroCount(2, 3);

    if (picked.length !== QUINTER9_MODE_CARD_COUNT) return [];
    return picked;
}

function getQuinter9ModeCodeString(item) {
    const code = getItemNumericCode(item);
    return code === null ? '-----' : String(code).padStart(5, '0');
}

function getQuinter9ModeDigits(item) {
    const code = getQuinter9ModeCodeString(item);
    if (!code || code === '-----') return [];
    return code.split('').filter((digit) => digit !== '0').map((digit) => Number.parseInt(digit, 10)).filter((digit) => Number.isFinite(digit) && digit >= 1 && digit <= 9);
}

function getQuinter9ModeCellOwner(cell) {
    if (!cell || !Array.isArray(cell.counts)) return null;
    if (cell.counts[0] >= QUINTER9_MODE_CONTROL_THRESHOLD) return 0;
    if (cell.counts[1] >= QUINTER9_MODE_CONTROL_THRESHOLD) return 1;
    return null;
}

function getQuinter9ModeTerritoryCounts(cells = null) {
    const source = cells || (quinter9ModeState ? quinter9ModeState.cells : []);
    return source.reduce((acc, cell) => {
        const owner = getQuinter9ModeCellOwner(cell);
        if (owner === 0) acc[0] += 1;
        else if (owner === 1) acc[1] += 1;
        return acc;
    }, [0, 0]);
}

function getQuinter9ModeRemainingCards(playerIdx) {
    const player = quinter9ModeState && quinter9ModeState.players[playerIdx];
    if (!player || !Array.isArray(player.used)) return 0;
    return player.used.filter((used) => !used).length;
}

function cloneQuinter9ModeCells(cells) {
    return cells.map((cell) => ({ counts: [cell.counts[0], cell.counts[1]] }));
}

function applyQuinter9ModeDigitToCells(cells, digit, playerIdx) {
    const cell = cells[digit - 1];
    if (!cell) return;
    const opponentIdx = playerIdx === 0 ? 1 : 0;
    cell.counts[playerIdx] += 1;
    let overflow = (cell.counts[0] + cell.counts[1]) - QUINTER9_MODE_CELL_CAP;
    if (overflow > 0) {
        const removedFromOpponent = Math.min(cell.counts[opponentIdx], overflow);
        cell.counts[opponentIdx] -= removedFromOpponent;
        overflow -= removedFromOpponent;
    }
    if (overflow > 0) {
        cell.counts[playerIdx] = Math.max(0, cell.counts[playerIdx] - overflow);
    }
}

function applyQuinter9ModeCardToCells(cells, item, playerIdx) {
    const digits = getQuinter9ModeDigits(item);
    digits.forEach((digit) => applyQuinter9ModeDigitToCells(cells, digit, playerIdx));
    return digits;
}

function getQuinter9ModeCardMarkup(item, options = {}) {
    const {
        hidden = false,
        empty = false,
        selected = false,
        disabled = false,
        button = false,
        onclick = '',
        preview = false
    } = options;
    const classNames = ['quinter9-card'];
    if (preview) classNames.push('quinter9-card-preview');
    if (hidden) classNames.push('is-back');
    if (empty) classNames.push('is-empty');
    if (selected) classNames.push('is-selected');
    if (disabled) classNames.push('is-used');
    const attrs = [];
    if (button) {
        attrs.push('type="button"');
        if (onclick) attrs.push(`onclick="${onclick}"`);
        if (disabled) attrs.push('disabled');
    }
    const tag = button ? 'button' : 'div';
    if (empty || !item) {
        return `<${tag} class="${classNames.join(' ')}" ${attrs.join(' ')}><div class="quinter9-card-used-label">USED</div></${tag}>`;
    }
    if (hidden) {
        return `<${tag} class="${classNames.join(' ')}" ${attrs.join(' ')}></${tag}>`;
    }
    const imageSrc = resolveItemImageSrc(item);
    const code = getQuinter9ModeCodeString(item);
    return `
        <${tag} class="${classNames.join(' ')}" ${attrs.join(' ')} style="background-image:url('${getQuinter9ModeCardAssetPath(item)}')">
            <div class="quinter9-card-name">${item.name || 'ITEM'}</div>
            <div class="quinter9-card-art"><img src="${imageSrc}" alt="${item.name || 'ITEM'}"></div>
            <div class="quinter9-card-code">${code}</div>
        </${tag}>
    `;
}

function setQuinter9ModeFeedback(message, color = '#eef3f8') {
    const feedback = document.getElementById('quinter9-mode-feedback');
    if (!feedback) return;
    feedback.textContent = message || '';
    feedback.style.color = color;
}

function setQuinter9IntroOverlay(isOpen, countdown = 3) {
    const overlay = document.getElementById('quinter9-intro-overlay');
    const title = document.getElementById('quinter9-intro-title');
    const copy = document.getElementById('quinter9-intro-copy');
    const counter = document.getElementById('quinter9-intro-countdown');
    if (!overlay) return;
    if (!isOpen || !quinter9ModeState) {
        overlay.classList.remove('is-open');
        return;
    }
    const starter = quinter9ModeState.activePlayer === 0 ? 'PLAYER' : 'COM';
    overlay.classList.add('is-open');
    if (title) title.textContent = `${starter} 선공`;
    if (copy) copy.textContent = `${countdown}초 후 ${starter} 턴이 시작됩니다.`;
    if (counter) counter.textContent = String(countdown);
}

function setQuinter9ResultOverlay(isOpen, titleText = 'WIN', detailText = '') {
    const overlay = document.getElementById('quinter9-result-overlay');
    const title = document.getElementById('quinter9-result-title');
    const copy = document.getElementById('quinter9-result-copy');
    if (!overlay) return;
    if (!isOpen) {
        overlay.classList.remove('is-open');
        return;
    }
    overlay.classList.add('is-open');
    if (title) title.textContent = titleText || 'WIN';
    if (copy) copy.textContent = detailText || '';
}

function beginQuinter9ModePlay() {
    if (!quinter9ModeState || quinter9ModeState.phase !== 'intro') return;
    quinter9ModeState.phase = 'play';
    setQuinter9IntroOverlay(false);
    if (quinter9ModeState.activePlayer === 1) {
        setQuinter9ModeFeedback('COM이 선공입니다. 카드를 고르는 중입니다.', '#ffb0b0');
        renderQuinter9ModeBoard();
        queueQuinter9ModeComTurn();
        return;
    }
    setQuinter9ModeFeedback('PLAYER가 선공입니다. 카드를 선택해 공격을 시작하세요.', '#8ef2a1');
    renderQuinter9ModeBoard();
}

function startQuinter9Intro() {
    if (!quinter9ModeState) return;
    clearQuinter9ModeTimers();
    let remaining = 3;
    setQuinter9IntroOverlay(true, remaining);
    quinter9ModeIntroTimer = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
            clearQuinter9ModeTimers();
            beginQuinter9ModePlay();
            return;
        }
        setQuinter9IntroOverlay(true, remaining);
    }, 1000);
}

function renderQuinter9ModeGrid() {
    const root = document.getElementById('quinter9-grid');
    if (!root || !quinter9ModeState) return;
    root.innerHTML = QUINTER9_MODE_CELL_VALUES.map((value, index) => {
        const cell = quinter9ModeState.cells[index];
        const owner = getQuinter9ModeCellOwner(cell);
        const className = owner === 0 ? 'is-player-owned' : owner === 1 ? 'is-com-owned' : '';
        const pipClasses = Array.from({ length: QUINTER9_MODE_CELL_CAP }, (_, pipIndex) => {
            if (pipIndex < cell.counts[0]) return 'is-player';
            if (pipIndex < cell.counts[0] + cell.counts[1]) return 'is-com';
            return 'is-empty';
        });
        return `
            <div class="quinter9-cell ${className}">
                <div class="quinter9-cell-label">${value}</div>
                <div class="quinter9-dot-grid">
                    ${pipClasses.map((pipClass, pipIndex) => `<span class="quinter9-dot pos-${pipIndex + 1} ${pipClass}"></span>`).join('')}
                </div>
                <div class="quinter9-cell-score">P${cell.counts[0]} / C${cell.counts[1]}</div>
            </div>
        `;
    }).join('');
}

function renderQuinter9ModeHand(playerIdx) {
    if (!quinter9ModeState) return;
    const player = quinter9ModeState.players[playerIdx];
    const root = document.getElementById(playerIdx === 0 ? 'quinter9-player-hand' : 'quinter9-com-hand');
    const note = document.getElementById(playerIdx === 0 ? 'quinter9-player-hand-note' : 'quinter9-com-hand-note');
    if (!player || !root) return;
    if (note) note.textContent = `${getQuinter9ModeRemainingCards(playerIdx)} CARDS`;
    root.innerHTML = player.hand.map((item, index) => {
        const isUsed = !!player.used[index];
        const isSelected = player.selectedIndex === index;
        if (playerIdx === 1) {
            return isUsed
                ? getQuinter9ModeCardMarkup(null, { empty: true })
                : getQuinter9ModeCardMarkup(item, { hidden: true });
        }
        return isUsed
            ? getQuinter9ModeCardMarkup(null, { empty: true })
            : getQuinter9ModeCardMarkup(item, {
                button: true,
                onclick: `selectQuinter9ModeCard(${index})`,
                selected: isSelected,
                disabled: quinter9ModeState.activePlayer !== 0 || quinter9ModeState.phase !== 'play'
            });
    }).join('');
}

function renderQuinter9ModePreviews() {
    if (!quinter9ModeState) return;
    const playerPreview = document.getElementById('quinter9-player-preview');
    const player = quinter9ModeState.players[0];
    if (playerPreview) {
        const selectedItem = player && player.selectedIndex !== null ? player.hand[player.selectedIndex] : player.lastPlayed;
        playerPreview.innerHTML = selectedItem
            ? getQuinter9ModeCardMarkup(selectedItem, { preview: true })
            : getQuinter9ModeCardMarkup(null, { empty: true, preview: true });
    }
}

function updateQuinter9ModeHud() {
    if (!quinter9ModeState) return;
    const turnEl = document.getElementById('quinter9-turn-label');
    const playerTerritoryEl = document.getElementById('quinter9-player-territory');
    const comTerritoryEl = document.getElementById('quinter9-com-territory');
    const cardsLeftEl = document.getElementById('quinter9-cards-left');
    const titleEl = document.getElementById('quinter9-mode-title');
    const copyEl = document.getElementById('quinter9-mode-copy');
    const attackBtn = document.getElementById('quinter9-attack-btn');
    const [playerTerritory, comTerritory] = getQuinter9ModeTerritoryCounts();
    if (turnEl) {
        if (quinter9ModeState.phase === 'gameover') turnEl.textContent = 'GAME OVER';
        else turnEl.textContent = `${quinter9ModeState.activePlayer === 0 ? 'PLAYER' : 'COM'} TURN · ${quinter9ModeState.turn} / ${QUINTER9_MODE_CARD_COUNT * 2}`;
    }
    if (playerTerritoryEl) playerTerritoryEl.textContent = `PLAYER ${playerTerritory}`;
    if (comTerritoryEl) comTerritoryEl.textContent = `COM ${comTerritory}`;
    if (cardsLeftEl) cardsLeftEl.textContent = `PLAYER ${getQuinter9ModeRemainingCards(0)} / COM ${getQuinter9ModeRemainingCards(1)}`;
    if (titleEl) {
        if (quinter9ModeState.phase === 'gameover') titleEl.textContent = 'RESULT';
        else titleEl.textContent = quinter9ModeState.activePlayer === 0 ? 'SELECT & ATTACK' : 'COM ATTACKING';
    }
    if (copyEl) {
        if (quinter9ModeState.phase === 'gameover') copyEl.textContent = quinter9ModeState.resultMessage || '모든 카드 사용이 종료되었습니다.';
        else if (quinter9ModeState.activePlayer === 0) copyEl.textContent = '카드를 선택한 뒤 ATTACK 버튼으로 숫자칸 영역을 전개하세요.';
        else copyEl.textContent = 'COM이 카드를 확인하고 공격을 준비하고 있습니다.';
    }
    if (attackBtn) attackBtn.disabled = quinter9ModeState.phase !== 'play' || quinter9ModeState.activePlayer !== 0 || quinter9ModeState.players[0].selectedIndex === null;
}

function renderQuinter9ModeBoard() {
    if (!quinter9ModeState) return;
    renderQuinter9ModeGrid();
    renderQuinter9ModeHand(0);
    renderQuinter9ModeHand(1);
    renderQuinter9ModePreviews();
    updateQuinter9ModeHud();
    setQuinter9IntroOverlay(quinter9ModeState.phase === 'intro');
    setQuinter9ResultOverlay(
        quinter9ModeState.phase === 'gameover',
        quinter9ModeState.resultTitle || 'WIN',
        quinter9ModeState.resultMessage || ''
    );
}

function selectQuinter9ModeCard(cardIndex) {
    if (!quinter9ModeState || quinter9ModeState.phase !== 'play' || quinter9ModeState.activePlayer !== 0) return;
    const player = quinter9ModeState.players[0];
    if (!player || player.used[cardIndex]) return;
    player.selectedIndex = cardIndex;
    renderQuinter9ModeBoard();
}

function evaluateQuinter9ModeCardScore(item, cells, playerIdx) {
    const before = getQuinter9ModeTerritoryCounts(cells);
    const simCells = cloneQuinter9ModeCells(cells);
    const digits = applyQuinter9ModeCardToCells(simCells, item, playerIdx);
    const after = getQuinter9ModeTerritoryCounts(simCells);
    const opponentIdx = playerIdx === 0 ? 1 : 0;
    let score = ((after[playerIdx] - before[playerIdx]) * 16) - ((after[opponentIdx] - before[opponentIdx]) * 14);
    digits.forEach((digit) => {
        const beforeCell = cells[digit - 1];
        const afterCell = simCells[digit - 1];
        score += (afterCell.counts[playerIdx] - beforeCell.counts[playerIdx]) * 2.2;
        score -= (afterCell.counts[opponentIdx] - beforeCell.counts[opponentIdx]) * 1.3;
    });
    return score + Math.random() * 0.1;
}

function isQuinter9ModeSafeCard(item, cells, playerIdx) {
    const digits = getQuinter9ModeDigits(item);
    if (!digits.length) return false;
    const digitUsage = new Map();
    digits.forEach((digit) => {
        digitUsage.set(digit, (digitUsage.get(digit) || 0) + 1);
    });
    return Array.from(digitUsage.entries()).every(([digit, addCount]) => {
        const cell = cells[digit - 1];
        if (!cell) return false;
        return (cell.counts[playerIdx] + addCount) <= QUINTER9_MODE_CELL_CAP;
    });
}

function pickQuinter9ModeComCardIndex() {
    if (!quinter9ModeState) return null;
    const com = quinter9ModeState.players[1];
    if (!com) return null;
    const candidates = com.hand
        .map((item, index) => ({ item, index }))
        .filter(({ index }) => !com.used[index]);
    if (!candidates.length) return null;
    let best = candidates[0];
    let bestScore = -Infinity;
    candidates.forEach((candidate) => {
        const isSafe = isQuinter9ModeSafeCard(candidate.item, quinter9ModeState.cells, 1);
        const safetyPenalty = isSafe ? 0 : 18;
        const score = evaluateQuinter9ModeCardScore(candidate.item, quinter9ModeState.cells, 1) - safetyPenalty;
        if (score > bestScore) {
            bestScore = score;
            best = candidate;
        }
    });
    return best.index;
}

function getQuinter9ModeAttackSummary(item, digits) {
    const uniqueDigits = digits.length ? digits.join(', ') : '-';
    return `${item.name} · ${uniqueDigits}`;
}

function getQuinter9ModeActorParticle(playerIdx) {
    return playerIdx === 0 ? '가' : '이';
}

function getQuinter9ModeDigitObjectParticle(digit) {
    return [2, 4, 5, 9].includes(Number(digit)) ? '를' : '을';
}

function getQuinter9ModeAttackFeedbackText(playerIdx, item, digits) {
    const actorText = playerIdx === 0 ? 'PLAYER' : 'COM';
    const actorParticle = getQuinter9ModeActorParticle(playerIdx);
    const digitText = digits.length
        ? `${digits.join(', ')}${getQuinter9ModeDigitObjectParticle(digits[digits.length - 1])}`
        : '-';
    return `${actorText}${actorParticle} ${item.name} · ${digitText} 전개했습니다.`;
}

function executeQuinter9ModeAttack(playerIdx, cardIndex) {
    if (!quinter9ModeState || quinter9ModeState.phase !== 'play') return;
    const player = quinter9ModeState.players[playerIdx];
    if (!player || player.used[cardIndex]) return;
    const item = player.hand[cardIndex];
    const digits = applyQuinter9ModeCardToCells(quinter9ModeState.cells, item, playerIdx);
    player.used[cardIndex] = true;
    player.selectedIndex = null;
    player.lastPlayed = item;
    setQuinter9ModeFeedback(getQuinter9ModeAttackFeedbackText(playerIdx, item, digits), playerIdx === 0 ? '#8ef2a1' : '#ff9b9b');
    quinter9ModeState.turn += 1;
    if (quinter9ModeState.turn > QUINTER9_MODE_CARD_COUNT * 2 || (getQuinter9ModeRemainingCards(0) === 0 && getQuinter9ModeRemainingCards(1) === 0)) {
        finishQuinter9Mode();
        return;
    }
    quinter9ModeState.activePlayer = playerIdx === 0 ? 1 : 0;
    renderQuinter9ModeBoard();
    if (quinter9ModeState.activePlayer === 1) queueQuinter9ModeComTurn();
}

function handleQuinter9Attack() {
    if (!quinter9ModeState || quinter9ModeState.phase !== 'play' || quinter9ModeState.activePlayer !== 0) return;
    const player = quinter9ModeState.players[0];
    if (!player || player.selectedIndex === null) {
        setQuinter9ModeFeedback('카드를 먼저 선택해 주세요.', '#f4d37a');
        return;
    }
    executeQuinter9ModeAttack(0, player.selectedIndex);
}

function queueQuinter9ModeComTurn() {
    if (!quinter9ModeState || quinter9ModeState.phase !== 'play' || quinter9ModeState.activePlayer !== 1) return;
    clearQuinter9ModeTimers();
    quinter9ModeComTimer = window.setTimeout(() => {
        quinter9ModeComTimer = null;
        if (!quinter9ModeState || quinter9ModeState.phase !== 'play' || quinter9ModeState.activePlayer !== 1) return;
        const cardIndex = pickQuinter9ModeComCardIndex();
        if (cardIndex === null) {
            finishQuinter9Mode();
            return;
        }
        executeQuinter9ModeAttack(1, cardIndex);
    }, 1150);
}

function finishQuinter9Mode() {
    if (!quinter9ModeState) return;
    clearQuinter9ModeTimers();
    quinter9ModeState.phase = 'gameover';
    const [playerTerritory, comTerritory] = getQuinter9ModeTerritoryCounts();
    let result = '';
    let resultTitle = 'DRAW';
    if (playerTerritory > comTerritory) {
        result = `PLAYER WIN · ${playerTerritory} : ${comTerritory}`;
        resultTitle = 'WIN';
    } else if (comTerritory > playerTerritory) {
        result = `COM WIN · ${playerTerritory} : ${comTerritory}`;
        resultTitle = 'LOSE';
    } else {
        const playerTotal = quinter9ModeState.cells.reduce((sum, cell) => {
            return getQuinter9ModeCellOwner(cell) === 0 ? sum + cell.counts[0] : sum;
        }, 0);
        const comTotal = quinter9ModeState.cells.reduce((sum, cell) => {
            return getQuinter9ModeCellOwner(cell) === 1 ? sum + cell.counts[1] : sum;
        }, 0);
        if (playerTotal > comTotal) {
            result = `PLAYER WIN · ${playerTerritory} : ${comTerritory} (STACK ${playerTotal}:${comTotal})`;
            resultTitle = 'WIN';
        } else if (comTotal > playerTotal) {
            result = `COM WIN · ${playerTerritory} : ${comTerritory} (STACK ${playerTotal}:${comTotal})`;
            resultTitle = 'LOSE';
        } else {
            result = `DRAW · ${playerTerritory} : ${comTerritory} (STACK ${playerTotal}:${comTotal})`;
            resultTitle = 'DRAW';
        }
    }
    quinter9ModeState.resultTitle = resultTitle;
    quinter9ModeState.resultMessage = result;
    setQuinter9ModeFeedback(result, '#f2e2a2');
    renderQuinter9ModeBoard();
}

function startQuinter9Mode() {
    const pool = getQuinter9ModePlayablePool();
    if (pool.length < QUINTER9_MODE_CARD_COUNT * 2) {
        alert('Not enough coded cards to start QUINTER9 mode yet.');
        return;
    }
    const usedKeys = new Set();
    const playerHand = createQuinter9ModeHand(pool, usedKeys);
    const comHand = createQuinter9ModeHand(pool, usedKeys);
    if (playerHand.length < QUINTER9_MODE_CARD_COUNT || comHand.length < QUINTER9_MODE_CARD_COUNT) {
        alert('Not enough unique coded cards to start QUINTER9 mode yet.');
        return;
    }
    quinter9ModeState = {
        phase: 'intro',
        turn: 1,
        activePlayer: Math.random() < 0.5 ? 0 : 1,
        resultTitle: '',
        resultMessage: '',
        cells: QUINTER9_MODE_CELL_VALUES.map(() => ({ counts: [0, 0] })),
        players: [
            { hand: playerHand, used: Array(playerHand.length).fill(false), selectedIndex: null, lastPlayed: null },
            { hand: comHand, used: Array(comHand.length).fill(false), selectedIndex: null, lastPlayed: null }
        ]
    };
    clearQuinter9ModeTimers();
    setQuinter9ModeFeedback('곧 시작합니다. 선공을 확인하세요.', '#f2e2a2');
    renderQuinter9ModeBoard();
    showTab('boardgame-quinter9-play-section');
    startQuinter9Intro();
}

const CLASSIC_BOARDGAME_MAX_LIVES = 3;
const CLASSIC_BOARDGAME_TIME_LIMIT = 300;
const CLASSIC_BOARDGAME_SCROLL_TOTAL = 5;
const CLASSIC_BOARDGAME_REVEAL_DELAY = 1500;
let classicBoardgameTimer = null;
let classicBoardgameSecondsLeft = CLASSIC_BOARDGAME_TIME_LIMIT;
let classicBoardgameLives = CLASSIC_BOARDGAME_MAX_LIVES;
let classicBoardgameScore = 0;
let classicBoardgameCategory = 'hair';
let classicBoardgamePool = [];
let classicBoardgameCurrentItem = null;
let classicBoardgameOpenedHints = 1;
let classicBoardgameLocked = false;

function getClassicBoardgamePool(category) {
    if (typeof items === 'undefined' || !Array.isArray(items)) return [];
    return items.filter((item) => {
        const type = normalizeType(item && item.type);
        if (!type) return false;
        if (isQmPlaceholderItem(item)) return false;
        if (category === 'hair') return type.includes('hair');
        if (category === 'face') return type.includes('face');
        return false;
    });
}

function renderClassicLives() {
    const roots = document.querySelectorAll('[data-classic-lives-root]');
    if (!roots.length) return;
    const markup = Array.from({ length: CLASSIC_BOARDGAME_MAX_LIVES }, (_, index) =>
        `<span class="quiz-life ${index < classicBoardgameLives ? '' : 'lost'}" data-classic-life-index="${index}">&#10084;</span>`
    ).join('');
    roots.forEach((root) => {
        root.innerHTML = markup;
    });
}

function resetClassicLives() {
    classicBoardgameLives = CLASSIC_BOARDGAME_MAX_LIVES;
    renderClassicLives();
}

function updateClassicScore() {
    const scoreEl = document.getElementById('classic-score');
    if (scoreEl) scoreEl.textContent = `SCORE ${classicBoardgameScore}`;
}

function updateClassicTimerDisplay() {
    const bar = document.getElementById('classic-timer-bar');
    const text = document.getElementById('classic-timer-text');
    const ratio = Math.max(0, Math.min(1, classicBoardgameSecondsLeft / CLASSIC_BOARDGAME_TIME_LIMIT));
    if (bar) bar.style.width = `${ratio * 100}%`;
    if (text) {
        const minutes = String(Math.floor(classicBoardgameSecondsLeft / 60)).padStart(2, '0');
        const seconds = String(classicBoardgameSecondsLeft % 60).padStart(2, '0');
        text.textContent = `TIME ${minutes}:${seconds}`;
    }
}

function stopClassicTimer() {
    if (classicBoardgameTimer) {
        clearInterval(classicBoardgameTimer);
        classicBoardgameTimer = null;
    }
}

function startClassicTimer() {
    stopClassicTimer();
    classicBoardgameSecondsLeft = CLASSIC_BOARDGAME_TIME_LIMIT;
    updateClassicTimerDisplay();
    classicBoardgameTimer = setInterval(() => {
        classicBoardgameSecondsLeft = Math.max(0, classicBoardgameSecondsLeft - 1);
        updateClassicTimerDisplay();
        if (classicBoardgameSecondsLeft <= 0) {
            stopClassicTimer();
            handleClassicPass(true);
        }
    }, 1000);
}

function getClassicQuarterText(item) {
    const raw = String((item && item.since) || '').trim();
    const parsed = new Date(raw);
    const month = Number.isNaN(parsed.getTime()) ? Number(raw.split('-')[1]) : (parsed.getMonth() + 1);
    if (!month) return '\uBD84\uAE30 \uC815\uBCF4 \uC5C6\uC74C';
    if (month <= 3) return '1\uBD84\uAE30';
    if (month <= 6) return '2\uBD84\uAE30';
    if (month <= 9) return '3\uBD84\uAE30';
    return '4\uBD84\uAE30';
}

function getClassicYearText(item) {
    const raw = String((item && item.since) || '').trim();
    const year = raw.split('-')[0];
    return /^\d{4}$/.test(year) ? `${year}\uB144` : '\uC5F0\uB3C4 \uC815\uBCF4 \uC5C6\uC74C';
}

function getClassicPrimaryTypeHint(item) {
    const type = normalizeType(item && item.type);
    const subtype = getExclusiveSubtype(item);
    let prefix = '\uB85C\uC584';
    if (subtype === 'gold silver') prefix = '\uAE08\uC190/\uC740\uC190';
    else if (subtype === 'master label') prefix = '\uB9C8\uC2A4\uD130\uB77C\uBCA8';
    else if (subtype === 'salon') prefix = '\uBE14\uB808\uC5B4 \uC0B4\uB871';
    else if (subtype === 'boutique') prefix = '\uBD80\uD2F0\uD06C';
    else if (subtype === 'collab') prefix = '\uCF5C\uB77C\uBCF4';

    if (type.includes('hair')) {
        if (type.includes('female')) return `${prefix} \uC5EC\uC790 \uD5E4\uC5B4\uC774\uB2E4.`;
        if (type.includes('male')) return `${prefix} \uB0A8\uC790 \uD5E4\uC5B4\uC774\uB2E4.`;
        return `${prefix} \uACF5\uC6A9 \uD5E4\uC5B4\uC774\uB2E4.`;
    }
    if (type.includes('face')) {
        if (type.includes('female')) return `${prefix} \uC5EC\uC790 \uC131\uD615\uC774\uB2E4.`;
        if (type.includes('male')) return `${prefix} \uB0A8\uC790 \uC131\uD615\uC774\uB2E4.`;
        return `${prefix} \uACF5\uC6A9 \uC131\uD615\uC774\uB2E4.`;
    }
    return `${prefix} \uC544\uC774\uD15C\uC774\uB2E4.`;
}

function getClassicDetailHint(item) {
    const subtype = getExclusiveSubtype(item);
    if (!subtype) {
        return getAwardsEntryCount(item) > 0
            ? '\uBDF0\uD2F0\uC5B4\uC6CC\uC988\uC5D0 \uD3EC\uD568\uB41C \uC801\uC774 \uC788\uB2E4.'
            : '\uBDF0\uD2F0\uC5B4\uC6CC\uC988\uC5D0 \uD3EC\uD568\uB41C \uC801\uC774 \uC5C6\uB2E4.';
    }
    if (subtype === 'gold silver') {
        return `${getGoldSilverLabel(item)} \uC720\uD615\uC774\uB2E4.`;
    }
    if (subtype === 'master label' || subtype === 'salon') {
        const series = String((item && item.series) || '').trim();
        return series
            ? `${series}\uAE30 \uC720\uD615\uC774\uB2E4.`
            : '\uAE30\uC218 \uC815\uBCF4\uAC00 \uC5C6\uB2E4.';
    }
    if (subtype === 'boutique') {
        const hasBling = /\uBE14\uB9C1/.test(String((item && item.name) || ''));
        return hasBling
            ? '\uBE14\uB9C1 \uD0A4\uC6CC\uB4DC\uAC00 \uD3EC\uD568\uB41C\uB2E4.'
            : '\uBE14\uB9C1 \uD0A4\uC6CC\uB4DC\uAC00 \uD3EC\uD568\uB418\uC9C0 \uC54A\uB294\uB2E4.';
    }
    if (subtype === 'collab') {
        const collab = String((item && item.collab) || '').trim();
        return collab
            ? `${collab} \uCF5C\uB77C\uBCF4\uC774\uB2E4.`
            : '\uCF5C\uB77C\uBCF4 \uC815\uBCF4\uAC00 \uC5C6\uB2E4.';
    }
    return '\uCD94\uAC00 \uC815\uBCF4\uAC00 \uC5C6\uB2E4.';
}

function maskClassicHintWord(word) {
    return String(word || '').replace(/[0-9A-Za-z\u3131-\u318E\uAC00-\uD7A3]/g, '\u25CB');
}

function getClassicNameHint(item) {
    const name = String((item && item.name) || '').trim();
    const type = normalizeType(item && item.type);
    const suffix = type.includes('hair')
        ? '\uD5E4\uC5B4'
        : /\uC5BC\uAD74/.test(name)
            ? '\uC5BC\uAD74'
            : '\uC131\uD615';
    const extraParens = (name.match(/\((?!\s*(?:\uB0A8|\uC5EC)\s*\))[^)]+\)/g) || [])
        .map((part) => part.trim())
        .join(' ');

    let baseName = name
        .replace(/\(\uB0A8\)|\(\uC5EC\)/g, '')
        .replace(/\((?!\s*(?:\uB0A8|\uC5EC)\s*\))[^)]+\)/g, '')
        .replace(/\uD5E4\uC5B4/g, '')
        .replace(/\uC5BC\uAD74/g, '')
        .replace(/\uC131\uD615/g, '')
        .trim()
        .replace(/\s+/g, ' ');

    if (!baseName) {
        return `${suffix}\uC774\uB2E4.`;
    }

    const masked = baseName
        .split(' ')
        .filter(Boolean)
        .map(maskClassicHintWord)
        .join(' ');

    return `${masked} ${suffix}${extraParens ? ` ${extraParens}` : ''}\uC774\uB2E4.`;
}

function getClassicHintLabel(index, isOpen) {
    if (!isOpen) return 'LOCKED HINT';
    const item = classicBoardgameCurrentItem;
    if (!item) return `HINT ${index + 1}`;
    if (index === 0) return getClassicPrimaryTypeHint(item);
    if (index === 1) return `\uCD5C\uCD08 \uCD9C\uC2DC\uB294 ${getClassicQuarterText(item)}\uC774\uB2E4.`;
    if (index === 2) return `\uCD5C\uCD08 \uCD9C\uC2DC \uC5F0\uB3C4\uB294 ${getClassicYearText(item)}\uC774\uB2E4.`;
    if (index === 3) return getClassicDetailHint(item);
    if (index === 4) return getClassicNameHint(item);
    return `HINT ${index + 1}`;
}

function renderClassicScrolls() {
    const root = document.getElementById('classic-scroll-list');
    if (!root) return;
    root.innerHTML = '';

    for (let index = 0; index < CLASSIC_BOARDGAME_SCROLL_TOTAL; index++) {
        const isOpen = index < classicBoardgameOpenedHints;
        const card = document.createElement('div');
        card.className = `classic-scroll-card ${isOpen ? 'is-open' : 'is-closed'}`;
        card.innerHTML = `
            <img src="${isOpen ? 'boardgame/OPEN.png' : 'boardgame/CLOSE.png'}" alt="">
            <div class="classic-scroll-label">${getClassicHintLabel(index, isOpen)}</div>
        `;
        root.appendChild(card);
    }

    const hintButton = document.getElementById('classic-hint-button');
    if (hintButton) {
        const canPass = classicBoardgameOpenedHints >= CLASSIC_BOARDGAME_SCROLL_TOTAL;
        hintButton.textContent = canPass ? 'PASS' : 'HINT';
        hintButton.classList.toggle('is-pass', canPass);
        hintButton.disabled = classicBoardgameLocked;
    }

    const progress = document.getElementById('classic-hint-progress');
    if (progress) progress.textContent = `힌트 개수: ${classicBoardgameOpenedHints} / ${CLASSIC_BOARDGAME_SCROLL_TOTAL}`;
}

function revealClassicAnswer(showImage = true) {
    const imageEl = document.getElementById('classic-question-image');
    const answerState = document.getElementById('classic-answer-state');
    const answerName = document.getElementById('classic-answer-name');

    if (imageEl) {
        if (classicBoardgameCurrentItem) {
            imageEl.src = resolveItemImageSrc(classicBoardgameCurrentItem);
            imageEl.classList.toggle('is-silhouette', !showImage);
        } else {
            imageEl.src = 'boardgame/QUESTION.png';
            imageEl.classList.remove('is-silhouette');
        }
    }
    if (answerState) {
        answerState.textContent = classicBoardgameCurrentItem
            ? `정답: ${showImage ? classicBoardgameCurrentItem.name : '???'}`
            : '정답: ???';
    }
    if (answerName) {
        if (showImage && classicBoardgameCurrentItem) {
            answerName.style.display = 'block';
            answerName.textContent = classicBoardgameCurrentItem.name;
        } else {
            answerName.style.display = 'none';
            answerName.textContent = '';
        }
    }
}

function setClassicFeedback(message, color = '#7a4f00') {
    const feedback = document.getElementById('classic-feedback');
    if (!feedback) return;
    feedback.textContent = message || '';
    feedback.style.color = color;
}

function getClassicRoundScore() {
    return Math.max(1, 6 - classicBoardgameOpenedHints);
}

function renderClassicBoardgameQuestion() {
    const titleEl = document.getElementById('classic-game-title');
    const modeEl = document.getElementById('classic-mode-label');
    const statusEl = document.getElementById('classic-status-text');
    const inputEl = document.getElementById('classic-answer-input');

    if (titleEl) titleEl.textContent = `CLASSIC MODE ${classicBoardgameCategory === 'hair' ? '(헤어)' : '(성형)'}`;
    if (modeEl) modeEl.textContent = classicBoardgameCategory === 'hair' ? '모드 : 헤어' : '모드 : 성형';
    if (statusEl) statusEl.textContent = '정답을 유추하십시오.';
    if (inputEl) {
        inputEl.value = '';
        inputEl.focus();
    }

    resetClassicLives();
    classicBoardgameOpenedHints = 1;
    classicBoardgameLocked = false;
    revealClassicAnswer(false);
    renderClassicScrolls();
    setClassicFeedback('');
}

function pickNextClassicBoardgameItem() {
    if (!classicBoardgamePool.length) {
        classicBoardgameCurrentItem = null;
        return;
    }
    classicBoardgameCurrentItem = classicBoardgamePool[Math.floor(Math.random() * classicBoardgamePool.length)];
}

function queueNextClassicQuestion(delay = CLASSIC_BOARDGAME_REVEAL_DELAY) {
    classicBoardgameLocked = true;
    setTimeout(() => {
        pickNextClassicBoardgameItem();
        renderClassicBoardgameQuestion();
    }, delay);
}

function closeClassicGameOverToHome() {
    const overlay = document.getElementById('classic-gameover-overlay');
    if (overlay) overlay.remove();
    stopClassicTimer();
    classicBoardgameLocked = false;
    if (typeof returnToSearch === 'function') {
        returnToSearch();
        return;
    }
    if (typeof showTab === 'function') {
        showTab('search-section');
    }
    if (typeof moveToHome === 'function') {
        moveToHome();
    }
}

function showClassicGameOverModal() {
    const existing = document.getElementById('classic-gameover-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'classic-gameover-overlay';
    overlay.className = 'center-notice-overlay';
    overlay.innerHTML = `
        <div class="center-notice-box">
            <div class="notice-icon">⭐</div>
            <div class="notice-text">GAME OVER<br>SCORE ${classicBoardgameScore}</div>
            <div style="margin-top:16px;">
                <button class="btn btn-home" type="button" id="classic-gameover-home" onclick="closeClassicGameOverToHome()">HOME</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const homeBtn = document.getElementById('classic-gameover-home');
    if (homeBtn) {
        homeBtn.onclick = closeClassicGameOverToHome;
    }
}

function handleClassicGameOver() {
    stopClassicTimer();
    classicBoardgameLocked = true;
    revealClassicAnswer(true);
    setClassicFeedback('GAME OVER', '#d94841');
    showClassicGameOverModal();
}

function consumeClassicLife() {
    if (classicBoardgameLives <= 0) return;
    const lostIndex = classicBoardgameLives - 1;
    const heartEls = document.querySelectorAll(`[data-classic-life-index="${lostIndex}"]`);
    heartEls.forEach((heartEl) => {
        heartEl.classList.add('bursting');
        createQuizHeartBurst(heartEl);
    });

    setTimeout(() => {
        classicBoardgameLives = Math.max(0, classicBoardgameLives - 1);
        renderClassicLives();
        if (classicBoardgameLives === 0) {
            handleClassicPass(false, 'OUT OF LIFE · 0 POINT');
        }
    }, 420);
}

function normalizeClassicAnswer(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\(\s*남\s*\)|\(\s*여\s*\)/g, '')
        .replace(/\s+/g, '')
        .replace(/[()]/g, '');
}

function submitClassicAnswer() {
    if (classicBoardgameLocked || !classicBoardgameCurrentItem) return;
    const inputEl = document.getElementById('classic-answer-input');
    const answer = String(inputEl && inputEl.value || '').trim();
    if (!answer) {
        setClassicFeedback('Type an answer first.', '#a36a00');
        return;
    }

    if (normalizeClassicAnswer(answer) === normalizeClassicAnswer(classicBoardgameCurrentItem.name)) {
        const gained = getClassicRoundScore();
        classicBoardgameScore += gained;
        updateClassicScore();
        classicBoardgameLocked = true;
        revealClassicAnswer(true);
        setClassicFeedback(`CORRECT +${gained}`, '#1f8b4c');
        setTimeout(() => queueNextClassicQuestion(CLASSIC_BOARDGAME_REVEAL_DELAY), CLASSIC_BOARDGAME_REVEAL_DELAY);
        return;
    }

    setClassicFeedback('WRONG ANSWER', '#d94841');
    if (inputEl) inputEl.select();
    consumeClassicLife();
}

function handleClassicPass(isTimeOver = false, overrideMessage = '') {
    if (isTimeOver) {
        handleClassicGameOver();
        return;
    }
    if (classicBoardgameLocked || !classicBoardgameCurrentItem) return;
    classicBoardgameLocked = true;
    revealClassicAnswer(true);
    setClassicFeedback(overrideMessage || (isTimeOver ? 'TIME OVER · 0 POINT' : 'PASS · 0 POINT'), '#a36a00');
    setTimeout(() => queueNextClassicQuestion(CLASSIC_BOARDGAME_REVEAL_DELAY), CLASSIC_BOARDGAME_REVEAL_DELAY);
}

function handleClassicHintAction() {
    if (classicBoardgameLocked) return;
    if (classicBoardgameOpenedHints >= CLASSIC_BOARDGAME_SCROLL_TOTAL) {
        handleClassicPass(false);
        return;
    }
    classicBoardgameOpenedHints += 1;
    renderClassicScrolls();
    setClassicFeedback(`힌트 ${classicBoardgameOpenedHints}개 개방`, '#7a4f00');
}

function startClassicBoardgame(category) {
    classicBoardgameCategory = category === 'face' ? 'face' : 'hair';
    classicBoardgamePool = getClassicBoardgamePool(classicBoardgameCategory);
    if (!classicBoardgamePool.length) {
        alert('No available items for this mode yet.');
        return;
    }
    classicBoardgameScore = 0;
    updateClassicScore();
    pickNextClassicBoardgameItem();
    renderClassicBoardgameQuestion();
    startClassicTimer();
    showTab('boardgame-classic-play-section');
}

const QUINTER9_BOARDGAME_MAX_LIVES = 3;
const QUINTER9_BOARDGAME_TIME_LIMIT = 300;
const QUINTER9_BOARDGAME_SCROLL_TOTAL = 5;
const QUINTER9_BOARDGAME_REVEAL_DELAY = 1500;
const QUINTER9_TARGET_SUM = 99999;
let quinter9BoardgameTimer = null;
let quinter9BoardgameSecondsLeft = QUINTER9_BOARDGAME_TIME_LIMIT;
let quinter9BoardgameLives = QUINTER9_BOARDGAME_MAX_LIVES;
let quinter9BoardgameScore = 0;
let quinter9BoardgameCategory = 'hair';
let quinter9BoardgameAnswerPool = [];
let quinter9BoardgamePairPool = [];
let quinter9BoardgameCurrentItem = null;
let quinter9BoardgameCurrentPairItem = null;
let quinter9BoardgameCurrentSum = 0;
let quinter9BoardgameOpenedHints = 1;
let quinter9BoardgameLocked = false;

function getItemNumericCode(item) {
    const raw = item && Object.prototype.hasOwnProperty.call(item, 'code') ? item.code : null;
    if (raw === null || typeof raw === 'undefined') return null;
    const normalized = String(raw).trim();
    if (!/^\d+$/.test(normalized)) return null;
    const value = Number.parseInt(normalized, 10);
    return Number.isFinite(value) ? value : null;
}

function getQuinter9PairCategory(category) {
    return category === 'face' ? 'hair' : 'face';
}

function getQuinter9GenderGroup(item) {
    const type = normalizeType(item && item.type);
    if (type.includes('male')) return 'male';
    if (type.includes('female')) return 'female';
    return 'common';
}

function isQuinter9GenderCompatible(pairItem, answerItem) {
    const pairGender = getQuinter9GenderGroup(pairItem);
    const answerGender = getQuinter9GenderGroup(answerItem);
    if (pairGender === answerGender) return true;
    if (pairGender === 'common' || answerGender === 'common') return true;
    return false;
}

function getQuinter9BoardgamePool(category) {
    if (typeof items === 'undefined' || !Array.isArray(items)) return [];
    return items.filter((item) => {
        const type = normalizeType(item && item.type);
        const code = getItemNumericCode(item);
        if (!type || code === null) return false;
        if (isQmPlaceholderItem(item)) return false;
        if (category === 'hair') return type.includes('hair');
        if (category === 'face') return type.includes('face');
        return false;
    });
}

function getQuinter9BestMatches(answerPool, pairItem) {
    const pairCode = getItemNumericCode(pairItem);
    if (pairCode === null) return [];

    const limit = QUINTER9_TARGET_SUM - pairCode;
    if (limit < 0) return [];

    let bestTotal = -1;
    let bestItems = [];

    answerPool.forEach((item) => {
        const answerCode = getItemNumericCode(item);
        if (!isQuinter9GenderCompatible(pairItem, item)) return;
        if (answerCode === null || answerCode > limit) return;
        const total = pairCode + answerCode;
        if (total > bestTotal) {
            bestTotal = total;
            bestItems = [item];
            return;
        }
        if (total === bestTotal) {
            bestItems.push(item);
        }
    });

    return bestItems;
}

function pickNextQuinter9BoardgameRound() {
    const eligiblePairs = quinter9BoardgamePairPool.filter((item) => getQuinter9BestMatches(quinter9BoardgameAnswerPool, item).length);
    if (!eligiblePairs.length) {
        quinter9BoardgameCurrentPairItem = null;
        quinter9BoardgameCurrentItem = null;
        quinter9BoardgameCurrentSum = 0;
        return false;
    }

    quinter9BoardgameCurrentPairItem = eligiblePairs[Math.floor(Math.random() * eligiblePairs.length)];
    const candidates = getQuinter9BestMatches(quinter9BoardgameAnswerPool, quinter9BoardgameCurrentPairItem);
    quinter9BoardgameCurrentItem = candidates[Math.floor(Math.random() * candidates.length)];
    quinter9BoardgameCurrentSum = (getItemNumericCode(quinter9BoardgameCurrentPairItem) || 0) + (getItemNumericCode(quinter9BoardgameCurrentItem) || 0);
    return Boolean(quinter9BoardgameCurrentPairItem && quinter9BoardgameCurrentItem);
}

function renderQuinter9Lives() {
    const roots = document.querySelectorAll('[data-quinter9-lives-root]');
    if (!roots.length) return;
    const markup = Array.from({ length: QUINTER9_BOARDGAME_MAX_LIVES }, (_, index) =>
        `<span class="quiz-life ${index < quinter9BoardgameLives ? '' : 'lost'}" data-quinter9-life-index="${index}">&#10084;</span>`
    ).join('');
    roots.forEach((root) => {
        root.innerHTML = markup;
    });
}

function resetQuinter9Lives() {
    quinter9BoardgameLives = QUINTER9_BOARDGAME_MAX_LIVES;
    renderQuinter9Lives();
}

function updateQuinter9Score() {
    const scoreEl = document.getElementById('quinter9-score');
    if (scoreEl) scoreEl.textContent = `SCORE ${quinter9BoardgameScore}`;
}

function updateQuinter9TimerDisplay() {
    const bar = document.getElementById('quinter9-timer-bar');
    const text = document.getElementById('quinter9-timer-text');
    const ratio = Math.max(0, Math.min(1, quinter9BoardgameSecondsLeft / QUINTER9_BOARDGAME_TIME_LIMIT));
    if (bar) bar.style.width = `${ratio * 100}%`;
    if (text) {
        const minutes = String(Math.floor(quinter9BoardgameSecondsLeft / 60)).padStart(2, '0');
        const seconds = String(quinter9BoardgameSecondsLeft % 60).padStart(2, '0');
        text.textContent = `TIME ${minutes}:${seconds}`;
    }
}

function stopQuinter9Timer() {
    if (quinter9BoardgameTimer) {
        clearInterval(quinter9BoardgameTimer);
        quinter9BoardgameTimer = null;
    }
}

function startQuinter9Timer() {
    stopQuinter9Timer();
    quinter9BoardgameSecondsLeft = QUINTER9_BOARDGAME_TIME_LIMIT;
    updateQuinter9TimerDisplay();
    quinter9BoardgameTimer = setInterval(() => {
        quinter9BoardgameSecondsLeft = Math.max(0, quinter9BoardgameSecondsLeft - 1);
        updateQuinter9TimerDisplay();
        if (quinter9BoardgameSecondsLeft <= 0) {
            stopQuinter9Timer();
            handleQuinter9Pass(true);
        }
    }, 1000);
}

function getQuinter9HintLabel(index, isOpen) {
    if (!isOpen) return 'LOCKED HINT';
    const item = quinter9BoardgameCurrentItem;
    if (!item) return `HINT ${index + 1}`;
    if (index === 0) return getClassicPrimaryTypeHint(item);
    if (index === 1) return `First release quarter: ${getClassicQuarterText(item)}`;
    if (index === 2) return `First release year: ${getClassicYearText(item)}`;
    if (index === 3) return getClassicDetailHint(item);
    if (index === 4) return getClassicNameHint(item);
    return `HINT ${index + 1}`;
}

function renderQuinter9Scrolls() {
    const root = document.getElementById('quinter9-scroll-list');
    if (!root) return;
    root.innerHTML = '';

    for (let index = 0; index < QUINTER9_BOARDGAME_SCROLL_TOTAL; index++) {
        const isOpen = index < quinter9BoardgameOpenedHints;
        const card = document.createElement('div');
        card.className = `classic-scroll-card ${isOpen ? 'is-open' : 'is-closed'}`;
        card.innerHTML = `
            <img src="${isOpen ? 'boardgame/OPEN.png' : 'boardgame/CLOSE.png'}" alt="">
            <div class="classic-scroll-label">${getQuinter9HintLabel(index, isOpen)}</div>
        `;
        root.appendChild(card);
    }

    const hintButton = document.getElementById('quinter9-hint-button');
    if (hintButton) {
        const canPass = quinter9BoardgameOpenedHints >= QUINTER9_BOARDGAME_SCROLL_TOTAL;
        hintButton.textContent = canPass ? 'PASS' : 'HINT';
        hintButton.classList.toggle('is-pass', canPass);
        hintButton.disabled = quinter9BoardgameLocked;
    }

    const progress = document.getElementById('quinter9-hint-progress');
    if (progress) progress.textContent = `HINT ${quinter9BoardgameOpenedHints} / ${QUINTER9_BOARDGAME_SCROLL_TOTAL}`;
}

function revealQuinter9Answer(showImage = true) {
    const pairImage = document.getElementById('quinter9-pair-image');
    const pairName = document.getElementById('quinter9-pair-name');
    const pairCode = document.getElementById('quinter9-pair-code');
    const answerImage = document.getElementById('quinter9-question-image');
    const answerCode = document.getElementById('quinter9-answer-code');
    const codeRule = document.getElementById('quinter9-code-rule');
    const answerState = document.getElementById('quinter9-answer-state');
    const answerName = document.getElementById('quinter9-answer-name');

    const pairCodeValue = getItemNumericCode(quinter9BoardgameCurrentPairItem);
    const answerCodeValue = getItemNumericCode(quinter9BoardgameCurrentItem);

    if (pairImage) {
        if (quinter9BoardgameCurrentPairItem) {
            pairImage.src = resolveItemImageSrc(quinter9BoardgameCurrentPairItem);
        } else {
            pairImage.src = 'boardgame/QUESTION.png';
        }
    }
    if (pairName) {
        pairName.textContent = quinter9BoardgameCurrentPairItem ? quinter9BoardgameCurrentPairItem.name : 'PAIR ITEM';
    }
    if (pairCode) {
        pairCode.textContent = pairCodeValue === null ? '-----' : String(pairCodeValue).padStart(5, '0');
    }

    if (answerImage) {
        if (quinter9BoardgameCurrentItem) {
            answerImage.src = resolveItemImageSrc(quinter9BoardgameCurrentItem);
            answerImage.classList.toggle('is-silhouette', !showImage);
        } else {
            answerImage.src = 'boardgame/QUESTION.png';
            answerImage.classList.remove('is-silhouette');
        }
    }
    if (answerCode) {
        answerCode.textContent = showImage && answerCodeValue !== null
            ? String(answerCodeValue).padStart(5, '0')
            : '?????';
    }
    if (codeRule) {
        const leftValue = pairCodeValue === null ? '-----' : String(pairCodeValue).padStart(5, '0');
        const rightValue = showImage && answerCodeValue !== null
            ? String(answerCodeValue).padStart(5, '0')
            : '?????';
        const totalValue = showImage && quinter9BoardgameCurrentItem
            ? String(quinter9BoardgameCurrentSum).padStart(5, '0')
            : 'MAX <= 99999';
        codeRule.textContent = showImage
            ? `${leftValue} + ${rightValue} = ${totalValue}`
            : `${leftValue} + ${rightValue} <= 99999`;
    }
    if (answerState) {
        answerState.textContent = quinter9BoardgameCurrentItem
            ? `ANSWER: ${showImage ? quinter9BoardgameCurrentItem.name : '???'}`
            : 'ANSWER: ???';
    }
    if (answerName) {
        if (showImage && quinter9BoardgameCurrentItem) {
            answerName.style.display = 'block';
            answerName.textContent = quinter9BoardgameCurrentItem.name;
        } else {
            answerName.style.display = 'none';
            answerName.textContent = '';
        }
    }
}

function setQuinter9Feedback(message, color = '#7a4f00') {
    const feedback = document.getElementById('quinter9-feedback');
    if (!feedback) return;
    feedback.textContent = message || '';
    feedback.style.color = color;
}

function getQuinter9RoundScore() {
    return Math.max(1, 6 - quinter9BoardgameOpenedHints);
}

function renderQuinter9BoardgameQuestion() {
    const titleEl = document.getElementById('quinter9-game-title');
    const modeEl = document.getElementById('quinter9-mode-label');
    const statusEl = document.getElementById('quinter9-status-text');
    const inputEl = document.getElementById('quinter9-answer-input');
    const pairCategory = getQuinter9PairCategory(quinter9BoardgameCategory);

    if (titleEl) titleEl.textContent = `QUINTER9 MODE ${quinter9BoardgameCategory === 'hair' ? '(HAIR)' : '(FACE)'}`;
    if (modeEl) modeEl.textContent = `PAIR ${pairCategory.toUpperCase()} -> ANSWER ${quinter9BoardgameCategory.toUpperCase()}`;
    if (statusEl) statusEl.textContent = 'Find the best-fit answer under 99999.';
    if (inputEl) {
        inputEl.value = '';
        inputEl.focus();
    }

    resetQuinter9Lives();
    quinter9BoardgameOpenedHints = 1;
    quinter9BoardgameLocked = false;
    revealQuinter9Answer(false);
    renderQuinter9Scrolls();
    setQuinter9Feedback('');
}

function queueNextQuinter9Question(delay = QUINTER9_BOARDGAME_REVEAL_DELAY) {
    quinter9BoardgameLocked = true;
    setTimeout(() => {
        if (!pickNextQuinter9BoardgameRound()) {
            handleQuinter9GameOver();
            return;
        }
        renderQuinter9BoardgameQuestion();
    }, delay);
}

function closeQuinter9GameOverToHome() {
    const overlay = document.getElementById('quinter9-gameover-overlay');
    if (overlay) overlay.remove();
    stopQuinter9Timer();
    quinter9BoardgameLocked = false;
    if (typeof returnToSearch === 'function') {
        returnToSearch();
        return;
    }
    if (typeof showTab === 'function') {
        showTab('search-section');
    }
    if (typeof moveToHome === 'function') {
        moveToHome();
    }
}

function showQuinter9GameOverModal() {
    const existing = document.getElementById('quinter9-gameover-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'quinter9-gameover-overlay';
    overlay.className = 'center-notice-overlay';
    overlay.innerHTML = `
        <div class="center-notice-box">
            <div class="notice-icon">⭐</div>
            <div class="notice-text">GAME OVER<br>SCORE ${quinter9BoardgameScore}</div>
            <div style="margin-top:16px;">
                <button class="btn btn-home" type="button" id="quinter9-gameover-home" onclick="closeQuinter9GameOverToHome()">HOME</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const homeBtn = document.getElementById('quinter9-gameover-home');
    if (homeBtn) {
        homeBtn.onclick = closeQuinter9GameOverToHome;
    }
}

function handleQuinter9GameOver() {
    stopQuinter9Timer();
    quinter9BoardgameLocked = true;
    revealQuinter9Answer(true);
    setQuinter9Feedback('GAME OVER', '#d94841');
    showQuinter9GameOverModal();
}

function consumeQuinter9Life() {
    if (quinter9BoardgameLives <= 0) return;
    const lostIndex = quinter9BoardgameLives - 1;
    const heartEls = document.querySelectorAll(`[data-quinter9-life-index="${lostIndex}"]`);
    heartEls.forEach((heartEl) => {
        heartEl.classList.add('bursting');
        createQuizHeartBurst(heartEl);
    });

    setTimeout(() => {
        quinter9BoardgameLives = Math.max(0, quinter9BoardgameLives - 1);
        renderQuinter9Lives();
        if (quinter9BoardgameLives === 0) {
            handleQuinter9Pass(false, 'OUT OF LIFE · 0 POINT');
        }
    }, 420);
}

function submitQuinter9Answer() {
    if (quinter9BoardgameLocked || !quinter9BoardgameCurrentItem) return;
    const inputEl = document.getElementById('quinter9-answer-input');
    const answer = String(inputEl && inputEl.value || '').trim();
    if (!answer) {
        setQuinter9Feedback('Type an answer first.', '#a36a00');
        return;
    }

    if (normalizeClassicAnswer(answer) === normalizeClassicAnswer(quinter9BoardgameCurrentItem.name)) {
        const gained = getQuinter9RoundScore();
        quinter9BoardgameScore += gained;
        updateQuinter9Score();
        quinter9BoardgameLocked = true;
        revealQuinter9Answer(true);
        setQuinter9Feedback(`CORRECT +${gained}`, '#1f8b4c');
        setTimeout(() => queueNextQuinter9Question(QUINTER9_BOARDGAME_REVEAL_DELAY), QUINTER9_BOARDGAME_REVEAL_DELAY);
        return;
    }

    setQuinter9Feedback('WRONG ANSWER', '#d94841');
    if (inputEl) inputEl.select();
    consumeQuinter9Life();
}

function handleQuinter9Pass(isTimeOver = false, overrideMessage = '') {
    if (isTimeOver) {
        handleQuinter9GameOver();
        return;
    }
    if (quinter9BoardgameLocked || !quinter9BoardgameCurrentItem) return;
    quinter9BoardgameLocked = true;
    revealQuinter9Answer(true);
    setQuinter9Feedback(overrideMessage || (isTimeOver ? 'TIME OVER · 0 POINT' : 'PASS · 0 POINT'), '#a36a00');
    setTimeout(() => queueNextQuinter9Question(QUINTER9_BOARDGAME_REVEAL_DELAY), QUINTER9_BOARDGAME_REVEAL_DELAY);
}

function handleQuinter9HintAction() {
    if (quinter9BoardgameLocked) return;
    if (quinter9BoardgameOpenedHints >= QUINTER9_BOARDGAME_SCROLL_TOTAL) {
        handleQuinter9Pass(false);
        return;
    }
    quinter9BoardgameOpenedHints += 1;
    renderQuinter9Scrolls();
    setQuinter9Feedback(`Hint ${quinter9BoardgameOpenedHints} opened`, '#7a4f00');
}
