import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, State, type Device } from 'react-native-ble-plx';

/**
 * bluetoothPrint.ts — native Bluetooth-LE label printing (Lot B, Android-first).
 *
 * Scans for BLE (GATT) printers, connects, and writes the label bytes rendered
 * server-side (POST /print-jobs/render) to the printer's writable
 * characteristic. The bytes are NEVER generated on-device — the server's
 * ZPL/TSPL/ESC_POS renderers produce them, so Bluetooth and PrintNode print the
 * exact same label.
 *
 * SCOPE / HONEST LIMITS (do not overclaim):
 *  - This is BLE (GATT) only. Classic-Bluetooth-SPP-only thermal printers are
 *    NOT reachable through this path (they need a different, Classic transport).
 *  - iOS: Core Bluetooth exposes BLE fine, but NON-MFi Classic-SPP printers
 *    cannot be driven from iOS at all — that is an Apple platform constraint,
 *    not a code gap. Use PrintNode / the local agent for those.
 *  - Requires a native build (EAS dev/preview) — this does NOT run in Expo Go.
 *  - UNVERIFIED on hardware here: the writable-characteristic auto-detection and
 *    chunking must be validated against each real printer model.
 */

// atob/btoa are provided globally by the React Native runtime (Hermes).
declare const atob: (s: string) => string;
declare const btoa: (s: string) => string;

export interface BtPrinter {
  id: string;
  name: string;
  rssi: number | null;
}

/** Typed error codes the UI maps to localized messages. */
export type BtErrorCode =
  | 'BLUETOOTH_OFF'
  | 'PERMISSION_DENIED'
  | 'NO_WRITABLE_CHARACTERISTIC'
  | 'CONNECT_FAILED'
  | 'WRITE_FAILED';

export class BtError extends Error {
  constructor(public readonly code: BtErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'BtError';
  }
}

let _manager: BleManager | null = null;
function manager(): BleManager {
  if (!_manager) _manager = new BleManager();
  return _manager;
}

/**
 * Request the runtime permissions BLE needs. On Android 12+ (API 31) that is
 * BLUETOOTH_SCAN + BLUETOOTH_CONNECT; on older Android, ACCESS_FINE_LOCATION
 * (required to scan for BLE devices). iOS prompts automatically via Info.plist.
 */
export async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const api = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
  const perms =
    api >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const res = await PermissionsAndroid.requestMultiple(perms);
  return perms.every((p) => res[p] === PermissionsAndroid.RESULTS.GRANTED);
}

/** Resolve once the adapter is powered on, or throw BLUETOOTH_OFF after a timeout. */
async function ensurePoweredOn(timeoutMs = 4000): Promise<void> {
  const state = await manager().state();
  if (state === State.PoweredOn) return;
  await new Promise<void>((resolve, reject) => {
    const sub = manager().onStateChange((s) => {
      if (s === State.PoweredOn) { sub.remove(); resolve(); }
    }, true);
    setTimeout(() => { sub.remove(); reject(new BtError('BLUETOOTH_OFF')); }, timeoutMs);
  });
}

/**
 * Scan for named BLE devices for `durationMs`, returning a de-duplicated list.
 * Names are the only hint we have for "is this a printer?" — the user picks.
 */
export async function scanForPrinters(durationMs = 6000): Promise<BtPrinter[]> {
  const granted = await requestBluetoothPermissions();
  if (!granted) throw new BtError('PERMISSION_DENIED');
  await ensurePoweredOn();

  const found = new Map<string, BtPrinter>();
  return new Promise<BtPrinter[]>((resolve, reject) => {
    const done = () => { manager().stopDeviceScan(); resolve([...found.values()]); };
    const timer = setTimeout(done, durationMs);
    manager().startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) { clearTimeout(timer); manager().stopDeviceScan(); reject(error); return; }
      if (device?.name) found.set(device.id, { id: device.id, name: device.name, rssi: device.rssi ?? null });
    });
  });
}

/**
 * Connect to a device, auto-detect a writable characteristic, and write the
 * base64 label in MTU-sized chunks. Always disconnects afterwards.
 */
export async function printToDevice(deviceId: string, base64Content: string): Promise<void> {
  const granted = await requestBluetoothPermissions();
  if (!granted) throw new BtError('PERMISSION_DENIED');
  await ensurePoweredOn();

  let device: Device | null = null;
  try {
    device = await manager().connectToDevice(deviceId, { timeout: 8000 });
    await device.discoverAllServicesAndCharacteristics();
    try { await device.requestMTU(247); } catch { /* some stacks reject; default MTU still works */ }

    // Find the first writable characteristic across all services.
    let target: { service: string; char: string; withResponse: boolean } | null = null;
    for (const svc of await device.services()) {
      for (const c of await svc.characteristics()) {
        if (c.isWritableWithoutResponse || c.isWritableWithResponse) {
          target = { service: svc.uuid, char: c.uuid, withResponse: c.isWritableWithResponse };
          break;
        }
      }
      if (target) break;
    }
    if (!target) throw new BtError('NO_WRITABLE_CHARACTERISTIC');

    // Decode base64 → binary string (1 char = 1 byte), re-chunk, re-base64 per
    // write (react-native-ble-plx writes expect base64). 180-byte chunks stay
    // under a 247 MTU; a small gap lets the printer buffer keep up.
    const binary = atob(base64Content);
    const CHUNK = 180;
    for (let i = 0; i < binary.length; i += CHUNK) {
      const b64 = btoa(binary.slice(i, i + CHUNK));
      if (target.withResponse) {
        await device.writeCharacteristicWithResponseForService(target.service, target.char, b64);
      } else {
        await device.writeCharacteristicWithoutResponseForService(target.service, target.char, b64);
      }
      await new Promise((r) => setTimeout(r, 20));
    }
  } catch (err) {
    if (err instanceof BtError) throw err;
    throw new BtError('CONNECT_FAILED', err instanceof Error ? err.message : String(err));
  } finally {
    if (device) { try { await manager().cancelDeviceConnection(device.id); } catch { /* ignore */ } }
  }
}
