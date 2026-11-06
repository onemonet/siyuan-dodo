# Frappe Gantt 1.2.2 — SiYuan fractional-duration patch

Origin: https://github.com/frappe/gantt (MIT, see ../../iframe/FRAPPE-GANTT-LICENSE.txt).

src/bar.js adapts compute_duration() to calculate actual fractional
duration from task._end - task._start using the current scale, instead of
iterating in whole calendar days. The original loops expand all 15-minute
tasks into 24-hour bars and add a day to midnight-exclusive ends after dragging.

src/index.js no longer imports CSS because iframe loads official
frappe-gantt.css separately. All other JavaScript files match 1.2.2.

Build: node scripts/build-frappe-gantt.mjs

The patch intentionally leaves ignored-date calculations disabled (the SiYuan
iframe never configures ignored days or holiday calendars).

Handle hit-area fix in src/bar.js: date-edge handles are widened from 3px to
8px and kept centered on the edges after updates. The progress drag circle
remains at the true progress X but moves to the bar's upper edge, clear of the
date handle's vertical hit area, including at 0% and 100% progress. The iframe
CSS reveals both affordances on bar hover. This prevents accidental progress
saves when adjusting start/end dates without disabling progress dragging.

The header pill is removed on Bar.refresh() before rebuilding, preventing
stale duplicate date-range highlights from being activated by the hover
handler instead of the pill updated during the drag. Task labels are now
15px, left-anchored and allowed to extend beyond their task bar widths.
Width animations on task and progress rectangles are suppressed to keep the
visible bar size equal to the capsule immediately after a native AV update.


Additional patched file: src/date_utils.js add(date, qty, scale).
Upstream parseInt(qty) silently discards fractional hour and day adjustments:
15 minutes = 0.25 hour => 0 hours, causing the task bar to snap visually
without moving the task timestamp. Fixed-unit fractional additions now use
rounded milliseconds; integral/calendar additions keep their original path.
