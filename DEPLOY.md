# Noldan Marsgacha — serverga joylash (deploy) qo'llanmasi

Bu qo'llanma o'yinni VPS serverga joylab, Telegram'da Mini App (WebApp) sifatida ishga tushirishni bosqichma-bosqich tushuntiradi.

Tizim tuzilishi:

- **app**: Node 24 server (API + Telegram bot + 3D o'yin fayllari), SQLite baza `data/game.db` faylida.
- **caddy**: HTTPS (Let's Encrypt sertifikatini avtomatik oladi) va `app` ga yo'naltiradi.

## 0. Nimalar kerak

- VPS server: Ubuntu 22.04 yoki 24.04, kamida 1 GB RAM, ochiq IP manzil.
- Domen yoki subdomen (masalan `mars.example.uz`). Telegram Mini App faqat **HTTPS** bilan ishlaydi.
- Telegram akkaunt.

## 1. BotFather orqali bot yaratish

1. Telegram'da [@BotFather](https://t.me/BotFather) ni oching.
2. `/newbot` yuboring.
3. Bot nomini kiriting (masalan: `Noldan Marsgacha`).
4. Username kiriting, u `bot` bilan tugashi shart (masalan: `NoldanMarsgachaBot`).
5. BotFather **token** beradi (`123456789:AA...` ko'rinishida). Uni hech kimga bermang.
   - token → `.env` dagi `BOT_TOKEN`
   - username (`@` belgisisiz) → `.env` dagi `BOT_USERNAME`

### Ixtiyoriy: to'g'ridan-to'g'ri Mini App havolasi (`/newapp`)

Bu qadam taklif havolasini bosganda o'yin botga kirmasdan darhol ochilishini ta'minlaydi.

1. @BotFather ga `/newapp` yuboring va botingizni tanlang.
2. Sarlavha, qisqa tavsif va 640×360 rasm yuboring (GIF so'ralsa `/empty`).
3. **Web App URL** so'ralganda: `https://SIZNING-DOMENINGIZ/` (masalan `https://mars.example.uz/`).
4. **Short name** kiriting (masalan: `play`).
5. Shu short name ni `.env` dagi `APP_SHORT_NAME` ga yozing.

Shunda taklif havolasi `https://t.me/NoldanMarsgachaBot/play?startapp=ref_<id>` ko'rinishida bo'ladi.
Agar `APP_SHORT_NAME` bo'sh bo'lsa, havola `https://t.me/NoldanMarsgachaBot?start=ref_<id>` bo'ladi:
foydalanuvchi botga tushadi va "🚀 O'ynash" tugmasini bosadi.

> Menyu tugmasi (chatdagi "🚀 O'ynash") va buyruqlar ro'yxatini server ishga tushganda o'zi sozlaydi.
> BotFather'da `/setmenubutton` qilish shart emas.

## 2. Domenni serverga ulash

Domen provayderingiz (DNS) panelida yozuv qo'shing:

| Turi | Nomi (Host) | Qiymati           |
|------|-------------|-------------------|
| A    | `mars`      | `VPS_IP_MANZILI`  |

(Butun domen uchun bo'lsa, nom `@` bo'ladi.) Tekshirish (bir necha daqiqadan keyin):

```bash
dig +short mars.example.uz
# VPS IP manzili chiqishi kerak
```

## 3. Serverga Docker o'rnatish

Serverga SSH orqali kiring (`ssh root@VPS_IP`) va bajaring:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # root bo'lmagan foydalanuvchi uchun; keyin qayta kiring
docker compose version          # tekshirish
```

Firewall (ufw) yoqilgan bo'lsa, portlarni oching:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
```

## 4. Loyihani serverga ko'chirish

**Variant A, git orqali:**

```bash
git clone <REPO_URL> ~/musk
cd ~/musk
```

**Variant B, o'z kompyuteringizdan nusxalash:**

```bash
# o'z kompyuteringizda, loyiha papkasida:
rsync -av --exclude node_modules --exclude data --exclude client/dist --exclude .env ./ root@VPS_IP:~/musk/
```

## 5. `.env` faylini to'ldirish

```bash
cd ~/musk
cp .env.example .env
nano .env
```

Eng kamida shularni to'ldiring:

```env
BOT_TOKEN=123456789:AA...
BOT_USERNAME=NoldanMarsgachaBot
APP_SHORT_NAME=play
DOMAIN=mars.example.uz
WEBAPP_URL=https://mars.example.uz/
DEV_AUTH=0
```

`.env` faylini hech qachon git'ga qo'shmang, unda bot tokeni bor.

## 6. Baza papkasini tayyorlash

Server konteyner ichida xavfsizlik uchun `node` (uid 1000) foydalanuvchisi nomidan ishlaydi, shuning uchun `data` papkasi unga tegishli bo'lishi kerak:

```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

## 7. Ishga tushirish

```bash
docker compose up -d --build
```

Birinchi marta 2–5 daqiqa davom etadi (3D client yig'iladi). Holatni tekshirish:

```bash
docker compose ps                         # app "healthy" bo'lishi kerak
docker compose logs -f app                # server loglari (chiqish: Ctrl+C)
docker compose logs -f caddy              # SSL sertifikat olinishi
curl https://mars.example.uz/api/health   # {"ok":true}
```

Logda `server ready` va `bot long polling started` yozuvlari chiqishi kerak.

Telegram'da botingizga `/start` yuboring: salomlashish xabari va "🚀 O'ynash" tugmasi chiqadi.

## 8. Yangilash (yangi versiyani chiqarish)

```bash
cd ~/musk
git pull                         # yoki 4-bosqichdagi rsync buyrug'ini qayta bajaring
docker compose up -d --build     # qayta yig'adi va ishga tushiradi
docker image prune -f            # eski image'larni tozalash
```

O'yinchilar ma'lumotlari `./data` papkasida turadi va yangilashda o'chmaydi.
Yangilashdan oldin zaxira nusxa olish tavsiya etiladi (9-bosqich).

Foydali buyruqlar:

```bash
docker compose restart app   # serverni qayta ishga tushirish
docker compose down          # hammasini to'xtatish (ma'lumotlar saqlanadi)
```

## 9. Zaxira nusxa (backup) `data/game.db`

Baza SQLite WAL rejimida ishlaydi, shuning uchun ishlab turgan faylni oddiy `cp` qilish xavfli.
To'g'ri usul: server ishlab turgan paytda `VACUUM INTO` bilan izchil nusxa olish:

```bash
cd ~/musk
mkdir -p backups
docker compose exec app node -e "new (require('node:sqlite').DatabaseSync)('/app/data/game.db').exec(\"VACUUM INTO '/app/data/backup-$(date +%F).db'\")"
sudo mv data/backup-*.db backups/
ls -lh backups/
```

Muqobil (oddiy) usul: serverni bir necha soniyaga to'xtatib nusxalash:

```bash
docker compose stop app
cp data/game.db backups/game-$(date +%F).db
docker compose start app
```

**Har kuni avtomatik zaxira** (cron, soat 04:00, 14 kundan eski nusxalar o'chiriladi):

```bash
crontab -e
```

va quyidagi qatorni qo'shing (`/root/musk` ni o'z yo'lingizga almashtiring):

```cron
0 4 * * * cd /root/musk && docker compose exec -T app node -e "new (require('node:sqlite').DatabaseSync)('/app/data/game.db').exec(\"VACUUM INTO '/app/data/backup-$(date +\%F).db'\")" && mkdir -p backups && mv data/backup-*.db backups/ && find backups -name 'backup-*.db' -mtime +14 -delete
```

Zaxira nusxalarni vaqti-vaqti bilan boshqa joyga ham ko'chiring (masalan `scp` bilan o'z kompyuteringizga).

### Zaxiradan tiklash

```bash
docker compose stop app
cp backups/backup-2026-01-31.db data/game.db
rm -f data/game.db-wal data/game.db-shm
sudo chown -R 1000:1000 data
docker compose start app
```

## 10. Muammolarni hal qilish

| Belgi | Sabab va yechim |
|-------|-----------------|
| `app` qayta-qayta o'chib yonadi, logda `Cannot open database` | `data` papkasiga yozish huquqi yo'q: `sudo chown -R 1000:1000 data` |
| Logda `BOT_TOKEN is required in production` | `.env` da `BOT_TOKEN` bo'sh |
| Logda `BOT_TOKEN rejected by Telegram (401)` | Token noto'g'ri, @BotFather'dan qayta nusxalang |
| Logda `bot polling failed ... 409` | Shu token bilan boshqa joyda ham bot ishlayapti (masalan lokal kompyuterda). Uni to'xtating |
| Sayt ochilmaydi / SSL xatosi | DNS A yozuvi IP ga ishora qilmayapti yoki 80/443 portlar yopiq. `docker compose logs caddy` ni ko'ring |
| O'yin ochiladi, lekin "unauthorized" | O'yinni brauzerda emas, Telegram ichida oching. `BOT_TOKEN` shu botniki ekanini tekshiring |
| O'yin oq ekran | `client/dist` yig'ilmagan: `docker compose up -d --build` ni qayta bajaring va build logini ko'ring |

## Lokal ishlab chiqish (ixtiyoriy)

```bash
npm install
npm run dev:server                 # API: http://localhost:3000 (DEV_AUTH=1 bilan)
npm run dev                        # 3D client (vite)
npx vitest run server              # server testlari
```

`DEV_AUTH=1` faqat lokal uchun: so'rovlarda `Authorization: dev 42:Ali` sarlavhasi qabul qilinadi.
Productionda (`NODE_ENV=production`) bu rejim avtomatik o'chiriladi.
