// ============================================================================
// PayMap Pro - メインアプリケーションコントローラー (v2)
// 強化機能: 期間限定クーポン管理 / エポス選べる3枠スロット＆自由追加 / JCBポイントアップ選択管理
// ============================================================================

const STORAGE_KEY = 'paymap_pro_user_settings_v2';

// アプリ状態管理
const state = {
  settings: loadSettings(),
  activeTab: 'map', // 'map' | 'chains' | 'coupons' | 'strategy' | 'settings'
  selectedCategory: 'all',
  searchQuery: '',
  currentLocation: { lat: 35.6896, lng: 139.7006, label: '新宿駅周辺（デモ座標）' },
  map: null,
  userMarker: null,
  markersLayer: null,
  nearbyStores: [],
  selectedStore: null,
  isFetchingOSM: false,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('paymap_pro_user_settings_v1');
    if (!raw) return structuredClone(DEFAULT_USER_SETTINGS);
    const parsed = JSON.parse(raw);

    const mergedCards = { ...structuredClone(DEFAULT_USER_SETTINGS.cards) };
    if (parsed.cards) {
      for (const k of Object.keys(mergedCards)) {
        if (parsed.cards[k]) {
          mergedCards[k] = { ...mergedCards[k], ...parsed.cards[k] };
        }
      }
    }

    // JCBパートナー初期データ補完
    if (!Array.isArray(mergedCards.jcb_card.registeredPartners)) {
      mergedCards.jcb_card.registeredPartners = structuredClone(
        DEFAULT_USER_SETTINGS.cards.jcb_card.registeredPartners
      );
    }

    // エポスカスタム候補補完
    if (!Array.isArray(mergedCards.epos_gold.customPointUpCandidates)) {
      mergedCards.epos_gold.customPointUpCandidates = [];
    }

    return {
      ...structuredClone(DEFAULT_USER_SETTINGS),
      ...parsed,
      cards: mergedCards,
      limitedCoupons: Array.isArray(parsed.limitedCoupons)
        ? parsed.limitedCoupons
        : structuredClone(DEFAULT_USER_SETTINGS.limitedCoupons),
      pointCards: { ...structuredClone(DEFAULT_USER_SETTINGS.pointCards), ...(parsed.pointCards || {}) },
      customStores: parsed.customStores || [],
    };
  } catch (e) {
    console.warn('Settings load failed, using default', e);
    return structuredClone(DEFAULT_USER_SETTINGS);
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  } catch (e) {
    console.error('Failed to save settings', e);
  }
  refreshEvaluations();
}

// エポス候補全リスト（初期＋ユーザーカスタム追加分）を取得
function getAllEposCandidates() {
  return [
    ...EPOS_POINT_UP_CANDIDATES,
    ...(state.settings.cards.epos_gold.customPointUpCandidates || []),
  ];
}

// ============================================================================
// 初期化処理
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initCategoryBar();
  initSearchAndAreaControls();
  initMap();
  generateInitialRepresentativeStores(state.currentLocation.lat, state.currentLocation.lng);
  renderAll();
});

function renderAll() {
  renderActiveStatusPills();
  renderMapMarkers();
  renderNearbyStoreList();
  renderChainsCatalog();
  renderCouponsAndPointUpPanel();
  renderStrategyGuide();
  renderSettingsPanel();
  if (state.selectedStore) {
    openStoreModal(state.selectedStore);
  }
}

function refreshEvaluations() {
  state.nearbyStores = state.nearbyStores.map((s) => ({
    ...s,
    evaluation: evaluateStorePayment(s, state.settings),
  }));
  if (state.selectedStore) {
    state.selectedStore = {
      ...state.selectedStore,
      evaluation: evaluateStorePayment(state.selectedStore, state.settings),
    };
  }
  renderAll();
}

// ============================================================================
// ナビゲーション・ヘッダー制御
// ============================================================================
function initNavigation() {
  const navButtons = document.querySelectorAll('[data-nav-tab]');
  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-nav-tab');
      switchTab(tab);
    });
  });

  const closeBtn = document.getElementById('close-modal-btn');
  const backdrop = document.getElementById('store-modal-backdrop');
  if (closeBtn) closeBtn.addEventListener('click', closeStoreModal);
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeStoreModal();
    });
  }
}

function switchTab(tabName) {
  state.activeTab = tabName;

  document.querySelectorAll('[data-view-panel]').forEach((panel) => {
    const isMatch = panel.getAttribute('data-view-panel') === tabName;
    panel.classList.toggle('hidden', !isMatch);
  });

  document.querySelectorAll('[data-nav-tab]').forEach((btn) => {
    const isMatch = btn.getAttribute('data-nav-tab') === tabName;
    if (isMatch) {
      btn.classList.add('text-emerald-400', 'bg-slate-800/90');
      btn.classList.remove('text-slate-400');
    } else {
      btn.classList.remove('text-emerald-400', 'bg-slate-800/90');
      btn.classList.add('text-slate-400');
    }
  });

  if (tabName === 'map' && state.map) {
    setTimeout(() => state.map.invalidateSize(), 100);
  }
}

function renderActiveStatusPills() {
  const container = document.getElementById('active-mode-pills');
  const navBadge = document.getElementById('nav-coupon-badge');
  if (!container) return;

  const c = state.settings.cards;
  const selectedEposIds = c.epos_gold.selectedPointUpShops || [];
  const allCands = getAllEposCandidates();
  const eposNames = selectedEposIds
    .map((id) => {
      const found = allCands.find((x) => x.id === id);
      return found ? found.name.split('（')[0].split('/')[0].trim() : id;
    })
    .join('・');

  const activeCouponsCount = (state.settings.limitedCoupons || []).filter(
    (cp) => checkCouponValidity(cp).isValid
  ).length;

  if (navBadge) {
    navBadge.classList.toggle('hidden', activeCouponsCount === 0);
  }

  const activeJcbCount = (c.jcb_card.registeredPartners || []).filter((p) => p.enabled).length;

  container.innerHTML = `
    <button
      data-pill-jump="coupons"
      class="shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
        activeCouponsCount > 0
          ? 'bg-rose-950/90 text-rose-300 border border-rose-600/80'
          : 'bg-slate-900 text-slate-400 border border-slate-700'
      }"
    >
      🎟️ 期間限定CP: ${activeCouponsCount > 0 ? `${activeCouponsCount}件ON` : 'なし (タップで追加)'}
    </button>
    <button
      data-pill-jump="coupons"
      class="shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/90 text-amber-300 border border-amber-700/60"
    >
      👑 エポス3枠(${selectedEposIds.length}/3): ${eposNames || '未選択'}
    </button>
    <button
      data-pill-jump="coupons"
      class="shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-950/90 text-blue-300 border border-blue-700/60"
    >
      🔵 JCB特約エントリー: ${activeJcbCount}店
    </button>
  `;

  container.querySelectorAll('[data-pill-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.getAttribute('data-pill-jump'));
    });
  });
}

// ============================================================================
// カテゴリバー＆検索・エリア選択
// ============================================================================
function initCategoryBar() {
  const bar = document.getElementById('category-filter-bar');
  if (!bar) return;

  bar.innerHTML = QUICK_CATEGORIES.map(
    (cat) => `
      <button
        data-cat-id="${cat.id}"
        class="cat-pill shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
          state.selectedCategory === cat.id
            ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
            : 'bg-slate-800/90 text-slate-300 border border-slate-700 hover:bg-slate-700'
        }"
      >
        <span>${cat.icon}</span>
        <span>${cat.label}</span>
      </button>
    `
  ).join('');

  bar.querySelectorAll('[data-cat-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedCategory = btn.getAttribute('data-cat-id');
      initCategoryBar();
      renderMapMarkers();
      renderNearbyStoreList();
      renderChainsCatalog();
    });
  });
}

function initSearchAndAreaControls() {
  const searchInput = document.getElementById('store-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      renderMapMarkers();
      renderNearbyStoreList();
      renderChainsCatalog();
    });
  }

  const areaSelect = document.getElementById('area-preset-select');
  if (areaSelect) {
    areaSelect.innerHTML = PRESET_LOCATIONS.map(
      (loc) => `<option value="${loc.id}" ${loc.id === 'shinjuku' ? 'selected' : ''}>${loc.name}</option>`
    ).join('');

    areaSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'current') {
        requestUserGPS();
      } else {
        const found = PRESET_LOCATIONS.find((l) => l.id === val);
        if (found && found.lat) {
          moveToLocation(found.lat, found.lng, found.name);
        }
      }
    });
  }

  const gpsBtn = document.getElementById('locate-gps-btn');
  if (gpsBtn) {
    gpsBtn.addEventListener('click', () => requestUserGPS());
  }

  const searchHereBtn = document.getElementById('search-map-center-btn');
  if (searchHereBtn) {
    searchHereBtn.addEventListener('click', () => {
      if (!state.map) return;
      const center = state.map.getCenter();
      moveToLocation(center.lat, center.lng, '選択したマップ周辺');
    });
  }
}

// ============================================================================
// 地図 (Leaflet + OpenStreetMap + Overpass API + 即時スマートピン生成)
// ============================================================================
function initMap() {
  const mapEl = document.getElementById('map');
  if (!mapEl || typeof L === 'undefined') return;

  state.map = L.map('map', {
    zoomControl: false,
  }).setView([state.currentLocation.lat, state.currentLocation.lng], 16);

  L.control.zoom({ position: 'bottomright' }).addTo(state.map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(state.map);

  state.markersLayer = L.layerGroup().addTo(state.map);
  updateUserLocationMarker(state.currentLocation.lat, state.currentLocation.lng);
}

function updateUserLocationMarker(lat, lng) {
  if (!state.map || typeof L === 'undefined') return;
  if (state.userMarker) {
    state.map.removeLayer(state.userMarker);
  }
  const icon = L.divIcon({
    className: '',
    html: `<div class="user-location-dot" title="現在地"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
  state.userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(state.map);
}

function requestUserGPS() {
  const statusEl = document.getElementById('location-status-text');
  if (!navigator.geolocation) {
    if (statusEl) statusEl.textContent = '⚠️ このブラウザはGPSに対応していません';
    return;
  }

  if (statusEl) statusEl.textContent = '📡 GPSで現在地を取得中...';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      moveToLocation(latitude, longitude, '現在地 (GPS)');
    },
    (err) => {
      console.warn('Geolocation error:', err);
      if (statusEl) {
        statusEl.textContent = '📍 GPS未許可のため新宿周辺を表示中（上部メニューで変更可）';
      }
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

async function moveToLocation(lat, lng, label) {
  state.currentLocation = { lat, lng, label };
  const statusEl = document.getElementById('location-status-text');
  if (statusEl) statusEl.textContent = `📍 ${label} の周辺店舗を解析中...`;

  if (state.map) {
    state.map.setView([lat, lng], 16);
    updateUserLocationMarker(lat, lng);
  }

  generateInitialRepresentativeStores(lat, lng);
  renderMapMarkers();
  renderNearbyStoreList();

  await fetchNearbyOSMPlaces(lat, lng);
}

function generateInitialRepresentativeStores(centerLat, centerLng) {
  const offsets = [
    { chainId: 'seven_eleven', branch: '駅前店', dLat: 0.0011, dLng: -0.0012, dist: '約120m' },
    { chainId: 'starbucks', branch: 'スクエア店', dLat: 0.0007, dLng: 0.0014, dist: '約140m' },
    { chainId: 'matsukiyo', branch: '中央通り店', dLat: -0.0009, dLng: 0.0009, dist: '約130m' },
    { chainId: 'lawson', branch: '南口店', dLat: -0.0014, dLng: -0.0008, dist: '約160m' },
    { chainId: 'mcdonalds', branch: '大通り店', dLat: 0.0016, dLng: 0.0006, dist: '約175m' },
    { chainId: 'welcia', branch: '駅前薬局', dLat: -0.0005, dLng: -0.0019, dist: '約190m' },
    { chainId: 'familymart', branch: '西口店', dLat: 0.0019, dLng: -0.0004, dist: '約210m' },
    { chainId: 'saizeriya', branch: '3F店', dLat: -0.0018, dLng: 0.0015, dist: '約230m' },
    { chainId: 'station_building', branch: 'アトレ / エキュート駅ビル', dLat: 0.0002, dLng: 0.0003, dist: '約40m' },
    { chainId: 'electronics', branch: 'ヨドバシ / ビックカメラ', dLat: 0.0022, dLng: 0.0018, dist: '約280m' },
    { chainId: 'doutor', branch: '駅前店', dLat: -0.0011, dLng: 0.0021, dist: '約220m' },
    { chainId: 'skylark', branch: 'ガスト 駅前店', dLat: 0.0024, dLng: -0.0017, dist: '約290m' },
    { chainId: 'marui', branch: 'マルイ本館', dLat: -0.0022, dLng: -0.0014, dist: '約260m' },
    { chainId: 'zensho', branch: 'すき家 駅前店', dLat: 0.0008, dLng: -0.0024, dist: '約240m' },
    { chainId: 'aeon', branch: 'まいばすけっと 駅前店', dLat: -0.0006, dLng: 0.0023, dist: '約230m' },
  ];

  const baseStores = offsets.map((item, idx) => {
    const chain = STORE_CHAINS.find((c) => c.id === item.chainId);
    const storeObj = {
      id: `rep_${idx}_${item.chainId}`,
      name: `${chain.name.split('/')[0].trim()} ${item.branch}`,
      lat: centerLat + item.dLat,
      lng: centerLng + item.dLng,
      distanceText: item.dist,
      chainId: item.chainId,
      chain,
      isCustom: false,
    };
    storeObj.evaluation = evaluateStorePayment(storeObj, state.settings);
    return storeObj;
  });

  const customList = (state.settings.customStores || []).map((cs) => {
    const chain = matchStoreChain(cs.name, {}, cs.chainId);
    const storeObj = {
      id: cs.id,
      name: cs.name,
      lat: cs.lat || centerLat + (Math.random() - 0.5) * 0.003,
      lng: cs.lng || centerLng + (Math.random() - 0.5) * 0.003,
      distanceText: '★マイ登録店舗',
      chainId: chain.id,
      chain,
      isCustom: true,
    };
    storeObj.evaluation = evaluateStorePayment(storeObj, state.settings);
    return storeObj;
  });

  state.nearbyStores = [...customList, ...baseStores];
}

async function fetchNearbyOSMPlaces(lat, lng) {
  const statusEl = document.getElementById('location-status-text');
  state.isFetchingOSM = true;

  const radius = 450;
  const query = `
    [out:json][timeout:8];
    (
      node["shop"~"convenience|supermarket|chemist|electronics|department_store|clothes|variety_store"](around:${radius},${lat},${lng});
      node["amenity"~"cafe|fast_food|restaurant|pharmacy"](around:${radius},${lat},${lng});
    );
    out body 45;
  `;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.elements && data.elements.length > 0) {
      const osmStores = [];
      const seenNames = new Set();

      for (const el of data.elements) {
        const name = el.tags?.['name:ja'] || el.tags?.name || el.tags?.brand;
        if (!name || seenNames.has(name)) continue;
        seenNames.add(name);

        const chain = matchStoreChain(name, el.tags || {});
        const distMeters = Math.round(calcDistanceMeters(lat, lng, el.lat, el.lon));
        const storeObj = {
          id: `osm_${el.id}`,
          name,
          lat: el.lat,
          lng: el.lon,
          distanceMeters: distMeters,
          distanceText: `約${distMeters}m`,
          osmTags: el.tags || {},
          chainId: chain.id,
          chain,
          isRealOSM: true,
        };
        storeObj.evaluation = evaluateStorePayment(storeObj, state.settings);
        osmStores.push(storeObj);
      }

      if (osmStores.length >= 3) {
        osmStores.sort((a, b) => (a.distanceMeters || 999) - (b.distanceMeters || 999));
        const customOnly = state.nearbyStores.filter((s) => s.isCustom);
        state.nearbyStores = [...customOnly, ...osmStores];
        renderMapMarkers();
        renderNearbyStoreList();
        if (statusEl) {
          statusEl.textContent = `📍 ${state.currentLocation.label}（周辺 ${osmStores.length} 店舗をリアルタイム取得完了）`;
        }
        state.isFetchingOSM = false;
        return;
      }
    }
    if (statusEl) {
      statusEl.textContent = `📍 ${state.currentLocation.label}（主要チェーンピン表示中）`;
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `📍 ${state.currentLocation.label}（スマートチェーンマップ表示中）`;
    }
  } finally {
    state.isFetchingOSM = false;
  }
}

function calcDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getFilteredStores() {
  return state.nearbyStores.filter((s) => {
    const catMatch = state.selectedCategory === 'all' || s.chain.category === state.selectedCategory;
    if (!catMatch) return false;
    if (!state.searchQuery) return true;
    const q = state.searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.chain.name.toLowerCase().includes(q) ||
      s.chain.categoryLabel.toLowerCase().includes(q)
    );
  });
}

function renderMapMarkers() {
  if (!state.map || !state.markersLayer || typeof L === 'undefined') return;
  state.markersLayer.clearLayers();

  const filtered = getFilteredStores();

  filtered.forEach((store) => {
    const ev = store.evaluation;
    const best = ev.bestPayment;
    const isSelected = state.selectedStore && state.selectedStore.id === store.id;
    const hasCoupon = ev.matchedCoupons && ev.matchedCoupons.length > 0;

    const pinHtml = `
      <div class="pay-pin-marker ${isSelected ? 'active-pin' : ''}" style="background-color: ${best.color};">
        <span>${hasCoupon ? '🎟️' : store.chain.icon}</span>
        <span>${best.shortName}</span>
        <span class="pay-pin-rate">${ev.totalCombinedRate}%</span>
      </div>
    `;

    const icon = L.divIcon({
      className: '',
      html: pinHtml,
      iconSize: [120, 28],
      iconAnchor: [60, 14],
    });

    const marker = L.marker([store.lat, store.lng], { icon });
    marker.on('click', () => {
      openStoreModal(store);
    });
    marker.addTo(state.markersLayer);
  });
}

// ============================================================================
// マップ下部の周辺店舗リスト描画
// ============================================================================
function renderNearbyStoreList() {
  const listEl = document.getElementById('nearby-stores-list');
  const countEl = document.getElementById('nearby-stores-count');
  if (!listEl) return;

  const filtered = getFilteredStores();
  if (countEl) countEl.textContent = `${filtered.length}件`;

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="text-center py-6 text-slate-400 text-xs">
        条件に一致する店舗がありません。「チェーン判定」タブからすべてのお店を検索できます。
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered
    .map((store) => {
      const ev = store.evaluation;
      const best = ev.bestPayment;
      const hasPoints = ev.presentations.length > 0;
      const hasCoupon = ev.matchedCoupons && ev.matchedCoupons.length > 0;

      return `
        <div
          data-store-id="${store.id}"
          class="store-card-item group bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 hover:border-emerald-500/60 rounded-xl p-3 cursor-pointer transition-all flex items-center justify-between gap-3"
        >
          <div class="flex items-start gap-2.5 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-xl shrink-0 border border-slate-700">
              ${store.chain.icon}
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                  ${store.chain.categoryLabel}
                </span>
                <span class="text-[10px] text-slate-400">${store.distanceText || ''}</span>
                ${
                  hasCoupon
                    ? `<span class="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-rose-600 text-white animate-pulse">
                        🎟️ 期間限定CP適用中
                      </span>`
                    : ''
                }
              </div>
              <h4 class="font-bold text-sm text-white truncate mt-0.5">${store.name}</h4>
              <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                ${
                  hasPoints
                    ? `<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/60">
                        🎁 提示+${ev.presentationTotalRate}% (${ev.presentations.map((p) => p.icon).join('')})
                      </span>`
                    : ''
                }
                <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-900 text-emerald-300 border border-slate-700">
                  💳 ${best.methodLabel.replace('【スマホのVisaタッチ決済】', 'スマホタッチ')}
                </span>
              </div>
            </div>
          </div>

          <div class="text-right shrink-0">
            <div class="inline-flex flex-col items-end px-2.5 py-1.5 rounded-xl text-white shadow" style="background-color: ${best.color};">
              <span class="text-[10px] font-bold opacity-90">${best.shortName}</span>
              <span class="text-base font-extrabold leading-tight">計 ${ev.totalCombinedRate}%</span>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.querySelectorAll('[data-store-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-store-id');
      const found = state.nearbyStores.find((s) => s.id === id);
      if (found) {
        if (state.map && found.lat) {
          state.map.panTo([found.lat, found.lng]);
        }
        openStoreModal(found);
      }
    });
  });
}

// ============================================================================
// レジ前3秒・最強コンボ詳細モーダル
// ＋ その場で「エポス3枠登録」「JCB特約店登録」「期間限定クーポン追加」ができるクイックバー付き！
// ============================================================================
function openStoreModal(store) {
  state.selectedStore = store;
  renderMapMarkers();

  const ev = store.evaluation || evaluateStorePayment(store, state.settings);
  const best = ev.bestPayment;

  const modal = document.getElementById('store-modal-backdrop');
  const content = document.getElementById('store-modal-body');
  if (!modal || !content) return;

  const activeCoupon = Number(state.settings.cards.paypay.activeCouponBonus || 0);

  // この店舗が現在エポス3枠に入っているかチェック
  const eposMatch = checkEposPointUpMatch(store, ev.chain, state.settings.cards.epos_gold);
  // この店舗が現在JCB特約店としてONになっているかチェック
  const jcbMatch = checkJcbPartnerMatch(store, ev.chain, state.settings.cards.jcb_card);

  content.innerHTML = `
    <!-- 店舗ヘッダー -->
    <div class="flex items-start justify-between gap-3 pb-3 border-b border-slate-700/80">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl">
          ${store.chain.icon}
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              ${store.chain.categoryLabel}
            </span>
            ${store.distanceText ? `<span class="text-xs text-slate-400">${store.distanceText}</span>` : ''}
          </div>
          <h3 class="text-lg font-extrabold text-white mt-0.5">${store.name}</h3>
        </div>
      </div>
    </div>

    <!-- 最強コンボ・トータル還元サマリーバナー -->
    <div class="mt-3 rounded-2xl p-4 text-white shadow-lg relative overflow-hidden" style="background: linear-gradient(135deg, ${best.color} 0%, #0f172a 100%); border: 1px solid rgba(255,255,255,0.2);">
      <div class="flex items-center justify-between gap-2">
        <div>
          <span class="inline-block text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-black/40 text-amber-300">
            👑 レジ前3秒・最強コンボ結論
          </span>
          <div class="text-xl font-black mt-1.5 leading-snug">
            ${best.methodLabel}
          </div>
          <div class="text-xs opacity-90 mt-1">
            ${best.reason}
          </div>
        </div>
        <div class="text-right shrink-0 bg-black/35 px-3 py-2 rounded-xl border border-white/15">
          <div class="text-[10px] text-slate-200 font-semibold">合計実質還元</div>
          <div class="text-2xl font-black text-amber-300">${ev.totalCombinedRate}<span class="text-sm">%</span></div>
          <div class="text-[10px] text-slate-300">
            (提示${ev.presentationTotalRate}% + 決済${best.rate}%)
          </div>
        </div>
      </div>

      ${
        best.warning
          ? `<div class="mt-3 p-2.5 rounded-xl bg-amber-500/20 border border-amber-400/50 text-amber-200 text-xs font-bold leading-relaxed">
              ${best.warning}
            </div>`
          : ''
      }
    </div>

    <!-- 適用中の期間限定クーポン表示 -->
    ${
      ev.matchedCoupons && ev.matchedCoupons.length > 0
        ? `<div class="mt-3 p-3 rounded-xl bg-rose-950/60 border border-rose-500/70 space-y-1.5">
            <div class="text-xs font-extrabold text-rose-300 flex items-center gap-1.5">
              <span>🎟️ 現在この店舗に適用中の期間限定クーポン・優待</span>
            </div>
            ${ev.matchedCoupons
              .map(
                (cp) => `
                <div class="flex items-center justify-between gap-2 text-xs bg-slate-900/80 px-2.5 py-1.5 rounded-lg">
                  <div>
                    <span class="font-bold text-white">${cp.title}</span>
                    <span class="text-[10px] text-slate-400 block">${cp.conditionNote || ''} ${
                      cp.daysLeft !== null ? `(残り${cp.daysLeft}日 / 〜${cp.expiresAt})` : ''
                    }</span>
                  </div>
                  <button data-disable-cp="${cp.id}" class="text-[10px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0">
                    OFFにする
                  </button>
                </div>
              `
              )
              .join('')}
          </div>`
        : ''
    }

    <!-- ⚡ この店舗に対するワンタップ特約店・クーポン設定バー -->
    <div class="mt-3 p-3 rounded-xl bg-slate-800/70 border border-slate-700 space-y-2">
      <div class="text-[11px] font-extrabold text-slate-300 flex items-center justify-between">
        <span>⚡ このお店のポイントアップ選択・期間限定クーポンを即反映</span>
        <span class="text-[10px] text-slate-400">ワンタップ切替</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
        <!-- エポス3枠ワンタップ登録/解除 -->
        <button
          id="modal-toggle-epos-shop"
          class="px-2.5 py-2 rounded-xl text-xs font-extrabold border transition-all flex items-center justify-center gap-1 ${
            eposMatch.matched
              ? 'bg-amber-600 text-white border-amber-400 shadow'
              : 'bg-slate-900 text-amber-300 border-amber-700/60 hover:bg-slate-800'
          }"
        >
          <span>👑</span>
          <span>${eposMatch.matched ? 'エポス3枠に登録中 (解除)' : 'エポス選べる3枠に登録'}</span>
        </button>

        <!-- JCBポイントアップ登録/解除 -->
        <button
          id="modal-toggle-jcb-shop"
          class="px-2.5 py-2 rounded-xl text-xs font-extrabold border transition-all flex items-center justify-center gap-1 ${
            jcbMatch
              ? 'bg-blue-600 text-white border-blue-400 shadow'
              : 'bg-slate-900 text-blue-300 border-blue-700/60 hover:bg-slate-800'
          }"
        >
          <span>🔵</span>
          <span>${jcbMatch ? `JCB特約ON (${jcbMatch.multiplier}倍)` : 'JCB特約店(3倍)に登録'}</span>
        </button>

        <!-- 期間限定クーポン(+5%)を即追加 -->
        <button
          id="modal-quick-add-coupon"
          class="px-2.5 py-2 rounded-xl text-xs font-extrabold bg-slate-900 text-rose-300 border border-rose-700/60 hover:bg-rose-950/60 transition-all flex items-center justify-center gap-1"
        >
          <span>🎟️</span>
          <span>この店の期間限定CP追加</span>
        </button>
      </div>

      <!-- モーダル内クイッククーポン追加フォーム（初期非表示） -->
      <div id="modal-quick-coupon-form" class="hidden pt-2 border-t border-slate-700/80 space-y-2">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <select id="mqc-card" class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-bold">
            <option value="paypay">PayPay</option>
            <option value="olive_gold">Olive ゴールド</option>
            <option value="epos_gold">エポスゴールド</option>
            <option value="jcb_card">JCBカード</option>
            <option value="suica">Suica</option>
            <option value="point_extra">提示ポイント増量</option>
          </select>
          <select id="mqc-rate" class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-bold">
            <option value="3">+3% 還元/割引</option>
            <option value="5" selected>+5% 還元/割引</option>
            <option value="10">+10% 還元/割引</option>
            <option value="15">+15% 還元/割引</option>
            <option value="20">+20% 還元/割引</option>
          </select>
          <input
            type="date"
            id="mqc-exp"
            value="2026-12-31"
            class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
          />
          <button
            id="mqc-save-btn"
            class="bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-lg px-3 py-1.5"
          >
            登録して反映
          </button>
        </div>
      </div>
    </div>

    <!-- STEP 1: お会計前に提示するポイントカード・アプリ（二重取り・三重取り） -->
    <div class="mt-4">
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-xs font-extrabold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
          <span class="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px]">STEP 1</span>
          会計前に提示して貯めるポイント（二重・三重取り）
        </h4>
        <span class="text-xs font-bold text-indigo-300">+${ev.presentationTotalRate}%</span>
      </div>

      ${
        ev.presentations.length > 0
          ? `<div class="space-y-2">
              ${ev.presentations
                .map(
                  (p) => `
                  <div class="p-3 rounded-xl ${
                    p.isCoupon
                      ? 'bg-rose-950/60 border border-rose-500/70'
                      : 'bg-indigo-950/50 border border-indigo-700/50'
                  } flex items-start justify-between gap-3">
                    <div class="flex items-start gap-2.5">
                      <span class="text-lg">${p.icon}</span>
                      <div>
                        <div class="text-xs font-extrabold text-white">${p.title}</div>
                        <p class="text-[11px] text-slate-300 mt-0.5 leading-relaxed">${p.detail}</p>
                      </div>
                    </div>
                    <span class="shrink-0 px-2 py-1 rounded-lg bg-indigo-600/80 text-white text-xs font-extrabold">
                      +${p.rate}%
                    </span>
                  </div>
                `
                )
                .join('')}
            </div>`
          : `<div class="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-400">
              この店舗では特定の共通ポイント提示は不要です（そのままSTEP 2の決済へ！）
            </div>`
      }
    </div>

    <!-- PayPayクーポン即時シミュレーター -->
    <div class="mt-4 p-3 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-between gap-2 flex-wrap">
      <div class="text-xs font-bold text-slate-200 flex items-center gap-1.5">
        <span>🔥 PayPay一時シミュレーター:</span>
      </div>
      <div class="flex items-center gap-1">
        ${[0, 5, 10, 20]
          .map(
            (bonus) => `
            <button
              data-paypay-sim="${bonus}"
              class="px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all ${
                activeCoupon === bonus
                  ? 'bg-red-600 text-white shadow'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
              }"
            >
              ${bonus === 0 ? 'なし' : `+${bonus}%`}
            </button>
          `
          )
          .join('')}
      </div>
    </div>

    <!-- STEP 2: あなたの保有6決済・還元率ランキング比較 -->
    <div class="mt-4">
      <h4 class="text-xs font-extrabold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5 mb-2">
        <span class="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px]">STEP 2</span>
        あなたの保有カード・電子マネー 還元率比較
      </h4>

      <div class="space-y-2">
        ${ev.rankings
          .map(
            (r, idx) => `
            <div class="p-3 rounded-xl border transition-all ${
              idx === 0
                ? 'bg-slate-800 border-emerald-500/80 shadow-md'
                : 'bg-slate-900/70 border-slate-800 opacity-85'
            }">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                    idx === 0 ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-400'
                  }">
                    ${idx + 1}
                  </span>
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="font-extrabold text-sm text-white">${r.name}</span>
                      <span class="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style="background-color: ${r.color};">
                        ${r.badgeText}
                      </span>
                    </div>
                    <p class="text-[11px] text-slate-300 mt-0.5">${r.reason}</p>
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <div class="text-base font-black ${idx === 0 ? 'text-emerald-400' : 'text-slate-200'}">
                    ${r.rate > 0 ? `+${r.rate}%` : `${r.rate}%`}
                  </div>
                  <div class="text-[10px] text-slate-400">決済還元</div>
                </div>
              </div>
            </div>
          `
          )
          .join('')}
      </div>
    </div>

    <!-- プロのポイ活アドバイス -->
    ${
      ev.proTip
        ? `<div class="mt-4 p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-700/50 text-xs text-emerald-200 leading-relaxed">
            <div class="font-extrabold text-emerald-300 mb-1">💡 このお店のポイ活・決済攻略メモ</div>
            ${ev.proTip}
          </div>`
        : ''
    }
  `;

  // イベント1: PayPayシミュレーター
  content.querySelectorAll('[data-paypay-sim]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const bonus = Number(btn.getAttribute('data-paypay-sim'));
      state.settings.cards.paypay.activeCouponBonus = bonus;
      refreshEvaluations();
    });
  });

  // イベント2: 適用中クーポンのワンタップOFF
  content.querySelectorAll('[data-disable-cp]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cpId = btn.getAttribute('data-disable-cp');
      const found = (state.settings.limitedCoupons || []).find((x) => x.id === cpId);
      if (found) {
        found.enabled = false;
        saveSettings();
      }
    });
  });

  // イベント3: モーダルからエポス選べる3枠にワンタップ登録/解除
  const eposBtn = document.getElementById('modal-toggle-epos-shop');
  if (eposBtn) {
    eposBtn.addEventListener('click', () => {
      toggleStoreInEposPointUp(store, ev.chain, eposMatch);
    });
  }

  // イベント4: モーダルからJCB特約店にワンタップ登録/解除
  const jcbBtn = document.getElementById('modal-toggle-jcb-shop');
  if (jcbBtn) {
    jcbBtn.addEventListener('click', () => {
      toggleStoreInJcbPartners(store, ev.chain, jcbMatch);
    });
  }

  // イベント5: モーダル内クイッククーポンフォーム表示＆保存
  const quickCpBtn = document.getElementById('modal-quick-add-coupon');
  const quickCpForm = document.getElementById('modal-quick-coupon-form');
  if (quickCpBtn && quickCpForm) {
    quickCpBtn.addEventListener('click', () => {
      quickCpForm.classList.toggle('hidden');
    });
  }

  const mqcSaveBtn = document.getElementById('mqc-save-btn');
  if (mqcSaveBtn) {
    mqcSaveBtn.addEventListener('click', () => {
      const cardId = document.getElementById('mqc-card').value;
      const bonusRate = Number(document.getElementById('mqc-rate').value);
      const expiresAt = document.getElementById('mqc-exp').value;
      const cleanName = store.name.split(' ')[0];

      state.settings.limitedCoupons.unshift({
        id: `cp_${Date.now()}`,
        title: `${cleanName} 限定クーポン (+${bonusRate}%)`,
        cardId,
        targetType: ev.chain.id !== 'local_cashless' ? 'chain' : 'keyword',
        targetChainId: ev.chain.id !== 'local_cashless' ? ev.chain.id : '',
        targetKeyword: cleanName,
        bonusRate,
        expiresAt,
        conditionNote: '店舗詳細からクイック登録',
        enabled: true,
      });
      saveSettings();
    });
  }

  modal.classList.remove('hidden');
}

function toggleStoreInEposPointUp(store, chain, eposMatch) {
  const epos = state.settings.cards.epos_gold;
  let selected = [...(epos.selectedPointUpShops || [])];

  if (eposMatch.matched) {
    // 解除する
    if (chain.eposPointUpId && selected.includes(chain.eposPointUpId)) {
      selected = selected.filter((id) => id !== chain.eposPointUpId);
    } else {
      const allCands = getAllEposCandidates();
      const targetText = `${store.name} ${chain.name}`.toLowerCase();
      selected = selected.filter((id) => {
        if (id === 'mobile_suica') return true;
        const cand = allCands.find((c) => c.id === id);
        if (!cand) return true;
        const kws = cand.keywords || [cand.name];
        return !kws.some((k) => targetText.includes(k.toLowerCase()));
      });
    }
    epos.selectedPointUpShops = selected;
    saveSettings();
    return;
  }

  // 新規登録する（候補IDがあればそれを使い、なければカスタム候補として自動作成）
  let targetId = chain.eposPointUpId;
  if (!targetId) {
    const cleanName = store.name.split(' ')[0];
    targetId = `epos_custom_${Date.now()}`;
    if (!Array.isArray(epos.customPointUpCandidates)) epos.customPointUpCandidates = [];
    epos.customPointUpCandidates.push({
      id: targetId,
      name: cleanName,
      category: 'マイ追加店舗',
      keywords: [cleanName],
    });
  }

  // 既に3枠埋まっている場合は、最後の枠（枠3）と入れ替える（モバイルSuicaは保護）
  if (selected.length >= 3 && !selected.includes(targetId)) {
    const removableIdx = selected.findLastIndex((id) => id !== 'mobile_suica');
    if (removableIdx !== -1) {
      selected.splice(removableIdx, 1);
    } else {
      selected.pop();
    }
  }
  if (!selected.includes(targetId)) {
    selected.push(targetId);
  }
  epos.selectedPointUpShops = selected;
  saveSettings();
}

function toggleStoreInJcbPartners(store, chain, jcbMatch) {
  const jcb = state.settings.cards.jcb_card;
  if (!Array.isArray(jcb.registeredPartners)) jcb.registeredPartners = [];

  if (jcbMatch) {
    // 既にONならOFFにする
    const target = jcb.registeredPartners.find((p) => p.id === jcbMatch.id);
    if (target) target.enabled = false;
    saveSettings();
    return;
  }

  // 既存のパートナー定義にあればONにする
  const existing = jcb.registeredPartners.find(
    (p) =>
      (p.targetChainId && p.targetChainId === chain.id && chain.id !== 'local_cashless') ||
      (p.keyword && store.name.toLowerCase().includes(p.keyword.toLowerCase()))
  );

  if (existing) {
    existing.enabled = true;
  } else {
    const cleanName = store.name.split(' ')[0];
    jcb.registeredPartners.push({
      id: `jcb_custom_${Date.now()}`,
      targetChainId: chain.id !== 'local_cashless' ? chain.id : '',
      keyword: cleanName,
      name: cleanName,
      enabled: true,
      multiplier: 3,
      rate: 1.5,
      note: 'MyJCBポイントアップ登録店 (3倍=1.5%)',
    });
  }
  saveSettings();
}

function closeStoreModal() {
  state.selectedStore = null;
  const modal = document.getElementById('store-modal-backdrop');
  if (modal) modal.classList.add('hidden');
  renderMapMarkers();
}

// ============================================================================
// タブ2: チェーン一覧
// ============================================================================
function renderChainsCatalog() {
  const container = document.getElementById('chains-catalog-grid');
  if (!container) return;

  const filteredChains = STORE_CHAINS.filter((c) => {
    const catMatch = state.selectedCategory === 'all' || c.category === state.selectedCategory;
    if (!catMatch) return false;
    if (!state.searchQuery) return true;
    const q = state.searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.categoryLabel.toLowerCase().includes(q) ||
      (c.keywords || []).some((k) => k.toLowerCase().includes(q))
    );
  });

  container.innerHTML = filteredChains
    .map((chain) => {
      const dummyStore = { id: `chain_${chain.id}`, name: chain.name, chainId: chain.id, chain };
      const ev = evaluateStorePayment(dummyStore, state.settings);
      const best = ev.bestPayment;
      const hasCoupon = ev.matchedCoupons && ev.matchedCoupons.length > 0;

      return `
        <div
          data-chain-card="${chain.id}"
          class="bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500 rounded-2xl p-3.5 cursor-pointer transition-all flex flex-col justify-between gap-2"
        >
          <div>
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="text-2xl">${chain.icon}</span>
                <div>
                  <div class="flex items-center gap-1">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                      ${chain.categoryLabel}
                    </span>
                    ${
                      hasCoupon
                        ? `<span class="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-rose-600 text-white">🎟️CP</span>`
                        : ''
                    }
                  </div>
                  <h4 class="font-extrabold text-sm text-white mt-0.5">${chain.name}</h4>
                </div>
              </div>
              <div class="text-right shrink-0 px-2.5 py-1 rounded-xl text-white" style="background-color: ${best.color};">
                <div class="text-[10px] font-bold">${best.shortName}</div>
                <div class="text-base font-black">計 ${ev.totalCombinedRate}%</div>
              </div>
            </div>

            <div class="mt-2.5 pt-2.5 border-t border-slate-700/70 space-y-1 text-xs">
              <div class="flex items-center justify-between text-indigo-300">
                <span class="font-semibold">🎁 STEP1 提示:</span>
                <span class="font-bold truncate max-w-[65%]">
                  ${
                    ev.presentations.length > 0
                      ? `${ev.presentations.map((p) => p.title.split('（')[0]).join(' + ')} (+${ev.presentationTotalRate}%)`
                      : '提示なし (0%)'
                  }
                </span>
              </div>
              <div class="flex items-center justify-between text-emerald-300">
                <span class="font-semibold">💳 STEP2 決済:</span>
                <span class="font-bold truncate max-w-[65%]">${best.name} (+${best.rate}%)</span>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll('[data-chain-card]').forEach((el) => {
    el.addEventListener('click', () => {
      const chainId = el.getAttribute('data-chain-card');
      const chain = STORE_CHAINS.find((c) => c.id === chainId);
      if (chain) {
        const storeObj = {
          id: `chain_${chain.id}`,
          name: chain.name,
          chainId: chain.id,
          chain,
          distanceText: 'チェーンマスタ判定',
        };
        storeObj.evaluation = evaluateStorePayment(storeObj, state.settings);
        openStoreModal(storeObj);
      }
    });
  });
}

// ============================================================================
// タブ3 (新規！): 🎟️ 期間限定クーポン ＆ 👑 エポス選べる3枠 ＆ 🔵 JCBポイントアップ選択管理
// ============================================================================
function renderCouponsAndPointUpPanel() {
  const container = document.getElementById('coupons-and-pointup-content');
  if (!container) return;

  const coupons = state.settings.limitedCoupons || [];
  const epos = state.settings.cards.epos_gold;
  const selectedEposIds = epos.selectedPointUpShops || [];
  const allEposCandidates = getAllEposCandidates();
  const jcbPartners = state.settings.cards.jcb_card.registeredPartners || [];

  const cardLabelMap = {
    paypay: { name: 'PayPay', color: 'bg-red-600' },
    olive_gold: { name: 'Olive ゴールド', color: 'bg-emerald-700' },
    epos_gold: { name: 'エポスゴールド', color: 'bg-amber-600' },
    jcb_card: { name: 'JCBカード', color: 'bg-blue-700' },
    suica: { name: 'モバイルSuica', color: 'bg-green-600' },
    amazon_master: { name: 'Amazon MC', color: 'bg-orange-600' },
    point_extra: { name: '提示ポイント増量', color: 'bg-indigo-600' },
  };

  container.innerHTML = `
    <div class="space-y-5">

      <!-- ====================================================================
           セクション1: 🎟️ 期間限定クーポン・キャンペーン管理
           ==================================================================== -->
      <div class="bg-slate-800/90 border border-rose-600/50 rounded-2xl p-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded bg-rose-600 text-white">リアルタイム自動加算</span>
            <h3 class="text-base font-extrabold text-white mt-1">🎟️ 期間限定クーポン・キャンペーン管理</h3>
          </div>
        </div>
        <p class="text-xs text-slate-300 mt-1">
          今週獲得したPayPayクーポンや、カードの期間限定キャンペーン、マルコとマルオの10%OFF等をONにすると、期限内のあいだ地図ピンと決済ランキングに自動加算されます！
        </p>

        <!-- クーポン一覧 -->
        <div class="mt-3 space-y-2">
          ${coupons
            .map((cp) => {
              const v = checkCouponValidity(cp);
              const cInfo = cardLabelMap[cp.cardId] || { name: cp.cardId, color: 'bg-slate-600' };
              return `
                <div class="p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                  v.isValid
                    ? 'bg-rose-950/40 border-rose-500/80 text-white shadow'
                    : v.isExpired
                    ? 'bg-slate-900/40 border-slate-800 text-slate-500'
                    : 'bg-slate-900/80 border-slate-700/80 text-slate-300'
                }">
                  <label class="flex items-start gap-2.5 cursor-pointer flex-1 min-w-0">
                    <input
                      type="checkbox"
                      data-coupon-toggle="${cp.id}"
                      ${cp.enabled ? 'checked' : ''}
                      class="mt-1 w-4 h-4 accent-rose-500 rounded shrink-0"
                    />
                    <div class="min-w-0">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-[10px] font-extrabold px-2 py-0.5 rounded text-white ${cInfo.color}">
                          ${cInfo.name}
                        </span>
                        <span class="text-xs font-black text-amber-300">+${cp.bonusRate}%</span>
                        ${
                          v.isExpired
                            ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-red-400">期限切れ (${cp.expiresAt})</span>`
                            : v.daysLeft !== null
                            ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300">あと${v.daysLeft}日 (〜${cp.expiresAt})</span>`
                            : ''
                        }
                      </div>
                      <div class="text-xs font-extrabold text-white mt-1 truncate">${cp.title}</div>
                      <div class="text-[11px] text-slate-400 mt-0.5">
                        対象: <strong class="text-slate-200">${cp.targetKeyword || '全店'}</strong>
                        ${cp.conditionNote ? ` / ${cp.conditionNote}` : ''}
                      </div>
                    </div>
                  </label>

                  <button
                    data-coupon-delete="${cp.id}"
                    class="text-[11px] text-slate-400 hover:text-red-400 font-bold px-2 py-1 shrink-0"
                    title="削除"
                  >
                    削除
                  </button>
                </div>
              `;
            })
            .join('')}
        </div>

        <!-- 新規期間限定クーポン追加フォーム -->
        <div class="mt-4 pt-3 border-t border-slate-700/80">
          <div class="text-xs font-extrabold text-rose-300 mb-2">＋ 新しい期間限定クーポン・キャンペーンを追加</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              id="new-cp-title"
              placeholder="クーポン名（例：PayPay スシロー+10% / JCBタッチ+10%）"
              class="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
            />
            <div class="flex gap-2">
              <select
                id="new-cp-card"
                class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white font-bold"
              >
                <option value="paypay">PayPay</option>
                <option value="olive_gold">Olive ゴールド</option>
                <option value="epos_gold">エポスゴールド</option>
                <option value="jcb_card">JCBカード</option>
                <option value="suica">モバイルSuica</option>
                <option value="amazon_master">Amazon MC</option>
                <option value="point_extra">提示ポイント増量</option>
              </select>
              <div class="flex items-center bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 w-28">
                <span class="text-xs text-slate-400 mr-1">+</span>
                <input
                  type="number"
                  id="new-cp-rate"
                  value="5"
                  min="0.5"
                  max="100"
                  step="0.5"
                  class="w-full bg-transparent text-xs font-extrabold text-white focus:outline-none"
                />
                <span class="text-xs text-slate-400 ml-1">%</span>
              </div>
            </div>

            <div class="flex gap-2">
              <select
                id="new-cp-chain"
                class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
              >
                <option value="keyword">👇 店名キーワードで指定</option>
                <option value="all">🌐 すべての店舗（自治体還元・全店CP）</option>
                ${STORE_CHAINS.filter((c) => c.id !== 'local_cashless')
                  .map((ch) => `<option value="${ch.id}">${ch.icon} ${ch.name}</option>`)
                  .join('')}
              </select>
              <input
                type="text"
                id="new-cp-keyword"
                placeholder="対象店名（例：スシロー / 東急）"
                class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div class="flex gap-2">
              <input
                type="date"
                id="new-cp-expires"
                value="2026-12-31"
                class="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
              />
              <input
                type="text"
                id="new-cp-note"
                placeholder="条件メモ（例：上限500pt）"
                class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              />
              <button
                id="add-new-coupon-btn"
                class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shrink-0 shadow"
              >
                ＋ 追加
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ====================================================================
           セクション2: 👑 エポスゴールド「選べるポイントアップショップ（3枠スロット＋自由追加）」
           ==================================================================== -->
      <div class="bg-slate-800/90 border border-amber-500/60 rounded-2xl p-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-600 text-white">ポイント3倍 (1.5%〜実質2.5%還元)</span>
            <h3 class="text-base font-extrabold text-white mt-1">👑 エポスゴールド「選べるポイントアップショップ」3枠管理</h3>
          </div>
          <span class="text-xs font-extrabold text-amber-300">現在 ${selectedEposIds.length} / 3 枠選択中</span>
        </div>
        <p class="text-xs text-slate-300 mt-1">
          あなたが指定している3ショップをスロットにセットできます。リストにないお店（ご近所のスーパーや鉄道・ガス等）も下から自由に追加して3枠にセット可能です！
        </p>

        <!-- 現在の3枠ビジュアルスロット -->
        <div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          ${[0, 1, 2]
            .map((slotIdx) => {
              const shopId = selectedEposIds[slotIdx];
              const shopObj = shopId ? allEposCandidates.find((c) => c.id === shopId) : null;
              return `
                <div class="p-3 rounded-xl border ${
                  shopObj
                    ? 'bg-gradient-to-br from-amber-950/80 to-slate-900 border-amber-500/80'
                    : 'bg-slate-900/60 border-dashed border-slate-700'
                } flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <div class="text-[10px] font-black text-amber-400">SLOT ${slotIdx + 1}</div>
                    <div class="text-xs font-extrabold text-white truncate mt-0.5">
                      ${shopObj ? shopObj.name.split('（')[0] : '未設定（空き枠）'}
                    </div>
                    <div class="text-[10px] text-slate-400">
                      ${shopObj ? `3倍 (${epos.include100ManBonus ? '実質2.5%' : '1.5%'})` : '下のリストから選択'}
                    </div>
                  </div>
                  ${
                    shopObj
                      ? `<button data-epos-remove-slot="${shopObj.id}" class="text-[11px] px-2 py-1 rounded-lg bg-slate-800 hover:bg-red-900/60 text-slate-300 hover:text-red-200 font-bold shrink-0">
                          外す
                        </button>`
                      : ''
                  }
                </div>
              `;
            })
            .join('')}
        </div>

        <!-- 自由な店舗をエポス対象候補に追加するフォーム -->
        <div class="mt-3 p-3 rounded-xl bg-slate-900/90 border border-slate-700/80 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            id="new-epos-shop-name"
            placeholder="リストにない対象店を自由追加（例：京王ストア / 小田急 / アピタ）"
            class="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
          />
          <button
            id="add-custom-epos-shop-btn"
            class="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs shrink-0"
          >
            ＋ 3枠にセットして追加
          </button>
        </div>

        <!-- 候補リスト（チェックで3枠へ出し入れ） -->
        <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-1">
          ${allEposCandidates
            .map((shop) => {
              const isChecked = selectedEposIds.includes(shop.id);
              return `
                <label class="flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                  isChecked
                    ? 'bg-amber-950/60 border-amber-500 text-white'
                    : 'bg-slate-900/70 border-slate-700/80 text-slate-300 hover:bg-slate-900'
                }">
                  <div class="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      data-epos-shop="${shop.id}"
                      ${isChecked ? 'checked' : ''}
                      class="w-4 h-4 accent-amber-500 rounded shrink-0"
                    />
                    <span class="text-xs font-bold truncate">${shop.name}</span>
                  </div>
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">${shop.category}</span>
                </label>
              `;
            })
            .join('')}
        </div>
      </div>

      <!-- ====================================================================
           セクション3: 🔵 JCBカード「自分でエントリーしたポイントアップ店＆倍率設定」
           ==================================================================== -->
      <div class="bg-slate-800/90 border border-blue-500/60 rounded-2xl p-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded bg-blue-600 text-white">MyJCB ポイントアップ登録連動</span>
            <h3 class="text-base font-extrabold text-white mt-1">🔵 JCBカード「ポイントアップ登録店」選択＆倍率変更</h3>
          </div>
        </div>
        <p class="text-xs text-slate-300 mt-1">
          JCBオリジナルシリーズであなたがエントリー（ポイントアップ登録）している店舗をONにし、現在の倍率（2倍=1.0%〜20倍=10.0%）を選択できます。新しい対象店も自由に追加可能です！
        </p>

        <div class="mt-3 space-y-2">
          ${jcbPartners
            .map(
              (p) => `
              <div class="p-3 rounded-xl border transition-all flex items-center justify-between gap-2 flex-wrap ${
                p.enabled
                  ? 'bg-blue-950/50 border-blue-500/80 text-white'
                  : 'bg-slate-900/70 border-slate-800 text-slate-400'
              }">
                <label class="flex items-center gap-2.5 cursor-pointer flex-1 min-w-[180px]">
                  <input
                    type="checkbox"
                    data-jcb-partner-toggle="${p.id}"
                    ${p.enabled ? 'checked' : ''}
                    class="w-4 h-4 accent-blue-500 rounded shrink-0"
                  />
                  <div>
                    <div class="text-xs font-extrabold text-white">${p.name}</div>
                    <div class="text-[10px] text-slate-400">一致キーワード: ${p.keyword}</div>
                  </div>
                </label>

                <div class="flex items-center gap-2">
                  <select
                    data-jcb-partner-mult="${p.id}"
                    class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-extrabold text-blue-300"
                  >
                    ${[
                      { m: 2, r: 1.0, label: '2倍 (1.0%)' },
                      { m: 3, r: 1.5, label: '3倍 (1.5%)' },
                      { m: 5, r: 2.5, label: '5倍 (2.5%)' },
                      { m: 10, r: 5.0, label: '10倍 (5.0%)' },
                      { m: 20, r: 10.0, label: '20倍 (10.0%)' },
                    ]
                      .map(
                        (opt) =>
                          `<option value="${opt.m}" ${Number(p.multiplier) === opt.m ? 'selected' : ''}>${opt.label}</option>`
                      )
                      .join('')}
                  </select>
                  <button
                    data-jcb-partner-del="${p.id}"
                    class="text-[11px] text-slate-400 hover:text-red-400 font-bold px-1.5"
                    title="削除"
                  >
                    ✕
                  </button>
                </div>
              </div>
            `
            )
            .join('')}
        </div>

        <!-- JCB特約店の自由追加フォーム -->
        <div class="mt-3 pt-3 border-t border-slate-700/80 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            id="new-jcb-partner-name"
            placeholder="追加するJCB特約店名（例：高島屋 / メルカリ / アピタ）"
            class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          />
          <select
            id="new-jcb-partner-mult"
            class="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
          >
            <option value="2">ポイント2倍 (1.0%)</option>
            <option value="3" selected>ポイント3倍 (1.5%)</option>
            <option value="5">ポイント5倍 (2.5%)</option>
            <option value="10">ポイント10倍 (5.0%)</option>
            <option value="20">ポイント20倍 (10.0%)</option>
          </select>
          <button
            id="add-new-jcb-partner-btn"
            class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shrink-0"
          >
            ＋ JCB特約店を追加
          </button>
        </div>
      </div>

    </div>
  `;

  // --- イベントバインド: 期間限定クーポン ---
  container.querySelectorAll('[data-coupon-toggle]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = cb.getAttribute('data-coupon-toggle');
      const target = (state.settings.limitedCoupons || []).find((c) => c.id === id);
      if (target) {
        target.enabled = cb.checked;
        saveSettings();
      }
    });
  });

  container.querySelectorAll('[data-coupon-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-coupon-delete');
      state.settings.limitedCoupons = (state.settings.limitedCoupons || []).filter((c) => c.id !== id);
      saveSettings();
    });
  });

  const addCpBtn = document.getElementById('add-new-coupon-btn');
  if (addCpBtn) {
    addCpBtn.addEventListener('click', () => {
      const titleInput = document.getElementById('new-cp-title');
      const cardSelect = document.getElementById('new-cp-card');
      const rateInput = document.getElementById('new-cp-rate');
      const chainSelect = document.getElementById('new-cp-chain');
      const kwInput = document.getElementById('new-cp-keyword');
      const expInput = document.getElementById('new-cp-expires');
      const noteInput = document.getElementById('new-cp-note');

      const chainVal = chainSelect.value;
      const kwVal = kwInput.value.trim();
      const chainObj = STORE_CHAINS.find((c) => c.id === chainVal);

      const targetKeyword =
        chainVal === 'all'
          ? '全店舗'
          : chainObj
          ? chainObj.name.split('/')[0].trim()
          : kwVal || '指定店舗';

      const title =
        titleInput.value.trim() || `${targetKeyword} クーポン (+${Number(rateInput.value || 5)}%)`;

      state.settings.limitedCoupons.unshift({
        id: `cp_${Date.now()}`,
        title,
        cardId: cardSelect.value,
        targetType: chainVal === 'all' ? 'all' : chainObj ? 'chain' : 'keyword',
        targetChainId: chainObj ? chainObj.id : chainVal === 'all' ? 'all' : '',
        targetKeyword,
        bonusRate: Number(rateInput.value || 5),
        expiresAt: expInput.value || '2026-12-31',
        conditionNote: noteInput.value.trim(),
        enabled: true,
      });
      saveSettings();
    });
  }

  // --- イベントバインド: エポス3枠管理 ---
  container.querySelectorAll('[data-epos-remove-slot]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-epos-remove-slot');
      state.settings.cards.epos_gold.selectedPointUpShops = (
        state.settings.cards.epos_gold.selectedPointUpShops || []
      ).filter((x) => x !== id);
      saveSettings();
    });
  });

  container.querySelectorAll('[data-epos-shop]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = cb.getAttribute('data-epos-shop');
      let list = [...(state.settings.cards.epos_gold.selectedPointUpShops || [])];
      if (cb.checked) {
        if (list.length >= 3 && !list.includes(id)) {
          // 既に3枠埋まっている場合は最後の枠（モバイルSuica以外を優先）と入れ替え
          const removableIdx = list.findLastIndex((x) => x !== 'mobile_suica');
          if (removableIdx !== -1) list.splice(removableIdx, 1);
          else list.pop();
        }
        if (!list.includes(id)) list.push(id);
      } else {
        list = list.filter((x) => x !== id);
      }
      state.settings.cards.epos_gold.selectedPointUpShops = list;
      saveSettings();
    });
  });

  const addEposCustomBtn = document.getElementById('add-custom-epos-shop-btn');
  if (addEposCustomBtn) {
    addEposCustomBtn.addEventListener('click', () => {
      const input = document.getElementById('new-epos-shop-name');
      const name = input?.value.trim();
      if (!name) return;

      const eposCard = state.settings.cards.epos_gold;
      if (!Array.isArray(eposCard.customPointUpCandidates)) {
        eposCard.customPointUpCandidates = [];
      }
      const newId = `epos_custom_${Date.now()}`;
      eposCard.customPointUpCandidates.push({
        id: newId,
        name,
        category: 'マイ追加店舗',
        keywords: [name],
      });

      let selected = [...(eposCard.selectedPointUpShops || [])];
      if (selected.length >= 3) {
        const removableIdx = selected.findLastIndex((x) => x !== 'mobile_suica');
        if (removableIdx !== -1) selected.splice(removableIdx, 1);
        else selected.pop();
      }
      selected.push(newId);
      eposCard.selectedPointUpShops = selected;
      saveSettings();
    });
  }

  // --- イベントバインド: JCBポイントアップ登録店管理 ---
  container.querySelectorAll('[data-jcb-partner-toggle]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = cb.getAttribute('data-jcb-partner-toggle');
      const target = (state.settings.cards.jcb_card.registeredPartners || []).find((p) => p.id === id);
      if (target) {
        target.enabled = cb.checked;
        saveSettings();
      }
    });
  });

  container.querySelectorAll('[data-jcb-partner-mult]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const id = sel.getAttribute('data-jcb-partner-mult');
      const mult = Number(sel.value);
      const target = (state.settings.cards.jcb_card.registeredPartners || []).find((p) => p.id === id);
      if (target) {
        target.multiplier = mult;
        target.rate = Number((mult * 0.5).toFixed(1));
        target.note = `MyJCBエントリー済：ポイント${mult}倍(${target.rate}%還元)`;
        saveSettings();
      }
    });
  });

  container.querySelectorAll('[data-jcb-partner-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-jcb-partner-del');
      state.settings.cards.jcb_card.registeredPartners = (
        state.settings.cards.jcb_card.registeredPartners || []
      ).filter((p) => p.id !== id);
      saveSettings();
    });
  });

  const addJcbBtn = document.getElementById('add-new-jcb-partner-btn');
  if (addJcbBtn) {
    addJcbBtn.addEventListener('click', () => {
      const nameInput = document.getElementById('new-jcb-partner-name');
      const multSelect = document.getElementById('new-jcb-partner-mult');
      const name = nameInput?.value.trim();
      if (!name) return;

      const mult = Number(multSelect?.value || 3);
      const rate = Number((mult * 0.5).toFixed(1));
      const matchedChain = matchStoreChain(name);

      state.settings.cards.jcb_card.registeredPartners.push({
        id: `jcb_custom_${Date.now()}`,
        targetChainId: matchedChain.id !== 'local_cashless' ? matchedChain.id : '',
        keyword: name,
        name,
        enabled: true,
        multiplier: mult,
        rate,
        note: `MyJCBエントリー済：ポイント${mult}倍(${rate}%還元)`,
      });
      saveSettings();
    });
  }
}

// ============================================================================
// タブ4: あなたの6枚編成・最強ポイ活黄金ルート＆二重取り攻略ガイド
// ============================================================================
function renderStrategyGuide() {
  const container = document.getElementById('strategy-guide-content');
  if (!container) return;

  const c = state.settings.cards;
  const isSuicaSelected = (c.epos_gold.selectedPointUpShops || []).includes('mobile_suica');

  container.innerHTML = `
    <div class="space-y-4">
      <div class="bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-900 border border-emerald-700/60 rounded-2xl p-4">
        <h3 class="text-base font-extrabold text-white flex items-center gap-2">
          <span>🏆</span>
          <span>あなたの6決済・最強使い分け黄金チャート</span>
        </h3>
        <p class="text-xs text-slate-300 mt-1">
          お持ちの「エポスゴールド」「Oliveゴールド」「JCB」「Amazon Mastercard」「Suica」「PayPay」は、弱点が一切ない理想的な組み合わせです！
        </p>

        <div class="mt-3 space-y-2.5">
          <div class="p-3 rounded-xl bg-slate-900/90 border border-emerald-600/50">
            <div class="flex items-center justify-between">
              <span class="text-xs font-extrabold text-emerald-400">① 対象コンビニ・ファミレス・カフェ</span>
              <span class="px-2 py-0.5 rounded bg-emerald-700 text-white text-xs font-black">7.0% 〜 10.0%還元</span>
            </div>
            <div class="text-sm font-bold text-white mt-1">👉 Olive ゴールド（スマホのVisaタッチ決済）</div>
            <p class="text-[11px] text-slate-300 mt-0.5">
              セブン(最大10%)、ローソン、ミニストップ、マック、サイゼリヤ、ガスト、すき家、はま寿司、ドトール、モスでは迷わずスマホのVisaタッチ！
            </p>
          </div>

          <div class="p-3 rounded-xl bg-slate-900/90 border border-blue-600/50">
            <div class="flex items-center justify-between">
              <span class="text-xs font-extrabold text-blue-400">② スターバックス ＆ 自分で選んだJCB特約店</span>
              <span class="px-2 py-0.5 rounded bg-blue-700 text-white text-xs font-black">1.5% 〜 14.0%還元</span>
            </div>
            <div class="text-sm font-bold text-white mt-1">👉 JCBカード（MyJCBポイントアップ登録店）</div>
            <p class="text-[11px] text-slate-300 mt-0.5">
              スタバアプリ内でJCBからチャージ(10倍=5%)＋Star還元(約9%)で実質14%還元！「🎟️特約・クーポン」タブでエントリー店と倍率をいつでも変更できます。
            </p>
          </div>

          <div class="p-3 rounded-xl bg-slate-900/90 border border-green-600/50">
            <div class="flex items-center justify-between">
              <span class="text-xs font-extrabold text-green-400">③ 一般のお店・ドラッグストア・駅ビル・家電量販店</span>
              <span class="px-2 py-0.5 rounded bg-green-700 text-white text-xs font-black">1.5% 〜 3.5%還元 (+店舗pt)</span>
            </div>
            <div class="text-sm font-bold text-white mt-1">
              👉 エポスゴールド（選べる3枠）→ モバイルSuicaチャージ払い ＆ 登録2店舗
            </div>
            <p class="text-[11px] text-slate-300 mt-0.5">
              エポスGの「選べるポイントアップ3枠」の1枠目に<strong>モバイルSuica</strong>を入れればどこでも実質2.5%還元！残り2枠によく行くスーパーやドラッグストアを登録すれば、Suica非対応や2万円超の買い物でも2.5%還元になります！
            </p>
            ${
              !isSuicaSelected
                ? `<div class="mt-2 p-2 rounded bg-amber-500/20 border border-amber-500 text-amber-200 text-[11px] font-bold">
                    ⚠️ 現在エポスGの選べるポイントアップに「モバイルSuica」が未選択です！「🎟️特約・クーポン」タブでONにできます。
                  </div>`
                : ''
            }
          </div>

          <div class="p-3 rounded-xl bg-slate-900/90 border border-red-600/50">
            <div class="flex items-center justify-between">
              <span class="text-xs font-extrabold text-red-400">④ 期間限定クーポン・自治体還元対象店</span>
              <span class="px-2 py-0.5 rounded bg-red-600 text-white text-xs font-black">5.0% 〜 30%還元</span>
            </div>
            <div class="text-sm font-bold text-white mt-1">👉「🎟️特約・クーポン」タブでONにした期間限定クーポンが最優先で自動逆転！</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// タブ5: 基本カード設定（100万円ボーナス・保有ポイントカード・マイ店舗追加）
// ============================================================================
function renderSettingsPanel() {
  const container = document.getElementById('settings-panel-content');
  if (!container) return;

  const c = state.settings.cards;
  const pc = state.settings.pointCards;

  container.innerHTML = `
    <div class="space-y-5">
      <!-- 1. 保有カードの還元率・100万円ボーナス条件カスタマイズ -->
      <div class="bg-slate-800/90 border border-slate-700 rounded-2xl p-4 space-y-3">
        <h3 class="text-base font-extrabold text-white">⚙️ 保有カードのボーナス・基本還元設定</h3>

        <label class="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer">
          <div>
            <div class="text-xs font-extrabold text-white">エポスゴールド：年間100万円ボーナス(+1.0%)を含めて計算</div>
            <div class="text-[11px] text-slate-400">ONにすると基本0.5%→実質1.5%、選べる3枠の店舗は1.5%→実質2.5%で判定します</div>
          </div>
          <input type="checkbox" id="toggle-epos-100m" ${c.epos_gold.include100ManBonus ? 'checked' : ''} class="w-5 h-5 accent-emerald-500" />
        </label>

        <label class="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer">
          <div>
            <div class="text-xs font-extrabold text-white">Olive ゴールド：年間100万円ボーナス(+1.0%)を含めて計算</div>
            <div class="text-[11px] text-slate-400">ONにすると通常店舗でも実質1.5%還元として比較します</div>
          </div>
          <input type="checkbox" id="toggle-olive-100m" ${c.olive_gold.include100ManBonus ? 'checked' : ''} class="w-5 h-5 accent-emerald-500" />
        </label>

        <label class="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer">
          <div>
            <div class="text-xs font-extrabold text-white">Olive × セブン-イレブンアプリ連携（最大10%還元）</div>
            <div class="text-[11px] text-slate-400">セブンアプリにVポイントを連携済みの場合、セブンでのスマホVisaタッチが最大10%になります</div>
          </div>
          <input type="checkbox" id="toggle-olive-seven" ${c.olive_gold.sevenAppLinked ? 'checked' : ''} class="w-5 h-5 accent-emerald-500" />
        </label>

        <div class="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-700">
          <div>
            <div class="text-xs font-extrabold text-white">Olive Vポイントアッププログラム追加分（選べる特典+1%や家族ポイント等）</div>
            <div class="text-[11px] text-slate-400">基本7.0%に上乗せされるあなたの現在の＋還元率</div>
          </div>
          <select id="select-olive-extra" class="bg-slate-800 border border-slate-600 text-white text-xs font-bold rounded-lg px-2.5 py-1.5">
            ${[0, 1, 2, 3, 4, 5].map(
              (v) => `<option value="${v}" ${Number(c.olive_gold.vPointUpExtraRate) === v ? 'selected' : ''}>+${v}.0% (計${7 + v}%)</option>`
            ).join('')}
          </select>
        </div>

        <label class="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer">
          <div>
            <div class="text-xs font-extrabold text-white">JCBカード：JCB CARD W（常時1.0%還元）として計算</div>
            <div class="text-[11px] text-slate-400">JCB一般/ゴールド(0.5%)ではなくJCB CARD W(1.0%)をお持ちの場合はON</div>
          </div>
          <input type="checkbox" id="toggle-jcb-w" ${c.jcb_card.isCardW ? 'checked' : ''} class="w-5 h-5 accent-emerald-500" />
        </label>
      </div>

      <!-- 2. 提示する共通ポイントカード・アプリの保有設定 -->
      <div class="bg-slate-800/90 border border-slate-700 rounded-2xl p-4">
        <h3 class="text-base font-extrabold text-white">🅿️ 保有しているポイントカード・提示アプリ</h3>
        <p class="text-xs text-slate-400 mt-0.5">スマホに入っているものをONにしておくと、会計前の「STEP 1 提示ガイド」に表示されます。</p>

        <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${Object.entries(pc)
            .map(
              ([key, item]) => `
              <label class="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer">
                <span class="text-xs font-bold text-white flex items-center gap-2">
                  <span>${item.icon}</span>
                  <span>${item.name}</span>
                </span>
                <input type="checkbox" data-point-toggle="${key}" ${item.enabled ? 'checked' : ''} class="w-4 h-4 accent-indigo-500" />
              </label>
            `
            )
            .join('')}
        </div>
      </div>

      <!-- 3. よく行くマイ店舗のカスタム追加 -->
      <div class="bg-slate-800/90 border border-slate-700 rounded-2xl p-4">
        <h3 class="text-base font-extrabold text-white">📍 よく行くマイ店舗をマップに追加</h3>
        <p class="text-xs text-slate-400 mt-0.5">近所のスーパーや行きつけのお店を登録しておくと、いつでもワンタップで呼び出せます。</p>

        <div class="mt-3 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            id="custom-store-name"
            placeholder="例：ライフ 〇〇店 / 近所のマツキヨ"
            class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
          />
          <select
            id="custom-store-chain"
            class="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          >
            ${STORE_CHAINS.map((ch) => `<option value="${ch.id}">${ch.icon} ${ch.name}</option>`).join('')}
          </select>
          <button
            id="add-custom-store-btn"
            class="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs shrink-0"
          >
            ＋ 追加する
          </button>
        </div>

        ${
          (state.settings.customStores || []).length > 0
            ? `<div class="mt-3 space-y-1.5">
                ${state.settings.customStores
                  .map(
                    (cs) => `
                    <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs">
                      <span class="font-bold text-white">★ ${cs.name}</span>
                      <button data-del-custom="${cs.id}" class="text-red-400 hover:text-red-300 font-bold">削除</button>
                    </div>
                  `
                  )
                  .join('')}
              </div>`
            : ''
        }
      </div>
    </div>
  `;

  const epos100 = document.getElementById('toggle-epos-100m');
  if (epos100) {
    epos100.addEventListener('change', (e) => {
      state.settings.cards.epos_gold.include100ManBonus = e.target.checked;
      saveSettings();
    });
  }

  const olive100 = document.getElementById('toggle-olive-100m');
  if (olive100) {
    olive100.addEventListener('change', (e) => {
      state.settings.cards.olive_gold.include100ManBonus = e.target.checked;
      saveSettings();
    });
  }

  const oliveSeven = document.getElementById('toggle-olive-seven');
  if (oliveSeven) {
    oliveSeven.addEventListener('change', (e) => {
      state.settings.cards.olive_gold.sevenAppLinked = e.target.checked;
      saveSettings();
    });
  }

  const oliveExtra = document.getElementById('select-olive-extra');
  if (oliveExtra) {
    oliveExtra.addEventListener('change', (e) => {
      state.settings.cards.olive_gold.vPointUpExtraRate = Number(e.target.value);
      saveSettings();
    });
  }

  const jcbW = document.getElementById('toggle-jcb-w');
  if (jcbW) {
    jcbW.addEventListener('change', (e) => {
      state.settings.cards.jcb_card.isCardW = e.target.checked;
      saveSettings();
    });
  }

  container.querySelectorAll('[data-point-toggle]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const key = cb.getAttribute('data-point-toggle');
      if (state.settings.pointCards[key]) {
        state.settings.pointCards[key].enabled = cb.checked;
        saveSettings();
      }
    });
  });

  const addBtn = document.getElementById('add-custom-store-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const nameInput = document.getElementById('custom-store-name');
      const chainSelect = document.getElementById('custom-store-chain');
      const name = nameInput?.value.trim();
      const chainId = chainSelect?.value;
      if (!name) return;

      state.settings.customStores.push({
        id: `custom_${Date.now()}`,
        name,
        chainId,
        lat: state.currentLocation.lat + (Math.random() - 0.5) * 0.002,
        lng: state.currentLocation.lng + (Math.random() - 0.5) * 0.002,
      });
      generateInitialRepresentativeStores(state.currentLocation.lat, state.currentLocation.lng);
      saveSettings();
    });
  }

  container.querySelectorAll('[data-del-custom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-del-custom');
      state.settings.customStores = state.settings.customStores.filter((x) => x.id !== id);
      generateInitialRepresentativeStores(state.currentLocation.lat, state.currentLocation.lng);
      saveSettings();
    });
  });
}
