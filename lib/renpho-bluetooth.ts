/**
 * Renpho ES-26M / ES-CS20M BLE protocol (QN-Scale).
 * Based on renpho-escs20m: wait for 0x21 profile request when user steps on,
 * reply on FFE3, decode stable 0x10 frames (weight ÷100, impedance bytes 7-8).
 */

export const WEIGHT_MEASUREMENT_SERVICE_T1 =
  "0000ffe0-0000-1000-8000-00805f9b34fb";
export const CUSTOM1_MEASUREMENT_CHARACTERISTIC =
  "0000ffe1-0000-1000-8000-00805f9b34fb";
export const CUSTOM3_MEASUREMENT_CHARACTERISTIC =
  "0000ffe3-0000-1000-8000-00805f9b34fb";

const WEIGHT_SCALE_FACTOR = 100;
const READING_TIMEOUT_MS = 90_000;
const DEFAULT_ALGORITHM = 0x04;

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

function buildProfilePacket(
  isMale: boolean,
  age: number,
  heightCm: number,
  algorithm: number = DEFAULT_ALGORITHM
): Uint8Array {
  const profileBody = [
    0x13,
    0x00,
    isMale ? 0x01 : 0x00,
    age,
    heightCm,
    0x00,
    algorithm,
  ];
  return new Uint8Array([...profileBody, xorChecksum(profileBody)]);
}

function decodeWeightKg(data: Uint8Array): number | null {
  if (data.length < 5) return null;
  const weightRaw = ((data[3] & 0xff) << 8) | (data[4] & 0xff);
  const weightKg = weightRaw / WEIGHT_SCALE_FACTOR;
  if (weightKg < 20 || weightKg > 300 || !Number.isFinite(weightKg)) return null;
  return weightKg;
}

function decodeImpedance(data: Uint8Array): number {
  if (data.length < 9) return 0;
  const imp1 = ((data[7] & 0xff) << 8) | (data[8] & 0xff);
  const imp2 =
    data.length > 10 ? ((data[9] & 0xff) << 8) | (data[10] & 0xff) : 0;
  return imp1 > 0 ? imp1 : imp2;
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
): Promise<void> {
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
function debugLogFrame(logDebug: RenphoDebugLogFn, data: Uint8Array): void {
  const hex = Array.from(data)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
  logRenphoDebug(logDebug, `[Renpho] Frame (${data.length}b): ${hex}`);
}

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export async function connectRenphoScale(
  params: ConnectRenphoParams
): Promise<void> {
  const { calcBIA, onStatus, onError, onReading, onDebugLog } = params;
  // DEBUG HARDCODED — remove once Renpho connection is working
  const isMale = true;
  const age = 34;
  const height = 180;

  const logDebug: RenphoDebugLogFn = (message) => {
    console.log(message); // DEBUG — remove after fix
    onDebugLog?.(message);
  };

  onStatus("scanning");
  onError(null);

  let completed = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let device: BluetoothDevice | undefined;
  let notifyChar: BluetoothRemoteGATTCharacteristic | undefined;
  let writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  let profileSent = false;
  let lastStableWeight = 0;

  const clearReadingTimeout = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
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
        ? calcBIA(weight, impedance, age, height, isMale)
        : buildWeightOnlyComposition(weight, height);

    onReading({ weight, impedance, composition });
    onStatus("done");
    disconnectScale();
  };

  const sendProfileOn12 = async () => {
    if (!writeChar || profileSent) return;
    profileSent = true;
    logRenphoDebug(logDebug, "[Renpho] 0x12 — sending profile to FFE3");
    const packet = buildProfilePacket(isMale, age, height, DEFAULT_ALGORITHM);
    const hex = Array.from(packet)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(" ");
    logRenphoDebug(logDebug, `[Renpho] Profile packet: ${hex}`);
    await writeToChar(writeChar, packet, "0x13 user profile", logDebug);
  };

  const handleNotification = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (!target.value || completed) return;

    const data = new Uint8Array(target.value.buffer);
    debugLogFrame(logDebug, data);
    if (data.length < 1) return;

    const opcode = data[0];

    if (opcode === 0x12) {
      if (!profileSent) {
        void sendProfileOn12();
      } else {
        logRenphoDebug(
          logDebug,
          "[Renpho] 0x12 subsequent broadcast (profile already sent, waiting for weight)"
        );
      }
      return;
    }

    if (opcode === 0x21 && !profileSent && writeChar) {
      profileSent = true;
      logRenphoDebug(logDebug, "[Renpho] 0x21 profile request — sending user profile");
      const packet = buildProfilePacket(isMale, age, height, DEFAULT_ALGORITHM);
      void writeToChar(writeChar, packet, "0x13 user profile", logDebug);
      return;
    }

    if (opcode === 0x20 && data.length >= 5) {
      const weightKg = decodeWeightKg(data);
      if (weightKg !== null) {
        lastStableWeight = weightKg;
        logRenphoDebug(logDebug, `[Renpho] 0x20 unstable weight: ${weightKg}kg`);
      }
      return;
    }

    if (opcode === 0x10 && data.length >= 10) {
      const weightKg = decodeWeightKg(data);
      if (weightKg === null) return;

      const impedance = decodeImpedance(data);
      logRenphoDebug(
        logDebug,
        `[Renpho] 0x10 weight: ${weightKg}kg impedance: ${impedance}Ω`
      );
      finishWithReading(weightKg, impedance);
    }
  };

  try {
    device = await navigator.bluetooth!.requestDevice({
      filters: [{ namePrefix: "QN-Scale" }],
      optionalServices: [WEIGHT_MEASUREMENT_SERVICE_T1],
    });

    device.addEventListener("gattserverdisconnected", () => {
      if (!completed) {
        finishWithError("Scale disconnected - try again");
      }
    });

    onStatus("connected");
    const server = await device.gatt!.connect();
    logRenphoDebug(logDebug, "[Renpho] Connected to GATT server");

    const service = await server.getPrimaryService(WEIGHT_MEASUREMENT_SERVICE_T1);
    logRenphoDebug(logDebug, "[Renpho] Got vendor service FFE0");
    await enumerateServiceCharacteristics(service, "FFE0", logDebug);

    notifyChar = await service.getCharacteristic(CUSTOM1_MEASUREMENT_CHARACTERISTIC);
    writeChar = await service.getCharacteristic(CUSTOM3_MEASUREMENT_CHARACTERISTIC);

    logRenphoDebug(
      logDebug,
      `[Renpho] FFE1 notify=${notifyChar.properties.notify} FFE3 write=${writeChar.properties.write} writeWithoutResponse=${writeChar.properties.writeWithoutResponse}`
    );
    logRenphoDebug(
      logDebug,
      "[Renpho] Connected. Waiting for scale profile request (step on scale now)."
    );

    await notifyChar.startNotifications();
    notifyChar.addEventListener("characteristicvaluechanged", handleNotification);

    onStatus("reading");

    timeoutId = setTimeout(() => {
      if (completed) return;
      if (lastStableWeight > 0) {
        logRenphoDebug(
          logDebug,
          `[Renpho] Timeout — saving weight-only: ${lastStableWeight}kg`
        );
        finishWithReading(lastStableWeight, 0);
        return;
      }
      finishWithError(
        "No reading received. Step on the scale after connecting."
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
