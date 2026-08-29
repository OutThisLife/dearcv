import { Link, Text, View } from "@react-pdf/renderer";
import { boxIds } from "./pdf-boxes";
import type { Sheet } from "./pdf-theme";
import type { ResumeDoc, ResumeTheme } from "./schema";

type HeaderProps = { doc: ResumeDoc; styles: Sheet };

/**
 * Email and links stay clickable, the rest is plain. Built once and placed by
 * whichever header is in use, because the difference between the three is
 * where this sits, not what it says.
 */
function ContactLine({ doc, styles }: HeaderProps) {
  const parts = [
    doc.basics.email,
    doc.basics.phone,
    doc.basics.location,
    ...doc.basics.links.map((link) => link.label),
  ].filter((value): value is string => Boolean(value));

  return (
    <Text style={styles.contact}>
      {parts.map((part, i) => {
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
}

function Named({ doc, styles }: HeaderProps) {
  return (
    <>
      <Text style={styles.name}>{doc.basics.name}</Text>
      {doc.basics.headline ? <Text style={styles.headline}>{doc.basics.headline}</Text> : null}
    </>
  );
}

/** Name left, contact right. */
function SplitHeader({ doc, styles }: HeaderProps) {
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
        <Named doc={doc} styles={styles} />
      </View>
      <View style={{ maxWidth: "46%", alignItems: "flex-end" }}>
        <ContactLine doc={doc} styles={styles} />
      </View>
    </View>
  );
}

/** Handwriting above the printed name. */
function SignatureHeader({ doc, styles }: HeaderProps) {
  return (
    <View id={boxIds.basics}>
      <Text style={styles.signature}>{doc.theme.signature || doc.basics.name}</Text>
      <Named doc={doc} styles={styles} />
      <ContactLine doc={doc} styles={styles} />
    </View>
  );
}

/** Everything stacked and centred. */
function CenteredHeader({ doc, styles }: HeaderProps) {
  return (
    <View id={boxIds.basics} style={{ alignItems: "center" }}>
      <Named doc={doc} styles={styles} />
      <ContactLine doc={doc} styles={styles} />
    </View>
  );
}

/**
 * Which header each look uses. A map rather than a chain of conditions, so the
 * one thing worth knowing here is stated outright: accent-bar is a stripe down
 * the page, not a header of its own, and wears the centred one.
 */
const HEADERS: Record<ResumeTheme["header"], (props: HeaderProps) => React.ReactElement> = {
  split: SplitHeader,
  signature: SignatureHeader,
  centered: CenteredHeader,
  "accent-bar": CenteredHeader,
};

export function ResumeHeader({ doc, styles }: HeaderProps) {
  const Header = HEADERS[doc.theme.header] ?? CenteredHeader;
  return <Header doc={doc} styles={styles} />;
}
