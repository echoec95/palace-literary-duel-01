import { useEffect, useRef, useState } from 'react';

export type ExplorationClue = {
  id: string;
  title: string;
  symbol: string;
  detail: string;
};

type ExplorationSceneProps = {
  clues: ExplorationClue[];
  inspected: string[];
  onInspect: (clueId: string) => void;
};

type Position = { x: number; y: number };
type Direction = 'up' | 'down' | 'left' | 'right';
type OrientationPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

const clueSpots: Position[] = [
  { x: 23, y: 43 },
  { x: 52, y: 29 },
  { x: 77, y: 50 },
];
const startPosition = { x: 50, y: 78 };
const speed = 25;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function ExplorationScene({ clues, inspected, onInspect }: ExplorationSceneProps) {
  const [player, setPlayer] = useState<Position>(startPosition);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [motionMessage, setMotionMessage] = useState('手機可啟用傾斜控制，也能使用觸控方向鍵。');
  const pressed = useRef(new Set<string>());
  const motion = useRef({ x: 0, y: 0 });
  const orientationBaseline = useRef<{ gamma: number; beta: number } | null>(null);
  const sceneRef = useRef<HTMLElement>(null);

  const nearest = clues.reduce<{ clue: ExplorationClue; distance: number } | null>((closest, clue, index) => {
    const spot = clueSpots[index % clueSpots.length];
    const distance = Math.hypot(player.x - spot.x, player.y - spot.y);
    return !closest || distance < closest.distance ? { clue, distance } : closest;
  }, null);
  const nearbyClue = nearest && nearest.distance <= 13 ? nearest.clue : null;
  const nearbyRef = useRef<ExplorationClue | null>(nearbyClue);
  const inspectRef = useRef(onInspect);
  nearbyRef.current = nearbyClue;
  inspectRef.current = onInspect;

  useEffect(() => {
    const isEditable = (target: EventTarget | null) => target instanceof HTMLElement
      && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditable(event.target)) return;
      const key = event.key.toLowerCase();
      const insideScene = event.target instanceof Node && sceneRef.current?.contains(event.target);
      if (['w', 'a', 's', 'd'].includes(key) && insideScene) {
        event.preventDefault();
        pressed.current.add(key);
      } else if ((key === 'e' || key === 'enter') && insideScene) {
        event.preventDefault();
        if (nearbyRef.current) inspectRef.current(nearbyRef.current.id);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => pressed.current.delete(event.key.toLowerCase());
    const clearKeys = () => pressed.current.clear();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearKeys);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearKeys);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    let previous = 0;
    const move = (time: number) => {
      if (previous) {
        const delta = Math.min((time - previous) / 1000, 0.05);
        const keys = pressed.current;
        let x = (Number(keys.has('d') || keys.has('right')) - Number(keys.has('a') || keys.has('left'))) + motion.current.x;
        let y = (Number(keys.has('s') || keys.has('down')) - Number(keys.has('w') || keys.has('up'))) + motion.current.y;
        const length = Math.hypot(x, y);
        if (length > 1) { x /= length; y /= length; }
        if (length > 0.03) setPlayer((current) => ({
          x: clamp(current.x + x * speed * delta, 5, 95),
          y: clamp(current.y + y * speed * delta, 9, 88),
        }));
      }
      previous = time;
      frame = window.requestAnimationFrame(move);
    };
    frame = window.requestAnimationFrame(move);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!motionEnabled) return;
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.gamma === null || event.beta === null) return;
      if (!orientationBaseline.current) {
        orientationBaseline.current = { gamma: event.gamma, beta: event.beta };
        motion.current = { x: 0, y: 0 };
        return;
      }
      motion.current.x = clamp((event.gamma - orientationBaseline.current.gamma) / 24, -1, 1);
      motion.current.y = clamp((event.beta - orientationBaseline.current.beta) / 24, -1, 1);
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [motionEnabled]);

  const enableMotion = async () => {
    try {
      if (!('DeviceOrientationEvent' in window)) {
        setMotionMessage('此裝置不支援傾斜控制，請使用觸控方向鍵。');
        return;
      }
      const orientation = DeviceOrientationEvent as OrientationPermission;
      if (orientation.requestPermission) {
        const permission = await orientation.requestPermission();
        if (permission !== 'granted') {
          setMotionMessage('感應權限未開啟，仍可使用觸控方向鍵。');
          return;
        }
      }
      orientationBaseline.current = null;
      setMotionEnabled(true);
      setMotionMessage('感應會以啟用時的姿勢為中心；傾斜即可移動，觸控方向鍵仍可使用。');
    } catch {
      setMotionMessage('無法啟用感應器，請使用觸控方向鍵。');
    }
  };

  const holdDirection = (direction: Direction, active: boolean) => {
    if (active) pressed.current.add(direction);
    else pressed.current.delete(direction);
  };
  const directionButton = (direction: Direction, symbol: string, label: string) => <button
    type="button"
    aria-label={label}
    onPointerDown={() => holdDirection(direction, true)}
    onPointerUp={() => holdDirection(direction, false)}
    onPointerCancel={() => holdDirection(direction, false)}
    onLostPointerCapture={() => holdDirection(direction, false)}
    onKeyDown={(event) => {
      if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
        event.preventDefault();
        holdDirection(direction, true);
      }
    }}
    onKeyUp={() => holdDirection(direction, false)}
    onBlur={() => holdDirection(direction, false)}
  >{symbol}</button>;

  return <section className="exploration-layout" aria-label="御花園場景探索">
    <div className="exploration-main">
      <div className="exploration-heading">
        <div><p className="eyebrow">GARDEN EXPLORATION</p><h2>在御花園尋找線索</h2></div>
        <span className="count">已查看 {inspected.length}/{clues.length}</span>
      </div>
      <section
        className="exploration-scene"
        aria-label="御花園探索場景。桌機用 W、A、S、D 移動，走近線索後按 E 或 Enter 查看。"
        ref={sceneRef}
        tabIndex={0}
        onPointerDown={() => sceneRef.current?.focus()}
      >
        <div className="garden-sky" aria-hidden="true" />
        <div className="garden-pavilion" aria-hidden="true"><span>御花園</span></div>
        <div className="garden-path" aria-hidden="true" />
        <div className="garden-pond" aria-hidden="true" />
        <div className="garden-shrub shrub-left" aria-hidden="true" />
        <div className="garden-shrub shrub-right" aria-hidden="true" />
        {clues.map((clue, index) => {
          const spot = clueSpots[index % clueSpots.length];
          const isNearby = nearbyClue?.id === clue.id;
          const isInspected = inspected.includes(clue.id);
          return <button
            className={`clue-hotspot ${isNearby ? 'nearby' : ''} ${isInspected ? 'found' : ''}`}
            key={clue.id}
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            aria-label={`${clue.title}${isInspected ? '，已查看' : '，未查看'}`}
            aria-pressed={isInspected}
            disabled={!isNearby}
            onClick={() => onInspect(clue.id)}
          ><span aria-hidden="true">{clue.symbol}</span><small>{clue.title}</small></button>;
        })}
        <div className="sticker-person" style={{ left: `${player.x}%`, top: `${player.y}%` }} aria-label="貼紙人">
          <svg viewBox="0 0 64 78" role="img" aria-hidden="true">
            <ellipse cx="32" cy="71" rx="21" ry="5" fill="#30251d" opacity=".24" />
            <path d="M13 37c0-13 8-23 19-23s19 10 19 23v18c0 7-8 11-19 11S13 62 13 55Z" fill="#fffdf6" stroke="#8c6043" strokeWidth="3" />
            <path d="M13 38c0-15 8-24 19-24s19 9 19 24c-6-4-12-6-19-6s-13 2-19 6Z" fill="#583c31" stroke="#8c6043" strokeWidth="3" />
            <circle cx="26" cy="40" r="2" fill="#392920" /><circle cx="39" cy="40" r="2" fill="#392920" />
            <path d="M28 47q4 4 8 0" fill="none" stroke="#b86c5f" strokeWidth="2" strokeLinecap="round" />
            <path d="M19 54q13 8 26 0" fill="none" stroke="#c49a4d" strokeWidth="3" strokeLinecap="round" />
            <path d="M21 63 17 70m26-7 4 7" stroke="#8c6043" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </div>
        {nearbyClue && <div className="nearby-prompt" role="status">按 E／Enter 查看「{nearbyClue.title}」</div>}
        {!nearbyClue && <div className="exploration-help">W A S D 移動 · 靠近線索後按 E 查看</div>}
      </section>
      <div className="sensor-tools">
        <div><strong>手機移動</strong><span>{motionMessage}</span></div>
        <button className="hint-button sensor-button" type="button" onClick={enableMotion}>{motionEnabled ? '傾斜控制已啟用' : '啟用傾斜控制'}</button>
      </div>
      <div className="touch-pad" aria-label="觸控移動控制">
        {directionButton('up', '▲', '向上移動')}
        {directionButton('left', '◀', '向左移動')}
        {directionButton('down', '▼', '向下移動')}
        {directionButton('right', '▶', '向右移動')}
      </div>
    </div>
    <aside className="clue-journal" aria-label="線索記錄">
      <p className="eyebrow">CLUE JOURNAL</p><h3>線索記錄</h3>
      <div className="journal-list">{clues.map((clue) => {
        const isInspected = inspected.includes(clue.id);
        return <button className={`journal-clue ${isInspected ? 'found' : ''}`} type="button" key={clue.id} onClick={() => onInspect(clue.id)} aria-pressed={isInspected}>
          <span className="journal-symbol" aria-hidden="true">{clue.symbol}</span>
          <span><strong>{clue.title}</strong><small>{isInspected ? clue.detail : '點選查看文字線索'}</small></span>
          <span className="journal-status">{isInspected ? '已記錄' : '未查看'}</span>
        </button>;
      })}</div>
    </aside>
  </section>;
}
