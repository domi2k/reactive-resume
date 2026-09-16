import type { ComponentProps, ElementType, ReactNode } from "react";
import { HTMLElement, parse } from "node-html-parser";
import { createElement, useMemo } from "react";
import { Circle, Ellipse, G, Line, Path, Polygon, Polyline, Rect, Svg } from "#react-pdf-renderer";
import { sanitizeContactSvg } from "../../contact-svg";

const primitives = {
	svg: Svg,
	g: G,
	path: Path,
	circle: Circle,
	ellipse: Ellipse,
	rect: Rect,
	line: Line,
	polyline: Polyline,
	polygon: Polygon,
};
type ContactSvgProps = ComponentProps<typeof Svg> & { source: string; color: string };

export function ContactSvg({ source, color, ...props }: ContactSvgProps) {
	const root = useMemo(() => {
		const safe = sanitizeContactSvg(source);
		return safe ? (parse(safe).firstChild as HTMLElement) : null;
	}, [source]);
	if (!root) return null;
	const render = (node: HTMLElement, key: number, isRoot = false): ReactNode => {
		const attributes = Object.fromEntries(
			Object.entries(node.attributes).map(([name, value]) => [
				name.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase()),
				value === "currentColor" ? color : value,
			]),
		);
		return createElement(
			primitives[node.rawTagName as keyof typeof primitives] as ElementType,
			{
				...attributes,
				key,
				...(isRoot ? { fill: attributes.fill ?? color, ...props } : {}),
			},
			node.childNodes
				.filter((child): child is HTMLElement => child instanceof HTMLElement)
				.map((child, index) => render(child, index)),
		);
	};
	return render(root, 0, true);
}
