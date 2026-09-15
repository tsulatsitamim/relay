import type { LucideProps } from "lucide-react";
import {
  Archive,
  ArrowUp,
  Blocks,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Ellipsis,
  Folder,
  FolderOpen,
  FolderPlus,
  ListFilter,
  Mic,
  Monitor,
  Pencil,
  Pin,
  Plus,
  Redo2,
  Search,
  SquareArrowOutUpRight,
  SquarePen,
  Trash2,
} from "lucide-react";

/** Cursor leading icons are 14px; group/row actions are 13px. */
const sidebar: LucideProps = {
  size: 14,
  strokeWidth: 1.75,
  "aria-hidden": true,
};

function icon(Icon: typeof SquarePen, extra?: LucideProps) {
  return function RelayIcon(props: LucideProps) {
    return <Icon {...sidebar} {...extra} {...props} />;
  };
}

export const IconPen = icon(SquarePen);
export const IconSearch = icon(Search);
export const IconAutomations = icon(Bot);
export const IconCustomize = icon(Blocks);
export const IconFolder = icon(Folder);
export const IconFolderOpen = icon(FolderOpen);
export const IconPlus = icon(Plus, { size: 13, strokeWidth: 1.75 });
export const IconFolderPlus = icon(FolderPlus, { size: 14, strokeWidth: 1.75 });
export const IconFilter = icon(ListFilter, { size: 14, strokeWidth: 1.75 });
export const IconChevron = icon(ChevronDown, { size: 13, strokeWidth: 2 });
export const IconChevronRight = icon(ChevronRight, { size: 14, strokeWidth: 2 });
export const IconMonitor = icon(Monitor, { size: 14 });
export const IconMic = icon(Mic, { size: 14 });
export const IconSend = icon(ArrowUp, { size: 14, strokeWidth: 2.25 });
export const IconCirclePlus = icon(CirclePlus, { size: 18, strokeWidth: 1.75 });
export const IconOut = icon(SquareArrowOutUpRight, { size: 13 });
export const IconMore = icon(Ellipsis, { size: 16 });
export const IconPin = icon(Pin, { size: 14, strokeWidth: 1.75 });
export const IconArchive = icon(Archive, { size: 14, strokeWidth: 1.75 });
export const IconRedo = icon(Redo2, { size: 14, strokeWidth: 1.75 });
export const IconTrash = icon(Trash2, { size: 14, strokeWidth: 1.75 });
export const IconCheck = icon(Check, { size: 14, strokeWidth: 2 });
export const IconPencil = icon(Pencil, { size: 14, strokeWidth: 1.75 });
