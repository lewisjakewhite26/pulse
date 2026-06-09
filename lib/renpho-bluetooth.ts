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
export const CUSTOM5_CONTROL_CHARACTERISTIC =
  "0000ffe5-0000-1000-8000-00805f9b34fb";

const CHR_NOTIFY_T2 = uuid16(0xfff1);
const CHR_WRITE_T2 = uuid16(0xfff2);
const CHR_NOTIFY_T1 = uuid16(0xffe1);
const CHR_WRITE_T1 = uuid16(0xffe3);
const CHR_AE01 = uuid16(0xae01);
const CHR_AE02 = uuid16(0xae02);

const SCALE_EPOCH_OFFSET = 946684800;
const IMPEDANCE_GRACE_MS = 1500;
const READING_TIMEOUT_MS = 60_000;

/** DEBUG — remove after fix */
export type RenphoDebugLogFn = (message: string) => void;

/** DEBUG — remove after fix */
function logRenphoDebug(logDebug: RenphoDebugLogFn, message: string): void {
  console.log(message);
  logDebug(message);
}

// DEBUG — remove once ES-26M decoder is confirmed
function debugLogFrame(
  logDebug: RenphoDebugLogFn,
  source: string,
  data: Uint8Array
): void {
  const hex = Array.from(data)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
  logRenphoDebug(
    logDebug,
    `[Renpho] Frame received on ${source} (${data.length} bytes): ${hex}`
  );
  logRenphoDebug(logDebug, `[Renpho] First byte: 0x${data[0].toString(16)}`);
}

// DEBUG — remove once ES-26M decoder is confirmed
function debugLogWeightCandidates(
  logDebug: RenphoDebugLogFn,
  data: Uint8Array
): void {
  if (data.length < 5) return;
  const weightRaw = ((data[3] & 0xff) << 8) | (data[4] & 0xff);
  const weightDiv100 = weightRaw / 100;
  const weightDiv10 = weightRaw / 10;
  logRenphoDebug(
    logDebug,
    `[Renpho] Weight raw bytes: ${data[3]} ${data[4]} -> ${weightDiv100}kg (/100) or ${weightDiv10}kg (/10)`
  );
  const weightKg =
    weightDiv100 >= 20 && weightDiv100 <= 300
      ? weightDiv100
      : weightDiv10 >= 20 && weightDiv10 <= 300
        ? weightDiv10
        : 0;
  logRenphoDebug(
    logDebug,
    `[Renpho] Weight candidates: ${weightDiv100}kg (/100), ${weightDiv10}kg (/10), using: ${weightKg}kg`
  );
}

// DEBUG — relaxed decode for unknown frame layouts; remove once confirmed
function tryRelaxedWeightDecode(
  logDebug: RenphoDebugLogFn,
  data: Uint8Array
): { weight: number; impedance: number } | null {
  if (data.length < 10) return null;

  debugLogWeightCandidates(logDebug, data);

  const weightRaw = ((data[3] & 0xff) << 8) | (data[4] & 0xff);
  const weightDiv100 = weightRaw / 100;
  const weightDiv10 = weightRaw / 10;
  const weightKg =
    weightDiv100 >= 20 && weightDiv100 <= 300
      ? weightDiv100
      : weightDiv10 >= 20 && weightDiv10 <= 300
        ? weightDiv10
        : 0;

  if (weightKg === 0) return null;

  let impedance = 0;
  if (data.length >= 11) {
    const resistance1 = ((data[9] & 0xff) << 8) | (data[10] & 0xff);
    const resistance2 =
      data.length >= 13 ? ((data[11] & 0xff) << 8) | (data[12] & 0xff) : 0;
    impedance = resistance1 < 41 ? resistance2 : resistance1;
    if (impedance === 0 && data.length >= 10) {
      const r1 = ((data[6] & 0xff) << 8) | (data[7] & 0xff);
      const r2 = ((data[8] & 0xff) << 8) | (data[9] & 0xff);
      impedance = r1 > 0 ? r1 : r2;
    }
  }

  logRenphoDebug(
    logDebug,
    `[Renpho] Relaxed decode accepted: ${weightKg}kg, impedance=${impedance}`
  );
  return { weight: weightKg, impedance };
}

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

function uuid16(short: number): string {
  return `0000${short.toString(16).padStart(4, "0")}-0000-1000-8000-00805f9b34fb`;
}

function checksumByte(bytes: number[]): number {
  return bytes.reduce((sum, value) => sum + value, 0) & 0xff;
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

async function sendAe00ServiceInit(
  vendorService: BluetoothRemoteGATTService,
  logDebug: RenphoDebugLogFn
): Promise<void> {
  try {
    const control = await vendorService.getCharacteristic(
      CUSTOM5_CONTROL_CHARACTERISTIC
    );
    await control.writeValue(new Uint8Array([0xae, 0x00]));
    logRenphoDebug(logDebug, "[Renpho] Sent AE00 service init");
  } catch {
    logRenphoDebug(
      logDebug,
      "[Renpho] No FFE5 control characteristic — skipping AE00"
    );
  }
}

async function sendCustom4TimeSyncAndProfile(
  vendorService: BluetoothRemoteGATTService,
  userProfile: RenphoUserProfile,
  logDebug: RenphoDebugLogFn
): Promise<void> {
  const custom4 = await vendorService.getCharacteristic(
    CUSTOM4_MEASUREMENT_CHARACTERISTIC
  );
  const now = new Date();
  await custom4.writeValue(
    new Uint8Array([
      0x02,
      now.getFullYear() - 2000,
      now.getMonth() + 1,
      now.getDate(),
      now.getHours(),
    ])
  );
  logRenphoDebug(logDebug, "[Renpho] Sent time sync to CUSTOM4");

  const userPacket = buildUserProfilePacket(userProfile);
  await custom4.writeValue(userPacket);
  const { isMale, age, heightCm } = parseProfileNumbers(userProfile);
  logRenphoDebug(
    logDebug,
    `[Renpho] Sent user profile packet (sex=${isMale ? "male" : "female"}, age=${age}, height=${heightCm}cm, bytes=${Array.from(userPacket).map((b) => b.toString(16).padStart(2, "0")).join(" ")})`
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseWeightFrame(
  logDebug: RenphoDebugLogFn,
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

  // DEBUG — log 0x10 frame decode attempt
  logRenphoDebug(
    logDebug,
    `[Renpho] Parsing 0x10 frame: factor=${weightScaleFactor}, longFrame=${isLongFrameVariant}, len=${data.length}`
  );

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

  if (!stable) {
    logRenphoDebug(logDebug, "[Renpho] 0x10 frame not stable yet");
    return { reading: null, firstStableNoImpedanceAt };
  }

  let weight = rawWeight / weightScaleFactor;
  const weightDiv100 = rawWeight / 100;
  const weightDiv10 = rawWeight / 10;
  if (weight <= 5 || weight >= 250) {
    const altFactor = weightScaleFactor === 100 ? 10 : 100;
    const altWeight = rawWeight / altFactor;
    if (altWeight > 5 && altWeight < 250) weight = altWeight;
  }
  if (weight < 20 || weight > 300) {
    weight =
      weightDiv100 >= 20 && weightDiv100 <= 300
        ? weightDiv100
        : weightDiv10 >= 20 && weightDiv10 <= 300
          ? weightDiv10
          : weight;
  }

  logRenphoDebug(
    logDebug,
    `[Renpho] 0x10 decode: raw=${rawWeight}, stable=${stable}, r1=${r1}, r2=${r2}, weight=${weight}kg`
  );

  if (weight < 20 || weight > 300 || !Number.isFinite(weight)) {
    logRenphoDebug(logDebug, "[Renpho] 0x10 frame rejected: weight out of range");
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
  const { userProfile, calcBIA, onStatus, onError, onReading, onDebugLog } =
    params;
  const { isMale, age, heightCm } = parseProfileNumbers(userProfile);

  // DEBUG — remove after fix
  const logDebug: RenphoDebugLogFn = (message) => {
    console.log(message);
    onDebugLog?.(message);
  };

  onStatus("scanning");
  onError(null);

  let completed = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  const notifyChars: BluetoothRemoteGATTCharacteristic[] = [];
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
      for (const characteristic of notifyChars) {
        void characteristic.stopNotifications();
      }
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

  const writeCmd = async (label: string, data: number[]) => {
    if (!vendorService) return;
    const payload = new Uint8Array(data);
    for (const uuid of [CHR_WRITE_T2, CHR_WRITE_T1]) {
      try {
        const characteristic = await vendorService.getCharacteristic(uuid);
        await characteristic.writeValue(payload);
        logRenphoDebug(logDebug, `[Renpho] Wrote ${label} to ${uuid}`);
        return;
      } catch {
        // try alternate write characteristic
      }
    }
    logRenphoDebug(logDebug, `[Renpho] Failed to write ${label}`);
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

    logRenphoDebug(
      logDebug,
      `[Renpho] State: 0x12 scale info -> AE01 init + 0x13 config (proto=0x${seenProtocolType.toString(16)})`
    );
    await subscribeAe02();
    await writeAe01([0xfe, 0xdc, 0xba, 0xc0, 0x06, 0x00, 0x02, 0x01, 0x01, 0xef]);
    await wait(200);

    const cmd = [0x13, 0x09, seenProtocolType, 0x01, 0x10, 0x00, 0x00, 0x00, 0x00];
    cmd[8] = checksumByte(cmd);
    await writeCmd("0x13 config", cmd);
  };

  const handleReady = async () => {
    if (timeSyncSent) return;
    timeSyncSent = true;

    logRenphoDebug(logDebug, "[Renpho] State: 0x14 ready -> 0x20 time sync + A2 profile");
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
    await writeCmd("0x20 time sync", timeCmd);

    const profileAge = Math.min(0xff, Math.max(1, age));
    const profileCmd = [0xa2, 0x06, 0x01, 0x32, profileAge, 0x00];
    profileCmd[5] = checksumByte(profileCmd);
    await writeCmd("A2 user profile", profileCmd);

    await writeAe01([0x02, 0x70, 0x61, 0x73, 0x73]);
    logRenphoDebug(logDebug, "[Renpho] Sent AE01 pass auth");
  };

  const handleConfigRequest = async () => {
    if (historyResponseSent) return;
    historyResponseSent = true;

    logRenphoDebug(logDebug, "[Renpho] State: 0x21 config request -> A00D history + 0x22 start");
    const msg1 = [
      0xa0, 0x0d, 0x04, 0xfe, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    msg1[12] = checksumByte(msg1);
    await writeCmd("A00D history 1", msg1);
    await wait(200);

    const msg2 = [
      0xa0, 0x0d, 0x02, 0x01, 0x00, 0x08, 0x00, 0x21, 0x06, 0xb8, 0x04, 0x02, 0x00,
    ];
    msg2[12] = checksumByte(msg2);
    await writeCmd("A00D history 2", msg2);
    await wait(200);

    const startCmd = [0x22, 0x06, seenProtocolType, 0x00, 0x03, 0x00];
    startCmd[5] = checksumByte(startCmd);
    await writeCmd("0x22 start measurement", startCmd);
  };

  const runFallbackHandshake = async () => {
    if (completed) return;
    logRenphoDebug(logDebug, "[Renpho] Running fallback handshake (no 0x12 received within 2s)");
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

  const handleNotification = (source: string) => (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (!target.value || completed) return;

    const data = new Uint8Array(target.value.buffer);
    debugLogFrame(logDebug, source, data);

    if (data.length < 3) return;

    const opcode = data[0];

    if (opcode === 0x12 && data.length > 10) {
      if (data.length >= 18 && data[1] === data.length) {
        isLongFrameVariant = true;
        seenProtocolType = 0x00;
        weightScaleFactor = 10;
        logRenphoDebug(logDebug, "[Renpho] Detected ES-26M long 0x12 frame, factor=10");
      } else {
        seenProtocolType = data[2];
        weightScaleFactor = data[10] === 1 ? 100 : 10;
        logRenphoDebug(
          logDebug,
          `[Renpho] Detected classic 0x12 frame, proto=0x${seenProtocolType.toString(16)}, factor=${weightScaleFactor}`
        );
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
      logRenphoDebug(logDebug, `[Renpho] Ignoring opcode 0x${opcode.toString(16)}`);
      return;
    }

    // DEBUG — relaxed decode attempt on any frame >= 10 bytes
    if (data.length >= 10) {
      debugLogWeightCandidates(logDebug, data);
    }

    const parsed = parseWeightFrame(
      logDebug,
      data,
      weightScaleFactor,
      isLongFrameVariant,
      firstStableNoImpedanceAt
    );
    firstStableNoImpedanceAt = parsed.firstStableNoImpedanceAt;

    if (parsed.reading) {
      const ackCmd = [0x1f, 0x05, seenProtocolType, 0x10, 0x00];
      ackCmd[4] = checksumByte(ackCmd);
      void writeCmd("0x1F stable ack", ackCmd);
      finishWithReading(parsed.reading.weight, parsed.reading.impedance);
      return;
    }

    // DEBUG — fallback relaxed decode if strict 0x10 parser did not match
    if (data.length >= 10) {
      const relaxed = tryRelaxedWeightDecode(logDebug, data);
      if (relaxed) {
        const ackCmd = [0x1f, 0x05, seenProtocolType, 0x10, 0x00];
        ackCmd[4] = checksumByte(ackCmd);
        void writeCmd("0x1F stable ack (relaxed)", ackCmd);
        finishWithReading(relaxed.weight, relaxed.impedance);
      }
    }
  };

  const subscribeNotifyChar = async (uuid: string, label: string) => {
    if (!vendorService) return;
    try {
      const characteristic = await vendorService.getCharacteristic(uuid);
      await characteristic.startNotifications();
      characteristic.addEventListener(
        "characteristicvaluechanged",
        handleNotification(label)
      );
      notifyChars.push(characteristic);
      logRenphoDebug(logDebug, `[Renpho] Notifications started on ${label} (${uuid})`);
    } catch (err) {
      logRenphoDebug(
        logDebug,
        `[Renpho] ${label} (${uuid}) not available: ${String(err)}`
      );
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
    logRenphoDebug(logDebug, "[Renpho] Connected to GATT server");

    let vendorServiceUuid = "";
    for (const serviceUuid of [
      WEIGHT_MEASUREMENT_SERVICE_T1,
      WEIGHT_MEASUREMENT_SERVICE_T2,
    ]) {
      try {
        vendorService = await server.getPrimaryService(serviceUuid);
        vendorServiceUuid = serviceUuid;
        break;
      } catch {
        // try alternate vendor service
      }
    }
    if (!vendorService) {
      throw new Error("Scale vendor service not found");
    }
    logRenphoDebug(logDebug, `[Renpho] Got vendor service ${vendorServiceUuid}`);

    await sendAe00ServiceInit(vendorService, logDebug);

    try {
      aeService = await server.getPrimaryService(AE00_SERVICE);
      logRenphoDebug(logDebug, "[Renpho] Got AE00 service");
    } catch {
      logRenphoDebug(logDebug, "[Renpho] AE00 service not present on this firmware");
    }

    onStatus("reading");
    await subscribeNotifyChar(CHR_NOTIFY_T1, "FFE1 notify");
    await subscribeNotifyChar(CUSTOM3_MEASUREMENT_CHARACTERISTIC, "FFE3 alternative");
    await subscribeNotifyChar(CHR_NOTIFY_T2, "FFF1 notify");

    if (notifyChars.length === 0) {
      throw new Error("Scale notify characteristic not found");
    }

    await subscribeAe02();
    if (hasAe00) {
      logRenphoDebug(logDebug, "[Renpho] Subscribed to AE02 notifications");
    }

    try {
      const custom3 = await vendorService.getCharacteristic(
        CUSTOM3_MEASUREMENT_CHARACTERISTIC
      );
      await custom3.writeValue(new Uint8Array([0x1f, 0x05, 0x15, 0x10, 0x49]));
      logRenphoDebug(logDebug, "[Renpho] Sent init command to CUSTOM3");
    } catch {
      logRenphoDebug(logDebug, "[Renpho] CUSTOM3 init not available on this firmware");
    }

    try {
      await sendCustom4TimeSyncAndProfile(vendorService, userProfile, logDebug);
    } catch (err) {
      logRenphoDebug(logDebug, `[Renpho] CUSTOM4 setup failed: ${String(err)}`);
    }

    if (!hasAe00) {
      await writeCmd("legacy unlock 1", [0x13, 0x09, 0x00, 0x01, 0x01, 0x02]);
      await writeCmd("legacy unlock 2", [0x13, 0x09, 0x00, 0x01, 0x10, 0x00, 0x00, 0x00, 0x2d]);
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
