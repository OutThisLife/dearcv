import { Document, Page, Text, View } from "@react-pdf/renderer";
import { ResumeHeader } from "./pdf-header";
import { ResumeSectionBlock } from "./pdf-sections";
import { sheet } from "./pdf-theme";
import type { ResumeDoc } from "./schema";

/**
 * The whole page, in the order it reads. Everything about how it looks is in
 * pdf-theme, and every part that draws is beside it — what is left here is the
 * running order, which is the one thing worth seeing at a glance.
 */
export function ResumePdf({
  doc,
  onRender,
}: {
  doc: ResumeDoc;
  onRender?: (params: { blob?: Blob }) => void;
}) {
  const styles = sheet(doc);

  return (
    <Document title={`${doc.basics.name} — Resume`} onRender={onRender}>
      <Page size={doc.theme.page === "a4" ? "A4" : "LETTER"} style={styles.page}>
        {doc.theme.header === "accent-bar" ? <View style={styles.accentBar} fixed /> : null}

        <ResumeHeader doc={doc} styles={styles} />

        {doc.basics.summary ? <Text style={styles.summary}>{doc.basics.summary}</Text> : null}

        {doc.sections.map((section) => (
          <ResumeSectionBlock key={section.id} section={section} styles={styles} />
        ))}

        {doc.theme.showSignature ? (
          <Text style={styles.signature}>{doc.theme.signature || doc.basics.name}</Text>
        ) : null}
      </Page>
    </Document>
  );
}
