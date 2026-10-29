/**
 * 찾음표 캠퍼스 지도.
 * 네이버 지도 키가 위성 타일을 열어 주면 그 화면을 쓰고,
 * 인증이 막히면 같은 좌표의 위성 사진 위에 건물 핀을 올린다.
 * Client ID: n33l81gjaz (공개 웹 키. Secret은 넣지 않는다.)
 */
(function () {
  const DEFAULT_NAVER_MAP_KEY = "n33l81gjaz";
  const SATELLITE_ZOOM = 18;
  const TILE_SIZE = 256;

  const CAMPUS_BUILDINGS = {
    "본관": { lat: 37.615438, lng: 127.012118 },
    // 학술정보관(중앙도서관)은 유담관 안이지만, 핀은 서쪽 출입구로 둔다. 같은 좌표면 지도가 도서관에만 찍힌다.
    "유담관": { lat: 37.61515, lng: 127.01142 },
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
      const saved = localStorage.getItem("naverMapKey");
      if (saved) return saved.trim();
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
    if (bName.includes(" · ")) bName = bName.split(" · ")[0].trim();
    if (!bName || !CAMPUS_BUILDINGS[bName]) bName = "혜인관";
    const coords = CAMPUS_BUILDINGS[bName];
    return { buildingName: bName, lat: coords.lat, lng: coords.lng };
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function createMarkerHtml(buildingName) {
    const safeName = esc(buildingName);
    return `
      <div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;pointer-events:none">
        <div style="background:#1e5b3d;color:#fff;font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,0.35);white-space:nowrap;margin-bottom:3px">${safeName}</div>
        <svg width="26" height="30" viewBox="0 0 28 32" aria-hidden="true">
          <path d="M14 30 C5 20 1 14 1 11 A13 13 0 1 1 27 11 C27 14 23 20 14 30 Z" fill="#1e5b3d" stroke="#ffffff" stroke-width="2"/>
          <circle cx="14" cy="11" r="4.5" fill="#ffffff"/>
        </svg>
      </div>
    `;
  }

  function project(lng, lat, zoom) {
    const n = 2 ** zoom;
    const latRad = (lat * Math.PI) / 180;
    const x = ((lng + 180) / 360) * n;
    const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    return { x, y };
  }

  /** 그림 지도 위 핀 위치. 북쪽이 위, 가장자리는 그림의 여백 */
  function pinPoint(lng, lat) {
    const names = Object.keys(CAMPUS_BUILDINGS);
    const lats = names.map((name) => CAMPUS_BUILDINGS[name].lat);
    const lngs = names.map((name) => CAMPUS_BUILDINGS[name].lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const pad = 0.14;
    const x = ((lng - minLng) / (maxLng - minLng || 1)) * (1 - pad * 2) + pad;
    const y = (1 - (lat - minLat) / (maxLat - minLat || 1)) * (1 - pad * 2) + pad;
    return { left: `${(x * 100).toFixed(2)}%`, top: `${(y * 100).toFixed(2)}%` };
  }

  function pinMarkup(name, point, strong) {
    const dot = strong
      ? `<span style="width:16px;height:16px;border-radius:999px;background:#1e5b3d;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></span><span style="margin-top:2px;background:#1e5b3d;color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:999px;white-space:nowrap">${esc(name)}</span>`
      : `<span style="width:8px;height:8px;border-radius:999px;background:#1e5b3d;border:1.5px solid #fff"></span>`;
    return `<div style="position:absolute;left:${point.left};top:${point.top};transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;pointer-events:none">${dot}</div>`;
  }

  /**
   * 네이버·위성 타일이 없어도 캠퍼스 그림과 핀이 남는다.
   * 캔버스 전체를 지우면 위에 올린 네이버 지도까지 사라지므로 그림 층만 바꾼다.
   */
  function renderCampusPhoto(canvasEl, loc, showAll) {
    const names = showAll ? Object.keys(CAMPUS_BUILDINGS) : [loc.buildingName];
    const pins = names.map((name) => {
      const spot = CAMPUS_BUILDINGS[name];
      if (!spot) return "";
      return pinMarkup(name, pinPoint(spot.lng, spot.lat), name === loc.buildingName);
    }).join("");
    const box = document.createElement("div");
    box.className = "sat-stage";
    box.style.cssText = "position:absolute;inset:0;background:#e7e1d4";
    box.innerHTML = `
      <img src="/campus-map.png" alt="서경대학교 캠퍼스 지도. ${esc(loc.buildingName)}" style="width:100%;height:100%;object-fit:cover;display:block">
      ${pins}
    `;
    const stage = canvasEl.querySelector(".sat-stage");
    if (stage) stage.replaceWith(box);
    else canvasEl.prepend(box);
    const img = box.querySelector("img");
    img.addEventListener("error", () => renderFallbackCampusMap(canvasEl, loc));
  }

  /** 그림 파일을 못 받을 때만 쓰는 단순 약도 */
  function renderFallbackCampusMap(canvasEl, loc) {
    const point = pinPoint(loc.lng, loc.lat);
    const stage = canvasEl.querySelector(".sat-stage");
    const box = document.createElement("div");
    box.className = "sat-stage";
    box.style.cssText = "position:absolute;inset:0;background:#e7e1d4";
    box.innerHTML = `
      <div style="position:absolute;inset:12px;border-radius:16px;background:#f3efe6;box-shadow:inset 0 0 0 1px #d7d2c6"></div>
      ${pinMarkup(loc.buildingName, point, true)}
    `;
    if (stage) stage.replaceWith(box);
    else canvasEl.prepend(box);
  }

  function renderSatelliteTiles(canvasEl, loc) {
    const point = project(loc.lng, loc.lat, SATELLITE_ZOOM);
    const originX = Math.floor(point.x) - 1;
    const originY = Math.floor(point.y) - 1;
    const cols = 3;
    const rows = 3;
    const px = (point.x - originX) * TILE_SIZE;
    const py = (point.y - originY) * TILE_SIZE;
    const tiles = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const tx = originX + col;
        const ty = originY + row;
        const src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${SATELLITE_ZOOM}/${ty}/${tx}`;
        tiles.push(
          `<img alt="" draggable="false" width="${TILE_SIZE}" height="${TILE_SIZE}" style="position:absolute;left:${col * TILE_SIZE}px;top:${row * TILE_SIZE}px" src="${src}">`
        );
      }
    }

    canvasEl.innerHTML = `
      <div class="sat-stage" role="img" aria-label="서경대학교 ${loc.buildingName} 위성 사진">
        <div class="sat-layer" style="width:${cols * TILE_SIZE}px;height:${rows * TILE_SIZE}px;left:calc(50% - ${px}px);top:calc(42% - ${py}px)">
          ${tiles.join("")}
          <div class="sat-pin" style="left:${px}px;top:${py}px">${createMarkerHtml(loc.buildingName)}</div>
        </div>
        <span class="sat-attr">위성 · Esri</span>
      </div>
    `;

    const images = [...canvasEl.querySelectorAll(".sat-layer img")];
    let failed = 0;
    images.forEach((img) => {
      img.addEventListener("error", () => {
        failed += 1;
        if (failed >= images.length) renderFallbackCampusMap(canvasEl, loc);
      });
    });
  }

  function loadNaverSdk(key) {
    return new Promise((resolve, reject) => {
      if (window.naver && window.naver.maps && window.naver.maps.Map) {
        resolve();
        return;
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

  function naverAuthFailed(canvasEl) {
    return Boolean(canvasEl.querySelector('img[src*="auth_fail"], img[alt*="인증"]'));
  }

  function mountNaverSatellite(canvasEl, loc) {
    return new Promise((resolve, reject) => {
      let failed = false;
      window.navermap_authFailure = function () {
        failed = true;
        reject(new Error("NAVER_AUTH"));
      };
      canvasEl.innerHTML = "";
      const center = new window.naver.maps.LatLng(loc.lat, loc.lng);
      const satelliteType = window.naver.maps.MapTypeId && window.naver.maps.MapTypeId.SATELLITE;
      const map = new window.naver.maps.Map(canvasEl, {
        center,
        zoom: SATELLITE_ZOOM,
        minZoom: 16,
        maxZoom: 19,
        mapTypeId: satelliteType || window.naver.maps.MapTypeId.NORMAL,
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

      const finish = (fromIdle) => {
        if (failed || settled) return;
        if (naverAuthFailed(canvasEl)) {
          settled = true;
          reject(new Error("NAVER_AUTH"));
          return;
        }
        const hasTile = Boolean(canvasEl.querySelector("img, canvas"));
        if (!fromIdle && !hasTile) {
          settled = true;
          reject(new Error("NAVER_EMPTY"));
          return;
        }
        settled = true;
        if (typeof map.autoResize === "function") map.autoResize();
        const watch = new MutationObserver(() => {
          if (naverAuthFailed(canvasEl)) {
            watch.disconnect();
            renderSatelliteTiles(canvasEl, loc);
          }
        });
        watch.observe(canvasEl, { childList: true, subtree: true });
        resolve(map);
      };
      let settled = false;
      window.naver.maps.Event.once(map, "idle", () => finish(true));
      window.setTimeout(() => finish(false), 1800);
    });
  }

  async function mount(containerEl, opts = {}) {
    if (!containerEl) return;
    const loc = resolveLocation(opts.buildingName);
    const caption = opts.caption || `서경대 ${loc.buildingName} · 그 자리 보관`;

    containerEl.hidden = false;
    if (!containerEl.style.height) containerEl.style.height = "176px";
    containerEl.style.position = "relative";
    containerEl.style.overflow = "hidden";
    containerEl.innerHTML = `
      <div class="map-canvas" id="naverMapCanvas" style="position:relative;width:100%;height:100%;background:#e7e1d4"></div>
      <div class="map-badge-bar">
        <span class="map-loc-pill"><i></i><span>${esc(caption)}</span></span>
      </div>
    `;
    const canvasEl = containerEl.querySelector(".map-canvas");
    const apiKey = getSavedKey();

    renderCampusPhoto(canvasEl, loc, opts.showAll === true);
    if (!apiKey || location.protocol === "file:") return;

    const holder = document.createElement("div");
    holder.className = "naver-holder";
    holder.style.cssText = "position:absolute;inset:0;z-index:1";
    canvasEl.appendChild(holder);

    try {
      await loadNaverSdk(apiKey);
      await mountNaverSatellite(holder, loc);
      if (naverAuthFailed(holder)) throw new Error("NAVER_AUTH");
      const sat = canvasEl.querySelector(".sat-stage");
      if (sat) sat.remove();
    } catch (_) {
      holder.remove();
    }
  }

  window.NaverCampusMap = {
    CAMPUS_BUILDINGS,
    resolveLocation,
    mount
  };
})();
