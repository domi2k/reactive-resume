// @vitest-environment happy-dom
import type { AgentSettings } from "@reactive-resume/ai/types";
import type { AgentChatProps } from "./agent-chat";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { openAIReasoningEffortSchema } from "@reactive-resume/ai/types";
import { AgentChat } from "./agent-chat";

const updateSettings = vi.hoisted(() => vi.fn(async (_input: { id: string } & Partial<AgentSettings>) => ({})));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/libs/orpc/client", () => {
	const unusedMutation = { mutationOptions: () => ({ mutationFn: vi.fn() }) };
	return {
		client: {},
		streamClient: {},
		orpc: {
			agent: {
				actions: { revert: unusedMutation },
				threads: {
					archive: unusedMutation,
					delete: unusedMutation,
					update: { mutationOptions: () => ({ mutationFn: updateSettings }) },
					list: { queryKey: () => ["threads"] },
					get: { queryKey: () => ["thread"] },
				},
			},
		},
	};
});

const props: AgentChatProps = {
	threadId: "thread-1",
	initialMessages: [],
	isReadOnly: false,
	readOnlyReason: null,
	threadStatus: "active",
	reviewPatches: false,
	agentMode: "analyze",
	customInstructions: null,
	reasoningEffort: "medium",
	reasoningEfforts: openAIReasoningEffortSchema.options,
	activeRunId: null,
	actions: [],
};

function renderChat(overrides: Partial<AgentChatProps> = {}) {
	const queryClient = new QueryClient();
	const result = render(
		<QueryClientProvider client={queryClient}>
			<I18nProvider i18n={i18n}>
				<AgentChat {...props} {...overrides} />
			</I18nProvider>
		</QueryClientProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Agent settings" }));
	return result;
}

beforeAll(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
beforeEach(() => updateSettings.mockClear());

describe("conversation reasoning selector", () => {
	it("starts at medium and sends changed effort through the thread settings request", async () => {
		renderChat();
		const select = screen.getByRole("combobox", { name: "Reasoning effort" });
		expect(select).toHaveValue("medium");
		expect(Array.from(select.querySelectorAll("option")).map((option) => option.getAttribute("value"))).toEqual(
			openAIReasoningEffortSchema.options,
		);
		for (const reasoningEffort of ["high", "none"]) {
			fireEvent.change(select, { target: { value: reasoningEffort } });
			await waitFor(() => expect(updateSettings.mock.calls.at(-1)?.[0]).toEqual({ id: "thread-1", reasoningEffort }));
			await waitFor(() => expect(select).not.toBeDisabled());
		}
	});

	it("restores saved effort when reopening", () => {
		renderChat({ reasoningEffort: "max" });
		expect(screen.getByRole("combobox", { name: "Reasoning effort" })).toHaveValue("max");
	});

	it("hides selector when provider/model has no supported efforts", () => {
		renderChat({ reasoningEfforts: [] });
		expect(screen.queryByRole("combobox", { name: "Reasoning effort" })).not.toBeInTheDocument();
	});

	it("disables selector for archived conversations", () => {
		renderChat({ threadStatus: "archived", isReadOnly: true, readOnlyReason: "archived" });
		expect(screen.getByRole("combobox", { name: "Reasoning effort" })).toBeDisabled();
	});
});

describe("agent settings", () => {
	it("defaults to Analyze, disables patch review, and saves mode changes", async () => {
		renderChat();
		const select = screen.getByRole("combobox", { name: "Agent mode" });
		expect(select).toHaveValue("analyze");
		expect(screen.getByRole("checkbox", { name: "Review edits" })).toBeDisabled();
		fireEvent.change(select, { target: { value: "edit" } });
		await waitFor(() => expect(updateSettings.mock.calls.at(-1)?.[0]).toEqual({ id: "thread-1", agentMode: "edit" }));
	});

	it("restores preferences and saves/clears multiline instructions without replacing other settings", async () => {
		renderChat({ agentMode: "edit", customInstructions: "Keep one page.", reviewPatches: true });
		const textarea = screen.getByRole("textbox", { name: "Custom instructions" });
		expect(textarea).toHaveValue("Keep one page.");
		expect(screen.getByRole("checkbox", { name: "Review edits" })).toBeChecked();
		fireEvent.change(textarea, { target: { value: "Keep one page.\nPreserve Skills grouping." } });
		fireEvent.click(screen.getByRole("button", { name: "Save instructions" }));
		await waitFor(() =>
			expect(updateSettings.mock.calls.at(-1)?.[0]).toEqual({
				id: "thread-1",
				customInstructions: "Keep one page.\nPreserve Skills grouping.",
			}),
		);
		await waitFor(() => expect(textarea).not.toBeDisabled());
		fireEvent.change(textarea, { target: { value: "" } });
		fireEvent.click(screen.getByRole("button", { name: "Save instructions" }));
		await waitFor(() =>
			expect(updateSettings.mock.calls.at(-1)?.[0]).toEqual({ id: "thread-1", customInstructions: null }),
		);
	});
});
