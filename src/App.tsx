
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Progress, ScrollArea } from "./ui";
import { Coins, Sword, Timer, Zap, RefreshCcw, ChevronUp, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ==========================
// Utility helpers
// ==========================
const SUFFIXES = [
  { v: 1e33, s: "Dc" },
  { v: 1e30, s: "No" },
  { v: 1e27, s: "Oc" },
  { v: 1e24, s: "Sp" },
  { v: 1e21, s: "Sx" },
  { v: 1e18, s: "Qi" },
  { v: 1e15, s: "Qa" },
  { v: 1e12, s: "T" },
  { v: 1e9, s: "B" },
  { v: 1e6, s: "M" },
  { v: 1e3, s: "K" },
];

function formatNumber(n: number, digits = 2) {
  if (!isFinite(n)) return "∞";
  const abs = Math.abs(n);
  for (const { v, s } of SUFFIXES) {
    if (abs >= v) return `${(n / v).toFixed(digits)}${s}`;
  }
  return n.toFixed(n >= 100 ? 0 : digits);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function bulkCost(base: number, growth: number, currentLevel: number, qty: number) {
  if (qty <= 0) return 0;
  const a = base * Math.pow(growth, currentLevel);
  if (growth === 1) return a * qty;
  return a * (Math.pow(growth, qty) - 1) / (growth - 1);
}

// ==========================
// Game constants
// ==========================
const TICK_MS = 50; // game loop tick

const CLICK = {
  baseDamage: 1,
  baseCost: 10,
  growth: 1.15,
  damageGrowth: 1.25,
};

const ENEMY = {
  baseHp: 10,
  floorGrowth: 1.6,
  bossMultiplier: 12,
  perKillGoldPct: 0.05,
  bossGoldMultiplier: 2,
  bossTimeSeconds: 30,
  killsPerFloor: 20,
};

const OFFLINE = {
  maxSeconds: 12 * 60 * 60,
};

const HEROES = [
  { id: 1, name: "Squire", baseDps: 1, baseCost: 50, growth: 1.07, flavor: "Swings a rusty sword." },
  { id: 2, name: "Archer", baseDps: 5, baseCost: 250, growth: 1.08, flavor: "Never misses. Often." },
  { id: 3, name: "Mage", baseDps: 25, baseCost: 1000, growth: 1.09, flavor: "Practices safe fireballs." },
  { id: 4, name: "Knight", baseDps: 125, baseCost: 5000, growth: 1.10, flavor: "Shiny armor, shinier DPS." },
  { id: 5, name: "Assassin", baseDps: 625, baseCost: 25000, growth: 1.11, flavor: "Strikes when wallets are open." },
  { id: 6, name: "Paladin", baseDps: 3125, baseCost: 125000, growth: 1.12, flavor: "Holy smites per second." },
  { id: 7, name: "Warlock", baseDps: 15625, baseCost: 600000, growth: 1.13, flavor: "Deals damage, charges rent." },
  { id: 8, name: "Ranger", baseDps: 78125, baseCost: 3000000, growth: 1.14, flavor: "DPS scales with trees." },
  { id: 9, name: "Berserker", baseDps: 390625, baseCost: 15000000, growth: 1.15, flavor: "Anger issues, great output." },
  { id: 10, name: "Archmage", baseDps: 1953125, baseCost: 80000000, growth: 1.16, flavor: "PhD in numbers going up." },
];

// ==========================
// Types
// ==========================
interface Enemy {
  maxHp: number;
  hp: number;
  isBoss: boolean;
  bossTimeLeft?: number;
}

interface HeroState {
  id: number;
  level: number;
}

interface SaveData {
  gold: number;
  lifetimeGold: number;
  clickLevel: number;
  floor: number;
  killsThisFloor: number;
  heroes: HeroState[];
  enemy: Enemy | null;
  lastSeen?: number;
}

const SAVE_KEY = "idle-clicker-save-v1";
function usePersistentState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch (e) {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
  }, [key, state]);
  return [state, setState] as const;
}

function FloatingNumber({ x, y, value, id }: { x: number; y: number; value: string; id: number }) {
  return (
    <motion.div
      key={id}
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 0, y: -40 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="pointer-events-none absolute text-xs font-bold drop-shadow -translate-x-1/2 select-none"
      style={{ left: x, top: y }}
    >
      {value}
    </motion.div>
  );
}

export default function App() {
  const [save, setSave] = usePersistentState<SaveData>(SAVE_KEY, {
    gold: 0,
    lifetimeGold: 0,
    clickLevel: 1,
    floor: 1,
    killsThisFloor: 0,
    heroes: HEROES.map((h) => ({ id: h.id, level: 0 })),
    enemy: null,
    lastSeen: Date.now(),
  });

  const [buyQty, setBuyQty] = useState<1 | 10 | 100>(1);
  const [expanded, setExpanded] = useState<boolean>(true);

  const [floaters, setFloaters] = useState<{ x: number; y: number; value: string; id: number }[]>([]);
  const floaterId = useRef(0);

  const [offlineReport, setOfflineReport] = useState<null | { seconds: number; kills: number; gold: number; floors: number }>(null);

  const clickDamage = useMemo(() => {
    return CLICK.baseDamage * Math.pow(CLICK.damageGrowth, save.clickLevel - 1);
  }, [save.clickLevel]);

  const heroesById = useMemo(() => Object.fromEntries(HEROES.map((h) => [h.id, h])), []);

  const totalDps = useMemo(() => {
    return save.heroes.reduce((sum, hs) => {
      const def = heroesById[hs.id] as any;
      return sum + def.baseDps * hs.level;
    }, 0);
  }, [save.heroes, heroesById]);

  useEffect(() => {
    if (!save.enemy) {
      setSave((s) => ({ ...s, enemy: makeEnemy(s.floor, false) }));
    }
  }, [save.enemy, setSave, save.floor]);

  useEffect(() => {
    const now = Date.now();
    const last = save.lastSeen ?? now;
    const elapsed = Math.max(0, Math.min((now - last) / 1000, OFFLINE.maxSeconds));
    if (elapsed < 1) return;
    setSave((s) => {
      const res = simulateOffline(s, elapsed);
      if (res.report.kills > 0 || res.report.gold > 0) {
        setOfflineReport(res.report);
      }
      return res.state;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastRef = useRef<number>(performance.now());
  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      setSave((state) => tick(state, dt));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [setSave]);

  function makeEnemy(floor: number, boss: boolean): Enemy {
    const base = ENEMY.baseHp * Math.pow(ENEMY.floorGrowth, floor - 1);
    const maxHp = boss ? base * ENEMY.bossMultiplier : base;
    return { maxHp, hp: maxHp, isBoss: boss, bossTimeLeft: boss ? ENEMY.bossTimeSeconds : undefined };
  }

  function goldRewardFor(enemy: Enemy, floor: number) {
    const base = enemy.maxHp * ENEMY.perKillGoldPct * (1 + floor * 0.02);
    return enemy.isBoss ? base * ENEMY.bossGoldMultiplier : base;
  }

  function tick(state: SaveData, dt: number): SaveData {
    let s = { ...state };
    s.lastSeen = Date.now();
    if (!s.enemy) return s;

    const dps = s.heroes.reduce((sum, hs) => {
      const def = heroesById[hs.id] as any;
      return sum + def.baseDps * hs.level;
    }, 0);
    if (dps > 0 && s.enemy.hp > 0) {
      s.enemy.hp = Math.max(0, s.enemy.hp - dps * dt);
    }

    if (s.enemy.isBoss && s.enemy.bossTimeLeft !== undefined) {
      s.enemy.bossTimeLeft = Math.max(0, s.enemy.bossTimeLeft - dt);
      if (s.enemy.bossTimeLeft === 0 && s.enemy.hp > 0) {
        const newFloor = Math.max(1, s.floor - 1);
        s.floor = newFloor;
        s.killsThisFloor = 0;
        s.enemy = makeEnemy(newFloor, false);
        return s;
      }
    }

    if (s.enemy.hp === 0) {
      const reward = goldRewardFor(s.enemy, s.floor);
      s.gold += reward;
      s.lifetimeGold += reward;

      if (s.enemy.isBoss) {
        s.floor += 1;
        s.killsThisFloor = 0;
        s.enemy = makeEnemy(s.floor, false);
      } else {
        const kills = s.killsThisFloor + 1;
        if (kills >= ENEMY.killsPerFloor) {
          s.killsThisFloor = ENEMY.killsPerFloor;
          s.enemy = makeEnemy(s.floor, true);
        } else {
          s.killsThisFloor = kills;
          s.enemy = makeEnemy(s.floor, false);
        }
      }
    }

    return s;
  }

  function simulateOffline(state: SaveData, seconds: number) {
    let s: SaveData = { ...state };
    if (!s.enemy) s.enemy = makeEnemy(s.floor, false);

    const dps = s.heroes.reduce((sum, hs) => {
      const def = heroesById[hs.id] as any;
      return sum + def.baseDps * hs.level;
    }, 0);

    let timeLeft = seconds;
    let kills = 0;
    let goldEarned = 0;
    let floorsCleared = 0;

    if (dps <= 0 || timeLeft <= 0) {
      s.lastSeen = Date.now();
      return { state: s, report: { seconds, kills: 0, gold: 0, floors: 0 } };
    }

    const onKill = (enemy: Enemy) => {
      const reward = goldRewardFor(enemy, s.floor);
      s.gold += reward;
      s.lifetimeGold += reward;
      goldEarned += reward;
      kills += 1;
      if (enemy.isBoss) {
        s.floor += 1;
        floorsCleared += 1;
        s.killsThisFloor = 0;
        s.enemy = makeEnemy(s.floor, false);
      } else {
        const k = s.killsThisFloor + 1;
        if (k >= ENEMY.killsPerFloor) {
          s.killsThisFloor = ENEMY.killsPerFloor;
          s.enemy = makeEnemy(s.floor, true);
        } else {
          s.killsThisFloor = k;
          s.enemy = makeEnemy(s.floor, false);
        }
      }
    };

    let safety = 200000;
    while (timeLeft > 0 && safety-- > 0 && s.enemy) {
      const enemy = s.enemy;

      if (!enemy.isBoss) {
        const timeToKill = enemy.hp / dps;
        if (enemy.hp < enemy.maxHp) {
          if (timeLeft >= timeToKill) {
            timeLeft -= timeToKill;
            onKill(enemy);
            continue;
          } else {
            enemy.hp = Math.max(0, enemy.hp - dps * timeLeft);
            timeLeft = 0;
            break;
          }
        } else {
          const remainingToBoss = ENEMY.killsPerFloor - s.killsThisFloor;
          const perKill = enemy.maxHp / dps;
          const canBulk = Math.min(Math.floor(timeLeft / perKill), remainingToBoss);
          if (canBulk >= 1) {
            timeLeft -= canBulk * perKill;
            for (let i = 0; i < canBulk; i++) onKill(enemy);
            continue;
          }
          if (timeLeft >= perKill) {
            timeLeft -= perKill;
            onKill(enemy);
            continue;
          } else {
            enemy.hp = Math.max(0, enemy.hp - dps * timeLeft);
            timeLeft = 0;
            break;
          }
        }
      } else {
        const timeToKill = enemy.hp / dps;
        const timeAvailable = Math.min(enemy.bossTimeLeft ?? ENEMY.bossTimeSeconds, timeLeft);
        if (timeToKill <= timeAvailable) {
          timeLeft -= timeToKill;
          onKill(enemy);
          continue;
        }
        if (timeLeft < (enemy.bossTimeLeft ?? 0)) {
          enemy.hp = Math.max(0, enemy.hp - dps * timeLeft);
          enemy.bossTimeLeft = (enemy.bossTimeLeft ?? 0) - timeLeft;
          timeLeft = 0;
          break;
        } else {
          const spend = enemy.bossTimeLeft ?? 0;
          timeLeft -= spend;
          const newFloor = Math.max(1, s.floor - 1);
          s.floor = newFloor;
          s.killsThisFloor = 0;
          s.enemy = makeEnemy(newFloor, false);
          continue;
        }
      }
    }

    s.lastSeen = Date.now();
    return { state: s, report: { seconds, kills, gold: goldEarned, floors: floorsCleared } };
  }

  function handleClick(e: React.MouseEvent) {
    if (!save.enemy || save.enemy.hp === 0) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setSave((s) => {
      if (!s.enemy) return s;
      const newEnemy = { ...s.enemy, hp: Math.max(0, s.enemy.hp - clickDamage) };
      let newGold = s.gold;
      let newLifetime = s.lifetimeGold;
      let newFloor = s.floor;
      let newKills = s.killsThisFloor;
      let nextEnemy: Enemy | null = newEnemy;

      if (newEnemy.hp === 0) {
        const reward = goldRewardFor(newEnemy, s.floor);
        newGold += reward;
        newLifetime += reward;
        if (newEnemy.isBoss) {
          newFloor = s.floor + 1;
          newKills = 0;
          nextEnemy = makeEnemy(newFloor, false);
        } else {
          const kills = s.killsThisFloor + 1;
          if (kills >= ENEMY.killsPerFloor) {
            newKills = ENEMY.killsPerFloor;
            nextEnemy = makeEnemy(s.floor, true);
          } else {
            newKills = kills;
            nextEnemy = makeEnemy(s.floor, false);
          }
        }
      }
      return { ...s, gold: newGold, lifetimeGold: newLifetime, enemy: nextEnemy, floor: newFloor, killsThisFloor: newKills };
    });

    const id = ++floaterId.current;
    setFloaters((arr) => [...arr, { x, y, value: `-${formatNumber(clickDamage, 0)}`, id }]);
    setTimeout(() => setFloaters((arr) => arr.filter((f) => f.id !== id)), 800);
  }

  function buyClickUpgrade(qty: number) {
    setSave((s) => {
      const cost = bulkCost(CLICK.baseCost, CLICK.growth, s.clickLevel - 1, qty);
      if (s.gold < cost) return s;
      return { ...s, gold: s.gold - cost, clickLevel: s.clickLevel + qty };
    });
  }

  function heroLevels(id: number) { return save.heroes.find((h) => h.id === id)?.level || 0; }

  function buyHeroLevels(heroId: number, qty: number) {
    const hero = HEROES.find((h) => h.id === heroId)!;
    const current = heroLevels(heroId);
    const cost = bulkCost(hero.baseCost, hero.growth, current, qty);
    setSave((s) => {
      if (s.gold < cost) return s;
      const heroes = s.heroes.map((hs) => (hs.id === heroId ? { ...hs, level: hs.level + qty } : hs));
      return { ...s, gold: s.gold - cost, heroes };
    });
  }

  function canAfford(amount: number) { return save.gold >= amount; }

  function resetProgress() {
    if (!confirm("Reset all progress?")) return;
    setSave({
      gold: 0, lifetimeGold: 0, clickLevel: 1, floor: 1, killsThisFloor: 0,
      heroes: HEROES.map((h) => ({ id: h.id, level: 0 })), enemy: makeEnemy(1, false),
    });
  }

  const enemyHpPct = save.enemy ? (100 * save.enemy.hp) / save.enemy.maxHp : 0;
  const bossTimerPct = save.enemy?.isBoss && save.enemy.bossTimeLeft !== undefined ? (100 * save.enemy.bossTimeLeft) / ENEMY.bossTimeSeconds : 0;
  const progressPct = (100 * clamp(save.killsThisFloor, 0, ENEMY.killsPerFloor)) / ENEMY.killsPerFloor;

  const buyQtyOptions: (1 | 10 | 100)[] = [1, 10, 100];

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-950 to-black text-slate-100 p-4">
      {offlineReport && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <Card className="max-w-md w-full bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle>While you were away…</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm">Time offline: {Math.floor(offlineReport.seconds)}s</div>
              <div className="text-sm">Enemies defeated: {formatNumber(offlineReport.kills, 0)}</div>
              <div className="text-sm">Floors cleared: {offlineReport.floors}</div>
              <div className="text-lg font-bold">Gold earned: {formatNumber(offlineReport.gold)}</div>
              <div className="pt-2">
                <Button onClick={() => setOfflineReport(null)}>Nice!</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-slate-800 backdrop-blur border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xl"><Coins className="h-5 w-5" /> Gold</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-black tracking-tight">{formatNumber(save.gold)}</CardContent>
          </Card>
          <Card className="bg-slate-800 backdrop-blur border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xl"><Sword className="h-5 w-5" /> Click Damage</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="text-3xl font-black">{formatNumber(clickDamage)}</div>
              <div className="flex items-center gap-2">
                {buyQtyOptions.map((q) => (
                  <Button key={q} variant={buyQty === q ? "default" : "secondary"} onClick={() => setBuyQty(q)} size="sm">
                    x{q}
                  </Button>
                ))}
                <Button onClick={() => buyClickUpgrade(buyQty)}>
                  Upgrade ({formatNumber(bulkCost(CLICK.baseCost, CLICK.growth, save.clickLevel - 1, buyQty))})
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800 backdrop-blur border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xl"><Zap className="h-5 w-5" /> Passive DPS</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-black tracking-tight">{formatNumber(totalDps)}</CardContent>
          </Card>
        </div>

        <Card className="xl:col-span-2 bg-slate-800 border-slate-700 overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="text-base px-3 py-1 rounded-xl">Floor {save.floor}</Badge>
              <div className="flex items-center gap-2 text-sm text-slate-200">
                <span>Defeated:</span>
                <span className="font-semibold">{clamp(save.killsThisFloor, 0, ENEMY.killsPerFloor)} / {ENEMY.killsPerFloor}</span>
              </div>
              {save.enemy?.isBoss ? (
                <div className="flex items-center gap-2 text-sm"><Timer className="h-4 w-4" /> <span>{save.enemy.bossTimeLeft?.toFixed(1)}s</span></div>
              ) : (
                <div className="text-sm text-slate-300">Kill {ENEMY.killsPerFloor} enemies to summon a Boss</div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-200">{save.enemy?.isBoss ? "Boss" : "Enemy"}</span>
                <span className="font-mono">{save.enemy ? `${formatNumber(save.enemy.hp)} / ${formatNumber(save.enemy.maxHp)}` : "--"}</span>
              </div>
              <Progress value={enemyHpPct} className="h-3" />
            </div>

            {save.enemy?.isBoss && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-200">Boss Timer</span>
                  <span className="font-mono">{save.enemy?.bossTimeLeft?.toFixed(1)}s</span>
                </div>
                <Progress value={bossTimerPct} className="h-2" />
              </div>
            )}

            <div className="relative select-none">
              <motion.div
                onClick={handleClick}
                whileTap={{ scale: 0.98 }}
                className="relative w-full aspect-video rounded-2xl bg-gradient-to-br from-purple-500/20 via-fuchsia-500/10 to-cyan-500/20 border border-slate-700 flex items-center justify-center cursor-pointer overflow-hidden"
              >
                <motion.div
                  key={`${save.floor}-${save.killsThisFloor}-${save.enemy?.isBoss ? "boss" : "mob"}`}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="w-44 h-44 rounded-full bg-gradient-to-tr from-slate-300/90 to-white/80 shadow-xl border border-white/40 flex items-center justify-center text-slate-900 font-black text-2xl"
                >
                  {save.enemy?.isBoss ? "BOSS" : "ENEMY"}
                </motion.div>

                <AnimatePresence>
                  {floaters.map((f) => (
                    <FloatingNumber key={f.id} {...f} />
                  ))}
                </AnimatePresence>
              </motion.div>

              <div className="mt-3">
                <Progress value={progressPct} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700 flex flex-col">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xl">Tavern of Heroes</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="icon" onClick={() => setExpanded((v) => !v)}>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
              <Button variant="destructive" size="icon" onClick={resetProgress} title="Reset Progress">
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-200">Buy quantity:</div>
              <div className="flex gap-2">
                {buyQtyOptions.map((q) => (
                  <Button key={q} variant={buyQty === q ? "default" : "secondary"} size="sm" onClick={() => setBuyQty(q)}>
                    x{q}
                  </Button>
                ))}
              </div>
            </div>

            <ScrollArea className="h-[520px] pr-2">
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-700 bg-slate-700 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold flex items-center gap-2"><Sword className="h-4 w-4" /> Your Hero</div>
                      <div className="text-xs text-slate-300">Per-click damage upgrades</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-300">Lvl {save.clickLevel}</div>
                      <div className="text-sm">DMG {formatNumber(clickDamage)}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    {[1, 10, 100].map((q) => (
                      <Button key={q} onClick={() => buyClickUpgrade(q)} disabled={!canAfford(bulkCost(CLICK.baseCost, CLICK.growth, save.clickLevel - 1, q))}>
                        Buy +{q} ({formatNumber(bulkCost(CLICK.baseCost, CLICK.growth, save.clickLevel - 1, q))})
                      </Button>
                    ))}
                  </div>
                </div>

                {HEROES.map((h) => {
                  const level = heroLevels(h.id);
                  const dps = h.baseDps * level;
                  const unlockable = save.lifetimeGold >= h.baseCost * 0.8;
                  const cost1 = bulkCost(h.baseCost, h.growth, level, 1);
                  const costQ = bulkCost(h.baseCost, h.growth, level, buyQty);

                  return (
                    <div key={h.id} className={`rounded-2xl border p-3 ${unlockable ? "border-slate-700 bg-slate-700" : "border-slate-700 bg-slate-700/70 text-slate-300"}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold">{h.name}</div>
                          <div className="text-xs text-slate-300">{h.flavor}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-300">Lvl {level}</div>
                          <div className="text-sm">DPS {formatNumber(dps)}</div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button onClick={() => buyHeroLevels(h.id, 1)} disabled={!unlockable || !canAfford(cost1)}>
                          +1 ({formatNumber(cost1)})
                        </Button>
                        <Button variant="secondary" onClick={() => buyHeroLevels(h.id, buyQty)} disabled={!unlockable || !canAfford(costQ)}>
                          +{buyQty} ({formatNumber(costQ)})
                        </Button>
                      </div>
                      {!unlockable && (
                        <div className="mt-2 text-xs text-slate-300">Unlocks when lifetime gold ≥ {formatNumber(h.baseCost * 0.8)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="xl:col-span-3 text-center text-slate-400 text-xs mt-2">
          Tip: Buy a few levels of early heroes to build DPS, then tackle bosses! Your progress saves automatically.
        </div>
      </div>
    </div>
  );
}
