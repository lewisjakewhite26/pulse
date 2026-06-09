export const WEIGHT_MEASUREMENT_SERVICE = "0000ffe0-0000-1000-8000-00805f9b34fb";
export const CUSTOM1_MEASUREMENT_CHARACTERISTIC =
  "0000ffe1-0000-1000-8000-00805f9b34fb";
export const CUSTOM1_MEASUREMENT_CHARACTERISTIC_ALTERNATIVE =
  "0000ffe3-0000-1000-8000-00805f9b34fb";
export const CUSTOM3_MEASUREMENT_CHARACTERISTIC =
  "0000ffe3-0000-1000-8000-00805f9b34fb";
export const CUSTOM4_MEASUREMENT_CHARACTERISTIC =
  "0000ffe4-0000-1000-8000-00805f9b34fb";

const INIT_COMMAND = new Uint8Array([0x1f, 0x05, 0x15, 0x10, 0x49]);
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

function buildDateBytes(now: Date): Uint8Array {
  return new Uint8Array([
    0x02,
    now.getFullYear() - 2000,
    now.getMonth() + 1,
    now.getDate(),
    now.getHours(),
  ]);
}

function decodePacket(
  data: Uint8Array,
  age: number,
  heightCm: number,
  isMale: boolean,
  calcBIA: RenphoCalcBIA
): RenphoReadingPayload | null {
  if (data.length < 20) return null;

  const weightRaw = ((data[3] & 0xff) << 8) | (data[4] & 0xff);
  const weightKg = weightRaw / 100;

  if (weightKg < 20 || weightKg > 300) return null;

  const resistance1 = ((data[9] & 0xff) << 8) | (data[10] & 0xff);
  const resistance2 = ((data[11] & 0xff) << 8) | (data[12] & 0xff);
  const impedance = resistance1 < 41 ? resistance2 : resistance1;

  if (impedance === 0) return null;

  return {
    weight: weightKg,
    impedance,
    composition: calcBIA(weightKg, impedance, age, heightCm, isMale),
  };
}

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export async function connectRenphoScale(params: ConnectRenphoParams): Promise<void> {
  const { age, heightCm, isMale, calcBIA, onStatus, onError, onReading } = params;

  onStatus("scanning");
  onError(null);

  let completed = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let custom1: BluetoothRemoteGATTCharacteristic | undefined;
  let device: BluetoothDevice | undefined;

  const clearReadingTimeout = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const disconnectScale = () => {
    try {
      if (custom1) void custom1.stopNotifications();
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

  const finishWithReading = (payload: RenphoReadingPayload) => {
    if (completed) return;
    completed = true;
    clearReadingTimeout();
    onReading(payload);
    onStatus("done");
    disconnectScale();
  };

  try {
    device = await navigator.bluetooth!.requestDevice({
      filters: [{ namePrefix: "QN-Scale" }],
      optionalServices: [WEIGHT_MEASUREMENT_SERVICE],
    });

    device.addEventListener("gattserverdisconnected", () => {
      if (!completed) {
        finishWithError("Scale disconnected - try again");
      }
    });

    onStatus("connected");
    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(WEIGHT_MEASUREMENT_SERVICE);
    custom1 = await service.getCharacteristic(CUSTOM1_MEASUREMENT_CHARACTERISTIC);

    const handleData = (event: Event) => {
      const target = event.target as BluetoothRemoteGATTCharacteristic;
      if (!target.value) return;

      const data = new Uint8Array(target.value.buffer);
      const decoded = decodePacket(data, age, heightCm, isMale, calcBIA);
      if (decoded) finishWithReading(decoded);
    };

    onStatus("reading");
    await custom1.startNotifications();
    custom1.addEventListener("characteristicvaluechanged", handleData);

    try {
      const custom3 = await service.getCharacteristic(CUSTOM3_MEASUREMENT_CHARACTERISTIC);
      await custom3.writeValue(INIT_COMMAND);
    } catch (err) {
      console.warn(
        "Renpho CUSTOM3 init write failed (some firmware may not need it):",
        err
      );
    }

    try {
      const custom4 = await service.getCharacteristic(CUSTOM4_MEASUREMENT_CHARACTERISTIC);
      await custom4.writeValue(buildDateBytes(new Date()));
    } catch (err) {
      console.warn(
        "Renpho CUSTOM4 date write failed (some firmware may not need it):",
        err
      );
    }

    timeoutId = setTimeout(() => {
      if (!completed) {
        finishWithError(
          "No reading received. Make sure you step on the scale with bare feet after connecting."
        );
      }
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
