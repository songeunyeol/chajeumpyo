/**
 * 찾음표 캠퍼스 지도.
 * 네이버 지도에 건물 핀을 모두 찍고, 이 화면에서 중요한 건물(주운 곳, 교무처)만 이름과 색으로 강조한다.
 * 네이버 지도를 못 쓰면(키 없음, 인증 실패, 스크립트 차단) 학교 캠퍼스맵 그림 위에 같은 핀을 올린다.
 * Client ID: n33l81gjaz (공개 웹 키. Secret은 넣지 않는다.)
 */
(() => {
  const DEFAULT_NAVER_MAP_KEY = "n33l81gjaz";
  const SATELLITE_ZOOM = 18;

  const CAMPUS_BUILDINGS = {
    본관: { lat: 37.615438, lng: 127.012118 },
    // 학술정보관(중앙도서관)은 유담관 안이지만, 핀은 서쪽 출입구로 둔다. 같은 좌표면 지도가 도서관에만 찍힌다.
    유담관: { lat: 37.61515, lng: 127.01142 },
    한림관: { lat: 37.615246, lng: 127.012622 },
    북악관: { lat: 37.616041, lng: 127.011921 },
    문예관: { lat: 37.615747, lng: 127.012535 },
    대일관: { lat: 37.615463, lng: 127.013293 },
    상승관: { lat: 37.615538, lng: 127.013736 },
    청운관: { lat: 37.615177, lng: 127.014007 },
    혜인관: { lat: 37.61453, lng: 127.013981 },
    은주관: { lat: 37.614623, lng: 127.013152 },
    수인관: { lat: 37.613999, lng: 127.012994 },
    생활관: { lat: 37.614615, lng: 127.011282 },
    공연실습소: { lat: 37.614379, lng: 127.01167 },
    중앙도서관: { lat: 37.615273, lng: 127.011721 },
    학생회관: { lat: 37.615177, lng: 127.014007 },
  };

  /*
   * 캠퍼스맵 그림(campus-map.png, 2000×2123)은 실제 축척이 아닌 안내도라 좌표를 변환하면 건물 그림에서 벗어난다.
   * 그래서 건물마다 그림 속 위치(원본 픽셀)를 직접 적었다. 생활관·공연실습소는 그림에 이름이 없어 좌표 기준 대략 위치다.
   */
  const CAMPUS_MAP_CROP = { x: 120, y: 760, w: 1760, h: 840 };
  const CAMPUS_MAP_SIZE = { w: 2000, h: 2123 };
  const CAMPUS_MAP_PIXELS = {
    북악관: [590, 880],
    문예관: [820, 860],
    대일관: [1080, 880],
    상승관: [1290, 900],
    청운관: [1450, 880],
    본관: [730, 1150],
    한림관: [944, 1140],
    은주관: [1160, 1150],
    혜인관: [1700, 1100],
    유담관: [350, 1220],
    수인관: [1100, 1370],
    공연실습소: [510, 1400],
    생활관: [215, 1330],
  };
  /** 그림에 따로 없는 이름은 들어 있는 건물로 */
  const CAMPUS_MAP_ALIAS = { 중앙도서관: "유담관", 학생회관: "청운관" };
  const OFFICE_BUILDING = "혜인관";
  const PIN_COLORS = { here: "#1e5b3d", office: "#c2410c" };

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
    return String(value ?? "").replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );
  }

  function createMarkerHtml(buildingName, color = PIN_COLORS.here) {
    const safeName = esc(buildingName);
    return `
      <div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;pointer-events:none">
        <div style="background:${color};color:#fff;font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,0.35);white-space:nowrap;margin-bottom:3px">${safeName}</div>
        <svg width="26" height="30" viewBox="0 0 28 32" aria-hidden="true">
          <path d="M14 30 C5 20 1 14 1 11 A13 13 0 1 1 27 11 C27 14 23 20 14 30 Z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
          <circle cx="14" cy="11" r="4.5" fill="#ffffff"/>
        </svg>
      </div>
    `;
  }

  /** 그림 지도 위 핀 위치(잘라 낸 영역 기준 %) */
  function campusPoint(name) {
    const px = CAMPUS_MAP_PIXELS[CAMPUS_MAP_ALIAS[name] || name];
    if (!px) return null;
    return {
      x: ((px[0] - CAMPUS_MAP_CROP.x) / CAMPUS_MAP_CROP.w) * 100,
      y: ((px[1] - CAMPUS_MAP_CROP.y) / CAMPUS_MAP_CROP.h) * 100,
    };
  }

  /** 이 화면에서 강조할 건물. 같은 건물이면 이름을 합친다 */
  function resolveHighlights(loc, opts) {
    const list = Array.isArray(opts.highlights) ? opts.highlights : [{ name: loc.buildingName, kind: "here" }];
    const all = opts.office ? [...list, { name: OFFICE_BUILDING, label: "교무처", kind: "office" }] : list;
    const merged = [];
    for (const h of all) {
      const name = CAMPUS_MAP_ALIAS[h.name] || h.name;
      if (!CAMPUS_MAP_PIXELS[name]) continue;
      const label = h.label || h.name;
      const same = merged.find((m) => m.name === name);
      if (same) {
        if (!same.label.includes(label)) same.label = `${same.label} · ${label}`;
        continue;
      }
      merged.push({ name, label, kind: h.kind === "office" ? "office" : "here" });
    }
    return merged;
  }

  function dotMarkup(name, point) {
    return `<span title="${esc(name)}" style="position:absolute;left:${point.x.toFixed(2)}%;top:${point.y.toFixed(2)}%;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:999px;background:#1e5b3d;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);pointer-events:none"></span>`;
  }

  /** 강조 핀: 이름표가 그림 밖으로 나가지 않게 가장자리에서는 기준을 옮기고, 위쪽 건물(윗줄·혜인관)은 이름표를 핀 아래에 단다 */
  function strongPinMarkup(h, point) {
    const color = PIN_COLORS[h.kind];
    const shiftX = point.x < 18 ? -12 : point.x > 82 ? -88 : -50;
    const vertical = point.y < 45 ? "top:11px" : "bottom:11px";
    return `<div style="position:absolute;left:${point.x.toFixed(2)}%;top:${point.y.toFixed(2)}%;z-index:2;pointer-events:none">
      <span style="position:absolute;left:0;top:0;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:999px;background:${color};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45)"></span>
      <span style="position:absolute;left:0;${vertical};transform:translateX(${shiftX}%);background:${color};color:#fff;font-size:11px;font-weight:700;line-height:1;padding:4px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.35)">${esc(h.label)}</span>
    </div>`;
  }

  /**
   * 캠퍼스맵 그림 + 모든 건물 핀 + 강조 핀.
   * 그림 비율을 지키며 상자 안에 맞춘다(cqh를 못 쓰는 브라우저는 가로에 맞춤).
   * 캔버스 전체를 지우면 위에 올린 네이버 지도까지 사라지므로 그림 층만 바꾼다.
   */
  function renderCampusPhoto(canvasEl, loc, highlights) {
    const strong = new Set(highlights.map((h) => h.name));
    const dots = Object.keys(CAMPUS_MAP_PIXELS)
      .filter((name) => !strong.has(name))
      .map((name) => dotMarkup(name, campusPoint(name)))
      .join("");
    const pins = highlights.map((h) => strongPinMarkup(h, campusPoint(h.name))).join("");
    const ratio = CAMPUS_MAP_CROP.w / CAMPUS_MAP_CROP.h;
    const imgW = (CAMPUS_MAP_SIZE.w / CAMPUS_MAP_CROP.w) * 100;
    const imgL = (-CAMPUS_MAP_CROP.x / CAMPUS_MAP_CROP.w) * 100;
    const imgT = (-CAMPUS_MAP_CROP.y / CAMPUS_MAP_CROP.h) * 100;
    const names = highlights.map((h) => h.label).join(", ");
    const box = document.createElement("div");
    box.className = "sat-stage campus-stage";
    box.style.cssText = "position:absolute;inset:0;background:#5a5358;container-type:size";
    box.innerHTML = `
      <div class="campus-frame" role="img" aria-label="서경대학교 캠퍼스 지도. 건물 ${Object.keys(CAMPUS_MAP_PIXELS).length}곳 표시${names ? `, 강조: ${esc(names)}` : ""}"
        style="position:absolute;left:50%;top:50%;width:min(100%, ${(ratio * 100).toFixed(1)}cqh);aspect-ratio:${CAMPUS_MAP_CROP.w}/${CAMPUS_MAP_CROP.h};transform:translate(-50%,-50%);overflow:hidden">
        <img src="/campus-map.png" alt="" draggable="false" style="position:absolute;max-width:none;width:${imgW.toFixed(3)}%;left:${imgL.toFixed(3)}%;top:${imgT.toFixed(3)}%;display:block">
        ${dots}
        ${pins}
      </div>
    `;
    const stage = canvasEl.querySelector(".sat-stage");
    if (stage) stage.replaceWith(box);
    else canvasEl.prepend(box);
    const img = box.querySelector("img");
    img.addEventListener("error", () => renderFallbackCampusMap(canvasEl, highlights));
  }

  /** 그림 파일을 못 받을 때만 쓰는 단순 약도(같은 핀 위치) */
  function renderFallbackCampusMap(canvasEl, highlights) {
    const strong = new Set(highlights.map((h) => h.name));
    const dots = Object.keys(CAMPUS_MAP_PIXELS)
      .filter((name) => !strong.has(name))
      .map((name) => dotMarkup(name, campusPoint(name)))
      .join("");
    const stage = canvasEl.querySelector(".sat-stage");
    const box = document.createElement("div");
    box.className = "sat-stage";
    box.style.cssText = "position:absolute;inset:0;background:#e7e1d4";
    box.innerHTML = `
      <div style="position:absolute;inset:12px;border-radius:16px;background:#f3efe6;box-shadow:inset 0 0 0 1px #d7d2c6">
        ${dots}
        ${highlights.map((h) => strongPinMarkup(h, campusPoint(h.name))).join("")}
      </div>
    `;
    if (stage) stage.replaceWith(box);
    else canvasEl.prepend(box);
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

  /** onLateFail: 지도가 뜬 뒤에 인증 실패 화면으로 바뀌면 부른다 */
  function mountNaverSatellite(canvasEl, loc, highlights, onLateFail) {
    return new Promise((resolve, reject) => {
      let failed = false;
      window.navermap_authFailure = () => {
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
        logoControlOptions: { position: window.naver.maps.Position.TOP_LEFT },
      });
      const strong = new Set(highlights.map((h) => h.name));
      for (const name of Object.keys(CAMPUS_MAP_PIXELS)) {
        if (strong.has(name)) continue;
        const spot = CAMPUS_BUILDINGS[name];
        new window.naver.maps.Marker({
          position: new window.naver.maps.LatLng(spot.lat, spot.lng),
          map,
          title: name,
          icon: {
            content: `<span style="display:block;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:999px;background:#1e5b3d;border:1.5px solid #fff"></span>`,
            anchor: new window.naver.maps.Point(0, 0),
          },
        });
      }
      for (const h of highlights) {
        const spot = CAMPUS_BUILDINGS[h.name];
        new window.naver.maps.Marker({
          position: new window.naver.maps.LatLng(spot.lat, spot.lng),
          map,
          title: h.label,
          icon: {
            content: createMarkerHtml(h.label, PIN_COLORS[h.kind]),
            anchor: new window.naver.maps.Point(0, 0),
          },
        });
      }
      if (highlights.length > 1 && window.naver.maps.LatLngBounds) {
        const bounds = new window.naver.maps.LatLngBounds();
        for (const h of highlights) {
          const spot = CAMPUS_BUILDINGS[h.name];
          bounds.extend(new window.naver.maps.LatLng(spot.lat, spot.lng));
        }
        map.fitBounds(bounds, { top: 48, right: 40, bottom: 48, left: 40 });
        if (map.getZoom() > SATELLITE_ZOOM) map.setZoom(SATELLITE_ZOOM);
      }

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
            onLateFail();
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
    const highlights = resolveHighlights(loc, opts);
    renderCampusPhoto(canvasEl, loc, highlights);

    // 캠퍼스맵 그림은 네이버 지도 아래에 깔아 둔다. 네이버가 안 뜨거나 나중에 인증이 막히면 덮개만 걷어 그림이 보인다
    const apiKey = getSavedKey();
    if (!apiKey || location.protocol === "file:") return;
    const holder = document.createElement("div");
    holder.className = "naver-holder";
    holder.style.cssText = "position:absolute;inset:0;z-index:1";
    canvasEl.appendChild(holder);
    try {
      await loadNaverSdk(apiKey);
      await mountNaverSatellite(holder, loc, highlights, () => holder.remove());
      if (naverAuthFailed(holder)) throw new Error("NAVER_AUTH");
    } catch (_) {
      holder.remove();
    }
  }

  window.NaverCampusMap = {
    CAMPUS_BUILDINGS,
    CAMPUS_MAP_PIXELS,
    campusPoint,
    resolveHighlights,
    resolveLocation,
    mount,
  };
})();
