import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "./icons";
import { Board, DataPanel, Detail, Modal, badge, grouped } from "./panels";
import { StationField } from "./StationField";
import { MapView } from "./MapView";
import {
  compareLink,
  initialQuery,
  loadData,
  queryParams,
  sources,
} from "./data";
import { moment } from "./playback";
import { walk } from "./routing";
import { clock, dateJST, midnight, minuteOf } from "./time";
import type { BoardEntry, Query, Result, TrafficJourney } from "./types";
import { journeyKey, playbackBounds } from "./traffic";
import { TrafficPanel } from "./TrafficPanel";
import type { CameraMode, LightMode } from "./map";
import "./style.css";

const cameras: Record<CameraMode, string> = {
  follow: "追従",
  aerial: "空撮",
  cab: "運転席",
  overview: "全体俯瞰",
  free: "自由",
};
const lighting: Record<LightMode, string> = {
  auto: "自動",
  day: "昼",
  sunset: "夕方",
  night: "夜",
};
const presets = [1, 2, 5, 10, 30, 50, 100, 200];
const formatDate = (v: number) => dateJST(v).replaceAll("-", ".");
const pace = (n: number) => String(Math.round(n)) + "分";
function Control({
  icon,
  label,
  action,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  action: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon"
      aria-label={label}
      title={label}
      onClick={action}
      disabled={disabled}
    >
      <Icon name={icon} />
    </button>
  );
}
function App() {
  const [form, formSet] = useState(initialQuery),
    [query, setQuery] = useState(form);
  const [data, loaded] = useState<Awaited<ReturnType<typeof loadData>>>(),
    [result, setResult] = useState<Result>(),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const [selected, select] = useState(0),
    [minute, seek] = useState(minuteOf(form.time)),
    [running, play] = useState(false),
    [speed, rate] = useState(30);
  const [panel, togglePanel] = useState(() => innerWidth > 760),
    [modal, open] = useState<
      "" | "board" | "data" | "settings" | "detail" | "saved"
    >("");
  const [camera, setCamera] = useState<CameraMode>("follow"),
    [light, setLight] = useState<LightMode>("auto"),
    [distance, setDistance] = useState(660),
    [angle, setAngle] = useState(34),
    [layers, setLayers] = useState({
      buildings: true,
      imagery: true,
      rail: true,
    });
  const [status, setStatus] = useState("地図を読み込み中"),
    [info, stationInfo] = useState(""),
    [notice, say] = useState("");
  const [boardStation, setBoardStation] = useState(form.from),
    [boardDate, setBoardDate] = useState(form.date),
    [board, setBoard] = useState<BoardEntry[]>([]);
  const [favorites, fave] = useState<Query[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("rail-journeys") ?? "[]");
      return Array.isArray(v)
        ? v.filter(
            (q) => q && typeof q.from === "string" && typeof q.to === "string"
              && typeof q.date === "string" && Number.isFinite(midnight(q.date))
              && typeof q.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(q.time)
              && (q.mode === "depart" || q.mode === "arrive")
              && (q.via === undefined || Array.isArray(q.via) && q.via.every((s:unknown)=>typeof s === "string")),
          )
        : [];
    } catch {
      return [];
    }
  });
  const [traffic, setTraffic] = useState<TrafficJourney[]>([]);
  const globe = useRef<HTMLDivElement>(null),
    worker = useRef<Worker>(),
    rev = useRef(0),
    boardRev = useRef(0);
  const lines = useMemo(
    () => new Map(data?.network.lines.map((l) => [l.id, l])),
    [data],
  );
  const journey = result?.journeys[selected],
    first = journey?.steps[0],
    last = journey?.steps.at(-1);
  const bounds = playbackBounds(journey, query.date, traffic);
  const start = bounds?.start ?? first?.dep ?? minuteOf(query.time),
    end = bounds?.end ?? last?.arr ?? start,
    t = journey ? moment(journey, minute) : undefined;
  const step = t && journey?.steps[t.index],
    line = lines.get(step?.line ?? "");
  const ms = midnight(query.date) + minute * 60000,
    tripDate = Number.isFinite(ms) ? formatDate(ms) : "—";
  const update = <K extends keyof Query>(key: K, value: Query[K]) =>
    formSet((q) => ({ ...q, [key]: value }));
  const run = useCallback((q: Query) => {
    if (!worker.current) return;
    if(!Number.isFinite(midnight(q.date)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(q.time)) {
      setError("有効な日付と時刻を入力してください。");
      return;
    }
    setBusy(true);
    setError("");
    setResult(undefined);
    setQuery(q);
    play(false);
    select(0);
    stationInfo("");
    setBoardStation(q.from);
    setBoardDate(q.date);
    worker.current.postMessage({ query: q, id: ++rev.current });
  }, []);
  useEffect(() => {
    let alive = true;
    const w = new Worker(new URL("./search.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = ({ data: m }) => {
      if (m.boardId !== undefined) {
        if (m.boardId === boardRev.current) setBoard(m.board);
        return;
      }
      if (m.id !== rev.current) return;
      setBusy(false);
      if (m.error) {
        setError(m.error);
        return;
      }
      setResult(m.result);
      if (m.result.journeys.length) seek(m.result.journeys[0].steps[0].dep);
      else
        setError(
          "指定時刻から24時間以内に利用できる収録経路がありません。運行日と収録範囲をご確認ください。",
        );
    };
    w.onerror = () => {
      setBusy(false);
      setError("検索処理が停止しました。ページを再読み込みしてください。");
    };
    loadData()
      .then((d) => {
        if (alive) {
          loaded(d);
          w.postMessage({ network: d.network, table: d.table });
          run(initialQuery());
        }
      })
      .catch((e) => {
        if (alive) {
          setError(String(e));
          setBusy(false);
        }
      });
    return () => {
      alive = false;
      w.terminate();
      worker.current = undefined;
    };
  }, [run]);
  useEffect(() => {
    if (modal !== "board" || !data) return;
    setBoard([]);
    const id = ++boardRev.current;
    if (data.network.stations.some((s) => s.id === boardStation))
      worker.current?.postMessage({
        station: boardStation,
        date: boardDate,
        boardId: id,
      });
  }, [modal, boardStation, boardDate, data]);
  useEffect(() => {
    if (!running || !bounds) return;
    let frame = 0,
      previous = performance.now();
    function tick(now: number) {
      const dt = now - previous;
      if (dt >= 50) {
        seek((v) => Math.min(end, v + (dt * speed) / 60000));
        previous = now;
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, speed, journey, end, !!bounds]);
  useEffect(() => {
    if (bounds) seek((v) => Math.max(start, Math.min(end, v)));
  }, [start, end, !!bounds]);
  useEffect(() => {
    if (running && minute >= end) play(false);
  }, [minute, end, running]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => say(""), 3000);
    return () => clearTimeout(id);
  }, [notice]);
  const openBoard = () => {
    setBoardStation(query.from);
    setBoardDate(query.date);
    open("board");
  };
  const choose = (index: number) => {
    const j = result!.journeys[index];
    select(index);
    if (!traffic.length) seek(j.steps[0].dep);
    play(false);
    stationInfo("");
  };
  const togglePlay = () => {
    if (minute >= end) seek(start);
    play(!running);
  };
  const skip = (dir: number) => {
    if (!journey) return;
    const times = [start, ...journey.steps.map((s) => s.arr)];
    seek(
      dir > 0
        ? (times.find((n) => n > minute + 0.001) ?? end)
        : (times.reverse().find((n) => n < minute - 0.001) ?? start),
    );
  };
  const storeFavorite = () => {
    try {
      const next = [
        query,
        ...favorites.filter((q) => JSON.stringify(q) !== JSON.stringify(query)),
      ].slice(0, 12);
      localStorage.setItem("rail-journeys", JSON.stringify(next));
      fave(next);
      say("検索条件を保存しました");
    } catch {
      say("このブラウザでは保存できません");
    }
  };
  const share = async () => {
    const url = new URL(location.href);
    url.search = queryParams(query).toString();
    history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url.href);
      say("共有リンクをコピーしました");
    } catch {
      say("アドレス欄に共有リンクを表示しました");
    }
  };
  const example = (from: string, to: string) => {
    const q = { ...form, from, to, via: [] };
    formSet(q);
    run(q);
  };
  const addTraffic = () => {
    if (!journey) return;
    const id = journeyKey(journey, query.date);
    if (traffic.some((t) => t.id === id)) {
      say("この列車は追加済みです。別の経路や時刻を選んでください。");
      return;
    }
    const palette = ["#ffc07a", "#a6a0ff", "#f293bb", "#67cfff"];
    setTraffic((t) => [
      ...t,
      {
        id,
        journey,
        date: query.date,
        label: query.from + " → " + query.to,
        color: palette[t.length % palette.length],
      },
    ]);
    say("列車を追加しました。別の候補や経路を選ぶと同時に走行します。");
  };
  const detailStation =
    info &&
    data?.network.stations.find((s) => s.id === info || s.name === info);
  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-logo">
            <Icon name="train" size={25} />
          </span>
          <div>
            <strong>鉄道航路図</strong>
            <small>JAPAN RAILWAY 3D SIMULATOR</small>
          </div>
        </div>
        <nav aria-label="メインメニュー">
          <button className={!modal ? "active" : ""} onClick={() => open("")}>
            <Icon name="map" />
            シミュレーター
          </button>
          <button
            className={modal === "board" ? "active" : ""}
            onClick={openBoard}
          >
            <Icon name="clock" />
            駅時刻表
          </button>
          <button
            className={modal === "data" ? "active" : ""}
            onClick={() => open("data")}
          >
            <Icon name="layers" />
            データ情報
          </button>
        </nav>
        <div className="header-zone">
          <i />
          日本標準時 <b>JST</b>
        </div>
      </header>
      <main className={panel ? "layout" : "layout hidden-panel"}>
        {panel && (
          <aside>
            <div className="side-heading">
              <div>
                <span className="eyebrow">ROUTE PLANNER</span>
                <h1>経路検索</h1>
              </div>
              <Control
                icon="panel"
                label="検索パネルを閉じる"
                action={() => togglePanel(false)}
              />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(form);
              }}
            >
              <div className="station-box">
                <div className="station-track">
                  <i />
                  <i />
                </div>
                <StationField
                  label="出発駅"
                  value={form.from}
                  set={(v) => update("from", v)}
                  network={data?.network}
                />
                <div className="field-line" />
                <StationField
                  label="到着駅"
                  value={form.to}
                  set={(v) => update("to", v)}
                  network={data?.network}
                />
                <button
                  type="button"
                  aria-label="出発駅と到着駅を入れ替える"
                  className="swap"
                  onClick={() =>
                    formSet({
                      ...form,
                      from: form.to,
                      to: form.from,
                      via: [...(form.via ?? [])].reverse(),
                    })
                  }
                >
                  <Icon name="swap" size={16} />
                </button>
              </div>
              <div className="via-fields">
                {(form.via ?? []).map((station, i) => (
                  <div className="via-row" key={i}>
                    <StationField
                      label={"経由駅 " + (i + 1)}
                      value={station}
                      set={(v) =>
                        update(
                          "via",
                          (form.via ?? []).map((s, k) => (k === i ? v : s)),
                        )
                      }
                      network={data?.network}
                    />
                    <button
                      type="button"
                      className="icon"
                      disabled={i === 0}
                      aria-label={"経由駅 " + (i + 1) + "を前に移動"}
                      onClick={() => {
                        const via = [...(form.via ?? [])];
                        [via[i - 1], via[i]] = [via[i], via[i - 1]];
                        update("via", via);
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="icon"
                      aria-label={"経由駅 " + (i + 1) + "を削除"}
                      onClick={() =>
                        update(
                          "via",
                          (form.via ?? []).filter((_, k) => i !== k),
                        )
                      }
                    >
                      <Icon name="close" size={15} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="add-via"
                  onClick={() => update("via", [...(form.via ?? []), ""])}
                >
                  ＋ 経由駅を追加
                </button>
              </div>
              <div className="segmented">
                {(["depart", "arrive"] as const).map((m) => (
                  <button
                    type="button"
                    key={m}
                    aria-pressed={form.mode === m}
                    onClick={() => update("mode", m)}
                  >
                    {m === "depart" ? "出発時刻指定" : "到着時刻指定"}
                  </button>
                ))}
              </div>
              <div className="date-fields">
                <label>
                  乗車日
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => update("date", e.target.value)}
                  />
                </label>
                <label>
                  {form.mode === "depart" ? "出発時刻" : "到着時刻"}
                  <input
                    type="time"
                    required
                    value={form.time}
                    onChange={(e) => update("time", e.target.value)}
                  />
                </label>
              </div>
              <button className="primary search" disabled={!data || busy}>
                <Icon name="search" />
                経路を検索
              </button>
            </form>
            <div className="examples">
              <span>実ダイヤで試す</span>
              <button onClick={() => example("新神戸", "三宮")}>
                神戸地下鉄
              </button>
              <button onClick={() => example("岡山駅前", "東山")}>
                岡山電軌
              </button>
            </div>
            <div className="results">
              <div className="title-row">
                <h2>経路候補</h2>
                <small>
                  {busy ? "検索中…" : (result?.journeys.length ?? 0) + " 件"}
                </small>
              </div>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              {result?.journeys.map((j, i) => {
                const a = j.steps[0],
                  z = j.steps.at(-1)!,
                  groups = grouped(j).filter((g) => g[0].line !== walk);
                return (
                  <button
                    key={i}
                    onClick={() => choose(i)}
                    className={
                      "route-card " + (i === selected ? "selected" : "")
                    }
                    aria-pressed={i === selected}
                  >
                    <div className="route-top">
                      <span className="route-index">経路 {i + 1}</span>
                      <span
                        className={
                          "tag " + (badge(j) === "実ダイヤ" ? "actual" : "")
                        }
                      >
                        {badge(j)}
                      </span>
                    </div>
                    <div className="route-times">
                      <strong>
                        {clock(a.dep, true)} <span>→</span> {clock(z.arr, true)}
                      </strong>
                      <b>{pace(z.arr - a.dep)}</b>
                    </div>
                    <div className="line-chips">
                      {groups.map((g, k) => (
                        <span
                          key={k}
                          style={{ borderColor: lines.get(g[0].line)?.color }}
                        >
                          {lines.get(g[0].line)?.name}
                        </span>
                      ))}
                    </div>
                    <small>
                      乗換 {j.changes}回　·　{j.km.toFixed(1)} km
                    </small>
                  </button>
                );
              })}
              {journey && (
                <div className="route-actions">
                  <button onClick={() => open("detail")}>
                    <Icon name="list" />
                    停車駅・乗換詳細
                  </button>
                  <Control
                    icon="bookmark"
                    label="この条件を保存"
                    action={storeFavorite}
                  />
                  <Control
                    icon="link"
                    label="共有リンクをコピー"
                    action={share}
                  />
                </div>
              )}
              {journey && (
                <button className="add-train" onClick={addTraffic}>
                  <Icon name="train" />
                  この列車を同時走行に追加
                </button>
              )}
              <TrafficPanel
                trains={traffic}
                remove={(id) => setTraffic((t) => t.filter((v) => v.id !== id))}
              />
              <div className="external">
                <a href={compareLink(query)} target="_blank" rel="noreferrer">
                  同じ条件で乗換案内を確認 ↗
                </a>
                <button onClick={() => open("saved")}>保存した条件</button>
              </div>
            </div>
          </aside>
        )}
        <section className="workspace" ref={globe}>
          <div className="map-wrap">
            <MapView
              journey={journey}
              traffic={traffic}
              lines={lines}
              date={query.date}
              minute={minute}
              light={light}
              camera={camera}
              distance={distance}
              angle={angle}
              layers={layers}
              onStation={stationInfo}
              onStatus={setStatus}
            />
            <div className="map-top">
              {!panel && (
                <button
                  className="panel-open"
                  onClick={() => togglePanel(true)}
                >
                  <Icon name="panel" />
                  経路検索
                </button>
              )}
              <div className="map-name">
                <span className="map-mark">
                  <Icon name="location" />
                </span>
                <div>
                  <small>走行エリア</small>
                  <strong>
                    {journey ? query.from + "  —  " + query.to : "大阪駅周辺"}
                  </strong>
                </div>
              </div>
            </div>
            <div className="sim-clock">
              <small>
                <Icon name="clock" size={13} /> シミュレーション時刻
              </small>
              <strong>
                {clock(minute)}
                <em>
                  :
                  {String(Math.max(0, Math.floor((minute * 60) % 60))).padStart(
                    2,
                    "0",
                  )}
                </em>
              </strong>
              <span>{tripDate}　JST</span>
            </div>
            <div className="map-tools">
              <Control
                icon="layers"
                label="地図と光の設定"
                action={() => open("settings")}
              />
              <Control
                icon="expand"
                label="全画面切替"
                action={() => {
                  if (document.fullscreenElement)
                    document
                      .exitFullscreen()
                      .catch(() => say("全画面に対応していません"));
                  else
                    globe.current
                      ?.requestFullscreen?.()
                      .catch(() => say("全画面に対応していません"));
                }}
              />
            </div>
            {detailStation && (
              <div className="map-popup">
                <Control
                  icon="close"
                  label="駅情報を閉じる"
                  action={() => stationInfo("")}
                />
                <strong>{detailStation.name}駅</strong>
                <small>{detailStation.prefecture}</small>
                <p>
                  {data?.network.lines
                    .filter((l) => l.stops.includes(detailStation.id))
                    .map((l) => l.name)
                    .join("・")}
                </p>
                <button
                  onClick={() => {
                    setBoardStation(detailStation.id);
                    setBoardDate(query.date);
                    open("board");
                  }}
                >
                  この駅の時刻表
                </button>
              </div>
            )}
            {journey && minute >= last!.arr && (
              <div className="arrival-banner">{query.to}駅に到着</div>
            )}
            <div className="map-status" role="status">
              {status}
            </div>
          </div>
          <div className="deck">
            <div className="deck-head">
              <div className="train-round">
                <Icon name="train" size={21} />
              </div>
              <div className="train-label">
                <small>{t?.state ?? "待機中"}</small>
                <strong>
                  {line?.name ??
                    (step?.line === walk ? "徒歩連絡" : "列車を選択")}
                </strong>
              </div>
              <div className="next-station">
                <small>{t?.state === "到着" ? "到着駅" : "次の駅"}</small>
                <strong>{step?.to ?? "—"}</strong>
              </div>
              <label className="camera-choice">
                <Icon name="camera" />
                <select
                  aria-label="カメラ視点"
                  value={camera}
                  onChange={(e) => setCamera(e.target.value as CameraMode)}
                >
                  {Object.entries(cameras).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}カメラ
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="timeline">
              <time>{clock(start, true)}</time>
              <input
                aria-label="走行タイムライン"
                type="range"
                min={start}
                max={Math.max(start + 0.01, end)}
                step=".002"
                value={minute}
                disabled={!journey}
                onChange={(e) => seek(+e.target.value)}
                style={
                  {
                    "--played":
                      (end > start
                        ? ((minute - start) / (end - start)) * 100
                        : 0) + "%",
                  } as React.CSSProperties
                }
              />
              <time>{clock(end, true)}</time>
            </div>
            <div className="transport">
              <div className="play-controls">
                <Control
                  icon="reset"
                  label="最初に戻る"
                  action={() => {
                    seek(start);
                    play(false);
                  }}
                  disabled={!journey}
                />
                <Control
                  icon="previous"
                  label="前の駅"
                  action={() => skip(-1)}
                  disabled={!journey}
                />
                <button
                  className="play"
                  disabled={!journey}
                  aria-label={running ? "一時停止" : "再生"}
                  onClick={togglePlay}
                >
                  <Icon name={running ? "pause" : "play"} />
                </button>
                <Control
                  icon="next"
                  label="次の駅"
                  action={() => skip(1)}
                  disabled={!journey}
                />
                <Control
                  icon="end"
                  label="到着まで進む"
                  action={() => {
                    seek(end);
                    play(false);
                  }}
                  disabled={!journey}
                />
              </div>
              <label className="speed">
                再生速度
                <select
                  aria-label="再生速度"
                  value={speed}
                  onChange={(e) => rate(+e.target.value)}
                >
                  {[...new Set([...presets, speed])]
                    .sort((a, b) => a - b)
                    .map((v) => (
                      <option key={v} value={v}>
                        {v}×
                      </option>
                    ))}
                </select>
              </label>
              <button className="deck-setting" onClick={() => open("settings")}>
                <Icon name="sun" />
                <span>表示設定</span>
              </button>
            </div>
          </div>
        </section>
      </main>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {modal && (
        <Modal
          title={
            {
              board: "駅時刻表",
              data: "データ情報",
              settings: "表示・再生設定",
              detail: "停車駅・乗換詳細",
              saved: "保存した検索条件",
            }[modal]
          }
          close={() => open("")}
        >
          {modal === "board" && data && (
            <>
              <Board
                station={boardStation}
                date={boardDate}
                network={data.network}
                lines={lines}
                board={board}
                setStation={setBoardStation}
                setDate={setBoardDate}
              />
            </>
          )}
          {modal === "data" && <DataPanel list={data?.table.sources ?? []} />}
          {modal === "detail" && journey && (
            <>
              <h3>
                {[query.from, ...(query.via ?? []), query.to].join(" → ")}
              </h3>
              <Detail
                journey={journey}
                lines={lines}
                sources={data?.table.sources ?? []}
              />
              <div className="detail-links">
                <a href={compareLink(query)} target="_blank" rel="noreferrer">
                  同条件の乗換案内 ↗
                </a>
                <a href={sources.jr} target="_blank" rel="noreferrer">
                  JR西日本 マイ・ダイヤ ↗
                </a>
                {query.from === "大阪" && (
                  <a
                    href={
                      sources.osaka + "?date=" + query.date.replaceAll("-", "")
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    大阪駅 JR京都線の公式時刻表 ↗
                  </a>
                )}
              </div>
            </>
          )}
          {modal === "settings" && (
            <div className="settings">
              <label>
                昼夜モード
                <select
                  value={light}
                  onChange={(e) => setLight(e.target.value as LightMode)}
                >
                  {Object.entries(lighting).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                再生速度　{speed}×
                <input
                  type="range"
                  min="1"
                  max="200"
                  value={speed}
                  onChange={(e) => rate(+e.target.value)}
                />
              </label>
              <label>
                カメラ距離　{distance} m
                <input
                  type="range"
                  min="60"
                  max="2000"
                  step="10"
                  value={distance}
                  onChange={(e) => setDistance(+e.target.value)}
                />
              </label>
              <label>
                カメラ俯角　{angle}°
                <input
                  type="range"
                  min="10"
                  max="85"
                  value={angle}
                  onChange={(e) => setAngle(+e.target.value)}
                />
              </label>
              {(["buildings", "imagery", "rail"] as const).map((key, i) => (
                <label className="check" key={key}>
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={(e) =>
                      setLayers({ ...layers, [key]: e.target.checked })
                    }
                  />
                  {["3D建物", "背景地図", "鉄道路線"][i]}
                </label>
              ))}
            </div>
          )}
          {modal === "saved" &&
            (!favorites.length ? (
              <p>経路候補のしおりボタンで検索条件を保存できます。</p>
            ) : (
              favorites.map((q, i) => (
                <button
                  className="saved-entry"
                  key={i}
                  onClick={() => {
                    formSet(q);
                    run(q);
                    open("");
                  }}
                >
                  {[q.from, ...(q.via ?? []), q.to].join(" → ")}
                  <small>
                    {q.date}　{q.time} {q.mode === "arrive" ? "到着" : "出発"}
                  </small>
                </button>
              ))
            ))}
        </Modal>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
