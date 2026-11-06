import BookOpenText from "lucide-svelte/icons/book-open-text";
import BrainCircuit from "lucide-svelte/icons/brain-circuit";
import CalendarDays from "lucide-svelte/icons/calendar-days";
import CalendarRange from "lucide-svelte/icons/calendar-range";
import ChartNoAxesCombined from "lucide-svelte/icons/chart-no-axes-combined";
import Clock3 from "lucide-svelte/icons/clock-3";
import HeartPulse from "lucide-svelte/icons/heart-pulse";
import History from "lucide-svelte/icons/history";
import Layers3 from "lucide-svelte/icons/layers-3";
import LayoutDashboard from "lucide-svelte/icons/layout-dashboard";
import ListTodo from "lucide-svelte/icons/list-todo";
import NotebookPen from "lucide-svelte/icons/notebook-pen";
import Table2 from "lucide-svelte/icons/table-2";
import TimerReset from "lucide-svelte/icons/timer-reset";
import Zap from "lucide-svelte/icons/zap";
import AiWidget from "./AiWidget.svelte";
import CalendarWidget from "./CalendarWidget.svelte";
import ClockWidget from "./ClockWidget.svelte";
import FocusWidget from "./FocusWidget.svelte";
import LifeWidget from "./LifeWidget.svelte";
import NextHolidayWidget from "./NextHolidayWidget.svelte";
import NotesWidget from "./NotesWidget.svelte";
import PlaceholderWidget from "./PlaceholderWidget.svelte";
import PomodoroWidget from "./PomodoroWidget.svelte";
import QuickWidget from "./QuickWidget.svelte";
import RecentDocumentsWidget from "./RecentDocumentsWidget.svelte";
import StatisticsCardWidget from "./StatisticsCardWidget.svelte";
import QueryViewWidget from "./QueryViewWidget.svelte";
import StickyNoteWidget from "./StickyNoteWidget.svelte";
import TasksWidget from "./TasksWidget.svelte";
import type { HomeWidgetId } from "../config";

const WIDGET_ICONS: Partial<Record<HomeWidgetId, any>> = {
  notes: BookOpenText,
  quick: LayoutDashboard,
  focus: Zap,
  life: HeartPulse,
  ai: BrainCircuit,
  clock: Clock3,
  "next-holiday": CalendarDays,
  "sticky-note": NotebookPen,
  "recent-documents": History,
  tasks: ListTodo,
  calendar: CalendarRange,
  "advanced-pomodoro": TimerReset,
  "statistics-card": ChartNoAxesCombined,
  "query-view": Table2,
};

const WIDGET_COMPONENTS: Partial<Record<HomeWidgetId, any>> = {
  notes: NotesWidget,
  quick: QuickWidget,
  focus: FocusWidget,
  life: LifeWidget,
  ai: AiWidget,
  clock: ClockWidget,
  "next-holiday": NextHolidayWidget,
  "sticky-note": StickyNoteWidget,
  "recent-documents": RecentDocumentsWidget,
  tasks: TasksWidget,
  calendar: CalendarWidget,
  "advanced-pomodoro": PomodoroWidget,
  "statistics-card": StatisticsCardWidget,
  "query-view": QueryViewWidget,
};

export function getWidgetIcon(id: HomeWidgetId) {
  return WIDGET_ICONS[id] ?? Layers3;
}

export function getWidgetComponent(id: HomeWidgetId) {
  return WIDGET_COMPONENTS[id] ?? PlaceholderWidget;
}
