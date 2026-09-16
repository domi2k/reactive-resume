import type { ContactIcon } from "@reactive-resume/schema/resume/data";
import { Trans } from "@lingui/react/macro";
import { useId, useState } from "react";
import { sanitizeContactSvg } from "@reactive-resume/pdf/contact-svg";
import { Button } from "@reactive-resume/ui/components/button";
import { Textarea } from "@reactive-resume/ui/components/textarea";
import { IconPicker } from "./icon-picker";

type ContactIconPickerProps = {
	value: ContactIcon | undefined;
	defaultIcon: string;
	onChange: (value: ContactIcon | undefined) => void;
};

export function ContactIconPicker({ value, defaultIcon, onChange }: ContactIconPickerProps) {
	const sourceId = useId();
	const [source, setSource] = useState(value?.type === "svg" ? value.svg : "");
	const [error, setError] = useState(false);
	return (
		<details className="text-sm">
			<summary className="cursor-pointer">
				<Trans>Contact icon</Trans>
			</summary>
			<div className="space-y-2 py-2">
				<label className="flex items-center gap-2">
					<Trans>Icon type</Trans>
					<select
						className="rounded border bg-background p-1"
						value={value?.type ?? "default"}
						onChange={(event) => {
							setError(false);
							if (event.target.value === "default") onChange(undefined);
							else if (event.target.value === "phosphor") onChange({ type: "phosphor", name: defaultIcon });
							else {
								setSource("");
								onChange({ type: "svg", svg: "" });
							}
						}}
					>
						<option value="default">
							<Trans>Default icon</Trans>
						</option>
						<option value="phosphor">
							<Trans>Phosphor icon</Trans>
						</option>
						<option value="svg">
							<Trans>Custom SVG</Trans>
						</option>
					</select>
				</label>
				{value?.type === "phosphor" && (
					<IconPicker value={value.name} onChange={(name) => onChange({ type: "phosphor", name })} />
				)}
				{value?.type === "svg" && (
					<>
						<label htmlFor={sourceId} className="block space-y-1">
							<span>
								<Trans>SVG markup (viewBox required)</Trans>
							</span>
							<Textarea
								id={sourceId}
								value={source}
								maxLength={32_768}
								onChange={(event) => {
									setSource(event.target.value);
									setError(false);
								}}
							/>
						</label>
						<p className="text-muted-foreground text-xs">
							<Trans>
								Paths, groups, circles, ellipses, rectangles, lines and polygons. Use presentation attributes instead of
								CSS. No links, images or scripts.
							</Trans>
						</p>
						<Button
							type="button"
							size="sm"
							onClick={() => {
								const svg = sanitizeContactSvg(source);
								setError(!svg);
								if (svg) {
									setSource(svg);
									onChange({ type: "svg", svg });
								}
							}}
						>
							<Trans>Apply SVG</Trans>
						</Button>
						{error && (
							<p role="alert">
								<Trans>
									Invalid or unsupported SVG. Use a viewBox and supported shapes with presentation attributes.
								</Trans>
							</p>
						)}
					</>
				)}
			</div>
		</details>
	);
}
