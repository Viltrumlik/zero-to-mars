import type { GameEvent, T } from '../types.ts';

const L = (uz: string, ru: string, en: string): T => ({ uz, ru, en });

const SKIP = L("Kerak emas", 'Пропустить', 'Pass');

/**
 * Random life events. Money is expressed in "hours of earning power" so the
 * same event stays meaningful in every era.
 */
export const EVENTS: GameEvent[] = [
  {
    id: 'old_pc', minEra: 0, maxEra: 1, icon: '🖥️',
    title: L('Eski kompyuter', 'Старый компьютер', 'An old computer'),
    text: L(
      "Qo'shningiz eski kompyuterini arzonga sotmoqchi. Ta'mirlab, qimmatroq sotsa bo'ladi... yoki u butunlay buzuq.",
      'Сосед дёшево продаёт старый компьютер. Можно починить и перепродать... или он совсем мёртвый.',
      'Your neighbour is selling an old PC cheap. Fix it and flip it... or it might be dead for good.'),
    choices: [
      { label: L("Sotib olib ta'mirlash", 'Купить и починить', 'Buy and fix it'),
        risk: { chance: 0.6, win: { money: 2, rep: 2 }, lose: { money: -0.5 } } },
      { label: SKIP },
    ],
  },
  {
    id: 'rocket_book', minEra: 0, maxEra: 2, icon: '📚',
    title: L('Kosmos haqida kitob', 'Книга о космосе', 'A book about space'),
    text: L(
      "Kutubxonada raketalar va fizika haqida qalin kitob topdingiz. Tun bo'yi o'qisangiz, ertaga charchaysiz.",
      'В библиотеке вы нашли толстую книгу о ракетах и физике. Если читать всю ночь, завтра будете уставшим.',
      'You found a thick book on rockets and physics. Read all night and you will be tired tomorrow.'),
    choices: [
      { label: L("Tun bo'yi o'qish", 'Читать всю ночь', 'Read all night'), effects: { rd: 1, rep: 2, energy: -25 } },
      { label: L("Video o'yin o'ynash", 'Поиграть в игры', 'Play video games'), effects: { energy: 35 } },
    ],
  },
  {
    id: 'bullies', minEra: 0, maxEra: 0, icon: '😠', once: true,
    title: L('Maktabdagi bezorilar', 'Школьные хулиганы', 'School bullies'),
    text: L(
      "Maktabda sizni \"kitob qurti\" deb mazax qilishmoqda. Qanday javob berasiz?",
      'В школе вас дразнят «ботаником». Как ответите?',
      'Kids at school mock you as a "bookworm". How do you respond?'),
    choices: [
      { label: L('Sportga yozilish', 'Записаться на спорт', 'Join a sports club'), effects: { energy: 45, rep: 3 } },
      { label: L("Kodga sho'ng'ish", 'Уйти в код', 'Dive into code'), effects: { rd: 1, boost: { mult: 1.5, minutes: 20 } } },
    ],
  },
  {
    id: 'contest', minEra: 0, maxEra: 1, icon: '🏆',
    title: L('Dasturlash tanlovi', 'Конкурс программистов', 'Coding contest'),
    text: L(
      "Shahar dasturlash tanloviga taklif qilindingiz. G'olibga pul mukofoti, yutqazganga uyat.",
      'Вас пригласили на городской конкурс программистов. Победителю деньги, проигравшему стыд.',
      'You are invited to the city coding contest. Cash for the winner, shame for the loser.'),
    choices: [
      { label: L('Qatnashish', 'Участвовать', 'Compete'),
        risk: { chance: 0.5, win: { money: 3, rep: 6 }, lose: { rep: -3 } } },
      { label: SKIP },
    ],
  },
  {
    id: 'farm_job', minEra: 1, maxEra: 1, icon: '🌾',
    title: L('Yozgi ish', 'Летняя работа', 'Summer job'),
    text: L(
      "Qarindoshingiz fermasida yozgi ish taklif qilmoqda: og'ir, lekin yaxshi to'laydi.",
      'Родственник предлагает летнюю работу на ферме: тяжело, но хорошо платят.',
      "A relative offers a summer job on their farm: hard work, but it pays well."),
    choices: [
      { label: L('Rozi bo\'lish', 'Согласиться', 'Take it'), effects: { money: 2, energy: -30 } },
      { label: L("Kutubxonada o'qish", 'Учиться в библиотеке', 'Study at the library'), effects: { rd: 1, rep: 2 } },
    ],
  },
  {
    id: 'dorm_party', minEra: 1, maxEra: 1, icon: '🎉',
    title: L('Yotoqxona bazmi', 'Вечеринка в общаге', 'Dorm party'),
    text: L(
      "Do'stlar katta bazm o'tkazishni taklif qilmoqda: kirish pullik. Pul ham, muammo ham bo'lishi mumkin.",
      'Друзья предлагают устроить большую платную вечеринку. Можно заработать, а можно влипнуть.',
      'Friends want to throw a big paid-entry party. Could make money, could make trouble.'),
    choices: [
      { label: L('Bazm tashkil qilish', 'Устроить вечеринку', 'Throw the party'),
        risk: { chance: 0.7, win: { money: 3, rep: 3 }, lose: { money: -1, rep: -4 } } },
      { label: L('Uxlash', 'Выспаться', 'Get some sleep'), effects: { energy: 60 } },
    ],
  },
  {
    id: 'internship', minEra: 1, maxEra: 2, icon: '💼',
    title: L('Amaliyot taklifi', 'Предложение стажировки', 'Internship offer'),
    text: L(
      "Yirik texnologiya kompaniyasi sizni amaliyotga chaqirmoqda. Barqaror maosh yoki o'z loyihangiz?",
      'Крупная техкомпания зовёт на стажировку. Стабильная зарплата или свой проект?',
      'A big tech company wants you as an intern. Steady pay or your own project?'),
    choices: [
      { label: L('Amaliyotga borish', 'Пойти на стажировку', 'Take the internship'), effects: { money: 1.5, rep: 3 } },
      { label: L("O'z loyiham", 'Свой проект', 'My own project'), effects: { boost: { mult: 1.5, minutes: 30 } } },
    ],
  },
  {
    id: 'investor', minEra: 2, maxEra: 3, icon: '🤝',
    title: L('Investor keldi', 'Пришёл инвестор', 'An investor appears'),
    text: L(
      "Venchur investor ulush evaziga katta pul taklif qilmoqda. Lekin u nazoratni ham xohlaydi.",
      'Венчурный инвестор предлагает крупную сумму за долю. Но он хочет и контроль.',
      'A VC offers big money for equity. But they want control, too.'),
    choices: [
      { label: L('Pulni olish', 'Взять деньги', 'Take the money'), effects: { money: 5, rep: -2 } },
      { label: L('Nazoratni saqlash', 'Сохранить контроль', 'Keep control'), effects: { rep: 6, boost: { mult: 1.3, minutes: 60 } } },
    ],
  },
  {
    id: 'server_crash', minEra: 2, maxEra: 3, icon: '🔥',
    title: L('Serverlar quladi', 'Серверы упали', 'Servers are down'),
    text: L(
      "Yarim tunda serverlar ishdan chiqdi, mijozlar shikoyat qilmoqda.",
      'Посреди ночи упали серверы, клиенты жалуются.',
      'Servers crashed at midnight and customers are furious.'),
    choices: [
      { label: L("Tun bo'yi o'zim tuzataman", 'Чиню сам всю ночь', 'Fix it myself all night'), effects: { energy: -45, rep: 5, rd: 1 } },
      { label: L('Pudratchiga berish', 'Отдать подрядчику', 'Hire contractors'), effects: { money: -1, rep: 1 } },
    ],
  },
  {
    id: 'ceo_coup', minEra: 2, maxEra: 4, icon: '🗡️',
    title: L('Direktorlar kengashi', 'Совет директоров', 'Board coup'),
    text: L(
      "Kengash sizni bosh direktorlikdan chetlatmoqchi. Kurashasizmi yoki taslim bo'lasizmi?",
      'Совет директоров хочет снять вас с поста CEO. Будете бороться или уступите?',
      'The board wants to remove you as CEO. Fight back or step aside?'),
    choices: [
      { label: L('Kurashish', 'Бороться', 'Fight'),
        risk: { chance: 0.5, win: { rep: 8, boost: { mult: 1.5, minutes: 60 } }, lose: { rep: -8, money: -1 } } },
      { label: L('Texnik direktor bo\'lib qolish', 'Остаться техдиректором', 'Stay on as CTO'), effects: { money: 2, rep: -3 } },
    ],
  },
  {
    id: 'vacation', minEra: 3, maxEra: 4, icon: '🏝️',
    title: L("Uzoq kutilgan ta'til", 'Долгожданный отпуск', 'A long-overdue vacation'),
    text: L(
      "Yillardan beri dam olmadingiz. Ta'tilga chiqsangiz, kompaniyada nimadir yuz berishi mumkin...",
      'Вы годами не отдыхали. Но пока вы в отпуске, в компании может что-то случиться...',
      "You haven't rested in years. But while you're away, something could happen at the company..."),
    choices: [
      { label: L("Ta'tilga chiqish", 'Уйти в отпуск', 'Go on vacation'),
        risk: { chance: 0.6, win: { energy: 60, rep: 2 }, lose: { money: -1, rep: -6 } } },
      { label: L('Ishlashda davom etish', 'Продолжать работать', 'Keep working'), effects: { money: 1, energy: -30 } },
    ],
  },
  {
    id: 'fraud', minEra: 3, maxEra: 3, icon: '🕵️',
    title: L('Firibgarlar hujumi', 'Атака мошенников', 'Fraud attack'),
    text: L(
      "Firibgarlar tizimingizdan har kuni millionlab dollar o'g'irlamoqda.",
      'Мошенники ежедневно выводят из системы миллионы долларов.',
      'Fraudsters are siphoning millions from your system every day.'),
    choices: [
      { label: L('AI himoyaga sarmoya', 'Инвестировать в ИИ-защиту', 'Invest in AI defense'), effects: { money: -1.5, boost: { mult: 1.5, minutes: 120 }, rd: 1 } },
      { label: L("E'tibor bermaslik", 'Игнорировать', 'Ignore it'),
        risk: { chance: 0.4, win: { money: 1 }, lose: { cashPct: -0.2, rep: -5 } } },
    ],
  },
  {
    id: 'merger', minEra: 3, maxEra: 3, icon: '🔀',
    title: L('Raqib bilan birlashish', 'Слияние с конкурентом', 'Merge with a rival'),
    text: L(
      "Asosiy raqibingiz birlashishni taklif qilmoqda. Kuchliroq bo'lasiz, lekin hokimiyatni bo'lishasiz.",
      'Главный конкурент предлагает слияние. Станете сильнее, но придётся делить власть.',
      'Your main rival proposes a merger. Stronger together, but you must share power.'),
    choices: [
      { label: L('Birlashish', 'Объединиться', 'Merge'), effects: { money: 3, rep: -2 } },
      { label: L('Raqobatni davom ettirish', 'Продолжить войну', 'Keep competing'),
        risk: { chance: 0.5, win: { rep: 5, boost: { mult: 2, minutes: 60 } }, lose: { money: -2 } } },
    ],
  },
  {
    id: 'bankrupt', minEra: 4, maxEra: 4, icon: '💥', once: true, requiresFails: 1,
    title: L('Bankrotlik yoqasida', 'На грани банкротства', 'On the edge of bankruptcy'),
    text: L(
      "Raketa portladi, Voltra'ning puli tugamoqda. Oxirgi pulingizni qayerga tikasiz?",
      'Ракета взорвалась, у Voltra кончаются деньги. Куда поставите последние деньги?',
      'A rocket exploded and Voltra is running out of cash. Where do you put your last dollars?'),
    choices: [
      { label: L('Ikkalasiga ham hammasini', 'Всё в обе компании', 'Everything into both'),
        risk: { chance: 0.65, win: { money: 6, rep: 12, boost: { mult: 2, minutes: 120 } }, lose: { cashPct: -0.5, rep: -10 } } },
      { label: L("Faqat Voltra'ni qutqarish", 'Спасти только Voltra', 'Save only Voltra'), effects: { money: 2, rep: -2 } },
      { label: L('Investorlardan qarz olish', 'Занять у инвесторов', 'Borrow from investors'), effects: { money: 3, rep: -4 } },
    ],
  },
  {
    id: 'gov_contract', minEra: 4, maxEra: 5, icon: '📝', requiresBiz: 'orbitra',
    title: L('Davlat kontrakti', 'Госконтракт', 'Government contract'),
    text: L(
      "Kosmik agentlik stansiyaga yuk tashish uchun kontrakt taklif qilmoqda.",
      'Космическое агентство предлагает контракт на доставку грузов на станцию.',
      'The space agency offers a contract to fly cargo to the station.'),
    choices: [
      { label: L('Imzolash', 'Подписать', 'Sign it'), effects: { money: 4, rep: 6 } },
      { label: L("Ko'proq so'rash", 'Поторговаться', 'Ask for more'),
        risk: { chance: 0.5, win: { money: 8, rep: 2 }, lose: { rep: -4 } } },
    ],
  },
  {
    id: 'recall', minEra: 4, maxEra: 5, icon: '🚨', requiresBiz: 'voltra',
    title: L('Nosozlik topildi', 'Найден дефект', 'Defect found'),
    text: L(
      "Voltra mashinalarida nosozlik topildi. Jurnalistlar allaqachon yozishmoqda.",
      'В машинах Voltra нашли дефект. Журналисты уже пишут.',
      'A defect was found in Voltra cars. Journalists are already writing.'),
    choices: [
      { label: L('Hammasini bepul tuzatish', 'Бесплатно починить всё', 'Fix them all for free'), effects: { money: -2, rep: 8 } },
      { label: L('Masofadan yangilash', 'Обновить по воздуху', 'Over-the-air update'),
        risk: { chance: 0.7, win: { rep: 4, boost: { mult: 1.3, minutes: 60 } }, lose: { rep: -10 } } },
    ],
  },
  {
    id: 'short_sellers', minEra: 4, maxEra: 6, icon: '📉',
    title: L('Shortchilar hujumi', 'Атака шортистов', 'Short-seller attack'),
    text: L(
      "Birja o'yinchilari aksiyalaringiz qulashiga katta pul tikishdi.",
      'Биржевые игроки поставили крупные суммы на падение ваших акций.',
      'Wall Street traders made huge bets that your stock will crash.'),
    choices: [
      { label: L('Ochiq javob berish', 'Ответить публично', 'Fire back publicly'),
        risk: { chance: 0.5, win: { money: 5, rep: 3 }, lose: { money: -2, rep: -8 } } },
      { label: L('Jim turib ishlash', 'Молча работать', 'Stay quiet and ship'), effects: { boost: { mult: 1.5, minutes: 120 } } },
    ],
  },
  {
    id: 'night_post', minEra: 5, maxEra: 6, icon: '🌙',
    title: L('Tungi post', 'Ночной пост', 'The 3 AM post'),
    text: L(
      "Soat 3 da miyangizga juda \"ajoyib\" g'oya keldi. Uni hoziroq ijtimoiy tarmoqqa yozasizmi?",
      'В 3 часа ночи вам пришла «гениальная» мысль. Опубликовать её прямо сейчас?',
      'At 3 AM you get a "brilliant" idea. Post it to the world right now?'),
    choices: [
      { label: L('Yozish', 'Опубликовать', 'Post it'),
        risk: { chance: 0.45, win: { rep: 10, money: 3 }, lose: { rep: -12, cashPct: -0.1 } } },
      { label: L('Telefonni qo\'yib uxlash', 'Отложить телефон и спать', 'Put the phone down'), effects: { energy: 50 } },
    ],
  },
  {
    id: 'ai_safety', minEra: 5, maxEra: 6, icon: '🤖',
    title: L("Sun'iy intellekt xavfsizligi", 'Безопасность ИИ', 'AI safety'),
    text: L(
      "Olimlar AI juda tez rivojlanayotganidan xavotirda. Tezlikni oshirasizmi yoki xavfsizlikka sarmoya qilasizmi?",
      'Учёные встревожены слишком быстрым развитием ИИ. Ускоряться или вкладываться в безопасность?',
      'Scientists worry AI is moving too fast. Speed up, or invest in safety?'),
    choices: [
      { label: L('Xavfsizlikka sarmoya', 'Вложить в безопасность', 'Invest in safety'), effects: { money: -2, rep: 10 } },
      { label: L('Tezlikni oshirish', 'Ускориться', 'Go faster'), effects: { boost: { mult: 2, minutes: 60 }, rep: -6 } },
    ],
  },
  {
    id: 'neuro_trial', minEra: 5, maxEra: 6, icon: '🧠', requiresBiz: 'neuro',
    title: L('Birinchi sinov', 'Первое испытание', 'First human trial'),
    text: L(
      "NeuroBridge implantini birinchi bemorda sinashga tayyor. Tavakkal katta, lekin natija tarixiy bo'lishi mumkin.",
      'Имплант NeuroBridge готов к испытанию на первом пациенте. Риск велик, но результат может войти в историю.',
      'The NeuroBridge implant is ready for its first patient. High risk, historic upside.'),
    choices: [
      { label: L('Sinovni boshlash', 'Начать испытание', 'Start the trial'),
        risk: { chance: 0.7, win: { rep: 12, boost: { mult: 1.5, minutes: 120 } }, lose: { rep: -10 } } },
      { label: L('Yana bir yil kutish', 'Подождать ещё год', 'Wait another year'), effects: { rd: 1 } },
    ],
  },
  {
    id: 'dust_storm', minEra: 6, maxEra: 6, icon: '🌪️',
    title: L("Mars bo'roni", 'Марсианская буря', 'Martian dust storm'),
    text: L(
      "Ulkan chang bo'roni bazaga yaqinlashmoqda. Quyosh panellari ko'milib qolishi mumkin.",
      'К базе приближается огромная пылевая буря. Солнечные панели может засыпать.',
      'A giant dust storm is heading for the base. The solar panels could be buried.'),
    choices: [
      { label: L('Bazani mustahkamlash', 'Укрепить базу', 'Reinforce the base'), effects: { money: -2, rep: 5 } },
      { label: L('Tavakkal qilish', 'Рискнуть', 'Risk it'),
        risk: { chance: 0.5, win: { money: 4 }, lose: { cashPct: -0.15, rep: -4 } } },
    ],
  },
  {
    id: 'charity', minEra: 2, maxEra: 6, icon: '🎗️',
    title: L('Xayriya kechasi', 'Благотворительный вечер', 'Charity gala'),
    text: L(
      "Sizni katta xayriya kechasiga taklif qilishdi. Hamma sizdan saxiylik kutmoqda.",
      'Вас пригласили на большой благотворительный вечер. Все ждут щедрости.',
      'You are invited to a big charity gala. Everyone expects generosity.'),
    choices: [
      { label: L('Katta xayriya qilish', 'Сделать большое пожертвование', 'Donate big'), effects: { money: -2, rep: 10 } },
      { label: L('Ishga qaytish', 'Вернуться к работе', 'Back to work'), effects: { money: 1, rep: -2 } },
    ],
  },
];

export const EVENT_BY_ID: Record<string, GameEvent> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
