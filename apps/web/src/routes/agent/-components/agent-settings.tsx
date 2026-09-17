import type { AgentSettings, OpenAIReasoningEffort } from "@reactive-resume/ai/types";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { GearSixIcon } from "@phosphor-icons/react";
import { useEffect, useId, useState } from "react";
import {
	agentModeSchema,
	MAX_AGENT_CUSTOM_INSTRUCTIONS_LENGTH,
	openAIReasoningEffortSchema,
} from "@reactive-resume/ai/types";
import { Button } from "@reactive-resume/ui/components/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@reactive-resume/ui/components/popover";
import { Textarea } from "@reactive-resume/ui/components/textarea";

type AgentSettingsPopoverProps = {
	settings: AgentSettings;
	reasoningEfforts: OpenAIReasoningEffort[];
	disabled: boolean;
	onChange: (settings: Partial<AgentSettings>) => void;
};

export function AgentSettingsPopover({ settings, reasoningEfforts, disabled, onChange }: AgentSettingsPopoverProps) {
	const customInstructionsId = useId();
	const [customInstructions, setCustomInstructions] = useState(settings.customInstructions ?? "");
	useEffect(() => setCustomInstructions(settings.customInstructions ?? ""), [settings.customInstructions]);

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button size="icon-sm" variant="ghost" aria-label={t`Agent settings`}>
						<GearSixIcon />
					</Button>
				}
			/>
			<PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] gap-4 p-4">
				<PopoverTitle>
					<Trans>Agent settings</Trans>
				</PopoverTitle>
				<fieldset disabled={disabled} className="flex min-w-0 flex-col gap-4 disabled:opacity-60">
					<label className="flex flex-col gap-1">
						<Trans>Agent mode</Trans>
						<select
							className="rounded-md border bg-background p-2"
							value={settings.agentMode}
							onChange={(event) => onChange({ agentMode: agentModeSchema.parse(event.target.value) })}
						>
							<option value="analyze">
								<Trans>Analyze</Trans>
							</option>
							<option value="edit">
								<Trans>Edit</Trans>
							</option>
							<option value="autonomous">
								<Trans>Autonomous</Trans>
							</option>
						</select>
					</label>
					<p className="text-muted-foreground text-xs">
						{settings.agentMode === "analyze" ? (
							<Trans>Read and discuss only. The agent cannot change your resume.</Trans>
						) : settings.agentMode === "edit" ? (
							<Trans>Edit only when you explicitly ask.</Trans>
						) : (
							<Trans>Allow useful proactive edits. Analysis-only requests still leave your resume unchanged.</Trans>
						)}
					</p>
					<label className="flex items-center gap-2">
						<input
							type="checkbox"
							checked={settings.reviewPatches}
							disabled={settings.agentMode === "analyze"}
							onChange={(event) => onChange({ reviewPatches: event.target.checked })}
						/>
						<Trans>Review edits</Trans>
					</label>
					{reasoningEfforts.length > 0 && (
						<label className="flex flex-col gap-1">
							<Trans>Reasoning effort</Trans>
							<select
								className="rounded-md border bg-background p-2"
								value={settings.reasoningEffort}
								onChange={(event) =>
									onChange({ reasoningEffort: openAIReasoningEffortSchema.parse(event.target.value) })
								}
							>
								{reasoningEfforts.map((effort) => (
									<option key={effort} value={effort}>
										{effort}
									</option>
								))}
							</select>
						</label>
					)}
					<label htmlFor={customInstructionsId} className="flex flex-col gap-1">
						<Trans>Custom instructions</Trans>
						<Textarea
							id={customInstructionsId}
							rows={5}
							maxLength={MAX_AGENT_CUSTOM_INSTRUCTIONS_LENGTH}
							value={customInstructions}
							placeholder={t`Keep my CV concise. Keep skills grouped by category.`}
							onChange={(event) => setCustomInstructions(event.target.value)}
						/>
					</label>
					<p className="text-muted-foreground text-xs">
						<Trans>
							Preferences apply to this conversation. They cannot override mode, approvals, or factual accuracy.
						</Trans>
					</p>
					<Button
						size="sm"
						disabled={customInstructions.trim() === (settings.customInstructions ?? "")}
						onClick={() => onChange({ customInstructions: customInstructions.trim() || null })}
					>
						<Trans>Save instructions</Trans>
					</Button>
				</fieldset>
			</PopoverContent>
		</Popover>
	);
}
