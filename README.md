# 🚀 Noldan Marsgacha

Telegram WebApp ichida ishlaydigan 3D hayot simulyatori. O'yinchi 10 yoshli bola sifatida eski kompyuter bilan boshlaydi, kod yozadi, startaplar ochadi, raketalar uchiradi, milliarder bo'ladi va oxirida Marsda shahar quradi. Hayot yo'li Elon Musk'nikiga o'xshaydi, lekin qahramon va kompaniyalar to'qima: CityMap, PayNova, Orbitra, Voltra, SunGrid, BoreCo, NeuroBridge.

O'yin uch tilda: o'zbek, rus va ingliz. Til Telegram sozlamasidan avtomatik aniqlanadi.

## O'yin mexanikasi

| Mexanika | Qanday ishlaydi |
|---|---|
| **Story mode** | O'yin kinematik kirish sahnalari bilan boshlanadi, keyin 34 ta syujetli vazifa zanjiri boradi: gazeta tarqatish → velosiped → kompyuter → birinchi o'yin → chet el → CityMap → PayNova → raketalar → Mars. |
| **3D shahar** | Yo'llar, harakatlanuvchi mashinalar va 20 ta ichiga kirsa bo'ladigan bino. Qahramon joystik yoki klaviatura bilan yuradi, binoni bossangiz o'zi yuradi (A* yo'l topish). |
| **Real ishlar** | Tap bilan pul ishlash yo'q. Har bir ish o'z mini-o'yini: yetkazib berish (shahar bo'ylab yugurish), kassa (qaytim hisoblash), ta'mirlash (xotira), dasturlash (kod qatorlarini terish), tozalash (barmoq bilan artish). Maosh natijaga bog'liq. |
| **Hayot** | O'yin vaqti (kun va soat, kechasi qorong'i), energiya, ochlik, sog'liq. Har 3 kun = 1 yosh. 1-bosqichdan boshlab har kecha ijara to'lanadi. |
| **Juda qiyin** | Maoshlar past, narxlar baland, ishlar yosh, buyum va ko'nikma talab qiladi, binolar ma'lum soatlarda ochiq. Ochlikdan yiqilsangiz, kasalxona hisobi qarzga yoziladi va qarzga har kecha 5% foiz qo'shiladi. |
| **Doimiy tutorial** | Ekranda joriy vazifa va uning bajarilishi, maqsad binoda mayoq, qahramon oyog'i ostida yo'nalish o'qi, kontekstli maslahatlar va ogohlantirishlar, ❓ qo'llanma. |
| **Bizneslar** | CityMap bosqichidan (24 yosh) ochiladi va real vaqtda, siz yo'qligingizda ham (3 soatgacha) daromad keltiradi. |
| **Ijtimoiy** | Global va do'stlar reytingi, referal bonuslari, kunlik mukofot. |

## Tuzilishi

```
shared/   iqtisod dvigateli + kontent (klient ham, server ham ishlatadi)
  src/engine.ts          deterministik o'yin qoidalari
  src/content/*.ts       bosqichlar, bizneslar, ko'nikmalar, voqealar (3 tilda)
client/   Vite + React + react-three-fiber (Three.js) + postprocessing
  src/scene/             3D orol, binolar, qahramon, raketa
  src/ui/                HUD, panellar, modal oynalar
  src/store.ts           holat va server bilan sinxronlash
server/   Fastify + node:sqlite + grammY bot (Node 24 TypeScript'ni to'g'ridan-to'g'ri ishlatadi)
scripts/balance.ts       iqtisod balansini simulyatsiya qilish
```

**Firibgarlikdan himoya.** Klient har bir harakatni darhol o'zida ko'rsatadi, so'ng uni serverga yuboradi. Server o'sha dvigatel bilan harakatlarni qayta o'ynab chiqadi va vaqtni o'z soati bo'yicha cheklaydi. Shu sabab klient vaqtni oldinga surib yoki soxta tap yuborib pul qo'sha olmaydi. Telegram `initData` HMAC imzosi bilan tekshiriladi.

## Lokal ishga tushirish

Node.js 24 yoki undan yangi versiyasi kerak.

```bash
npm install
```

API va bot (dev rejimi, Telegram'siz kirish mumkin):

```bash
npm run dev:server
```

Ikkinchi terminalda 3D klient (`http://localhost:5173`):

```bash
npm run dev
```

Telegram'dan tashqarida, ya'ni oddiy brauzerda, o'yin dev hisob bilan ishlaydi. Server bo'lmasa oflayn rejimga o'tadi va holat brauzerda saqlanadi.

## Tekshiruvlar

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run balance
```

`npm run balance` syujet bo'yicha o'ynaydigan bot bilan har bir bosqich necha o'yin kuni va necha soat faol o'yin olishini ko'rsatadi. Hozirgi sozlamada Marsgacha taxminan 30 soat faol o'yin kerak. Qiyinlikni `shared/src/content/city.ts` (maosh va narxlar), `shared/src/content/quests.ts` va `shared/src/engine.ts` dagi konstantalar bilan sozlash mumkin.

## Telegram'ga joylash

Bosqichma-bosqich qo'llanma (BotFather, domen, Docker, HTTPS, zaxira nusxa): **[DEPLOY.md](DEPLOY.md)**.

Qisqacha:

```bash
cp .env.example .env
```

```bash
docker compose up -d --build
```
