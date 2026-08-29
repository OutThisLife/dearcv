import { Editor } from "@/components/editor";

/**
 * A new thread. It gets its id in the browser rather than here, so this render
 * is the same for everyone and the server never holds a half-built thread.
 */
export default function Home() {
  return <Editor seed={{}} />;
}
