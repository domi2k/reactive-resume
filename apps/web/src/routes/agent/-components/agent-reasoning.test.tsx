// @vitest-environment happy-dom
import type { AgentChatProps } from "./agent-chat";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { openAIReasoningEffortSchema } from "@reactive-resume/ai/types";
import { AgentChat } from "./agent-chat";

const updateSettings = vi.hoisted(() => vi.fn(async (_input: { id: string; reasoningEffort: string }) => ({})));
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
	reasoningEffort: "medium",
	reasoningEfforts: openAIReasoningEffortSchema.options,
	activeRunId: null,
	actions: [],
};

function renderChat(overrides: Partial<AgentChatProps> = {}) {
	const queryClient = new QueryClient();
	return render(
		<QueryClientProvider client={queryClient}>
			<I18nProvider i18n={i18n}>
				<AgentChat {...props} {...overrides} />
			</I18nProvider>
		</QueryClientProvider>,
	);
}

beforeAll(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
beforeEach(() => updateSettings.mockClear());

describe("conversation reasoning selector", () => {
	it("starts at medium and sends changed effort through the thread settings request", async () => {
		renderChat();
		const select = screen.getByRole("combobox", { name: "Reasoning effort" });
		expect(select).toHaveValue("medium");
		expect(screen.getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(
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
