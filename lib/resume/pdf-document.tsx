import { Document, Font, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { boxIds } from "./pdf-boxes";
import type { ResumeDoc, ResumeItem, ResumeSection } from "./schema";

Font.register({
  family: "Signature",
  src: "/fonts/GreatVibes-Regular.ttf",
});

function density(doc: ResumeDoc) {
  if (doc.theme.density === "compact") {
    return { name: 18, body: 9.5, section: 10.5, gap: 8, item: 7, page: 36 };
  }
  if (doc.theme.density === "airy") {
    return { name: 22, body: 10.5, section: 11.5, gap: 14, item: 12, page: 48 };
  }
  return { name: 20, body: 10, section: 11, gap: 10, item: 9, page: 44 };
}

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

export function ResumePdf({
  doc,
  onRender,
}: {
  doc: ResumeDoc;
  onRender?: (params: { blob?: Blob }) => void;
}) {
  const d = density(doc);
  const styles = StyleSheet.create({
    page: {
      backgroundColor: doc.theme.background,
      color: doc.theme.text,
      fontFamily: "Helvetica",
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
      fontFamily: "Helvetica-Bold",
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
      fontFamily: "Helvetica-Bold",
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
      fontFamily: "Helvetica-Bold",
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

  const contact = [
    doc.basics.email,
    doc.basics.phone,
    doc.basics.location,
    ...doc.basics.links.map((link) => link.label),
  ].filter((value): value is string => Boolean(value));

  return (
    <Document title={`${doc.basics.name} — Resume`} onRender={onRender}>
      <Page size={doc.theme.page === "a4" ? "A4" : "LETTER"} style={styles.page}>
        {doc.theme.header === "accent-bar" ? <View style={styles.accentBar} fixed /> : null}

        <Header doc={doc} styles={styles} contact={contact} />

        {doc.basics.summary ? <Text style={styles.summary}>{doc.basics.summary}</Text> : null}

        {doc.sections.map((section) => (
          <Section key={section.id} section={section} styles={styles} />
        ))}

        {doc.theme.showSignature ? (
          <Text style={styles.signature}>{doc.theme.signature || doc.basics.name}</Text>
        ) : null}
      </Page>
    </Document>
  );
}

function Header({
  doc,
  styles,
  contact,
}: {
  doc: ResumeDoc;
  styles: ReturnType<typeof StyleSheet.create>;
  contact: string[];
}) {
  const contactLine = (
    <Text style={styles.contact}>
      {contact.map((part, i) => {
        const link = doc.basics.links.find((item) => item.label === part);
        return (
          <Text key={`${part}-${i}`}>
            {i > 0 ? "  ·  " : ""}
            {link ? (
              <Link src={link.href} style={{ color: doc.theme.muted }}>
                {part}
              </Link>
            ) : part === doc.basics.email ? (
              <Link src={`mailto:${part}`} style={{ color: doc.theme.muted }}>
                {part}
              </Link>
            ) : (
              part
            )}
          </Text>
        );
      })}
    </Text>
  );

  if (doc.theme.header === "split") {
    return (
      <View
        id={boxIds.basics}
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{doc.basics.name}</Text>
          {doc.basics.headline ? <Text style={styles.headline}>{doc.basics.headline}</Text> : null}
        </View>
        <View style={{ maxWidth: "46%", alignItems: "flex-end" }}>{contactLine}</View>
      </View>
    );
  }

  if (doc.theme.header === "signature") {
    return (
      <View id={boxIds.basics}>
        <Text style={styles.signature}>{doc.theme.signature || doc.basics.name}</Text>
        <Text style={styles.name}>{doc.basics.name}</Text>
        {doc.basics.headline ? <Text style={styles.headline}>{doc.basics.headline}</Text> : null}
        {contactLine}
      </View>
    );
  }

  return (
    <View id={boxIds.basics} style={{ alignItems: "center" }}>
      <Text style={styles.name}>{doc.basics.name}</Text>
      {doc.basics.headline ? <Text style={styles.headline}>{doc.basics.headline}</Text> : null}
      {contactLine}
    </View>
  );
}

function Section({
  section,
  styles,
}: {
  section: ResumeSection;
  styles: ReturnType<typeof StyleSheet.create>;
}) {
  return (
    <View id={boxIds.section(section.id)}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      {section.kind === "skills" || section.lines?.length ? (
        <View>
          {(section.lines ?? []).map((line) => (
            <Text key={line} style={{ marginBottom: 2 }}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      {section.kind === "list"
        ? section.items.map((item) => (
            <View key={item.id} id={boxIds.item(item.id)} style={styles.listRow}>
              <Text>
                <Text style={styles.org}>{item.title}</Text>
                {item.href ? <Text style={styles.muted}>{`  ${hrefLabel(item)}`}</Text> : null}
              </Text>
              <Text style={styles.muted}>{dates(item)}</Text>
            </View>
          ))
        : section.items.map((item) => <Item key={item.id} item={item} styles={styles} />)}
    </View>
  );
}

function Item({
  item,
  styles,
}: {
  item: ResumeItem;
  styles: ReturnType<typeof StyleSheet.create>;
}) {
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
