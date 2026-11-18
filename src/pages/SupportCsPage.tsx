import { useState } from 'react';
import { ArrowUpRight, Clock, Headphones, Home, MessageSquare } from 'lucide-react';
import { buildWhatsappUrl, PageRoute, SiteContent } from '../types/app';
import { RichTextLinks } from '../components/RichTextLinks';

interface SupportCsPageProps {
  content: SiteContent;
  onNavigate: (route: PageRoute) => void;
}

function getSafeContactUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim());
    if (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'mailto:' ||
      parsed.protocol === 'tel:'
    ) {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

export function SupportCsPage({ content, onNavigate }: SupportCsPageProps) {
  const [senderName, setSenderName] = useState('');
  const [topic, setTopic] = useState('Bantuan Integrasi API');
  const [message, setMessage] = useState('');

  const channels = Array.isArray(content.csChannels) ? content.csChannels : [];

  const handleOpenWhatsApp = () => {
    const cleanName = senderName.trim() || 'Developer';
    const cleanMsg = message.trim() || 'Halo CS, saya membutuhkan bantuan terkait EfemmaAPI.';
    const fullText = `Halo CS ${content.brandName},\nNama: ${cleanName}\nTopik: ${topic}\nPesan: ${cleanMsg}`;
    const url = buildWhatsappUrl(content.whatsappNumber, fullText);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:py-10 lg:px-8 lg:py-12">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
      >
        <button
          type="button"
          onClick={() => onNavigate({ page: 'welcome' })}
          className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
        >
          <Home className="h-3.5 w-3.5" />
        </button>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-slate-900 dark:text-slate-200">
          {content.hubCsLabel || 'Kontak CS'}
        </span>
      </nav>

      <div className="mt-5 border-b border-slate-200/70 pb-6 dark:border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <Headphones className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl [text-wrap:balance]">
            {content.csPageTitle}
          </h1>
        </div>
        <p className="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">
          <RichTextLinks text={content.csPageSubtitle} />
        </p>
        {content.csResponseHours && (
          <div className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Jam Layanan: {content.csResponseHours}</span>
          </div>
        )}
      </div>

      {/* Contact Channels Grid */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {channels.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500 dark:border-white/10 dark:bg-[#111111] dark:text-slate-400">
            Belum ada kanal Customer Service yang ditambahkan oleh Admin.
          </div>
        ) : (
          channels.map((ch, idx) => {
            const safeUrl = getSafeContactUrl(ch.url);
            const isExternal = safeUrl?.startsWith('http');
            return (
              <div
                key={`cs-ch-${idx}`}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#111111]"
              >
                <div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {ch.label}
                  </div>
                  <div className="mt-1 font-display text-sm font-bold text-slate-900 dark:text-white break-all">
                    {ch.value}
                  </div>
                  {ch.note && (
                    <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      <RichTextLinks text={ch.note} />
                    </p>
                  )}
                </div>

                {safeUrl && (
                  <a
                    href={safeUrl}
                    target={isExternal ? '_blank' : undefined}
                    rel={isExternal ? 'noopener noreferrer' : undefined}
                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300"
                  >
                    <span>Hubungi Sekarang</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Quick Direct CS Message Builder */}
      <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50/70 p-6 dark:border-white/10 dark:bg-[#111111]">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
          <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
            Kirim Pesan Cepat ke CS WhatsApp
          </h2>
        </div>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Tuliskan kendala Anda lalu klik tombol di bawah untuk langsung terhubung ke CS resmi.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Nama Anda
            </label>
            <input
              type="text"
              maxLength={80}
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Contoh: Budi Santoso"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Topik Bantuan
            </label>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
            >
              <option value="Bantuan Integrasi API">Bantuan Integrasi API</option>
              <option value="Upgrade Paket Pro / Enterprise">Upgrade Paket Pro / Enterprise</option>
              <option value="Kendala API Key & Kuota">Kendala API Key &amp; Kuota</option>
              <option value="Laporan Bug / Error Endpoint">Laporan Bug / Error Endpoint</option>
            </select>
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Detail Pertanyaan atau Kendala
          </label>
          <textarea
            rows={3}
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Jelaskan endpoint atau kendala yang Anda alami..."
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleOpenWhatsApp}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
          >
            <span>Kirim ke WhatsApp CS</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
