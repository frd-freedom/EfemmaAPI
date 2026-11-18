import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Megaphone } from 'lucide-react';
import { FloatingCircularMenu } from './components/FloatingCircularMenu';
import { FooterBar } from './components/FooterBar';
import { HeaderBar } from './components/HeaderBar';
import { ImportantNotifModal } from './components/ImportantNotifModal';
import { LogoutConfirmModal } from './components/LogoutConfirmModal';
import { NotificationsModal } from './components/NotificationsModal';
import { RichTextLinks } from './components/RichTextLinks';
import { ScrollToTopButton } from './components/ScrollToTopButton';
import { SearchModal } from './components/SearchModal';
import { SidebarNav } from './components/SidebarNav';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from './lib/firebase';
import {
  inferPlanDailyLimit,
  normalizeRoleKey,
  resolveRoleDailyLimit,
  toEpochMs,
} from './lib/roleExpiry';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { EndpointDocPage } from './pages/EndpointDocPage';
import { FaqPage } from './pages/FaqPage';
import { PricingPage } from './pages/PricingPage';
import { PublicChatPage } from './pages/PublicChatPage';
import { SosmedPage } from './pages/SosmedPage';
import { SupportCsPage } from './pages/SupportCsPage';
import { WelcomePage } from './pages/WelcomePage';
import {
  ADMIN_EMAIL,
  DEFAULT_CATEGORY_ORDER,
  DEFAULT_SITE_CONTENT,
  FREE_DAILY_LIMIT,
  generateApiKey,
  getTodayDateString,
  NotificationItem,
  NotificationPriority,
  PageRoute,
  PRO_DAILY_LIMIT,
  SiteContent,
  UsageLogItem,
  UserProfile,
  UserRole,
} from './types/app';

function normalizeCategoryOrder(raw?: unknown): string[] {
  const valid = new Set(DEFAULT_CATEGORY_ORDER);
  const cleaned = Array.isArray(raw)
    ? Array.from(
        new Set(raw.filter((x): x is string => typeof x === 'string' && valid.has(x)))
      )
    : [];
  for (const cat of DEFAULT_CATEGORY_ORDER) {
    if (!cleaned.includes(cat)) cleaned.push(cat);
  }
  return cleaned;
}

function clampNonEmptyString(val: unknown, fallback: string, maxLen: number): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

function clampOptionalString(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function sanitizeSiteContent(raw: unknown): SiteContent {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const def = DEFAULT_SITE_CONTENT;

  const rawPlans = Array.isArray(d.pricingPlans) ? d.pricingPlans : [];
  const cleanPlans = rawPlans
    .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object'))
    .slice(0, 10)
    .map((p, idx) => {
      const id = normalizeRoleKey(clampNonEmptyString(p.id, `plan_${idx + 1}`, 40));
      const name = clampNonEmptyString(p.name, `Paket ${idx + 1}`, 60);
      const features = Array.isArray(p.features)
        ? p.features
            .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
            .slice(0, 20)
            .map((f) => f.trim().slice(0, 160))
        : [];
      const rawLimit = typeof p.dailyLimit === 'number' ? p.dailyLimit : undefined;
      return {
        id,
        audience: clampNonEmptyString(p.audience, 'Developer', 80),
        name,
        price: clampNonEmptyString(p.price, 'Rp 0', 60),
        cadence: clampOptionalString(p.cadence, 60) || '/ bulan',
        dailyLimit: inferPlanDailyLimit({ id, name, features, dailyLimit: rawLimit }),
        features,
        buttonLabel: clampNonEmptyString(p.buttonLabel, 'Pilih Paket', 60),
        actionType: (p.actionType === 'keys' ? 'keys' : 'whatsapp') as 'keys' | 'whatsapp',
        whatsappMessage: clampOptionalString(p.whatsappMessage, 300),
        highlighted: Boolean(p.highlighted),
      };
    });

  const rawRows = Array.isArray(d.pricingComparisonRows) ? d.pricingComparisonRows : null;
  const cleanRows = rawRows
    ? rawRows
        .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
        .slice(0, 20)
        .map((r) => ({
          feature: clampNonEmptyString(r.feature, 'Fitur', 120),
          freeValue: clampOptionalString(r.freeValue, 120) || '-',
          proValue: clampOptionalString(r.proValue, 120) || '-',
          enterpriseValue: clampOptionalString(r.enterpriseValue, 120) || '-',
        }))
    : def.pricingComparisonRows;

  const rawFooterLinks = Array.isArray(d.footerLinks) ? d.footerLinks : null;
  const cleanFooterLinks = rawFooterLinks
    ? rawFooterLinks
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .slice(0, 10)
        .map((item) => ({
          label: clampOptionalString(item.label, 50),
          url: clampOptionalString(item.url, 300),
        }))
        .filter((item) => item.label.length > 0 && item.url.length > 0)
    : def.footerLinks;

  const rawCsChannels = Array.isArray(d.csChannels) ? d.csChannels : null;
  const cleanCsChannels = rawCsChannels
    ? rawCsChannels
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .slice(0, 10)
        .map((item) => ({
          label: clampOptionalString(item.label, 60),
          value: clampOptionalString(item.value, 120),
          url: clampOptionalString(item.url, 300),
          note: clampOptionalString(item.note, 240),
        }))
        .filter((item) => item.label.length > 0 || item.value.length > 0)
    : def.csChannels;

  const rawFaqItems = Array.isArray(d.faqItems) ? d.faqItems : null;
  const cleanFaqItems = rawFaqItems
    ? rawFaqItems
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .slice(0, 25)
        .map((item) => ({
          question: clampOptionalString(item.question, 200),
          answer: clampOptionalString(item.answer, 800),
        }))
        .filter((item) => item.question.length > 0 && item.answer.length > 0)
    : def.faqItems;

  const rawSosmedItems = Array.isArray(d.sosmedItems) ? d.sosmedItems : null;
  const cleanSosmedItems = rawSosmedItems
    ? rawSosmedItems
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .slice(0, 12)
        .map((item) => ({
          platform: clampOptionalString(item.platform, 60),
          handle: clampOptionalString(item.handle, 120),
          description: clampOptionalString(item.description, 240),
          url: clampOptionalString(item.url, 300),
        }))
        .filter((item) => item.platform.length > 0 && item.url.length > 0)
    : def.sosmedItems;

  const rawFooterNote = (
    typeof d.footerRightNote === 'string'
      ? clampOptionalString(d.footerRightNote, 160)
      : def.footerRightNote
  ).replace(/\b(?:Header\s+)?X-API-Key(?:\s+resmi)?\b/gi, 'Header x-efemma-key');

  return {
    brandName: clampNonEmptyString(d.brandName, def.brandName, 60),
    loginButtonLabel: clampNonEmptyString(d.loginButtonLabel, def.loginButtonLabel, 40),
    logoutConfirmTitle: clampNonEmptyString(d.logoutConfirmTitle, def.logoutConfirmTitle, 80),
    logoutConfirmMessage: clampNonEmptyString(d.logoutConfirmMessage, def.logoutConfirmMessage, 240),
    logoutConfirmYesLabel: clampNonEmptyString(d.logoutConfirmYesLabel, def.logoutConfirmYesLabel, 40),
    logoutConfirmCancelLabel: clampNonEmptyString(
      d.logoutConfirmCancelLabel,
      def.logoutConfirmCancelLabel,
      40
    ),
    welcomePageTitle: clampNonEmptyString(d.welcomePageTitle, def.welcomePageTitle, 120),
    welcomePageSubtitle: clampNonEmptyString(d.welcomePageSubtitle, def.welcomePageSubtitle, 240),
    bannerSubtitle: clampNonEmptyString(d.bannerSubtitle, def.bannerSubtitle, 80),
    welcomeBannerImageUrl: clampOptionalString(d.welcomeBannerImageUrl, 680000),
    introHeading: clampNonEmptyString(d.introHeading, def.introHeading, 160),
    introParagraph1: clampNonEmptyString(d.introParagraph1, def.introParagraph1, 1000),
    introParagraph2: clampNonEmptyString(d.introParagraph2, def.introParagraph2, 1000),
    welcomeCardDocsTitle: clampNonEmptyString(d.welcomeCardDocsTitle, def.welcomeCardDocsTitle, 80),
    welcomeCardDocsDesc: clampNonEmptyString(d.welcomeCardDocsDesc, def.welcomeCardDocsDesc, 240),
    welcomeCardDocsBtn: clampNonEmptyString(d.welcomeCardDocsBtn, def.welcomeCardDocsBtn, 50),
    welcomeCardKeysTitle: clampNonEmptyString(d.welcomeCardKeysTitle, def.welcomeCardKeysTitle, 80),
    welcomeCardKeysDesc: clampNonEmptyString(d.welcomeCardKeysDesc, def.welcomeCardKeysDesc, 240),
    welcomeCardKeysBtn: clampNonEmptyString(d.welcomeCardKeysBtn, def.welcomeCardKeysBtn, 50),
    welcomeCardPricingTitle: clampNonEmptyString(
      d.welcomeCardPricingTitle,
      def.welcomeCardPricingTitle,
      80
    ),
    welcomeCardPricingDesc: clampNonEmptyString(
      d.welcomeCardPricingDesc,
      def.welcomeCardPricingDesc,
      240
    ),
    welcomeCardPricingBtn: clampNonEmptyString(
      d.welcomeCardPricingBtn,
      def.welcomeCardPricingBtn,
      50
    ),
    docsNotice: clampNonEmptyString(d.docsNotice, def.docsNotice, 400),
    docsRunButtonLabel: clampNonEmptyString(d.docsRunButtonLabel, def.docsRunButtonLabel, 60),
    docsLoginButtonLabel: clampNonEmptyString(d.docsLoginButtonLabel, def.docsLoginButtonLabel, 60),
    docsUpgradeButtonLabel: clampNonEmptyString(
      d.docsUpgradeButtonLabel,
      def.docsUpgradeButtonLabel,
      60
    ),
    docsViewKeyButtonLabel: clampNonEmptyString(
      d.docsViewKeyButtonLabel,
      def.docsViewKeyButtonLabel,
      60
    ),
    keysPageTitle: clampNonEmptyString(d.keysPageTitle, def.keysPageTitle, 120),
    keysPageSubtitle: clampNonEmptyString(d.keysPageSubtitle, def.keysPageSubtitle, 240),
    keysGenerateButtonLabel: clampNonEmptyString(
      d.keysGenerateButtonLabel,
      def.keysGenerateButtonLabel,
      60
    ),
    keysUsageHeading: clampNonEmptyString(d.keysUsageHeading, def.keysUsageHeading, 100),
    pricingTitle: clampNonEmptyString(d.pricingTitle, def.pricingTitle, 140),
    pricingSubtitle: clampNonEmptyString(d.pricingSubtitle, def.pricingSubtitle, 300),
    pricingComparisonTitle: clampNonEmptyString(
      d.pricingComparisonTitle,
      def.pricingComparisonTitle,
      120
    ),
    whatsappNumber: clampNonEmptyString(d.whatsappNumber, def.whatsappNumber, 30),
    pricingPlans: cleanPlans.length > 0 ? cleanPlans : def.pricingPlans,
    pricingComparisonRows: cleanRows,
    footerTitle: clampNonEmptyString(d.footerTitle, def.footerTitle, 80),
    footerVersion:
      typeof d.footerVersion === 'string'
        ? clampOptionalString(d.footerVersion, 30)
        : def.footerVersion,
    footerLinks: cleanFooterLinks,
    footerGithubUrl:
      typeof d.footerGithubUrl === 'string'
        ? clampOptionalString(d.footerGithubUrl, 300)
        : def.footerGithubUrl,
    footerBrandDesc:
      typeof d.footerBrandDesc === 'string'
        ? clampOptionalString(d.footerBrandDesc, 500)
        : def.footerBrandDesc,
    footerCopyright: clampNonEmptyString(d.footerCopyright, def.footerCopyright, 160),
    footerRightNote: rawFooterNote,
    spotifyPlayerTitle: clampNonEmptyString(d.spotifyPlayerTitle, def.spotifyPlayerTitle, 120),
    spotifyPlayerBadge: clampNonEmptyString(d.spotifyPlayerBadge, def.spotifyPlayerBadge, 40),
    spotifyPlayerDesc: clampNonEmptyString(d.spotifyPlayerDesc, def.spotifyPlayerDesc, 500),
    categoryOrder: normalizeCategoryOrder(d.categoryOrder),
    hiddenCategories: Array.isArray(d.hiddenCategories)
      ? d.hiddenCategories.filter((x): x is string => typeof x === 'string').slice(0, 20)
      : [],
    hiddenEndpointIds: Array.isArray(d.hiddenEndpointIds)
      ? d.hiddenEndpointIds.filter((x): x is string => typeof x === 'string').slice(0, 100)
      : [],
    privateEndpointIds: Array.isArray(d.privateEndpointIds)
      ? Array.from(
          new Set(d.privateEndpointIds.filter((x): x is string => typeof x === 'string'))
        ).slice(0, 100)
      : [],
    privateEndpointRoles: (() => {
      const out: Record<string, UserRole[]> = {};
      if (d.privateEndpointRoles && typeof d.privateEndpointRoles === 'object') {
        for (const [k, v] of Object.entries(d.privateEndpointRoles as Record<string, unknown>).slice(
          0,
          100
        )) {
          if (typeof k !== 'string' || !k || !Array.isArray(v)) continue;
          const roles = Array.from(
            new Set(
              v
                .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
                .map((r) => normalizeRoleKey(r))
                .filter((r) => r.length > 0 && r !== 'admin')
            )
          ).slice(0, 20);
          out[k] = roles;
        }
      }
      return out;
    })(),
    hubCsLabel: clampNonEmptyString(d.hubCsLabel, def.hubCsLabel, 40),
    hubFaqLabel: clampNonEmptyString(d.hubFaqLabel, def.hubFaqLabel, 40),
    hubSosmedLabel: clampNonEmptyString(d.hubSosmedLabel, def.hubSosmedLabel, 40),
    hubPublicChatLabel: clampNonEmptyString(d.hubPublicChatLabel, def.hubPublicChatLabel, 40),
    csPageTitle: clampNonEmptyString(d.csPageTitle, def.csPageTitle, 120),
    csPageSubtitle: clampNonEmptyString(d.csPageSubtitle, def.csPageSubtitle, 300),
    csResponseHours:
      typeof d.csResponseHours === 'string'
        ? clampOptionalString(d.csResponseHours, 120)
        : def.csResponseHours,
    csChannels: cleanCsChannels,
    faqPageTitle: clampNonEmptyString(d.faqPageTitle, def.faqPageTitle, 120),
    faqPageSubtitle: clampNonEmptyString(d.faqPageSubtitle, def.faqPageSubtitle, 300),
    faqItems: cleanFaqItems,
    sosmedPageTitle: clampNonEmptyString(d.sosmedPageTitle, def.sosmedPageTitle, 120),
    sosmedPageSubtitle: clampNonEmptyString(d.sosmedPageSubtitle, def.sosmedPageSubtitle, 300),
    sosmedItems: cleanSosmedItems,
    publicChatTitle: clampNonEmptyString(d.publicChatTitle, def.publicChatTitle, 120),
    publicChatBadge:
      typeof d.publicChatBadge === 'string'
        ? clampOptionalString(d.publicChatBadge, 30)
        : def.publicChatBadge,
    publicChatSubtitle: clampNonEmptyString(d.publicChatSubtitle, def.publicChatSubtitle, 300),
    publicChatDescription:
      typeof d.publicChatDescription === 'string'
        ? clampOptionalString(d.publicChatDescription, 800)
        : def.publicChatDescription,
    publicChatCtaLabel:
      typeof d.publicChatCtaLabel === 'string'
        ? clampOptionalString(d.publicChatCtaLabel, 60)
        : def.publicChatCtaLabel,
    publicChatCtaUrl:
      typeof d.publicChatCtaUrl === 'string'
        ? clampOptionalString(d.publicChatCtaUrl, 300)
        : def.publicChatCtaUrl,
  };
}

function parseHashRoute(): PageRoute {
  if (typeof window === 'undefined') return { page: 'welcome' };
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash.startsWith('docs/')) {
    const endpointId = hash.slice(5).trim() || 'cuaca-sekarang';
    return { page: 'docs', endpointId };
  }
  if (hash === 'keys') return { page: 'keys' };
  if (hash === 'pricing') return { page: 'pricing' };
  if (hash === 'admin') return { page: 'admin' };
  if (hash === 'cs') return { page: 'cs' };
  if (hash === 'faq') return { page: 'faq' };
  if (hash === 'sosmed') return { page: 'sosmed' };
  if (hash === 'public-chat') return { page: 'public-chat' };
  return { page: 'welcome' };
}

function routeToHash(route: PageRoute): string {
  switch (route.page) {
    case 'docs':
      return `#/docs/${route.endpointId}`;
    case 'keys':
      return '#/keys';
    case 'pricing':
      return '#/pricing';
    case 'admin':
      return '#/admin';
    case 'cs':
      return '#/cs';
    case 'faq':
      return '#/faq';
    case 'sosmed':
      return '#/sosmed';
    case 'public-chat':
      return '#/public-chat';
    default:
      return '#/welcome';
  }
}

export default function App() {
  const [route, setRoute] = useState<PageRoute>(() => parseHashRoute());
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('efemma_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const scrollToTopOnUnlockRef = useRef(false);

  // Auth & Profile
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authError, setAuthError] = useState('');

  // Persisted Collections State
  const [siteContent, setSiteContent] = useState<SiteContent>(DEFAULT_SITE_CONTENT);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readNotifIds, setReadNotifIds] = useState<Set<string>>(new Set());
  const [guestDismissedNotifIds, setGuestDismissedNotifIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('efemma_guest_read_notifs');
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  const [usageLogs, setUsageLogs] = useState<UsageLogItem[]>([]);

  // Admin-only collections
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [adminHistoricalLogs, setAdminHistoricalLogs] = useState<UsageLogItem[]>([]);

  useEffect(() => {
    testFirestoreConnection();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('efemma_theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleHashChange = () => setRoute(parseHashRoute());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const navigateTo = useCallback((next: PageRoute) => {
    setRoute(next);
    const nextHash = routeToHash(next);
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
    scrollToTopOnUnlockRef.current = true;
    requestAnimationFrame(() => {
      if (document.body.style.position !== 'fixed') {
        scrollToTopOnUnlockRef.current = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }, []);

  const syncSessionToServer = useCallback(async (user: User) => {
    try {
      const idToken = await user.getIdToken();
      await fetch('/api/internal/sync-session', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
    } catch {
      // Non-blocking sync
    }
  }, []);

  const ensureUserProfile = useCallback(async (user: User): Promise<UserProfile> => {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const isAdminEmail =
      (user.email || '').toLowerCase() === ADMIN_EMAIL && user.emailVerified;
    const today = getTodayDateString();

    if (!snap.exists()) {
      const profile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'Developer',
        photoURL: user.photoURL || '',
        role: isAdminEmail ? 'admin' : 'free',
        apiKey: generateApiKey(isAdminEmail),
        creditsUsedToday: 0,
        creditsResetDate: today,
        dailyLimit: isAdminEmail ? -1 : FREE_DAILY_LIMIT,
      };
      try {
        await setDoc(userRef, {
          ...profile,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
      }
      return profile;
    }

    const data = snap.data() as UserProfile;
    return {
      ...data,
      creditsUsedToday: data.creditsResetDate === today ? data.creditsUsedToday : 0,
      creditsResetDate: today,
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setUserProfile(null);
        setAuthLoading(false);
        return;
      }

      try {
        await ensureUserProfile(user);
        await syncSessionToServer(user);
      } catch (err) {
        console.error('Gagal memuat profil akun:', err);
      } finally {
        setAuthLoading(false);
      }
    });
    return () => unsub();
  }, [ensureUserProfile, syncSessionToServer]);

  const autoResettingUidRef = useRef<string | null>(null);

  const attemptAutoResetExpiredRole = useCallback(
    async (user: User, profileData: UserProfile) => {
      const expiresAt = toEpochMs(profileData.roleExpiresAt);
      if (
        (profileData.email || '').toLowerCase() === ADMIN_EMAIL ||
        profileData.role === 'free' ||
        expiresAt <= 0 ||
        Date.now() < expiresAt
      ) {
        return false;
      }
      if (autoResettingUidRef.current === user.uid) return true;
      autoResettingUidRef.current = user.uid;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          role: 'free',
          dailyLimit: FREE_DAILY_LIMIT,
          roleExpiresAt: 0,
          updatedAt: serverTimestamp(),
        });
        await syncSessionToServer(user);
      } catch {
        // Ignore transient clock-skew (1-2s ahead of server request.time); server middleware & timer retry handle it cleanly
      } finally {
        autoResettingUidRef.current = null;
      }
      return true;
    },
    [syncSessionToServer]
  );

  useEffect(() => {
    if (!firebaseUser) {
      setUserProfile(null);
      return;
    }

    const userRef = doc(db, 'users', firebaseUser.uid);
    const unsub = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          const today = getTodayDateString();
          const roleExpiresAt = toEpochMs(data.roleExpiresAt);
          const roleAssignedAt = toEpochMs(data.roleAssignedAt);
          const normalized: UserProfile = {
            ...data,
            roleAssignedAt,
            roleExpiresAt,
            creditsUsedToday: data.creditsResetDate === today ? data.creditsUsedToday : 0,
            creditsResetDate: today,
          };
          setUserProfile(normalized);
          void attemptAutoResetExpiredRole(firebaseUser, normalized);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`)
    );
    return () => unsub();
  }, [firebaseUser, attemptAutoResetExpiredRole]);

  // Proactive timer: auto-downgrade the exact moment roleExpiresAt is reached while user has tab open
  useEffect(() => {
    if (!firebaseUser || !userProfile) return;
    if (
      userProfile.email.toLowerCase() === ADMIN_EMAIL ||
      userProfile.role === 'free'
    ) {
      return;
    }
    const expiresAt = toEpochMs(userProfile.roleExpiresAt);
    if (expiresAt <= 0) return;

    const trigger = () => {
      void attemptAutoResetExpiredRole(firebaseUser, userProfile);
    };

    const delayMs = expiresAt - Date.now();
    if (delayMs <= 0) {
      trigger();
      const retryTimer = window.setTimeout(trigger, 2500);
      return () => window.clearTimeout(retryTimer);
    }

    // Wait +1500ms past local expiry so Firestore request.time agrees without clock-skew denial
    const safeDelay = Math.min(delayMs + 1500, 2_147_483_000);
    const timer = window.setTimeout(trigger, safeDelay);
    return () => window.clearTimeout(timer);
  }, [firebaseUser, userProfile, attemptAutoResetExpiredRole]);

  // Listen to public siteContent/main
  useEffect(() => {
    const ref = doc(db, 'siteContent', 'main');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setSiteContent(sanitizeSiteContent(snap.data()));
        } else {
          setSiteContent(DEFAULT_SITE_CONTENT);
        }
      },
      () => {
        setSiteContent(DEFAULT_SITE_CONTENT);
      }
    );
    return () => unsub();
  }, []);

  // Listen to notifications
  useEffect(() => {
    const isAdmin = userProfile?.role === 'admin';
    const notifQuery = isAdmin
      ? query(collection(db, 'notifications'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'notifications'), where('active', '==', true));

    const unsub = onSnapshot(
      notifQuery,
      (snap) => {
        const list: NotificationItem[] = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<NotificationItem, 'id'>),
          }))
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setNotifications(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'notifications');
      }
    );
    return () => unsub();
  }, [userProfile?.role]);

  useEffect(() => {
    if (!firebaseUser) {
      setReadNotifIds(new Set());
      return;
    }
    const q = collection(db, 'users', firebaseUser.uid, 'readNotifications');
    const unsub = onSnapshot(
      q,
      (snap) => {
        setReadNotifIds(new Set(snap.docs.map((d) => d.id)));
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `users/${firebaseUser.uid}/readNotifications`
        )
    );
    return () => unsub();
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) {
      setUsageLogs([]);
      return;
    }
    const q = query(
      collection(db, 'users', firebaseUser.uid, 'usageLogs'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setUsageLogs(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<UsageLogItem, 'id'>),
          }))
        );
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `users/${firebaseUser.uid}/usageLogs`)
    );
    return () => unsub();
  }, [firebaseUser]);

  useEffect(() => {
    if (userProfile?.role !== 'admin') {
      setAllUsers([]);
      setAdminHistoricalLogs([]);
      return;
    }

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setAllUsers(
          snap.docs.map((d) => {
            const raw = d.data() as UserProfile;
            return {
              ...raw,
              roleAssignedAt: toEpochMs(raw.roleAssignedAt),
              roleExpiresAt: toEpochMs(raw.roleExpiresAt),
            };
          })
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    const unsubAllUsage = onSnapshot(
      query(collectionGroup(db, 'usageLogs'), limit(200)),
      (snap) => {
        setAdminHistoricalLogs(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<UsageLogItem, 'id'>),
          }))
        );
      },
      () => {
        // Non-fatal fallback if collectionGroup index is unavailable; live server telemetry continues independently
      }
    );

    return () => {
      unsubUsers();
      unsubAllUsage();
    };
  }, [userProfile?.role]);

  const effectiveReadSet = firebaseUser ? readNotifIds : guestDismissedNotifIds;

  const activeNotifications = useMemo(
    () => notifications.filter((n) => n.active),
    [notifications]
  );

  const alwaysNotifications = useMemo(
    () => activeNotifications.filter((n) => n.priority === 'always'),
    [activeNotifications]
  );

  const unreadCount = useMemo(
    () => activeNotifications.filter((n) => !effectiveReadSet.has(n.id)).length,
    [activeNotifications, effectiveReadSet]
  );

  const pendingImportantNotif = useMemo(
    () =>
      activeNotifications.find(
        (n) => n.priority === 'penting' && !effectiveReadSet.has(n.id)
      ) ?? null,
    [activeNotifications, effectiveReadSet]
  );

  // Strict background scroll & drag lock whenever mobile navigation drawer or any modal is open
  const isOverlayOpen =
    mobileSidebarOpen ||
    notificationsOpen ||
    searchOpen ||
    logoutConfirmOpen ||
    Boolean(pendingImportantNotif);

  useEffect(() => {
    if (!isOverlayOpen) return;
    const scrollY = window.scrollY;
    const html = document.documentElement;
    const body = document.body;

    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyLeft = body.style.left;
    const prevBodyRight = body.style.right;
    const prevBodyWidth = body.style.width;
    const prevBodyOverflow = body.style.overflow;

    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    return () => {
      html.style.overflow = prevHtmlOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.left = prevBodyLeft;
      body.style.right = prevBodyRight;
      body.style.width = prevBodyWidth;
      body.style.overflow = prevBodyOverflow;
      if (scrollToTopOnUnlockRef.current) {
        scrollToTopOnUnlockRef.current = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo(0, scrollY);
      }
    };
  }, [isOverlayOpen]);

  const handleLoginGoogle = async () => {
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? `Gagal masuk dengan Google: ${err.message}`
          : 'Gagal masuk dengan Google.'
      );
    }
  };

  const handleConfirmLogout = async () => {
    setLogoutConfirmOpen(false);
    await signOut(auth);
    if (route.page === 'admin') {
      navigateTo({ page: 'welcome' });
    }
  };

  const handleRotateApiKey = async () => {
    if (!firebaseUser || !userProfile) return;
    const newKey = generateApiKey(userProfile.role === 'admin');
    const userRef = doc(db, 'users', firebaseUser.uid);
    try {
      await updateDoc(userRef, {
        apiKey: newKey,
        updatedAt: serverTimestamp(),
      });
      await syncSessionToServer(firebaseUser);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${firebaseUser.uid}`);
    }
  };

  const handleRefreshUserProfile = async () => {
    if (!firebaseUser) return;
    const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      const today = getTodayDateString();
      setUserProfile({
        ...data,
        creditsUsedToday: data.creditsResetDate === today ? data.creditsUsedToday : 0,
        creditsResetDate: today,
      });
    }
  };

  const handleRecordUsageLog = async (log: {
    endpointId: string;
    method: 'GET' | 'POST';
    path: string;
    status: number;
    latencyMs: number;
  }) => {
    if (!firebaseUser) return;
    const logId = `log_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const ref = doc(db, 'users', firebaseUser.uid, 'usageLogs', logId);
    try {
      await setDoc(ref, {
        uid: firebaseUser.uid,
        endpointId: log.endpointId.slice(0, 64),
        method: log.method,
        path: log.path.slice(0, 256),
        status: log.status,
        latencyMs: log.latencyMs,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `users/${firebaseUser.uid}/usageLogs/${logId}`
      );
    }
  };

  const handleMarkNotifRead = async (notifId: string) => {
    if (!firebaseUser) {
      const next = new Set(guestDismissedNotifIds);
      next.add(notifId);
      setGuestDismissedNotifIds(next);
      localStorage.setItem('efemma_guest_read_notifs', JSON.stringify(Array.from(next)));
      return;
    }

    const ref = doc(db, 'users', firebaseUser.uid, 'readNotifications', notifId);
    try {
      await setDoc(ref, {
        uid: firebaseUser.uid,
        notifId,
        readAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `users/${firebaseUser.uid}/readNotifications/${notifId}`
      );
    }
  };

  const handleMarkAllNotifsRead = async () => {
    const unread = activeNotifications.filter((n) => !effectiveReadSet.has(n.id));
    if (unread.length === 0) return;

    if (!firebaseUser) {
      const next = new Set(guestDismissedNotifIds);
      unread.forEach((n) => next.add(n.id));
      setGuestDismissedNotifIds(next);
      localStorage.setItem('efemma_guest_read_notifs', JSON.stringify(Array.from(next)));
      return;
    }

    const batch = writeBatch(db);
    for (const n of unread) {
      const ref = doc(db, 'users', firebaseUser.uid, 'readNotifications', n.id);
      batch.set(ref, {
        uid: firebaseUser.uid,
        notifId: n.id,
        readAt: serverTimestamp(),
      });
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.WRITE,
        `users/${firebaseUser.uid}/readNotifications`
      );
    }
  };

  const handleSaveSiteContent = async (next: SiteContent) => {
    if (!firebaseUser) return;
    const ref = doc(db, 'siteContent', 'main');
    const sanitized = sanitizeSiteContent(next);
    try {
      await setDoc(ref, {
        ...sanitized,
        updatedAt: serverTimestamp(),
        updatedBy: firebaseUser.uid,
      });
      try {
        const idToken = await firebaseUser.getIdToken();
        await fetch('/api/internal/refresh-site-config', {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });
      } catch {
        // Non-blocking cache refresh
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'siteContent/main');
    }
  };

  const handleCreateNotification = async (payload: {
    title: string;
    message: string;
    priority: NotificationPriority;
  }) => {
    if (!firebaseUser) return;
    const notifId = `ntf_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const ref = doc(db, 'notifications', notifId);
    try {
      await setDoc(ref, {
        title: payload.title,
        message: payload.message,
        priority: payload.priority,
        active: true,
        createdBy: firebaseUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `notifications/${notifId}`);
    }
  };

  const handleToggleNotificationActive = async (id: string, active: boolean) => {
    const ref = doc(db, 'notifications', id);
    try {
      await updateDoc(ref, {
        active,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    const ref = doc(db, 'notifications', id);
    try {
      await deleteDoc(ref);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `notifications/${id}`);
    }
  };

  const handleUpdateUserRole = async (
    uid: string,
    role: UserRole,
    options?: { roleAssignedAt?: number; roleExpiresAt?: number }
  ) => {
    const normalizedRole = normalizeRoleKey(role);
    const dailyLimit = resolveRoleDailyLimit(normalizedRole, siteContent.pricingPlans);
    const ref = doc(db, 'users', uid);
    const payload: Record<string, unknown> = {
      role: normalizedRole,
      dailyLimit,
      updatedAt: serverTimestamp(),
    };
    if (options?.roleAssignedAt !== undefined) {
      payload.roleAssignedAt = Math.max(0, Math.trunc(options.roleAssignedAt));
    }
    if (options?.roleExpiresAt !== undefined) {
      payload.roleExpiresAt = Math.max(0, Math.trunc(options.roleExpiresAt));
    } else if (normalizedRole === 'free') {
      payload.roleExpiresAt = 0;
    }
    try {
      await updateDoc(ref, payload);
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          await fetch('/api/internal/admin-sync-user', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${idToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ uid }),
          });
        } catch {
          // Non-blocking server registry sync
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const syncUsersToServer = async (uids: string[]) => {
    if (!firebaseUser || uids.length === 0) return;
    try {
      const idToken = await firebaseUser.getIdToken();
      await fetch('/api/internal/admin-sync-user', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uids }),
      });
    } catch {
      // Non-blocking server registry sync
    }
  };

  const handleBatchUpdateUsersRole = async (
    uids: string[],
    role: UserRole,
    options?: { roleAssignedAt?: number; roleExpiresAt?: number; resetCredits?: boolean }
  ) => {
    const protectedUids = new Set(
      allUsers.filter((u) => u.email.toLowerCase() === ADMIN_EMAIL).map((u) => u.uid)
    );
    const targetUids = Array.from(new Set(uids.map((id) => id.trim()).filter(Boolean))).filter(
      (id) => !protectedUids.has(id)
    );
    if (targetUids.length === 0) return;

    const normalizedRole = normalizeRoleKey(role);
    const dailyLimit = resolveRoleDailyLimit(normalizedRole, siteContent.pricingPlans);
    const today = getTodayDateString();

    const basePayload: Record<string, unknown> = {
      role: normalizedRole,
      dailyLimit,
      updatedAt: serverTimestamp(),
    };
    if (options?.roleAssignedAt !== undefined) {
      basePayload.roleAssignedAt = Math.max(0, Math.trunc(options.roleAssignedAt));
    }
    if (options?.roleExpiresAt !== undefined) {
      basePayload.roleExpiresAt = Math.max(0, Math.trunc(options.roleExpiresAt));
    } else if (normalizedRole === 'free') {
      basePayload.roleExpiresAt = 0;
    }
    if (options?.resetCredits) {
      basePayload.creditsUsedToday = 0;
      basePayload.creditsResetDate = today;
    }

    try {
      for (let i = 0; i < targetUids.length; i += 400) {
        const chunk = targetUids.slice(i, i + 400);
        const batch = writeBatch(db);
        for (const uid of chunk) {
          batch.update(doc(db, 'users', uid), basePayload);
        }
        await batch.commit();
      }
      await syncUsersToServer(targetUids);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users');
    }
  };

  const handleResetUserCredits = async (uid: string) => {
    const ref = doc(db, 'users', uid);
    try {
      await updateDoc(ref, {
        creditsUsedToday: 0,
        creditsResetDate: getTodayDateString(),
        updatedAt: serverTimestamp(),
      });
      await syncUsersToServer([uid]);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleBatchResetUserCredits = async (
    uids: string[],
    options?: {
      resetUsage?: boolean;
      dailyLimitMode?: 'keep' | 'sync_role' | 'custom';
      customDailyLimit?: number;
    }
  ) => {
    const protectedUids = new Set(
      allUsers.filter((u) => u.email.toLowerCase() === ADMIN_EMAIL).map((u) => u.uid)
    );
    const targetUids = Array.from(new Set(uids.map((id) => id.trim()).filter(Boolean))).filter(
      (id) => !protectedUids.has(id)
    );
    if (targetUids.length === 0) return;

    const resetUsage = options?.resetUsage !== false;
    const dailyLimitMode = options?.dailyLimitMode ?? 'keep';
    const safeCustomLimit =
      options?.customDailyLimit === -1
        ? -1
        : Math.max(1, Math.min(10_000_000, Math.trunc(options?.customDailyLimit ?? FREE_DAILY_LIMIT)));
    const today = getTodayDateString();
    const userByUid = new Map(allUsers.map((u) => [u.uid, u]));

    try {
      for (let i = 0; i < targetUids.length; i += 400) {
        const chunk = targetUids.slice(i, i + 400);
        const batch = writeBatch(db);
        for (const uid of chunk) {
          const payload: Record<string, unknown> = {
            updatedAt: serverTimestamp(),
          };
          if (resetUsage) {
            payload.creditsUsedToday = 0;
            payload.creditsResetDate = today;
          }
          if (dailyLimitMode === 'custom') {
            payload.dailyLimit = safeCustomLimit;
          } else if (dailyLimitMode === 'sync_role') {
            const targetUser = userByUid.get(uid);
            const roleKey = targetUser?.role || 'free';
            payload.dailyLimit = resolveRoleDailyLimit(roleKey, siteContent.pricingPlans);
          }
          batch.update(doc(db, 'users', uid), payload);
        }
        await batch.commit();
      }
      await syncUsersToServer(targetUids);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users');
    }
  };

  const handleSuspendUser = async (uid: string, suspend: boolean, reason?: string) => {
    const target = allUsers.find((u) => u.uid === uid);
    if (
      (target && target.email.toLowerCase() === ADMIN_EMAIL) ||
      (firebaseUser && uid === firebaseUser.uid)
    ) {
      throw new Error('Akun Administrator utama atau sesi aktif Anda tidak dapat disuspend.');
    }
    const cleanReason = suspend ? (reason ?? '').trim().slice(0, 300) : '';
    const ref = doc(db, 'users', uid);
    try {
      await updateDoc(ref, {
        suspended: suspend,
        suspendedReason: cleanReason,
        suspendedAt: suspend ? Date.now() : 0,
        updatedAt: serverTimestamp(),
      });
      await syncUsersToServer([uid]);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleBatchSuspendUsers = async (
    uids: string[],
    suspend: boolean,
    reason?: string
  ) => {
    const protectedUids = new Set(
      allUsers
        .filter(
          (u) =>
            u.email.toLowerCase() === ADMIN_EMAIL ||
            (firebaseUser ? u.uid === firebaseUser.uid : false)
        )
        .map((u) => u.uid)
    );
    const targetUids = Array.from(new Set(uids.map((id) => id.trim()).filter(Boolean))).filter(
      (id) => !protectedUids.has(id)
    );
    if (targetUids.length === 0) return;

    const cleanReason = suspend ? (reason ?? '').trim().slice(0, 300) : '';
    const payload = {
      suspended: suspend,
      suspendedReason: cleanReason,
      suspendedAt: suspend ? Date.now() : 0,
      updatedAt: serverTimestamp(),
    };

    try {
      for (let i = 0; i < targetUids.length; i += 400) {
        const chunk = targetUids.slice(i, i + 400);
        const batch = writeBatch(db);
        for (const uid of chunk) {
          batch.update(doc(db, 'users', uid), payload);
        }
        await batch.commit();
      }
      await syncUsersToServer(targetUids);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users');
    }
  };

  const handleDeleteUserAccount = async (uid: string) => {
    const target = allUsers.find((u) => u.uid === uid);
    if (
      (target && target.email.toLowerCase() === ADMIN_EMAIL) ||
      (firebaseUser && uid === firebaseUser.uid)
    ) {
      throw new Error('Akun Administrator utama atau akun Anda sendiri tidak dapat dihapus.');
    }

    try {
      // Clean subcollections first while parent doc exists (for rules check)
      for (const subCol of ['usageLogs', 'readNotifications'] as const) {
        const snap = await getDocs(collection(db, 'users', uid, subCol));
        if (!snap.empty) {
          for (let i = 0; i < snap.docs.length; i += 400) {
            const batch = writeBatch(db);
            for (const d of snap.docs.slice(i, i + 400)) {
              batch.delete(d.ref);
            }
            await batch.commit();
          }
        }
      }

      try {
        await deleteDoc(doc(db, 'admins', uid));
      } catch {
        // Optional admins marker doc may not exist
      }

      await deleteDoc(doc(db, 'users', uid));

      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          await fetch('/api/internal/admin-sync-user', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${idToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ uid, deleted: true }),
          });
        } catch {
          // Non-blocking server registry eviction
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${uid}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip bg-white text-slate-900 dark:bg-[#0A0A0A] dark:text-slate-100">
      <HeaderBar
        content={siteContent}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        onToggleSidebar={() => setMobileSidebarOpen((prev) => !prev)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenNotifications={() => setNotificationsOpen(true)}
        unreadCount={unreadCount}
        userProfile={userProfile}
        authLoading={authLoading}
        onLoginGoogle={handleLoginGoogle}
        onRequestLogout={() => setLogoutConfirmOpen(true)}
        onNavigate={navigateTo}
      />

      {/* ALWAYS NOTIFICATION BANNER BELOW HEADER */}
      {alwaysNotifications.map((banner) => (
        <div
          key={banner.id}
          role="status"
          className="border-b border-sky-500/30 bg-sky-50 px-4 py-2 text-xs text-sky-950 dark:bg-sky-950/45 dark:text-sky-100"
        >
          <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 text-center">
            <Megaphone className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
            <span className="whitespace-pre-line">
              <strong className="font-semibold">{banner.title}:</strong>{' '}
              <RichTextLinks text={banner.message} />
            </span>
          </div>
        </div>
      ))}

      {authError && (
        <div className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-center text-xs text-rose-600 dark:text-rose-300">
          {authError}
        </div>
      )}

      {/* Main Split Workspace: Collapsible Sidebar + Dedicated Active Page + Footer */}
      <div className="flex flex-1 min-w-0">
        <SidebarNav
          brandName={siteContent.brandName}
          currentRoute={route}
          categoryOrder={siteContent.categoryOrder}
          hiddenCategories={siteContent.hiddenCategories}
          hiddenEndpointIds={siteContent.hiddenEndpointIds}
          privateEndpointIds={siteContent.privateEndpointIds}
          onNavigate={navigateTo}
          onOpenNotifications={() => setNotificationsOpen(true)}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          unreadCount={unreadCount}
          userProfile={userProfile}
        />

        <div className="flex flex-1 flex-col min-w-0">
          <main className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={route.page === 'docs' ? `docs-${route.endpointId}` : route.page}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] as const }}
                className="min-w-0"
              >
                {route.page === 'welcome' && (
                  <WelcomePage
                    content={siteContent}
                    userProfile={userProfile}
                    onNavigate={navigateTo}
                    onLoginGoogle={handleLoginGoogle}
                  />
                )}

                {route.page === 'docs' && (
                  <EndpointDocPage
                    endpointId={route.endpointId}
                    content={siteContent}
                    userProfile={userProfile}
                    onLoginGoogle={handleLoginGoogle}
                    onNavigate={navigateTo}
                    onRecordUsageLog={handleRecordUsageLog}
                    onRefreshUserProfile={handleRefreshUserProfile}
                  />
                )}

                {route.page === 'keys' && (
                  <ApiKeysPage
                    content={siteContent}
                    userProfile={userProfile}
                    usageLogs={usageLogs}
                    onLoginGoogle={handleLoginGoogle}
                    onRotateApiKey={handleRotateApiKey}
                    onNavigate={navigateTo}
                  />
                )}

                {route.page === 'pricing' && (
                  <PricingPage
                    content={siteContent}
                    userProfile={userProfile}
                    onLoginGoogle={handleLoginGoogle}
                    onNavigate={navigateTo}
                  />
                )}

                {route.page === 'cs' && (
                  <SupportCsPage content={siteContent} onNavigate={navigateTo} />
                )}

                {route.page === 'faq' && (
                  <FaqPage content={siteContent} onNavigate={navigateTo} />
                )}

                {route.page === 'sosmed' && (
                  <SosmedPage content={siteContent} onNavigate={navigateTo} />
                )}

                {route.page === 'public-chat' && (
                  <PublicChatPage content={siteContent} onNavigate={navigateTo} />
                )}

                {route.page === 'admin' && (
                  <AdminDashboardPage
                    userProfile={userProfile}
                    siteContent={siteContent}
                    notifications={notifications}
                    allUsers={allUsers}
                    historicalLogs={adminHistoricalLogs}
                    onSaveSiteContent={handleSaveSiteContent}
                    onCreateNotification={handleCreateNotification}
                    onToggleNotificationActive={handleToggleNotificationActive}
                    onDeleteNotification={handleDeleteNotification}
                    onUpdateUserRole={handleUpdateUserRole}
                    onResetUserCredits={handleResetUserCredits}
                    onBatchUpdateUsersRole={handleBatchUpdateUsersRole}
                    onBatchResetUserCredits={handleBatchResetUserCredits}
                    onSuspendUser={handleSuspendUser}
                    onBatchSuspendUsers={handleBatchSuspendUsers}
                    onDeleteUserAccount={handleDeleteUserAccount}
                    onNavigate={navigateTo}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </main>

          <FooterBar content={siteContent} onNavigate={navigateTo} />
        </div>
      </div>

      {/* Animated Center-Right Circular Sidebar Menu */}
      <FloatingCircularMenu
        currentRoute={route}
        content={siteContent}
        onNavigate={navigateTo}
      />

      {/* Scroll-Aware Floating Arrow-Up Button */}
      <ScrollToTopButton />

      {/* Quick Search Modal */}
      <SearchModal
        open={searchOpen}
        hiddenCategories={siteContent.hiddenCategories}
        hiddenEndpointIds={siteContent.hiddenEndpointIds}
        privateEndpointIds={siteContent.privateEndpointIds}
        onClose={() => setSearchOpen(false)}
        onNavigate={navigateTo}
      />

      {/* Closeable Notifications Modal */}
      <NotificationsModal
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        readNotifIds={effectiveReadSet}
        onMarkRead={handleMarkNotifRead}
        onMarkAllRead={handleMarkAllNotifsRead}
      />

      {/* Logout Confirmation Modal */}
      <LogoutConfirmModal
        open={logoutConfirmOpen}
        content={siteContent}
        userEmail={userProfile?.email}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={handleConfirmLogout}
      />

      {/* One-Time "Penting" Notification Modal */}
      <ImportantNotifModal
        notification={pendingImportantNotif}
        onDismiss={handleMarkNotifRead}
      />
    </div>
  );
}
