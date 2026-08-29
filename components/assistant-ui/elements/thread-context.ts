"use client";

import { MessagePrimitive, type ToolCallMessagePartComponent } from "@assistant-ui/react";
import { createContext, type ComponentType, type PropsWithChildren } from "react";

/**
 * The slots a host may replace, and the context they travel in. Its own
 * module because both the thread and the message it renders read it, and a
 * type shared by two files that import each other has nowhere else to live.
 */
export type ThreadGroupPart = MessagePrimitive.GroupedParts.GroupPart;

/**
 * Optional component overrides for the thread. `AssistantMessage` and
 * `Welcome` replace whole sections; the remaining slots override how the
 * assistant message renders tool calls and part groups. Tool UIs registered
 * by name (toolkit `render`, `useAssistantDataUI`) take precedence over
 * `ToolFallback`.
 */
export type ThreadComponents = {
  AssistantMessage?: ComponentType | undefined;
  Welcome?: ComponentType | undefined;
  ToolFallback?: ToolCallMessagePartComponent | undefined;
  ToolGroup?: ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>> | undefined;
  ReasoningGroup?: ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>> | undefined;
};

export type ThreadProps = {
  components?: ThreadComponents | undefined;
  autoFocus?: boolean | undefined;
};

export const EMPTY_COMPONENTS: ThreadComponents = {};

export const ThreadComponentsContext = createContext<ThreadComponents>(EMPTY_COMPONENTS);
