/**
 * OfflineBanner.test.tsx
 *
 * Regression test for the crash-on-launch bug: OfflineBanner calls
 * useTranslation() and MUST be rendered inside <I18nProvider>. It was placed in
 * App.tsx above the provider, throwing "useTranslation must be used inside
 * <I18nProvider>" on startup. It also needs the QueryClient + SafeArea contexts.
 */
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OfflineBanner } from '../OfflineBanner';
import { I18nProvider } from '../../i18n';

function renderBanner() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 0, height: 0 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <I18nProvider initialLang="fr">
          <OfflineBanner />
        </I18nProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

describe('OfflineBanner', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders nothing when online with no pending mutations', () => {
    jest.spyOn(onlineManager, 'isOnline').mockReturnValue(true);
    renderBanner();
    expect(screen.queryByText('Hors ligne')).toBeNull();
  });

  it('shows the offline label when offline (and does NOT crash without a wrapping provider issue)', () => {
    jest.spyOn(onlineManager, 'isOnline').mockReturnValue(false);
    renderBanner();
    expect(screen.getByText('Hors ligne')).toBeTruthy();
  });
});
