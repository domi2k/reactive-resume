import { describe, expect, it } from "vitest";
import { sanitizeContactSvg } from "./contact-svg";

describe("contact SVG allowlist", () => {
	it("keeps vector shapes and rejects executable or external content", () => {
		const wrap = (body: string) => `<svg viewBox="0 0 24 24">${body}</svg>`;
		expect(sanitizeContactSvg(wrap('<g fill="currentColor"><path d="M0 0 L24 24"/></g>'))).toContain(
			'<path d="M0 0 L24 24">',
		);
		for (const content of [
			"<script>alert(1)</script>",
			"<foreignObject/>",
			'<image href="https://example.com/icon.png"/>',
			'<use href="#icon"/>',
			'<path onclick="alert(1)"/>',
			'<path fill="url(https://example.com)"/>',
			'<path style="fill:red"/>',
			'<path href="javascript:alert(1)"/>',
			'<path fill="&#114;ed"/>',
		])
			expect(sanitizeContactSvg(wrap(content))).toBeNull();
		expect(sanitizeContactSvg('<!DOCTYPE svg><svg viewBox="0 0 24 24"/>')).toBeNull();
		expect(sanitizeContactSvg('<svg viewBox="0 0 0 24"/>')).toBeNull();
		expect(sanitizeContactSvg(wrap("<g>".repeat(17) + "</g>".repeat(17)))).toBeNull();
	});
});
