/**
 * 찾음표 네이버 지도 연동 모듈 (그 자리에 둠 화면용)
 * - 발급받은 네이버 지도 Client ID: n33l81gjaz
 */
(function () {
  const DEFAULT_NAVER_MAP_KEY = "n33l81gjaz";

  // 서경대학교 캠퍼스 건물 좌표 (backend/prisma/seed-data/buildings.json 기준)
  const CAMPUS_BUILDINGS = {
    "본관": { lat: 37.615438, lng: 127.012118 },
    "유담관": { lat: 37.615273, lng: 127.011721 },
    "한림관": { lat: 37.615246, lng: 127.012622 },
    "북악관": { lat: 37.616041, lng: 127.011921 },
    "문예관": { lat: 37.615747, lng: 127.012535 },
    "대일관": { lat: 37.615463, lng: 127.013293 },
    "상승관": { lat: 37.615538, lng: 127.013736 },
    "청운관": { lat: 37.615177, lng: 127.014007 },
    "혜인관": { lat: 37.614530, lng: 127.013981 },
    "은주관": { lat: 37.614623, lng: 127.013152 },
    "수인관": { lat: 37.613999, lng: 127.012994 },
    "생활관": { lat: 37.614615, lng: 127.011282 },
    "공연실습소": { lat: 37.614379, lng: 127.011670 },
    "중앙도서관": { lat: 37.615273, lng: 127.011721 },
    "학생회관": { lat: 37.615177, lng: 127.014007 }
  };

  function getSavedKey() {
    try {
      const params = new URLSearchParams(location.search);
      const qKey = params.get("ncpKeyId") || params.get("ncpClientId") || params.get("mapKey");
      if (qKey) {
        localStorage.setItem("naverMapKey", qKey.trim());
        return qKey.trim();
      }
    } catch (_) {}
    return (window.NAVER_MAP_KEY || DEFAULT_NAVER_MAP_KEY || "").trim();
  }

  function resolveLocation(preferredBuilding) {
    let bName = preferredBuilding || "";
    try {
      if (!bName) bName = sessionStorage.getItem("foundBuilding") || "";
      if (!bName) {
        const rep = JSON.parse(sessionStorage.getItem("lostReport") || "null");
        if (rep && rep.building && CAMPUS_BUILDINGS[rep.building]) bName = rep.building;
      }
    } catch (_) {}
    if (!bName || !CAMPUS_BUILDINGS[bName]) bName = "혜인관";

    const coords = CAMPUS_BUILDINGS[bName];
    return { buildingName: bName, lat: coords.lat, lng: coords.lng };
  }

  function createMarkerHtml(buildingName) {
    return `
      <div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;pointer-events:none">
        <div style="background:#1e5b3d;color:#fff;font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,0.24);white-space:nowrap;margin-bottom:3px">${buildingName}</div>
        <svg width="26" height="30" viewBox="0 0 28 32">
          <path d="M14 30 C5 20 1 14 1 11 A13 13 0 1 1 27 11 C27 14 23 20 14 30 Z" fill="#1e5b3d" stroke="#ffffff" stroke-width="2"/>
          <circle cx="14" cy="11" r="4.5" fill="#ffffff"/>
        </svg>
      </div>
    `;
  }

  function renderFallbackCampusMap(canvasEl, loc) {
    const centerLat = loc.lat;
    const centerLng = loc.lng;
    const scaleX = 92000;
    const scaleY = 112000;

    const buildingRects = Object.entries(CAMPUS_BUILDINGS)
      .slice(0, 13)
      .map(([name, pos]) => {
        const x = 180 + (pos.lng - centerLng) * scaleX;
        const y = 88 - (pos.lat - centerLat) * scaleY;
        const isTarget = name === loc.buildingName;
        return `
          <g transform="translate(${x.toFixed(1)}, ${y.toFixed(1)})">
            <rect x="-22" y="-12" width="44" height="24" rx="5"
              fill="${isTarget ? "#d8ece1" : "#f5f1e8"}"
              stroke="${isTarget ? "#1e5b3d" : "#c9c0b1"}"
              stroke-width="${isTarget ? "2" : "1.2"}"/>
            <text x="0" y="4" text-anchor="middle" font-size="9.5" font-weight="${isTarget ? "700" : "500"}"
              fill="${isTarget ? "#1e5b3d" : "#6f685e"}" font-family="Pretendard Variable, Pretendard, sans-serif">${name}</text>
          </g>
        `;
      })
      .join("");

    canvasEl.innerHTML = `
      <svg viewBox="0 0 360 176" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="서경대학교 ${loc.buildingName} 위치 지도">
        <rect width="360" height="176" fill="#e6e1d4"/>
        <path d="M0 0 L360 0 L360 58 Q260 82 140 52 T0 70 Z" fill="#dce5d8" opacity="0.7"/>
        <path d="M0 140 Q120 118 240 142 T360 130 L360 176 L0 176 Z" fill="#dce5d8" opacity="0.55"/>
        <path d="M-10 124 Q95 92 180 88 T370 64" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round"/>
        <path d="M-10 124 Q95 92 180 88 T370 64" fill="none" stroke="#d5ccb9" stroke-width="1.2" stroke-dasharray="4 4"/>
        <path d="M178 -10 L182 186" fill="none" stroke="#ffffff" stroke-width="8"/>
        ${buildingRects}
        <circle cx="180" cy="88" r="26" fill="rgba(30, 91, 61, 0.14)" stroke="rgba(30, 91, 61, 0.35)" stroke-width="1"/>
        <g transform="translate(180, 84)">
          <ellipse cx="0" cy="6" rx="7" ry="3" fill="rgba(28, 25, 21, 0.25)"/>
          <path d="M0 4 C-9 -6 -13 -13 -13 -20 A13 13 0 1 1 13 -20 C13 -13 9 -6 0 4 Z" fill="#1e5b3d" stroke="#ffffff" stroke-width="2"/>
          <circle cx="0" cy="-20" r="4.5" fill="#ffffff"/>
        </g>
      </svg>
    `;
  }

  function loadNaverSdk(key, onAuthFail) {
    return new Promise((resolve, reject) => {
      window.navermap_authFailure = function () {
        if (onAuthFail) onAuthFail();
      };
      if (window.naver && window.naver.maps && window.naver.maps.Map) {
        return resolve();
      }
      const existing = document.getElementById("naver-map-sdk");
      if (existing) existing.remove();

      const script = document.createElement("script");
      script.id = "naver-map-sdk";
      script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(key)}`;
      script.async = true;
      script.onload = () => {
        if (window.naver && window.naver.maps) resolve();
        else reject(new Error("NAVER_MAP_LOAD_FAILED"));
      };
      script.onerror = () => reject(new Error("NAVER_MAP_SCRIPT_ERROR"));
      document.head.appendChild(script);
    });
  }

  async function mount(containerEl, opts = {}) {
    if (!containerEl) return;
    const loc = resolveLocation(opts.buildingName);

    containerEl.innerHTML = `
      <div class="map-canvas" id="naverMapCanvas"></div>
      <div class="map-badge-bar">
        <span class="map-loc-pill"><i></i><span id="mapLocText">서경대 ${loc.buildingName} · 그 자리 보관</span></span>
      </div>
    `;

    const canvasEl = containerEl.querySelector("#naverMapCanvas");
    const apiKey = getSavedKey();

    if (!apiKey || location.protocol === "file:") {
      renderFallbackCampusMap(canvasEl, loc);
      return;
    }

    let fallbackTriggered = false;
    const triggerFallback = () => {
      if (fallbackTriggered) return;
      fallbackTriggered = true;
      renderFallbackCampusMap(canvasEl, loc);
    };

    try {
      await loadNaverSdk(apiKey, triggerFallback);
      if (fallbackTriggered) return;

      canvasEl.innerHTML = "";
      const center = new window.naver.maps.LatLng(loc.lat, loc.lng);
      const map = new window.naver.maps.Map(canvasEl, {
        center,
        zoom: 17,
        minZoom: 15,
        maxZoom: 19,
        scaleControl: false,
        mapDataControl: false,
        logoControlOptions: { position: window.naver.maps.Position.TOP_LEFT }
      });

      new window.naver.maps.Marker({
        position: center,
        map,
        title: loc.buildingName,
        icon: {
          content: createMarkerHtml(loc.buildingName),
          anchor: new window.naver.maps.Point(0, 0)
        }
      });

      const observer = new MutationObserver(() => {
        if (canvasEl.querySelector('img[src*="auth_fail"]')) {
          observer.disconnect();
          triggerFallback();
        }
      });
      observer.observe(canvasEl, { childList: true, subtree: true });
    } catch (_) {
      triggerFallback();
    }
  }

  window.NaverCampusMap = {
    CAMPUS_BUILDINGS,
    resolveLocation,
    mount
  };
})();
