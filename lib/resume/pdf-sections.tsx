import { Text, View } from "@react-pdf/renderer";
import { boxIds } from "./pdf-boxes";
import type { Sheet } from "./pdf-theme";
import type { ResumeItem, ResumeSection } from "./schema";

/** The host, for a link that would be too long to print in full. */
function hrefLabel(item: ResumeItem) {
  if (!item.href) return "";

  try {
    return new URL(item.href).host.replace(/^www\./, "");
  } catch {
    return item.href.replace(/^https?:\/\//, "");
  }
}

function dates(item: ResumeItem, separator: string) {
  if (!item.start && !item.end) return "";
  return [item.start, item.end ?? "Present"].filter(Boolean).join(separator);
}

/** `gap` is the space above the entry, from whatever came before it. */
type EntryProps = { item: ResumeItem; styles: Sheet; gap: number };

/**
 * The company, then its domain or location, run together the way the original
 * ran them — down to whether the comma between went with the company's weight.
 */
function OrgLine({
  item,
  styles,
  compact = false,
}: {
  item: ResumeItem;
  styles: Sheet;
  compact?: boolean;
}) {
  const { orgSeparator, separatorWithOrg } = styles.typeset;
  const trailer = [hrefLabel(item), item.location].filter(Boolean).join(orgSeparator);
  const [org, meta] = compact ? [styles.rowOrg, styles.rowMeta] : [styles.org, styles.trailer];
  const mark = separatorWithOrg ? orgSeparator.trimEnd() : "";

  return (
    <Text>
      <Text style={org}>{`${item.org || item.title}${trailer ? mark : ""}`}</Text>
      {trailer ? <Text style={meta}>{`${orgSeparator.slice(mark.length)}${trailer}`}</Text> : null}
    </Text>
  );
}

/**
 * The line an entry opens with, dates on it. Whether the company or the role
 * leads, and whether the dates sit flush right or run on after it, is the
 * original's call.
 */
function Head({ item, styles }: { item: ResumeItem; styles: Sheet }) {
  const { lead, dates: layout } = styles.typeset;
  const when = dates(item, layout.separator);
  const titleLeads = lead === "title" && Boolean(item.org && item.title);

  return (
    <View style={styles.itemHead}>
      {titleLeads ? (
        <Text style={styles.title}>{item.title}</Text>
      ) : (
        <OrgLine item={item} styles={styles} />
      )}
      {when ? <Text style={styles.meta}>{when}</Text> : null}
    </View>
  );
}

function Bullets({ bullets, styles }: { bullets: string[]; styles: Sheet }) {
  if (!bullets.length) return null;
  const drawn = styles.typeset.bullet.glyph !== "none";

  return (
    <View style={styles.bullets}>
      {bullets.map((bullet, i) => (
        <View key={`${i}-${bullet}`} style={i ? [styles.bullet, styles.nextBullet] : styles.bullet}>
          {/* Drawn rather than typed, so the glyph is the same whatever the face has in it. */}
          <View style={styles.bulletGutter}>
            {drawn ? <View style={styles.bulletGlyph} /> : null}
          </View>
          <Text style={styles.bulletText}>{bullet}</Text>
        </View>
      ))}
    </View>
  );
}

/** A job, a degree, a project: a heading, a date range, and bullets. */
function Entry({ item, styles, gap }: EntryProps) {
  const both = Boolean(item.org && item.title);
  const titleLeads = styles.typeset.lead === "title";

  return (
    <View
      id={boxIds.item(item.id)}
      style={{ marginTop: gap }}
      wrap={false}
      break={styles.typeset.breaks.includes(item.id)}
    >
      <Head item={item} styles={styles} />
      {both ? (
        <View style={styles.subline}>
          {titleLeads ? (
            <OrgLine item={item} styles={styles} />
          ) : (
            <Text style={styles.title}>{item.title}</Text>
          )}
        </View>
      ) : null}
      <Bullets bullets={item.bullets} styles={styles} />
    </View>
  );
}

/**
 * One line each, name and dates on the same row: talks, awards, publications,
 * and the older jobs a resume lists without detail.
 */
function Row({ item, styles, gap }: EntryProps) {
  const when = dates(item, styles.typeset.dates.separator);

  return (
    <View
      id={boxIds.item(item.id)}
      style={[styles.listRow, { marginTop: gap }]}
      break={styles.typeset.breaks.includes(item.id)}
    >
      <OrgLine item={item} styles={styles} compact />
      {when ? <Text style={styles.rowMeta}>{when}</Text> : null}
    </View>
  );
}

/** Nothing under it: no bullets, and no second line for a role. */
const isRow = (section: ResumeSection, item: ResumeItem) =>
  section.kind === "list" || (!item.bullets.length && !(item.org && item.title));

export function ResumeSectionBlock({
  section,
  styles,
  first,
}: {
  section: ResumeSection;
  styles: Sheet;
  first: boolean;
}) {
  // Skills are prose lines rather than dated entries, and a section may carry
  // both — a heading of loose lines followed by items.
  const lines = section.kind === "skills" || section.lines?.length ? (section.lines ?? []) : [];
  const { before } = styles;

  return (
    <View id={boxIds.section(section.id)} break={styles.typeset.breaks.includes(section.id)}>
      {/* Kept with what follows it, so a heading never ends a page on its own. */}
      <Text
        style={first ? [styles.sectionTitle, styles.firstSectionTitle] : styles.sectionTitle}
        minPresenceAhead={48}
      >
        {section.title}
      </Text>

      {lines.map((line, i) => (
        <Text key={`${i}-${line}`} style={[styles.line, { marginTop: i ? before.line : 0 }]}>
          {line}
        </Text>
      ))}

      {section.items.map((item, i) => {
        const row = isRow(section, item);
        const prev = section.items[i - 1];
        const gap = prev
          ? row && isRow(section, prev)
            ? before.row
            : before.item
          : lines.length
            ? before.item
            : 0;
        const Body = row ? Row : Entry;
        return <Body key={item.id} item={item} styles={styles} gap={gap} />;
      })}
    </View>
  );
}
