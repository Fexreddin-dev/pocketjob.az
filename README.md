# PocketJob — quraşdırma və istifadə təlimatı

Bu layihə köhnə tək-fayllı saytın tam yenilənmiş versiyasıdır. Əsas fərq: **gizli açarlar artıq brauzerdə deyil**, elanlar və mesajlar **real bazada** saxlanılır.

## Layihənin quruluşu

```
pocketjob/
├── public/                  ← saytın özü (Netlify buranı yayımlayır)
│   ├── index.html
│   ├── qaydalar.html        ← istifadə qaydaları və məxfilik
│   ├── css/styles.css
│   ├── js/                  ← proqramın kodu
│   │   └── config.js        ← ★ yalnız bu faylı redaktə edəcəksiniz
│   └── vendor/supabase.js   ← verilənlər bazası kitabxanası (hazır)
├── netlify/functions/       ← gizli açarlarla işləyən server kodu
│   ├── ai-parse.mjs         ← Gemini (AI) ilə elan mətninin analizi
│   └── boost-job.mjs        ← elanı irəli çəkmək və Telegram-a göndərmək
├── supabase/schema.sql      ← verilənlər bazasının qurulması
├── netlify.toml             ← Netlify tənzimləməsi və təhlükəsizlik başlıqları
└── README.md
```

## Nə dəyişdi və hansı problemlər həll olundu

| Əvvəlki problem | İndiki həll |
|---|---|
| Gemini və Telegram açarları səhifə kodunda açıq idi | Açarlar yalnız Netlify-da (Environment variables) saxlanılır, brauzerə çıxmır |
| Elanlar `localStorage`-da idi, hər cihaz ayrı görürdü | Supabase bazası: hamı eyni elanları görür, yeni elanlar canlı çıxır |
| Çat yalnız bir cihazda işləyirdi | Həqiqi söhbət: namizəd və işəgötürən fərqli telefonlardan yazışır, oxunmamış mesaj sayı göstərilir |
| Ntfy kanalında hər kəs saxta elan göndərə/silə bilirdi | Ntfy ləğv edildi. Hər elanı yalnız sahibi silə/dəyişə bilər (bazada qayda ilə təmin edilir) |
| XSS riski (`innerHTML`) | Bütün mətnlər avtomatik escape olunur, inline `onclick` yoxdur, CSP başlığı aktivdir |
| Sahiblik brauzerdəki təsadüfi ID ilə idi | Supabase hesabı; istəyə görə e-poçta bağlanır, başqa cihazdan daxil olmaq mümkündür |
| Köhnə `gemini-1.5-flash` modeli | Model adı Netlify-da dəyişdirilə bilir, ehtiyat model də var |
| Tarix və ödəniş sərbəst mətn idi | Strukturlu sahələr (tarix, saat, məbləğ), müddəti bitən elanlar avtomatik gizlənir |
| Spam | 1 saatda ən çox 5 elan, dəqiqədə 20 mesaj; 3 şikayətdən sonra elan gizlədilir |

**Yeniliklər:** axtarış (hərf fərqinə həssas deyil: `neftciler` = `Neftçilər`), sahə və şəhər filtri, "daha çox göstər", elan detalı və paylaşma linki, elan önizləməsi, şəkil avtomatik kiçildilməsi, açıq/tünd görünüş, mobil alt menyu, telefona quraşdırıla bilən (PWA) sayt, şikayət et düyməsi, elanı bağla/yenidən aç, Telegram-da elana keçid.

---

## QURAŞDIRMA (təxminən 30 dəqiqə)

### Addım 0 — Köhnə açarları ləğv edin (ƏN VACİBİ)

Köhnə saytın kodunda açarlar hamıya görünürdü, ona görə onlar artıq "yanıb".

1. **Telegram:** `@BotFather` → `/mybots` → botunuzu seçin → *API Token* → *Revoke current token*. Yeni token alın (Addım 4-də lazım olacaq).
2. **Gemini:** [Google AI Studio](https://aistudio.google.com/apikey) → köhnə açarı silin → yeni açar yaradın.
3. Köhnə saytı (tək `index.html`) yeni versiya ilə əvəz edəcəksiniz.

### Addım 1 — Supabase (baza) qurun

1. [supabase.com](https://supabase.com) → pulsuz hesab → **New project**. Ad: `pocketjob`, bölgə: Avropa (Frankfurt və ya yaxın). Verilənlər bazası parolunu saxlayın.
2. Layihə hazır olanda sol menyuda **SQL Editor → New query**. `supabase/schema.sql` faylının **bütün** məzmununu yapışdırın və **Run** edin. "Success" görməlisiniz.
3. **Authentication → Sign In / Providers** (və ya *Providers*) bölməsində **Allow anonymous sign-ins** düyməsini **aktiv** edin. (Bu olmasa, elan yaratmaq işləməz.)
4. **Authentication → URL Configuration**:
   - *Site URL*: `https://pocketjob.netlify.app` (öz ünvanınız)
   - *Redirect URLs*: eyni ünvanı əlavə edin
5. **Project Settings → API** bölməsindən iki dəyəri kopyalayın:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public** açar (yeni paneldə *Publishable key* adlana bilər)

> E-poçt göndərişi (hesabı qorumaq üçün) Supabase-in pulsuz paketində saatda az sayda məhduddur. Çox istifadəçi gözləyirsinizsə, **Authentication → Emails → SMTP Settings** bölməsində öz SMTP xidmətinizi qoşun.

### Addım 2 — `config.js`-i doldurun

`public/js/config.js` faylını açın, iki sətri dəyişin:

```js
SUPABASE_URL: 'https://xxxx.supabase.co',
SUPABASE_ANON_KEY: 'sizin-anon-public-açarınız',
```

Bu iki dəyər **gizli deyil**, ictimaidir (bazanı qorumaq `schema.sql`-dəki qaydalarla edilir).

### Addım 3 — Kodu GitHub-a yükləyin

Netlify funksiyaları üçün "drag & drop" yetərli deyil, GitHub və ya CLI lazımdır. Ən asan yol:

1. [github.com](https://github.com) → **New repository** (məsələn `pocketjob`, *Private* olsa yaxşıdır).
2. **uploading an existing file** linkinə klikləyin və bu qovluğun **bütün** məzmununu (`public`, `netlify`, `supabase`, `netlify.toml`, …) sürükləyin → **Commit changes**.

### Addım 4 — Netlify-a qoşun

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project → GitHub** → `pocketjob` repozitoriyasını seçin.
2. Build ayarlarına toxunmayın (`netlify.toml` hər şeyi bilir). **Deploy** edin.
3. **Site configuration → Environment variables** bölməsində bunları əlavə edin:

| Ad | Dəyər |
|---|---|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_ANON_KEY` | Supabase anon public açar |
| `GEMINI_API_KEY` | Google AI Studio-dan **yeni** açar |
| `TELEGRAM_BOT_TOKEN` | BotFather-dən **yeni** token |
| `TELEGRAM_CHAT_ID` | `@pocketjob_elanlar` |
| `SITE_URL` | `https://pocketjob.netlify.app` (öz ünvanınız) |
| `GEMINI_MODEL` | *(istəyə görə)* boş qoysanız `gemini-flash-latest` işlədilir |

4. **Deploys → Trigger deploy → Deploy site** (dəyişənlərin işə düşməsi üçün).
5. Telegram botunun kanalda **administrator** olduğundan əmin olun (mesaj göndərmək icazəsi ilə).

> Qeyd: Google `gemini-2.5-flash` modelini 16 Oktyabr 2026-da bağlayır. Bu layihə ona bağlı deyil, `gemini-flash-latest` və ehtiyat `gemini-3.1-flash-lite` istifadə edir. Google yenə ad dəyişsə, yalnız `GEMINI_MODEL` dəyişənini yeniləyin.

### Addım 5 — Yoxlayın

- [ ] Sayt açılır, "Hazırda 0 aktiv elan" yazır (səhv bildirişi yoxdur)
- [ ] **Elan yarat** → bir cümlə yazın → **Elanı hazırla** → forma dolur (AI cavab verməsə də offline analiz doldurur)
- [ ] **Elanı paylaş** → elan "Mənim elanlarım"da və əsas siyahıda görünür
- [ ] Başqa brauzerdən (və ya gizli pəncərədən) elana **Mesaj yaz** → ilk brauzerdə **Mesajlar**-da görünür
- [ ] **İrəli çək** → Telegram kanalında mesaj çıxır
- [ ] Mobil telefonda sayt düzgün görünür (alt menyu var)

---

## Gündəlik istifadə və idarəetmə

- **Elanlara nəzarət:** Supabase → *Table Editor → jobs*. `status = hidden` elanlar şikayətlə gizlədilənlərdir. Yoxlayıb düzgündürsə `status`-u `active`-ə qaytarın.
- **Şikayətlər:** *Table Editor → reports*.
- **Köhnə elanların təmizlənməsi:** müddəti bitən elanlar saytda görünmür, amma bazada qalır. `schema.sql`-in sonundakı `pg_cron` hissəsini aktiv etsəniz, 30 gündən köhnələr avtomatik silinir.
- **Bot hücumundan qorunma:** *Authentication → Attack Protection → Enable CAPTCHA* (Cloudflare Turnstile pulsuzdur). Bu, saxta anonim hesabların kütləvi yaranmasının qarşısını alır.
- **Ehtiyat nüsxə:** Supabase pulsuz paketdə avtomatik ehtiyat nüsxə saxlamır. Vacib olduqda *Database → Backups* və ya `pg_dump` istifadə edin.
- **Öz domeniniz:** Netlify → *Domain management* və sonra Supabase *Site URL*-i də yeniləyin.

## Yerli sınaq (istəyə görə)

```bash
npm i -g netlify-cli
netlify dev
```

`.env` faylında Addım 4-dəki dəyişənləri yazın (bu faylı GitHub-a yükləməyin, `.gitignore`-da artıq var).

## Texniki qeydlər

- Hər istifadəçi ilk əməliyyatında (elan yaratmaq, mesaj yazmaq, şikayət) avtomatik **anonim hesab** alır. Sadəcə baxanlar üçün hesab yaranmır.
- Anonim hesab yalnız həmin brauzerdədir. **Hesab → E-poçtu bağla** ilə qorunur.
- Telefon nömrələri elanda hamıya görünür. Bu, qısamüddətli işlərdə sürət üçün qəsdən belədir və `qaydalar.html`-də qeyd olunub. Hüquqi mətni öz hüquqşünasınızla yoxlayın.
- Şəkillər: maksimum 2 MB, avtomatik 1280 piksellə kiçildilir, Supabase Storage-də saxlanılır.
- Supabase kitabxanası (`public/vendor/supabase.js`, v2.117.2) saytın özündən yüklənir, xarici CDN-ə ehtiyac yoxdur.
