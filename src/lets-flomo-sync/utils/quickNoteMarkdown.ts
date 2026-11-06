import moment from "moment";
import { FLOMO_DEFAULT_TIME_FORMAT } from "../../config/constants";
import type { ProcessedMemo } from "../types";
import { applyTemplate } from "./markdownTemplate";

const QUICK_NOTE_TAG_REGEX = /#([^\s#]+)/g;
const QUICK_NOTE_DATE_FORMAT = "YYYY-MM-DD";

export function processQuickNote(
  text: string,
  contentTemplate: string,
  timeFormat: string = FLOMO_DEFAULT_TIME_FORMAT,
): ProcessedMemo {
  const now = moment();
  const time = now.format(timeFormat);
  const updatedDate = now.format(QUICK_NOTE_DATE_FORMAT);
  const updatedAt = now.valueOf();
  const tags = (text.match(QUICK_NOTE_TAG_REGEX) || []).join(" ");

  return {
    content: applyTemplate(text, time, tags, contentTemplate),
    time,
    updatedDate,
    updatedAt,
  };
}
