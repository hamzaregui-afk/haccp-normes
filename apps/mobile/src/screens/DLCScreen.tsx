import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { dlcClient } from '../api/client';
import { useTranslation } from '@/i18n';
import type { MainTabParamList } from '../navigation/MainNavigator';

// ── Types ─────────────────────────────────────────────────────────────────────

// ARCH-DECISION: These types mirror CalculateDlcDtoSchema in dlc-service exactly.
// The original screen sent { fabricationDate, shelfLifeDays, lotNumber } which
// Zod rejected (missing required `productId`, wrong field names) → always 400.
// `productId` is set to the product name for manual entries since the calculate
// endpoint only requires z.string().min(1) — not a CUID — and echoes it back.
interface DLCCalculatePayload {
  productId:   string;  // productName used as de-facto id for manual entries
  productName: string;
  dlcDays:     number;  // was shelfLifeDays — renamed to match backend
  producedAt:  string;  // was fabricationDate — renamed to match backend
}

// Mirrors the actual response shape from dlc-service calculate()
interface DLCResult {
  productId:   string;
  productName: string;
  dlcDays:     number;
  producedAt:  string;
  expiresAt:   string;  // was expirationDate — corrected to match backend field
}

interface DLCResponse {
  data: DLCResult;
}

// ── HTML label template ───────────────────────────────────────────────────────

interface LabelData {
  productName: string;
  lotNumber:   string;  // local form value — not part of backend DTO
  producedAt:  string;
  expiresAt:   string;
  dlcDays:     number;
}

// ARCH-DECISION: Physical DLC labels are always formatted in French (fr-FR).
// Table headers (N° Lot, Fabrication, Date limite) are French regulatory
// terminology — identical to the Zebra ZPL labels in the web app. The locale
// for printed labels must not follow the operator's UI language preference.
function buildLabelHtml(label: LabelData): string {
  const expDate = new Date(label.expiresAt).toLocaleDateString('fr-FR');
  const fabDate = new Date(label.producedAt).toLocaleDateString('fr-FR');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; background: #fff; }
  .label {
    width: 90mm;
    margin: 10mm auto;
    border: 2px solid #1A3D2B;
    border-radius: 6px;
    overflow: hidden;
  }
  .label-header {
    background: #1A3D2B;
    color: #B5833A;
    text-align: center;
    padding: 8px 12px;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 2px;
  }
  .label-body { padding: 12px; }
  .product-name {
    font-size: 18px;
    font-weight: 700;
    color: #1A3D2B;
    margin-bottom: 10px;
    text-align: center;
  }
  table { width: 100%; border-collapse: collapse; }
  tr td { padding: 4px 6px; font-size: 12px; }
  tr td:first-child { font-weight: 600; color: #6B7280; width: 50%; }
  tr td:last-child { color: #1a1a1a; }
  .expiry-row td { border-top: 1px solid #eee; padding-top: 8px; margin-top: 4px; }
  .expiry-value { font-size: 20px !important; font-weight: 800 !important; color: #B5833A !important; }
  .label-footer {
    background: #F5F5F0;
    text-align: center;
    padding: 6px;
    font-size: 9px;
    color: #9CA3AF;
    border-top: 1px solid #e5e5e5;
  }
</style>
</head>
<body>
<div class="label">
  <div class="label-header">NORMES HACCP</div>
  <div class="label-body">
    <div class="product-name">${label.productName}</div>
    <table>
      <tr><td>N° Lot</td><td>${label.lotNumber}</td></tr>
      <tr><td>Fabrication</td><td>${fabDate}</td></tr>
      <tr><td>DLC (jours)</td><td>${label.dlcDays} j</td></tr>
      <tr class="expiry-row">
        <td>Date limite</td>
        <td class="expiry-value">${expDate}</td>
      </tr>
    </table>
  </div>
  <div class="label-footer">Généré le ${new Date().toLocaleDateString('fr-FR')} • HACCP SaaS</div>
</div>
</body>
</html>`;
}

// ── Expiring today alert ──────────────────────────────────────────────────────

interface DlcLabel {
  id: string;
  productName: string;
  expiresAt: string;
  lotNumber?: string | null;
}

function ExpiringTodayBanner() {
  const { t } = useTranslation();
  const { data } = useQuery<DlcLabel[]>({
    queryKey: ['dlc', 'expiring-today'],
    queryFn: async () => {
      const res = await dlcClient.get<{ data: DlcLabel[] }>('/api/v1/dlc/labels/expiring-today');
      return res.data.data ?? [];
    },
    refetchInterval: 5 * 60 * 1000,
  });

  if (!data || data.length === 0) return null;

  return (
    <View style={alertStyles.banner}>
      <Text style={alertStyles.bannerTitle}>
        ⚠️  {data.length} {t('dlc.expiringToday')}
      </Text>
      {data.map((label) => (
        <Text key={label.id} style={alertStyles.bannerItem}>
          • {label.productName}
          {label.lotNumber ? `  |  Lot ${label.lotNumber}` : ''}
        </Text>
      ))}
    </View>
  );
}

const alertStyles = StyleSheet.create({
  banner: {
    backgroundColor: '#FEE2E2',
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 6,
  },
  bannerItem: {
    fontSize: 13,
    color: '#7F1D1D',
    marginTop: 2,
  },
});

// ─────────────────────────────────────────────────────────────────────────────

type Props = BottomTabScreenProps<MainTabParamList, 'DLC'>;

export function DLCScreen(_props: Props) {
  const { t, lang } = useTranslation();
  const [productName, setProductName] = useState('');
  const [lotNumber, setLotNumber]   = useState('');
  const [fabDate, setFabDate]       = useState('');
  const [shelfLife, setShelfLife]   = useState('3');
  const [calculating, setCalculating]     = useState(false);
  const [networkPrinting, setNetworkPrinting] = useState(false);
  const [lastResult, setLastResult]       = useState<DLCResult | null>(null);

  const handleCalculateAndPrint = async () => {
    // Basic validation
    if (!productName.trim() || !lotNumber.trim() || !fabDate.trim()) {
      Alert.alert(t('dlc.errorTitle'), t('dlc.validation.requiredFields'));
      return;
    }
    const days = parseInt(shelfLife, 10);
    if (isNaN(days) || days <= 0) {
      Alert.alert(t('dlc.errorTitle'), t('dlc.validation.invalidDays'));
      return;
    }
    // Validate date format loosely (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fabDate.trim())) {
      Alert.alert(t('dlc.errorTitle'), t('dlc.validation.invalidDate'));
      return;
    }

    setCalculating(true);
    try {
      // ARCH-DECISION: `productId` is set to productName for manual entries.
      // The backend only requires z.string().min(1) (not a CUID), so this is valid.
      // lotNumber stays local — the calculate endpoint doesn't store it.
      const payload: DLCCalculatePayload = {
        productId:   productName.trim(),
        productName: productName.trim(),
        dlcDays:     days,
        producedAt:  fabDate.trim(),
      };
      const res = await dlcClient.post<DLCResponse>('/api/v1/dlc/calculate', payload);
      const result = res.data.data;
      setLastResult(result);

      // Build label data — merge API response with local lotNumber
      const labelData: LabelData = {
        productName: result.productName,
        lotNumber:   lotNumber.trim(),
        producedAt:  result.producedAt,
        expiresAt:   result.expiresAt,
        dlcDays:     result.dlcDays,
      };

      // Generate and print PDF
      const html = buildLabelHtml(labelData);
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${t('dlc.share')} — ${productName}`,
        });
      } else {
        // On physical devices that support direct printing
        await Print.printAsync({ uri });
      }
    } catch (err: unknown) {
      const msg = isApiError(err)
        ? String(err.response?.data?.message ?? t('dlc.errorMsg'))
        : t('dlc.serverError');
      Alert.alert(t('dlc.errorTitle'), msg);
    } finally {
      setCalculating(false);
    }
  };

  const handleNetworkPrint = async () => {
    if (!productName.trim() || !lotNumber.trim() || !fabDate.trim()) {
      Alert.alert(t('dlc.errorTitle'), t('dlc.validation.requiredFields'));
      return;
    }
    const days = parseInt(shelfLife, 10);
    if (isNaN(days) || days <= 0) {
      Alert.alert(t('dlc.errorTitle'), t('dlc.validation.invalidDays'));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fabDate.trim())) {
      Alert.alert(t('dlc.errorTitle'), t('dlc.validation.invalidDate'));
      return;
    }

    setNetworkPrinting(true);
    try {
      const calcRes = await dlcClient.post<DLCResponse>('/api/v1/dlc/calculate', {
        productId:   productName.trim(),
        productName: productName.trim(),
        dlcDays:     days,
        producedAt:  fabDate.trim(),
      });
      const result = calcRes.data.data;
      setLastResult(result);

      await dlcClient.post('/api/v1/print-jobs', {
        labelType: 'DLC',
        copies: 1,
        payload: {
          productName: result.productName,
          lotNumber:   lotNumber.trim(),
          producedAt:  result.producedAt,
          expiresAt:   result.expiresAt,
        },
      });
      Alert.alert('✅', t('dlc.printNetworkSuccess'));
    } catch (err: unknown) {
      const msg = isApiError(err)
        ? String(err.response?.data?.message ?? t('dlc.errorMsg'))
        : t('dlc.serverError');
      Alert.alert(t('dlc.errorTitle'), msg);
    } finally {
      setNetworkPrinting(false);
    }
  };

  const expirationLabel = lastResult
    ? new Date(lastResult.expiresAt).toLocaleDateString(lang, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ExpiringTodayBanner />
      <Text style={styles.pageTitle}>{t('dlc.pageTitle')}</Text>

      {/* Product name */}
      <Text style={styles.label}>{t('dlc.productLabel')}</Text>
      <TextInput
        style={styles.input}
        placeholder={t('dlc.productNameHint')}
        placeholderTextColor="#9CA3AF"
        value={productName}
        onChangeText={setProductName}
        returnKeyType="next"
      />

      {/* Lot number */}
      <Text style={styles.label}>{t('dlc.lotLabel')}</Text>
      <TextInput
        style={styles.input}
        placeholder={t('dlc.lotNumberHint')}
        placeholderTextColor="#9CA3AF"
        value={lotNumber}
        onChangeText={setLotNumber}
        autoCapitalize="characters"
        returnKeyType="next"
      />

      {/* Fabrication date */}
      <Text style={styles.label}>{t('dlc.fabricationLabel')}</Text>
      <TextInput
        style={styles.input}
        placeholder="2025-05-03"
        placeholderTextColor="#9CA3AF"
        value={fabDate}
        onChangeText={setFabDate}
        keyboardType="numbers-and-punctuation"
        returnKeyType="next"
      />

      {/* Shelf life */}
      <Text style={styles.label}>{t('dlc.shelfLifeLabel')}</Text>
      <TextInput
        style={styles.input}
        placeholder="3"
        placeholderTextColor="#9CA3AF"
        value={shelfLife}
        onChangeText={setShelfLife}
        keyboardType="number-pad"
        returnKeyType="done"
      />

      {/* Result preview */}
      {lastResult ? (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>{t('dlc.resultTitle')}</Text>
          <Text style={styles.resultDate}>{expirationLabel}</Text>
        </View>
      ) : null}

      {/* CTA */}
      <TouchableOpacity
        style={[styles.printBtn, calculating && styles.printBtnDisabled]}
        onPress={handleCalculateAndPrint}
        disabled={calculating}
        activeOpacity={0.85}
      >
        {calculating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.printBtnIcon}>🖨️</Text>
            <Text style={styles.printBtnText}>{t('dlc.calculatePrint')}</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.networkPrintBtn, networkPrinting && styles.printBtnDisabled]}
        onPress={handleNetworkPrint}
        disabled={networkPrinting}
        activeOpacity={0.85}
      >
        {networkPrinting ? (
          <ActivityIndicator color="#1A3D2B" />
        ) : (
          <>
            <Text style={styles.networkPrintBtnIcon}>🔌</Text>
            <Text style={styles.networkPrintBtnText}>{t('dlc.printNetwork')}</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.hint}>{t('dlc.shareHint')}</Text>
    </ScrollView>
  );
}

DLCScreen.displayName = 'DLCScreen';

// Narrow type-guard for Axios errors
function isApiError(err: unknown): err is { response?: { data?: { message?: unknown } } } {
  return typeof err === 'object' && err !== null && 'response' in err;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F0',
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A3D2B',
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1a1a1a',
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2D6A4F',
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 6,
  },
  resultDate: {
    fontSize: 22,
    fontWeight: '800',
    color: '#B5833A',
  },
  printBtn: {
    backgroundColor: '#1A3D2B',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  printBtnDisabled: {
    opacity: 0.65,
  },
  printBtnIcon: {
    fontSize: 18,
  },
  printBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
  },
  networkPrintBtn: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#1A3D2B',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  networkPrintBtnIcon: {
    fontSize: 18,
  },
  networkPrintBtnText: {
    color: '#1A3D2B',
    fontSize: 15,
    fontWeight: '700',
  },
});
