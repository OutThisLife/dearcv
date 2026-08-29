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

function dates(item: ResumeItem) {
  if (!item.start && !item.end) return "";
  return [item.start, item.end ?? "Present"].filter(Boolean).join(" – ");
}

/** A job, a degree, a project: a heading, a date range, and bullets. */
function Entry({ item, styles }: { item: ResumeItem; styles: Sheet }) {
  const host = hrefLabel(item);

  return (
    <View id={boxIds.item(item.id)} style={styles.item} wrap={false}>
      <View style={styles.itemHead}>
        <Text>
          <Text style={styles.org}>{item.org || item.title}</Text>
          {host ? <Text style={styles.muted}>{`, ${host}`}</Text> : null}
        </Text>
        <Text style={styles.muted}>{dates(item)}</Text>
      </View>
      {item.org && item.title ? <Text style={styles.title}>{item.title}</Text> : null}
      {item.bullets.map((bullet) => (
        <View key={bullet} style={styles.bullet}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{bullet}</Text>
        </View>
      ))}
    </View>
  );
}

/** One line each, title and dates on the same row: talks, awards, publications. */
function Row({ item, styles }: { item: ResumeItem; styles: Sheet }) {
  return (
    <View id={boxIds.item(item.id)} style={styles.listRow}>
      <Text>
        <Text style={styles.org}>{item.title}</Text>
        {item.href ? <Text style={styles.muted}>{`  ${hrefLabel(item)}`}</Text> : null}
      </Text>
      <Text style={styles.muted}>{dates(item)}</Text>
    </View>
  );
}

export function ResumeSectionBlock({ section, styles }: { section: ResumeSection; styles: Sheet }) {
  // Skills are prose lines rather than dated entries, and a section may carry
  // both — a heading of loose lines followed by items.
  const lines = section.kind === "skills" || section.lines?.length ? (section.lines ?? []) : [];
  const Body = section.kind === "list" ? Row : Entry;

  return (
    <View id={boxIds.section(section.id)}>
      <Text style={styles.sectionTitle}>{section.title}</Text>

      {lines.length ? (
        <View>
          {lines.map((line) => (
            <Text key={line} style={{ marginBottom: 2 }}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      {section.items.map((item) => (
        <Body key={item.id} item={item} styles={styles} />
      ))}
    </View>
  );
}
