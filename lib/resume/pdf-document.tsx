import { Document, Page, Text, View } from "@react-pdf/renderer";
import { type ArtFiles, PageArt } from "./pdf-art";
import { PAGE_SIZE } from "./art";
import { ResumeHeader } from "./pdf-header";
import { ResumeSectionBlock } from "./pdf-sections";
import { sheet } from "./pdf-theme";
import { isEmptyResume, type ResumeDoc } from "./schema";

/**
 * The whole page, in the order it reads. Everything about how it looks is in
 * pdf-theme, and every part that draws is beside it — what is left here is the
 * running order, which is the one thing worth seeing at a glance.
 *
 * Art on a page sits in two layers, one under the text and one over it; art
 * pinned to a part of the resume is drawn inside that part, which carries it.
 */
export function ResumePdf({
  doc,
  files = {},
  onRender,
}: {
  doc: ResumeDoc;
  /** The pictures the art shows, by the asset id or URL it names them with. */
  files?: ArtFiles;
  onRender?: (params: { blob?: Blob }) => void;
}) {
  const styles = sheet(doc);
  // An empty heading is a placeholder, not content: it is kept only on the
  // blank page, where it shows what goes where.
  const blank = isEmptyResume(doc);
  const sections = doc.sections.filter(
    (section) => blank || section.items.length || section.lines?.length,
  );
  const art = {
    pieces: doc.art ?? [],
    files,
    accent: doc.theme.accent,
    pageHeight: (PAGE_SIZE[doc.theme.page] ?? PAGE_SIZE.letter).height,
  };

  return (
    <Document title={`${doc.basics.name} — Resume`} onRender={onRender}>
      <Page size={doc.theme.page === "a4" ? "A4" : "LETTER"} style={styles.page}>
        {doc.theme.header === "accent-bar" ? <View style={styles.accentBar} fixed /> : null}
        <PageArt art={art} layer="behind" />

        <ResumeHeader doc={doc} styles={styles} art={art} />

        {doc.basics.summary ? <Text style={styles.summary}>{doc.basics.summary}</Text> : null}

        {sections.map((section, i) => (
          <ResumeSectionBlock
            key={section.id}
            section={section}
            styles={styles}
            first={i === 0 && !doc.basics.summary}
            art={art}
          />
        ))}

        {doc.theme.showSignature ? (
          <Text style={styles.signature}>{doc.theme.signature || doc.basics.name}</Text>
        ) : null}

        <PageArt art={art} layer="front" />
      </Page>
    </Document>
  );
}

export type { ArtFiles };
