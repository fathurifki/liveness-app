# Face Liveness SDK Kit

Platform lokal untuk membangun, menguji, dan memproduksi Face Liveness Detection SDK. Project ini punya dua sisi:

- **SDK Kit**: tool internal untuk labeling data, tuning konfigurasi, upload model, testing, dan build package SDK.
- **Generated SDK**: library yang nantinya dipakai developer eksternal melalui `npm install`.

Tujuan akhirnya sederhana: tim internal mengatur model dan konfigurasi di SDK Kit, lalu menghasilkan SDK React yang siap dipasang di aplikasi KYC, autentikasi biometrik, atau sistem keamanan.

## Cara Kerja Singkat

```
SDK Kit (internal)                    Generated SDK (produk)
Labeling data                         npm install @liveness/face-detection-sdk
Training / upload model        ->     import { LivenessCamera } from '...'
Tuning config                         Model dan config sudah dibundel
Build package                         Siap dipakai di aplikasi React
```

Liveness detection memastikan wajah yang terlihat adalah manusia asli, bukan foto, video replay, atau spoofing sederhana. SDK ini menggabungkan:

- **Quality check** untuk pencahayaan, blur, dan jarak wajah.
- **Active challenge** seperti kedip, angguk, senyum, buka mulut, dan gaze target.
- **Anti-spoofing** dengan heuristic dan dukungan ONNX model.

## Fitur Utama

- Real-time face detection berbasis MediaPipe FaceMesh.
- Challenge acak untuk mengurangi risiko replay attack.
- Quality warning otomatis untuk membantu user mengikuti instruksi.
- Dukungan ONNX model untuk akurasi yang lebih baik.
- UI React siap pakai melalui `LivenessCamera`.
- Dashboard internal untuk data, model, konfigurasi, history, debug, dan build SDK.
- Backend lokal berbasis Express dan SQLite.

## Requirement

- Node.js 18 atau lebih baru.
- Browser modern: Chrome 90+, Firefox 88+, Safari 14+, atau Edge 90+.
- Kamera webcam/laptop.
- `localhost` atau HTTPS untuk akses kamera.

## Setup

```bash
npm install
npm run db:init
npm run dev
```

Setelah berjalan:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`

Command yang sering dipakai:

```bash
npm run dev:client   # frontend only
npm run dev:server   # backend only
npm run dev          # frontend + backend
npm run build        # build app
npm run build:lib    # build library SDK
npm run preview      # preview production build
```

## Halaman SDK Kit

- **Dashboard**: statistik sessions, models, builds, dan aktivitas terbaru.
- **Test SDK**: menjalankan liveness check langsung dari browser.
- **Labeling**: review session dan label REAL/SPOOF.
- **Models**: upload ONNX model, lihat versi, dan set model aktif.
- **Config**: tuning threshold seperti anti-spoof, brightness, blur, dan pass score.
- **Builder**: generate package SDK dari model dan config aktif.
- **History**: lihat hasil test dan metadata verifikasi.
- **Debug Logger**: pantau log runtime saat testing.

## Workflow Internal

1. Jalankan **Test SDK** untuk mengumpulkan session.
2. Buka **Labeling** untuk menandai session sebagai REAL atau SPOOF.
3. Export dataset untuk training.
4. Training model di environment terpisah, lalu download ONNX.
5. Upload model di halaman **Models**.
6. Tuning threshold di **Config**.
7. Build package melalui **Builder**.
8. Publish hasil build dari `data/builds/`.

## Integrasi SDK React

Cara paling cepat adalah memakai komponen `LivenessCamera`.

```tsx
import { LivenessCamera } from '@liveness/face-detection-sdk'
import '@liveness/face-detection-sdk/styles.css'

function App() {
  return (
    <LivenessCamera
      config={{
        challengeCount: 2,
        antiSpoofThreshold: 0.6,
        passScore: 70,
      }}
      onResult={(result) => {
        if (result.status === 'passed') {
          // lanjutkan proses user
          return
        }

        // tampilkan retry flow
      }}
    />
  )
}
```

Jika masih berada di repo ini, import lokalnya:

```tsx
import { LivenessCamera } from './components/LivenessCamera'
```

## Konfigurasi Penting

Parameter yang paling sering dituning:

| Parameter | Default | Fungsi |
| --- | ---: | --- |
| `challengeCount` | `2` | Jumlah challenge dalam satu sesi |
| `challengeTimeoutMs` | `8000` | Timeout per challenge dalam ms |
| `antiSpoofThreshold` | `0.6` | Ambang confidence anti-spoof |
| `passScore` | `70` | Score minimum agar verifikasi lulus |
| `minBrightness` | `40` | Batas minimum pencahayaan |
| `maxBrightness` | `220` | Batas maksimum pencahayaan |
| `minBlurScore` | `80` | Batas minimum ketajaman |
| `minFaceSize` | `0.15` | Ukuran wajah minimum di frame |
| `maxFaceSize` | `0.80` | Ukuran wajah maksimum di frame |

Challenge yang tersedia:

- `blink`
- `nod_top`
- `nod_bottom`
- `yaw_left`
- `yaw_right`
- `smile`
- `open_mouth`
- `gaze_target`

## API Internal

Backend lokal dipakai oleh SDK Kit untuk menyimpan dan mengelola data.

- `GET /api/stats`
- `GET /api/stats/labeling`
- `GET /api/sessions`
- `POST /api/sessions`
- `POST /api/sessions/export`
- `POST /api/labels/:id`
- `POST /api/labels/:id/skip`
- `GET /api/models`
- `POST /api/models`
- `PUT /api/models/:id/activate`
- `GET /api/configs`
- `POST /api/configs`
- `GET /api/configs/presets/list`
- `GET /api/builds`
- `POST /api/builds`

## Struktur Project

```
liveness-app/
├── src/
│   ├── pages/              # Dashboard, Labeling, Models, Config, Builder
│   ├── components/         # UI components, termasuk LivenessCamera
│   ├── hooks/              # useLiveness
│   ├── core/               # type dan default config
│   ├── adapters/           # MediaPipe dan ONNX adapters
│   ├── utils/              # quality, challenge, scoring, anti-spoof
│   └── lib/                # API client
├── server/                 # Express + SQLite API
├── public/                 # asset publik dan model runtime
└── data/                   # database, sessions, models, exports, builds
```

`data/` berisi file lokal dan tidak perlu ikut commit.

## Build dan Publish SDK

Build aplikasi dashboard:

```bash
npm run build
```

Build library SDK:

```bash
npm run build:lib
```

Hasil build package SDK disiapkan di `data/builds/` oleh fitur Builder. Setelah package final tersedia:

```bash
cd data/builds/liveness-sdk-vX.X.X
npm publish
```

## Backup Data Lokal

```bash
zip -r backup-$(date +%Y-%m-%d).zip data/
```

Restore:

```bash
unzip backup-2026-05-23.zip
```

## Production Notes

- Gunakan HTTPS untuk akses kamera di production.
- Validasi hasil liveness ulang di server, jangan hanya percaya hasil client.
- Pakai session token dengan expiry untuk mencegah replay.
- Tambahkan rate limiting untuk percobaan verifikasi.
- Simpan audit log untuk kebutuhan investigasi fraud.
- Jika menggunakan WebAssembly/ONNX di hosting tertentu, pastikan header COOP/COEP sesuai kebutuhan runtime.

## Troubleshooting

**Kamera tidak muncul**

- Cek permission kamera di browser.
- Pastikan berjalan di `localhost` atau HTTPS.
- Coba Chrome jika browser lain bermasalah.

**Model lambat dimuat**

- Self-host model MediaPipe/ONNX.
- Aktifkan compression di server.
- Pastikan file model tidak terlalu besar untuk target device.

**Verifikasi terlalu sering gagal**

- Turunkan `antiSpoofThreshold`.
- Kurangi `challengeCount`.
- Perpanjang `challengeTimeoutMs`.
- Tuning ulang quality threshold di halaman Config.

## License

MIT
