import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
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

// ── Screen ────────────────────────────────────────────────────────────────────

type Props = BottomTabScreenProps<MainTabParamList, 'DLC'>;

export function DLCScreen(_props: Props) {
  const [productName, setProductName] = useState('');
  const [lotNumber, setLotNumber]   = useState('');
  const [fabDate, setFabDate]       = useState('');
  const [shelfLife, setShelfLife]   = useState('3');
  const [calculating, setCalculating] = useState(false);
  const [lastResult, setLastResult]   = useState<DLCResult | null>(null);

  const handleCalculateAndPrint = async () => {
    // Basic validation
    if (!productName.trim() || !lotNumber.trim() || !fabDate.trim()) {
      Alert.alert('Champs requis', 'Veuillez remplir le produit, le lot et la date de fabrication.');
      return;
    }
    const days = parseInt(shelfLife, 10);
    if (isNaN(days) || days <= 0) {
      Alert.alert('Valeur invalide', 'La durée de conservation doit être un entier positif.');
      return;
    }
    // Validate date format loosely (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fabDate.trim())) {
      Alert.alert('Format invalide', 'La date de fabrication doit être au format YYYY-MM-DD.');
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
          dialogTitle: `Étiquette DLC — ${productName}`,
        });
      } else {
        // On physical devices that support direct printing
        await Print.printAsync({ uri });
      }
    } catch (err: unknown) {
      const msg = isApiError(err)
        ? String(err.response?.data?.message ?? 'Erreur de calcul DLC.')
        : 'Impossible de se connecter au serveur.';
      Alert.alert('Erreur', msg);
    } finally {
      setCalculating(false);
    }
  };

  const expirationLabel = lastResult
    ? new Date(lastResult.expiresAt).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Calcul & Impression DLC</Text>

      {/* Product name */}
      <Text style={styles.label}>Produit *</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: Yaourt nature"
        placeholderTextColor="#9CA3AF"
        value={productName}
        onChangeText={setProductName}
        returnKeyType="next"
      />

      {/* Lot number */}
      <Text style={styles.label}>N° de lot *</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: LOT-2025-042"
        placeholderTextColor="#9CA3AF"
        value={lotNumber}
        onChangeText={setLotNumber}
        autoCapitalize="characters"
        returnKeyType="next"
      />

      {/* Fabrication date */}
      <Text style={styles.label}>Date de fabrication * (YYYY-MM-DD)</Text>
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
      <Text style={styles.label}>Durée de conservation (jours) *</Text>
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
          <Text style={styles.resultTitle}>Date limite de consommation</Text>
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
            <Text style={styles.printBtnText}>Calculer & Imprimer</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.hint}>
        L'étiquette sera générée en PDF et partageable via votre application d'impression.
      </Text>
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
});
