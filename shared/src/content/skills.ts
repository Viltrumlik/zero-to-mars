import type { Skill, SkillId } from '../types.ts';

export const SKILLS: Skill[] = [
  {
    id: 'code',
    icon: '💻',
    name: { uz: 'Dasturlash', ru: 'Программирование', en: 'Coding' },
    desc: { uz: "Dasturlash ishlari va o'yin yozish", ru: 'Работа программистом и свои игры', en: 'Coding jobs and writing games' },
  },
  {
    id: 'biz',
    icon: '📈',
    name: { uz: 'Biznes', ru: 'Бизнес', en: 'Business' },
    desc: { uz: 'Biznes daromadi +5% har darajada', ru: 'Доход бизнеса +5% за уровень', en: '+5% business income per level' },
  },
  {
    id: 'eng',
    icon: '⚙️',
    name: { uz: 'Muhandislik', ru: 'Инженерия', en: 'Engineering' },
    desc: { uz: "Ta'mirlash, raketalar (+4% omad)", ru: 'Ремонт, ракеты (+4% успеха)', en: 'Repairs, rockets (+4% success)' },
  },
  {
    id: 'fit',
    icon: '🏋️',
    name: { uz: 'Sport', ru: 'Спорт', en: 'Fitness' },
    desc: { uz: 'Maks. energiya +6, tezroq yugurasiz', ru: 'Макс. энергия +6, бег быстрее', en: '+6 max energy, run faster' },
  },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, Skill>;
