import type { TemplateSemanticManifest } from "../../semantic/template-manifest";
import { itemHeaderRowPart } from "../../semantic/shared-parts";

export const dominikSemanticManifest = {
	template: "dominik",
	skillLevelAfterName: true,
	educationPeriodInHeader: true,
	regions: [
		{ name: "header", placement: "sidebar", origins: [] },
		{ name: "sidebar", placement: "sidebar", origins: ["sidebar"] },
		{ name: "main", placement: "main", origins: ["main"] },
	],
	header: { region: "header", placement: "sidebar", picture: false },
	specialSummary: null,
	parts: [
		itemHeaderRowPart,
		{
			name: "education-header-row",
			key: "education-header-row",
			owner: { kind: "item-header", key: "item-header", sectionTypes: ["education"] },
			binding: { type: "primitive", primitive: "View", source: "existing" },
			route: {
				parent: "owner",
				at: "start",
				take: [
					{ kind: "field", name: "school", sectionTypes: ["education"] },
					{ kind: "field", name: "area", sectionTypes: ["education"] },
					{ kind: "field", name: "degree", sectionTypes: ["education"] },
					{ kind: "field", name: "period", sectionTypes: ["education"] },
					{ kind: "link", sectionTypes: ["education"] },
				],
			},
		},
		{
			name: "education-title",
			key: "education-title",
			owner: { kind: "item-header", key: "item-header", sectionTypes: ["education"] },
			binding: { type: "primitive", primitive: "Text", source: "existing" },
			route: {
				parent: "education-header-row",
				at: "start",
				take: [
					{ kind: "field", name: "school" },
					{ kind: "field", name: "area" },
					{ kind: "field", name: "degree" },
					{ kind: "link" },
				],
			},
		},
		{
			name: "sidebar-picture",
			key: "sidebar-picture",
			owner: { kind: "region", key: "sidebar" },
			binding: { type: "primitive", primitive: "Image", source: "existing" },
			route: { parent: "owner", at: "start" },
		},
		{
			name: "sidebar-overlay",
			key: "sidebar-overlay",
			owner: { kind: "region", key: "sidebar" },
			binding: { type: "primitive", primitive: "View", source: "existing" },
			route: { parent: "owner", at: "start" },
		},
		{
			name: "sidebar-content",
			key: "sidebar-content",
			owner: { kind: "region", key: "sidebar" },
			binding: { type: "primitive", primitive: "View", source: "existing" },
			route: { parent: "owner", at: "end", take: [{ kind: "section" }] },
		},
	],
} as const satisfies TemplateSemanticManifest;
