import type { SemanticNode } from "@reactive-resume/resume/stylesheet";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { Template } from "@reactive-resume/schema/templates";
import { describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { pdf, renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { templateSchema } from "@reactive-resume/schema/templates";
import { ResumeDocument } from "../../document";
import { resolveResumeRuntime } from "../../semantic/resolve";
import { getTemplateSemanticManifest, validateTemplateSemanticManifest } from "../../semantic/template-manifest";
import { rasterizePdf } from "../../semantic/test/rasterize-pdf";
import { getTemplatePage } from "../index";
import { DominikPage } from "./DominikPage";

const iconCalls = vi.hoisted(() => [] as { name: string; weight?: string }[]);
vi.mock("phosphor-icons-react-pdf/dynamic", async (importOriginal) => {
	const original = await importOriginal<typeof import("phosphor-icons-react-pdf/dynamic")>();
	return {
		...original,
		Icon: (props: Parameters<typeof original.Icon>[0]) => {
			iconCalls.push(props);
			return <original.Icon {...props} />;
		},
	};
});

type HostNode = { type: string; style?: unknown; value?: string; children?: HostNode[] };
const required = <T,>(value: T | undefined): T => {
	if (value === undefined) throw new Error("Missing fixture value");
	return value;
};
const flatten = (node: SemanticNode): SemanticNode[] => [node, ...node.children.flatMap(flatten)];
const hosts = (node: HostNode): HostNode[] => [node, ...(node.children ?? []).flatMap(hosts)];
const style = (node: HostNode) => Object.assign({}, ...(Array.isArray(node.style) ? node.style : [node.style]));
const text = (node: HostNode): string => node.value ?? (node.children ?? []).map(text).join("");

const fixture = (): ResumeData => {
	const data = structuredClone(defaultResumeData);
	data.metadata.template = "dominik";
	data.metadata.typography.body.fontFamily = "Helvetica";
	data.metadata.typography.heading.fontFamily = "Helvetica";
	data.metadata.layout.pages = [{ fullWidth: false, main: ["education"], sidebar: ["summary", "skills"] }];
	data.basics = {
		name: "Dominik Example",
		headline: "Physics student",
		email: "dominik@example.com",
		phone: "+48 123 456 789",
		location: "Krakow, Poland",
		website: { url: "https://example.com", label: "Website" },
		customFields: [
			{ id: "github", icon: "github-logo", text: "GitHub", link: "https://github.com/example" },
			{ id: "linkedin", icon: "linkedin-logo", text: "LinkedIn", link: "https://linkedin.com/in/example" },
		],
	};
	data.summary.content = "<p>About me remains a normal section.</p>";
	data.sections.skills.items = [
		{
			id: "skill",
			hidden: false,
			name: "Physics",
			proficiency: "",
			level: 0,
			keywords: ["Research"],
			icon: "",
			iconColor: "",
		},
	];
	data.sections.education.items = [
		{
			id: "education",
			hidden: false,
			school: "AGH University",
			area: "Technical Physics",
			degree: "",
			grade: "",
			location: "Krakow, Poland",
			period: "2023 - present",
			description: "<p>Undergraduate student, currently in the 5th semester.</p>",
			website: { url: "", label: "", inlineLink: false },
		},
	];
	const canvas = createCanvas(20, 20);
	const context = canvas.getContext("2d");
	context.fillStyle = "#ff0000";
	context.fillRect(0, 0, 20, 20);
	data.picture.url = canvas.toDataURL("image/png");
	data.picture.hidden = false;
	return data;
};

const renderHost = async (data: ResumeData, template: Template = "dominik") => {
	const instance = await act(() => pdf(<ResumeDocument data={data} template={template} />));
	await expect.poll(() => instance.container.document).not.toBeNull();
	return instance.container.document as unknown as HostNode;
};

const renderPdf = async (data: ResumeData, template: Template = "dominik") =>
	new Uint8Array(await act(() => renderToBuffer(<ResumeDocument data={data} template={template} />)));

describe("Dominik", () => {
	it("renders original image, vector contacts and position-first linked headers", async () => {
		const data = fixture();
		data.picture.originalUrl = data.picture.url;
		data.picture.url = "https://invalid.example/avatar.png";
		data.basics.contactIcons = {
			email: { type: "svg", svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M0 0 L24 0 L12 24 Z"/></svg>' },
		};
		required(data.sections.education.items[0]).website.url = "https://example.com/school";
		required(data.sections.skills.items[0]).keywords = ["Python", "SQL (PostgreSQL, SQLite)"];
		data.sections.experience.items = [
			{
				id: "work",
				hidden: false,
				company: "Hackology",
				position: "Team Leader",
				location: "",
				period: "May 2026",
				website: { url: "https://example.com/work", label: "", inlineLink: false },
				description: "<p>Led the team.</p>",
				roles: [],
			},
		];
		required(data.metadata.layout.pages[0]).main.unshift("experience");
		data.metadata.stylesheet = { mode: "semantic", source: { languageVersion: 1, text: "@version 1;" } };
		const nodes = hosts(await renderHost(data));
		expect(nodes.some((node) => text(node) === "• Python")).toBe(true);
		expect(nodes.some((node) => text(node) === "• SQL (PostgreSQL, SQLite)")).toBe(true);
		expect(nodes.some((node) => text(node) === "Technical Physics | Krakow, Poland")).toBe(true);
		expect(
			nodes.some(
				(node) =>
					node.type === "LINK" && text(node) === "Team Leader, " && hosts(node).some((child) => child.type === "SVG"),
			),
		).toBe(true);
		const bytes = await renderPdf(data);
		expect(bytes.byteLength).toBeGreaterThan(1000);
	});

	it("registers its schema value, renderer and semantic manifest", () => {
		expect(templateSchema.parse("dominik")).toBe("dominik");
		expect(getTemplatePage("dominik")).toBe(DominikPage);
		expect(() => validateTemplateSemanticManifest(getTemplateSemanticManifest("dominik"))).not.toThrow();
	});

	it.each([false, true])("renders sidebar image only when picture.hidden is false (%s)", async (hidden) => {
		const data = fixture();
		data.picture.hidden = hidden;
		const images = hosts(await renderHost(data)).filter((node) => node.type === "IMAGE");
		expect(images).toHaveLength(hidden ? 0 : 1);
		if (!hidden)
			expect(style(required(images[0]))).toMatchObject({
				position: "absolute",
				width: "100%",
				height: "100%",
				objectFit: "cover",
			});
		expect(
			flatten(resolveResumeRuntime({ data, template: "dominik", mode: "legacy" }).sourceTree).filter(
				(node) => node.kind === "picture",
			),
		).toHaveLength(0);
	});

	it("keeps Gengar's avatar and Education field grouping", async () => {
		const data = fixture();
		const images = hosts(await renderHost(data, "gengar")).filter((node) => node.type === "IMAGE");
		expect(images).toHaveLength(1);
		expect(style(required(images[0])).position).not.toBe("absolute");
		const nodes = flatten(resolveResumeRuntime({ data, template: "gengar", mode: "legacy" }).sourceTree);
		expect(nodes.some((node) => node.kind === "picture")).toBe(true);
		expect(nodes.some((node) => node.attributes.name === "education-location-period")).toBe(true);
		expect(nodes.some((node) => node.attributes.name === "education-title")).toBe(false);
	});

	it("keeps Education date in title row and metadata below, including custom Education", async () => {
		const data = fixture();
		data.customSections = [{ ...data.sections.education, id: "custom-education", type: "education" }];
		required(data.metadata.layout.pages[0]).main.push("custom-education");
		const nodes = flatten(resolveResumeRuntime({ data, template: "dominik", mode: "legacy" }).sourceTree);
		const headers = nodes.filter(
			(node) =>
				node.kind === "item-header" && node.children.some((child) => child.attributes.name === "education-header-row"),
		);
		expect(headers).toHaveLength(2);
		for (const header of headers) {
			expect(header.children.map((child) => child.attributes.name)).toEqual([
				"education-header-row",
				"area",
				"location",
			]);
			expect(header.children[0]?.children.map((child) => child.attributes.name)).toEqual(["education-title", "period"]);
		}
		const rows = hosts(await renderHost(data)).filter(
			(node) => node.type === "VIEW" && style(node).flexWrap === "nowrap" && text(node).includes("AGH University"),
		);
		expect(rows).toHaveLength(2);
		expect(rows.every((node) => text(node).includes("2023 - present") && !text(node).includes("Krakow"))).toBe(true);
	});

	it("binds background, overlay, content and Education title to Semantic CSS", async () => {
		const data = fixture();
		data.picture.fit = "contain";
		data.metadata.stylesheet = {
			mode: "semantic",
			source: {
				languageVersion: 1,
				text: `@version 1;
			template-part[name="sidebar-picture"] { object-fit: cover; object-position: 25% 70%; }
			template-part[name="sidebar-overlay"] { opacity: 0.6; }
			template-part[name="sidebar-content"] { padding-top: 73pt; }
			template-part[name="education-title"] { color: #123456; }
		`,
			},
		};
		const runtime = resolveResumeRuntime({ data, template: "dominik", mode: "semantic" });
		expect(runtime.diagnostics.filter((entry) => entry.severity === "error")).toEqual([]);
		const nodes = hosts(await renderHost(data));
		expect(style(required(nodes.find((node) => node.type === "IMAGE")))).toMatchObject({
			objectFit: "cover",
			objectPosition: "25% 70%",
		});
		expect(nodes.some((node) => style(node).opacity === 0.6)).toBe(true);
		expect(nodes.some((node) => style(node).paddingTop === 73)).toBe(true);
		expect(nodes.some((node) => style(node).color === "#123456" && text(node).includes("AGH"))).toBe(true);
		const sidebar = required(
			flatten(runtime.sourceTree).find((node) => node.kind === "region" && node.attributes.region === "sidebar"),
		);
		expect(
			flatten(sidebar)
				.filter((node) => node.kind === "section")
				.map((node) => node.id),
		).toEqual(["summary", "skills"]);
	});

	it.each(templateSchema.options)("requests filled contact icons only for Dominik: %s", async (template) => {
		iconCalls.length = 0;
		const data = fixture();
		data.metadata.layout.pages = [{ fullWidth: false, main: [], sidebar: [] }];
		await renderHost(data, template);
		expect(iconCalls.length).toBeGreaterThanOrEqual(6);
		expect(
			iconCalls.every((props) => (template === "dominik" ? props.weight === "fill" : props.weight !== "fill")),
		).toBe(true);
	});

	it("respects hideIcons", async () => {
		const data = fixture();
		data.metadata.page.hideIcons = true;
		data.metadata.page.hideSectionIcons = true;
		expect(hosts(await renderHost(data)).filter((node) => node.type === "SVG")).toHaveLength(0);
	});

	it.each(["a4", "letter"] as const)("covers full %s sidebar in actual PDF", async (format) => {
		const data = fixture();
		data.metadata.page.format = format;
		data.metadata.stylesheet = {
			mode: "semantic",
			source: { languageVersion: 1, text: '@version 1; template-part[name="sidebar-overlay"] { opacity: 0; }' },
		};
		const bytes = await renderPdf(data);
		const loading = getDocument({ data: bytes.slice(), useSystemFonts: true });
		try {
			const document = await loading.promise;
			expect(document.numPages).toBe(1);
			const firstPage = await document.getPage(1);
			const content = (await firstPage.getTextContent()).items
				.flatMap((item) => ("str" in item ? [item.str] : []))
				.join(" ");
			expect(content).toContain("Dominik Example");
			expect(content).toContain("About me");
		} finally {
			await loading.destroy();
		}
		const [page] = await rasterizePdf(bytes);
		if (!page) throw new Error("Missing rendered page");
		for (const y of [2, page.height - 3]) {
			const offset = (y * page.width + 2) * 4;
			expect(Array.from(page.data.slice(offset, offset + 3))).toEqual([255, 0, 0]);
		}
	});

	it.each([false, true])(
		"wraps long institution text without overlapping date in exported PDF (linked: %s)",
		async (linked) => {
			const data = fixture();
			required(data.sections.education.items[0]).school =
				"AGH University of Science and Technology with a long institution name";
			if (linked) required(data.sections.education.items[0]).website.url = "https://example.com/school";
			const loading = getDocument({ data: await renderPdf(data), useSystemFonts: true });
			try {
				const document = await loading.promise;
				const page = await document.getPage(1);
				const items = (await page.getTextContent()).items.flatMap((item) => ("str" in item ? [item] : []));
				const date = required(items.find((item) => item.str.includes("2023")));
				const school = required(items.find((item) => item.str.includes("AGH")));
				expect(date).toBeDefined();
				expect(school).toBeDefined();
				expect(Math.abs(date.transform[5] - school.transform[5])).toBeLessThan(2);
				for (const item of items.filter(
					(item) =>
						item !== date &&
						Math.abs(item.transform[5] - date.transform[5]) < 2 &&
						item.transform[4] >= school.transform[4] &&
						item.str.trim(),
				)) {
					expect(item.transform[4] + item.width).toBeLessThanOrEqual(date.transform[4] + 1);
				}
			} finally {
				await loading.destroy();
			}
		},
	);

	it("paints header and sidebar sections above the darkened picture", async () => {
		const data = fixture();
		const [page] = await rasterizePdf(await renderPdf(data));
		if (!page) throw new Error("Missing rendered page");
		expect(Array.from(page.data.slice((2 * page.width + 2) * 4, (2 * page.width + 2) * 4 + 3))).toEqual([166, 0, 0]);
		let whitePixels = 0;
		for (let y = 10; y < 200; y++) {
			for (let x = 10; x < page.width * 0.25; x++) {
				const offset = (y * page.width + x) * 4;
				if (page.data[offset] === 255 && page.data[offset + 1] === 255 && page.data[offset + 2] === 255) whitePixels++;
			}
		}
		expect(whitePixels).toBeGreaterThan(100);
	});

	it.each(["main", "sidebar"] as const)(
		"keeps sidebar background and header when %s content overflows",
		async (placement) => {
			const data = fixture();
			if (placement === "main") {
				data.metadata.layout.pages = [{ fullWidth: false, main: ["education", "summary"], sidebar: ["skills"] }];
			}
			data.summary.content = Array.from({ length: 55 }, (_, index) => `<p>Sidebar line ${index}</p>`).join("");
			const bytes = await renderPdf(data);
			const loading = getDocument({ data: bytes.slice(), useSystemFonts: true });
			try {
				const document = await loading.promise;
				expect(document.numPages).toBeGreaterThan(1);
				const page = await document.getPage(1);
				const content = (await page.getTextContent()).items
					.flatMap((item) => ("str" in item ? [item.str] : []))
					.join(" ");
				expect(content).toContain("Dominik Example");
				expect(content).toContain("Sidebar line 0");
			} finally {
				await loading.destroy();
			}
			const pages = await rasterizePdf(bytes);
			for (const page of pages) {
				const offset = (2 * page.width + 2) * 4;
				expect(Array.from(page.data.slice(offset, offset + 3))).toEqual([166, 0, 0]);
			}
		},
	);
});
