/**
 * Renpho QN-Scale / Yolanda protocol (ES-26M).
 * On this firmware FFE1 is typically notify + write on service FFE0.
 */

export const WEIGHT_MEASUREMENT_SERVICE_T1 =
  "0000ffe0-0000-1000-8000-00805f9b34fb";
export const WEIGHT_MEASUREMENT_SERVICE_T2 =
  "0000fff0-0000-1000-8000-00805f9b34fb";
export const AE00_SERVICE = "0000ae00-0000-1000-8000-00805f9b34fb";

export const CUSTOM1_MEASUREMENT_CHARACTERISTIC =
  "0000ffe1-0000-1000-8000-00805f9b34fb";

const YOLANDA_WEIGHT_DIVISOR = 10;
const READING_TIMEOUT_MS = 60_000;

/** DEBUG — remove after fix */
export type RenphoDebugLogFn = (message: string) => void;

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

export interface RenphoUserProfile {
  sex: string;
  age: string;
  height: string;
}

export interface ConnectRenphoParams {
  userProfile: RenphoUserProfile;
  calcBIA: RenphoCalcBIA;
  onStatus: (status: RenphoScaleStatus) => void;
  onError: (message: string | null) => void;
  onReading: (payload: RenphoReadingPayload) => void;
  /** DEBUG — remove after fix */
  onDebugLog?: RenphoDebugLogFn;
}

/** DEBUG — remove after fix */
function logRenphoDebug(logDebug: RenphoDebugLogFn, message: string): void {
  console.log(message);
  logDebug(message);
}

function xorChecksum(bytes: number[]): number {
  return bytes.reduce((acc, value) => acc ^ value, 0);
}

function parseProfileNumbers(userProfile: RenphoUserProfile): {
  isMale: boolean;
  age: number;
  heightCm: number;
} {
  const isMale = userProfile.sex !== "Female";
  const age = Math.min(Math.max(parseInt(userProfile.age, 10) || 25, 10), 99);
  const heightCm = Math.min(
    Math.max(parseInt(userProfile.height, 10) || 170, 100),
    220
  );
  return { isMale, age, heightCm };
}

function buildUserProfilePacket(userProfile: RenphoUserProfile): Uint8Array {
  const { isMale, age, heightCm } = parseProfileNumbers(userProfile);
  const profileBody = [
    0x13,
    0x00,
    isMale ? 0x01 : 0x00,
    age,
    heightCm,
    0x00,
    0x00,
  ];
  return new Uint8Array([...profileBody, xorChecksum(profileBody)]);
}

function buildTimeSyncPacket(): Uint8Array {
  const now = new Date();
  return new Uint8Array([
    0x02,
    now.getFullYear() - 2000,
    now.getMonth() + 1,
    now.getDate(),
    now.getHours(),
  ]);
}

function decodeYolandaWeight(data: Uint8Array): number | null {
  if (data.length < 5) return null;
  const weightRaw = ((data[3] & 0xff) << 8) | (data[4] & 0xff);
  const weightKg = weightRaw / YOLANDA_WEIGHT_DIVISOR;
  if (weightKg < 20 || weightKg > 300 || !Number.isFinite(weightKg)) return null;
  return weightKg;
}

function decodeYolandaImpedance(data: Uint8Array): number {
  if (data.length < 11) return 0;
  const imp1 = ((data[9] & 0xff) << 8) | (data[10] & 0xff);
  const imp2 =
    data.length > 12 ? ((data[11] & 0xff) << 8) | (data[12] & 0xff) : 0;
  return imp1 < 41 ? imp2 : imp1;
}

function buildWeightOnlyComposition(
  weight: number,
  heightCm: number
): Record<string, unknown> {
  const heightM = heightCm / 100;
  return {
    bodyFat: null,
    muscleMass: null,
    boneMass: null,
    waterPct: null,
    leanMass: null,
    bmr: null,
    bmi: Math.round((weight / (heightM * heightM)) * 10) / 10,
  };
}

async function enumerateServiceCharacteristics(
  service: BluetoothRemoteGATTService,
  label: string,
  logDebug: RenphoDebugLogFn
): Promise<BluetoothRemoteGATTCharacteristic[]> {
  const characteristics = await service.getCharacteristics();
  logRenphoDebug(
    logDebug,
    `[Renpho] Available ${label} characteristics (${characteristics.length}):`
  );
  for (const characteristic of characteristics) {
    logRenphoDebug(
      logDebug,
      `[Renpho]   ${characteristic.uuid} — properties: ${JSON.stringify({
        read: characteristic.properties.read,
        write: characteristic.properties.write,
        writeWithoutResponse: characteristic.properties.writeWithoutResponse,
        notify: characteristic.properties.notify,
        indicate: characteristic.properties.indicate,
      })}`
    );
  }
  return characteristics;
}

async function writeToChar(
  characteristic: BluetoothRemoteGATTCharacteristic,
  data: Uint8Array,
  label: string,
  logDebug: RenphoDebugLogFn
): Promise<boolean> {
  try {
    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(data);
    } else if (characteristic.properties.write) {
      await characteristic.writeValueWithResponse(data);
    } else {
      logRenphoDebug(
        logDebug,
        `[Renpho] Cannot write ${label} — ${characteristic.uuid} has no write property`
      );
      return false;
    }
    const hex = Array.from(data)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(" ");
    logRenphoDebug(logDebug, `[Renpho] Wrote ${label}: ${hex}`);
    return true;
  } catch (err) {
    logRenphoDebug(logDebug, `[Renpho] Failed to write ${label}: ${String(err)}`);
    return false;
  }
}

/** DEBUG — remove after fix */
function debugLogFrame(
  logDebug: RenphoDebugLogFn,
  data: Uint8Array
): void {
  const hex = Array.from(data)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
  logRenphoDebug(
    logDebug,
    `[Renpho] Frame received (${data.length} bytes): ${hex}`
  );
  logRenphoDebug(logDebug, `[Renpho] First byte: 0x${data[0].toString(16)}`);
}

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export async function connectRenphoScale(
  params: ConnectRenphoParams
): Promise<void> {
  const { userProfile, calcBIA, onStatus, onError, onReading, onDebugLog } =
    params;
  const { isMale, age, heightCm } = parseProfileNumbers(userProfile);

  const logDebug: RenphoDebugLogFn = (message) => {
    console.log(message); // DEBUG — remove after fix
    onDebugLog?.(message);
  };

  onStatus("scanning");
  onError(null);

  let completed = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let device: BluetoothDevice | undefined;
  let ffe1: BluetoothRemoteGATTCharacteristic | undefined;
  let writeChar: BluetoothRemoteGATTCharacteristic | undefined;
  let lastStableWeight = 0;

  const clearReadingTimeout = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const disconnectScale = () => {
    try {
      if (ffe1) void ffe1.stopNotifications();
      if (device?.gatt?.connected) device.gatt.disconnect();
    } catch {
      // ignore cleanup errors
    }
  };

  const finishWithError = (message: string) => {
    if (completed) return;
    completed = true;
    clearReadingTimeout();
    onError(message);
    onStatus("error");
    disconnectScale();
  };

  const finishWithReading = (weight: number, impedance: number) => {
    if (completed) return;
    completed = true;
    clearReadingTimeout();

    const composition =
      impedance > 0
        ? calcBIA(weight, impedance, age, heightCm, isMale)
        : buildWeightOnlyComposition(weight, heightCm);

    onReading({ weight, impedance, composition });
    onStatus("done");
    disconnectScale();
  };

  const handleYolandaReady = async () => {
    if (!writeChar) return;
    logRenphoDebug(
      logDebug,
      "[Renpho] 0x14 received — Yolanda protocol, sending profile to FFE1"
    );
    await writeToChar(
      writeChar,
      buildUserProfilePacket(userProfile),
      "0x13 Yolanda profile",
      logDebug
    );
    await writeToChar(writeChar, buildTimeSyncPacket(), "0x02 time sync", logDebug);
  };

  const handleNotification = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (!target.value || completed) return;

    const data = new Uint8Array(target.value.buffer);
    debugLogFrame(logDebug, data);
    if (data.length < 3) return;

    const opcode = data[0];

    if (opcode === 0x14) {
      void handleYolandaReady();
      return;
    }

    if (opcode === 0x15 || opcode === 0x12) {
      if (opcode === 0x12 && data.length >= 18 && data[1] === data.length) {
        logRenphoDebug(logDebug, "[Renpho] Long 0x12 scale info frame (ignored)");
        return;
      }
      const weightKg = decodeYolandaWeight(data);
      if (weightKg !== null) {
        lastStableWeight = weightKg;
        logRenphoDebug(logDebug, `[Renpho] Unstable weight: ${weightKg}kg`);
        onStatus("reading");
      }
      return;
    }

    if (opcode === 0x10 || (opcode === 0x13 && data.length >= 10)) {
      const weightKg = decodeYolandaWeight(data);
      if (weightKg === null) return;

      const impedance = decodeYolandaImpedance(data);
      logRenphoDebug(
        logDebug,
        `[Renpho] Final weight: ${weightKg}kg, impedance: ${impedance}Ω`
      );
      finishWithReading(weightKg, impedance);
    }
  };

  try {
    device = await navigator.bluetooth!.requestDevice({
      filters: [{ namePrefix: "QN-Scale" }],
      optionalServices: [
        WEIGHT_MEASUREMENT_SERVICE_T1,
        WEIGHT_MEASUREMENT_SERVICE_T2,
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
    logRenphoDebug(logDebug, "[Renpho] Connected to GATT server");

    const vendorService = await server.getPrimaryService(
      WEIGHT_MEASUREMENT_SERVICE_T1
    );
    logRenphoDebug(logDebug, "[Renpho] Got vendor service FFE0");

    await enumerateServiceCharacteristics(vendorService, "FFE0", logDebug);

    try {
      const fff0Service = await server.getPrimaryService(
        WEIGHT_MEASUREMENT_SERVICE_T2
      );
      await enumerateServiceCharacteristics(fff0Service, "FFF0", logDebug);
    } catch {
      logRenphoDebug(logDebug, "[Renpho] No FFF0 service on this firmware");
    }

    ffe1 = await vendorService.getCharacteristic(CUSTOM1_MEASUREMENT_CHARACTERISTIC);
    await ffe1.startNotifications();
    ffe1.addEventListener("characteristicvaluechanged", handleNotification);

    logRenphoDebug(
      logDebug,
      `[Renpho] FFE1 properties: write=${ffe1.properties.write} writeWithoutResponse=${ffe1.properties.writeWithoutResponse} notify=${ffe1.properties.notify}`
    );

    writeChar = ffe1;
    logRenphoDebug(logDebug, `[Renpho] Using writable characteristic: ${writeChar.uuid}`);

    onStatus("reading");

    timeoutId = setTimeout(() => {
      if (completed) return;
      if (lastStableWeight > 0) {
        logRenphoDebug(
          logDebug,
          `[Renpho] Timeout but have stable weight ${lastStableWeight}kg — saving weight-only measurement`
        );
        finishWithReading(lastStableWeight, 0);
        return;
      }
      finishWithError(
        "No reading received. Make sure you step on the scale with bare feet after connecting."
      );
    }, READING_TIMEOUT_MS);
  } catch (err) {
    clearReadingTimeout();
    const error = err as Error & { name?: string };
    if (error.name === "NotFoundError") {
      onStatus("idle");
      return;
    }
    onError(error.message || "Connection failed");
    onStatus("error");
  }
}
