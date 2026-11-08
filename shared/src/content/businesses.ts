import type { Business } from '../types.ts';

/** Passive-income investments, available from the CityMap era (2) onward. */
export const BUSINESSES: Business[] = [
  // Era 2: CityMap
  { id: 'citymap', era: 2, icon: '🗺️', kind: 'server', color: '#30cfd0', baseCost: 5_000, baseIncome: 1_500,
    name: { uz: 'CityMap serverlari', ru: 'Серверы CityMap', en: 'CityMap servers' } },
  { id: 'news', era: 2, icon: '📰', kind: 'tower', color: '#c3cfe2', baseCost: 15_000, baseIncome: 4_200,
    name: { uz: 'Gazeta hamkorliklari', ru: 'Партнёрства с газетами', en: 'Newspaper deals' } },
  { id: 'ads', era: 2, icon: '📡', kind: 'dish', color: '#f093fb', baseCost: 40_000, baseIncome: 10_500,
    name: { uz: "Reklama tarmog'i", ru: 'Рекламная сеть', en: 'Ad network' } },
  { id: 'devteam', era: 2, icon: '👩‍💻', kind: 'tower', color: '#5ee7df', baseCost: 100_000, baseIncome: 24_000,
    name: { uz: 'Muhandislar jamoasi', ru: 'Команда инженеров', en: 'Engineering team' } },

  // Era 3: PayNova
  { id: 'paynova', era: 3, icon: '💳', kind: 'tower', color: '#667eea', baseCost: 1_500_000, baseIncome: 300_000,
    name: { uz: "PayNova to'lovlari", ru: 'Платежи PayNova', en: 'PayNova payments' } },
  { id: 'wallet', era: 3, icon: '👛', kind: 'server', color: '#764ba2', baseCost: 4_000_000, baseIncome: 760_000,
    name: { uz: 'Elektron hamyon', ru: 'Электронный кошелёк', en: 'E-wallet' } },
  { id: 'antifraud', era: 3, icon: '🛡️', kind: 'lab', color: '#00c9ff', baseCost: 10_000_000, baseIncome: 1_800_000,
    name: { uz: 'Firibgarlikka qarshi AI', ru: 'Антифрод ИИ', en: 'Anti-fraud AI' } },
  { id: 'global', era: 3, icon: '🌍', kind: 'dish', color: '#92fe9d', baseCost: 25_000_000, baseIncome: 4_200_000,
    name: { uz: 'Xalqaro filiallar', ru: 'Международные филиалы', en: 'Global offices' } },

  // Era 4: the big bet
  { id: 'sungrid', era: 4, icon: '☀️', kind: 'panel', color: '#f9d423', baseCost: 40_000_000, baseIncome: 6_000_000,
    name: { uz: 'SunGrid quyosh panellari', ru: 'Солнечные панели SunGrid', en: 'SunGrid solar' } },
  { id: 'voltra', era: 4, icon: '🚗', kind: 'factory', color: '#e74c3c', baseCost: 90_000_000, baseIncome: 13_000_000,
    name: { uz: 'Voltra elektromobil zavodi', ru: 'Завод электромобилей Voltra', en: 'Voltra EV factory' } },
  { id: 'orbitra', era: 4, icon: '🛰️', kind: 'hangar', color: '#dfe6e9', baseCost: 150_000_000, baseIncome: 21_000_000,
    name: { uz: 'Orbitra raketa sexi', ru: 'Ракетный цех Orbitra', en: 'Orbitra rocket works' } },
  { id: 'battery', era: 4, icon: '🔋', kind: 'factory', color: '#2ecc71', baseCost: 300_000_000, baseIncome: 40_000_000,
    name: { uz: 'Batareya gigazavodi', ru: 'Гигафабрика батарей', en: 'Battery gigafactory' } },

  // Era 5: empire
  { id: 'boreco', era: 5, icon: '🕳️', kind: 'tunnel', color: '#95a5a6', baseCost: 2_000_000_000, baseIncome: 250_000_000,
    name: { uz: 'BoreCo tunnellari', ru: 'Тоннели BoreCo', en: 'BoreCo tunnels' } },
  { id: 'starnet', era: 5, icon: '📶', kind: 'dish', color: '#74b9ff', baseCost: 6_000_000_000, baseIncome: 680_000_000,
    name: { uz: "StarNet sun'iy yo'ldosh interneti", ru: 'Спутниковый интернет StarNet', en: 'StarNet satellite internet' } },
  { id: 'neuro', era: 5, icon: '🧠', kind: 'lab', color: '#fd79a8', baseCost: 15_000_000_000, baseIncome: 1_500_000_000,
    name: { uz: 'NeuroBridge laboratoriyasi', ru: 'Лаборатория NeuroBridge', en: 'NeuroBridge lab' } },
  { id: 'ai', era: 5, icon: '🤖', kind: 'server', color: '#a29bfe', baseCost: 40_000_000_000, baseIncome: 3_600_000_000,
    name: { uz: "Sun'iy intellekt markazi", ru: 'Центр ИИ', en: 'AI supercluster' } },
  { id: 'social', era: 5, icon: '🐦', kind: 'tower', color: '#0984e3', baseCost: 44_000_000_000, baseIncome: 3_300_000_000,
    name: { uz: 'Ijtimoiy tarmoq', ru: 'Социальная сеть', en: 'Social network' } },

  // Era 6: Mars
  { id: 'starship', era: 6, icon: '🚀', kind: 'hangar', color: '#b2bec3', baseCost: 150_000_000_000, baseIncome: 10_000_000_000,
    name: { uz: 'Mars kemalari flotiliyasi', ru: 'Флот марсианских кораблей', en: 'Mars ship fleet' } },
  { id: 'marsbase', era: 6, icon: '🏕️', kind: 'dome', color: '#fab1a0', baseCost: 400_000_000_000, baseIncome: 25_000_000_000,
    name: { uz: 'Mars bazasi', ru: 'Марсианская база', en: 'Mars base' } },
  { id: 'robots', era: 6, icon: '🦾', kind: 'factory', color: '#dfe6e9', baseCost: 900_000_000_000, baseIncome: 50_000_000_000,
    name: { uz: 'Gumanoid robotlar', ru: 'Человекоподобные роботы', en: 'Humanoid robots' } },
  { id: 'marscity', era: 6, icon: '🌆', kind: 'dome', color: '#ffeaa7', baseCost: 2_500_000_000_000, baseIncome: 120_000_000_000,
    name: { uz: 'Mars shahri', ru: 'Город на Марсе', en: 'Mars city' } },
];

export const BIZ_BY_ID: Record<string, Business> = Object.fromEntries(BUSINESSES.map((b) => [b.id, b]));
