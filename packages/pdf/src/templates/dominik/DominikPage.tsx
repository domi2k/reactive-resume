import type { Style } from "@react-pdf/types";
import type { TemplatePageProps } from "../../document";
import type { TemplateColorRoles, TemplateFeatures, TemplateStyleContext, TemplateStyleSlots } from "../shared/types";
import { useMemo } from "react";
import { rgbaStringToHex } from "@reactive-resume/utils/color";
import { Image, Page, StyleSheet, View } from "#react-pdf-renderer";
import { useRender } from "../../context";
import { useRenderedSectionIds, useResolvedNode, useSemanticNodeVisible } from "../../semantic/context";
import { semanticNodeKeys } from "../../semantic/node-keys";
import { createBaseTemplateStyles } from "../shared/base-template-styles";
import {
	CustomFieldContactItem,
	EmailContactItem,
	LocationContactItem,
	PhoneContactItem,
	WebsiteContactItem,
} from "../shared/contact-item";
import { TemplateProvider } from "../shared/context";
import { filterSections } from "../shared/filtering";
import { getTemplateMetrics } from "../shared/metrics";
import { hasTemplatePicture } from "../shared/picture";
import {
	Heading,
	SemanticContactListView,
	SemanticHeaderView,
	SemanticRegionView,
	SemanticTemplatePartView,
	semanticTemplatePartNodeKey,
	Text,
} from "../shared/primitives";
import { createRtlStyleHelpers } from "../shared/rtl";
import { Section } from "../shared/sections";
import { composeStyles, headerNameLineHeight, resolvePlacementColor } from "../shared/styles";

type DominikStyles = Omit<TemplateStyleSlots, "page"> & {
	page: Style;
	sidebarColumn: Style;
	sidebarContent: Style;
	mainColumn: Style;
	mainContent: Style;
	header: Style;
	headerTitle: Style;
	headerIdentity: Style;
	headerName: Style;
	headerText: Style;
	contactList: Style;
	contactItem: Style;
};

type DominikTemplate = {
	colors: TemplateColorRoles;
	styles: DominikStyles;
};

type DominikHeaderProps = {
	styles: DominikStyles;
	colors: TemplateColorRoles;
};

const dominikFeatures = {
	skillLevelAfterName: true,
	educationPeriodInHeader: true,
	skillKeywordsAsList: true,
	positionFirstExperienceHeader: true,
	inlineWebsiteIcon: true,
} satisfies TemplateFeatures;

export const DominikPage = ({ page, pageSize, pageMinHeightStyle, showHeader, pageNumber }: TemplatePageProps) => {
	const data = useRender();
	const pageNodeKey = semanticNodeKeys.page(pageNumber);
	const { style: semanticPageStyle, size: semanticPageSize, ...semanticPageProps } = useResolvedNode(pageNodeKey);
	const { metadata } = data;
	const { colors, styles } = useDominikTemplate();
	const metrics = getTemplateMetrics(metadata.page);
	const showSidebar = !page.fullWidth || showHeader;
	const sidebarSections = useRenderedSectionIds(pageNodeKey, filterSections(page.sidebar, data));
	const mainSections = useRenderedSectionIds(pageNodeKey, filterSections(page.main, data));
	const sidebarNodeKey = semanticNodeKeys.region(pageNodeKey, "sidebar");

	return (
		<Page
			{...semanticPageProps}
			size={semanticPageSize ?? pageSize}
			style={composeStyles(styles.page, pageMinHeightStyle, semanticPageStyle)}
		>
			<TemplateProvider pageNodeKey={pageNodeKey} styles={styles} colors={colors} features={dominikFeatures}>
				{showSidebar && (
					<SemanticRegionView
						region="sidebar"
						style={composeStyles(styles.sidebarColumn, {
							width: `${metadata.layout.sidebarWidth}%`,
						})}
					>
						<SidebarPicture ownerNodeKey={sidebarNodeKey} />
						{showHeader && <Header styles={styles} colors={colors} />}

						{!page.fullWidth && (
							<SemanticTemplatePartView
								ownerNodeKey={sidebarNodeKey}
								partKeys={["sidebar-content"]}
								style={styles.sidebarContent}
							>
								{sidebarSections.map((section) => (
									<Section key={section} section={section} placement="sidebar" />
								))}
							</SemanticTemplatePartView>
						)}
					</SemanticRegionView>
				)}

				<View style={styles.mainColumn}>
					<SemanticRegionView region="main" style={composeStyles(styles.mainContent, { rowGap: metrics.sectionGap })}>
						{mainSections.map((section) => (
							<Section key={section} section={section} placement="main" />
						))}
					</SemanticRegionView>
				</View>
			</TemplateProvider>
		</Page>
	);
};

const backgroundLayer = { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" } satisfies Style;

type SidebarPictureProps = { ownerNodeKey: string };

const SidebarPicture = ({ ownerNodeKey }: SidebarPictureProps) => {
	const { picture } = useRender();
	const nodeKey = semanticTemplatePartNodeKey(ownerNodeKey, "sidebar-picture");
	const resolved = useResolvedNode(nodeKey);
	const visible = useSemanticNodeVisible(nodeKey);
	if (!hasTemplatePicture(picture)) return null;

	// Fixed layers repeat on overflow pages without an oversized image pushing content to the next page.
	return (
		<>
			{visible && (
				<Image
					fixed
					src={picture.originalPdfUrl || picture.originalUrl || picture.url}
					style={composeStyles(backgroundLayer, { objectFit: picture.fit ?? "cover" }, resolved.style)}
				/>
			)}
			<SemanticTemplatePartView
				fixed
				ownerNodeKey={ownerNodeKey}
				partKeys={["sidebar-overlay"]}
				style={{ ...backgroundLayer, backgroundColor: "#000000", opacity: 0.35 }}
			/>
		</>
	);
};

const Header = ({ styles, colors }: DominikHeaderProps) => {
	const { basics } = useRender();

	return (
		<SemanticHeaderView style={styles.header}>
			<View style={styles.headerTitle}>
				<View style={styles.headerIdentity}>
					<Heading style={styles.headerName}>{basics.name}</Heading>
					<Text style={styles.headerText}>{basics.headline}</Text>
				</View>
			</View>

			<SemanticContactListView style={styles.contactList}>
				<EmailContactItem
					email={basics.email}
					style={styles.contactItem}
					textStyle={styles.headerText}
					iconColor={colors.background}
					iconWeight="fill"
				/>
				<PhoneContactItem
					phone={basics.phone}
					style={styles.contactItem}
					textStyle={styles.headerText}
					iconColor={colors.background}
					iconWeight="fill"
				/>
				<LocationContactItem
					location={basics.location}
					style={styles.contactItem}
					textStyle={styles.headerText}
					iconColor={colors.background}
					iconWeight="fill"
				/>
				<WebsiteContactItem
					website={basics.website}
					style={styles.contactItem}
					textStyle={styles.headerText}
					iconColor={colors.background}
					iconWeight="fill"
				/>
				{basics.customFields.map((field) => (
					<CustomFieldContactItem
						key={field.id}
						field={field}
						style={styles.contactItem}
						textStyle={styles.headerText}
						iconColor={colors.background}
						iconWeight="fill"
					/>
				))}
			</SemanticContactListView>
		</SemanticHeaderView>
	);
};

const useDominikTemplate = (): DominikTemplate => {
	const { picture, metadata, rtl } = useRender();

	return useMemo(() => {
		const r = createRtlStyleHelpers(rtl);
		const foreground = rgbaStringToHex(metadata.design.colors.text);
		const background = rgbaStringToHex(metadata.design.colors.background);
		const primary = rgbaStringToHex(metadata.design.colors.primary);
		const colors: TemplateColorRoles = {
			foreground,
			background,
			primary,
			sidebarForeground: background,
			sidebarBackground: primary,
		};
		const metrics = getTemplateMetrics(metadata.page);

		const base = createBaseTemplateStyles({ metadata, foreground, background, r, metrics, picture });

		const baseStyles = StyleSheet.create({
			...base,
			page: {
				...base.page,
				flexDirection: r.row,
			},
			section: {
				flexDirection: "column",
				rowGap: metrics.gapY(0.25),
			},
			sectionHeading: {
				fontSize: metadata.typography.heading.fontSize * 0.9,
				color: primary,
				borderBottomWidth: 1,
				borderBottomColor: primary,
				paddingBottom: metrics.gapY(0.125),
			},
			item: {
				rowGap: metrics.gapY(0.125),
			},
			levelContainer: {
				width: "70%",
			},
			levelItem: {
				borderColor: primary,
			},
			levelItemActive: {
				backgroundColor: primary,
			},
			sidebarColumn: {
				flexShrink: 0,
				backgroundColor: primary,
			},
			sidebarContent: {
				paddingHorizontal: metrics.page.paddingHorizontal,
				paddingTop: metrics.page.paddingVertical,
				paddingBottom: metrics.page.paddingVertical,
				rowGap: metrics.sectionGap,
			},
			mainColumn: {
				flex: 1,
			},
			mainContent: {
				paddingHorizontal: metrics.page.paddingHorizontal,
				paddingTop: metrics.page.paddingVertical,
				paddingBottom: metrics.page.paddingVertical,
			},
			header: {
				color: background,
				paddingHorizontal: metrics.page.paddingHorizontal,
				paddingVertical: metrics.page.paddingVertical,
				rowGap: metrics.gapY(0.5),
			},
			headerTitle: {},
			headerIdentity: {
				...r.headerIdentity,
				rowGap: metrics.gapY(0.35),
			},
			headerName: {
				fontSize: metadata.typography.heading.fontSize * 1.5,
				color: background,
				lineHeight: headerNameLineHeight,
			},
			headerText: {
				color: background,
			},
			contactList: {
				rowGap: metrics.gapY(0.25),
			},
			contactItem: {
				flexDirection: r.row,
				alignItems: "center",
				columnGap: metrics.gapX(1 / 6),
			},
		});

		const foregroundFor = ({ placement, colors }: TemplateStyleContext) =>
			resolvePlacementColor({
				placement,
				defaultForeground: colors.foreground,
				sidebarForeground: colors.sidebarForeground,
			});

		const accentFor = ({ placement, colors }: TemplateStyleContext) =>
			placement === "sidebar" ? colors.background : colors.primary;

		return {
			colors,
			styles: {
				...baseStyles,
				text: (context) => ({ ...baseStyles.text, color: foregroundFor(context) }),
				heading: (context) => ({ ...baseStyles.heading, color: foregroundFor(context) }),
				link: (context) => ({ ...baseStyles.link, color: foregroundFor(context) }),
				richParagraph: (context) => ({ ...baseStyles.richParagraph, color: foregroundFor(context) }),
				richListItemMarker: (context) => ({ ...baseStyles.richListItemMarker, color: foregroundFor(context) }),
				richListItemContent: (context) => ({ ...baseStyles.richListItemContent, color: foregroundFor(context) }),
				splitRow: (context) => ({
					...baseStyles.splitRow,
					...(context.placement === "sidebar"
						? { flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-start" }
						: {}),
				}),
				alignEnd: (context) => ({
					...baseStyles.alignEnd,
					...(context.placement === "sidebar" ? { textAlign: "left" } : {}),
				}),
				sectionHeading: (context) => ({
					...baseStyles.sectionHeading,
					color: accentFor(context),
					borderBottomColor: accentFor(context),
				}),
				levelItem: (context) => ({ borderColor: accentFor(context) }),
				levelItemActive: (context) => ({ backgroundColor: accentFor(context) }),
				icon: (context) => ({
					display: metadata.page.hideIcons ? "none" : "flex",
					size: metadata.typography.body.fontSize,
					color: context.placement === "sidebar" ? background : primary,
				}),
			} satisfies DominikStyles,
		};
	}, [picture, metadata, rtl]);
};
