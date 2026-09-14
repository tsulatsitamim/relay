import type { LucideProps } from "lucide-react";
import {
  ArrowUp,
  ChevronDown,
  CirclePlus,
  Copy,
  Ellipsis,
  Folder,
  Mic,
  Monitor,
  Plus,
  Search,
  SlidersHorizontal,
  SquareArrowOutUpRight,
  SquarePen,
} from "lucide-react";

/** Cursor sidebar glyphs are 16px (cursor-icons / size lg). */
const sidebar: LucideProps = {
  size: 16,
  strokeWidth: 1.5,
  "aria-hidden": true,
};

function icon(Icon: typeof SquarePen, extra?: LucideProps) {
  return function RelayIcon(props: LucideProps) {
    return <Icon {...sidebar} {...extra} {...props} />;
  };
}

export const IconPen = icon(SquarePen);
export const IconSearch = icon(Search);
export const IconAutomations = icon(Copy);
export const IconCustomize = icon(SlidersHorizontal);
export const IconFolder = icon(Folder);
export const IconPlus = icon(Plus, { size: 13, strokeWidth: 1.75 });
export const IconChevron = icon(ChevronDown, { size: 12, strokeWidth: 2 });
export const IconMonitor = icon(Monitor, { size: 14 });
export const IconMic = icon(Mic, { size: 14 });
export const IconSend = icon(ArrowUp, { size: 14, strokeWidth: 2.25 });
export const IconCirclePlus = icon(CirclePlus, { size: 18, strokeWidth: 1.75 });
export const IconOut = icon(SquareArrowOutUpRight, { size: 13 });
export const IconMore = icon(Ellipsis, { size: 16 });
