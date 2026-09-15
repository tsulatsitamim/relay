import type { LucideProps } from "lucide-react";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Blocks,
  Bot,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Copy,
  Ellipsis,
  Folder,
  FolderOpen,
  FolderPlus,
  ListChecks,
  ListFilter,
  LoaderCircle,
  Mic,
  Monitor,
  PanelLeft,
  Pencil,
  Pin,
  Plus,
  Redo2,
  Search,
  Square,
  SquareArrowOutUpRight,
  SquarePen,
  Trash2,
  TriangleAlert,
} from "lucide-react";

const sidebar: LucideProps = {
  size: 16,
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
export const IconPlus = icon(Plus, { size: 14, strokeWidth: 1.75 });
export const IconFolderPlus = icon(FolderPlus);
export const IconFilter = icon(ListFilter);
export const IconChevron = icon(ChevronDown, { size: 14, strokeWidth: 2 });
export const IconChevronRight = icon(ChevronRight, { size: 14, strokeWidth: 2 });
export const IconArrowLeft = icon(ArrowLeft, { size: 16, strokeWidth: 1.75 });
export const IconArrowRight = icon(ArrowRight, { size: 16, strokeWidth: 1.75 });
export const IconPanelLeft = icon(PanelLeft);
export const IconMonitor = icon(Monitor, { size: 14 });
export const IconMic = icon(Mic, { size: 14 });
export const IconStop = icon(Square, { size: 12, fill: "currentColor", strokeWidth: 0 });
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
export const IconCopy = icon(Copy, { size: 13, strokeWidth: 1.75 });
export const IconSpinner = icon(LoaderCircle, { size: 14, strokeWidth: 2 });
export const IconWarning = icon(TriangleAlert, { size: 14, strokeWidth: 2 });
export const IconThinking = icon(Brain, { size: 14, strokeWidth: 1.75 });
export const IconPlan = icon(ListChecks, { size: 14, strokeWidth: 1.75 });
export const IconArrowDown = icon(ArrowDown, { size: 14, strokeWidth: 2 });
