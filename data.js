// ============================================================================
// PayMap Pro - ユーザー専用プリセット＆店舗・ポイント・決済データベース (v2)
// 対象カード: Oliveゴールド(Visa), エポスゴールド(Visa), JCBカード, Amazon Mastercard, Suica, PayPay
// 強化機能: 期間限定クーポン管理 / エポス3枠カスタム選択 / JCBポイントアップ選択管理
// ============================================================================

const DEFAULT_USER_SETTINGS = {
  // 保有決済手段の詳細設定
  cards: {
    olive_gold: {
      enabled: true,
      name: 'Olive ゴールド (Visa)',
      shortName: 'Oliveタッチ',
      brand: 'Visa',
      color: '#006847', // 三井住友グリーン
      badgeBg: 'bg-emerald-700',
      textColor: 'text-emerald-400',
      baseRate: 0.5,
      include100ManBonus: true, // 年間100万円利用ボーナス(+1.0%相当)を加算するか
      bonus100ManRate: 1.0,
      touchTargetRate: 7.0, // 対象コンビニ・飲食店のスマホタッチ基本還元率
      vPointUpExtraRate: 0.0, // Vポイントアッププログラムの追加分（選べる特典+1%や家族ポイント等）
      sevenAppLinked: true, // セブン-イレブンアプリ連携（最大10%還元）
    },
    epos_gold: {
      enabled: true,
      name: 'エポスゴールド (Visa)',
      shortName: 'エポスG',
      brand: 'Visa',
      color: '#b48a3e', // ゴールド
      badgeBg: 'bg-amber-600',
      textColor: 'text-amber-400',
      baseRate: 0.5,
      include100ManBonus: true, // 年間100万円利用で+10,000pt（+1.0%相当）
      bonus100ManRate: 1.0,
      pointUpMultiplier: 3, // 選べるポイントアップショップ（基本0.5% × 3 = 1.5%）
      // 選べるポイントアップショップ（最大3枠）
      selectedPointUpShops: [
        'mobile_suica', // 枠1: モバイルSuica（最強ルート）
        'matsukiyo',    // 枠2: マツモトキヨシ
        'aeon',         // 枠3: イオン
      ],
      // ユーザーが自由追加したエポス対象ショップ候補
      customPointUpCandidates: [],
    },
    suica: {
      enabled: true,
      name: 'モバイルSuica',
      shortName: 'Suica',
      brand: '交通系IC',
      color: '#16a34a', // Suicaグリーン
      badgeBg: 'bg-green-600',
      textColor: 'text-green-400',
      chargeSource: 'epos_gold', // 'epos_gold' | 'other_1pct' | 'cash'
      jrePointLinked: true, // JRE POINT登録済みか
    },
    jcb_card: {
      enabled: true,
      name: 'JCBカード (OS)',
      shortName: 'JCBカード',
      brand: 'JCB',
      color: '#1d4ed8', // JCBブルー
      badgeBg: 'bg-blue-700',
      textColor: 'text-blue-400',
      isCardW: false, // JCB CARD Wなら基本1.0%、一般/ゴールドなら基本0.5%
      baseRate: 0.5,
      // JCB ORIGINAL SERIES パートナー（自分でエントリー選択・倍率調整可能な特約店リスト）
      registeredPartners: [
        {
          id: 'jcb_starbucks',
          targetChainId: 'starbucks',
          keyword: 'スターバックス',
          name: 'スターバックス (オンライン入金/オートチャージ)',
          enabled: true,
          multiplier: 10, // 10倍 = 5.0% (eGiftなら20倍 = 10.0%)
          rate: 5.0,
          note: 'MyJCBエントリー済：スタバカードオンライン入金で10倍(5.0%)、eGiftなら20倍(10.0%)',
        },
        {
          id: 'jcb_seven',
          targetChainId: 'seven_eleven',
          keyword: 'セブン-イレブン',
          name: 'セブン-イレブン',
          enabled: true,
          multiplier: 3, // 3倍 = 1.5%
          rate: 1.5,
          note: 'MyJCBエントリー済：ポイント3倍(1.5%)',
        },
        {
          id: 'jcb_welcia',
          targetChainId: 'welcia',
          keyword: 'ウエルシア',
          name: 'ウエルシア薬局 / ハックドラッグ',
          enabled: true,
          multiplier: 2, // 2倍 = 1.0%
          rate: 1.0,
          note: 'MyJCBエントリー済：ポイント2倍(1.0%)',
        },
        {
          id: 'jcb_bic',
          targetChainId: 'electronics',
          keyword: 'ビックカメラ',
          name: 'ビックカメラ / コジマ / ソフマップ',
          enabled: true,
          multiplier: 2, // 2倍 = 1.0%
          rate: 1.0,
          note: 'MyJCBエントリー済：ポイント2倍(1.0%)',
        },
        {
          id: 'jcb_mcdonalds',
          targetChainId: 'mcdonalds',
          keyword: 'マクドナルド',
          name: 'マクドナルド (モバイルオーダー / マックデリバリー)',
          enabled: true,
          multiplier: 10, // 10倍 = 5.0%
          rate: 5.0,
          note: 'MyJCBエントリー済：モバイルオーダー等でポイント10倍(5.0%)',
        },
        {
          id: 'jcb_成城石井',
          targetChainId: 'life_seiyu_super',
          keyword: '成城石井',
          name: '成城石井',
          enabled: false,
          multiplier: 2,
          rate: 1.0,
          note: 'MyJCBエントリーでポイント2倍(1.0%)',
        },
      ],
    },
    amazon_master: {
      enabled: true,
      name: 'Amazon Mastercard',
      shortName: 'Amazon MC',
      brand: 'Mastercard',
      color: '#ea580c', // Amazonオレンジ
      badgeBg: 'bg-orange-600',
      textColor: 'text-orange-400',
      isPrime: true, // プライム会員（Amazonで2.0%）
      baseRate: 1.0,
    },
    paypay: {
      enabled: true,
      name: 'PayPay',
      shortName: 'PayPay',
      brand: 'QRコード',
      color: '#dc2626', // PayPayレッド
      badgeBg: 'bg-red-600',
      textColor: 'text-red-400',
      baseRate: 0.5, // PayPayステップ達成時は1.0%や1.5%に変更可能
      activeCouponBonus: 0, // モーダル内の一時シミュレーター用
    },
  },

  // 🎟️ 期間限定クーポン・キャンペーン管理リスト（ON/OFF・期限・自由追加対応）
  limitedCoupons: [
    {
      id: 'cp_paypay_matsukiyo',
      title: 'PayPayクーポン：マツキヨ・ココカラ +5%還元',
      cardId: 'paypay', // 'paypay' | 'olive_gold' | 'epos_gold' | 'jcb_card' | 'suica' | 'amazon_master' | 'point_extra'
      targetType: 'chain', // 'chain' | 'keyword' | 'all'
      targetChainId: 'matsukiyo',
      targetKeyword: 'マツモトキヨシ',
      bonusRate: 5.0,
      expiresAt: '2026-12-31',
      conditionNote: '税込2,000円以上の決済 / 付与上限500pt',
      enabled: false, // ワンタップでONにできるプリセット
    },
    {
      id: 'cp_paypay_gusto',
      title: 'PayPayクーポン：ガスト・すかいらーく +5%還元',
      cardId: 'paypay',
      targetType: 'chain',
      targetChainId: 'skylark',
      targetKeyword: 'ガスト',
      bonusRate: 5.0,
      expiresAt: '2026-12-31',
      conditionNote: '事前獲得で自動適用 / 上限300pt',
      enabled: false,
    },
    {
      id: 'cp_marui_10off',
      title: 'マルコとマルオの10%OFF（エポスカード優待）',
      cardId: 'epos_gold',
      targetType: 'chain',
      targetChainId: 'marui',
      targetKeyword: 'マルイ',
      bonusRate: 10.0,
      expiresAt: '2026-11-30',
      conditionNote: 'マルイ・モディ全館でエポスゴールド決済が10%OFF！',
      enabled: false,
    },
    {
      id: 'cp_jcb_touch_10',
      title: 'JCBのタッチ決済 10%キャッシュバックキャンペーン',
      cardId: 'jcb_card',
      targetType: 'chain',
      targetChainId: 'zensho',
      targetKeyword: 'すき家',
      bonusRate: 9.5,
      expiresAt: '2026-12-15',
      conditionNote: '要エントリー・対象飲食店でJCBタッチ決済（上限1,000円）',
      enabled: false,
    },
    {
      id: 'cp_local_gov_paypay',
      title: '自治体 × PayPay 地域応援キャンペーン (+20%)',
      cardId: 'paypay',
      targetType: 'all',
      targetChainId: 'all',
      targetKeyword: '全店舗',
      bonusRate: 20.0,
      expiresAt: '2026-11-30',
      conditionNote: '対象自治体の店舗で最大20%戻ってくるキャンペーン時用',
      enabled: false,
    },
  ],

  // 保有している共通ポイント・提示系アプリ
  pointCards: {
    v_point: { enabled: true, name: 'Vポイント (旧Tポイント)', color: 'bg-blue-600', icon: '🅿️' },
    rakuten_point: { enabled: true, name: '楽天ポイント', color: 'bg-red-700', icon: '🅡' },
    d_point: { enabled: true, name: 'dポイント', color: 'bg-rose-600', icon: 'ⓓ' },
    ponta_point: { enabled: true, name: 'Pontaポイント', color: 'bg-orange-500', icon: '🟠' },
    jre_point: { enabled: true, name: 'JRE POINT', color: 'bg-green-700', icon: '🚃' },
    waon_point: { enabled: true, name: 'WAON POINT', color: 'bg-pink-600', icon: '🐶' },
    store_apps: { enabled: true, name: '店舗公式アプリ (セブン/マツキヨ/ユニクロ等)', color: 'bg-indigo-600', icon: '📱' },
  },

  // ユーザーが追加したカスタム店舗・お気に入り
  customStores: [],
};

// エポスゴールド「選べるポイントアップショップ」初期候補リスト
// （＋ユーザーがアプリ内で任意の店舗・チェーンを自由追加可能）
const EPOS_POINT_UP_CANDIDATES = [
  { id: 'mobile_suica', name: 'モバイルSuica（チャージ1.5%〜2.5%・超推奨！）', category: 'チャージ', keywords: ['suica'] },
  { id: 'matsukiyo', name: 'マツモトキヨシ / ココカラファイン', category: 'ドラッグストア', keywords: ['マツモトキヨシ', 'マツキヨ', 'ココカラファイン'] },
  { id: 'welcia', name: 'ウエルシア薬局 / ハックドラッグ', category: 'ドラッグストア', keywords: ['ウエルシア', 'ハックドラッグ'] },
  { id: 'sugi', name: 'スギ薬局', category: 'ドラッグストア', keywords: ['スギ薬局', 'スギドラッグ'] },
  { id: 'tsuruha', name: 'ツルハドラッグ / サンドラッグ', category: 'ドラッグストア', keywords: ['ツルハ', 'サンドラッグ'] },
  { id: 'aeon', name: 'イオン / マックスバリュ / まいばすけっと', category: 'スーパー', keywords: ['イオン', 'aeon', 'まいばすけっと', 'マックスバリュ'] },
  { id: 'ito_yokado', name: 'イトーヨーカドー', category: 'スーパー', keywords: ['イトーヨーカドー'] },
  { id: 'life', name: 'ライフ (LIFE)', category: 'スーパー', keywords: ['ライフ', 'life'] },
  { id: 'seiyu', name: '西友 (SEIYU)', category: 'スーパー', keywords: ['西友', 'seiyu'] },
  { id: 'summit', name: 'サミットストア', category: 'スーパー', keywords: ['サミット', 'summit'] },
  { id: 'ok_store', name: 'オーケー (OKストア)', category: 'スーパー', keywords: ['オーケー', 'okストア'] },
  { id: 'tokyu_store', name: '東急ストア', category: 'スーパー', keywords: ['東急ストア'] },
  { id: 'maruetsu', name: 'マルエツ', category: 'スーパー', keywords: ['マルエツ'] },
  { id: 'yodobashi', name: 'ヨドバシカメラ', category: '家電量販店', keywords: ['ヨドバシ'] },
  { id: 'biccamera', name: 'ビックカメラ / コジマ', category: '家電量販店', keywords: ['ビックカメラ', 'コジマ'] },
  { id: 'yamada', name: 'ヤマダデンキ', category: '家電量販店', keywords: ['ヤマダ'] },
  { id: 'nojima', name: 'ノジマ', category: '家電量販店', keywords: ['ノジマ'] },
  { id: 'nitori', name: 'ニトリ', category: 'インテリア・雑貨', keywords: ['ニトリ'] },
  { id: 'muji', name: '無印良品', category: 'インテリア・雑貨', keywords: ['無印良品', 'muji'] },
  { id: 'uniqlo', name: 'ユニクロ / GU', category: 'ファッション', keywords: ['ユニクロ', 'uniqlo', 'gu'] },
  { id: 'eneos', name: 'ENEOS (ガソリンスタンド)', category: 'クルマ', keywords: ['eneos', 'エネオス'] },
];

// ============================================================================
// 店舗チェーン＆カテゴリ別マスタデータ
// ============================================================================
const STORE_CHAINS = [
  // -------------------- コンビニ --------------------
  {
    id: 'seven_eleven',
    name: 'セブン-イレブン',
    category: 'convenience',
    categoryLabel: 'コンビニ',
    icon: '🏪',
    keywords: ['セブン-イレブン', 'セブンイレブン', '7-eleven', 'seven-eleven', '7 eleven'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: true,
    oliveSevenSpecial: true,
    jcbPartnerRate: 1.5,
    amazonMasterRate: 1.5,
    pointPresentation: [
      {
        type: 'store_apps',
        title: 'セブン-イレブンアプリ提示',
        rate: 0.5,
        detail: '会計前にアプリのバーコード提示で0.5%セブンマイル！さらにVポイント設定でOliveタッチが最大10%還元にジャンプアップ！',
      },
    ],
    proTip: '📱「セブンアプリ提示」＋「スマホのOlive Visaタッチ決済」が最強（合計最大10%還元）！iDやカード差し込みはNGです。',
  },
  {
    id: 'lawson',
    name: 'ローソン / ナチュラルローソン',
    category: 'convenience',
    categoryLabel: 'コンビニ',
    icon: '🏪',
    keywords: ['ローソン', 'lawson', 'ナチュラルローソン', 'natural lawson', 'ローソンストア100'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: true,
    pointPresentation: [
      {
        type: 'ponta_point',
        title: 'Pontaカード または dポイント提示',
        rate: 1.0,
        detail: '16:00〜23:59は200円につき2pt(1.0%)、0:00〜15:59は1pt(0.5%)が決済とは別に貯まります（二重取り）！',
      },
      {
        type: 'd_point',
        title: 'dポイントカード提示（Pontaと選択）',
        rate: 1.0,
        detail: 'Pontaまたはdポイントの好きな方を会計前に提示して二重取り！',
      },
    ],
    proTip: '🅿️「Pontaまたはdポイント提示(最大1%)」＋「スマホのOlive Visaタッチ決済(7%〜)」で最大8%以上の二重取り！',
  },
  {
    id: 'familymart',
    name: 'ファミリーマート',
    category: 'convenience',
    categoryLabel: 'コンビニ',
    icon: '🏪',
    keywords: ['ファミリーマート', 'ファミマ', 'familymart', 'family mart'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: false,
    pointPresentation: [
      {
        type: 'd_point',
        title: 'dポイント / 楽天ポイント / Vポイント提示',
        rate: 0.5,
        detail: '200円につき1pt(0.5%)貯まります。ファミペイアプリに連携して提示するとスタンプも貯まってさらにお得！',
      },
      {
        type: 'rakuten_point',
        title: '楽天ポイント / Vポイント提示（選択）',
        rate: 0.5,
        detail: 'd・楽天・Vポイントから1つ提示可能！',
      },
    ],
    proTip: '⚠️ ファミマはOliveの7%タッチ対象外です！共通ポイント(d/楽天/V)を提示した上で、「エポスGからチャージしたモバイルSuica(1.5%〜2.5%)」または「Amazon Mastercard(1.0%)」で払うのが正解です！',
  },
  {
    id: 'ministop',
    name: 'ミニストップ',
    category: 'convenience',
    categoryLabel: 'コンビニ',
    icon: '🍦',
    keywords: ['ミニストップ', 'ministop'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: true,
    pointPresentation: [
      {
        type: 'waon_point',
        title: 'WAON POINTカード / ミニストップアプリ提示',
        rate: 0.5,
        detail: '200円につき1 WAON POINT + アプリ提示でくじやクーポン特典！',
      },
    ],
    proTip: 'ミニストップはOliveのスマホVisaタッチ7%対象店舗です！WAON POINT提示＋Oliveスマホタッチで7.5%以上還元！',
  },
  {
    id: 'newdays',
    name: 'NewDays (ニューデイズ)',
    category: 'convenience',
    categoryLabel: '駅ナカコンビニ',
    icon: '🚃',
    keywords: ['newdays', 'ニューデイズ'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: false,
    jrePointStoreRate: 0.5,
    pointPresentation: [
      {
        type: 'jre_point',
        title: 'JRE POINT登録済みSuicaで決済（またはバーコード提示）',
        rate: 0.5,
        detail: 'JRE POINTに登録したSuicaで支払うだけで自動的にJRE POINT(0.5%)が貯まります！',
      },
    ],
    proTip: '🚃 駅ナカのNewDaysは「エポスG(ポイントアップ登録)→モバイルSuicaチャージ(1.5%〜2.5%)」＋「Suica決済でJRE POINT(0.5%)」の二重取りで合計2.0%〜3.0%還元！',
  },

  // -------------------- カフェ --------------------
  {
    id: 'starbucks',
    name: 'スターバックス (Starbucks)',
    category: 'cafe',
    categoryLabel: 'カフェ',
    icon: '☕',
    keywords: ['スターバックス', 'スタバ', 'starbucks'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: false,
    jcbPartnerRate: 5.0,
    jcbPartnerNote: 'JCBオリジナルシリーズ特約店！MyJCBでエントリーの上、スタバカードへのオンライン入金/オートチャージで5.0%還元（eGift購入なら最大10.0%還元）！',
    pointPresentation: [
      {
        type: 'store_apps',
        title: 'Starbucks Rewards（公式アプリ / スタバカード払）',
        rate: 9.0,
        detail: 'JCBカードからチャージしたスタバカード（アプリ）で支払うと、Starbucks Star（約8〜9%相当）も二重取りできて実質14%超え！',
      },
    ],
    proTip: '☕ スタバはあなたの保有カードの中で「JCBカード」が圧倒的1位！JCBでスタバカードにオンラインチャージ(5%)＋スタバアプリ払い(約9%相当のStar)で合計約14%還元になります！',
  },
  {
    id: 'doutor',
    name: 'ドトール / エクセルシオール カフェ',
    category: 'cafe',
    categoryLabel: 'カフェ',
    icon: '☕',
    keywords: ['ドトール', 'doutor', 'エクセルシオール', 'excelsior'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: true,
    pointPresentation: [
      {
        type: 'v_point',
        title: 'Vポイント連携・提示確認',
        rate: 0.5,
        detail: 'OliveのスマホVisaタッチ7%還元が圧倒的にお得です！',
      },
    ],
    proTip: '☕ ドトール・エクセルシオールは「OliveのスマホVisaタッチ決済（7%〜還元）」の対象店舗です！必ずスマホのVisaタッチで支払いましょう。',
  },
  {
    id: 'komeda',
    name: 'コメダ珈琲店',
    category: 'cafe',
    categoryLabel: 'カフェ',
    icon: '☕',
    keywords: ['コメダ', 'komeda'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: false,
    pointPresentation: [
      {
        type: 'store_apps',
        title: 'コメダ公式アプリ / KOMECA',
        rate: 1.0,
        detail: 'よく行く場合はコメダアプリやエポスカード優待（一部店舗サイズアップ等）も活用可能。',
      },
    ],
    proTip: 'エポスGからチャージしたモバイルSuica(1.5%〜2.5%)、またはAmazon Mastercard(1.0%)での支払いが最も高還元です！',
  },

  // -------------------- ファストフード・ファミレス・飲食 --------------------
  {
    id: 'mcdonalds',
    name: 'マクドナルド',
    category: 'restaurant',
    categoryLabel: 'ファストフード',
    icon: '🍔',
    keywords: ['マクドナルド', 'マック', 'マクド', 'mcdonald', "mcdonald's"],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: true,
    pointPresentation: [
      {
        type: 'store_apps',
        title: 'マクドナルド公式アプリ（クーポン利用）',
        rate: 5.0,
        detail: '店頭レジまたはセルフオーダー端末でアプリのクーポン番号を入力し、支払いは「スマホのVisaタッチ」を選択！（※モバイルオーダー内決済だとOliveの7%タッチ対象外ですが、JCB特約店登録時はモバイルオーダーでJCB 5%還元も使えます！）',
      },
    ],
    proTip: '🍔 店頭なら「スマホのOlive Visaタッチ決済(7%〜)」、席からモバイルオーダーしたい時は「JCB特約店登録したJCBカード(5%)」または「PayPayクーポン」と使い分けられます！',
  },
  {
    id: 'mos_burger',
    name: 'モスバーガー',
    category: 'restaurant',
    categoryLabel: 'ファストフード',
    icon: '🍔',
    keywords: ['モスバーガー', 'mos burger'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: true,
    pointPresentation: [
      {
        type: 'd_point',
        title: 'dポイントカード提示',
        rate: 1.0,
        detail: '会計前にdポイントカードを提示すると100円につき1pt(1.0%)貯まります！',
      },
    ],
    proTip: '🍔 モスバーガーは「dポイント提示(1.0%)」＋「スマホのOlive Visaタッチ(7.0%〜)」で8%以上の二重取り！',
  },
  {
    id: 'saizeriya',
    name: 'サイゼリヤ',
    category: 'restaurant',
    categoryLabel: 'ファミレス',
    icon: '🍝',
    keywords: ['サイゼリヤ', 'saizeriya'],
    acceptsSuica: true,
    acceptsPayPay: false,
    acceptsCredit: true,
    oliveTouchTarget: true,
    pointPresentation: [],
    proTip: '🍝 サイゼリヤは「スマホのOlive Visaタッチ決済」で7%〜還元！セルフレジでも「クレジットカード」を選び、スマホをかざしてタッチ決済すれば7%対象です。',
  },
  {
    id: 'skylark',
    name: 'ガスト / バーミヤン / しゃぶ葉 / ジョナサン',
    category: 'restaurant',
    categoryLabel: 'ファミレス（すかいらーく）',
    icon: '🍽️',
    keywords: ['ガスト', 'gusto', 'バーミヤン', 'しゃぶ葉', 'ジョナサン', 'jonathan', '夢庵', 'ステーキガスト', 'むさしの森珈琲'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: true,
    pointPresentation: [
      {
        type: 'store_apps',
        title: 'すかいらーくアプリ提示',
        rate: 0.5,
        detail: 'すかいらーくポイント(0.5%〜)と共通ポイントのW提示が可能！',
      },
      {
        type: 'v_point',
        title: 'Vポイント / 楽天ポイント / dポイント提示',
        rate: 0.5,
        detail: 'すかいらーくアプリとは別に、V・楽天・dポイントのいずれか1つも提示できて【三重取り】になります！',
      },
    ],
    proTip: '🍽️ すかいらーく系は「①すかいらーくアプリ提示」＋「②V/楽天/dポイント提示」＋「③スマホのOlive Visaタッチ決済(7%〜)」で驚異の三重取り（合計8%以上）！',
  },
  {
    id: 'zensho',
    name: 'すき家 / はま寿司 / ココス',
    category: 'restaurant',
    categoryLabel: '飲食（ゼンショー）',
    icon: '🥣',
    keywords: ['すき家', 'sukiya', 'はま寿司', 'hama-sushi', 'ココス', 'cocos', "coco's"],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: true,
    pointPresentation: [
      {
        type: 'rakuten_point',
        title: '楽天ポイント / dポイント / Vポイント提示',
        rate: 0.5,
        detail: '会計前に共通ポイントカードを提示すると200円につき1pt(0.5%)が貯まります！',
      },
      {
        type: 'd_point',
        title: 'dポイント / Vポイント提示（選択）',
        rate: 0.5,
        detail: '楽天・d・Vポイントの好きなものを提示して二重取り！',
      },
    ],
    proTip: '🥣 すき家・はま寿司・ココスは「共通ポイント提示(0.5%)」＋「スマホのOlive Visaタッチ決済(7%〜)」で合計7.5%以上還元！',
  },
  {
    id: 'sushiro_kappa',
    name: 'かっぱ寿司 / スシロー / くら寿司',
    category: 'restaurant',
    categoryLabel: '回転寿司',
    icon: '🍣',
    keywords: ['かっぱ寿司', 'スシロー', 'sushiro', 'くら寿司', 'kura sushi'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: true,
    pointPresentation: [
      {
        type: 'rakuten_point',
        title: 'くら寿司＝楽天ポイント / かっぱ寿司＝dポイント提示',
        rate: 0.5,
        detail: 'かっぱ寿司はdポイント、くら寿司は楽天ポイント、スシローはアプリまいどポイントが貯まります！',
      },
      {
        type: 'd_point',
        title: 'かっぱ寿司＝dポイント提示',
        rate: 0.5,
        detail: '会計前にポイントカードを忘れずにスキャン！',
      },
    ],
    proTip: '🍣 かっぱ寿司はOliveスマホタッチ7%対象！スシロー・くら寿司では「エポスGチャージのSuica(1.5〜2.5%)」または「PayPayクーポン」をチェック！',
  },

  // -------------------- ドラッグストア --------------------
  {
    id: 'matsukiyo',
    name: 'マツモトキヨシ / ココカラファイン',
    category: 'drugstore',
    categoryLabel: 'ドラッグストア',
    icon: '💊',
    keywords: ['マツモトキヨシ', 'マツキヨ', 'matsumoto kiyoshi', 'ココカラファイン', 'cocokarafine'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: false,
    eposPointUpId: 'matsukiyo',
    pointPresentation: [
      {
        type: 'store_apps',
        title: '① マツキヨココカラ公式アプリ提示',
        rate: 1.0,
        detail: 'マツキヨココカラポイントが基本1.0%（ステージにより最大3.0%）＋アプリのルーレット10〜20%OFFクーポンも併用可能！',
      },
      {
        type: 'd_point',
        title: '② dポイントカード提示（W提示！）',
        rate: 1.0,
        detail: '公式アプリとは別に、dポイントカードも提示すると100円(税抜)につき1pt(1.0%)が両方貯まります！',
      },
    ],
    proTip: '💊 ドラッグストア最強の三重取りスポット！「①マツキヨアプリ提示(1%〜)」＋「②dポイント提示(1%)」＋「③エポスGチャージのSuica または 選べるポイントアップ登録したエポスG決済(1.5%〜2.5%)」で合計3.5%〜5.5%還元！',
  },
  {
    id: 'welcia',
    name: 'ウエルシア / ハックドラッグ',
    category: 'drugstore',
    categoryLabel: 'ドラッグストア',
    icon: '💊',
    keywords: ['ウエルシア', 'welcia', 'ハックドラッグ', 'hac drug', 'コクミン'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: false,
    eposPointUpId: 'welcia',
    jcbPartnerRate: 1.0,
    pointPresentation: [
      {
        type: 'waon_point',
        title: '① WAON POINTカード（ウエルシアアプリ）提示',
        rate: 1.0,
        detail: '100円(税抜)につき1 WAON POINT(1.0%)！毎月20日の「ウエル活」で1.5倍分のお買い物に使えます！',
      },
      {
        type: 'v_point',
        title: '② Vポイント（モバイルVカード）も続けて提示！',
        rate: 0.5,
        detail: 'ウエルシアはWAON POINTとVポイントの【両方提示】でWポイントが貯まります！',
      },
    ],
    proTip: '💊 ウエルシアは「①WAON POINT(1.0%)」＋「②Vポイント(0.5%)」のW提示に、「③エポスGチャージのSuica(1.5%〜2.5%)」を組み合わせると【合計3.0%〜4.0%還元の三重取り】！',
  },
  {
    id: 'sugi',
    name: 'スギ薬局',
    category: 'drugstore',
    categoryLabel: 'ドラッグストア',
    icon: '💊',
    keywords: ['スギ薬局', 'スギドラッグ', 'sugi pharmacy'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: false,
    eposPointUpId: 'sugi',
    pointPresentation: [
      {
        type: 'store_apps',
        title: 'スギ薬局アプリ提示（スギポイント＋1品15%OFFクーポン）',
        rate: 1.0,
        detail: 'スギポイント(1.0%相当〜)に加え、アプリに頻繁に届く「1品15%OFFクーポン」が超強力！',
      },
    ],
    proTip: '📱「スギ薬局アプリ提示」＋「エポスGチャージのSuica(1.5%〜2.5%)」または「ポイントアップ登録したエポスG」で支払うのが最もお得です！',
  },
  {
    id: 'tsuruha_sundrug',
    name: 'ツルハドラッグ / サンドラッグ',
    category: 'drugstore',
    categoryLabel: 'ドラッグストア',
    icon: '💊',
    keywords: ['ツルハ', 'tsuruha', 'サンドラッグ', 'sundrug', 'くすりの福太郎'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: false,
    eposPointUpId: 'tsuruha',
    pointPresentation: [
      {
        type: 'store_apps',
        title: '① 店舗公式アプリポイントカード提示',
        rate: 1.0,
        detail: 'ツルハポイントやサンドラッグポイントが貯まります！',
      },
      {
        type: 'rakuten_point',
        title: '② 楽天ポイントカードも続けて提示（W提示）',
        rate: 0.5,
        detail: '店舗ポイントと楽天ポイントの両方を提示してW獲得できます！',
      },
    ],
    proTip: '💊「①店舗アプリ提示」＋「②楽天ポイント提示」＋「③エポスGチャージのSuica(1.5%〜2.5%)」で綺麗に三重取りが完成します！',
  },

  // -------------------- スーパー・商業施設・駅ビル --------------------
  {
    id: 'aeon',
    name: 'イオン / まいばすけっと / マックスバリュ',
    category: 'supermarket',
    categoryLabel: 'スーパー',
    icon: '🛒',
    keywords: ['イオン', 'aeon', 'まいばすけっと', 'マックスバリュ', 'maxvalu', 'ピーコック'],
    acceptsSuica: true,
    acceptsPayPay: false,
    acceptsCredit: true,
    oliveTouchTarget: false,
    eposPointUpId: 'aeon',
    pointPresentation: [
      {
        type: 'waon_point',
        title: 'WAON POINT確認 / エポスポイントアップ特典',
        rate: 0.5,
        detail: 'エポスゴールドの「選べるポイントアップショップ」に『イオン』を登録しておけば、イオン・まいばすけっと・マックスバリュでエポスG払いが常時1.5%〜2.5%還元になります！',
      },
    ],
    proTip: '🛒 エポスゴールドの選べるポイントアップに「イオン」を登録中なら、エポスゴールド払い（またはエポスGチャージのSuica払い）で1.5%〜2.5%還元！',
  },
  {
    id: 'life_seiyu_super',
    name: 'ライフ / 西友 / イトーヨーカドー / サミット / 成城石井',
    category: 'supermarket',
    categoryLabel: 'スーパー',
    icon: '🛒',
    keywords: ['ライフ', 'life', '西友', 'seiyu', 'イトーヨーカドー', 'サミット', 'summit', 'マルエツ', '成城石井', '東急ストア', 'オーケー'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: false,
    eposPointUpId: 'life',
    pointPresentation: [
      {
        type: 'ponta_point',
        title: 'ライフ＝Pontaまたはdポイント / 西友＝楽天ポイント / マルエツ＝Vポイント提示',
        rate: 0.5,
        detail: 'ライフは「ライフアプリ＋Pontaまたはdポイント」で三重取り可能！西友は楽天ポイント提示が可能！',
      },
      {
        type: 'rakuten_point',
        title: '西友＝楽天ポイント提示',
        rate: 0.5,
        detail: 'スーパー独自のポイントカードと共通ポイントの両方を提示できる店舗が多いです！',
      },
    ],
    proTip: '🛒 よく行くスーパーをエポスゴールドの「選べるポイントアップ3ショップ」に登録するか、登録済みの「モバイルSuica」で決済すると常時1.5%〜2.5%還元＋提示ポイント二重取り！',
  },
  {
    id: 'station_building',
    name: 'アトレ (atre) / エキュート / ルミネ / 駅ビル',
    category: 'shopping',
    categoryLabel: '駅ビル・商業施設',
    icon: '🏢',
    keywords: ['アトレ', 'atre', 'エキュート', 'ecute', 'ルミネ', 'lumine', 'グランスタ', 'gransta', 'シャポー', 'ビーンズ', 'ペリエ'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: false,
    jrePointStoreRate: 1.0,
    pointPresentation: [
      {
        type: 'jre_point',
        title: 'JRE POINTアプリ / カード提示（または登録Suica決済）',
        rate: 1.0,
        detail: 'アトレやエキュート等のJRE POINT加盟店では、100円(税抜)につき1pt(1.0%)のJRE POINTが貯まります！',
      },
    ],
    proTip: '🚃 駅ビルでは「①JRE POINT提示(1.0%)」＋「②エポスG(ポイントアップ登録)からチャージしたモバイルSuica決済(1.5%〜2.5%)」のコンボで合計2.5%〜3.5%還元！',
  },
  {
    id: 'marui',
    name: 'マルイ (OIOI) / モディ (MODI)',
    category: 'shopping',
    categoryLabel: '百貨店・商業施設',
    icon: '🏬',
    keywords: ['マルイ', '丸井', 'oioi', 'marui', 'モディ', 'modi'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: false,
    eposSpecialRate: 1.0,
    pointPresentation: [],
    proTip: '🏬 マルイ・モディはあなたの「エポスゴールド」の本拠地！通常時もポイント2倍(1.0%＋100万ボーナスで実質2.0%)、「マルコとマルオの10%OFF」クーポンをONにすれば10%OFFも含めて判定します！',
  },

  // -------------------- 家電量販店 --------------------
  {
    id: 'electronics',
    name: 'ヨドバシカメラ / ビックカメラ / ヤマダデンキ',
    category: 'electronics',
    categoryLabel: '家電量販店',
    icon: '📷',
    keywords: ['ヨドバシ', 'yodobashi', 'ビックカメラ', 'bic camera', 'biccamera', 'ヤマダ', 'yamada', 'コジマ', 'ソフマップ', 'ケーズデンキ', 'ノジマ'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: false,
    eposPointUpId: 'yodobashi',
    electronicsPointTrap: true,
    jcbPartnerRate: 1.0,
    pointPresentation: [
      {
        type: 'store_apps',
        title: 'ヨドバシゴールドポイント / ビックポイントカード提示（必須！）',
        rate: 10.0,
        detail: '⚠️超重要！ヨドバシやビックカメラで他社クレジットカード払いにすると、お店のポイントが【10% → 8%】に2%減額されます！しかし【Suica（電子マネー）】で払えばお店のポイント10%満額つきます！',
      },
    ],
    proTip: '⚡ 家電量販店の裏ワザ！クレカで払うと店舗ポイントが10%→8%(-2%)に減って損します！2万円以下の買い物は「エポスGからチャージしたモバイルSuica(1.5〜2.5%)」で払えば【店舗ポイント10%満額 ＋ Suica 2.5% ＝ 合計12.5%還元】で圧勝です！',
  },

  // -------------------- ファッション・雑貨・その他 --------------------
  {
    id: 'uniqlo_muji_nitori',
    name: 'ユニクロ / GU / 無印良品 / ニトリ',
    category: 'shopping',
    categoryLabel: 'ファッション・雑貨',
    icon: '👕',
    keywords: ['ユニクロ', 'uniqlo', 'ジーユー', 'gu', '無印良品', 'muji', 'ニトリ', 'nitori'],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: false,
    eposPointUpId: 'uniqlo',
    pointPresentation: [
      {
        type: 'store_apps',
        title: '公式アプリ提示（MUJI passport / ニトリアプリ / ユニクロ会員証）',
        rate: 0.5,
        detail: '無印良品はMUJIマイル、ニトリはニトリポイント(1.0%)、ユニクロはアプリ会員価格＆抽選ゲームが貯まります！',
      },
    ],
    proTip: '👕 公式アプリをスキャンした上で、「エポスGからチャージしたSuica(1.5%〜2.5%)」または「選べるポイントアップ登録したエポスG」で支払うのがベスト！',
  },
  {
    id: 'local_cashless',
    name: '一般の飲食店・個人店・クリニック・その他',
    category: 'general',
    categoryLabel: '一般店舗',
    icon: '📍',
    keywords: [],
    acceptsSuica: true,
    acceptsPayPay: true,
    acceptsCredit: true,
    oliveTouchTarget: false,
    pointPresentation: [
      {
        type: 'd_point',
        title: '店頭の共通ポイントステッカー確認（V / 楽天 / d / Ponta）',
        rate: 0.5,
        detail: 'レジ横にポイントカードのステッカーがあれば提示して二重取り！',
      },
    ],
    proTip: '💡 特約店以外の一般店舗では：①Suicaが使えるなら「エポスGチャージのSuica(1.5%〜2.5%)」、②Suica非対応でクレカOKなら「エポスG(1.5%) / Olive G(1.5%) / Amazon MC(1.0%)」、③クーポン・自治体還元時は「PayPay」が最適解です！',
  },
];

// クイック検索用のカテゴリ一覧
const QUICK_CATEGORIES = [
  { id: 'all', label: 'すべて', icon: '✨' },
  { id: 'convenience', label: 'コンビニ', icon: '🏪' },
  { id: 'cafe', label: 'カフェ', icon: '☕' },
  { id: 'restaurant', label: '飲食・外食', icon: '🍔' },
  { id: 'drugstore', label: 'ドラッグストア', icon: '💊' },
  { id: 'supermarket', label: 'スーパー', icon: '🛒' },
  { id: 'shopping', label: '駅ビル・買物', icon: '🏬' },
  { id: 'electronics', label: '家電量販店', icon: '📷' },
];

// デモ・主要エリア座標
const PRESET_LOCATIONS = [
  { id: 'current', name: '📍 現在地 (GPS)', lat: null, lng: null },
  { id: 'shinjuku', name: '🏙️ 新宿駅周辺', lat: 35.6896, lng: 139.7006 },
  { id: 'shibuya', name: '🐕 渋谷駅周辺', lat: 35.6580, lng: 139.7016 },
  { id: 'tokyo', name: '🗼 東京・丸の内', lat: 35.6812, lng: 139.7671 },
  { id: 'ikebukuro', name: '🦉 池袋駅周辺', lat: 35.7295, lng: 139.7109 },
  { id: 'yokohama', name: '⚓ 横浜駅周辺', lat: 35.4658, lng: 139.6223 },
  { id: 'umeda', name: '🐙 大阪・梅田', lat: 34.7025, lng: 135.4959 },
];

if (typeof window !== 'undefined') {
  window.PayMapData = {
    DEFAULT_USER_SETTINGS,
    EPOS_POINT_UP_CANDIDATES,
    STORE_CHAINS,
    QUICK_CATEGORIES,
    PRESET_LOCATIONS,
  };
}
