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
  logDebug: RenphoDebugLogFn
): Promise<boolean> {
  try {
    const packet = buildSummationPacket(payload);
    const hex = Array.from(packet)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(" ");
    logRenphoDebug(logDebug, `[Renpho] Outbound packet: ${hex}`);

    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(packet);
    } else if (characteristic.properties.write) {
      await characteristic.writeValueWithResponse(packet);
    } else {
      logRenphoDebug(logDebug, "[Renpho] Write characteristic has no write property");
      return false;
    }
    return true;
  } catch (err) {
    logRenphoDebug(logDebug, `[Renpho] Outbound packet failed: ${String(err)}`);
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
  label: string,
  logDebug: RenphoDebugLogFn
): Promise<boolean> {
  try {
    const hex = Array.from(packet)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(" ");
    logRenphoDebug(logDebug, `[Renpho] ${label}: ${hex}`);

    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(packet);
    } else if (characteristic.properties.write) {
      await characteristic.writeValueWithResponse(packet);
    } else {
      logRenphoDebug(logDebug, `[Renpho] Cannot write ${label}`);
      return false;
    }
    return true;
  } catch (err) {
    logRenphoDebug(logDebug, `[Renpho] Failed ${label}: ${String(err)}`);
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

    const composition =
      impedance > 0
        ? calcBIA(weight, impedance, age, height, isMale)
        : buildWeightOnlyComposition(weight, height);

    onReading({ weight, impedance, composition });
    onStatus("done");
    disconnectScale();
  };

  const sendUnitInit = async (label: string) => {
    if (!writeChar) return;
    logRenphoDebug(logDebug, label);
    await sendVerifiedPacket(writeChar, UNIT_INIT_PAYLOAD, logDebug);
  };

  const sendUserProfile = async () => {
    if (!writeChar) return;
    logRenphoDebug(logDebug, "[Renpho] Pushing user profile packet post-handshake...");
    const packet = buildProfilePacket(isMale, age, height, DEFAULT_ALGORITHM);
    const ok = await sendRawPacket(
      writeChar,
      packet,
      "Profile packet",
      logDebug
    );
    if (ok) {
      logRenphoDebug(logDebug, "[Renpho] Profile successfully delivered.");
    }
  };

  const handleWeightFrame = (data: Uint8Array, label: string) => {
    const weightKg = decodeWeightKg(data);
    if (weightKg === null) return;

    const isStable = data.length >= 6 && data[5] === 0x01;
    logRenphoDebug(
      logDebug,
      `[Renpho] ${label}: ${weightKg}kg | Stable: ${isStable}`
    );

    if (isStable) {
      const impedance = decodeImpedance(data);
      finishWithReading(weightKg, impedance);
    } else {
      lastStableWeight = weightKg;
    }
  };

  const handleFrame = async (data: Uint8Array) => {
    if (completed || !writeChar) return;
    const opcode = data[0];

    if (opcode === 0x12) {
      if (protocolState === "INIT") {
        await sendUnitInit(
          "[Renpho] Received 0x12 loop. Re-asserting unit init handshake..."
        );
      } else {
        logRenphoDebug(
          logDebug,
          `[Renpho] Scale broadcasted 0x12 while in state: ${protocolState}. Waiting for transition.`
        );
      }
      return;
    }

    if (opcode === 0x14) {
      if (protocolState === "INIT") {
        logRenphoDebug(
          logDebug,
          "[Renpho] Handshake step 1 passed (got 0x14). Sending epoch time sync..."
        );
        protocolState = "TIME_SYNC";
        await sendVerifiedPacket(writeChar, buildTimeSyncPayload(), logDebug);
        protocolState = "AWAITING_WEIGHT";
        logRenphoDebug(
          logDebug,
          "[Renpho] Handshake complete. Scale ready for weight frames."
        );
        await sendUserProfile();
      }
      return;
    }

    if (opcode === 0x21 && protocolState === "AWAITING_WEIGHT") {
      logRenphoDebug(logDebug, "[Renpho] 0x21 profile request — resending user profile");
      await sendUserProfile();
      return;
    }

    if (opcode === 0x10 && data.length >= 6) {
      handleWeightFrame(data, "Weight update");
      return;
    }

    if (opcode === 0x20 && data.length >= 5) {
      const weightKg = decodeWeightKg(data);
      if (weightKg === null) return;
      const impedance = decodeImpedance(data);
      logRenphoDebug(
        logDebug,
        `[Renpho] 0x20 final weight: ${weightKg}kg | impedance: ${impedance}Ω`
      );
      finishWithReading(weightKg, impedance);
    }
  };

  const handleNotification = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (!target.value || completed) return;

    const data = new Uint8Array(target.value.buffer);
    debugLogFrame(logDebug, data);
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

    await notifyChar.startNotifications();
    notifyChar.addEventListener("characteristicvaluechanged", handleNotification);

    protocolState = "INIT";
    logRenphoDebug(
      logDebug,
      "[Renpho] GATT connected. Sending unit initialization packet..."
    );
    await sendUnitInit("[Renpho] Unit init on connect");

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
