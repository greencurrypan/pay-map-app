// ============================================================================
// PayMap Pro - 最適決済＆ポイント二重取り・期間限定クーポン・特約店カスタム判定エンジン (v2)
// ============================================================================

/**
 * 店舗名やOSMタグから該当するチェーンマスタを検索・推論する
 */
function matchStoreChain(storeName = '', osmTags = {}, explicitChainId = null) {
  if (explicitChainId) {
    const found = STORE_CHAINS.find((c) => c.id === explicitChainId);
    if (found) return found;
  }

  const normalized = `${storeName} ${osmTags.brand || ''} ${osmTags['brand:ja'] || ''} ${osmTags.operator || ''}`.toLowerCase();

  for (const chain of STORE_CHAINS) {
    if (chain.keywords && chain.keywords.length > 0) {
      for (const kw of chain.keywords) {
        if (normalized.includes(kw.toLowerCase())) {
          return chain;
        }
      }
    }
  }

  const shop = osmTags.shop || '';
  const amenity = osmTags.amenity || '';

  if (shop === 'convenience') {
    return {
      ...STORE_CHAINS.find((c) => c.id === 'local_cashless'),
      category: 'convenience',
      categoryLabel: 'コンビニ（その他）',
      icon: '🏪',
    };
  }
  if (amenity === 'cafe' || shop === 'coffee') {
    return {
      ...STORE_CHAINS.find((c) => c.id === 'local_cashless'),
      category: 'cafe',
      categoryLabel: 'カフェ・喫茶店',
      icon: '☕',
    };
  }
  if (amenity === 'restaurant' || amenity === 'fast_food' || amenity === 'bar' || amenity === 'Izakaya') {
    return {
      ...STORE_CHAINS.find((c) => c.id === 'local_cashless'),
      category: 'restaurant',
      categoryLabel: '飲食店・レストラン',
      icon: '🍽️',
    };
  }
  if (shop === 'chemist' || amenity === 'pharmacy') {
    return {
      ...STORE_CHAINS.find((c) => c.id === 'local_cashless'),
      category: 'drugstore',
      categoryLabel: 'ドラッグストア・薬局',
      icon: '💊',
    };
  }
  if (shop === 'supermarket') {
    return {
      ...STORE_CHAINS.find((c) => c.id === 'local_cashless'),
      category: 'supermarket',
      categoryLabel: 'スーパーマーケット',
      icon: '🛒',
    };
  }
  if (shop === 'electronics') {
    return STORE_CHAINS.find((c) => c.id === 'electronics');
  }

  return STORE_CHAINS.find((c) => c.id === 'local_cashless');
}

/**
 * クーポンの有効期限チェックと残り日数計算
 */
function checkCouponValidity(coupon) {
  if (!coupon.enabled) return { isValid: false, isExpired: false, daysLeft: null };
  if (!coupon.expiresAt) return { isValid: true, isExpired: false, daysLeft: null };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const exp = new Date(`${coupon.expiresAt}T23:59:59`);
  if (isNaN(exp.getTime())) return { isValid: true, isExpired: false, daysLeft: null };

  const diffMs = exp.getTime() - todayStart.getTime();
  const daysLeft = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) {
    return { isValid: false, isExpired: true, daysLeft };
  }
  return { isValid: true, isExpired: false, daysLeft };
}

/**
 * この店舗に適用される期間限定クーポン一覧を抽出する
 */
function getMatchingCouponsForStore(storeObj, chain, settings) {
  const coupons = settings.limitedCoupons || [];
  const storeText = `${storeObj.name || ''} ${chain.name || ''}`.toLowerCase();
  const matched = [];

  for (const cp of coupons) {
    const validity = checkCouponValidity(cp);
    if (!validity.isValid) continue;

    let isTarget = false;
    if (cp.targetType === 'all' || cp.targetChainId === 'all') {
      isTarget = true;
    } else if (cp.targetChainId && cp.targetChainId === chain.id) {
      isTarget = true;
    } else if (cp.targetKeyword && storeText.includes(cp.targetKeyword.toLowerCase())) {
      isTarget = true;
    }

    if (isTarget) {
      matched.push({
        ...cp,
        daysLeft: validity.daysLeft,
      });
    }
  }

  return matched;
}

/**
 * エポスゴールド「選べるポイントアップショップ（3枠＋カスタム候補）」にこの店舗が該当するか判定
 */
function checkEposPointUpMatch(storeObj, chain, eposSettings) {
  const selectedIds = eposSettings.selectedPointUpShops || [];
  if (selectedIds.length === 0) return { matched: false, matchedShopName: null };

  const allCandidates = [
    ...EPOS_POINT_UP_CANDIDATES,
    ...(eposSettings.customPointUpCandidates || []),
  ];

  // 1. チェーンの eposPointUpId が直接選択されているか
  if (chain.eposPointUpId && selectedIds.includes(chain.eposPointUpId)) {
    const cand = allCandidates.find((c) => c.id === chain.eposPointUpId);
    return { matched: true, matchedShopName: cand ? cand.name.split('（')[0] : chain.name };
  }

  // 2. 選択されている各候補のキーワードが店舗名・チェーン名に含まれるか（自由追加ショップ対応）
  const targetText = `${storeObj.name || ''} ${chain.name || ''}`.toLowerCase();
  for (const id of selectedIds) {
    if (id === 'mobile_suica') continue; // SuicaチャージはSuica側で計算
    const cand = allCandidates.find((c) => c.id === id);
    if (!cand) continue;

    const kws = cand.keywords && cand.keywords.length > 0 ? cand.keywords : [cand.name];
    for (const kw of kws) {
      if (kw && targetText.includes(kw.toLowerCase())) {
        return { matched: true, matchedShopName: cand.name.split('（')[0] };
      }
    }
  }

  return { matched: false, matchedShopName: null };
}

/**
 * JCBカード「自分でエントリー（ポイントアップ登録）した店舗」に該当するか判定
 */
function checkJcbPartnerMatch(storeObj, chain, jcbSettings) {
  const partners = jcbSettings.registeredPartners || [];
  const targetText = `${storeObj.name || ''} ${chain.name || ''}`.toLowerCase();

  for (const p of partners) {
    if (!p.enabled) continue;
    const matchByChain = p.targetChainId && p.targetChainId === chain.id;
    const matchByKw = p.keyword && targetText.includes(p.keyword.toLowerCase());
    if (matchByChain || matchByKw) {
      return p;
    }
  }
  return null;
}

/**
 * 店舗とユーザーのカード設定・期間限定クーポン・特約店選択から、
 * 1) 提示するポイントカード・アプリ (STEP 1)
 * 2) 決済手段ランキング (STEP 2)
 * 3) 適用中の期間限定クーポン＆合計最大還元率
 * を算出する
 */
function evaluateStorePayment(storeObj, settings) {
  const chain = storeObj.chain || matchStoreChain(storeObj.name, storeObj.osmTags, storeObj.chainId);
  const cards = settings.cards;
  const pointCards = settings.pointCards;

  // 適用される期間限定クーポンを抽出
  const matchedCoupons = getMatchingCouponsForStore(storeObj, chain, settings);

  // --------------------------------------------------------------------------
  // STEP 1: 会計前に提示して貯めるポイント（二重取り・三重取り）の判定
  // --------------------------------------------------------------------------
  const activePresentations = [];
  let presentationTotalRate = 0;

  let commonPointAdded = false;
  const isDoubleCommonPointAllowed = chain.id === 'welcia';

  if (chain.pointPresentation && chain.pointPresentation.length > 0) {
    for (const p of chain.pointPresentation) {
      const userHasPoint = pointCards[p.type]?.enabled ?? true;
      if (!userHasPoint) continue;

      const isStoreApp = p.type === 'store_apps';
      if (isStoreApp) {
        activePresentations.push({
          ...p,
          badge: pointCards[p.type]?.name || '公式アプリ',
          icon: pointCards[p.type]?.icon || '📱',
          isCombined: true,
        });
        presentationTotalRate += p.rate || 0;
      } else {
        if (!commonPointAdded || isDoubleCommonPointAllowed) {
          activePresentations.push({
            ...p,
            badge: pointCards[p.type]?.name || '共通ポイント',
            icon: pointCards[p.type]?.icon || '🅿️',
            isCombined: true,
          });
          presentationTotalRate += p.rate || 0;
          commonPointAdded = true;
        }
      }
    }
  }

  // 共通ポイント増量系の期間限定クーポンがあればSTEP 1に加算
  const pointCoupons = matchedCoupons.filter((c) => c.cardId === 'point_extra');
  for (const pcp of pointCoupons) {
    activePresentations.push({
      type: 'coupon_point',
      title: `🎟️ 【期間限定】${pcp.title}`,
      rate: Number(pcp.bonusRate || 0),
      detail: `${pcp.conditionNote || '期間限定ポイント増量'}（期限: ${pcp.expiresAt || 'なし'}）`,
      badge: '期間限定CP',
      icon: '🎟️',
      isCoupon: true,
    });
    presentationTotalRate += Number(pcp.bonusRate || 0);
  }

  // --------------------------------------------------------------------------
  // STEP 2: 保有6決済手段それぞれの還元率・特約店・期間限定クーポン加算
  // --------------------------------------------------------------------------
  const rankings = [];

  // カード別クーポン集計ヘルパー
  const getCardCouponBonus = (cardId) => {
    const list = matchedCoupons.filter((c) => c.cardId === cardId);
    const bonus = list.reduce((sum, item) => sum + Number(item.bonusRate || 0), 0);
    return { bonus, list };
  };

  const eposBaseEffective =
    (cards.epos_gold.baseRate || 0.5) +
    (cards.epos_gold.include100ManBonus ? cards.epos_gold.bonus100ManRate || 1.0 : 0);

  const eposPointUpEffective =
    1.5 + (cards.epos_gold.include100ManBonus ? cards.epos_gold.bonus100ManRate || 1.0 : 0);

  const isMobileSuicaInEposPointUp =
    cards.epos_gold.enabled &&
    (cards.epos_gold.selectedPointUpShops || []).includes('mobile_suica');

  // ① Olive ゴールド (Visa)
  if (cards.olive_gold?.enabled) {
    const oliveBaseEffective =
      (cards.olive_gold.baseRate || 0.5) +
      (cards.olive_gold.include100ManBonus ? cards.olive_gold.bonus100ManRate || 1.0 : 0);

    let rate = oliveBaseEffective;
    let methodLabel = 'Olive ゴールド（クレジット / タッチ）';
    let badgeText = '通常決済';
    let warning = null;
    let reason = cards.olive_gold.include100ManBonus
      ? `基本0.5% ＋ 年間100万円利用ボーナス相当(+1.0%)`
      : `基本還元率 0.5%`;

    if (chain.oliveTouchTarget) {
      const extra = Number(cards.olive_gold.vPointUpExtraRate || 0);
      if (chain.oliveSevenSpecial && cards.olive_gold.sevenAppLinked) {
        rate = 9.5 + extra;
        methodLabel = 'Olive ゴールド【スマホのVisaタッチ決済】';
        badgeText = '🔥 特約店・スマホタッチ必須';
        reason = `セブン-イレブン特約店（セブンアプリVポイント連携で最大10%還元！）`;
        warning = '⚠️ 物理カード差し込みやiD払いはNG！必ず「Apple Pay / Google PayのVisaタッチ」で支払ってください！';
      } else {
        rate = (cards.olive_gold.touchTargetRate || 7.0) + extra;
        methodLabel = 'Olive ゴールド【スマホのVisaタッチ決済】';
        badgeText = '🔥 対象店7%〜還元';
        reason = `対象のコンビニ・飲食店でスマホのVisaタッチ決済（${rate.toFixed(1)}%還元）`;
        warning = '⚠️ 物理カードやiD払いは0.5%に激減します！必ず「スマホでVisaをタッチ」と伝えてください！';
      }
    } else if (chain.electronicsPointTrap) {
      rate = oliveBaseEffective - 2.0;
      badgeText = '⚠️ 店舗ポイント-2%減額注意';
      reason = `クレカ払いだと家電量販店のポイントが10%→8%(-2%)に減るため実質損になります（Suica払いがおすすめ）`;
    }

    const cp = getCardCouponBonus('olive_gold');
    if (cp.bonus > 0) {
      rate += cp.bonus;
      badgeText = `🎟️ クーポン+${cp.bonus}%適用中！`;
      reason += ` ＋ 期間限定【${cp.list.map((x) => x.title).join(' / ')} (+${cp.bonus}%)】`;
    }

    rankings.push({
      id: 'olive_gold',
      name: cards.olive_gold.name,
      shortName: cards.olive_gold.shortName,
      methodLabel,
      rate: Number(rate.toFixed(1)),
      badgeText,
      reason,
      warning,
      appliedCoupons: cp.list,
      color: cards.olive_gold.color,
      badgeBg: cards.olive_gold.badgeBg,
    });
  }

  // ② モバイルSuica（エポスゴールド連携考慮！）
  if (cards.suica?.enabled && chain.acceptsSuica !== false) {
    let suicaChargeRate = 0;
    let chargeReason = '';

    if (cards.suica.chargeSource === 'epos_gold' && isMobileSuicaInEposPointUp) {
      suicaChargeRate = eposPointUpEffective;
      chargeReason = cards.epos_gold.include100ManBonus
        ? 'エポスG（選べるポイントアップ3倍:1.5% ＋ 100万ボーナス:1.0%）からチャージ'
        : 'エポスG（選べるポイントアップ3倍:1.5%）からチャージ';
    } else if (cards.suica.chargeSource === 'epos_gold') {
      suicaChargeRate = eposBaseEffective;
      chargeReason = 'エポスGからチャージ（※選べる3枠にモバイルSuicaを登録すると+1.0%UP！）';
    } else {
      suicaChargeRate = 1.0;
      chargeReason = 'クレカチャージ';
    }

    const jreStoreBonus =
      cards.suica.jrePointLinked && chain.jrePointStoreRate ? chain.jrePointStoreRate : 0;

    let totalSuicaRate = suicaChargeRate + jreStoreBonus;
    let badgeText = isMobileSuicaInEposPointUp ? '🚃 エポスG×Suica高還元' : '🚃 交通系IC';
    let warning = null;

    if (jreStoreBonus > 0) {
      badgeText = `🚃 チャージ＋JRE二重取り`;
      chargeReason += ` ＋ JRE POINT加盟店ボーナス(+${jreStoreBonus}%)`;
    }
    if (chain.electronicsPointTrap) {
      badgeText = '👑 家電ポイント10%満額対象！';
      chargeReason += '（★クレカと違い店舗ポイント10%が減額されず満額つきます！）';
      warning = '💡 モバイルSuicaの上限は20,000円です。2万円以下の買い物ならSuica払いが最強！';
    }

    const cp = getCardCouponBonus('suica');
    if (cp.bonus > 0) {
      totalSuicaRate += cp.bonus;
      badgeText = `🎟️ クーポン+${cp.bonus}%適用中！`;
      chargeReason += ` ＋ 期間限定【${cp.list.map((x) => x.title).join(' / ')} (+${cp.bonus}%)】`;
    }

    rankings.push({
      id: 'suica',
      name: cards.suica.name,
      shortName: 'Suica (エポスG充当)',
      methodLabel: 'モバイルSuica決済（エポスゴールドからチャージ）',
      rate: Number(totalSuicaRate.toFixed(1)),
      badgeText,
      reason: chargeReason,
      warning,
      appliedCoupons: cp.list,
      color: cards.suica.color,
      badgeBg: cards.suica.badgeBg,
    });
  }

  // ③ エポスゴールド (Visa) 直接決済（選べる3ショップ自由選択対応！）
  if (cards.epos_gold?.enabled && chain.acceptsCredit !== false) {
    const eposMatch = checkEposPointUpMatch(storeObj, chain, cards.epos_gold);

    let rate = eposBaseEffective;
    let badgeText = cards.epos_gold.include100ManBonus ? '✨ 100万修行込み1.5%' : '通常決済';
    let reason = cards.epos_gold.include100ManBonus
      ? '基本0.5% ＋ 年間100万円ボーナス(+1.0%相当)'
      : '基本還元率 0.5%';
    let warning = null;

    if (eposMatch.matched) {
      rate = eposPointUpEffective;
      badgeText = `👑 選べる3枠登録店 (${eposMatch.matchedShopName})`;
      reason = `エポスG「選べるポイントアップショップ」選択中（ポイント3倍＝1.5%${
        cards.epos_gold.include100ManBonus ? ' ＋ 100万ボーナス1.0% ＝ 2.5%' : ''
      }）`;
    } else if (chain.eposSpecialRate) {
      rate = chain.eposSpecialRate + (cards.epos_gold.include100ManBonus ? 1.0 : 0);
      badgeText = '🏬 マルイ・モディ優待';
      reason = 'マルイ・モディ特約（ポイント2倍 ＋ マルコとマルオ期間中は10%OFF）';
    } else if (chain.electronicsPointTrap) {
      rate = rate - 2.0;
      badgeText = '⚠️ 店舗ポイント-2%減額注意';
      reason = 'クレカ払いだと家電量販店のポイントが10%→8%(-2%)に減るためSuica払いが有利です（2万円超の高額決済時はエポスGが候補）';
    }

    const cp = getCardCouponBonus('epos_gold');
    if (cp.bonus > 0) {
      rate += cp.bonus;
      badgeText = `🎟️ 優待/クーポン+${cp.bonus}%！`;
      reason += ` ＋ 期間限定【${cp.list.map((x) => x.title).join(' / ')} (+${cp.bonus}%)】`;
    }

    rankings.push({
      id: 'epos_gold',
      name: cards.epos_gold.name,
      shortName: cards.epos_gold.shortName,
      methodLabel: eposMatch.matched
        ? `エポスゴールド（選べる3枠・ポイント3倍対象！）`
        : 'エポスゴールド（Visaタッチ / クレジット）',
      rate: Number(rate.toFixed(1)),
      badgeText,
      reason,
      warning,
      isEposSelectedShop: eposMatch.matched,
      appliedCoupons: cp.list,
      color: cards.epos_gold.color,
      badgeBg: cards.epos_gold.badgeBg,
    });
  }

  // ④ JCBカード（ユーザー自身がエントリー選択したパートナー店舗＆倍率に対応！）
  if (cards.jcb_card?.enabled && chain.acceptsCredit !== false) {
    const base = cards.jcb_card.isCardW ? 1.0 : cards.jcb_card.baseRate || 0.5;
    let rate = base;
    let badgeText = '通常決済';
    let methodLabel = 'JCBカード（タッチ / クレジット）';
    let reason = `基本還元率 ${base.toFixed(1)}%`;
    let warning = null;

    const matchedPartner = checkJcbPartnerMatch(storeObj, chain, cards.jcb_card);

    if (matchedPartner && matchedPartner.rate > base) {
      rate = Number(matchedPartner.rate);
      badgeText = `🔥 JCB特約店 (${matchedPartner.multiplier}倍=${rate}%)`;
      reason =
        matchedPartner.note ||
        `JCB ORIGINAL SERIES ポイントアップ登録店（${matchedPartner.multiplier}倍 ＝ ${rate.toFixed(1)}%還元）`;
      if (chain.id === 'starbucks') {
        methodLabel = 'JCBカード → スタバカードにオンライン入金 / eGift';
        warning =
          '💡 レジで直接JCBカードを出すのではなく、アプリ内でスタバカードへオンライン入金（10倍=5%還元）またはeGift購入（20倍=10%還元）すると爆得です！';
      }
    } else if (chain.electronicsPointTrap) {
      rate = rate - 2.0;
      badgeText = '⚠️ 店舗ポイント-2%減額注意';
    }

    const cp = getCardCouponBonus('jcb_card');
    if (cp.bonus > 0) {
      rate += cp.bonus;
      badgeText = `🎟️ JCBキャンペーン+${cp.bonus}%！`;
      reason += ` ＋ 期間限定【${cp.list.map((x) => x.title).join(' / ')} (+${cp.bonus}%)】`;
    }

    rankings.push({
      id: 'jcb_card',
      name: cards.jcb_card.name,
      shortName: cards.jcb_card.shortName,
      methodLabel,
      rate: Number(rate.toFixed(1)),
      badgeText,
      reason,
      warning,
      isJcbPartnerMatched: Boolean(matchedPartner),
      appliedCoupons: cp.list,
      color: cards.jcb_card.color,
      badgeBg: cards.jcb_card.badgeBg,
    });
  }

  // ⑤ Amazon Mastercard
  if (cards.amazon_master?.enabled && chain.acceptsCredit !== false) {
    let rate = cards.amazon_master.baseRate || 1.0;
    let badgeText = '常時1.0%還元';
    let reason = 'どこでも安定した 1.0% Amazonポイント還元（100万修行の端数調整にも最適）';

    if (chain.amazonMasterRate && chain.amazonMasterRate > rate) {
      rate = chain.amazonMasterRate;
      badgeText = '🏪 セブン特約 1.5%';
      reason = 'セブン-イレブン特約で 1.5% Amazonポイント還元（※Oliveスマホタッチ7%〜の次点候補）';
    } else if (chain.electronicsPointTrap) {
      rate = rate - 2.0;
      badgeText = '⚠️ 店舗ポイント-2%減額注意';
    }

    const cp = getCardCouponBonus('amazon_master');
    if (cp.bonus > 0) {
      rate += cp.bonus;
      badgeText = `🎟️ クーポン+${cp.bonus}%！`;
      reason += ` ＋ 期間限定【${cp.list.map((x) => x.title).join(' / ')} (+${cp.bonus}%)】`;
    }

    rankings.push({
      id: 'amazon_master',
      name: cards.amazon_master.name,
      shortName: cards.amazon_master.shortName,
      methodLabel: 'Amazon Mastercard（タッチ / クレジット）',
      rate: Number(rate.toFixed(1)),
      badgeText,
      reason,
      warning: null,
      appliedCoupons: cp.list,
      color: cards.amazon_master.color,
      badgeBg: cards.amazon_master.badgeBg,
    });
  }

  // ⑥ PayPay
  if (cards.paypay?.enabled && chain.acceptsPayPay !== false) {
    const simBonus = Number(cards.paypay.activeCouponBonus || 0);
    const cp = getCardCouponBonus('paypay');
    const totalBonus = simBonus + cp.bonus;
    const rate = (cards.paypay.baseRate || 0.5) + totalBonus;

    let badgeText = totalBonus > 0 ? `🎟️ クーポン +${totalBonus}%適用中` : 'QR決済';
    let reason = `基本還元率 ${(cards.paypay.baseRate || 0.5).toFixed(1)}%`;

    if (cp.bonus > 0) {
      reason += ` ＋ 登録クーポン【${cp.list.map((x) => x.title).join(' / ')} (+${cp.bonus}%)】`;
    }
    if (simBonus > 0) {
      reason += ` ＋ 一時シミュレーター(+${simBonus}%)`;
    }

    rankings.push({
      id: 'paypay',
      name: cards.paypay.name,
      shortName: cards.paypay.shortName,
      methodLabel:
        totalBonus > 0 ? `PayPay（+${totalBonus}%クーポン/還元適用！）` : 'PayPay（QRコード決済）',
      rate: Number(rate.toFixed(1)),
      badgeText,
      reason,
      warning: null,
      appliedCoupons: cp.list,
      color: cards.paypay.color,
      badgeBg: cards.paypay.badgeBg,
    });
  }

  // 還元率の高い順にソート
  const priorityOrder = { suica: 1, olive_gold: 2, epos_gold: 3, jcb_card: 4, amazon_master: 5, paypay: 6 };
  rankings.sort((a, b) => {
    if (b.rate !== a.rate) return b.rate - a.rate;
    return (priorityOrder[a.id] || 99) - (priorityOrder[b.id] || 99);
  });

  const bestPayment = rankings[0] || {
    id: 'none',
    name: '現金 / その他',
    shortName: '決済手段なし',
    methodLabel: '設定からカードを有効化してください',
    rate: 0,
    badgeText: '-',
    reason: '',
    color: '#64748b',
    badgeBg: 'bg-slate-600',
  };

  const totalCombinedRate = Number((bestPayment.rate + presentationTotalRate).toFixed(1));

  return {
    chain,
    bestPayment,
    rankings,
    presentations: activePresentations,
    presentationTotalRate: Number(presentationTotalRate.toFixed(1)),
    totalCombinedRate,
    matchedCoupons,
    proTip: chain.proTip,
  };
}
