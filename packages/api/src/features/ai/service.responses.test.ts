import type { UIMessageChunk } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText, ToolLoopAgent } from "ai";
import { buildAgentTools } from "../agent/tools";
import { getModel, testConnection } from "./service";

vi.mock("@reactive-resume/env/server", () => ({ env: { FLAG_ALLOW_UNSAFE_AI_BASE_URL: false } }));

const provider = {
	provider: "openai" as const,
	model: "gpt-5.6-luna",
	apiKey: "test-secret-key",
	baseURL: "https://api.openai.com/v1",
};
const usage = { input_tokens: 12, output_tokens: 8, output_tokens_details: { reasoning_tokens: 4 } };

function response(text = "1") {
	return {
		id: "resp_test",
		created_at: 1,
		model: provider.model,
		status: "completed",
		output: [
			{ type: "message", id: "msg_test", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] },
		],
		usage,
	};
}

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function events(step: number, toolName?: string) {
	const item = toolName
		? {
				type: "function_call",
				id: `fc_${step}`,
				call_id: `call_${step}`,
				name: toolName,
				arguments: "{}",
				status: "completed",
			}
		: { type: "message", id: `msg_${step}`, role: "assistant" };
	return [
		{ type: "response.created", response: { id: `resp_${step}`, created_at: 1, model: provider.model } },
		{ type: "response.output_item.added", output_index: 0, item: { type: "reasoning", id: `rs_${step}` } },
		{ type: "response.reasoning_summary_part.added", item_id: `rs_${step}`, summary_index: 0 },
		{
			type: "response.reasoning_summary_text.delta",
			item_id: `rs_${step}`,
			summary_index: 0,
			delta: "Reviewing resume.",
		},
		{ type: "response.reasoning_summary_part.done", item_id: `rs_${step}`, summary_index: 0 },
		{ type: "response.output_item.done", output_index: 0, item: { type: "reasoning", id: `rs_${step}` } },
		{ type: "response.output_item.added", output_index: 1, item },
		...(!toolName ? [{ type: "response.output_text.delta", item_id: item.id, delta: "Final answer." }] : []),
		{ type: "response.output_item.done", output_index: 1, item },
		{ type: "response.completed", response: { usage } },
	];
}

function sse(parts: unknown[]) {
	return new Response(parts.map((part) => `data: ${JSON.stringify(part)}\n\n`).join(""), {
		headers: { "Content-Type": "text/event-stream" },
	});
}

afterEach(() => vi.unstubAllGlobals());

describe("OpenAI Responses transport", () => {
	it.each(["gpt-4o", "custom-model"])(
		"routes official OpenAI model %s independently of reasoning capabilities",
		async (model) => {
			const fetchMock = vi.fn((_url: string) => json(response()));
			vi.stubGlobal("fetch", fetchMock);
			await generateText({ model: getModel({ ...provider, model }), prompt: "Hello" });
			expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/responses");
		},
	);

	it("rejects unsupported reasoning selections instead of silently discarding them", () => {
		expect(() => getModel({ ...provider, model: "gpt-4o", reasoningEffort: "high" })).toThrow(
			"does not support the selected reasoning effort",
		);
		expect(() => getModel({ ...provider, provider: "openai-compatible", reasoningEffort: "high" })).toThrow(
			"does not support the selected reasoning effort",
		);
	});
	it.each(["none", "low", "medium", "high", "xhigh", "max"] as const)(
		"sends selected effort %s with tools to Responses",
		async (reasoningEffort) => {
			const fetchMock = vi.fn(() => json(response()));
			vi.stubGlobal("fetch", fetchMock);
			const agent = new ToolLoopAgent({
				model: getModel({ ...provider, reasoningEffort }),
				tools: buildAgentTools({
					options: { agentMode: "edit" },
					provider,
					handlers: { readResume: vi.fn(), readAttachment: vi.fn(), applyResumePatch: vi.fn() },
				}),
			});
			await agent.generate({ prompt: "Read resume" });
			expect(fetchMock).toHaveBeenCalledTimes(1);
			const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
			expect(url).toBe("https://api.openai.com/v1/responses");
			expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${provider.apiKey}`);
			const body = JSON.parse(String(init.body));
			expect(body).toMatchObject({ model: provider.model, reasoning: { effort: reasoningEffort } });
			expect(body.tools).toContainEqual(expect.objectContaining({ type: "function", name: "read_resume" }));
			expect(body).not.toHaveProperty("reasoning_effort");
			if (reasoningEffort !== "none") expect(body.reasoning.summary).toBe("auto");
		},
	);

	it("never advertises or executes a patch in Analyze even if the model requests one", async () => {
		let step = 0;
		const requests: Array<{ tools: Array<{ name?: string }> }> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn((_url: string, init: RequestInit) => {
				requests.push(JSON.parse(String(init.body)));
				return sse(events(step, step++ === 0 ? "apply_resume_patch" : undefined));
			}),
		);
		const applyResumePatch = vi.fn();
		const agent = new ToolLoopAgent({
			model: getModel({ ...provider, reasoningEffort: "high" }),
			tools: buildAgentTools({
				provider,
				handlers: { readResume: vi.fn(), readAttachment: vi.fn(), applyResumePatch },
			}),
		});
		const result = await agent.stream({ prompt: "Review my resume" });
		const chunks: UIMessageChunk[] = [];
		for await (const chunk of result.toUIMessageStream()) chunks.push(chunk);
		expect(requests.length).toBeGreaterThan(0);
		expect(requests.every(({ tools }) => tools.every(({ name }) => name !== "apply_resume_patch"))).toBe(true);
		expect(applyResumePatch).not.toHaveBeenCalled();
		expect(chunks).toContainEqual(
			expect.objectContaining({ type: "tool-input-error", toolName: "apply_resume_patch" }),
		);
	});

	it("executes repeated application tools, returns paired outputs, and streams summaries separately", async () => {
		let step = 0;
		const requests: Array<{ url: string; body: { input: unknown[] } }> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string, init: RequestInit) => {
				requests.push({ url, body: JSON.parse(String(init.body)) });
				return sse(events(step, step++ < 2 ? "read_resume" : undefined));
			}),
		);
		const readResume = vi.fn(async () => ({ name: "Test resume" }));
		const agent = new ToolLoopAgent({
			model: getModel({ ...provider, reasoningEffort: "high" }),
			tools: buildAgentTools({
				options: { agentMode: "edit" },
				provider,
				handlers: { readResume, readAttachment: vi.fn(), applyResumePatch: vi.fn() },
			}),
		});
		const result = await agent.stream({ prompt: "Read twice, then answer" });
		const chunks: UIMessageChunk[] = [];
		for await (const chunk of result.toUIMessageStream()) chunks.push(chunk);
		expect(chunks.filter((chunk) => chunk.type === "error")).toEqual([]);
		expect(readResume).toHaveBeenCalledTimes(2);
		expect(requests).toHaveLength(3);
		expect(requests.every(({ url }) => url === "https://api.openai.com/v1/responses")).toBe(true);
		for (const index of [1, 2]) {
			expect(requests[index]?.body.input).toContainEqual(
				expect.objectContaining({
					type: "function_call_output",
					call_id: `call_${index - 1}`,
					output: JSON.stringify({ name: "Test resume" }),
				}),
			);
		}
		expect(chunks).toContainEqual(expect.objectContaining({ type: "reasoning-start" }));
		expect(chunks).toContainEqual(expect.objectContaining({ type: "reasoning-delta", delta: "Reviewing resume." }));
		expect(chunks).toContainEqual(expect.objectContaining({ type: "reasoning-end" }));
		expect(chunks.filter((chunk) => chunk.type === "text-delta")).toEqual([
			expect.objectContaining({ type: "text-delta", delta: "Final answer." }),
		]);
	});

	it("tests provider with the same Responses endpoint and authentication as generation", async () => {
		const fetchMock = vi.fn(() => json(response()));
		vi.stubGlobal("fetch", fetchMock);
		await expect(testConnection(provider)).resolves.toEqual({ ok: true });
		await generateText({ model: getModel(provider), prompt: "1" });
		for (const [url, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
			expect(url).toBe("https://api.openai.com/v1/responses");
			expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${provider.apiKey}`);
		}
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it.each(["openai-compatible", "openrouter"] as const)("keeps %s on Chat Completions", async (type) => {
		const fetchMock = vi.fn((_url: string) =>
			json({
				choices: [{ message: { role: "assistant", content: "1" }, finish_reason: "stop", index: 0 }],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		await expect(testConnection({ ...provider, provider: type, baseURL: "https://example.test/v1" })).resolves.toEqual({
			ok: true,
		});
		expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.test/v1/chat/completions");
	});

	it("honors a custom OpenAI base URL without changing transport", async () => {
		const fetchMock = vi.fn((_url: string) => json(response()));
		vi.stubGlobal("fetch", fetchMock);
		await testConnection({ ...provider, baseURL: "https://proxy.example/v1" });
		expect(fetchMock.mock.calls[0]?.[0]).toBe("https://proxy.example/v1/responses");
	});

	it("aborts an active Responses stream", async () => {
		const controller = new AbortController();
		let requestSignal: AbortSignal | undefined;
		vi.stubGlobal(
			"fetch",
			vi.fn((_url: string, init: RequestInit) => {
				requestSignal = init.signal ?? undefined;
				return new Response(
					new ReadableStream({
						start(stream) {
							stream.enqueue(
								new TextEncoder().encode(
									events(0)
										.slice(0, 4)
										.map((part) => `data: ${JSON.stringify(part)}\n\n`)
										.join(""),
								),
							);
							requestSignal?.addEventListener("abort", () => stream.error(requestSignal?.reason), { once: true });
						},
					}),
					{ headers: { "Content-Type": "text/event-stream" } },
				);
			}),
		);
		const agent = new ToolLoopAgent({ model: getModel(provider) });
		const result = await agent.stream({ prompt: "Continue", abortSignal: controller.signal });
		const chunks: UIMessageChunk[] = [];
		for await (const chunk of result.toUIMessageStream()) {
			chunks.push(chunk);
			if (chunk.type === "reasoning-delta") controller.abort(new DOMException("USER_STOPPED", "AbortError"));
		}
		expect(requestSignal?.aborted).toBe(true);
		expect(chunks).toContainEqual(expect.objectContaining({ type: "abort" }));
		expect(chunks.filter((chunk) => chunk.type === "error")).toEqual([]);
	});

	it.each([400, 401, 404, 429, 500])("preserves provider test error format for HTTP %s", async (status) => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() => json({ error: { message: "Unsupported model or configuration" } }, status)),
		);
		await expect(testConnection(provider)).resolves.toMatchObject({ ok: false, message: expect.any(String) });
	});

	it("explains a missing Responses endpoint without hiding the provider error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() => json({ error: { message: "Not found" } }, 404)),
		);
		await expect(testConnection(provider)).resolves.toMatchObject({
			ok: false,
			message: expect.stringContaining("select OpenAI Compatible"),
		});
	});

	it("returns malformed responses as provider test failures", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() => json({ unexpected: true })),
		);
		await expect(testConnection(provider)).resolves.toMatchObject({
			ok: false,
			message: expect.stringContaining("OpenAI"),
		});
	});

	it("preserves stream error chunks for failed Responses", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				sse([
					{
						type: "response.failed",
						sequence_number: 1,
						response: { error: { code: "invalid_request", message: "Unsupported reasoning effort" } },
					},
				]),
			),
		);
		const result = await new ToolLoopAgent({ model: getModel(provider), maxRetries: 0 }).stream({ prompt: "Hi" });
		const chunks: UIMessageChunk[] = [];
		for await (const chunk of result.toUIMessageStream({
			onError: (error) => (error instanceof Error ? error.message : "Agent run failed."),
		}))
			chunks.push(chunk);
		expect(chunks).toContainEqual({
			type: "error",
			errorText: expect.stringContaining("Unsupported reasoning effort"),
		});
	});
});
