"use client";

import { ImageActions } from "@/components/assistant-ui/elements/image-actions";
import { ImageZoom } from "@/components/assistant-ui/elements/image-zoom";
import { memo, useState, useEffect, useRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { ImageIcon, ImageOffIcon, Loader2Icon, ShieldAlertIcon } from "lucide-react";
import type { ImageMessagePartComponent } from "@assistant-ui/react";
import { cn } from "@/lib/utils";

/** The image as it sits in the thread, at whatever size the message asked for. */
const imageVariants = cva("aui-image-root relative overflow-hidden rounded-lg", {
  variants: {
    variant: {
      outline: "border-border border",
      ghost: "",
      muted: "bg-muted/50",
    },
    size: {
      sm: "max-w-64",
      default: "max-w-96",
      lg: "max-w-lg",
      full: "w-full",
    },
  },
  defaultVariants: {
    variant: "outline",
    size: "default",
  },
});

export type ImageRootProps = React.ComponentProps<"div"> & VariantProps<typeof imageVariants>;

function ImageRoot({ className, variant, size, children, ...props }: ImageRootProps) {
  return (
    <div
      data-slot="image-root"
      data-variant={variant}
      data-size={size}
      className={cn(imageVariants({ variant, size, className }))}
      {...props}
    >
      {children}
    </div>
  );
}

type ImagePreviewProps = Omit<React.ComponentProps<"img">, "children"> & {
  containerClassName?: string;
};

function ImagePreview({
  className,
  containerClassName,
  onLoad,
  onError,
  alt = "Image content",
  src,
  ...props
}: ImagePreviewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | undefined>(undefined);
  const [errorSrc, setErrorSrc] = useState<string | undefined>(undefined);

  const loaded = loadedSrc === src;
  const error = errorSrc === src;

  useEffect(() => {
    if (typeof src === "string" && imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoadedSrc(src);
    }
  }, [src]);

  return (
    <div data-slot="image-preview" className={cn("relative min-h-32", containerClassName)}>
      {!loaded && !error && (
        <div
          data-slot="image-preview-loading"
          className="bg-muted/50 absolute inset-0 flex items-center justify-center"
        >
          <ImageIcon className="text-muted-foreground size-8 animate-pulse" />
        </div>
      )}
      {error ? (
        <div
          data-slot="image-preview-error"
          className="bg-muted/50 flex min-h-32 items-center justify-center p-4"
        >
          <ImageOffIcon className="text-muted-foreground size-8" />
        </div>
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className={cn("block h-auto w-full object-contain", !loaded && "invisible", className)}
          onLoad={(e) => {
            if (typeof src === "string") setLoadedSrc(src);
            onLoad?.(e);
          }}
          onError={(e) => {
            if (typeof src === "string") setErrorSrc(src);
            onError?.(e);
          }}
          {...props}
        />
      )}
    </div>
  );
}

function ImageFilename({ className, children, ...props }: React.ComponentProps<"span">) {
  if (!children) return null;

  return (
    <span
      data-slot="image-filename"
      className={cn("text-muted-foreground block truncate px-2 py-1.5 text-xs", className)}
      {...props}
    >
      {children}
    </span>
  );
}

function ImageGenerating({ className }: { className?: string }) {
  return (
    <div
      data-slot="image-generating"
      className={cn("bg-muted/50 flex min-h-32 items-center justify-center p-4", className)}
    >
      <Loader2Icon className="text-muted-foreground size-8 animate-spin" />
      <span className="sr-only">Generating image…</span>
    </div>
  );
}

function ImageContentFilterError({ className, reason }: { className?: string; reason?: string }) {
  return (
    <div
      data-slot="image-content-filter-error"
      className={cn(
        "bg-muted/50 flex min-h-32 flex-col items-center justify-center gap-2 p-4 text-center",
        className,
      )}
    >
      <ShieldAlertIcon className="text-muted-foreground size-8" />
      <p className="text-sm font-medium">Image could not be generated</p>
      {reason && <p className="text-muted-foreground text-xs">{reason}</p>}
    </div>
  );
}

const ImageImpl: ImageMessagePartComponent = (props) => {
  const { image, filename, status } = props;

  if (status?.type === "running") {
    return (
      <ImageRoot>
        <ImageGenerating />
        <ImageFilename>{filename}</ImageFilename>
      </ImageRoot>
    );
  }

  if (status?.type === "incomplete" && status.reason === "content-filter") {
    return (
      <ImageRoot>
        <ImageContentFilterError reason="The provider blocked this image." />
      </ImageRoot>
    );
  }

  return (
    <ImageRoot>
      <ImageZoom src={image} alt={filename || "Image content"}>
        <ImagePreview src={image} alt={filename || "Image content"} />
      </ImageZoom>
      <ImageFilename>{filename}</ImageFilename>
    </ImageRoot>
  );
};

const Image = memo(ImageImpl) as unknown as ImageMessagePartComponent & {
  Root: typeof ImageRoot;
  Preview: typeof ImagePreview;
  Filename: typeof ImageFilename;
  Zoom: typeof ImageZoom;
  Actions: typeof ImageActions;
  Generating: typeof ImageGenerating;
  ContentFilterError: typeof ImageContentFilterError;
};

Image.displayName = "Image";
Image.Root = ImageRoot;
Image.Preview = ImagePreview;
Image.Filename = ImageFilename;
Image.Zoom = ImageZoom;
Image.Actions = ImageActions;
Image.Generating = ImageGenerating;
Image.ContentFilterError = ImageContentFilterError;

export {
  Image,
  ImageRoot,
  ImagePreview,
  ImageFilename,
  ImageZoom,
  ImageActions,
  ImageGenerating,
  ImageContentFilterError,
  imageVariants,
};
