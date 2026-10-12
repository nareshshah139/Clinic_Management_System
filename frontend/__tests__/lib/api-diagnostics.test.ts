import { ApiClient } from "@/lib/api";
import {
  API_DIAGNOSTICS_KEY,
  diagnosticResource,
  recordApiDiagnostic,
} from "@/lib/api-diagnostics";

const requestId = "11111111-1111-4111-8111-111111111111";
const response = (status: number, body: unknown, id?: string) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: (name: string) =>
      name.toLowerCase() === "x-request-id"
        ? id
        : name.toLowerCase() === "content-type"
          ? "application/json"
          : null,
  },
  json: async () => body,
});
const entries = () =>
  JSON.parse(sessionStorage.getItem(API_DIAGNOSTICS_KEY) || "[]");

beforeEach(() => {
  sessionStorage.clear();
  global.fetch = jest.fn();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it("connects a patient validation error to the server reference without recording private content", async () => {
  (fetch as jest.Mock).mockResolvedValue(
    response(400, { message: "Private patient validation detail" }, requestId),
  );
  const error = await new ApiClient()
    .patch("/patients/private-patient-id?phone=9999999999", {
      name: "Private patient",
      history: "Private medical history",
    })
    .catch((error) => error);
  expect(error).toMatchObject({ status: 400, requestId });
  expect(error.message).toContain(`Reference: ${requestId}`);
  expect(entries()).toEqual([
    expect.objectContaining({
      requestId,
      resource: "patients",
      method: "PATCH",
      code: "http_error",
      status: 400,
      attempts: 1,
    }),
  ]);
  const logs =
    sessionStorage.getItem(API_DIAGNOSTICS_KEY)! +
    JSON.stringify((console.warn as jest.Mock).mock.calls);
  expect(logs).not.toMatch(/Private|private-patient-id|9999999999/);
});

it("keeps one reference across transient retries and records the recovered save", async () => {
  jest.useFakeTimers();
  (fetch as jest.Mock)
    .mockResolvedValueOnce(response(503, {}))
    .mockResolvedValueOnce(response(200, { id: "saved" }));
  const result = new ApiClient().patch(
    "/visits/v",
    {},
    { idempotencyKey: "attempt" },
  );
  await jest.advanceTimersByTimeAsync(1000);
  await expect(result).resolves.toEqual({ id: "saved" });
  const calls = (fetch as jest.Mock).mock.calls;
  expect(calls[0][1].headers["X-Request-Id"]).toBe(
    calls[1][1].headers["X-Request-Id"],
  );
  expect(calls[1][1].headers["X-Request-Attempt"]).toBe("2");
  expect(entries()[0]).toMatchObject({
    code: "success",
    status: 200,
    attempts: 2,
  });
});

it("times out a stalled patient save without blindly retrying the create", async () => {
  jest.useFakeTimers();
  (fetch as jest.Mock).mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" })),
        );
      }),
  );
  const result = new ApiClient()
    .createPatient({ name: "Synthetic" })
    .catch((error) => error);
  await jest.advanceTimersByTimeAsync(30001);
  expect(await result).toMatchObject({
    status: 408,
    diagnosticCode: "timeout",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(entries()[0]).toMatchObject({ code: "timeout", attempts: 1 });
});

it("keeps the timeout active while the response body is arriving", async () => {
  jest.useFakeTimers();
  (fetch as jest.Mock).mockImplementation((_url, init) =>
    Promise.resolve({
      ...response(200, {}),
      json: () =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(new Error("Body interrupted")),
          );
        }),
    }),
  );
  const result = new ApiClient()
    .createPatient({ name: "Synthetic" })
    .catch((error) => error);
  await jest.advanceTimersByTimeAsync(30001);
  expect(await result).toMatchObject({
    status: 408,
    diagnosticCode: "timeout",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not impose the save timeout on transcription or override an explicit timeout", async () => {
  jest.useFakeTimers();
  (fetch as jest.Mock).mockImplementation(
    (_url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" })),
        );
        setTimeout(() => resolve(response(200, {})), 60000);
      }),
  );
  const transcription = new ApiClient().post("/visits/v/transcribe", {});
  const explicit = new ApiClient().post("/patients", {}, { timeoutMs: 90000 });
  await jest.advanceTimersByTimeAsync(60001);
  await expect(transcription).resolves.toEqual({});
  await expect(explicit).resolves.toEqual({});
});

it("records a final network failure even if an earlier retry received an HTTP response", async () => {
  jest.useFakeTimers();
  (fetch as jest.Mock)
    .mockResolvedValueOnce(response(503, {}))
    .mockRejectedValue(new Error("Disconnected"));
  const result = new ApiClient()
    .patch("/visits/v", {}, { idempotencyKey: "attempt" })
    .catch((error) => error);
  await jest.advanceTimersByTimeAsync(4000);
  expect(await result).toMatchObject({ diagnosticCode: "network_error" });
  expect(entries()[0]).toMatchObject({
    code: "network_error",
    status: 0,
    attempts: 3,
  });
});

it.each(["network", "invalid-json"])(
  "records %s failures separately",
  async (mode) => {
    if (mode === "network")
      (fetch as jest.Mock).mockRejectedValue(
        new Error("Private network detail"),
      );
    else
      (fetch as jest.Mock).mockResolvedValue({
        ...response(200, {}),
        json: async () => {
          throw new Error("Private corrupt body");
        },
      });
    await expect(new ApiClient().createPatient({})).rejects.toThrow(
      /Reference:/,
    );
    expect(entries()[0].code).toBe(
      mode === "network" ? "network_error" : "invalid_response",
    );
    expect(sessionStorage.getItem(API_DIAGNOSTICS_KEY)).not.toContain(
      "Private",
    );
  },
);

it("bounds and sanitizes stored diagnostics and tolerates storage failures", async () => {
  for (let i = 0; i < 105; i++)
    recordApiDiagnostic({
      timestamp: new Date().toISOString(),
      requestId,
      resource: "patient-name",
      method: "POST",
      status: 200,
      code: "success",
      durationMs: i,
      attempts: 1,
      body: "secret",
    } as any);
  expect(entries()).toHaveLength(100);
  expect(entries()[0].durationMs).toBe(5);
  expect(sessionStorage.getItem(API_DIAGNOSTICS_KEY)).not.toMatch(
    /secret|patient-name/,
  );
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  (fetch as jest.Mock).mockResolvedValue(response(201, { id: "saved" }));
  await expect(new ApiClient().createPatient({})).resolves.toEqual({
    id: "saved",
  });
});


describe("inventory diagnostic categories", () => {
  it.each(["inventory", "pharmacy", "drugs"])("retains %s without copying identifiers or queries", (resource) => {
    expect(diagnosticResource(`/${resource}/PRIVATE-id?secret=PRIVATE`)).toBe(resource);
    sessionStorage.clear();
    recordApiDiagnostic({ timestamp: new Date().toISOString(), requestId, resource, method: "PATCH", status: 200, code: "success", durationMs: 1, attempts: 1 });
    expect(JSON.parse(sessionStorage.getItem(API_DIAGNOSTICS_KEY)!)[0].resource).toBe(resource);
    expect(sessionStorage.getItem(API_DIAGNOSTICS_KEY)).not.toContain("PRIVATE");
  });
  it("does not treat unknown endpoints as resource names", () => {
    expect(diagnosticResource("/PRIVATE-id/inventory")).toBe("other");
  });
});
