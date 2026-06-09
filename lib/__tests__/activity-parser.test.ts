import { describe, expect, it } from "vitest";
import { parseActivityFile, stravaActivityToUpload } from "../activity-parser";

function makeFile(name: string, content: string, type = "text/plain"): File {
  return new File([content], name, { type });
}

const sampleGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1">
  <trk>
    <name>Morning Run</name>
    <trkseg>
      <trkpt lat="54.776000" lon="-1.573000"><time>2026-06-08T07:00:00Z</time></trkpt>
      <trkpt lat="54.777000" lon="-1.574000"><time>2026-06-08T07:30:00Z</time></trkpt>
      <trkpt lat="54.778500" lon="-1.575500"><time>2026-06-08T08:00:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const sampleTcx = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase>
  <Activities>
    <Activity Sport="Running">
      <Id>2026-06-08T07:00:00.000Z</Id>
      <Lap StartTime="2026-06-08T07:00:00.000Z">
        <TotalTimeSeconds>2052</TotalTimeSeconds>
        <DistanceMeters>5100</DistanceMeters>
        <Calories>387</Calories>
        <AverageHeartRateBpm><Value>158</Value></AverageHeartRateBpm>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

const sampleCsv = `Activity Type,Date,Moving Time,Distance,Avg HR,Calories
Running,2026-06-08,34:12,5.1 km,158,387`;

describe("parseActivityFile", () => {
  it("parses GPX files", async () => {
    const result = await parseActivityFile(makeFile("run.gpx", sampleGpx, "application/gpx+xml"));

    expect(result.activity).toBe("Morning Run");
    expect(result.type).toBe("GPX");
    expect(result.duration).toMatch(/\d+:\d{2}/);
    expect(result.distance).toBeDefined();
    expect(result.date).toBe("2026-06-08");
  });

  it("parses TCX files", async () => {
    const result = await parseActivityFile(makeFile("run.tcx", sampleTcx, "application/tcx+xml"));

    expect(result.activity).toBe("Running");
    expect(result.type).toBe("Garmin TCX");
    expect(result.duration).toBe("34:12");
    expect(result.distance).toBe("5.1 km");
    expect(result.avgHR).toBe(158);
    expect(result.calories).toBe(387);
  });

  it("parses Garmin CSV exports", async () => {
    const result = await parseActivityFile(makeFile("activities.csv", sampleCsv, "text/csv"));

    expect(result.activity).toBe("Running");
    expect(result.type).toBe("Garmin CSV");
    expect(result.duration).toBe("34:12");
    expect(result.avgHR).toBe(158);
    expect(result.calories).toBe(387);
  });

  it("rejects unsupported file types", async () => {
    await expect(
      parseActivityFile(makeFile("notes.txt", "hello", "text/plain"))
    ).rejects.toThrow(/Unsupported file type/);
  });
});

describe("stravaActivityToUpload", () => {
  it("maps Strava API activity to upload shape", () => {
    const result = stravaActivityToUpload({
      id: 12345,
      name: "Sunday League",
      sport_type: "Soccer",
      type: "Run",
      start_date: "2026-06-08T10:00:00Z",
      moving_time: 5400,
      distance: 8200,
      average_heartrate: 152,
      kilojoules: 1800,
    });

    expect(result.activity).toBe("Sunday League");
    expect(result.type).toBe("Strava");
    expect(result.duration).toBe("1:30:00");
    expect(result.distance).toBe("8.2 km");
    expect(result.avgHR).toBe(152);
    expect(result.externalId).toBe("strava:12345");
  });
});
