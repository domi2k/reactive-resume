import { HTMLElement, parse } from "node-html-parser";

const tags = new Set(["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon"]);
const attributes = new Set([
	"viewBox",
	"width",
	"height",
	"x",
	"y",
	"x1",
	"y1",
	"x2",
	"y2",
	"cx",
	"cy",
	"r",
	"rx",
	"ry",
	"d",
	"points",
	"fill",
	"stroke",
	"stroke-width",
	"stroke-linecap",
	"stroke-linejoin",
	"stroke-miterlimit",
	"fill-rule",
	"fill-opacity",
	"stroke-opacity",
	"opacity",
	"transform",
]);

/** Reject unsupported content; never pass user markup or resource references to the renderer. */
export function sanitizeContactSvg(source: string): string | null {
	if (!source.trim() || source.length > 32_768 || /<!|<\?|&/.test(source)) return null;
	try {
		const root = parse(source, { lowerCaseTagName: false });
		const elements = root.childNodes.filter((node) => node instanceof HTMLElement);
		const svg = elements[0];
		if (elements.length !== 1 || !svg || svg.rawTagName !== "svg") return null;
		let count = 0;
		const visit = (node: HTMLElement, depth: number): string => {
			if (++count > 256 || depth > 16 || !tags.has(node.rawTagName) || (depth > 0 && node.rawTagName === "svg"))
				throw new Error();
			const attrs: string[] = [];
			for (const [name, value] of Object.entries(node.attributes)) {
				if (name === "xmlns" && value === "http://www.w3.org/2000/svg") continue;
				// biome-ignore lint/suspicious/noControlCharactersInRegex: Reject control characters in untrusted SVG attributes.
				if (!attributes.has(name) || /url\s*\(|:|[<>"'\\]|[\x00-\x1f]/i.test(value)) throw new Error();
				if (
					(name === "fill" || name === "stroke") &&
					!/^(none|currentColor|transparent|[a-z]+|#[\da-f]{3,8}|rgba?\([\d.,%\s]+\))$/i.test(value)
				)
					throw new Error();
				attrs.push(`${name}="${value}"`);
			}
			const children = node.childNodes
				.map((child) => {
					if (child instanceof HTMLElement) return visit(child, depth + 1);
					if (child.text.trim()) throw new Error();
					return "";
				})
				.join("");
			return `<${node.rawTagName}${attrs.length ? ` ${attrs.join(" ")}` : ""}>${children}</${node.rawTagName}>`;
		};
		const viewBox = svg
			.getAttribute("viewBox")
			?.trim()
			.split(/[\s,]+/)
			.map(Number);
		if (viewBox?.length !== 4 || !viewBox.every(Number.isFinite) || (viewBox[2] ?? 0) <= 0 || (viewBox[3] ?? 0) <= 0)
			return null;
		return visit(svg, 0);
	} catch {
		return null;
	}
}
