# Social Media Dashboard

Aplikasi web untuk memantau performa akun media sosial (YouTube, TikTok, Instagram) dalam satu tampilan terpadu, dibangun menggunakan **Next.js** (App Router) dengan TypeScript.

---

## Fitur Utama

- Menampilkan profil, total views, dan konten terbaru dari 3 platform sekaligus
- Sistem **caching** in-memory untuk menghindari permintaan API berulang
- **Rate limiter** per platform untuk mencegah penyalahgunaan endpoint
- **Quota tracker** harian agar penggunaan API tidak melampaui batas gratis
- Fetch aman dengan timeout, size limit, dan deteksi error autentikasi

---

## Struktur Proyek

```
├── app/
│   └── page.tsx               # Halaman utama dashboard
├── components/
│   └── PlatformCard.tsx        # Kartu tampilan per platform
├── app/api/
│   ├── youtube/route.ts        # Endpoint YouTube Data API v3
│   ├── tiktok/route.ts         # Endpoint TikTok via RapidAPI
│   └── instagram/route.ts      # Endpoint Instagram Graph API
├── lib/
│   ├── api-cache.ts            # Cache in-memory dengan TTL
│   ├── fetch-safe.ts           # Wrapper fetch (timeout, auth, size)
│   ├── rate-limiter.ts         # Pembatas request per window waktu
│   └── quota-tracker.ts        # Pelacak kuota harian
└── types/index.ts              # Tipe data global (PlatformData, ContentItem)
```

---

## 🔧 Pendekatan yang Digunakan

### 1. API Route Terpisah per Platform
Setiap platform memiliki route handler sendiri (`/api/youtube`, `/api/tiktok`, `/api/instagram`) agar logika pengambilan data terisolasi dan mudah di-maintain secara independen.

### 2. Caching In-Memory (TTL 30 menit)
Respons API disimpan sementara menggunakan `Map` dengan waktu kedaluwarsa. Jika data masih valid, server langsung mengembalikan cache tanpa memanggil API eksternal lagi — menghemat kuota dan mempercepat respons.

### 3. Rate Limiter Sliding Window
Setiap platform dibatasi jumlah request dalam rentang waktu tertentu:
- YouTube: maks 5 request/menit
- TikTok: maks 10 request/menit
- Instagram: maks 180 request/jam

### 4. Quota Tracker Harian
Karena setiap platform memiliki batas kuota API harian (terutama YouTube Data API v3 yang mahal per-operasi), tracker menghitung estimasi biaya per request dan memberikan peringatan saat mendekati batas.

### 5. `fetchSafe` — Fetch yang Lebih Aman
Wrapper di atas `fetch` native yang menambahkan:
- **Timeout** otomatis (default 10 detik)
- **Batas ukuran respons** (maks 5 MB)
- **Deteksi error autentikasi** (401/403 → lempar `AuthError`)

---

## ⚠️ Kendala yang Ditemui

### 1. Perbedaan Struktur Respons Antar Platform
Setiap API mengembalikan format data yang berbeda-beda. Contohnya, TikTok via RapidAPI menggunakan field `aweme_id` atau `video_id` secara bergantian, sementara Instagram memisahkan data insights dari data media utama.

**Solusi:** Menggunakan optional chaining (`?.`) dan fallback (`??`) secara konsisten, serta mendefinisikan interface TypeScript per platform agar pemetaan data lebih aman dan eksplisit.

### 2. Kuota YouTube yang Cepat Habis
YouTube Data API v3 menggunakan sistem poin; satu siklus pencarian + detail channel + daftar video + statistik video membutuhkan sekitar **202 poin** dari total kuota harian 10.000 poin.

**Solusi:** Kuota dikonfigurasi di `QUOTA_CONFIGS` dengan `costPerRequest: 202` dan batas `9800` (dengan buffer), dilengkapi peringatan otomatis saat pemakaian mencapai 80%.

### 3. Instagram Insights Tidak Selalu Tersedia
Tidak semua jenis media mendukung endpoint `/insights`. Reels, video, dan foto memiliki metrik yang berbeda, dan endpoint bisa mengembalikan error untuk akun atau konten tertentu.

**Solusi:** Fungsi `fetchMediaViews` dibungkus `try/catch` dengan fallback ke `like_count` jika insights gagal diambil, sehingga data tetap tampil meski tidak lengkap.

### 4. Potensi Race Condition pada Quota & Rate Limiter
Karena store menggunakan `Map` dalam memory Node.js (bukan database), state akan hilang saat server restart dan tidak aman untuk deployment multi-instance.

**Solusi (saat ini):** Pendekatan ini cukup untuk deployment single-instance atau development. Untuk produksi skala besar, store perlu diganti dengan **Redis** atau solusi terpusat lainnya.

---

## 🚀 Cara Menjalankan

```bash
# Install dependensi
npm install

# Salin dan isi variabel lingkungan
cp .env.example .env.local

# Jalankan server development
npm run dev
```

### Variabel Lingkungan yang Dibutuhkan

```env
YOUTUBE_API_KEY=           # Google Cloud Console → YouTube Data API v3
INSTAGRAM_ACCESS_TOKEN=    # Meta for Developers → Instagram Graph API
RAPIDAPI_KEY_TIKTOK=       # RapidAPI → TikTok Scraper7
```

---

## 📦 Teknologi yang Digunakan

| Teknologi | Kegunaan |
|---|---|
| Next.js 14 (App Router) | Framework utama + API Routes |
| TypeScript | Type safety di seluruh codebase |
| Tailwind CSS | Styling komponen UI |
| Lucide React | Ikon antarmuka |
| YouTube Data API v3 | Data channel & video YouTube |
| Instagram Graph API | Data profil & media Instagram |
| RapidAPI (TikTok Scraper7) | Data profil & video TikTok |

---

> Dibuat sebagai proyek dashboard analitik media sosial multi-platform dengan fokus pada efisiensi penggunaan API dan ketahanan terhadap error.
