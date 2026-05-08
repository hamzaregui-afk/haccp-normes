/**
 * DLCScreen.test.tsx
 *
 * Unit tests for the DLCScreen (React Native).
 *
 * Strategy:
 *  - DLCScreen does NOT use react-query — it calls dlcClient.post() directly
 *    inside an async handler. We mock dlcClient and expo-print / expo-sharing
 *    (already stubbed in test-setup.ts).
 *  - Use fireEvent + waitFor / act for async interactions.
 *
 * Tests cover:
 *  - Page title "Calcul & Impression DLC"
 *  - 4 form fields: Produit, N° de lot, Date de fabrication, Durée de conservation
 *  - "Calculer & Imprimer" button rendered
 *  - Validation:
 *    - Empty required fields → Alert("Champs requis")
 *    - Invalid shelf-life (non-integer / 0 / negative) → Alert("Valeur invalide")
 *    - Invalid date format → Alert("Format invalide")
 *  - Successful flow:
 *    - dlcClient.post called with correct payload
 *    - Result card with "Date limite de consommation" shown
 *    - expo-print / expo-sharing invoked
 *  - Error from API → Alert("Erreur")
 *  - Calculating state: ActivityIndicator shown, button disabled
 *  - Hint text at bottom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// ── API client mock ────────────────────────────────────────────────────────────

jest.mock('../../api/client', () => ({
  dlcClient: {
    post: jest.fn(),
  },
}));

// ── Import under test ─────────────────────────────────────────────────────────

import { DLCScreen } from '../DLCScreen';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DLC_RESULT = {
  expirationDate: '2026-05-09T00:00:00.000Z',
  label: {
    productName:      'Yaourt nature',
    lotNumber:        'LOT-2026-001',
    fabricationDate:  '2026-05-06T00:00:00.000Z',
    expirationDate:   '2026-05-09T00:00:00.000Z',
    shelfLifeDays:    3,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DLCScreen
        navigation={{} as never}
        route={{} as never}
      />
    </QueryClientProvider>,
  );
}

/** Fills all required DLC form fields with valid data. */
function fillForm(overrides: {
  productName?: string;
  lotNumber?: string;
  fabDate?: string;
  shelfLife?: string;
} = {}) {
  const {
    productName = 'Yaourt nature',
    lotNumber   = 'LOT-2026-001',
    fabDate     = '2026-05-06',
    shelfLife   = '3',
  } = overrides;

  fireEvent.changeText(screen.getByPlaceholderText('Ex: Yaourt nature'),   productName);
  fireEvent.changeText(screen.getByPlaceholderText('Ex: LOT-2025-042'),    lotNumber);
  fireEvent.changeText(screen.getByPlaceholderText('2025-05-03'),          fabDate);
  fireEvent.changeText(screen.getByPlaceholderText('3'),                   shelfLife);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('DLCScreen', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { dlcClient } = require('../../api/client') as { dlcClient: { post: jest.Mock } };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: successful API response
    dlcClient.post.mockResolvedValue({ data: { data: DLC_RESULT } });
    // expo-print: printToFileAsync returns a URI; printAsync is a no-op
    (Print.printToFileAsync as jest.Mock).mockResolvedValue({ uri: 'file:///tmp/label.pdf' });
    (Print.printAsync as jest.Mock).mockResolvedValue(undefined);
    // expo-sharing: available by default
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
  });

  // ── Page structure ────────────────────────────────────────────────────────────

  it('renders the page title "Calcul & Impression DLC"', () => {
    renderScreen();
    expect(screen.getByText('Calcul & Impression DLC')).toBeTruthy();
  });

  it('renders the "Produit *" field label', () => {
    renderScreen();
    expect(screen.getByText('Produit *')).toBeTruthy();
  });

  it('renders the product name TextInput', () => {
    renderScreen();
    expect(screen.getByPlaceholderText('Ex: Yaourt nature')).toBeTruthy();
  });

  it('renders the "N° de lot *" field label', () => {
    renderScreen();
    expect(screen.getByText('N° de lot *')).toBeTruthy();
  });

  it('renders the lot number TextInput', () => {
    renderScreen();
    expect(screen.getByPlaceholderText('Ex: LOT-2025-042')).toBeTruthy();
  });

  it('renders the fabrication date label', () => {
    renderScreen();
    expect(screen.getByText(/date de fabrication/i)).toBeTruthy();
  });

  it('renders the fabrication date TextInput', () => {
    renderScreen();
    expect(screen.getByPlaceholderText('2025-05-03')).toBeTruthy();
  });

  it('renders the shelf-life label', () => {
    renderScreen();
    expect(screen.getByText(/durée de conservation/i)).toBeTruthy();
  });

  it('renders the shelf-life TextInput with default value "3"', () => {
    renderScreen();
    expect(screen.getByPlaceholderText('3')).toBeTruthy();
  });

  it('renders the "Calculer & Imprimer" button', () => {
    renderScreen();
    expect(screen.getByText('Calculer & Imprimer')).toBeTruthy();
  });

  it('renders the hint text about PDF sharing', () => {
    renderScreen();
    expect(screen.getByText(/étiquette sera générée en pdf/i)).toBeTruthy();
  });

  // ── Validation ────────────────────────────────────────────────────────────────

  it('shows "Champs requis" Alert when all fields are empty', () => {
    renderScreen();
    // Clear the shelf-life field (default is "3")
    fireEvent.changeText(screen.getByPlaceholderText('3'), '');
    fireEvent.press(screen.getByText('Calculer & Imprimer'));
    expect(Alert.alert).toHaveBeenCalledWith('Champs requis', expect.any(String));
  });

  it('shows "Champs requis" Alert when product name is missing', () => {
    renderScreen();
    fireEvent.changeText(screen.getByPlaceholderText('Ex: LOT-2025-042'), 'LOT-001');
    fireEvent.changeText(screen.getByPlaceholderText('2025-05-03'), '2026-05-06');
    fireEvent.press(screen.getByText('Calculer & Imprimer'));
    expect(Alert.alert).toHaveBeenCalledWith('Champs requis', expect.any(String));
  });

  it('shows "Valeur invalide" Alert when shelf-life is 0', () => {
    renderScreen();
    fillForm({ shelfLife: '0' });
    fireEvent.press(screen.getByText('Calculer & Imprimer'));
    expect(Alert.alert).toHaveBeenCalledWith('Valeur invalide', expect.any(String));
  });

  it('shows "Valeur invalide" Alert when shelf-life is negative', () => {
    renderScreen();
    fillForm({ shelfLife: '-5' });
    fireEvent.press(screen.getByText('Calculer & Imprimer'));
    expect(Alert.alert).toHaveBeenCalledWith('Valeur invalide', expect.any(String));
  });

  it('shows "Valeur invalide" Alert when shelf-life is not a number', () => {
    renderScreen();
    fillForm({ shelfLife: 'abc' });
    fireEvent.press(screen.getByText('Calculer & Imprimer'));
    expect(Alert.alert).toHaveBeenCalledWith('Valeur invalide', expect.any(String));
  });

  it('shows "Format invalide" Alert when date is not YYYY-MM-DD', () => {
    renderScreen();
    fillForm({ fabDate: '06/05/2026' });
    fireEvent.press(screen.getByText('Calculer & Imprimer'));
    expect(Alert.alert).toHaveBeenCalledWith('Format invalide', expect.any(String));
  });

  it('shows "Format invalide" Alert for partial date strings', () => {
    renderScreen();
    fillForm({ fabDate: '2026-05' });
    fireEvent.press(screen.getByText('Calculer & Imprimer'));
    expect(Alert.alert).toHaveBeenCalledWith('Format invalide', expect.any(String));
  });

  // ── Successful flow ───────────────────────────────────────────────────────────

  it('calls dlcClient.post with the correct payload', async () => {
    renderScreen();
    fillForm();
    fireEvent.press(screen.getByText('Calculer & Imprimer'));

    await waitFor(() => expect(dlcClient.post).toHaveBeenCalledTimes(1));
    expect(dlcClient.post).toHaveBeenCalledWith(
      '/api/v1/dlc/calculate',
      {
        productName:     'Yaourt nature',
        lotNumber:       'LOT-2026-001',
        fabricationDate: '2026-05-06',
        shelfLifeDays:   3,
      },
    );
  });

  it('shows the result card with "Date limite de consommation" after success', async () => {
    renderScreen();
    fillForm();
    fireEvent.press(screen.getByText('Calculer & Imprimer'));

    await waitFor(() => {
      expect(screen.getByText('Date limite de consommation')).toBeTruthy();
    });
  });

  it('calls printToFileAsync to generate the PDF', async () => {
    renderScreen();
    fillForm();
    fireEvent.press(screen.getByText('Calculer & Imprimer'));

    await waitFor(() => expect(Print.printToFileAsync).toHaveBeenCalledTimes(1));
    expect(Print.printToFileAsync).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.stringContaining('Yaourt nature') }),
    );
  });

  it('calls shareAsync when sharing is available', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    renderScreen();
    fillForm();
    fireEvent.press(screen.getByText('Calculer & Imprimer'));

    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///tmp/label.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  });

  it('calls printAsync directly when sharing is NOT available', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    renderScreen();
    fillForm();
    fireEvent.press(screen.getByText('Calculer & Imprimer'));

    await waitFor(() => expect(Print.printAsync).toHaveBeenCalledTimes(1));
    expect(Print.printAsync).toHaveBeenCalledWith({ uri: 'file:///tmp/label.pdf' });
  });

  // ── Error handling ────────────────────────────────────────────────────────────

  it('shows "Erreur" Alert when the API call fails', async () => {
    dlcClient.post.mockRejectedValue(new Error('Network error'));
    renderScreen();
    fillForm();
    fireEvent.press(screen.getByText('Calculer & Imprimer'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Erreur', expect.any(String));
    });
  });

  it('shows the API error message when available', async () => {
    const apiError = { response: { data: { message: 'Date de fabrication invalide' } } };
    dlcClient.post.mockRejectedValue(apiError);
    renderScreen();
    fillForm();
    fireEvent.press(screen.getByText('Calculer & Imprimer'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Erreur',
        'Date de fabrication invalide',
      );
    });
  });

  // ── Calculating state ─────────────────────────────────────────────────────────

  it('shows ActivityIndicator while calculating and hides button text', async () => {
    // Make the API call hang so the calculating state persists during assertion
    dlcClient.post.mockReturnValue(new Promise(() => undefined));
    renderScreen();
    fillForm();

    fireEvent.press(screen.getByText('Calculer & Imprimer'));

    await waitFor(() => {
      expect(screen.queryByText('Calculer & Imprimer')).toBeNull();
      expect(screen.UNSAFE_queryByType(require('react-native').ActivityIndicator)).toBeTruthy();
    });
  });

  it('hides the ActivityIndicator and restores button text after completion', async () => {
    renderScreen();
    fillForm();
    fireEvent.press(screen.getByText('Calculer & Imprimer'));

    // Wait for the async operation to settle
    await waitFor(() => {
      expect(screen.getByText('Calculer & Imprimer')).toBeTruthy();
    });
  });
});
