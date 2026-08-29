"use client";

import { isAuthed, useAuthStore, useIsAuthed } from "@/lib/store/auth";

import {
  ComposerAddAttachment,
  ComposerAttachments,
} from "@/components/assistant-ui/elements/attachment.aui";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { ArrowUpIcon, MicIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef, type ClipboardEvent, type FC, type KeyboardEvent } from "react";

/** Everything you type into — the main composer and the edit-in-place one. */
const composerSurfaceClass =
  "rounded-(--composer-radius) border border-transparent bg-(--composer-bg) transition-[background-color,border-color,box-shadow,opacity] duration-200 ease-in-out";

const composerShadowClass =
  "shadow-composer not-focus-within:hover:shadow-composer-hover focus-within:shadow-composer-focus";

function guardComposerEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
    return;
  }
  if (isAuthed()) return;
  event.preventDefault();
  useAuthStore.getState().requestSend();
}

/** Only the edges — a copy that dragged blank lines off a page or a terminal. */
function insertTrimmedPaste(
  event: ClipboardEvent<HTMLTextAreaElement>,
  setText: (value: string) => void,
) {
  const raw = event.clipboardData?.getData("text/plain") ?? "";
  const trimmed = raw.trim();
  if (raw === trimmed) return;
  event.preventDefault();
  if (!trimmed) return;
  const el = event.currentTarget;
  const start = el.selectionStart;
  setText(`${el.value.slice(0, start)}${trimmed}${el.value.slice(el.selectionEnd)}`);
  requestAnimationFrame(() => {
    el.setSelectionRange(start + trimmed.length, start + trimmed.length);
  });
}

const GatedComposerSend: FC = () => {
  const authed = useIsAuthed();
  const pendingSend = useAuthStore((s) => s.pendingSend);
  const sendRef = useRef<HTMLButtonElement>(null);

  // A send held back for auth resumes here rather than somewhere up the tree,
  // because this is where the button actually is.
  useEffect(() => {
    if (!authed || !pendingSend) return;
    useAuthStore.getState().clearPendingSend();
    const id = requestAnimationFrame(() => sendRef.current?.click());
    return () => cancelAnimationFrame(id);
  }, [authed, pendingSend]);

  if (authed) {
    return (
      <ComposerPrimitive.Send
        ref={sendRef}
        render={
          <TooltipIconButton
            tooltip="Send message"
            side="bottom"
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-send size-7 rounded-full"
            aria-label="Send message"
          />
        }
      >
        <ArrowUpIcon className="aui-composer-send-icon size-4" />
      </ComposerPrimitive.Send>
    );
  }

  return (
    <TooltipIconButton
      tooltip="Send message"
      side="bottom"
      type="button"
      variant="default"
      size="icon"
      className="aui-composer-send size-7 rounded-full"
      aria-label="Send message"
      onClick={() => useAuthStore.getState().requestSend()}
    >
      <ArrowUpIcon className="aui-composer-send-icon size-4" />
    </TooltipIconButton>
  );
};

export const Composer: FC<{ autoFocus: boolean }> = ({ autoFocus }) => {
  const aui = useAui();
  const text = useAuiState((s) => s.composer.text);
  const hasAttachments = useAuiState((s) => s.composer.attachments.length > 0);

  const setText = (value: string) => {
    try {
      aui.composer().setText(value);
    } catch {
      // Runtime not bound yet.
    }
  };

  return (
    <ComposerPrimitive.Root
      className="aui-composer-root relative flex w-full flex-col"
      onSubmitCapture={(event) => {
        const trimmed = text.trim();
        if (trimmed !== text) setText(trimmed);
        if (!trimmed && !hasAttachments) event.preventDefault();
      }}
    >
      <ComposerPrimitive.AttachmentDropzone
        render={
          <div
            data-slot="aui_composer-shell"
            className={cn(
              composerSurfaceClass,
              composerShadowClass,
              "data-[dragging=true]:border-ring flex w-full cursor-text flex-col gap-2 p-(--composer-padding) data-[dragging=true]:border-dashed data-[dragging=true]:bg-[color-mix(in_oklab,var(--color-accent)_50%,var(--color-background))]",
            )}
          />
        }
      >
        <ComposerAttachments />
        <ComposerPrimitive.Input
          placeholder="Add a role, tighten a bullet…"
          // min-h must equal one line exactly (leading-6 + py-1 = 2rem), or the
          // textarea jumps the first time the auto-resizer sets a height.
          className="aui-composer-input caret-primary placeholder:text-muted-foreground/60 max-h-48 min-h-8 w-full resize-none bg-transparent px-2.5 py-1 font-sans text-base leading-6 outline-none"
          rows={1}
          autoFocus={autoFocus}
          enterKeyHint="send"
          aria-label="Message input"
          onKeyDown={guardComposerEnter}
          onPaste={(event) => insertTrimmedPaste(event, setText)}
        />
        <ComposerAction />
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

export const ComposerAction: FC = () => {
  return (
    <div className="aui-composer-action-wrapper relative flex items-center justify-between">
      <ComposerAddAttachment />
      <div className="flex items-center gap-1.5">
        <AuiIf condition={(s) => s.thread.capabilities.dictation}>
          <AuiIf condition={(s) => s.composer.dictation == null}>
            <ComposerPrimitive.Dictate
              render={
                <TooltipIconButton
                  tooltip="Voice input"
                  side="bottom"
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="aui-composer-dictate text-muted-foreground hover:text-foreground size-7 rounded-full"
                  aria-label="Start voice input"
                />
              }
            >
              <MicIcon className="aui-composer-dictate-icon size-4" />
            </ComposerPrimitive.Dictate>
          </AuiIf>
          <AuiIf condition={(s) => s.composer.dictation != null}>
            <ComposerPrimitive.StopDictation
              render={
                <TooltipIconButton
                  tooltip="Stop dictation"
                  side="bottom"
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="aui-composer-stop-dictation text-destructive size-7 rounded-full"
                  aria-label="Stop voice input"
                />
              }
            >
              <SquareIcon className="aui-composer-stop-dictation-icon size-3.5 animate-pulse fill-current" />
            </ComposerPrimitive.StopDictation>
          </AuiIf>
        </AuiIf>
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <GatedComposerSend />
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel
            render={
              <Button
                type="button"
                variant="default"
                size="icon"
                className="aui-composer-cancel size-7 rounded-full"
                aria-label="Stop generating"
              />
            }
          >
            <SquareIcon className="aui-composer-cancel-icon size-3.5 fill-current" />
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </div>
  );
};

export const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_edit-composer-wrapper"
      className="flex flex-col px-2 [contain-intrinsic-size:auto_12.5rem] [content-visibility:auto]"
    >
      <ComposerPrimitive.Root
        className={cn(
          "aui-edit-composer-root",
          composerSurfaceClass,
          "ms-auto flex w-full max-w-[85%] cursor-text flex-col",
        )}
      >
        <ComposerPrimitive.Input
          className="aui-edit-composer-input text-foreground min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
          <ComposerPrimitive.Cancel
            render={<Button variant="ghost" size="sm" className="h-8 rounded-full px-3.5" />}
          >
            Cancel
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send render={<Button size="sm" className="h-8 rounded-full px-3.5" />}>
            Update
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};
