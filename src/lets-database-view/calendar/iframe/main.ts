import { Calendar, type DayCellInfo, type DayHeaderInfo, type EventInput } from "fullcalendar";
import dayGridPlugin from "fullcalendar/daygrid";
import timeGridPlugin from "fullcalendar/timegrid";
import listPlugin from "fullcalendar/list";
import interactionPlugin from "fullcalendar/interaction";
import classicThemePlugin from "fullcalendar/themes/classic";
import zhCnLocale from "fullcalendar/locales/zh-cn";
import "fullcalendar/skeleton.css";
import "fullcalendar/themes/classic/theme.css";
import "fullcalendar/themes/classic/palette.css";
import "./app.css";

interface Entry {
  id: string; title: string; start: string; end: string; allDay: boolean;
  editable: boolean; backgroundColor?: string; borderColor?: string;
}
type View = "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek";
interface DataMessage {
  type: "dodoCalendarData";
  events: Entry[];
  warning?: string;
  defaultView?: View;
  revision: number;
  theme?: Record<string, string>;
  colorScheme?: "light" | "dark";
  transient?: boolean;
}
const validViews = ["dayGridMonth","timeGridWeek","timeGridDay","listWeek"];
const root = document.querySelector<HTMLElement>("#calendar")!;
const warning = document.querySelector<HTMLElement>("#calendar-warning")!;
const createDialog = document.querySelector<HTMLDialogElement>("#calendar-create-dialog")!;
const createName = document.querySelector<HTMLInputElement>("#calendar-create-name")!;
const createAllDay = document.querySelector<HTMLInputElement>("#calendar-create-allday")!;
const createStart = document.querySelector<HTMLInputElement>("#calendar-create-start")!;
const createEnd = document.querySelector<HTMLInputElement>("#calendar-create-end")!;
const createError = document.querySelector<HTMLElement>("#calendar-create-error")!;
const createSave = document.querySelector<HTMLButtonElement>("#calendar-create-save")!;
const createCancel = document.querySelector<HTMLButtonElement>("#calendar-create-cancel")!;
const quick = document.querySelector<HTMLDivElement>("#calendar-quick")!;
const quickName = document.querySelector<HTMLInputElement>("#calendar-quick-name")!;
const quickCancel = document.querySelector<HTMLButtonElement>("#calendar-quick-cancel")!;
const quickDetails = document.querySelector<HTMLButtonElement>("#calendar-quick-details")!;
const quickSave = document.querySelector<HTMLButtonElement>("#calendar-quick-save")!;
const quickError = document.querySelector<HTMLElement>("#calendar-quick-error")!;
let calendar: Calendar | null = null;
let configuredDefaultView: View | null = null;
let renderedEntries = "";
let renderedEvents = new Map<string, string>();
let revision = 0;
let entries = new Map<string, Entry>();
let nextRequest = 1;
let pending: { requestId: number; revert: () => void } | null = null;
let pendingCreate: number | null = null;
let createOrigin: "quick" | "dialog" | null = null;
const DRAFT_ID = "__dodo-calendar-draft__";
const viewLabels: Record<View, string> = {
  dayGridMonth: "月", timeGridWeek: "周", timeGridDay: "日", listWeek: "日程",
};
let quickDraft: { start: string; end: string; allDay: boolean; title?: string } | null = null;
let submittedCreate: { start: string; end: string; allDay: boolean; title: string } | null = null;

// Never bind "plain Enter" to creating an item. Windows IMEs can confirm
// candidates without isComposing / keyCode=229 and without a reliable
// compositionend ordering. The only keyboard submit shortcut is Ctrl+Enter;
// the other path is an explicit button click. In particular, do not prevent
// the default of an IME-owned keydown: the IME needs it to commit candidates.
const composingInputs = new WeakSet<HTMLInputElement>();
for (const input of [quickName, createName]) {
  input.addEventListener("compositionstart", () => composingInputs.add(input));
  input.addEventListener("compositionend", () => composingInputs.delete(input));
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    // Keep candidate-selection keys inside the text input instead of
    // letting FullCalendar or other document-level shortcuts handle them.
    event.stopPropagation();
    // Never preventDefault on plain Enter: an IME may omit isComposing and
    // still need that default action to commit the selected Hanzi.
    // The editor is not a <form>; there is no implicit submission at all.
    if (event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey &&
        !event.isComposing && event.keyCode !== 229 &&
        !composingInputs.has(input)) {
      event.preventDefault();
      if (input === quickName) submitQuickCreate();
      else submitDetailedCreate();
    }
  });
}
function showOptimisticCreatedItem() {
  if (!submittedCreate) return;
  quickDraft = { ...submittedCreate };
  quick.hidden = true;
  calendar?.getEventById(DRAFT_ID)?.remove();
  calendar?.addEvent({
    id: DRAFT_ID, title: submittedCreate.title, editable: false,
    start: submittedCreate.start.replace(" ", "T"),
    end: submittedCreate.end.replace(" ", "T"),
    allDay: submittedCreate.allDay, classNames: ["dodo-calendar-draft"],
  });
}

function dismissQuick() {
  if (pendingCreate !== null) return;
  calendar?.getEventById(DRAFT_ID)?.remove();
  quickDraft = null;
  quick.hidden = true;
}
function openQuick(start: Date, end: Date, allDay: boolean, mouse?: MouseEvent) {
  if (pendingCreate !== null || createDialog.open) return;
  dismissQuick();
  quickDraft = { start: wallTime(start, allDay), end: wallTime(end, allDay), allDay };
  calendar?.addEvent({
    id: DRAFT_ID, title: "新日程",
    start, end, allDay, editable: false,
    classNames: ["dodo-calendar-draft"],
  });
  quickName.value = "";
  quickError.hidden = true;
  quickError.textContent = "";
  quick.style.left = Math.max(8, Math.min(window.innerWidth - 306, (mouse?.clientX || 48) + 12)) + "px";
  quick.style.top = Math.max(8, Math.min(window.innerHeight - 145, (mouse?.clientY || 80) + 12)) + "px";
  quick.hidden = false;
  quickName.focus();
}
function sendCreate(origin: "quick" | "dialog", title: string,
                    start: string, end: string, allDay: boolean) {
  if (pendingCreate !== null || pending) return;
  if (!title.trim() || !start || !end || start >= end) {
    const error = "请输入日程名称，且结束日期必须晚于开始日期";
    if (origin === "quick") { quickError.textContent = error; quickError.hidden = false; }
    else showCreateError(error);
    return;
  }
  const requestId = nextRequest++;
  pendingCreate = requestId;
  submittedCreate = { title: title.trim(), start, end, allDay };
  createOrigin = origin;
  createSave.disabled = true;
  createCancel.disabled = true;
  quickSave.disabled = true;
  quickCancel.disabled = true;
  quickDetails.disabled = true;
  publish({ type: "dodoCalendarCreate", requestId, revision,
    title: title.trim(), start, end, allDay });
}
function submitQuickCreate() {
  if (!quickDraft) return;
  sendCreate("quick", quickName.value, quickDraft.start, quickDraft.end, quickDraft.allDay);
}
quickSave.addEventListener("click", submitQuickCreate);
quickCancel.addEventListener("click", dismissQuick);
quickDetails.addEventListener("click", () => {
  if (!quickDraft) return;
  const old = quickDraft, title = quickName.value;
  dismissQuick();
  openCreator(new Date(old.start.replace(" ", "T")),
    new Date(old.end.replace(" ", "T")), old.allDay);
  createName.value = title;
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !quick.hidden && pendingCreate === null) dismissQuick();
});

function showCreateError(value: string) {
  createError.textContent = value;
  createError.hidden = !value;
}
function setAllDayInputs(allDay: boolean) {
  createStart.type = allDay ? "date" : "datetime-local";
  createEnd.type = allDay ? "date" : "datetime-local";
}
function openCreator(start: Date, end: Date, allDay: boolean) {
  if (createDialog.open || pendingCreate !== null) return;
  dismissQuick();
  createName.value = "";
  createAllDay.checked = allDay;
  setAllDayInputs(allDay);
  if (allDay) {
    const inclusive = new Date(end);
    inclusive.setDate(inclusive.getDate() - 1);
    createStart.value = wallTime(start, true);
    createEnd.value = wallTime(inclusive, true);
  } else {
    createStart.value = wallTime(start, false).replace(" ", "T");
    createEnd.value = wallTime(end, false).replace(" ", "T");
  }
  showCreateError("");
  createDialog.showModal();
  createName.focus();
}
createCancel.addEventListener("click", () => {
  if (pendingCreate === null) createDialog.close();
});
createDialog.addEventListener("cancel", event => {
  if (pendingCreate !== null) event.preventDefault();
});
createAllDay.addEventListener("change", () => {
  const beginning = createStart.value.slice(0, 10);
  const ending = createEnd.value.slice(0, 10);
  setAllDayInputs(createAllDay.checked);
  if (createAllDay.checked) {
    createStart.value = beginning;
    createEnd.value = ending || beginning;
  } else {
    createStart.value = beginning ? beginning + "T09:00" : "";
    createEnd.value = (ending || beginning) ? (ending || beginning) + "T10:00" : "";
  }
});
function submitDetailedCreate() {
  if (pendingCreate !== null || pending) return;
  const allDay = createAllDay.checked;
  const start = allDay ? createStart.value : createStart.value.replace("T", " ");
  let end = allDay ? createEnd.value : createEnd.value.replace("T", " ");
  if (!start || !end || !createName.value.trim()) {
    showCreateError("请输入日程名称和有效日期"); return;
  }
  if (allDay) {
    const last = new Date(end + "T00:00:00");
    last.setDate(last.getDate() + 1);
    end = wallTime(last, true);
  }
  showCreateError("");
  sendCreate("dialog", createName.value, start, end, allDay);
}
createSave.addEventListener("click", submitDetailedCreate);

function publish(message: Record<string, unknown>) {
  window.parent.postMessage(message, location.origin);
}
function showWarning(value: string) {
  if (warning.textContent !== value) warning.textContent = value;
  if (warning.hidden !== !value) warning.hidden = !value;
}
function wallTime(date: Date, allDay: boolean): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth()+1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const base = year+"-"+month+"-"+day;
  if (allDay) return base;
  return base+" "+String(date.getHours()).padStart(2, "0")
    +":"+String(date.getMinutes()).padStart(2, "0");
}
function commitChange(id: string, event: {
  start: Date | null; end: Date | null; allDay: boolean;
}, revert: () => void) {
  const original = entries.get(id);
  if (!original || !original.editable || pending ||
      original.allDay !== event.allDay || !event.start || !event.end) {
    revert();
    if (pending) showWarning("上一项日程修改仍在保存，请完成后重试。");
    return;
  }
  const start_date = wallTime(event.start, original.allDay);
  const end_date = wallTime(event.end, original.allDay);
  if (start_date >= end_date) { revert(); return; }
  const oldStart = original.allDay ? original.start : original.start.replace("T", " ");
  const oldEnd = original.allDay ? original.end : original.end.replace("T", " ");
  if (start_date === oldStart && end_date === oldEnd) return;
  const requestId = nextRequest++;
  pending = { requestId, revert };
  publish({ type: "dodoCalendarEdit", requestId, revision, id,
    after: { start_date, end_date } });
}
function renderTodayNumber(info: DayCellInfo | DayHeaderInfo) {
  if (!info.isToday) return true;
  const label = document.createElement("span");
  label.append(...info.textParts.map(part => {
    if (part.type !== "day") return document.createTextNode(part.value);
    const number = document.createElement("span");
    number.className = "dodo-calendar-today-number";
    number.textContent = part.value;
    return number;
  }));
  return { domNodes: [label] };
}
function syncViewMenu(view: View) {
  const button = root.querySelector<HTMLButtonElement>(".dodo-calendar-view-menu");
  if (!button) return;
  button.textContent = viewLabels[view];
  button.setAttribute("aria-label", "日历视图：" + viewLabels[view] + "，点击切换");
  button.setAttribute("aria-haspopup", "menu");
}
function createCalendar(initial: View) {
  calendar = new Calendar(root, {
    plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, classicThemePlugin],
    locale: zhCnLocale,
    initialView: initial,
    headerToolbar: {
      left: "", center: "title",
      right: "calendarViewMenu today prev,next",
    },
    buttons: {
      calendarViewMenu: {
        text: "月", hint: "切换日历视图", className: "dodo-calendar-view-menu",
        click: () => {
          const view = calendar?.view.type as View | undefined;
          if (view && validViews.includes(view))
            publish({ type: "dodoCalendarOpenViewMenu", view });
        },
      },
      today: { text: "今天", display: "text" },
    },
    firstDay: 1,
    dayCellTopContent: renderTodayNumber,
    dayHeaderContent: renderTodayNumber,
    datesSet: ({ view }) => syncViewMenu(view.type as View),
    nowIndicator: true,
    height: "auto",
    fixedWeekCount: false,
    dayMaxEvents: true,
    selectable: true,
    selectMinDistance: 4,
    selectMirror: true,
    unselectAuto: true,
    select: selection => {
      openQuick(selection.start, selection.end, selection.allDay,
        selection.jsEvent as MouseEvent);
      calendar?.unselect();
    },
    editable: true,
    eventStartEditable: true,
    eventDurationEditable: true,
    eventResizableFromStart: false,
    snapDuration: "00:15:00",
    slotDuration: "00:30:00",
    slotHeaderFormat: { hour: "2-digit", minute: "2-digit", hour12: false },
    eventTimeFormat: { hour: "2-digit", minute: "2-digit", hour12: false },
    eventAllow: (drop, dragged) => {
      const original = entries.get(dragged.id);
      return Boolean(original?.editable && !pending && original.allDay === drop.allDay);
    },
    eventClick: ({ event, jsEvent }) => {
      jsEvent.preventDefault();
      if (entries.has(event.id)) publish({ type: "dodoCalendarOpenItem", id: event.id });
    },
    eventDidMount: ({ el, view }) => {
      if (view.type === "dayGridMonth") el.classList.add("dodo-calendar-month-event");
    },
    eventDrop: ({ event, revert }) => commitChange(event.id, event, revert),
    eventResize: ({ event, revert }) => commitChange(event.id, event, revert),
  });
  calendar.render();
}
window.addEventListener("message", (evt: MessageEvent) => {
  if (evt.source !== window.parent || evt.origin !== location.origin ||
      !evt.data || typeof evt.data !== "object") return;
  const message = evt.data;
  if (message.type === "dodoCalendarChangeView") {
    if (typeof message.view === "string" && validViews.includes(message.view))
      calendar?.changeView(message.view as View);
    return;
  }
  if (message.type === "dodoCalendarCreateResult") {
    if (pendingCreate === null || pendingCreate !== message.requestId) return;
    pendingCreate = null;
    createSave.disabled = false;
    createCancel.disabled = false;
    quickSave.disabled = false;
    quickCancel.disabled = false;
    quickDetails.disabled = false;
    if (!message.success) {
      const error = message.error || "创建日程失败";
      if (createOrigin === "quick") {
        quickError.textContent = error;
        quickError.hidden = false;
      } else showCreateError(error);
    } else {
      // Keep the new appointment visible while SiYuan is rebuilding its AV.
      // The real native row replaces this optimistic block on the next read.
      showOptimisticCreatedItem();
      if (createOrigin === "dialog") createDialog.close();
      showWarning("");
      publish({ type: "dodoCalendarReload" });
    }
    submittedCreate = null;
    createOrigin = null;
    return;
  }
  if (message.type === "dodoCalendarSaveResult") {
    if (!pending || pending.requestId !== message.requestId) return;
    const previous = pending;
    pending = null;
    if (!message.success) {
      previous.revert();
      showWarning(message.error || "日程保存失败。");
    } else {
      showWarning("");
      publish({ type: "dodoCalendarReload" });
    }
    return;
  }
  if (message.type !== "dodoCalendarData") return;
  const data = message as DataMessage;
  if (pending) return; // preserve the pre-save snapshot until ACK
  if (!Number.isSafeInteger(data.revision) || data.revision < revision ||
      !Array.isArray(data.events)) return;
  revision = data.revision;
  if (data.colorScheme === "light" || data.colorScheme === "dark") {
    document.documentElement.style.colorScheme = data.colorScheme;
  }
  for (const [key, value] of Object.entries(data.theme || {})) {
    if (/^--(?:b3-theme-[\w-]+|b3-(?:border-color|list-hover|list-icon-hover|menu-background|dialog-shadow|mask-background|av-calendar-background|card-info-(?:background|color)|font-family)|dodo-calendar-[\w-]+)$/.test(key) &&
        typeof value === "string" && value.length <= 200) {
      if (document.documentElement.style.getPropertyValue(key) !== value)
        document.documentElement.style.setProperty(key, value);
    }
  }
  const next = new Map<string, Entry>();
  for (const value of data.events) {
    if (typeof value.id === "string" && typeof value.title === "string" &&
        typeof value.start === "string" && typeof value.end === "string") {
      next.set(value.id, value);
    }
  }
  // Native AV reads may briefly report a blank payload during a detached
  // row append. Never throw away the previous month view while syncing.
  if (data.transient && entries.size > 0 && next.size === 0) {
    showWarning(data.warning || "正在同步日程…");
    return;
  }
  entries = next;
  if (quickDraft?.title && [...next.values()].some(item =>
    item.title === quickDraft?.title && item.allDay === quickDraft?.allDay &&
    item.start.replace("T", " ") === quickDraft?.start &&
    item.end.replace("T", " ") === quickDraft?.end)) {
    calendar?.getEventById(DRAFT_ID)?.remove();
    quickDraft = null;
  }
  const view = validViews.includes(data.defaultView || "") ? data.defaultView! : "dayGridMonth";
  if (!calendar) { createCalendar(view); configuredDefaultView = view; }
  else if (configuredDefaultView !== view) {
    // A changed saved default takes effect without recreating the iframe.
    configuredDefaultView = view;
    calendar.changeView(view);
  }
  const inputs: EventInput[] = Array.from(entries.values()).map(item => ({
    id: item.id, title: item.title, start: item.start, end: item.end,
    allDay: item.allDay, editable: item.editable,
    ...(item.backgroundColor ? { backgroundColor: item.backgroundColor } : {}),
    ...(item.borderColor ? { borderColor: item.borderColor } : {}),
  }));
  // SiYuan may refresh the AV many times during writes. Reconcile by ID:
  // never clear the entire calendar and flash all existing appointments.
  const nextSignatures = new Map(inputs.map(item => [item.id!,
    JSON.stringify(item)]));
  const nextSignature = JSON.stringify(inputs);
  if (nextSignature !== renderedEntries) {
    calendar!.batchRendering(() => {
      for (const id of renderedEvents.keys()) {
        if (!nextSignatures.has(id)) calendar!.getEventById(id)?.remove();
      }
      for (const item of inputs) {
        if (renderedEvents.get(item.id!) !== nextSignatures.get(item.id!)) {
          calendar!.getEventById(item.id!)?.remove();
          calendar!.addEvent(item);
        }
      }
    });
    renderedEvents = nextSignatures;
    renderedEntries = nextSignature;
  }
  showWarning(data.warning || (inputs.length ? "" : "当前数据库视图没有带有效日期的日程。请在设置中选择开始日期列。"));
});
publish({ type: "dodoCalendarReady" });
