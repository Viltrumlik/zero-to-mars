import type { Quest, T } from '../types.ts';

const L = (uz: string, ru: string, en: string): T => ({ uz, ru, en });

/**
 * The story campaign. Quests run strictly in order; the last quest of each
 * era moves the hero to the next chapter of their life.
 */
export const QUESTS: Quest[] = [
  // ------------------------------------------------------------ childhood
  { id: 'q0_home', era: 0, icon: '🏠', target: 'home', cond: { flag: 'v:home' },
    title: L('Uyingga bor', 'Иди домой', 'Go home'),
    story: L(
      "Onam: \"Bolam, dadang zavoddan kech qaytadi, uyda ortiqcha pul yo'q. Agar kompyuter xohlasang, o'zing ishlab topishing kerak.\" Avval uyga kelib, nima qilishni o'ylab ko'ring.",
      'Мама: «Сынок, папа поздно возвращается с завода, лишних денег нет. Хочешь компьютер, придётся заработать самому». Сначала зайди домой и всё обдумай.',
      'Mom: "Son, Dad gets home late from the factory and we have no spare money. If you want that computer, you\'ll have to earn it yourself." First, head home and think it over.') },
  { id: 'q0_paper', era: 0, icon: '📰', target: 'kiosk', cond: { job: ['newspaper', 1] },
    title: L('Gazeta tarqatib pul ishla', 'Заработай на газетах', 'Earn money delivering papers'),
    story: L(
      "Kioskdagi Karim aka: \"Ertalabki gazetalarni uyma-uy tarqatadigan bola kerak. Kiosk faqat 5:00 dan 12:00 gacha ochiq. Kechiksang, ish ham, pul ham yo'q!\"",
      'Карим-ака из киоска: «Нужен мальчишка разносить утренние газеты. Киоск открыт только с 5:00 до 12:00. Опоздаешь, нет ни работы, ни денег!»',
      'Karim from the newsstand: "I need a kid to deliver the morning papers door to door. The stand is open only 5:00–12:00. Late means no job, no money!"') },
  { id: 'q0_eat', era: 0, icon: '🍛', target: 'home', cond: { meals: 1 },
    title: L('Qorningni to\'yg\'iz', 'Поешь', 'Get something to eat'),
    story: L(
      "Ishlash qorinni ochiqtiradi. Ochlik 0 ga tushsa, sog'lig'ingiz yo'qola boshlaydi va kasalxonaga tushasiz. Uyda oilaviy ovqat bepul, lekin kuniga faqat bir marta.",
      'Работа вызывает голод. Если сытость упадёт до 0, здоровье начнёт таять, и вы попадёте в больницу. Дома семейный ужин бесплатный, но только раз в день.',
      'Work makes you hungry. If food drops to 0 your health starts draining and you end up in hospital. The family meal at home is free, but only once a day.') },
  { id: 'q0_sleep', era: 0, icon: '😴', target: 'home', cond: { sleeps: 1 },
    title: L('Uyda uxla', 'Поспи дома', 'Sleep at home'),
    story: L(
      "Energiyangiz tugasa, hech qanday ish qila olmaysiz. Charchaganingizda uyga borib uxlang: yangi kun boshlanadi. Har 3 kunda 1 yoshga ulg'ayasiz.",
      'Без энергии не поработаешь. Когда устанете, идите спать: начнётся новый день. Каждые 3 дня вы взрослеете на 1 год.',
      'Without energy you cannot work. When tired, go home and sleep: a new day begins. Every 3 days you grow 1 year older.') },
  { id: 'q0_study', era: 0, icon: '📚', target: 'library', cond: { skills: { code: 1 } },
    title: L("Dasturlashni o'rgan (1-daraja)", 'Изучи программирование (ур. 1)', 'Learn coding (level 1)'),
    story: L(
      "Kutubxonachi opa sizga eski dasturlash kitobini berdi: \"Bilim — eng katta boylik. Uni hech kim o'g'irlay olmaydi.\" Kutubxona bepul, lekin vaqt va energiya talab qiladi.",
      'Библиотекарь дала вам старую книгу по программированию: «Знания — главное богатство. Их никто не украдёт». Библиотека бесплатна, но отнимает время и силы.',
      'The librarian hands you an old coding book: "Knowledge is the greatest wealth. Nobody can steal it." The library is free, but it costs time and energy.') },
  { id: 'q0_bike', era: 0, icon: '🚲', target: 'bikeshop', cond: { item: 'bike' },
    title: L('$120 yig\'ib velosiped ol', 'Накопи $120 на велосипед', 'Save $120 for a bicycle'),
    story: L(
      "Pochtadagi kuryerlar gazetachilardan to'rt baravar ko'p topadi. Lekin ular velosipedda yuradi. Tejang: har bir dollar muhim.",
      'Курьеры на почте зарабатывают в четыре раза больше газетчиков. Но они ездят на велосипедах. Экономьте: каждый доллар важен.',
      'Couriers at the post office earn four times more than paper kids. But they ride bikes. Save up: every dollar counts.') },
  { id: 'q0_courier', era: 0, icon: '📦', target: 'post', cond: { job: ['courier', 3] },
    title: L('Pochtada 3 marta kuryer bo\'l', 'Отработай 3 смены курьером', 'Do 3 courier shifts'),
    story: L(
      "Pochta mudiri: \"Posilkalarni vaqtida yetkaz. Kechiksang, maoshingdan ushlab qolaman.\" Velosipedda shaharni kesib o'ting!",
      'Начальник почты: «Доставляй посылки вовремя. Опоздаешь, вычту из зарплаты». Пересеките город на велосипеде!',
      'Postmaster: "Deliver the parcels on time. Late means I dock your pay." Race across town on your bike!') },
  { id: 'q0_code3', era: 0, icon: '💻', target: 'library', cond: { skills: { code: 3 } },
    title: L('Dasturlashni 3-darajaga yetkaz', 'Подними программирование до 3', 'Reach coding level 3'),
    story: L(
      "O'yin yozish uchun haqiqiy dasturchi bo'lish kerak. Kutubxona bepul, internet-kafedagi kurslar esa tezroq, lekin pullik.",
      'Чтобы написать игру, нужно стать настоящим программистом. Библиотека бесплатна, а курсы в интернет-кафе быстрее, но платные.',
      'To write a game you must become a real programmer. The library is free; courses at the internet cafe are faster but cost money.') },
  { id: 'q0_pc', era: 0, icon: '🖥️', target: 'electronics', cond: { item: 'computer' },
    title: L('$600 ga kompyuter sotib ol', 'Купи компьютер за $600', 'Buy the $600 computer'),
    story: L(
      "Vitrinadagi o'sha kompyuter hali ham sizni kutmoqda. $600. Bu bola uchun katta pul. Hech kim yordam bermaydi: faqat siz.",
      'Тот самый компьютер всё ещё ждёт вас в витрине. $600. Для ребёнка это огромные деньги. Никто не поможет: только вы.',
      'That computer is still waiting in the shop window. $600. A fortune for a kid. Nobody will help you: only you.') },
  { id: 'q0_game', era: 0, icon: '👾', target: 'home', cond: { job: ['writegame', 1] },
    title: L("Birinchi o'yiningni yoz", 'Напиши свою первую игру', 'Write your first game'),
    story: L(
      "Kompyuter uyda! Tun bo'yi kod yozib, kosmik o'yin yarating. Agar yaxshi chiqsa, jurnal uni $500 ga sotib olishga va'da berdi.",
      'Компьютер дома! Пишите код ночами и создайте космическую игру. Если получится хорошо, журнал обещал купить её за $500.',
      'The computer is home! Code through the nights and build a space game. If it is good, a magazine promised to buy it for $500.') },
  { id: 'q0_fly', era: 0, icon: '✈️', target: 'airport', cond: { age: 17, cash: 1_500 }, cost: 900, advanceEra: true,
    title: L('17 yoshga to\'l va $1,500 yig\'', 'Дождись 17 лет и накопи $1,500', 'Turn 17 and save $1,500'),
    story: L(
      "Bu shaharcha sizga torlik qilmoqda. Katta imkoniyatlar chet elda. Samolyot chiptasi $900, qolgani u yerda yashash uchun. 17 yoshga to'lganingizda aeroportga boring.",
      'Этот городок вам тесен. Большие возможности за границей. Билет стоит $900, остальное на жизнь там. Когда исполнится 17, идите в аэропорт.',
      'This town is too small for you. The big chances are abroad. The ticket costs $900, the rest is to survive there. When you turn 17, head to the airport.') },

  // --------------------------------------------------------------- abroad
  { id: 'q1_dorm', era: 1, icon: '🏢', target: 'home', cond: { flag: 'v:home' },
    title: L('Yotoqxonaga joylash', 'Заселись в общежитие', 'Move into the dorm'),
    story: L(
      "Yangi mamlakat, notanish til, cho'ntakda ozgina pul. Endi har kecha yotoqxona uchun $12 to'laysiz. Pul tugasa, qarzga botasiz va qarzga har kuni 5% foiz qo'shiladi.",
      'Новая страна, чужой язык, в кармане копейки. Теперь каждую ночь вы платите $12 за общежитие. Кончатся деньги, влезете в долг, а долг растёт на 5% в день.',
      'New country, strange language, little money. Now every night costs $12 for the dorm. Run out of money and you fall into debt that grows 5% per day.') },
  { id: 'q1_boiler', era: 1, icon: '🔥', target: 'boiler', cond: { job: ['boiler', 2] },
    title: L('Qozonxonada 2 smena ishla', 'Отработай 2 смены в котельной', 'Work 2 boiler-room shifts'),
    story: L(
      "Hech kim qozonxonani tozalashni xohlamaydi: issiq, iflos, xavfli. Shuning uchun yaxshi to'laydi. Siz rozisiz.",
      'Никто не хочет чистить котельную: жарко, грязно, опасно. Поэтому там хорошо платят. Вы согласны.',
      'Nobody wants to clean the boiler room: hot, filthy, dangerous. That is why it pays well. You take it.') },
  { id: 'q1_uni', era: 1, icon: '🎓', target: 'university', cond: { item: 'student', skills: { biz: 3, eng: 3 } },
    title: L("Universitetga kir: Biznes 3, Muhandislik 3", 'Поступи: Бизнес 3, Инженерия 3', 'Enroll: Business 3, Engineering 3'),
    story: L(
      "Fizika va iqtisod: kelajakni quradiganlar shu ikkisini biladi. Kontrakt $500. Ma'ruzalar bepul, faqat vaqt va energiya ketadi.",
      'Физика и экономика: те, кто строит будущее, знают обе. Контракт $500. Лекции бесплатны, нужны лишь время и силы.',
      'Physics and economics: the people who build the future know both. Tuition is $500. Lectures are free, they cost time and energy.') },
  { id: 'q1_laptop', era: 1, icon: '💻', target: 'electronics', cond: { item: 'laptop' },
    title: L('Noutbuk sotib ol ($1,200)', 'Купи ноутбук ($1,200)', 'Buy a laptop ($1,200)'),
    story: L(
      "Veb-saytlarga talab katta, lekin buyurtma olish uchun o'z noutbukingiz kerak.",
      'Сайты нужны всем, но для заказов нужен свой ноутбук.',
      'Everyone needs websites, but you need your own laptop to take orders.') },
  { id: 'q1_web', era: 1, icon: '🌐', target: 'netcafe', cond: { job: ['webdev', 5] },
    title: L('5 ta veb-sayt buyurtmasini bajar', 'Выполни 5 заказов на сайты', 'Finish 5 website gigs'),
    story: L(
      "Har bir sayt sizni yaxshiroq dasturchi qiladi va mijozlar sizni tavsiya qila boshlaydi.",
      'Каждый сайт делает вас сильнее, и клиенты начинают вас рекомендовать.',
      'Every site makes you better, and clients start recommending you.') },
  { id: 'q1_startup', era: 1, icon: '🚀', target: 'home', cond: { age: 24, cash: 8_000 }, advanceEra: true,
    title: L("24 yosh va $8,000 boshlang'ich kapital", '24 года и $8,000 капитала', 'Age 24 and $8,000 seed money'),
    story: L(
      "Ukangiz qo'ng'iroq qildi: \"Internet portlayapti! Kelajak onlayn xaritalarda. Kel, birga kompaniya ochamiz!\" Buning uchun kamida $8,000 kerak.",
      'Позвонил брат: «Интернет взрывается! Будущее за онлайн-картами. Давай откроем компанию!» Для этого нужно хотя бы $8,000.',
      'Your brother calls: "The internet is exploding! Online maps are the future. Let\'s start a company!" You need at least $8,000.') },

  // -------------------------------------------------------------- CityMap
  { id: 'q2_garage', era: 2, icon: '🗺️', target: 'company', cond: { flag: 'v:company' },
    title: L('CityMap garajiga bor', 'Иди в гараж CityMap', 'Go to the CityMap garage'),
    story: L(
      "Ijaraga olingan garaj: bitta stol, ikkita kompyuter, divan. Shu yerda tarix boshlanadi.",
      'Арендованный гараж: один стол, два компьютера, диван. Здесь начинается история.',
      'A rented garage: one desk, two computers, a couch. History starts here.') },
  { id: 'q2_code', era: 2, icon: '⌨️', target: 'company', cond: { job: ['startup', 5] },
    title: L('CityMap kodini 5 marta yoz', 'Напиши код CityMap 5 раз', 'Code CityMap 5 times'),
    story: L(
      "Mahsulot bo'lmasa, kompaniya ham yo'q. Kunduzi kod, kechasi ham kod.",
      'Нет продукта, нет компании. Днём код, ночью тоже код.',
      'No product, no company. Code by day, code by night.') },
  { id: 'q2_biz', era: 2, icon: '🏦', target: 'bizcenter', cond: { bizTotal: 3 },
    title: L('Biznes markazida 3 ta sarmoya kirit', 'Сделай 3 инвестиции', 'Make 3 investments'),
    story: L(
      "Maosh bilan boyib bo'lmaydi. Pul siz uxlaganingizda ham ishlashi kerak. Bizneslar real vaqtda daromad keltiradi.",
      'На зарплате не разбогатеешь. Деньги должны работать, даже когда вы спите. Бизнесы приносят доход в реальном времени.',
      "You can't get rich on a salary. Money must work while you sleep. Businesses earn in real time.") },
  { id: 'q2_exit', era: 2, icon: '💰', target: 'bizcenter', cond: { netWorth: 1_000_000, age: 28 }, advanceEra: true,
    title: L('Boylikni $1 mln ga yetkaz (28 yosh)', 'Доведи состояние до $1 млн (28 лет)', 'Reach $1M net worth (age 28)'),
    story: L(
      "Yirik kompaniyalar CityMap'ni kuzatmoqda. Kompaniyangiz qiymati oshsa, ular uni sotib olishadi.",
      'Крупные компании присматриваются к CityMap. Вырастет стоимость, и они её купят.',
      'Big companies are watching CityMap. Grow its value and they will buy it.') },

  // -------------------------------------------------------------- PayNova
  { id: 'q3_office', era: 3, icon: '💳', target: 'company', cond: { flag: 'v:company' },
    title: L('PayNova ofisini och', 'Открой офис PayNova', 'Open the PayNova office'),
    story: L(
      "$22 mln qo'lingizda. Ko'pchilik bu pul bilan dam olardi. Siz esa butun pulni onlayn bankka tikasiz.",
      'У вас $22 млн. Большинство ушли бы на покой. А вы ставите всё на онлайн-банк.',
      'You hold $22M. Most people would retire. You bet it all on an online bank.') },
  { id: 'q3_work', era: 3, icon: '⚙️', target: 'company', cond: { job: ['payments', 5] },
    title: L("To'lov tizimini 5 marta yoz", 'Напиши платёжку 5 раз', 'Build payments 5 times'),
    story: L(
      "Firibgarlar tizimni buzishga urinmoqda. Kod mukammal bo'lishi shart.",
      'Мошенники пытаются взломать систему. Код должен быть безупречным.',
      'Fraudsters keep attacking. The code must be flawless.') },
  { id: 'q3_exit', era: 3, icon: '🏆', target: 'bank', cond: { netWorth: 150_000_000 }, advanceEra: true,
    title: L('Boylik $150 mln', 'Состояние $150 млн', 'Net worth $150M'),
    story: L(
      "PayNova'ni yirik auksion kompaniyasi ko'zlamoqda. Qiymat yetarli bo'lsa, sotuv bo'ladi.",
      'На PayNova положил глаз крупный аукцион. Хватит стоимости, будет сделка.',
      'A giant auction site has its eye on PayNova. Reach the value and the deal happens.') },

  // -------------------------------------------------------------- big bet
  { id: 'q4_factory', era: 4, icon: '🏭', target: 'company', cond: { flag: 'v:company' },
    title: L('Voltra zavodiga bor', 'Иди на завод Voltra', 'Visit the Voltra factory'),
    story: L(
      "Hamma pulni raketalar va elektromobillarga tikdingiz. Mutaxassislar: \"Bu aqldan ozish\" deyishmoqda.",
      'Вы поставили всё на ракеты и электромобили. Эксперты говорят: «Это безумие».',
      'You bet everything on rockets and EVs. Experts say: "This is insane."') },
  { id: 'q4_orbitra', era: 4, icon: '🛰️', target: 'bizcenter', cond: { bizId: ['orbitra', 1] },
    title: L('Orbitra raketa sexini sotib ol', 'Купи ракетный цех Orbitra', 'Buy Orbitra rocket works'),
    story: L(
      "Raketa qurish uchun avval raketa sexi kerak.",
      'Чтобы строить ракеты, нужен ракетный цех.',
      'To build rockets, you first need a rocket works.') },
  { id: 'q4_launch', era: 4, icon: '🚀', target: 'launchpad', cond: { launchOk: 1 },
    title: L('Raketani orbitaga chiqar', 'Выведи ракету на орбиту', 'Reach orbit'),
    story: L(
      "Birinchi raketalar deyarli doim portlaydi. Har bir portlash tajriba beradi. Taslim bo'lmang.",
      'Первые ракеты почти всегда взрываются. Каждый взрыв даёт опыт. Не сдавайтесь.',
      'First rockets almost always explode. Every explosion is experience. Do not give up.') },
  { id: 'q4_billion', era: 4, icon: '💎', target: 'bank', cond: { netWorth: 3_000_000_000 }, advanceEra: true,
    title: L('Boylik $3 mlrd', 'Состояние $3 млрд', 'Net worth $3B'),
    story: L(
      "Investorlar endi sizga ishonmoqda. Voltra'ni birjaga olib chiqish vaqti keldi.",
      'Инвесторы наконец верят в вас. Пора выводить Voltra на биржу.',
      'Investors finally believe in you. Time to take Voltra public.') },

  // --------------------------------------------------------------- empire
  { id: 'q5_hq', era: 5, icon: '🏙️', target: 'company', cond: { flag: 'v:company' },
    title: L('Shtab-kvartiraga bor', 'Иди в штаб-квартиру', 'Go to HQ'),
    story: L(
      "Tunnellar, sun'iy yo'ldoshlar, sun'iy intellekt: imperiyangiz butun sayyorani qamrab olmoqda.",
      'Тоннели, спутники, ИИ: ваша империя охватывает всю планету.',
      'Tunnels, satellites, AI: your empire spans the planet.') },
  { id: 'q5_ai', era: 5, icon: '🤖', target: 'bizcenter', cond: { bizId: ['ai', 1] },
    title: L("Sun'iy intellekt markazini qur", 'Построй центр ИИ', 'Build the AI supercluster'),
    story: L(
      "Kelajak sun'iy intellektniki. Siz unga birinchi bo'lib yetishingiz kerak.",
      'Будущее за ИИ. Вы должны прийти туда первым.',
      'The future belongs to AI. You must get there first.') },
  { id: 'q5_mars', era: 5, icon: '🔴', target: 'bank', cond: { netWorth: 200_000_000_000 }, advanceEra: true,
    title: L('Boylik $200 mlrd', 'Состояние $200 млрд', 'Net worth $200B'),
    story: L(
      "Mars dasturi uchun aql bovar qilmaydigan pul kerak. Yig'ing.",
      'Марсианской программе нужны невероятные деньги. Соберите их.',
      'The Mars program needs unbelievable money. Raise it.') },

  // ----------------------------------------------------------------- mars
  { id: 'q6_base', era: 6, icon: '🏕️', target: 'company', cond: { flag: 'v:company' },
    title: L('Mars bazasiga kir', 'Войди на марсианскую базу', 'Enter the Mars base'),
    story: L(
      "Siz Marsdasiz. 10 yoshli bolaning orzusi ushaldi. Endi bu yerda shahar qurish kerak.",
      'Вы на Марсе. Мечта десятилетнего мальчика сбылась. Теперь здесь нужно построить город.',
      "You are on Mars. A 10-year-old's dream came true. Now build a city here.") },
  { id: 'q6_colony', era: 6, icon: '👩‍🚀', target: 'launchpad', cond: { colonists: 1_000 },
    title: L('1 000 kolonist olib kel', 'Привези 1 000 колонистов', 'Bring 1,000 colonists'),
    story: L(
      "Har bir muvaffaqiyatli parvoz 100 kishini olib keladi.",
      'Каждый успешный полёт привозит 100 человек.',
      'Every successful flight brings 100 people.') },
  { id: 'q6_city', era: 6, icon: '🌆', target: 'bank', cond: { netWorth: 10_000_000_000_000 },
    title: L('Boylik $10 trln: Mars shahri', 'Состояние $10 трлн: город на Марсе', '$10T net worth: a Mars city'),
    story: L(
      "Oxirgi qadam: Marsda haqiqiy shahar. Siz noldan Marsgacha yetdingiz.",
      'Последний шаг: настоящий город на Марсе. Вы прошли путь с нуля до Марса.',
      'The final step: a real city on Mars. You went from zero to Mars.') },
];
