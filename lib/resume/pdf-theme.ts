import { Font, StyleSheet } from "@react-pdf/renderer";
import type { ResumeDoc } from "./schema";

Font.register({
  family: "Signature",
  src: "/fonts/GreatVibes-Regular.ttf",
});

/**
 * The PDF format guarantees these fourteen, so a resume can change typeface
 * without waiting on a download. Serif matters most: plenty of resumes are set
 * in one, and rendering those in Helvetica is the single biggest way a
 * carried-over document stops looking like itself.
 */
const FAMILIES = {
  sans: { body: "Helvetica", bold: "Helvetica-Bold" },
  serif: { body: "Times-Roman", bold: "Times-Bold" },
  mono: { body: "Courier", bold: "Courier-Bold" },
} as const;

const PRESETS = {
  compact: { name: 18, body: 9.5, section: 10.5, gap: 8, item: 7, page: 36 },
  normal: { name: 20, body: 10, section: 11, gap: 10, item: 9, page: 44 },
  airy: { name: 22, body: 10.5, section: 11.5, gap: 14, item: 12, page: 48 },
} as const;

export function density(doc: ResumeDoc) {
  // An upload's own sizes, measured at ingest, beat any preset guess.
  return { ...(PRESETS[doc.theme.density] ?? PRESETS.normal), ...doc.theme.metrics };
}

/**
 * Every measurement on the page, resolved once per draw. Handed down rather
 * than recomputed, so the geometry the marks are read from and the geometry
 * the paper is set in cannot drift apart.
 */
export function sheet(doc: ResumeDoc) {
  const d = density(doc);
  const face = FAMILIES[doc.theme.font] ?? FAMILIES.sans;

  return StyleSheet.create({
    page: {
      backgroundColor: doc.theme.background,
      color: doc.theme.text,
      fontFamily: face.body,
      fontSize: d.body,
      lineHeight: 1.35,
      paddingTop: d.page,
      paddingBottom: d.page,
      paddingLeft: doc.theme.header === "accent-bar" ? d.page + 10 : d.page,
      paddingRight: d.page,
    },
    accentBar: {
      position: "absolute",
      top: 0,
      left: 0,
      bottom: 0,
      width: 8,
      backgroundColor: doc.theme.accent,
    },
    name: {
      fontFamily: face.bold,
      fontSize: d.name,
      letterSpacing: 0.2,
    },
    headline: {
      color: doc.theme.muted,
      fontSize: d.body,
      marginTop: 3,
    },
    contact: {
      color: doc.theme.muted,
      fontSize: d.body - 0.5,
      marginTop: 6,
    },
    sectionTitle: {
      fontFamily: face.bold,
      fontSize: d.section,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      marginTop: d.gap + 4,
      marginBottom: 5,
      paddingBottom: 3,
      borderBottomWidth: 0.6,
      borderBottomColor: doc.theme.accent,
      color: doc.theme.text,
    },
    itemHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12,
    },
    org: {
      fontFamily: face.bold,
    },
    muted: {
      color: doc.theme.muted,
    },
    title: {
      marginTop: 1,
    },
    bullet: {
      flexDirection: "row",
      gap: 6,
      marginTop: 2,
      paddingLeft: 2,
    },
    bulletDot: {
      width: 8,
      fontSize: d.body,
    },
    bulletText: {
      flex: 1,
    },
    item: {
      marginBottom: d.item,
    },
    summary: {
      marginTop: d.gap,
    },
    signature: {
      fontFamily: "Signature",
      fontSize: 22,
      marginTop: 18,
      color: doc.theme.accent,
    },
    listRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 3,
    },
  });
}

/**
 * The real key list, rather than the open record `StyleSheet.create` is typed
 * to return. Naming a style that does not exist was silently undefined before.
 */
export type Sheet = ReturnType<typeof sheet>;
