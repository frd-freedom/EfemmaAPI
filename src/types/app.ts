export const ADMIN_EMAIL = 'predimahrobi@gmail.com';
export const FREE_DAILY_LIMIT = 10;
export const PRO_DAILY_LIMIT = 5000;

export type UserRole = string;
export type NotificationPriority = 'normal' | 'penting' | 'always';
export type PageRoute =
  | { page: 'welcome' }
  | { page: 'docs'; endpointId: string }
  | { page: 'keys' }
  | { page: 'pricing' }
  | { page: 'admin' }
  | { page: 'cs' }
  | { page: 'faq' }
  | { page: 'sosmed' }
  | { page: 'public-chat' };

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  apiKey: string;
  creditsUsedToday: number;
  creditsResetDate: string; // YYYY-MM-DD
  dailyLimit: number; // 10 for free, 5000 for pro, -1 for admin
  roleAssignedAt?: number;
  roleExpiresAt?: number; // 0 = no expiry, >0 = epoch ms
  suspended?: boolean;
  suspendedReason?: string;
  suspendedAt?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UsageLogItem {
  id: string;
  uid: string;
  endpointId: string;
  method: 'GET' | 'POST';
  path: string;
  status: number;
  latencyMs: number;
  createdAt?: { seconds: number } | null;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  priority: NotificationPriority;
  active: boolean;
  createdBy: string;
  createdAt?: { seconds: number } | null;
  updatedAt?: { seconds: number } | null;
}

export interface PricingPlanItem {
  id: string;
  audience: string;
  name: string;
  price: string;
  cadence: string;
  dailyLimit?: number; // -1 = Unlimited, >=1 = batas kredit harian
  features: string[];
  buttonLabel: string;
  actionType: 'keys' | 'whatsapp';
  whatsappMessage: string;
  highlighted: boolean;
}

export interface PricingComparisonRow {
  feature: string;
  freeValue: string;
  proValue: string;
  enterpriseValue: string;
}

export interface FooterLinkItem {
  label: string;
  url: string;
}

export interface CsChannelItem {
  label: string;
  value: string;
  url: string;
  note: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface SosmedItem {
  platform: string;
  handle: string;
  description: string;
  url: string;
}

export interface SiteContent {
  brandName: string;
  loginButtonLabel: string;
  logoutConfirmTitle: string;
  logoutConfirmMessage: string;
  logoutConfirmYesLabel: string;
  logoutConfirmCancelLabel: string;
  welcomePageTitle: string;
  welcomePageSubtitle: string;
  bannerSubtitle: string;
  welcomeBannerImageUrl: string;
  introHeading: string;
  introParagraph1: string;
  introParagraph2: string;
  welcomeCardDocsTitle: string;
  welcomeCardDocsDesc: string;
  welcomeCardDocsBtn: string;
  welcomeCardKeysTitle: string;
  welcomeCardKeysDesc: string;
  welcomeCardKeysBtn: string;
  welcomeCardPricingTitle: string;
  welcomeCardPricingDesc: string;
  welcomeCardPricingBtn: string;
  docsNotice: string;
  docsRunButtonLabel: string;
  docsLoginButtonLabel: string;
  docsUpgradeButtonLabel: string;
  docsViewKeyButtonLabel: string;
  keysPageTitle: string;
  keysPageSubtitle: string;
  keysGenerateButtonLabel: string;
  keysUsageHeading: string;
  pricingTitle: string;
  pricingSubtitle: string;
  pricingComparisonTitle: string;
  whatsappNumber: string;
  pricingPlans: PricingPlanItem[];
  pricingComparisonRows: PricingComparisonRow[];
  footerTitle: string;
  footerVersion: string;
  footerLinks: FooterLinkItem[];
  footerGithubUrl: string;
  footerBrandDesc: string;
  footerCopyright: string;
  footerRightNote: string;
  spotifyPlayerTitle: string;
  spotifyPlayerBadge: string;
  spotifyPlayerDesc: string;
  categoryOrder: string[];
  hiddenCategories: string[];
  hiddenEndpointIds: string[];
  privateEndpointIds: string[];
  privateEndpointRoles: Record<string, UserRole[]>;
  hubCsLabel: string;
  hubFaqLabel: string;
  hubSosmedLabel: string;
  hubPublicChatLabel: string;
  csPageTitle: string;
  csPageSubtitle: string;
  csResponseHours: string;
  csChannels: CsChannelItem[];
  faqPageTitle: string;
  faqPageSubtitle: string;
  faqItems: FaqItem[];
  sosmedPageTitle: string;
  sosmedPageSubtitle: string;
  sosmedItems: SosmedItem[];
  publicChatTitle: string;
  publicChatBadge: string;
  publicChatSubtitle: string;
  publicChatDescription: string;
  publicChatCtaLabel: string;
  publicChatCtaUrl: string;
}

export const DEFAULT_CATEGORY_ORDER = ['cuaca', 'kurs', 'integrasi', 'spotify'];

export const DEFAULT_SITE_CONTENT: SiteContent = {
  brandName: 'EfemmaAPI',
  loginButtonLabel: 'Masuk Google',
  logoutConfirmTitle: 'Keluar dari Akun?',
  logoutConfirmMessage:
    'Apakah Anda yakin ingin keluar dari sesi saat ini? Anda harus masuk kembali menggunakan Google untuk mengakses Playground dan API Key.',
  logoutConfirmYesLabel: 'Ya, Keluar',
  logoutConfirmCancelLabel: 'Batal',
  welcomePageTitle: 'Welcome',
  welcomePageSubtitle: 'Dokumentasi EfemmaAPI untuk developer.',
  bannerSubtitle: 'Documents / EfemmaAPI',
  welcomeBannerImageUrl: '',
  introHeading: 'Selamat Datang di EfemmaAPI',
  introParagraph1:
    'EfemmaAPI adalah platform layanan REST API terintegrasi yang dirancang untuk membantu proses pengembangan aplikasi secara efisien dan terstruktur. Dokumentasi ini menjadi pusat referensi untuk memahami endpoint cuaca real-time, konversi mata uang global, serta integrasi pihak ketiga.',
  introParagraph2:
    'Gunakan navigasi di samping untuk menjelajahi setiap endpoint, menguji permintaan secara langsung melalui Playground menggunakan API Key Anda, atau memantau batas kredit harian.',
  welcomeCardDocsTitle: 'Jelajahi Endpoint',
  welcomeCardDocsDesc:
    'Uji endpoint cuaca, kurs mata uang, integrasi pihak ketiga, dan Spotify Music.',
  welcomeCardDocsBtn: 'Buka Dokumentasi',
  welcomeCardKeysTitle: 'Kunci API & Kuota',
  welcomeCardKeysDesc: 'Dapatkan 10 kredit gratis setiap hari dan kelola API Key Anda.',
  welcomeCardKeysBtn: 'Kelola Kunci',
  welcomeCardPricingTitle: 'Paket & Upgrade',
  welcomeCardPricingDesc:
    'Bandingkan kuota harian Free, Pro, dan Enterprise sesuai trafik aplikasi.',
  welcomeCardPricingBtn: 'Lihat Tabel Harga',
  docsNotice:
    'Setiap akun Free mendapatkan kuota 10 kredit per hari. Mengganti atau membuat ulang API Key tidak mereset kredit yang sudah terpakai pada hari berjalan.',
  docsRunButtonLabel: 'Kirim Permintaan (1 Kredit)',
  docsLoginButtonLabel: 'Masuk Google',
  docsUpgradeButtonLabel: 'Upgrade Kuota',
  docsViewKeyButtonLabel: 'Lihat API Key',
  keysPageTitle: 'Kunci API & Pemakaian Kredit',
  keysPageSubtitle:
    'Kelola token x-efemma-key dan pantau batas permintaan harian akun Anda.',
  keysGenerateButtonLabel: 'Generate Key Baru',
  keysUsageHeading: 'Riwayat Permintaan Terbaru',
  pricingTitle: 'Paket & Upgrade Kuota API',
  pricingSubtitle:
    'Pilih paket sesuai volume permintaan aplikasi Anda. Pembelian upgrade role diproses cepat melalui WhatsApp kami.',
  pricingComparisonTitle: 'Tabel Perbandingan Fitur & Kuota',
  whatsappNumber: '6281234567890',
  pricingPlans: [
    {
      id: 'free',
      audience: 'Untuk Eksperimen',
      name: 'Free',
      price: 'Rp 0',
      cadence: '/ selamanya',
      dailyLimit: 10,
      features: [
        '10 kredit per hari',
        'Akses penuh Playground & SDK',
        'Otomatis aktif saat login Google',
      ],
      buttonLabel: 'Kelola Kunci API',
      actionType: 'keys',
      whatsappMessage: '',
      highlighted: false,
    },
    {
      id: 'pro',
      audience: 'Untuk Produksi',
      name: 'Pro',
      price: 'Rp 99.000',
      cadence: '/ bulan',
      dailyLimit: 5000,
      features: [
        '5.000 kredit per hari',
        'Prioritas routing regional Asia',
        'Riwayat log pemakaian tersimpan',
      ],
      buttonLabel: 'Beli Paket Pro via WhatsApp',
      actionType: 'whatsapp',
      whatsappMessage: 'Halo Admin EfemmaAPI, saya ingin membeli/upgrade ke paket Role Pro.',
      highlighted: true,
    },
    {
      id: 'enterprise',
      audience: 'Skala Korporasi',
      name: 'Enterprise',
      price: 'Kustom',
      cadence: '/ sesuai SLA',
      dailyLimit: -1,
      features: [
        'Kredit harian Unlimited',
        'Endpoint integrasi kustom',
        'Pendampingan teknis langsung',
      ],
      buttonLabel: 'Hubungi via WhatsApp',
      actionType: 'whatsapp',
      whatsappMessage: 'Halo Admin EfemmaAPI, saya ingin konsultasi paket Role Enterprise.',
      highlighted: false,
    },
  ],
  pricingComparisonRows: [
    {
      feature: 'Kredit Harian Endpoint',
      freeValue: '10 kredit / hari',
      proValue: '5.000 kredit / hari',
      enterpriseValue: 'Unlimited',
    },
    {
      feature: 'Akses Modul Cuaca, Kurs, Integrasi & Spotify',
      freeValue: 'Semua endpoint',
      proValue: 'Semua endpoint',
      enterpriseValue: 'Semua + Kustom',
    },
    {
      feature: 'Rotasi Kunci API (x-efemma-key)',
      freeValue: 'Tersedia (kredit tidak reset)',
      proValue: 'Tersedia',
      enterpriseValue: 'Multi-key & Isolasi',
    },
    {
      feature: 'Webhook HMAC-SHA256 Signing',
      freeValue: 'Tersedia',
      proValue: 'Prioritas Tinggi',
      enterpriseValue: 'Secret Terdedikasi',
    },
  ],
  footerTitle: 'EfemmaAPI Docs',
  footerVersion: 'v2.0.2',
  footerLinks: [
    { label: 'Welcome', url: '#welcome' },
    { label: 'Dokumentasi', url: '#docs' },
    { label: 'Kunci API', url: '#keys' },
    { label: 'Paket & Harga', url: '#pricing' },
  ],
  footerGithubUrl: 'https://github.com',
  footerBrandDesc:
    'Penyedia layanan REST API cuaca, konversi mata uang, integrasi pihak ketiga, dan Spotify.',
  footerCopyright: '© 2026 EfemmaAPI. Seluruh hak cipta dilindungi.',
  footerRightNote: 'Autentikasi Header x-efemma-key.',
  spotifyPlayerTitle: 'Spotify Web Scrape & YouTube Full Song Player',
  spotifyPlayerBadge: 'TANPA API KEY',
  spotifyPlayerDesc:
    'Metadata, trending, genre, artis, album, playlist, podcast, dan lirik diambil langsung dari web Spotify tanpa Client ID/Secret. Pemutaran Full Song menggunakan audio secara langsung.',
  categoryOrder: DEFAULT_CATEGORY_ORDER,
  hiddenCategories: [],
  hiddenEndpointIds: [],
  privateEndpointIds: [],
  privateEndpointRoles: {},
  hubCsLabel: 'Kontak CS',
  hubFaqLabel: 'FAQ',
  hubSosmedLabel: 'Sosmed',
  hubPublicChatLabel: 'Public Chat',
  csPageTitle: 'Kontak Customer Service',
  csPageSubtitle:
    'Butuh bantuan integrasi endpoint, kendala kuota, atau aktivasi paket Pro & Enterprise? Hubungi tim dukungan kami melalui kanal resmi di bawah ini.',
  csResponseHours: 'Setiap Hari, 08:00 – 22:00 WIB',
  csChannels: [
    {
      label: 'WhatsApp CS Resmi',
      value: '+62 812-3456-7890',
      url: 'https://wa.me/6281234567890',
      note: 'Respon cepat untuk bantuan teknis, API Key, dan upgrade paket.',
    },
    {
      label: 'Email Support',
      value: 'support@efemma.my.id',
      url: 'mailto:support@efemma.my.id',
      note: 'Untuk laporan bug detail, SLA bisnis, dan kerja sama enterprise.',
    },
    {
      label: 'Telegram Support',
      value: '@efemma_support',
      url: 'https://t.me/efemma_support',
      note: 'Konsultasi cepat seputar integrasi REST API.',
    },
  ],
  faqPageTitle: 'Pertanyaan Umum (FAQ)',
  faqPageSubtitle:
    'Temukan jawaban cepat seputar penggunaan EfemmaAPI, header x-efemma-key, kuota kredit harian, dan pemutaran Spotify.',
  faqItems: [
    {
      question: 'Bagaimana cara mendapatkan API Key EfemmaAPI?',
      answer:
        'Klik tombol Masuk Google di pojok kanan atas. Akun Anda langsung aktif sebagai pengguna Free dengan 10 kredit gratis setiap hari dan kunci x-efemma-key otomatis dibuat di halaman Kunci API.',
    },
    {
      question: 'Apakah membuat ulang (Generate) API Key mereset kuota harian?',
      answer:
        'Tidak. Pemakaian kredit harian tercatat per akun dan otomatis direset setiap pergantian hari pada pukul 00:00 WIB (Asia/Jakarta).',
    },
    {
      question: 'Apakah endpoint Spotify memerlukan Client ID atau API Key Spotify sendiri?',
      answer:
        'Tidak perlu. Seluruh metadata Spotify, lirik, pemutaran full song audio, dan pemutaran podcast langsung diproses dari server kami hanya dengan Header x-efemma-key EfemmaAPI.',
    },
    {
      question: 'Bagaimana cara upgrade ke paket Pro atau Enterprise?',
      answer:
        'Buka halaman Paket & Upgrade lalu pilih paket yang sesuai untuk terhubung langsung dengan admin kami via WhatsApp. Aktivasi role dilakukan segera setelah konfirmasi.',
    },
  ],
  sosmedPageTitle: 'Sosial Media & Komunitas',
  sosmedPageSubtitle:
    'Ikuti kanal resmi kami untuk pembaruan fitur, rilis endpoint baru, serta informasi pemeliharaan layanan.',
  sosmedItems: [
    {
      platform: 'GitHub',
      handle: 'github.com/efemmaapi',
      description: 'Contoh kode SDK, skrip integrasi, dan repositori terbuka.',
      url: 'https://github.com',
    },
    {
      platform: 'WhatsApp Channel',
      handle: 'EfemmaAPI Updates',
      description: 'Pengumuman rilis endpoint baru dan pemberitahuan maintenance real-time.',
      url: 'https://whatsapp.com/channel/0029VaExample',
    },
    {
      platform: 'Discord Komunitas',
      handle: 'Efemma Dev Hub',
      description: 'Forum tanya jawab sesama developer dan showcase aplikasi.',
      url: 'https://discord.com',
    },
    {
      platform: 'Instagram',
      handle: '@efemma.studio',
      description: 'Tips pengembangan API dan sorotan pembaruan platform.',
      url: 'https://instagram.com',
    },
  ],
  publicChatTitle: 'Public Chat Komunitas',
  publicChatBadge: 'Soon',
  publicChatSubtitle:
    'Ruang obrolan real-time bagi seluruh pengguna dan developer EfemmaAPI sedang disiapkan.',
  publicChatDescription:
    'Kami sedang membangun ruang Public Chat terintegrasi agar sesama developer dapat berdiskusi langsung seputar integrasi endpoint, berbagi snippet kode, serta mendapatkan pengumuman cepat.\n\nSambil menunggu peluncuran resmi fitur ini, Anda tetap dapat menghubungi tim kami melalui halaman Kontak CS atau bergabung di kanal Sosial Media resmi.',
  publicChatCtaLabel: 'Hubungi Kontak CS',
  publicChatCtaUrl: '#cs',
};

export function getTodayDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function generateApiKey(isAdmin: boolean): string {
  const bytes = new Uint8Array(12);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${isAdmin ? 'efm_adm_' : 'efm_live_'}${hex}`;
}

export function buildWhatsappUrl(rawPhone: string, message: string): string {
  const digits = rawPhone.replace(/[^0-9]/g, '') || '6281234567890';
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
