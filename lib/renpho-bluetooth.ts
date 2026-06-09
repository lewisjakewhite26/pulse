/**
 * Renpho QN-Scale protocol (ES-26M, Elis 1, etc.).
 * Ported from openScale QNHandler and ble-scale-sync qn-scale.ts.
 */

export const WEIGHT_MEASUREMENT_SERVICE_T1 =
  "0000ffe0-0000-1000-8000-00805f9b34fb";
export const WEIGHT_MEASUREMENT_SERVICE_T2 =
  "0000fff0-0000-1000-8000-00805f9b34fb";
export const AE00_SERVICE = "0000ae00-0000-1000-8000-00805f9b34fb";

export const CUSTOM1_MEASUREMENT_CHARACTERISTIC =
  "0000ffe1-0000-1000-8000-00805f9b34fb";
export const CUSTOM3_MEASUREMENT_CHARACTERISTIC =
  "0000ffe3-0000-1000-8000-00805f9b34fb";
export const CUSTOM4_MEASUREMENT_CHARACTERISTIC =
  "0000ffe4-0000-1000-8000-00805f9b34fb";

const CHR_NOTIFY_T2 = uuid16(0xfff1);
const CHR_WRITE_T2 = uuid16(0xfff2);
const CHR_NOTIFY_T1 = uuid16(0xffe1);
const CHR_WRITE_T1 = uuid16(0xffe3);
const CHR_AE01 = uuid16(0xae01);
const CHR_AE02 = uuid16(0xae02);

const SCALE_EPOCH_OFFSET = 946684800;
const IMPEDANCE_GRACE_MS = 1500;
const READING_TIMEOUT_MS = 30_000;

export type RenphoScaleStatus =
  | "scanning"
  | "connected"
  | "reading"
  | "done"
  | "error"
  | "idle";

export type RenphoCalcBIA = (
  weight: number,
  impedance: number,
  age: number,
  heightCm: number,
  isMale: boolean
) => Record<string, unknown>;

export interface RenphoReadingPayload {
  weight: number;
  impedance: number;
  composition: Record<string, unknown>;
}

export interface ConnectRenphoParams {
  age: number;
  heightCm: number;
  isMale: boolean;
  calcBIA: RenphoCalcBIA;
  onStatus: (status: RenphoScaleStatus) => void;
  onError: (message: string | null) => void;
  onReading: (payload: RenphoReadingPayload) => void;
}

function uuid16(short: number): string {
  return `0000${short.toString(16).padStart(4, "0")}-0000-1000-8000-00805f9b34fb`;
}

function checksumByte(bytes: number[]): number {
  return bytes.reduce((sum, value) => sum + value, 0) & 0xff;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseWeightFrame(
  data: Uint8Array,
  weightScaleFactor: number,
  isLongFrameVariant: boolean,
  firstStableNoImpedanceAt: number | null
): {
  reading: { weight: number; impedance: number } | null;
  firstStableNoImpedanceAt: number | null;
} {
  if (data[0] !== 0x10 || data.length < 10) {
    return { reading: null, firstStableNoImpedanceAt };
  }

  let stable: boolean;
  let rawWeight: number;
  let r1: number;
  let r2: number;

  const isEs30m =
    data.length >= 11 && data[4] <= 0x02 && weightScaleFactor === 10;

  if (isEs30m) {
    stable = data[4] === 0x02;
    rawWeight = (data[5] << 8) | data[6];
    r1 = (data[7] << 8) | data[8];
    r2 = (data[9] << 8) | data[10];

    if (stable && r1 === 0 && r2 === 0) {
      if (!isLongFrameVariant) {
        return { reading: null, firstStableNoImpedanceAt };
      }

      const now = Date.now();
      if (firstStableNoImpedanceAt === null) {
        return { reading: null, firstStableNoImpedanceAt: now };
      }
      if (now - firstStableNoImpedanceAt < IMPEDANCE_GRACE_MS) {
        return { reading: null, firstStableNoImpedanceAt };
      }
    }
  } else {
    stable = data[5] === 1;
    rawWeight = (data[3] << 8) | data[4];
    r1 = (data[6] << 8) | data[7];
    r2 = (data[8] << 8) | data[9];
  }

  if (!stable) return { reading: null, firstStableNoImpedanceAt };

  let weight = rawWeight / weightScaleFactor;
  if (weight <= 5 || weight >= 250) {
    const altFactor = weightScaleFactor === 100 ? 10 : 100;
    const altWeight = rawWeight / altFactor;
    if (altWeight > 5 && altWeight < 250) weight = altWeight;
  }

  if (weight < 20 || weight > 300 || !Number.isFinite(weight)) {
    return { reading: null, firstStableNoImpedanceAt: null };
  }

  const impedance = r1 > 0 ? r1 : r2;
  return {
    reading: { weight, impedance },
    firstStableNoImpedanceAt: null,
  };
}

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export async function connectRenphoScale(
  params: ConnectRenphoParams
): Promise<void> {
  const { age, heightCm, isMale, calcBIA, onStatus, onError, onReading } =
    params;

  onStatus("scanning");
  onError(null);

  let completed = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  let notifyChar: BluetoothRemoteGATTCharacteristic | undefined;
  let device: BluetoothDevice | undefined;
  let vendorService: BluetoothRemoteGATTService | undefined;
  let aeService: BluetoothRemoteGATTService | undefined;

  let weightScaleFactor = 100;
  let seenProtocolType = 0x00;
  let hasAe00 = false;
  let isLongFrameVariant = false;
  let firstStableNoImpedanceAt: number | null = null;
  let configSent = false;
  let timeSyncSent = false;
  let historyResponseSent = false;

  const clearReadingTimeout = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const clearFallbackTimer = () => {
    if (fallbackTimer !== undefined) {
      clearTimeout(fallbackTimer);
      fallbackTimer = undefined;
    }
  };

  const disconnectScale = () => {
    try {
      if (notifyChar) void notifyChar.stopNotifications();
      if (device?.gatt?.connected) device.gatt.disconnect();
    } catch {
      // ignore cleanup errors
    }
  };

  const finishWithError = (message: string) => {
    if (completed) return;
    completed = true;
    clearReadingTimeout();
    clearFallbackTimer();
    onError(message);
    onStatus("error");
    disconnectScale();
  };

  const finishWithReading = (weight: number, impedance: number) => {
    if (completed) return;
    completed = true;
    clearReadingTimeout();
    clearFallbackTimer();

    const biaImpedance = impedance > 0 ? impedance : 500;
    onReading({
      weight,
      impedance,
      composition: calcBIA(weight, biaImpedance, age, heightCm, isMale),
    });
    onStatus("done");
    disconnectScale();
  };

  const writeCmd = async (data: number[]) => {
    if (!vendorService) return;
    const payload = new Uint8Array(data);
    for (const uuid of [CHR_WRITE_T2, CHR_WRITE_T1]) {
      try {
        const characteristic = await vendorService.getCharacteristic(uuid);
        await characteristic.writeValue(payload);
        return;
      } catch {
        // try alternate write characteristic
      }
    }
  };

  const writeAe01 = async (data: number[]) => {
    if (!aeService) return;
    try {
      const characteristic = await aeService.getCharacteristic(CHR_AE01);
      await characteristic.writeValue(new Uint8Array(data));
    } catch {
      // AE01 not available on older firmware
    }
  };

  const subscribeAe02 = async () => {
    if (!aeService || hasAe00) return;
    try {
      const ae02 = await aeService.getCharacteristic(CHR_AE02);
      await ae02.startNotifications();
      hasAe00 = true;
    } catch {
      // AE02 not available
    }
  };

  const handleScaleInfo = async () => {
    if (configSent) return;
    configSent = true;
    clearFallbackTimer();

    await subscribeAe02();
    await writeAe01([0xfe, 0xdc, 0xba, 0xc0, 0x06, 0x00, 0x02, 0x01, 0x01, 0xef]);
    await wait(200);

    const cmd = [0x13, 0x09, seenProtocolType, 0x01, 0x10, 0x00, 0x00, 0x00, 0x00];
    cmd[8] = checksumByte(cmd);
    await writeCmd(cmd);
  };

  const handleReady = async () => {
    if (timeSyncSent) return;
    timeSyncSent = true;

    const secs = Math.floor(Date.now() / 1000) - SCALE_EPOCH_OFFSET;
    const timeCmd = [
      0x20,
      0x08,
      seenProtocolType,
      secs & 0xff,
      (secs >> 8) & 0xff,
      (secs >> 16) & 0xff,
      (secs >> 24) & 0xff,
      0x00,
    ];
    timeCmd[7] = checksumByte(timeCmd);
    await writeCmd(timeCmd);

    const profileAge = Math.min(0xff, Math.max(1, age));
    const profileCmd = [0xa2, 0x06, 0x01, 0x32, profileAge, 0x00];
    profileCmd[5] = checksumByte(profileCmd);
    await writeCmd(profileCmd);

    await writeAe01([0x02, 0x70, 0x61, 0x73, 0x73]);
  };

  const handleConfigRequest = async () => {
    if (historyResponseSent) return;
    historyResponseSent = true;

    const msg1 = [
      0xa0, 0x0d, 0x04, 0xfe, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    msg1[12] = checksumByte(msg1);
    await writeCmd(msg1);
    await wait(200);

    const msg2 = [
      0xa0, 0x0d, 0x02, 0x01, 0x00, 0x08, 0x00, 0x21, 0x06, 0xb8, 0x04, 0x02, 0x00,
    ];
    msg2[12] = checksumByte(msg2);
    await writeCmd(msg2);
    await wait(200);

    const startCmd = [0x22, 0x06, seenProtocolType, 0x00, 0x03, 0x00];
    startCmd[5] = checksumByte(startCmd);
    await writeCmd(startCmd);
  };

  const runFallbackHandshake = async () => {
    if (completed) return;
    if (!configSent) {
      seenProtocolType = 0xff;
      await handleScaleInfo();
      await wait(500);
    }
    if (!timeSyncSent) {
      await handleReady();
      await wait(500);
    }
    if (!historyResponseSent) {
      await handleConfigRequest();
    }
  };

  const handleNotification = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (!target.value || completed) return;

    const data = new Uint8Array(target.value.buffer);
    if (data.length < 3) return;

    const opcode = data[0];

    if (opcode === 0x12 && data.length > 10) {
      if (data.length >= 18 && data[1] === data.length) {
        isLongFrameVariant = true;
        seenProtocolType = 0x00;
        weightScaleFactor = 10;
      } else {
        seenProtocolType = data[2];
        weightScaleFactor = data[10] === 1 ? 100 : 10;
      }
      void handleScaleInfo();
      return;
    }

    if (opcode === 0x14) {
      void handleReady();
      return;
    }

    if (opcode === 0x21) {
      void handleConfigRequest();
      return;
    }

    if (opcode === 0xa1 || opcode === 0xa3 || opcode === 0x23) {
      return;
    }

    const parsed = parseWeightFrame(
      data,
      weightScaleFactor,
      isLongFrameVariant,
      firstStableNoImpedanceAt
    );
    firstStableNoImpedanceAt = parsed.firstStableNoImpedanceAt;

    if (parsed.reading) {
      const ackCmd = [0x1f, 0x05, seenProtocolType, 0x10, 0x00];
      ackCmd[4] = checksumByte(ackCmd);
      void writeCmd(ackCmd);
      finishWithReading(parsed.reading.weight, parsed.reading.impedance);
    }
  };

  try {
    device = await navigator.bluetooth!.requestDevice({
      filters: [{ namePrefix: "QN-Scale" }],
      optionalServices: [
        WEIGHT_MEASUREMENT_SERVICE_T2,
        WEIGHT_MEASUREMENT_SERVICE_T1,
        AE00_SERVICE,
      ],
    });

    device.addEventListener("gattserverdisconnected", () => {
      if (!completed) {
        finishWithError("Scale disconnected - try again");
      }
    });

    onStatus("connected");
    const server = await device.gatt!.connect();

    for (const serviceUuid of [
      WEIGHT_MEASUREMENT_SERVICE_T2,
      WEIGHT_MEASUREMENT_SERVICE_T1,
    ]) {
      try {
        vendorService = await server.getPrimaryService(serviceUuid);
        break;
      } catch {
        // try alternate vendor service
      }
    }
    if (!vendorService) {
      throw new Error("Scale vendor service not found");
    }

    try {
      aeService = await server.getPrimaryService(AE00_SERVICE);
    } catch {
      // AE00 not present on older firmware
    }

    for (const uuid of [CHR_NOTIFY_T2, CHR_NOTIFY_T1]) {
      try {
        notifyChar = await vendorService.getCharacteristic(uuid);
        break;
      } catch {
        // try alternate notify characteristic
      }
    }
    if (!notifyChar) {
      throw new Error("Scale notify characteristic not found");
    }

    onStatus("reading");
    await notifyChar.startNotifications();
    notifyChar.addEventListener("characteristicvaluechanged", handleNotification);

    await subscribeAe02();

    if (!hasAe00) {
      await writeCmd([0x13, 0x09, 0x00, 0x01, 0x01, 0x02]);
      await writeCmd([0x13, 0x09, 0x00, 0x01, 0x10, 0x00, 0x00, 0x00, 0x2d]);
    }

    fallbackTimer = setTimeout(() => {
      void runFallbackHandshake();
    }, 2000);

    timeoutId = setTimeout(() => {
      if (!completed) {
        finishWithError(
          "No reading received. Make sure you step on the scale with bare feet after connecting."
        );
      }
    }, READING_TIMEOUT_MS);
  } catch (err) {
    clearReadingTimeout();
    clearFallbackTimer();
    const error = err as Error & { name?: string };
    if (error.name === "NotFoundError") {
      onStatus("idle");
      return;
    }
    onError(error.message || "Connection failed");
    onStatus("error");
  }
}
