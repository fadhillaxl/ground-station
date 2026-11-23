# Panduan Setup Icom IC-9700 (`rigctld` + Dekoder SSTV Webtop/QSSTV)

Dokumen ini menjelaskan langkah konfigurasi integrasi radio **Icom IC-9700** dengan aplikasi **Ground Station** untuk:
1. **Kontrol Frekuensi & Kompensasi Doppler (`rigctld`)** yang dijalankan secara manual di mesin host pada port `4532`.
2. **Dekoder SSTV (`qsstv-web`)** berbasis Docker Webtop/QSSTV di port `7002` yang membaca **USB Audio CODEC** dari Icom IC-9700 dan tampil menyatu di halaman `/sstv-decoder`.

---

## 1. Menjalankan `rigctld` Secara Manual di Mesin Host (Port `4532`)

Ketika Icom IC-9700 dihubungkan ke server melalui kabel USB, sistem operasi akan membuat dua port serial virtual serta satu kartu suara **USB Audio CODEC**:
- **Pada Windows / Server dengan mapping COM**:
  - **`COM3` (Port A / CI-V)**: Digunakan untuk kontrol CAT / CI-V (`rigctld -m 3081 -r COM3 -s 115200 -T 0.0.0.0 -t 4532`).
  - **`COM4` (Port B / Audio & Data)**: Digunakan untuk jalur Audio / Data bersama **USB Audio CODEC** (`48000 Hz`).
- **Pada Linux**:
  - **`if00` (`/dev/ttyUSB0`)**: Digunakan untuk kontrol CAT / CI-V (`rigctld`).
  - **`if02` (`/dev/ttyUSB1`)**: Port B (GPS/DV data) bersama kartu suara ALSA `plughw:CARD=CODEC,DEV=0`.

### A. Cek Path Device USB Icom IC-9700
Jalankan perintah berikut di terminal mesin host:
```bash
ls -l /dev/serial/by-id/
```
Cari perangkat yang berakhiran **`-if00`** (contoh: `/dev/serial/by-id/usb-Silicon_Labs_CP2102N_USB_to_UART_Bridge_Controller_IC-9700_...-if00-port0` atau `/dev/ttyUSB0`).

### B. Pastikan Pengaturan Menu CI-V pada Radio IC-9700
Pada layar menu Icom IC-9700 (`MENU` → `SET` → `Connectors` → `CI-V`):
- **CI-V Baud Rate**: `115200` (atau sesuaikan dengan argumen `-s`)
- **CI-V Address**: `A2h` (default IC-9700 untuk Hamlib model `3081`)
- **CI-V USB Port**: `Unlink from [REMOTE]` (agar baud rate `115200` aktif melalui USB)
- **CI-V USB Baud Rate**: `115200`
- **CI-V USB Echo Back**: `ON` (atau `OFF` sesuai kebutuhan aplikasi)

### C. Jalankan Daemon `rigctld`
Jalankan perintah berikut secara manual di mesin host (ganti `<port_usb_if00>` dengan path serial `if00` Anda):
```bash
rigctld -m 3081 -r <port_usb_if00> -s 115200 -T 0.0.0.0 -t 4532 -vvvv
```
Contoh:
```bash
rigctld -m 3081 -r /dev/ttyUSB0 -s 115200 -T 0.0.0.0 -t 4532
```
Keterangan argumen:
- `-m 3081`: ID model Hamlib untuk **Icom IC-9700**.
- `-r <port_usb_if00>`: Port serial USB CI-V (`if00`).
- `-s 115200`: Kecepatan komunikasi serial (baud rate).
- `-T 0.0.0.0`: Mengizinkan koneksi TCP dari container Docker (`ground-station`).
- `-t 4532`: Port TCP `rigctld` (standar Hamlib).

---

## 2. Menjalankan Container `ground-station` & `qsstv-web`

Jalankan kedua layanan menggunakan Docker Compose dari direktori root proyek:
```bash
docker compose up -d --build
```

Layanan yang berjalan:
- **`ground-station`**: Berjalan di port internal `7000` (dipetakan ke `7070:7000` di host) dan memiliki `extra_hosts: ["host.docker.internal:host-gateway"]` agar dapat menghubungi `rigctld` di host.
- **`qsstv-web`**: Berjalan di port `7002` (`7002:3000`) dengan passthrough `/dev/snd:/dev/snd` untuk membaca perangkat suara **USB Audio CODEC** dari IC-9700.

---

## 3. Instalasi Awal & Konfigurasi `qsstv` di Webtop (Port `7002` / Menu `SSTV`)

1. Buka aplikasi Ground Station dan klik menu **SSTV** di sidebar kiri (rute `/sstv-decoder`), atau akses langsung `http://<ip-server>:7002/sstv/`.
2. Jika `qsstv` belum terinstal otomatis melalui `DOCKER_MODS`, buka terminal di dalam desktop Webtop lalu jalankan:
   ```bash
   sudo apt update && sudo apt install -y qsstv pulseaudio pavucontrol alsa-utils
   ```
3. Verifikasi bahwa **USB Audio CODEC** dari Icom IC-9700 terbaca di dalam container:
   ```bash
   arecord -l
   ```
   Pastikan muncul perangkat `card X: CODEC [USB Audio CODEC]`.
4. Jalankan **QSSTV** dari menu aplikasi atau terminal (`qsstv`):
   - Masuk ke menu **Options** → **Configuration** → tab **Sound**:
     - **Sound Input**: Pilih **PulseAudio** (lalu arahkan input `qsstv` ke `Burr-Brown from TI USB Audio CODEC` melalui `pavucontrol`), atau pilih **ALSA** dengan device `plughw:CARD=CODEC,DEV=0`.
     - **Input Sampling Clock**: `48000` Hz.
   - Masuk ke tab **Directories**:
     - Set **Received Images Path** ke `/config/Desktop/sstv_decoded` agar setiap gambar SSTV yang berhasil didekode otomatis tersimpan di folder `./backend/data/decoded` milik Ground Station.

---

## 4. Parameter Pengisian **Hardware → Rigs** di Web UI Ground Station

Agar fitur **Live Tracking** di Ground Station dapat mengendalikan frekuensi Doppler Icom IC-9700 melalui `rigctld` yang berjalan di host:

1. Buka Web UI Ground Station → masuk ke menu **System → Hardware** (`/admin/system/hardware/rigs`).
2. Klik **Add** untuk menambahkan konfigurasi Rig baru dengan parameter berikut:
   - **Name**: `Icom IC-9700`
   - **Host**: `host.docker.internal` *(atau IP LAN / bridge gateway mesin host, misal `172.17.0.1`)*
   - **Port**: `4532`
   - **Radio Type / Control Type**: `hamlib` / `rigctld` (Network `NET rigctl`)
   - **Tx Type / VFO Mode**: Sesuaikan dengan operasi satelit (misal VFO Main/Sub sesuai kebutuhan downlink/uplink)
3. Klik **Save**, lalu uji koneksi pada halaman **Live Tracking** (`/tracking`) dengan memilih rig **Icom IC-9700** dan menekan tombol **Connect**.

---

## 5. Konfigurasi Reverse Proxy Nginx (`/sstv/`)

Pastikan blok `location /sstv/` dari [deploy/nginx/ground-station.conf.example](file:///Users/mm/ground-station/deploy/nginx/ground-station.conf.example) telah diterapkan pada server Nginx Anda (diletakkan **sebelum** `location /`):
- Meneruskan trafik `/sstv/` ke `http://127.0.0.1:7002`.
- Mengaktifkan dukungan WebSocket (`Upgrade` dan `Connection "upgrade"`), `proxy_buffering off`, serta header `X-Frame-Options "SAMEORIGIN"`.

---

## 6. Demodulator Paket AX.25 & Telemetri Satelit (`Direwolf` + `IC-9700`)

Ground Station dilengkapi fitur **Packet & Telemetry** (`/packets`) yang terhubung ke **Direwolf KISS TCP Server (Port `8001`)** dan memantau status **`rigctld` eksternal (Port `4532`)** secara *read-only*.

### A. Konfigurasi `direwolf.conf`
File [`direwolf.conf`](file:///Users/mm/ground-station/direwolf.conf) di root repositori telah dikonfigurasi untuk:
- **Audio Input**: `ADEVICE plughw:CARD=CODEC,DEV=0` dengan `ARATE 48000` dan `ACHANNELS 2`.
- **Channel 0 (`MODEM 1200`)**: AFSK 1200 bps untuk paket APRS satelit (LAPAN-A2 / IO-86 `YB0X-1`, ISS `RS0ISS`).
- **Channel 1 (`MODEM 9600`)**: FSK/GFSK 9600 bps (G3RUH/K9NG) untuk downlink telemetri biner CubeSat.
- **PTT via Hamlib Net**: `PTT RIG 2 host.docker.internal:4532` (menggunakan `rigctld` manual pada port `4532` tanpa menyentuh `/dev/ttyUSB0` secara langsung).
- **Network TNC**: `AGWPORT 8000` dan `KISSPORT 8001`.

### B. Menjalankan Direwolf (Container Modular atau Manual di Host)
- **Opsi 1 — Melalui Docker Compose Profile (`direwolf`)**:
  ```bash
  docker compose --profile direwolf up -d
  ```
- **Opsi 2 — Menjalankan Direwolf Manual di Host**:
  Jika Direwolf dijalankan langsung di host OS, ubah `PTT RIG 2 host.docker.internal:4532` menjadi `PTT RIG 2 127.0.0.1:4532` pada `direwolf.conf`, lalu jalankan:
  ```bash
  direwolf -t 0 -c direwolf.conf
  ```
  Backend Ground Station akan otomatis terhubung (*auto-reconnect*) ke KISS TCP port `8001`.
