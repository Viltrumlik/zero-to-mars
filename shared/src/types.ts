export type Lang = 'uz' | 'ru' | 'en';
export const LANGS: Lang[] = ['uz', 'ru', 'en'];

/** A string in every supported language. */
export type T = Record<Lang, string>;

export type SkillId = 'code' | 'biz' | 'eng' | 'fit';
export type ItemId = 'bike' | 'phone' | 'computer' | 'student' | 'laptop' | 'scooter' | 'car';
export type MiniGameKind = 'route' | 'change' | 'memory' | 'code' | 'scrub';

export type BuildingId =
  | 'home'
  | 'library'
  | 'market'
  | 'cafe'
  | 'kiosk'
  | 'carwash'
  | 'post'
  | 'electronics'
  | 'bikeshop'
  | 'netcafe'
  | 'gym'
  | 'hospital'
  | 'airport'
  | 'university'
  | 'boiler'
  | 'pizzeria'
  | 'bizcenter'
  | 'bank'
  | 'company'
  | 'launchpad';

export type BuildingKind =
  | 'shop'
  | 'house'
  | 'server'
  | 'tower'
  | 'factory'
  | 'dish'
  | 'lab'
  | 'panel'
  | 'hangar'
  | 'tunnel'
  | 'dome';

export interface Milestone {
  title: T;
  text: T;
  button: T;
  cashBonus: number;
}

export interface Era {
  id: number;
  key: string;
  icon: string;
  title: T;
  subtitle: T;
  startAge: number;
  endAge: number;
  /** Typical wage of one shift: scales event rewards and daily bonuses. */
  unit: number;
  /** Paid every night you sleep. */
  rent: number;
  /** Bill when you collapse and wake up in hospital. */
  hospital: number;
  homeName: T;
  companyName: T;
  launchCost: number;
  sky: [string, string];
  ground: string;
  milestone: Milestone | null;
}

export interface Building {
  id: BuildingId;
  icon: string;
  name: T;
  desc: T;
  minEra: number;
  maxEra: number;
  /** Opening hours [from, to) in game hours. */
  open: [number, number];
}

export interface Requirements {
  minAge?: number;
  items?: ItemId[];
  anyItem?: ItemId[];
  skills?: Partial<Record<SkillId, number>>;
}

export interface Job extends Requirements {
  id: string;
  building: BuildingId;
  eras: [number, number];
  icon: string;
  name: T;
  hours: number;
  pay: number;
  energy: number;
  hunger: number;
  game: MiniGameKind;
  difficulty: number;
  /** Number of drop-offs for route jobs. */
  stops?: number;
  /** Primary skill: +4 % pay per level. */
  skill?: SkillId;
  xp?: Partial<Record<SkillId, number>>;
  rd?: number;
  once?: boolean;
}

export interface ShopItem extends Requirements {
  id: string;
  building: BuildingId;
  eras: [number, number];
  icon: string;
  name: T;
  desc: T;
  price: number;
  item?: ItemId;
  hunger?: number;
  energy?: number;
  health?: number;
  minutes?: number;
  oncePerDay?: boolean;
}

export interface Study extends Requirements {
  id: string;
  building: BuildingId;
  eras: [number, number];
  icon: string;
  name: T;
  skill: SkillId;
  xp: number;
  hours: number;
  energy: number;
  hunger: number;
  price: number;
}

export interface Business {
  id: string;
  era: number;
  icon: string;
  name: T;
  baseCost: number;
  /** $ per real hour at level 1 (before INCOME_SCALE). */
  baseIncome: number;
  kind: BuildingKind;
  color: string;
}

export interface Skill {
  id: SkillId;
  icon: string;
  name: T;
  desc: T;
}

export interface Cond {
  flag?: string;
  cash?: number;
  netWorth?: number;
  item?: ItemId;
  skills?: Partial<Record<SkillId, number>>;
  job?: [string, number];
  jobs?: number;
  meals?: number;
  sleeps?: number;
  age?: number;
  bizTotal?: number;
  bizId?: [string, number];
  launchOk?: number;
  colonists?: number;
}

export interface Quest {
  id: string;
  era: number;
  icon: string;
  title: T;
  story: T;
  target?: BuildingId;
  cond: Cond;
  reward?: { cash?: number; item?: ItemId };
  /** Cash paid when the quest is completed (e.g. a plane ticket). */
  cost?: number;
  advanceEra?: boolean;
}

export interface Effects {
  /** Money in era wage units (see engine.unit). Negative = loss. */
  money?: number;
  /** Fraction of current cash, e.g. -0.3 loses 30 %. */
  cashPct?: number;
  rep?: number;
  energy?: number;
  health?: number;
  rd?: number;
  boost?: { mult: number; minutes: number };
}

export interface Choice {
  label: T;
  effects?: Effects;
  risk?: { chance: number; win: Effects; lose: Effects };
}

export interface GameEvent {
  id: string;
  minEra: number;
  maxEra: number;
  icon: string;
  title: T;
  text: T;
  choices: Choice[];
  once?: boolean;
  requiresBiz?: string;
  requiresFails?: number;
}

export interface Stats {
  jobs: number;
  meals: number;
  sleeps: number;
  studies: number;
  hospital: number;
}

export interface GameState {
  v: 2;
  name: string;
  createdAt: number;
  /** Real-time clock (ms) of the last processed action. */
  lastTick: number;
  /** In-game calendar: day 1 is the first day, minute is 0..1439. */
  day: number;
  minute: number;
  cash: number;
  /** Book value of businesses bought (counts toward net worth). */
  spent: number;
  totalEarned: number;
  energy: number;
  hunger: number;
  health: number;
  era: number;
  reputation: number;
  skills: Record<SkillId, number>;
  xp: Record<SkillId, number>;
  items: ItemId[];
  biz: Record<string, number>;
  boost: { mult: number; until: number } | null;
  rng: number;
  event: string | null;
  /** Absolute game minute when the next random event may happen. */
  nextEventAt: number;
  seen: string[];
  job: { id: string; startedAt: number } | null;
  quest: number;
  flags: Record<string, number>;
  jobCounts: Record<string, number>;
  stats: Stats;
  lastSleepAt: number;
  rd: number;
  launches: number;
  launchOk: number;
  launchFail: number;
  eraLaunchOk: number;
  nextLaunchAt: number;
  colonists: number;
  daily: { day: string; streak: number };
  billionaireAt: number | null;
}

export type Action =
  | { t: 'visit'; b: string; at: number }
  | { t: 'jobStart'; id: string; at: number }
  | { t: 'jobEnd'; id: string; score: number; at: number }
  | { t: 'study'; id: string; at: number }
  | { t: 'buy'; id: string; at: number }
  | { t: 'sleep'; at: number }
  | { t: 'rest'; at: number }
  | { t: 'invest'; id: string; at: number }
  | { t: 'quest'; at: number }
  | { t: 'choose'; id: string; c: number; at: number }
  | { t: 'launch'; at: number }
  | { t: 'daily'; at: number }
  | { t: 'name'; name: string; at: number };

export interface EffectSummary {
  cash: number;
  rep: number;
  energy: number;
  health: number;
  hunger: number;
  rd: number;
  xp: Partial<Record<SkillId, number>>;
  levelUps: SkillId[];
  boost: { mult: number; minutes: number } | null;
  minutes: number;
}

export interface Outcome {
  ok: boolean;
  err?: string;
  win?: boolean;
  score?: number;
  summary?: EffectSummary;
}
