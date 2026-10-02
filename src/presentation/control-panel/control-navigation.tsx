import { useTranslation } from 'react-i18next';

export const controlPages = [
  { id: 'live', label: 'navLive', help: 'navLiveHelp', icon: 'M4 5h16v12H4z M8 21h8 M12 17v4' },
  {
    id: 'comments',
    label: 'navComments',
    help: 'navCommentsHelp',
    icon: 'M4 4h16v12H9l-5 4z M8 8h8 M8 12h5',
  },
  { id: 'raid', label: 'navRaid', help: 'navRaidHelp', icon: 'M4 5h16v14H4z M10 9l5 3-5 3z' },
  {
    id: 'points',
    label: 'navPoints',
    help: 'navPointsHelp',
    icon: 'M12 3l3 6 6 3-6 3-3 6-3-6-6-3 6-3z',
  },
  {
    id: 'assets',
    label: 'navAssets',
    help: 'navAssetsHelp',
    icon: 'M4 4h16v16H4z M4 16l5-5 4 4 3-3 4 4 M8 8h.01',
  },
  {
    id: 'tools',
    label: 'navTools',
    help: 'navToolsHelp',
    icon: 'M8 4v6l-4 8v2h16v-2l-4-8V4 M7 4h10 M7 14h10',
  },
] as const;
export type ControlPage = (typeof controlPages)[number]['id'];

export function ControlNavigation({
  activePage,
  onSelect,
  pendingRaids,
}: {
  activePage: ControlPage;
  onSelect: (page: ControlPage) => void;
  pendingRaids: number;
}) {
  const { t } = useTranslation();
  return (
    <aside className="control-sidebar">
      <div className="control-brand">
        <span className="brand-mark" aria-hidden="true">
          TF
        </span>
        <div>
          <strong>Text Flow</strong>
          <span>Overlay for Twitch</span>
        </div>
      </div>
      <p className="navigation-caption">{t('controlNavigation')}</p>
      <nav aria-label={t('controlNavigation')}>
        {controlPages.map((page) => (
          <button
            key={page.id}
            type="button"
            aria-current={activePage === page.id ? 'page' : undefined}
            aria-controls={`control-page-${page.id}`}
            onClick={() => onSelect(page.id)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d={page.icon} />
            </svg>
            <span>{t(page.label)}</span>
            {page.id === 'live' && pendingRaids > 0 && (
              <span className="navigation-badge">{pendingRaids}</span>
            )}
          </button>
        ))}
      </nav>
      <p className="sidebar-notice">{t('unofficialNotice')}</p>
    </aside>
  );
}
