import type { BuildingListItem } from "@chajeumpyo/shared";
import { useEffect, useRef } from "react";
import { NAVER_MAP_CLIENT_ID } from "@/lib/env";
import { cn } from "@/lib/utils";
import { loadNaverMaps, type NaverMap, type NaverMarker, onNaverAuthFailure } from "./naver-loader";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>';

/** 건물 핀 HTML. 머리+꼬리+점 전체가 하나의 누름 영역(46 이상 높이·51 이상 폭) */
function pinHtml(name: string, selected: boolean, clickable: boolean) {
  const head = selected
    ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:8px 12px;border-radius:999px;background:var(--brand);color:#fff;font-weight:700;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,.18);white-space:nowrap">${PIN_SVG}${esc(name)}</span>`
    : `<span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#fff;color:var(--text);font-weight:700;font-size:13px;box-shadow:0 1px 4px rgba(0,0,0,.18);white-space:nowrap">${esc(name)}</span>`;
  const tail = `<span style="display:block;width:2px;height:8px;background:var(--brand)"></span><span style="display:block;width:8px;height:8px;border-radius:999px;background:var(--brand);border:2px solid #fff"></span>`;
  const tag = clickable ? "button" : "span";
  const attrs = clickable ? `type="button" aria-label="${esc(name)}" aria-pressed="${selected}"` : 'aria-hidden="true"';
  return `<${tag} ${attrs} data-map-pin style="display:flex;flex-direction:column;align-items:center;min-width:51px;min-height:46px;padding:0;border:0;background:none;cursor:${clickable ? "pointer" : "default"};transform:translate(-50%,-100%)">${head}${tail}</${tag}>`;
}

/**
 * C-07 네이버 지도(지연 로드 덩어리). 건물 좌표(GET /buildings)로 건물 핀만 그린다.
 * 사용자 위치 점·분실물 좌표는 그리지 않는다. 실패하면 onFail → 부모가 건물 목록으로 바꾼다.
 */
export default function BuildingMap({
  buildings,
  selectedId,
  onSelect,
  interactive = true,
  onReady,
  onFail,
  className,
}: {
  buildings: BuildingListItem[];
  selectedId?: number;
  onSelect?: (id: number) => void;
  interactive?: boolean;
  onReady?: () => void;
  onFail: () => void;
  className?: string;
}) {
  const el = useRef<HTMLSpanElement>(null);
  const map = useRef<NaverMap | null>(null);
  const markers = useRef(new Map<number, NaverMarker>());
  const cb = useRef({ onSelect, onReady, onFail });
  cb.current = { onSelect, onReady, onFail };
  const sel = useRef(selectedId);
  sel.current = selectedId;
  const key = buildings.map((b) => `${b.id}:${b.lat}:${b.lng}`).join("|");

  // biome-ignore lint/correctness/useExhaustiveDependencies: 건물 목록(key)이 바뀔 때만 지도를 다시 만든다
  useEffect(() => {
    let alive = true;
    const off = onNaverAuthFailure(() => alive && cb.current.onFail());
    loadNaverMaps(NAVER_MAP_CLIENT_ID)
      .then((nm) => {
        if (!alive || !el.current || buildings.length === 0) return;
        const pts = buildings.map((b) => new nm.LatLng(b.lat, b.lng));
        const focus = buildings.find((b) => b.id === sel.current) ?? buildings[0];
        const m = new nm.Map(el.current, {
          center: focus ? new nm.LatLng(focus.lat, focus.lng) : pts[0],
          zoom: 17,
          draggable: interactive,
          pinchZoom: interactive,
          scrollWheel: interactive,
          keyboardShortcuts: interactive,
          disableDoubleClickZoom: !interactive,
          zoomControl: interactive,
          zoomControlOptions: { position: 3 /* TOP_RIGHT */ },
          mapDataControl: false,
          scaleControl: false,
          logoControlOptions: { position: 9 /* BOTTOM_LEFT */ },
        });
        map.current = m;
        if (interactive && buildings.length > 1) {
          const [first, ...rest] = pts;
          if (first) {
            const bounds = new nm.LatLngBounds(first, first);
            for (const p of rest) bounds.extend(p);
            m.fitBounds(bounds, { top: 56, right: 40, bottom: 24, left: 40 });
          }
        }
        buildings.forEach((b, i) => {
          const clickable = interactive && !!cb.current.onSelect;
          const mk = new nm.Marker({
            map: m,
            position: pts[i],
            title: b.name,
            clickable,
            icon: { content: pinHtml(b.name, b.id === sel.current, clickable), anchor: new nm.Point(0, 0) },
          });
          if (clickable) nm.Event.addListener(mk, "click", () => cb.current.onSelect?.(b.id));
          markers.current.set(b.id, mk);
        });
        cb.current.onReady?.();
      })
      .catch(() => alive && cb.current.onFail());
    return () => {
      alive = false;
      off();
      for (const mk of markers.current.values()) mk.setMap(null);
      markers.current.clear();
      map.current?.destroy?.();
      map.current = null;
    };
  }, [key, interactive]);

  // 목록에서 고르면 핀도 바뀐다(양방향)
  useEffect(() => {
    const nm = window.naver?.maps;
    if (!nm || !map.current) return;
    for (const b of buildings) {
      const mk = markers.current.get(b.id);
      const clickable = interactive && !!cb.current.onSelect;
      mk?.setIcon({ content: pinHtml(b.name, b.id === selectedId, clickable), anchor: new nm.Point(0, 0) });
    }
    const s = buildings.find((b) => b.id === selectedId);
    if (s && interactive) map.current.setCenter(new nm.LatLng(s.lat, s.lng));
  }, [selectedId, buildings, interactive]);

  return <span ref={el} className={cn("block size-full", className)} />;
}
