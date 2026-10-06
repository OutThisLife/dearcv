import { generateImage, type ImageModel, tool } from "ai";
import { z } from "zod";
import { ASSET } from "@/lib/resume/art";

type ProviderOptions = NonNullable<Parameters<typeof generateImage>[0]["providerOptions"]>;

/**
 * A picture made to order, on their own key: an illustration, a painted
 * background, a portrait in a style. The bytes ride back to the browser once,
 * in the call's result, which keeps them under the asset id and stores them
 * with the thread; the model gets the id to place and a look at what it made.
 * The bytes are dropped from every later request and from what is saved
 * (`withoutPictures`), so they are never sent twice.
 */

export type ImageMaker = (transparent: boolean) => {
  model: ImageModel;
  providerOptions?: ProviderOptions;
  /** For an API that takes a pixel size rather than a shape (OpenAI's). */
  sizeOf?: (aspect: string) => `${number}x${number}`;
};

const RATIOS = ["1:1", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9"] as const;

/** A PNG's size, from its header. */
function pngSize(base64: string) {
  const head = Buffer.from(base64.slice(0, 44), "base64");
  if (head.length < 24 || head.readUInt32BE(12) !== 0x49484452) return null;
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

type Made =
  | { ok: true; asset: string; mediaType: string; aspect: string; note: string; data?: string }
  | { ok: false; error: string };

export function generateImageTool(make: ImageMaker | null) {
  return tool({
    description:
      "Make a new picture with an image model: a custom illustration, a painted or textured background, a stylised portrait. Slow (10–40s) and paid for by them, so use it when nothing find_images has will do and they want something original. Returns an asset id to place with place_art, and shows you the picture.",
    inputSchema: z.object({
      prompt: z
        .string()
        .describe(
          "What to draw, in detail: subject, style, palette (name the resume's colours), composition. No words in the picture unless they asked — image models misspell.",
        ),
      aspect: z.enum(RATIOS).default("1:1").describe("Width:height. Match the box it will go in."),
      transparent: z
        .boolean()
        .default(true)
        .describe(
          "A see-through background, for a sticker or illustration that sits on the page. False for a full-bleed background or a photo.",
        ),
    }),
    execute: async ({ prompt, aspect, transparent }, { abortSignal }): Promise<Made> => {
      if (!make) {
        return {
          ok: false,
          error:
            "This connection can't make pictures. Find one with find_images or draw it as SVG instead, and tell them an OpenAI or OpenRouter key would let you paint one.",
        };
      }
      try {
        const { model, providerOptions, sizeOf } = make(transparent);
        const { image } = await generateImage({
          model,
          prompt,
          ...(sizeOf ? { size: sizeOf(aspect) } : { aspectRatio: aspect }),
          providerOptions,
          abortSignal,
        });
        const mediaType = /^image\/(png|jpeg)$/.test(image.mediaType ?? "")
          ? image.mediaType
          : "image/png";
        // What it actually drew, which isn't always the shape asked for.
        const size = pngSize(image.base64);
        const ratio = size
          ? size.height / size.width
          : (() => {
              const [w, h] = aspect.split(":").map(Number);
              return h! / w!;
            })();
        return {
          ok: true,
          asset: `${ASSET}${crypto.randomUUID()}`,
          mediaType,
          aspect: size ? `${size.width}×${size.height}` : aspect,
          note: `Put the asset id in a piece's image. Keep its shape: height = width × ${ratio.toFixed(3)}.`,
          data: image.base64,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, error: `The image model turned that down: ${message.slice(0, 300)}` };
      }
    },
    // The model sees the picture, not its base64 spelled out as text.
    toModelOutput: ({ output }) => {
      if (!output.ok) return { type: "json", value: output };
      const { data, ...rest } = output;
      return {
        type: "content",
        value: [
          { type: "text", text: JSON.stringify(rest) },
          data
            ? { type: "file", data: { type: "data", data }, mediaType: output.mediaType }
            : { type: "text", text: "(Look at the page to see it where it is now.)" },
        ],
      };
    },
  });
}
