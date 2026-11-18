export type ApiCategory = 'cuaca' | 'kurs' | 'integrasi' | 'spotify';
export type HttpMethod = 'GET' | 'POST';

export interface ApiParamSpec {
  name: string;
  location: 'query' | 'body';
  type: 'string' | 'number' | 'select' | 'json';
  required: boolean;
  defaultValue: string;
  placeholder?: string;
  options?: string[];
  description: string;
  presets?: Array<{ label: string; value: string }>;
}

export interface ResponseFieldSpec {
  field: string;
  type: string;
  description: string;
}

export interface ApiEndpointSpec {
  id: string;
  category: ApiCategory;
  categoryLabel: string;
  method: HttpMethod;
  path: string;
  title: string;
  summary: string;
  params: ApiParamSpec[];
  responseFields: ResponseFieldSpec[];
  sampleResponse: Record<string, unknown>;
}

export const CATEGORY_LABELS: Record<'semua' | ApiCategory, string> = {
  semua: 'Semua Endpoint',
  cuaca: 'Data Cuaca',
  kurs: 'Mata Uang',
  integrasi: 'Integrasi Pihak Ketiga',
  spotify: 'Spotify Music & Audio',
};

export const API_ENDPOINTS: ApiEndpointSpec[] = [
  {
    id: 'cuaca-sekarang',
    category: 'cuaca',
    categoryLabel: 'Data Cuaca',
    method: 'GET',
    path: '/api/v1/cuaca/sekarang',
    title: 'Cuaca Saat Ini',
    summary:
      'Mengambil kondisi meteorologi terkini berdasarkan nama kota meliputi suhu udara, kelembapan, tekanan permukaan, kecepatan angin, dan deskripsi WMO berbahasa Indonesia.',
    params: [
      {
        name: 'kota',
        location: 'query',
        type: 'string',
        required: true,
        defaultValue: '',
        placeholder: 'Contoh: Jakarta, Bandung, Tokyo',
        description: 'Nama kota atau wilayah tujuan pengamatan cuaca.',
        presets: [
          { label: 'Jakarta', value: 'Jakarta' },
          { label: 'Bandung', value: 'Bandung' },
          { label: 'Surabaya', value: 'Surabaya' },
          { label: 'Singapore', value: 'Singapore' },
        ],
      },
      {
        name: 'unit',
        location: 'query',
        type: 'select',
        required: false,
        defaultValue: '',
        options: ['celsius', 'fahrenheit'],
        description: 'Satuan temperatur keluaran yang diinginkan.',
      },
    ],
    responseFields: [
      { field: 'sukses', type: 'boolean', description: 'Menandakan permintaan berhasil diproses.' },
      { field: 'lokasi.kota', type: 'string', description: 'Nama kota hasil resolusi geokode.' },
      { field: 'lokasi.koordinat', type: 'object', description: 'Pasangan lintang dan bujur wilayah.' },
      { field: 'cuaca.kondisi', type: 'string', description: 'Ringkasan kondisi cuaca dalam Bahasa Indonesia.' },
      { field: 'cuaca.suhu', type: 'number', description: 'Suhu udara aktual sesuai satuan yang dipilih.' },
      { field: 'cuaca.kelembapan_persen', type: 'number', description: 'Kelembapan relatif udara (0–100%).' },
      { field: 'cuaca.kecepatan_angin_kmj', type: 'number', description: 'Kecepatan angin pada ketinggian 10 meter (km/j).' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'cuaca-sekarang',
      sumber_data: 'open-meteo-live',
      lokasi: {
        kota: 'Jakarta',
        negara: 'Indonesia',
        kode_negara: 'ID',
        koordinat: { lintang: -6.2088, bujur: 106.8456 },
        zona_waktu: 'Asia/Jakarta',
      },
      cuaca: {
        waktu_pengamatan: '2026-11-15T19:15',
        kondisi: 'Berawan Sebagian',
        kode_wmo: 2,
        suhu: 30.4,
        terasa_seperti: 31.8,
        satuan_suhu: '°C',
        kelembapan_persen: 72,
        kecepatan_angin_kmj: 12.6,
        tekanan_permukaan_hpa: 1011.2,
      },
    },
  },
  {
    id: 'cuaca-prakiraan',
    category: 'cuaca',
    categoryLabel: 'Data Cuaca',
    method: 'GET',
    path: '/api/v1/cuaca/prakiraan',
    title: 'Prakiraan Cuaca Harian',
    summary:
      'Menyajikan proyeksi cuaca harian hingga 7 hari ke depan mencakup suhu minimum/maksimum, total curah hujan, kecepatan angin puncak, dan indeks UV.',
    params: [
      {
        name: 'kota',
        location: 'query',
        type: 'string',
        required: true,
        defaultValue: '',
        placeholder: 'Contoh: Bandung, Yogyakarta',
        description: 'Nama kota target prakiraan harian.',
        presets: [
          { label: 'Bandung', value: 'Bandung' },
          { label: 'Yogyakarta', value: 'Yogyakarta' },
          { label: 'Denpasar', value: 'Denpasar' },
        ],
      },
      {
        name: 'hari',
        location: 'query',
        type: 'number',
        required: false,
        defaultValue: '',
        placeholder: '1 hingga 7',
        description: 'Jumlah hari prakiraan yang diminta (maksimal 7 hari).',
      },
    ],
    responseFields: [
      { field: 'jumlah_hari', type: 'number', description: 'Total entri prakiraan harian yang dikembalikan.' },
      { field: 'prakiraan[].tanggal', type: 'string', description: 'Tanggal prakiraan dalam format ISO YYYY-MM-DD.' },
      { field: 'prakiraan[].suhu_maks_c', type: 'number', description: 'Estimasi suhu tertinggi harian (°C).' },
      { field: 'prakiraan[].suhu_min_c', type: 'number', description: 'Estimasi suhu terendah harian (°C).' },
      { field: 'prakiraan[].curah_hujan_mm', type: 'number', description: 'Akumulasi curah hujan harian dalam milimeter.' },
      { field: 'prakiraan[].indeks_uv_maks', type: 'number', description: 'Indeks radiasi UV puncak harian.' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'cuaca-prakiraan',
      sumber_data: 'open-meteo-live',
      lokasi: { kota: 'Bandung', negara: 'Indonesia', zona_waktu: 'Asia/Jakarta' },
      jumlah_hari: 3,
      prakiraan: [
        {
          tanggal: '2026-11-16',
          kondisi: 'Hujan Ringan',
          kode_wmo: 61,
          suhu_maks_c: 27.0,
          suhu_min_c: 19.7,
          curah_hujan_mm: 4.2,
          angin_maks_kmj: 12.9,
          indeks_uv_maks: 7.4,
        },
      ],
    },
  },
  {
    id: 'kurs-konversi',
    category: 'kurs',
    categoryLabel: 'Mata Uang',
    method: 'GET',
    path: '/api/v1/kurs/konversi',
    title: 'Konversi Mata Uang',
    summary:
      'Menghitung konversi nilai tukar antar 150+ mata uang global (ISO-4217) termasuk Rupiah (IDR), Dolar AS (USD), Euro (EUR), Yen (JPY), dan Dolar Singapura (SGD).',
    params: [
      {
        name: 'dari',
        location: 'query',
        type: 'string',
        required: true,
        defaultValue: '',
        placeholder: 'Kode 3 huruf, mis. USD',
        description: 'Kode mata uang asal (ISO-4217).',
        presets: [
          { label: 'USD', value: 'USD' },
          { label: 'SGD', value: 'SGD' },
          { label: 'EUR', value: 'EUR' },
          { label: 'JPY', value: 'JPY' },
        ],
      },
      {
        name: 'ke',
        location: 'query',
        type: 'string',
        required: true,
        defaultValue: '',
        placeholder: 'Kode 3 huruf, mis. IDR',
        description: 'Kode mata uang tujuan (ISO-4217).',
        presets: [
          { label: 'IDR', value: 'IDR' },
          { label: 'USD', value: 'USD' },
          { label: 'MYR', value: 'MYR' },
        ],
      },
      {
        name: 'jumlah',
        location: 'query',
        type: 'number',
        required: true,
        defaultValue: '',
        placeholder: 'Nominal asal',
        description: 'Nominal uang yang akan dikonversi.',
      },
    ],
    responseFields: [
      { field: 'diperbarui_pada', type: 'string', description: 'Waktu pembaruan kurs referensi terakhir.' },
      { field: 'konversi.dari', type: 'string', description: 'Kode mata uang asal.' },
      { field: 'konversi.ke', type: 'string', description: 'Kode mata uang tujuan.' },
      { field: 'konversi.kurs_tukar', type: 'number', description: 'Nilai tukar per 1 unit mata uang asal.' },
      { field: 'konversi.hasil_konversi', type: 'number', description: 'Total nilai akhir setelah dikalikan kurs.' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'kurs-konversi',
      sumber_data: 'open-er-api-live',
      diperbarui_pada: 'Sun, 15 Nov 2026 00:02:31 +0000',
      konversi: {
        dari: 'USD',
        ke: 'IDR',
        jumlah_awal: 100,
        kurs_tukar: 15850,
        hasil_konversi: 1585000,
      },
    },
  },
  {
    id: 'kurs-daftar',
    category: 'kurs',
    categoryLabel: 'Mata Uang',
    method: 'GET',
    path: '/api/v1/kurs/daftar',
    title: 'Daftar Nilai Tukar',
    summary:
      'Mengembalikan matriks nilai tukar sekaligus beserta kurs terbalik terhadap satu mata uang dasar untuk kebutuhan tabel harga multi-mata uang.',
    params: [
      {
        name: 'dasar',
        location: 'query',
        type: 'string',
        required: true,
        defaultValue: '',
        placeholder: 'Misal: IDR, USD, EUR',
        description: 'Mata uang acuan dasar (base currency).',
        presets: [
          { label: 'IDR', value: 'IDR' },
          { label: 'USD', value: 'USD' },
          { label: 'SGD', value: 'SGD' },
        ],
      },
      {
        name: 'simbol',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Pisahkan dengan koma (opsional: USD,EUR,SGD)',
        description: 'Daftar kode mata uang tujuan yang disaring.',
      },
    ],
    responseFields: [
      { field: 'mata_uang_dasar', type: 'string', description: 'Kode mata uang acuan utama.' },
      { field: 'kurs.[KODE].nilai_per_1_dasar', type: 'number', description: 'Nilai setara untuk 1 unit mata uang dasar.' },
      { field: 'kurs.[KODE].nilai_terbalik', type: 'number', description: 'Nilai 1 unit mata uang asing dalam mata uang dasar.' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'kurs-daftar',
      mata_uang_dasar: 'IDR',
      sumber_data: 'open-er-api-live',
      kurs: {
        USD: { nilai_per_1_dasar: 0.000063, nilai_terbalik: 15850 },
        SGD: { nilai_per_1_dasar: 0.000085, nilai_terbalik: 11810.73 },
      },
    },
  },
  {
    id: 'integrasi-ip-lookup',
    category: 'integrasi',
    categoryLabel: 'Integrasi Pihak Ketiga',
    method: 'GET',
    path: '/api/v1/integrasi/ip-lookup',
    title: 'Geolokasi & ASN IP',
    summary:
      'Melakukan inspeksi alamat IPv4 maupun IPv6 untuk memperoleh negara, kota, zona waktu, ASN, organisasi pemilik jaringan, dan penyedia layanan internet (ISP).',
    params: [
      {
        name: 'ip',
        location: 'query',
        type: 'string',
        required: true,
        defaultValue: '',
        placeholder: 'Alamat IPv4 atau IPv6',
        description: 'Alamat IP publik yang akan dianalisis.',
        presets: [
          { label: '8.8.8.8 (Google)', value: '8.8.8.8' },
          { label: '1.1.1.1 (Cloudflare)', value: '1.1.1.1' },
        ],
      },
    ],
    responseFields: [
      { field: 'data.ip', type: 'string', description: 'Alamat IP yang diperiksa.' },
      { field: 'data.negara', type: 'string', description: 'Nama negara registrasi IP.' },
      { field: 'data.jaringan.asn', type: 'number', description: 'Autonomous System Number penyedia jaringan.' },
      { field: 'data.jaringan.isp', type: 'string', description: 'Nama Internet Service Provider.' },
      { field: 'data.zona_waktu', type: 'string', description: 'Zona waktu IANA pada lokasi IP.' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'integrasi-ip-lookup',
      sumber_data: 'ipwhois-live',
      data: {
        ip: '8.8.8.8',
        versi: 'IPv4',
        negara: 'United States',
        kode_negara: 'US',
        kota: 'Mountain View',
        jaringan: { asn: 15169, organisasi: 'Google LLC', isp: 'Google Public DNS' },
        zona_waktu: 'America/Los_Angeles',
      },
    },
  },
  {
    id: 'integrasi-meta-url',
    category: 'integrasi',
    categoryLabel: 'Integrasi Pihak Ketiga',
    method: 'GET',
    path: '/api/v1/integrasi/meta-url',
    title: 'Ekstraktor Metadata URL',
    summary:
      'Mengurai tag judul HTML, meta description, serta properti OpenGraph (og:title, og:description) dari tautan eksternal untuk pratinjau tautan otomatis.',
    params: [
      {
        name: 'url',
        location: 'query',
        type: 'string',
        required: true,
        defaultValue: '',
        placeholder: 'https://domain-anda.com',
        description: 'URL publik lengkap dengan protokol http:// atau https://.',
        presets: [
          { label: 'example.com', value: 'https://example.com' },
          { label: 'iana.org', value: 'https://www.iana.org/domains/reserved' },
        ],
      },
    ],
    responseFields: [
      { field: 'status_http_target', type: 'number', description: 'Kode status HTTP yang dikembalikan server target.' },
      { field: 'metadata.judul', type: 'string | null', description: 'Isi elemen <title> halaman.' },
      { field: 'metadata.deskripsi', type: 'string | null', description: 'Isi tag meta description.' },
      { field: 'metadata.og_title', type: 'string | null', description: 'Judul OpenGraph jika tersedia.' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'integrasi-meta-url',
      url_target: 'https://example.com/',
      status_http_target: 200,
      content_type: 'text/html; charset=UTF-8',
      metadata: {
        judul: 'Example Domain',
        deskripsi: null,
        og_title: null,
        og_description: null,
        domain: 'example.com',
      },
    },
  },
  {
    id: 'integrasi-webhook-sign',
    category: 'integrasi',
    categoryLabel: 'Integrasi Pihak Ketiga',
    method: 'POST',
    path: '/api/v1/integrasi/webhook-sign',
    title: 'Penandatangan Webhook HMAC',
    summary:
      'Menghasilkan tanda tangan kriptografis HMAC-SHA256 dan header verifikasi timestamp untuk menguji keaslian payload webhook integrasi pihak ketiga.',
    params: [
      {
        name: 'event',
        location: 'body',
        type: 'string',
        required: true,
        defaultValue: 'pembayaran.berhasil',
        placeholder: 'Nama event webhook',
        description: 'Nama peristiwa (event) yang dikirim ke endpoint penerima.',
        presets: [
          { label: 'pembayaran.berhasil', value: 'pembayaran.berhasil' },
          { label: 'pesanan.dikirim', value: 'pesanan.dikirim' },
        ],
      },
      {
        name: 'secret',
        location: 'body',
        type: 'string',
        required: false,
        defaultValue: 'efemma_whsec_91a8c2',
        placeholder: 'Kunci rahasia webhook',
        description: 'Secret key bersama untuk komputasi HMAC-SHA256.',
      },
      {
        name: 'payload',
        location: 'body',
        type: 'json',
        required: true,
        defaultValue: JSON.stringify(
          {
            id_transaksi: 'TRX-2026-0842',
            nominal_idr: 250000,
            metode: 'QRIS',
          },
          null,
          2
        ),
        description: 'Objek JSON muatan data webhook.',
      },
    ],
    responseFields: [
      { field: 'algoritma', type: 'string', description: 'Algoritma hash penandatanganan (HMAC-SHA256).' },
      { field: 'timestamp', type: 'number', description: 'Unix epoch detik saat tanda tangan dibuat.' },
      { field: 'header_verifikasi.X-Efemma-Signature', type: 'string', description: 'Header signature siap pakai (format t=...,v1=...).' },
      { field: 'ringkasan.hash_payload_sha256', type: 'string', description: 'Digest SHA-256 dari payload yang diserialisasi.' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'integrasi-webhook-sign',
      algoritma: 'HMAC-SHA256',
      timestamp: 1794799200,
      header_verifikasi: {
        'X-Efemma-Event': 'pembayaran.berhasil',
        'X-Efemma-Timestamp': '1794799200',
        'X-Efemma-Signature': 't=1794799200,v1=8d3a9f...',
      },
      ringkasan: {
        hash_payload_sha256: '4b2e19...',
        panjang_byte: 92,
        event: 'pembayaran.berhasil',
      },
    },
  },
  {
    id: 'spotify-trending',
    category: 'spotify',
    categoryLabel: 'Spotify Music & Audio',
    method: 'GET',
    path: '/api/v1/spotify/trending',
    title: 'Spotify Trending',
    summary:
      'Mengambil daftar lagu dan playlist yang sedang trending dengan scrape langsung dari halaman Home & Charts web Spotify tanpa API key atau secret.',
    params: [
      {
        name: 'market',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'ID, US, JP, SG, GB',
        description: 'Kode negara untuk wilayah chart trending Spotify.',
        presets: [
          { label: 'ID (Indonesia)', value: 'ID' },
          { label: 'US (Amerika)', value: 'US' },
          { label: 'JP (Jepang)', value: 'JP' },
          { label: 'SG (Singapura)', value: 'SG' },
        ],
      },
      {
        name: 'limit',
        location: 'query',
        type: 'number',
        required: false,
        defaultValue: '',
        placeholder: '1 hingga 50',
        description: 'Jumlah entri trending Spotify yang dikembalikan.',
      },
    ],
    responseFields: [
      { field: 'sumber_data', type: 'string', description: 'Identifikasi sumber langsung scrape Web Spotify (spotify-web-scrape).' },
      { field: 'market', type: 'string', description: 'Wilayah market yang digunakan.' },
      { field: 'tracks[]', type: 'array', description: 'Daftar lagu trending langsung dari Web Spotify beserta ID, URI, artis, sampul, dan durasi.' },
      { field: 'playlists[]', type: 'array', description: 'Daftar playlist tangga lagu / viral Spotify.' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'spotify-trending',
      sumber_data: 'spotify-web-scrape',
      market: 'ID',
      tracks: [
        {
          id: '4xoY4lZNoTjEuHsSmhgF1G',
          uri: 'spotify:track:4xoY4lZNoTjEuHsSmhgF1G',
          judul: 'Sesi Potret',
          artis: ['eńau', 'Ari Lesmana'],
          durasi_ms: 243000,
          durasi_format: '04:03',
        },
      ],
    },
  },
  {
    id: 'spotify-popular',
    category: 'spotify',
    categoryLabel: 'Spotify Music & Audio',
    method: 'GET',
    path: '/api/v1/spotify/popular',
    title: 'Spotify Popular',
    summary:
      'Scrape langsung bagian Popular Artists, Popular Albums & Singles, serta lagu populer dari web Spotify.',
    params: [
      {
        name: 'market',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'ID, US, GB, JP',
        description: 'Kode wilayah market.',
        presets: [
          { label: 'ID', value: 'ID' },
          { label: 'US', value: 'US' },
          { label: 'GB', value: 'GB' },
        ],
      },
      {
        name: 'type',
        location: 'query',
        type: 'select',
        required: false,
        defaultValue: '',
        options: ['track', 'artist', 'album'],
        description: 'Jenis data populer Spotify yang ingin di-scrape (lagu, artis, atau album).',
      },
      {
        name: 'limit',
        location: 'query',
        type: 'number',
        required: false,
        defaultValue: '',
        placeholder: '1 hingga 50',
        description: 'Jumlah maksimal item populer.',
      },
    ],
    responseFields: [
      { field: 'type', type: 'string', description: 'Tipe entitas Spotify (track, artist, atau album).' },
      { field: 'items[]', type: 'array', description: 'Daftar entitas populer hasil scrape langsung dari Spotify Web.' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'spotify-popular',
      sumber_data: 'spotify-web-scrape',
      market: 'ID',
      type: 'track',
      items: [],
    },
  },
  {
    id: 'spotify-new-releases',
    category: 'spotify',
    categoryLabel: 'Spotify Music & Audio',
    method: 'GET',
    path: '/api/v1/spotify/new-releases',
    title: 'Spotify New Releases',
    summary:
      'Mengambil daftar album dan single rilisan terbaru hasil scrape langsung dari halaman New Releases web Spotify.',
    params: [
      {
        name: 'country',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'ID, US, JP, KR',
        description: 'Kode negara untuk daftar rilisan terbaru.',
        presets: [
          { label: 'ID', value: 'ID' },
          { label: 'US', value: 'US' },
          { label: 'KR', value: 'KR' },
          { label: 'JP', value: 'JP' },
        ],
      },
      {
        name: 'limit',
        location: 'query',
        type: 'number',
        required: false,
        defaultValue: '',
        placeholder: '1 hingga 50',
        description: 'Jumlah album rilisan baru yang ditampilkan.',
      },
    ],
    responseFields: [
      { field: 'albums[]', type: 'array', description: 'Daftar album rilisan baru hasil scrape Web Spotify beserta tanggal rilis dan sampul.' },
      { field: 'playlists[]', type: 'array', description: 'Playlist rilisan terbaru unggulan (seperti New Music Friday).' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'spotify-new-releases',
      sumber_data: 'spotify-web-scrape',
      country: 'ID',
      albums: [],
    },
  },
  {
    id: 'spotify-genres',
    category: 'spotify',
    categoryLabel: 'Spotify Music & Audio',
    method: 'GET',
    path: '/api/v1/spotify/genres',
    title: 'Spotify Genres',
    summary:
      'Scrape langsung seluruh daftar kategori genre dari halaman Browse All web Spotify serta daftar playlist dan lagu berdasarkan genre tertentu.',
    params: [
      {
        name: 'country',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'ID, US',
        description: 'Kode negara kategori genre.',
      },
      {
        name: 'genre',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Opsional: Pop, Indie, Rock, K-pop, Jazz',
        description: 'Nama atau ID genre untuk sekaligus memuat playlist dan lagu pada genre tersebut.',
        presets: [
          { label: 'Pop', value: 'Pop' },
          { label: 'Indie', value: 'Indie' },
          { label: 'Rock', value: 'Rock' },
          { label: 'Jazz', value: 'Jazz' },
        ],
      },
      {
        name: 'limit',
        location: 'query',
        type: 'number',
        required: false,
        defaultValue: '',
        placeholder: '1 hingga 60',
        description: 'Jumlah maksimal kategori genre yang dimuat.',
      },
    ],
    responseFields: [
      { field: 'categories[]', type: 'array', description: 'Daftar kategori hasil scrape halaman Browse Web Spotify.' },
      { field: 'playlists_by_genre[]', type: 'array', description: 'Playlist Spotify pada halaman genre terkait apabila filter diisi.' },
      { field: 'tracks_by_genre[]', type: 'array', description: 'Lagu Spotify yang cocok dengan genre terpilih.' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'spotify-genres',
      sumber_data: 'spotify-web-scrape',
      categories: [],
    },
  },
  {
    id: 'spotify-artists',
    category: 'spotify',
    categoryLabel: 'Spotify Music & Audio',
    method: 'GET',
    path: '/api/v1/spotify/artists',
    title: 'Spotify Artists',
    summary:
      'Scrape profil artis langsung dari web Spotify termasuk pendengar bulanan, pengikut, top tracks, diskografi album, dan artis terkait.',
    params: [
      {
        name: 'q',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Nama artis di Spotify',
        description: 'Kata kunci pencarian artis jika tidak menyertakan Spotify Artist ID.',
        presets: [
          { label: 'Hindia', value: 'Hindia' },
          { label: 'Tulus', value: 'Tulus' },
          { label: 'Coldplay', value: 'Coldplay' },
        ],
      },
      {
        name: 'id',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Opsional: Spotify Artist ID (mis. 51kyrUsAVqUBcoDEMFkX12)',
        description: 'ID artis Spotify spesifik untuk mengambil top tracks dan albumnya.',
      },
      {
        name: 'market',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'ID, US',
        description: 'Kode market.',
      },
    ],
    responseFields: [
      { field: 'artists[]', type: 'array', description: 'Daftar artis hasil pencarian Web Spotify.' },
      { field: 'detail', type: 'object | null', description: 'Detail lengkap artis (profil, statistik, top_tracks, albums, related_artists).' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'spotify-artists',
      sumber_data: 'spotify-web-scrape',
      artists: [],
    },
  },
  {
    id: 'spotify-albums',
    category: 'spotify',
    categoryLabel: 'Spotify Music & Audio',
    method: 'GET',
    path: '/api/v1/spotify/albums',
    title: 'Spotify Albums',
    summary:
      'Mencari dan scrape detail album beserta seluruh daftar lagu di dalam album langsung dari halaman web Spotify.',
    params: [
      {
        name: 'q',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Judul album di Spotify',
        description: 'Kata kunci pencarian album Spotify.',
        presets: [
          { label: 'Menari Dengan Bayangan', value: 'Menari Dengan Bayangan' },
          { label: 'Monokrom', value: 'Monokrom' },
        ],
      },
      {
        name: 'id',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Opsional: Spotify Album ID',
        description: 'ID album Spotify untuk mengambil metadata album dan daftar track-nya.',
      },
      {
        name: 'market',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'ID, US',
        description: 'Kode market.',
      },
    ],
    responseFields: [
      { field: 'albums[]', type: 'array', description: 'Daftar album hasil scrape Web Spotify.' },
      { field: 'detail.tracks[]', type: 'array', description: 'Daftar lagu lengkap di dalam album terpilih.' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'spotify-albums',
      sumber_data: 'spotify-web-scrape',
      albums: [],
    },
  },
  {
    id: 'spotify-playlists',
    category: 'spotify',
    categoryLabel: 'Spotify Music & Audio',
    method: 'GET',
    path: '/api/v1/spotify/playlists',
    title: 'Spotify Playlists',
    summary:
      'Menemukan playlist publik Spotify berdasarkan kata kunci atau scrape daftar lagu dari sebuah Spotify Playlist ID.',
    params: [
      {
        name: 'q',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Kata kunci playlist Spotify',
        description: 'Nama atau tema playlist yang dicari.',
        presets: [
          { label: 'Indie Indonesia', value: 'Indie Indonesia' },
          { label: 'Lofi Beats', value: 'Lofi Beats' },
          { label: 'Top 50 - Indonesia', value: 'Top 50 - Indonesia' },
        ],
      },
      {
        name: 'id',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Opsional: Spotify Playlist ID (mis. 37i9dQZEVXbObFQZ3JLcXt)',
        description: 'ID playlist Spotify untuk mengambil seluruh item lagunya.',
      },
      {
        name: 'market',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'ID, US',
        description: 'Kode market.',
      },
    ],
    responseFields: [
      { field: 'playlists[]', type: 'array', description: 'Daftar playlist asli hasil scrape Web Spotify.' },
      { field: 'detail.tracks[]', type: 'array', description: 'Daftar lagu dalam playlist jika ID diisi atau playlist pertama dimuat.' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'spotify-playlists',
      sumber_data: 'spotify-web-scrape',
      playlists: [],
    },
  },
  {
    id: 'spotify-mood-activities',
    category: 'spotify',
    categoryLabel: 'Spotify Music & Audio',
    method: 'GET',
    path: '/api/v1/spotify/mood-activities',
    title: 'Spotify Mood & Activities',
    summary:
      'Scrape kategori Mood & Aktivitas (Chill, Workout, Focus, Party, Sleep, Gaming, Love, Wellness, dll.) beserta playlist dan lagu dari web Spotify.',
    params: [
      {
        name: 'mood',
        location: 'query',
        type: 'select',
        required: false,
        defaultValue: '',
        options: ['chill', 'mood', 'workout', 'focus', 'party', 'sleep', 'love', 'gaming', 'wellness'],
        description: 'Tema suasana hati atau aktivitas yang di-scrape dari Spotify.',
      },
      {
        name: 'country',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'ID, US',
        description: 'Kode negara.',
      },
      {
        name: 'limit',
        location: 'query',
        type: 'number',
        required: false,
        defaultValue: '',
        placeholder: '1 hingga 30',
        description: 'Jumlah playlist dan lagu yang dikembalikan.',
      },
    ],
    responseFields: [
      { field: 'mood_categories[]', type: 'array', description: 'Kategori Mood & Activities hasil scrape dari Browse Spotify.' },
      { field: 'playlists[]', type: 'array', description: 'Playlist Spotify sesuai mood terpilih.' },
      { field: 'tracks[]', type: 'array', description: 'Lagu Spotify yang sesuai dengan aktivitas/mood.' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'spotify-mood-activities',
      sumber_data: 'spotify-web-scrape',
      mood: 'chill',
      playlists: [],
      tracks: [],
    },
  },
  {
    id: 'spotify-podcasts',
    category: 'spotify',
    categoryLabel: 'Spotify Music & Audio',
    method: 'GET',
    path: '/api/v1/spotify/podcasts',
    title: 'Spotify Podcasts',
    summary:
      'Mencari dan scrape acara podcast serta episode di web Spotify atau mengambil daftar episode lengkap dari sebuah Spotify Show ID.',
    params: [
      {
        name: 'q',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Kata kunci podcast atau episode',
        description: 'Kata kunci pencarian podcast di Spotify.',
        presets: [
          { label: 'Teknologi Indonesia', value: 'Teknologi Indonesia' },
          { label: 'Podcast Bisnis', value: 'Podcast Bisnis' },
          { label: 'Joe Rogan', value: 'Joe Rogan' },
        ],
      },
      {
        name: 'id',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Opsional: Spotify Show ID (mis. 4rOoJ6Egrf8K2IrywzwOMk)',
        description: 'ID acara podcast Spotify untuk mengambil detail dan daftar episode.',
      },
      {
        name: 'market',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'ID, US',
        description: 'Kode wilayah market podcast.',
      },
    ],
    responseFields: [
      { field: 'shows[]', type: 'array', description: 'Daftar podcast (shows) hasil scrape Web Spotify.' },
      { field: 'episodes[]', type: 'array', description: 'Daftar episode podcast Spotify beserta jenis_media (video/audio), durasi, dan tanggal rilis.' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'spotify-podcasts',
      sumber_data: 'spotify-web-scrape',
      shows: [],
      episodes: [],
    },
  },
  {
    id: 'spotify-search',
    category: 'spotify',
    categoryLabel: 'Spotify Music & Audio',
    method: 'GET',
    path: '/api/v1/spotify/search',
    title: 'Spotify Search',
    summary:
      'Pencarian universal real-time langsung ke mesin pencari web Spotify untuk lagu, album, artis, playlist, podcast show, dan episode.',
    params: [
      {
        name: 'q',
        location: 'query',
        type: 'string',
        required: true,
        defaultValue: '',
        placeholder: 'Cari lagu, artis, album, atau podcast...',
        description: 'Kata kunci pencarian katalog Spotify.',
        presets: [
          { label: 'Evaluasi Hindia', value: 'Evaluasi Hindia' },
          { label: 'Hati-Hati di Jalan Tulus', value: 'Hati-Hati di Jalan Tulus' },
          { label: 'Viva La Vida', value: 'Viva La Vida' },
        ],
      },
      {
        name: 'type',
        location: 'query',
        type: 'select',
        required: false,
        defaultValue: '',
        options: ['all', 'track', 'artist', 'album', 'playlist', 'podcast'],
        description: 'Jenis hasil yang difokuskan.',
      },
      {
        name: 'market',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'ID, US',
        description: 'Kode wilayah market.',
      },
      {
        name: 'limit',
        location: 'query',
        type: 'number',
        required: false,
        defaultValue: '',
        placeholder: '1 hingga 30',
        description: 'Jumlah maksimal hasil per tipe.',
      },
    ],
    responseFields: [
      { field: 'tracks[]', type: 'array', description: 'Daftar lagu hasil pencarian Web Spotify.' },
      { field: 'artists[]', type: 'array', description: 'Daftar artis hasil pencarian Web Spotify.' },
      { field: 'albums[]', type: 'array', description: 'Daftar album hasil pencarian Web Spotify.' },
      { field: 'playlists[]', type: 'array', description: 'Daftar playlist hasil pencarian Web Spotify.' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'spotify-search',
      sumber_data: 'spotify-web-scrape',
      query: 'Evaluasi Hindia',
      tracks: [],
    },
  },
  {
    id: 'spotify-library',
    category: 'spotify',
    categoryLabel: 'Spotify Music & Audio',
    method: 'GET',
    path: '/api/v1/spotify/library',
    title: 'Spotify Library',
    summary:
      'Mengambil koleksi Library profil publik Spotify (playlist publik, artis yang didengarkan baru-baru ini, pengikut) atau koleksi pribadi dengan opsional cookie sesi sp_dc web Spotify tanpa Client ID/Secret.',
    params: [
      {
        name: 'user_id',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Username/User ID Spotify (mis. spotify)',
        description: 'ID profil pengguna Spotify publik yang library/playlist-nya ingin diambil.',
        presets: [
          { label: 'spotify (Official)', value: 'spotify' },
        ],
      },
      {
        name: 'bagian',
        location: 'query',
        type: 'select',
        required: false,
        defaultValue: '',
        options: ['all', 'playlists', 'tracks', 'artists'],
        description: 'Bagian Library yang dimuat.',
      },
      {
        name: 'limit',
        location: 'query',
        type: 'number',
        required: false,
        defaultValue: '',
        placeholder: '1 hingga 30',
        description: 'Jumlah maksimal item Library.',
      },
    ],
    responseFields: [
      { field: 'spotify_user', type: 'object', description: 'Informasi profil pengguna Spotify hasil scrape.' },
      { field: 'library.playlists[]', type: 'array', description: 'Daftar playlist dalam Library pengguna Spotify.' },
      { field: 'library.tracks[]', type: 'array', description: 'Daftar lagu dari playlist unggulan / Liked Songs.' },
      { field: 'library.artists[]', type: 'array', description: 'Daftar artis terkait/yang baru didengarkan pada profil.' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'spotify-library',
      sumber_data: 'spotify-web-scrape',
      library: {
        playlists: [],
        tracks: [],
        artists: [],
      },
    },
  },
  {
    id: 'spotify-play',
    category: 'spotify',
    categoryLabel: 'Spotify Music & Audio',
    method: 'GET',
    path: '/api/v1/spotify/play',
    title: 'Spotify Play Lagu (Full Song Audio)',
    summary:
      'Mencocokkan lagu langsung dari katalog web Spotify lalu mengembalikan aliran audio penuh (Audio-Only Full Song, bukan video dan bukan preview 30 detik) untuk diputar di browser maupun diambil langsung oleh server lain.',
    params: [
      {
        name: 'track_id',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Spotify Track ID (opsional jika isi query)',
        description: 'ID Track Spotify hasil scrape. Jika kosong, sistem mencari track Spotify lewat parameter query.',
      },
      {
        name: 'query',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Masukkan judul lagu dan nama artis (contoh: Evaluasi Hindia)',
        description: 'Judul lagu/artis untuk dicocokkan dengan Spotify dan diputar penuh dalam format audio-only.',
        presets: [
          { label: 'Evaluasi - Hindia', value: 'Evaluasi Hindia' },
          { label: 'Hati-Hati di Jalan - Tulus', value: 'Hati-Hati di Jalan Tulus' },
          { label: 'Secukupnya - Hindia', value: 'Secukupnya Hindia' },
        ],
      },
      {
        name: 'format',
        location: 'query',
        type: 'select',
        required: false,
        defaultValue: '',
        options: ['json', 'audio', 'mp3'],
        description: 'Pilih "json" untuk metadata + stream_url audio, atau "audio"/"mp3" agar server mengembalikan berkas aliran audio biner secara langsung (bukan video).',
      },
    ],
    responseFields: [
      { field: 'mode_pemutaran', type: 'string', description: 'Mode pemutaran penuh khusus audio (audio-only-full-song).' },
      { field: 'tipe_media', type: 'string', description: 'Tipe media keluaran (audio/mp4 atau audio/mpeg, bukan video).' },
      { field: 'is_full_song', type: 'boolean', description: 'Selalu true (pemutaran lagu penuh, bukan preview 30 detik).' },
      { field: 'audio', type: 'object', description: 'Objek stream_url, mp3_stream_url, mime_type audio, durasi_ms, dan judul audio siap putar/unduh dari server.' },
      { field: 'track', type: 'object', description: 'Metadata lagu asli hasil scrape Spotify Web.' },
      { field: 'youtube', type: 'object | null', description: 'Metadata referensi audio terkait (video_id, channel, audio_url).' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'spotify-play',
      sumber_data: 'spotify-web-scrape+audio-stream',
      mode_pemutaran: 'audio-only-full-song',
      tipe_media: 'audio/mp4',
      is_full_song: true,
      audio: {
        stream_url: 'https://api.efemma.dev/api/v1/spotify/play?track_id=...&sig=...&format=audio',
        mp3_stream_url: 'https://api.efemma.dev/api/v1/spotify/play?track_id=...&sig=...&format=mp3',
        mime_type: 'audio/mp4',
        durasi_ms: 193000,
        sumber_audio: 'audio-full-stream',
        judul_audio: 'Hindia - Evaluasi',
        channel_audio: 'Hindia',
      },
      track: {
        id: 'track_id_spotify',
        uri: 'spotify:track:track_id_spotify',
        judul: 'Evaluasi',
        artis: ['Hindia'],
        durasi_ms: 193000,
        durasi_format: '03:13',
      },
    },
  },
  {
    id: 'spotify-podcast-play',
    category: 'spotify',
    categoryLabel: 'Spotify Music & Audio',
    method: 'GET',
    path: '/api/v1/spotify/podcast-play',
    title: 'Spotify Play Podcast (Video / Audio Otomatis)',
    summary:
      'Memutar episode penuh podcast Spotify dari kata kunci, episode_id, atau show_id. Otomatis mendeteksi format asli di Spotify (video podcast diputar sebagai video, sedangkan podcast audio-only diputar sebagai audio).',
    params: [
      {
        name: 'q',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Cari judul podcast atau episode (contoh: Close The Door Deddy)',
        description: 'Kata kunci judul acara podcast atau episode yang ingin diputar.',
        presets: [
          { label: 'Close The Door (Video)', value: 'Close The Door Podcast' },
          { label: 'Podkesmas', value: 'Podkesmas' },
          { label: 'Makna Talks (Audio)', value: 'Makna Talks' },
        ],
      },
      {
        name: 'episode_id',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Opsional: Spotify Episode ID atau URL',
        description: 'ID Episode Spotify (atau tautan open.spotify.com/episode/...).',
      },
      {
        name: 'show_id',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Opsional: Spotify Show ID atau URL',
        description: 'ID Acara Podcast Spotify untuk memutar episode terbaru dari acara tersebut.',
      },
      {
        name: 'format',
        location: 'query',
        type: 'select',
        required: false,
        defaultValue: '',
        options: ['json', 'audio', 'mp3'],
        description: 'Pilih "json" untuk metadata + sumber video/audio, atau "audio"/"mp3" untuk aliran audio episode secara langsung.',
      },
    ],
    responseFields: [
      { field: 'jenis_media', type: 'string', description: 'Format asli episode di Spotify ("video" untuk video podcast atau "audio" untuk audio podcast).' },
      { field: 'mode_pemutaran', type: 'string', description: 'Mode pemutaran otomatis ("video-podcast" atau "audio-only-podcast").' },
      { field: 'tipe_media', type: 'string', description: 'Tipe media keluaran (video/youtube-embed, video/mp4, audio/mpeg, atau audio/mp4).' },
      { field: 'video', type: 'object | null', description: 'Payload video podcast apabila episode aslinya berbentuk video di Spotify.' },
      { field: 'audio', type: 'object | null', description: 'Aliran audio episode penuh (stream_url, mp3_stream_url, source_audio_url, durasi_ms).' },
      { field: 'podcast.show', type: 'object', description: 'Metadata acara podcast Spotify (id, nama, penerbit, sampul).' },
      { field: 'podcast.episode', type: 'object', description: 'Metadata episode yang sedang diputar (id, judul, deskripsi, jenis_media, durasi_format, tanggal_rilis).' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'spotify-podcast-play',
      sumber_data: 'spotify-web-scrape+youtube-video-podcast',
      jenis_media: 'video',
      mode_pemutaran: 'video-podcast',
      tipe_media: 'video/youtube-embed',
      video: {
        video_id: 'yt_video_id',
        embed_url: 'https://www.youtube.com/embed/yt_video_id?autoplay=1&enablejsapi=1',
        watch_url: 'https://www.youtube.com/watch?v=yt_video_id',
        judul_video: 'Judul Video Podcast',
        channel: 'Nama Channel Podcast',
      },
      audio: {
        stream_url: 'https://api.efemma.dev/api/v1/spotify/podcast-play?episode_id=...&sig=...&format=audio',
        mp3_stream_url: 'https://api.efemma.dev/api/v1/spotify/podcast-play?episode_id=...&sig=...&format=mp3',
        mime_type: 'audio/mpeg',
        durasi_ms: 2450000,
        sumber_audio: 'podcast-rss-full-episode',
        judul_audio: 'Judul Episode Podcast',
        channel_audio: 'Nama Acara Podcast',
      },
      podcast: {
        show: {
          id: 'show_id_spotify',
          nama: 'Nama Acara Podcast',
        },
        episode: {
          id: 'episode_id_spotify',
          judul: 'Judul Episode Podcast',
          jenis_media: 'video',
          durasi_format: '40:50',
          tanggal_rilis: '2026-01-15',
        },
      },
    },
  },
  {
    id: 'spotify-lirik',
    category: 'spotify',
    categoryLabel: 'Spotify Music & Audio',
    method: 'GET',
    path: '/api/v1/spotify/lirik',
    title: 'Spotify Lirik Lagu',
    summary:
      'Mengambil lirik lagu lengkap beserta timestamp sinkronisasi (LRC) yang dicocokkan dengan metadata track scrape web Spotify sekaligus stream audio penuh.',
    params: [
      {
        name: 'track_id',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Opsional: Spotify Track ID',
        description: 'ID Track Spotify. Jika kosong, mencari lagu Spotify melalui parameter q.',
      },
      {
        name: 'q',
        location: 'query',
        type: 'string',
        required: false,
        defaultValue: '',
        placeholder: 'Judul lagu dan artis',
        description: 'Kata kunci lagu untuk disinkronkan antara Spotify, penyedia lirik, dan pemutar audio penuh.',
        presets: [
          { label: 'Evaluasi - Hindia', value: 'Evaluasi Hindia' },
          { label: 'Hati-Hati di Jalan - Tulus', value: 'Hati-Hati di Jalan Tulus' },
          { label: 'Secukupnya - Hindia', value: 'Secukupnya Hindia' },
        ],
      },
    ],
    responseFields: [
      { field: 'track', type: 'object', description: 'Metadata lagu asli hasil scrape Spotify Web.' },
      { field: 'audio', type: 'object | null', description: 'Aliran audio penuh (stream_url, mp3_stream_url, mime_type audio).' },
      { field: 'lirik_tersedia', type: 'boolean', description: 'Apakah lirik ditemukan.' },
      { field: 'lirik_polos', type: 'string | null', description: 'Teks lirik lengkap.' },
      { field: 'lirik_sinkron[]', type: 'array', description: 'Baris lirik ber-timestamp (waktu_ms, timestamp, teks).' },
    ],
    sampleResponse: {
      sukses: true,
      layanan: 'spotify-lirik',
      sumber_data: 'spotify-web-scrape+lrclib-live',
      lirik_tersedia: true,
      track: {
        id: 'track_id_spotify',
        judul: 'Evaluasi',
        artis: ['Hindia'],
      },
      lirik_polos: '...',
      lirik_sinkron: [{ waktu_ms: 14200, timestamp: '00:14.20', teks: 'Yang kau takutkan tak terjadi' }],
    },
  },
];

export function buildRequestUrl(
  endpoint: ApiEndpointSpec,
  values: Record<string, string>,
  origin = ''
): string {
  const base = `${origin}${endpoint.path}`;
  if (endpoint.method !== 'GET') {
    return base;
  }
  const search = new URLSearchParams();
  for (const param of endpoint.params) {
    if (param.location === 'query') {
      const val = (values[param.name] ?? '').trim();
      if (val.length > 0) {
        search.set(param.name, val);
      }
    }
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

export function buildPostBody(
  endpoint: ApiEndpointSpec,
  values: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const param of endpoint.params) {
    if (param.location !== 'body') continue;
    const raw = values[param.name] ?? '';
    if (param.type === 'json') {
      try {
        result[param.name] = JSON.parse(raw);
      } catch {
        result[param.name] = {};
      }
    } else {
      result[param.name] = raw;
    }
  }
  return result;
}

export function generateCodeSnippet(
  lang: 'curl' | 'javascript' | 'typescript' | 'python',
  endpoint: ApiEndpointSpec,
  values: Record<string, string>,
  apiKey: string
): string {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://api.efemma.dev';
  const fullUrl = buildRequestUrl(endpoint, values, origin);
  const keyHeader = apiKey.trim() || 'MASUKKAN_API_KEY_ANDA';

  if (endpoint.method === 'GET') {
    if (lang === 'curl') {
      return `curl -X GET "${fullUrl}" \\\n  -H "x-efemma-key: ${keyHeader}" \\\n  -H "Accept: application/json"`;
    }
    if (lang === 'javascript') {
      return `const response = await fetch("${fullUrl}", {\n  method: "GET",\n  headers: {\n    "x-efemma-key": "${keyHeader}",\n    "Accept": "application/json"\n  }\n});\n\nconst data = await response.json();\nconsole.log(data);`;
    }
    if (lang === 'typescript') {
      return `interface EfemmaResponse<T> {\n  sukses: boolean;\n  layanan: string;\n  [key: string]: unknown;\n}\n\nconst res = await fetch("${fullUrl}", {\n  headers: { "x-efemma-key": "${keyHeader}" }\n});\nconst hasil = (await res.json()) as EfemmaResponse<unknown>;\nconsole.log(hasil);`;
    }
    return `import requests\n\nresponse = requests.get(\n    "${fullUrl}",\n    headers={"x-efemma-key": "${keyHeader}"}\n)\nprint(response.json())`;
  }

  const bodyObj = buildPostBody(endpoint, values);
  const bodyJson = JSON.stringify(bodyObj, null, 2);

  if (lang === 'curl') {
    return `curl -X POST "${fullUrl}" \\\n  -H "x-efemma-key: ${keyHeader}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(bodyObj)}'`;
  }
  if (lang === 'javascript') {
    return `const response = await fetch("${fullUrl}", {\n  method: "POST",\n  headers: {\n    "x-efemma-key": "${keyHeader}",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify(${bodyJson})\n});\n\nconst data = await response.json();\nconsole.log(data);`;
  }
  if (lang === 'typescript') {
    return `const payload = ${bodyJson};\n\nconst res = await fetch("${fullUrl}", {\n  method: "POST",\n  headers: {\n    "x-efemma-key": "${keyHeader}",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify(payload)\n});\n\nconst data = await res.json();\nconsole.log(data);`;
  }
  return `import requests\n\npayload = ${bodyJson}\n\nresponse = requests.post(\n    "${fullUrl}",\n    headers={"x-efemma-key": "${keyHeader}"},\n    json=payload\n)\nprint(response.json())`;
}
