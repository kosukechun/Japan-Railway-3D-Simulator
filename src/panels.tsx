import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "./icons";
import { clock } from "./time";
import { simulated, walk } from "./routing";
import type { BoardEntry, Journey, Line, Network, Source, Step } from "./types";
import { StationField } from "./StationField";
import { sources } from "./data";

export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={close}
      onClick={(e) => {
        if (e.target === dialog.current) close();
      }}
    >
      <div className="dialog-inner">
        <div className="title-row">
          <h2>{title}</h2>
          <button className="icon" onClick={close} aria-label="閉じる">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function badge(j: Journey) {
  const actual = j.steps
    .filter((s) => s.line !== walk)
    .map((s) => s.source !== simulated);
  return actual.every(Boolean)
    ? "実ダイヤ"
    : actual.some(Boolean)
      ? "実ダイヤ＋推定"
      : "シミュレーション";
}
export function grouped(j: Journey) {
  const groups: Step[][] = [];
  for (const s of j.steps) {
    if (groups.at(-1)?.[0].trip === s.trip) groups.at(-1)!.push(s);
    else groups.push([s]);
  }
  return groups;
}
export function Detail({
  journey,
  lines,
  sources: list,
}: {
  journey: Journey;
  lines: Map<string, Line>;
  sources: Source[];
}) {
  return (
    <div className="detail">
      {grouped(journey).map((group, i, groups) => {
        const a = group[0],
          z = group.at(-1)!,
          l = lines.get(a.line),
          wait = i ? a.dep - groups[i - 1].at(-1)!.arr : 0;
        const source = list.find((x) => x.id === a.source);
        return (
          <section key={i}>
            {wait > 0 && <p className="wait">乗換・待ち時間　{wait}分</p>}
            <div className="service-name" style={{ borderColor: l?.color }}>
              {l?.name ?? "徒歩連絡"}
              <small>{Math.round(z.arr - a.dep)}分</small>
            </div>
            <p>
              <time>{clock(a.dep, true)}</time> {a.from} 発
            </p>
            {group.length > 1 && (
              <details>
                <summary>途中の停車駅 {group.length - 1}駅</summary>
                {group.slice(0, -1).map((s, index) => (
                  <p key={index}>
                    <time>{clock(s.arr, true)}</time> {s.to}
                  </p>
                ))}
              </details>
            )}
            <p>
              <time>{clock(z.arr, true)}</time> {z.to} 着
            </p>
            <small>
              {source ? (
                <a target="_blank" rel="noreferrer" href={source.url}>
                  実ダイヤ · {source.name}
                </a>
              ) : l ? (
                "シミュレーションダイヤ"
              ) : (
                "徒歩所要時間は推定"
              )}
            </small>
          </section>
        );
      })}
    </div>
  );
}
export function DataPanel({ list }: { list: Source[] }) {
  return (
    <>
      <p>
        地図の線形と列車の時刻には、それぞれ別の資料を使用しています。検索結果の区間を開くと時刻の出典を確認できます。
      </p>
      {list.map((s) => (
        <section className="source-card" key={s.id}>
          <strong>{s.name}</strong>
          <p>
            {s.start} 〜 {s.end}　<span>{s.license}</span>
          </p>
          <a href={s.url} target="_blank" rel="noreferrer">
            配布元・利用条件
          </a>
        </section>
      ))}
      <p>
        岡山電気軌道株式会社の Bus-Vision 公開GTFSを加工して使用しています。{" "}
        <a href={sources.okaden} target="_blank" rel="noreferrer">
          事業者公式サイト
        </a>
      </p>
      <p>
        神戸・京都の地下鉄では、原表に発時刻だけがある中間駅の到着を同じ分で表示する場合があります。実ダイヤの収録期間外はその路線の便を表示しません。
      </p>
      <h3>JR・私鉄のシミュレーションダイヤ</h3>
      <p>
        列車種別、停車駅、代表所要時間、運転間隔をモデル化しています。実際の列車選びには各社の案内をご確認ください。運賃と運休情報は収録していません。
      </p>
      <a href={sources.jr} target="_blank" rel="noreferrer">
        JR西日本の乗換案内「マイ・ダイヤ」
      </a>
      <h3>地図・線形</h3>
      <p>
        <a
          href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2025.html"
          target="_blank"
          rel="noreferrer"
        >
          国土交通省「国土数値情報（鉄道データ）」
        </a>
        を加工。2025年12月31日基準・CC BY
        4.0。地理院タイルとPLATEAUの出典は地図にも表示しています。
      </p>
      <p>
        3D都市モデル（Project PLATEAU）大阪市（2025年度）を加工して使用しています。
        大阪周辺の道路・水域は © OpenStreetMap contributors、ODbL 1.0です。
      </p>
      <p>
        <a href={import.meta.env.BASE_URL+"data/osaka-streets.json"} target="_blank" rel="noreferrer">加工したOSMデータ</a>
        {" · "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OSM利用条件</a>
        {" · "}
        <a href="https://github.com/kosukechun/Japan-Railway-3D-Simulator/blob/main/docs/DATA_SOURCES_AND_LICENSES.md" target="_blank" rel="noreferrer">出典・ライセンス一覧</a>
      </p>
    </>
  );
}
export function Board({
  station,
  date,
  network,
  lines,
  board,
  setStation,
  setDate,
}: {
  station: string;
  date: string;
  network: Network;
  lines: Map<string, Line>;
  board: BoardEntry[];
  setStation: (s: string) => void;
  setDate: (s: string) => void;
}) {
  const [dir, filter] = useState("");
  const options = [...new Set(board.map((e) => e.line + "|" + e.destination))];
  const rows = board.filter(
    (e) => !dir || e.line + "|" + e.destination === dir,
  );
  const hours = [...new Set(rows.map((e) => Math.floor(e.dep / 60)))];
  return (
    <>
      <div className="board-form">
        <StationField
          label="駅名"
          value={station}
          set={(s) => {
            setStation(s);
            filter("");
          }}
          network={network}
        />
        <label>
          運行日
          <input
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
        </label>
      </div>
      <label>
        路線・行先
        <select value={dir} onChange={(e) => filter(e.target.value)}>
          <option value="">すべての路線・行先</option>
          {options.map((k) => {
            const [id, to] = k.split("|");
            return (
              <option key={k} value={k}>
                {lines.get(id)?.name} · {to}行
              </option>
            );
          })}
        </select>
      </label>
      <p className="muted">時刻は日本時間。24時以降は運行日の翌日です。</p>
      {!rows.length && <p>この駅・運行日の収録便はありません。</p>}
      {hours.map((h) => (
        <div key={h} className="board-hour">
          <b>
            {String(h).padStart(2, "0")}
            <small>時</small>
          </b>
          <div>
            {rows
              .filter((e) => Math.floor(e.dep / 60) === h)
              .map((e, i) => (
                <span key={i} title={lines.get(e.line)?.name}>
                  <time>{String(Math.floor(e.dep) % 60).padStart(2, "0")}</time>{" "}
                  {lines.get(e.line)?.name} · {e.destination}
                  <small>{e.source === simulated ? "推定" : "実ダイヤ"}</small>
                </span>
              ))}
          </div>
        </div>
      ))}
    </>
  );
}
