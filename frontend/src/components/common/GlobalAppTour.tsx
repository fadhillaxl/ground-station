import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, IconButton, Tooltip } from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import CloseIcon from '@mui/icons-material/Close';
import { driver, DriveStep, Driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export interface AppTourStepDefinition {
  id: string;
  category: 'overview' | 'navigation' | 'telemetry' | 'configuration' | 'action';
  selector?: string;
  title: string;
  description: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

/**
 * Daftar lengkap langkah onboarding interaktif Ground Station:
 * Mencakup Navigasi Utama, Panel Telemetri/Monitoring, Form Konfigurasi, dan Tombol Aksi.
 */
export const APP_TOUR_STEPS: AppTourStepDefinition[] = [
  {
    id: 'welcome',
    category: 'overview',
    title: '🛰️ Selamat Datang di Ground Station Control',
    description:
      'Panduan interaktif ini menjelaskan seluruh fungsi utama aplikasi: <b>Navigasi Utama</b>, <b>Panel Telemetri & Monitoring</b>, <b>Form Konfigurasi</b>, serta <b>Tombol Aksi Operasional</b>.',
  },

  // === 1. NAVIGASI UTAMA & TOOLBAR ===
  {
    id: 'nav-drawer-toggle',
    category: 'navigation',
    selector: '[data-tour="nav-drawer-toggle"]',
    title: '1. Navigasi: Tombol Buka/Tutup Menu Samping',
    description:
      'Gunakan tombol ini untuk memperluas atau menyembunyikan sidebar navigasi utama agar area kerja monitoring lebih luas.',
    side: 'bottom',
    align: 'start',
  },
  {
    id: 'nav-sidebar',
    category: 'navigation',
    selector: '[data-tour="nav-sidebar"]',
    title: '2. Navigasi Utama Modul Ground Station',
    description:
      'Sidebar ini menghubungkan seluruh modul operasional: <b>Earth View</b>, <b>Live Tracking</b>, <b>RF Waterfall</b>, <b>TT&C Telemetry</b>, <b>RASCube</b>, <b>Scheduled Observations</b>, hingga <b>Admin & Hardware Settings</b>.',
    side: 'right',
    align: 'start',
  },
  {
    id: 'nav-item-tracking',
    category: 'navigation',
    selector: '[data-tour="nav-item-tracking"]',
    title: '3. Navigasi: Live Tracking (Kontrol Antena & Radio)',
    description:
      'Halaman utama operasi real-time untuk melacak orbit satelit, mengendalikan rotator antena (Hamlib <code>rotctld</code>), dan mengontrol kompensasi Doppler pada radio rig.',
    side: 'right',
    align: 'center',
  },
  {
    id: 'nav-item-waterfall',
    category: 'navigation',
    selector: '[data-tour="nav-item-waterfall"]',
    title: '4. Navigasi: RF Waterfall & Spektrum SDR',
    description:
      'Buka tampilan spektrum frekuensi radio dan waterfall SDR secara real-time untuk memonitor sinyal pembawa satelit dan dekoder paket.',
    side: 'right',
    align: 'center',
  },
  {
    id: 'nav-item-ttnc',
    category: 'navigation',
    selector: '[data-tour="nav-item-ttnc"]',
    title: '5. Navigasi: TT&C & RASCube Telemetry',
    description:
      'Akses dashboard telemetri satelit (tegangan bus, suhu OBC/EPS, arus solar panel, grafik historis, serta inspeksi raw hex frame).',
    side: 'right',
    align: 'center',
  },
  {
    id: 'nav-item-hardware',
    category: 'navigation',
    selector: '[data-tour="nav-item-admin/system/hardware"]',
    title: '6. Navigasi: Konfigurasi Hardware & Satelit',
    description:
      'Menu administrasi untuk mendaftarkan dan mengatur parameter koneksi perangkat keras (SDR, Radio Rig, Rotator TCP/IP, Kamera) serta sinkronisasi katalog TLE satelit.',
    side: 'right',
    align: 'center',
  },
  {
    id: 'toolbar-actions',
    category: 'navigation',
    selector: '[data-tour="toolbar-actions"]',
    title: '7. Bar Status Sistem & Indikator Koneksi',
    description:
      'Menampilkan status koneksi Socket.IO backend, ringkasan satelit aktif, status perangkat keras (Rotator/Rig), proses latar belakang, waktu UTC/Lokal, serta pengubah tema.',
    side: 'bottom',
    align: 'end',
  },
  {
    id: 'toolbar-edit-layout',
    category: 'action',
    selector: '[data-tour="toolbar-edit-layout"]',
    title: '8. Tombol Aksi: Kustomisasi Tata Letak (Grid Editor)',
    description:
      'Klik ikon pensil ini untuk mengaktifkan mode geser & ubah ukuran (drag-and-resize) pada seluruh panel dashboard, lalu klik tanda centang untuk menyimpan.',
    side: 'bottom',
    align: 'center',
  },
  {
    id: 'user-menu-button',
    category: 'navigation',
    selector: '[data-tour="user-menu-button"]',
    title: '9. Profil Pengguna & Preferensi',
    description:
      'Akses cepat menuju pengaturan preferensi akun (zona waktu, bahasa, notifikasi) dan tombol keluar (Logout).',
    side: 'right',
    align: 'end',
  },

  // === 2. PANEL TELEMETRI & MONITORING (LIVE TRACKING) ===
  {
    id: 'target-selector-bar',
    category: 'configuration',
    selector: '[data-tour="target-selector-bar"]',
    title: '10. Form Pilih Target Satelit & Grup',
    description:
      'Pilih grup satelit dan target satelit (NORAD ID) yang ingin dilacak. Anda juga dapat mengelola beberapa sesi target secara paralel.',
    side: 'bottom',
    align: 'start',
  },
  {
    id: 'tracking-map-island',
    category: 'telemetry',
    selector: '[data-tour="tracking-map-island"]',
    title: '11. Panel Monitoring: Peta Jejak Orbit & Footprint',
    description:
      'Visualisasi real-time posisi satelit di atas permukaan bumi, footprint cakupan antena, lintasan orbit, dan posisi stasiun bumi.',
    side: 'bottom',
    align: 'center',
  },
  {
    id: 'rotator-panel',
    category: 'telemetry',
    selector: '[data-tour="rotator-panel"]',
    title: '12. Panel Kontrol & Telemetri Rotator Antena',
    description:
      'Panel utama pengendali rotator via protokol TCP Hamlib <code>rotctld</code>. Menampilkan status koneksi, arah kompas Azimuth, dan sudut Elevasi antena secara real-time.',
    side: 'left',
    align: 'start',
  },
  {
    id: 'rotator-select-form',
    category: 'configuration',
    selector: '[data-tour="rotator-select-form"]',
    title: '13. Form Konfigurasi: Pilihan Perangkat Rotator',
    description:
      'Pilih unit rotator yang terdaftar (host:port) dan klik tombol <b>Settings (⚙️)</b> di sebelahnya untuk mengubah host, port TCP, batas minimum/maksimum AZ/EL, atau mode azimuth.',
    side: 'left',
    align: 'center',
  },
  {
    id: 'rotator-gauges',
    category: 'telemetry',
    selector: '[data-tour="rotator-gauges"]',
    title: '14. Panel Telemetri: Dial Azimuth & Elevasi Real-Time (60fps)',
    description:
      'Jarum indikator menampilkan pergerakan halus (interpolasi real-time) posisi aktual antena (AZ° dan EL°) terhadap posisi target satelit serta batas perangkat keras.',
    side: 'left',
    align: 'center',
  },
  {
    id: 'rotator-nudge-buttons',
    category: 'action',
    selector: '[data-tour="rotator-nudge-buttons"]',
    title: '15. Tombol Aksi: Kemudi Manual (Nudge CCW / CW / Up / Down)',
    description:
      'Saat rotator terhubung, gunakan tombol <b>CCW</b>, <b>CW</b>, <b>Up</b>, dan <b>Down</b> untuk mengoreksi atau mengarahkan sudut antena secara manual.',
    side: 'top',
    align: 'center',
  },
  {
    id: 'rotator-connection-actions',
    category: 'action',
    selector: '[data-tour="rotator-connection-actions"]',
    title: '16. Tombol Aksi: Connect, Disconnect, & Park Rotator',
    description:
      '<b>Connect</b> membuka sesi socket TCP ke <code>rotctld</code>, <b>Disconnect</b> memutus sesi, dan <b>Park</b> mengembalikan antena ke posisi parkir aman.',
    side: 'top',
    align: 'center',
  },
  {
    id: 'rotator-track-actions',
    category: 'action',
    selector: '[data-tour="rotator-track-actions"]',
    title: '17. Tombol Aksi: Track Otomatis & Stop (Halt)',
    description:
      'Klik <b>Track</b> agar antena otomatis mengikuti pergerakan satelit (`P <az> <el>`), atau klik <b>Stop</b> untuk segera menghentikan putaran rotator (`S\\n`).',
    side: 'top',
    align: 'center',
  },
  {
    id: 'rig-panel',
    category: 'telemetry',
    selector: '[data-tour="rig-panel"]',
    title: '18. Panel Kontrol & Telemetri Radio Rig',
    description:
      'Mengelola perangkat radio/SDR untuk kompensasi pergeseran frekuensi Doppler otomatis selama satelit melintas.',
    side: 'left',
    align: 'start',
  },
  {
    id: 'rig-config-form',
    category: 'configuration',
    selector: '[data-tour="rig-config-form"]',
    title: '19. Form Konfigurasi: Pilihan Radio Rig, Transmitter, & VFO',
    description:
      'Pilih unit radio rig, transponder/transmitter satelit (Uplink/Downlink), serta konfigurasi VFO 1 & VFO 2.',
    side: 'left',
    align: 'center',
  },
  {
    id: 'rig-telemetry-display',
    category: 'telemetry',
    selector: '[data-tour="rig-telemetry-display"]',
    title: '20. Panel Telemetri: Layar LCD Frekuensi & Doppler Shift',
    description:
      'Memantau frekuensi aktif VFO 1, VFO 2, serta nilai koreksi Doppler Shift dalam satuan Hz secara langsung.',
    side: 'top',
    align: 'center',
  },
  {
    id: 'rig-action-buttons',
    category: 'action',
    selector: '[data-tour="rig-action-buttons"]',
    title: '21. Tombol Aksi: Connect & Track Radio Rig',
    description:
      'Hubungkan radio rig dan aktifkan <b>Track Radio</b> agar frekuensi radio terus disinkronkan mengikuti pergeseran Doppler satelit.',
    side: 'top',
    align: 'center',
  },
  {
    id: 'tracking-passes-island',
    category: 'telemetry',
    selector: '[data-tour="tracking-passes-island"]',
    title: '22. Panel Monitoring: Jadwal Lintasan Satelit (Next Passes)',
    description:
      'Tabel prediksi waktu lintasan satelit berikutnya (AOS, LOS, Peak Elevation, Azimuth, dan durasi lintasan).',
    side: 'top',
    align: 'center',
  },
  {
    id: 'tracking-timeline-island',
    category: 'telemetry',
    selector: '[data-tour="tracking-timeline-island"]',
    title: '23. Panel Monitoring: Timeline Lintasan Horizon',
    description:
      'Grafik kurva lintasan satelit terhadap waktu untuk memvisualisasikan kapan satelit berada di atas horizon.',
    side: 'top',
    align: 'center',
  },

  // === 3. PANEL TELEMETRI TT&C / RASCUBE / WATERFALL / EARTHVIEW (KONTEKSTUAL) ===
  {
    id: 'telemetry-topbar',
    category: 'action',
    selector: '[data-tour="telemetry-topbar"]',
    title: 'Bar Kontrol Telemetri TT&C & Ekspor Data',
    description:
      'Pilih satelit sumber telemetri, jeda/lanjutkan aliran paket real-time (Live/Paused), atau ekspor data telemetri ke format CSV dan JSON.',
    side: 'bottom',
    align: 'start',
  },
  {
    id: 'telemetry-metrics',
    category: 'telemetry',
    selector: '[data-tour="telemetry-metrics"]',
    title: 'Panel Telemetri: Kartu Parameter Utama Satelit',
    description:
      'Menampilkan indikator kritis satelit secara instan: tegangan baterai, suhu OBC/EPS, RSSI sinyal, arus panel surya, dan status kesehatan subsistem.',
    side: 'bottom',
    align: 'center',
  },
  {
    id: 'telemetry-charts',
    category: 'telemetry',
    selector: '[data-tour="telemetry-charts"]',
    title: 'Panel Telemetri: Grafik Tren Historis',
    description:
      'Grafik time-series untuk menganalisis fluktuasi tegangan bus, arus EPS, suhu, dan daya selama lintasan berlangsung.',
    side: 'top',
    align: 'center',
  },
  {
    id: 'telemetry-decoded-params',
    category: 'telemetry',
    selector: '[data-tour="telemetry-decoded-params"]',
    title: 'Panel Telemetri: Tabel Parameter Terdekode',
    description:
      'Daftar lengkap seluruh field telemetri hasil dekode beserta nilai aktual, satuan, dan batas ambang normal.',
    side: 'top',
    align: 'center',
  },
  {
    id: 'telemetry-raw-frames',
    category: 'telemetry',
    selector: '[data-tour="telemetry-raw-frames"]',
    title: 'Panel Telemetri: Raw Hex Frame Inspector',
    description:
      'Inspeksi paket data mentah (hexadecimal byte stream) yang diterima dari demodulator/TNC untuk keperluan debugging protokol.',
    side: 'top',
    align: 'center',
  },
  {
    id: 'rascube-topbar',
    category: 'configuration',
    selector: '[data-tour="rascube-topbar"]',
    title: 'Konfigurasi Koneksi Serial RASCube',
    description:
      'Pilih port serial/USB atau WebSerial untuk menghubungkan stasiun bumi dengan kit satelit edukasi RASCube.',
    side: 'bottom',
    align: 'start',
  },
  {
    id: 'rascube-metrics',
    category: 'telemetry',
    selector: '[data-tour="rascube-metrics"]',
    title: 'Panel Telemetri RASCube (EPS, Attitude, & Sensor)',
    description:
      'Memantau tegangan baterai, arus solar panel, orientasi gyroscope/accelerometer, serta sensor lingkungan RASCube.',
    side: 'bottom',
    align: 'center',
  },
  {
    id: 'rascube-uplink',
    category: 'action',
    selector: '[data-tour="rascube-uplink"]',
    title: 'Tombol Aksi: Konsol Perintah Uplink RASCube',
    description:
      'Kirim perintah telecommand langsung ke satelit: <b>Ping</b>, <b>Blink LED</b>, <b>Trigger Camera</b>, atau kirim paket perintah kustom.',
    side: 'left',
    align: 'center',
  },
  {
    id: 'rascube-camera',
    category: 'telemetry',
    selector: '[data-tour="rascube-camera"]',
    title: 'Panel Monitoring: Kamera Payload RASCube',
    description:
      'Menampilkan citra hasil tangkapan kamera payload yang dikirimkan per-chunk melalui tautan telemetri.',
    side: 'right',
    align: 'center',
  },
  {
    id: 'waterfall-display',
    category: 'telemetry',
    selector: '[data-tour="waterfall-display"]',
    title: 'Panel Monitoring: Spektrum FFT & RF Waterfall',
    description:
      'Visualisasi kepadatan spektrum sinyal radio secara real-time. Klik atau geser frekuensi untuk menala penerima SDR.',
    side: 'right',
    align: 'center',
  },
  {
    id: 'waterfall-settings-form',
    category: 'configuration',
    selector: '[data-tour="waterfall-settings-form"]',
    title: 'Form Konfigurasi: Parameter SDR & Demodulator',
    description:
      'Atur perangkat SDR, frekuensi tengah (center frequency), gain, sample rate, bandwidth filter, colormap waterfall, dan perekaman IQ/audio.',
    side: 'left',
    align: 'start',
  },
  {
    id: 'earthview-group-selector',
    category: 'configuration',
    selector: '[data-tour="earthview-group-selector"]',
    title: 'Form Filter Grup Satelit Global',
    description:
      'Pilih konstelasi atau kategori satelit untuk ditampilkan secara simultan pada peta Earth View.',
    side: 'bottom',
    align: 'start',
  },
  {
    id: 'earthview-map',
    category: 'telemetry',
    selector: '[data-tour="earthview-map"]',
    title: 'Panel Monitoring: Peta Konstelasi Earth View',
    description:
      'Peta interaktif 2D/3D yang memvisualisasikan posisi seluruh satelit dalam grup beserta jadwal lintasan terdekat.',
    side: 'bottom',
    align: 'center',
  },

  // === 4. FORM KONFIGURASI SISTEM & HARDWARE ===
  {
    id: 'settings-tabs',
    category: 'configuration',
    selector: '[data-tour="settings-tabs"]',
    title: 'Tab Kategori Konfigurasi Sistem & Hardware',
    description:
      'Berpindah antar sub-menu konfigurasi: <b>SDRs</b>, <b>Rigs</b>, <b>Rotators</b>, <b>Cameras</b>, <b>Katalog Satelit</b>, <b>Lokasi Ground Station</b>, dan <b>Preferensi</b>.',
    side: 'bottom',
    align: 'start',
  },
  {
    id: 'settings-form-content',
    category: 'configuration',
    selector: '[data-tour="settings-form-content"]',
    title: 'Form Konfigurasi & Tabel Perangkat',
    description:
      'Tambahkan, ubah, atau hapus konfigurasi perangkat keras dan pengaturan stasiun bumi melalui formulir dan tabel interaktif di area ini.',
    side: 'top',
    align: 'center',
  },
];

/**
 * Mengecek apakah sebuah elemen DOM benar-benar terlihat di layar saat ini
 * agar Driver.js hanya menyorot elemen yang aktif pada viewport/halaman.
 */
function findVisibleTourElement(selector?: string): HTMLElement | null {
  if (!selector || typeof document === 'undefined') {
    return null;
  }
  const candidates = document.querySelectorAll<HTMLElement>(selector);
  for (const el of Array.from(candidates)) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    ) {
      return el;
    }
  }
  return null;
}

/**
 * Menyusun langkah Driver.js berdasarkan elemen `[data-tour]` yang tersedia di DOM.
 */
export function buildActiveDriveSteps(
  steps: AppTourStepDefinition[] = APP_TOUR_STEPS
): DriveStep[] {
  const activeSteps: DriveStep[] = [];

  for (const step of steps) {
    if (!step.selector) {
      activeSteps.push({
        popover: {
          title: step.title,
          description: step.description,
          side: step.side,
          align: step.align,
        },
      });
      continue;
    }

    const visibleEl = findVisibleTourElement(step.selector);
    if (visibleEl) {
      activeSteps.push({
        element: visibleEl,
        popover: {
          title: step.title,
          description: step.description,
          side: step.side || 'bottom',
          align: step.align || 'center',
        },
      });
    }
  }

  return activeSteps;
}

export const GlobalAppTour: React.FC = () => {
  const driverRef = useRef<Driver | null>(null);
  // Keep visibility in local component state only so the button can be dismissed
  // during the current view/session, but always reappears on a fresh page load.
  const [isVisible, setIsVisible] = useState<boolean>(true);

  useEffect(() => {
    return () => {
      if (driverRef.current) {
        driverRef.current.destroy();
        driverRef.current = null;
      }
    };
  }, []);

  const handleStartTour = useCallback(() => {
    if (driverRef.current) {
      driverRef.current.destroy();
    }

    const activeSteps = buildActiveDriveSteps(APP_TOUR_STEPS);

    const driverObj = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayOpacity: 0.65,
      stagePadding: 6,
      stageRadius: 8,
      progressText: 'Langkah {{current}} dari {{total}}',
      nextBtnText: 'Lanjut →',
      prevBtnText: '← Kembali',
      doneBtnText: 'Selesai ✓',
      steps: activeSteps,
    });

    driverRef.current = driverObj;
    driverObj.drive();
  }, []);

  const handleDismiss = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsVisible(false);
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 1350,
        display: 'inline-flex',
        alignItems: 'center',
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        borderRadius: '999px',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
        border: '1px solid rgba(255, 255, 255, 0.22)',
        backdropFilter: 'blur(8px)',
        pr: 0.5,
        '&:hover': {
          transform: 'translateY(-1px)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
        },
        transition: 'transform 150ms ease, box-shadow 150ms ease',
      }}
    >
      <Tooltip
        title="Mulai tur interaktif penjelasan seluruh navigasi, panel telemetri, konfigurasi, dan tombol aksi"
        placement="left"
      >
        <Button
          variant="text"
          color="inherit"
          onClick={handleStartTour}
          startIcon={<SchoolIcon />}
          data-tour="tour-launch-button"
          aria-label="Training / Panduan Lengkap"
          sx={{
            borderRadius: '999px 0 0 999px',
            pl: 2.25,
            pr: 1.25,
            py: 1,
            fontWeight: 700,
            fontSize: '0.82rem',
            textTransform: 'none',
            color: 'inherit',
            '&:hover': {
              bgcolor: 'rgba(255, 255, 255, 0.12)',
            },
          }}
        >
          Training / Panduan Lengkap
        </Button>
      </Tooltip>
      <Tooltip
        title="Sembunyikan tombol Training (muncul kembali saat halaman dimuat ulang)"
        placement="top"
      >
        <IconButton
          size="small"
          color="inherit"
          onClick={handleDismiss}
          data-tour="tour-dismiss-button"
          aria-label="Sembunyikan tombol Training"
          sx={{
            p: 0.5,
            color: 'inherit',
            opacity: 0.85,
            '&:hover': {
              opacity: 1,
              bgcolor: 'rgba(255, 255, 255, 0.18)',
            },
          }}
        >
          <CloseIcon sx={{ fontSize: '1rem' }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default GlobalAppTour;
