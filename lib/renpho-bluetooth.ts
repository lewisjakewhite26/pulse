/**
 * Renpho ES-26M / Qingniu QN-Scale BLE protocol.
 * 3-step handshake: unit init (0x13) -> time sync on 0x14 (0x1d) -> weight (0x10).
 */

export const WEIGHT_MEASUREMENT_SERVICE_T1 =
  "0000ffe0-0000-1000-8000-00805f9b34fb";
export const CUSTOM1_MEASUREMENT_CHARACTERISTIC =
  "0000ffe1-0000-1000-8000-00805f9b34fb";
export const CUSTOM3_MEASUREMENT_CHARACTERISTIC =
  "0000ffe3-0000-1000-8000-00805f9b34fb";

const WEIGHT_SCALE_FACTOR = 100;
const READING_TIMEOUT_MS = 90_000;
const Y2K_EPOCH_MS = Date.UTC(2000, 0, 1);

const UNIT_INIT_PAYLOAD = [0x13, 0x09, 0x15, 0x01, 0x10, 0x00, 0x00, 0x00];
const DEFAULT_ALGORITHM = 0x04;

type ProtocolState = "INIT" | "TIME_SYNC" | "AWAITING_WEIGHT";

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
  onDebugLog?: RenphoDebugLogFn;
}

function logLifecycle(
  onDebugLog: RenphoDebugLogFn | undefined,
  message: string
): void {
  console.log(message);
  onDebugLog?.(message);
}

function logRenphoError(
  onDebugLog: RenphoDebugLogFn | undefined,
  message: string
): void {
  console.error(message);
  onDebugLog?.(message);
}

function buildSummationPacket(payload: number[]): Uint8Array {
  const packet = new Uint8Array(payload.length + 1);
  let sum = 0;
  for (let i = 0; i < payload.length; i++) {
    packet[i] = payload[i];
    sum += payload[i];
  }
  packet[payload.length] = sum & 0xff;
  return packet;
}

async function sendVerifiedPacket(
  characteristic: BluetoothRemoteGATTCharacteristic,
  payload: number[],
  onDebugLog?: RenphoDebugLogFn
): Promise<boolean> {
  try {
    const packet = buildSummationPacket(payload);
    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(packet);
    } else if (characteristic.properties.write) {
      await characteristic.writeValueWithResponse(packet);
    } else {
      logRenphoError(onDebugLog, "[Renpho] Write characteristic has no write property");
      return false;
    }
    return true;
  } catch (err) {
    logRenphoError(onDebugLog, `[Renpho] Outbound packet failed: ${String(err)}`);
    return false;
  }
}

function y2kEpochBytes(): number[] {
  const y2kOffset = Math.floor((Date.now() - Y2K_EPOCH_MS) / 1000);
  return [
    y2kOffset & 0xff,
    (y2kOffset >> 8) & 0xff,
    (y2kOffset >> 16) & 0xff,
    (y2kOffset >> 24) & 0xff,
  ];
}

function buildTimeSyncPayload(): number[] {
  const tBytes = y2kEpochBytes();
  return [0x1d, 0x09, 0x15, tBytes[0], tBytes[1], tBytes[2], tBytes[3], 0x00];
}

function xorChecksum(bytes: number[]): number {
  return bytes.reduce((acc, value) => acc ^ value, 0);
}

function buildProfilePacket(
  isMale: boolean,
  ageYears: number,
  heightCm: number,
  algorithm: number = DEFAULT_ALGORITHM
): Uint8Array {
  const profileBody = [
    0x13,
    0x00,
    isMale ? 0x01 : 0x00,
    ageYears,
    heightCm,
    0x00,
    algorithm,
  ];
  return new Uint8Array([...profileBody, xorChecksum(profileBody)]);
}

async function sendRawPacket(
  characteristic: BluetoothRemoteGATTCharacteristic,
  packet: Uint8Array,
  onDebugLog?: RenphoDebugLogFn
): Promise<boolean> {
  try {
    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(packet);
    } else if (characteristic.properties.write) {
      await characteristic.writeValueWithResponse(packet);
    } else {
      logRenphoError(onDebugLog, "[Renpho] Profile write characteristic unavailable");
      return false;
    }
    return true;
  } catch (err) {
    logRenphoError(onDebugLog, `[Renpho] Profile packet failed: ${String(err)}`);
    return false;
  }
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

  onStatus("scanning");
  onError(null);

  let completed = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let device: BluetoothDevice | undefined;
  let notifyChar: BluetoothRemoteGATTCharacteristic | undefined;
  let writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  let protocolState: ProtocolState = "INIT";
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

    logLifecycle(
      onDebugLog,
      `[Renpho] Reading complete: ${weight}kg${impedance > 0 ? `, impedance ${impedance}Ω` : ""}`
    );

    const composition =
      impedance > 0
        ? calcBIA(weight, impedance, age, height, isMale)
        : buildWeightOnlyComposition(weight, height);

    onReading({ weight, impedance, composition });
    onStatus("done");
    disconnectScale();
  };

  const sendUnitInit = async () => {
    if (!writeChar) return;
    await sendVerifiedPacket(writeChar, UNIT_INIT_PAYLOAD, onDebugLog);
  };

  const sendUserProfile = async () => {
    if (!writeChar) return;
    const packet = buildProfilePacket(isMale, age, height, DEFAULT_ALGORITHM);
    const ok = await sendRawPacket(writeChar, packet, onDebugLog);
    if (ok) {
      logLifecycle(onDebugLog, "[Renpho] User profile sent");
    }
  };

  const handleWeightFrame = (data: Uint8Array) => {
    const weightKg = decodeWeightKg(data);
    if (weightKg === null) return;

    const isStable = data.length >= 6 && data[5] === 0x01;
    if (isStable) {
      finishWithReading(weightKg, decodeImpedance(data));
    } else {
      lastStableWeight = weightKg;
    }
  };

  const handleFrame = async (data: Uint8Array) => {
    if (completed || !writeChar) return;
    const opcode = data[0];

    if (opcode === 0x12) {
      if (protocolState === "INIT") {
        await sendUnitInit();
      }
      return;
    }

    if (opcode === 0x14) {
      if (protocolState === "INIT") {
        logLifecycle(onDebugLog, "[Renpho] Handshake acknowledged, sending time sync");
        protocolState = "TIME_SYNC";
        await sendVerifiedPacket(writeChar, buildTimeSyncPayload(), onDebugLog);
        protocolState = "AWAITING_WEIGHT";
        logLifecycle(onDebugLog, "[Renpho] Handshake complete, waiting for measurement");
        await sendUserProfile();
      }
      return;
    }

    if (opcode === 0x21 && protocolState === "AWAITING_WEIGHT") {
      await sendUserProfile();
      return;
    }

    if (opcode === 0x10 && data.length >= 6) {
      handleWeightFrame(data);
      return;
    }

    if (opcode === 0x20 && data.length >= 5) {
      const weightKg = decodeWeightKg(data);
      if (weightKg === null) return;
      finishWithReading(weightKg, decodeImpedance(data));
    }
  };

  const handleNotification = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (!target.value || completed) return;

    const data = new Uint8Array(target.value.buffer);
    if (data.length < 1) return;
    void handleFrame(data);
  };

  try {
    device = await navigator.bluetooth!.requestDevice({
      filters: [{ namePrefix: "QN-Scale" }],
      optionalServices: [WEIGHT_MEASUREMENT_SERVICE_T1],
    });

    device.addEventListener("gattserverdisconnected", () => {
      if (!completed) {
        logRenphoError(onDebugLog, "[Renpho] Scale disconnected unexpectedly");
        finishWithError("Scale disconnected - try again");
      }
    });

    onStatus("connected");
    const server = await device.gatt!.connect();
    logLifecycle(onDebugLog, "[Renpho] Connected to GATT server");

    const service = await server.getPrimaryService(WEIGHT_MEASUREMENT_SERVICE_T1);
    notifyChar = await service.getCharacteristic(CUSTOM1_MEASUREMENT_CHARACTERISTIC);
    writeChar = await service.getCharacteristic(CUSTOM3_MEASUREMENT_CHARACTERISTIC);

    await notifyChar.startNotifications();
    notifyChar.addEventListener("characteristicvaluechanged", handleNotification);

    protocolState = "INIT";
    logLifecycle(onDebugLog, "[Renpho] Sending unit initialization");
    await sendUnitInit();

    onStatus("reading");

    timeoutId = setTimeout(() => {
      if (completed) return;
      if (lastStableWeight > 0) {
        logLifecycle(
          onDebugLog,
          `[Renpho] Timeout — saving last weight: ${lastStableWeight}kg`
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
    logRenphoError(
      onDebugLog,
      `[Renpho] Connection failed: ${error.message || "unknown error"}`
    );
    onError(error.message || "Connection failed");
    onStatus("error");
  }
}
