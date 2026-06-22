/* eslint-disable @typescript-eslint/no-require-imports */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import countries from 'i18n-iso-countries';
import parsePhoneNumberFromString from 'libphonenumber-js';
import { ColumnValue } from '../interfaces/monday.interface';
import { FormAnswer, JotformControlType } from '../interfaces/form.interface';
import createLogger from '../logger/logger';
import { extractErrorInfo } from '../logger/logger.utils';

// Extend dayjs with UTC plugin
dayjs.extend(utc);
dayjs.extend(timezone);
const logger = createLogger();

function isValidIanaTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isUtcMidnight(d: dayjs.Dayjs): boolean {
  return d.hour() === 0 && d.minute() === 0 && d.second() === 0 && d.millisecond() === 0;
}

/**
 * Jotform often sends `...Z` while the clock digits are in the process local timezone (`TZ` / host).
 * Treat the parsed UTC components as that local wall time, then convert to a real UTC instant by
 * subtracting `dayjs(thatInstant).utcOffset()` (same sign convention as dayjs / Date).
 * Caller skips this for true UTC midnight (calendar date-only).
 */
function jotformZWallClockToUtc(parsedAsUtc: dayjs.Dayjs, submissionTimezone?: string): dayjs.Dayjs {
  const offsetMinutes =
    submissionTimezone && isValidIanaTimezone(submissionTimezone)
      ? dayjs(parsedAsUtc.valueOf()).tz(submissionTimezone).utcOffset()
      : dayjs(parsedAsUtc.valueOf()).utcOffset();
  return parsedAsUtc.subtract(offsetMinutes, 'minute');
}

/** Jotform-hosted upload URLs; used to route proxy text columns → Monday file columns */
export const JOTFORM_UPLOADS_URL_PREFIX = 'https://www.jotform.com/uploads';

/** Placeholder sent to Monday instead of raw signature data URLs; real image is uploaded from `formQuestions[fieldKey]`. */
export const JOTFORM_SIGNATURE_TYPE = 'control_signature' as const;

// Load English country names
countries.registerLocale(require('i18n-iso-countries/langs/en.json'));

export const convertMondayData = (data: ColumnValue) => {
  const obj = { ...data, ...data.column };
  if (!data?.value) {
    obj.value = null;
  } else {
    switch (obj.type) {
      case 'text':
        obj.value = data.value.replace(/["]+/g, '');
        break;
      case 'long_text':
        obj.value = JSON.parse(data.value).text;
        break;
      case 'phone':
        obj.value = JSON.parse(data.value).phone;
        break;
      case 'status':
      case 'color':
        obj.value = data.text;
        break;
      case 'email':
        obj.value = JSON.parse(data.value).email;
        break;
      case 'dropdown':
        obj.value = JSON.parse(data.value).ids;
        break;
      case 'boolean':
        obj.value = JSON.parse(data.value).checked;
        break;
      case 'date':
        obj.value = JSON.parse(data.value).date;
        break;
      case 'people':
        obj.value = JSON.parse(data.value).personsAndTeams;
        break;
      case 'link':
        obj.value = JSON.parse(data.value).url;
        break;
      case 'board_relation':
        obj.value = JSON.parse(data.value)?.linkedPulseIds?.map((item: { linkedPulseId: number }) => item.linkedPulseId);
        break;

      default:
        obj.value = data.value;
        break;
    }
  }

  return {
    id: obj.id,
    title: obj.title,
    type: obj.type,
    value: obj.value,
    text: obj.text,
  };
};

export const getCountryCodeFromCountryName = (name: string): string => {
  const countryCode = countries.getAlpha2Code(name, 'en'); // e.g., 'US' from 'United States'
  return countryCode || '';
};

export const formatPhoneNumber = (input: string): { phone: string; countryShortName: string | undefined } => {
  // Handle E.164 format directly (e.g., +84123911341)
  if (input.startsWith('+')) {
    const phoneNumber = parsePhoneNumberFromString(input);

    if (!phoneNumber || !phoneNumber.isValid()) {
      throw new Error(`Invalid phone number: ${input}`);
    }

    return {
      phone: phoneNumber.number, // in E.164 format, e.g., +84123911341
      countryShortName: phoneNumber.country,
    };
  } else {
    throw new Error(`Invalid phone number: ${input}`);
  }
};

/**
 * Safely parse JSON-like strings without throwing.
 * Returns the original input when parsing fails or input isn't a string.
 */
const safeParse = <T = unknown>(value: unknown): T | unknown => {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return value;

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return value;
  }
};

export function parseSignaturePlaceholderFromItemValue(value: unknown): { fieldKey: string } | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) return null;
  const parsed = safeParse(trimmed) as Record<string, unknown>;
  if (!isObjectRecord(parsed)) return null;
  if (parsed.type !== JOTFORM_SIGNATURE_TYPE || typeof parsed.fieldKey !== 'string' || !parsed.fieldKey.trim()) {
    return null;
  }
  return { fieldKey: parsed.fieldKey.trim() };
}

/** Decode `data:image/...;base64,...` from Jotform signature field into a buffer for Monday file upload. */
export function decodeJotformSignatureDataUrl(dataUrl: string): { buffer: Buffer; fileName: string } | null {
  const trimmed = dataUrl.trim();
  const match = trimmed.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const b64 = match[2].replace(/\s/g, '');
  try {
    const buffer = Buffer.from(b64, 'base64');
    if (!buffer.length) return null;
    const ext = mime.includes('png')
      ? 'png'
      : mime.includes('jpeg') || mime.includes('jpg')
        ? 'jpg'
        : mime.includes('webp')
          ? 'webp'
          : mime.includes('gif')
            ? 'gif'
            : 'png';
    return { buffer, fileName: `signature.${ext}` };
  } catch {
    return null;
  }
}

export const convertMondayColumnsValue = (itemMapping: Record<string, unknown>) => {
  const payload: Record<string, unknown> = {};
  for (const key in itemMapping) {
    if (key !== '__groupId__') {
      try {
        if (parseSignaturePlaceholderFromItemValue(itemMapping[key])) {
          continue;
        }
        if (key.toLowerCase().includes('email')) {
          const emailTrimmed = (itemMapping[key] as string)?.trim();
          payload[key] = {
            email: emailTrimmed,
            text: emailTrimmed,
          };
        } else if (key.toLowerCase().includes('phone')) {
          try {
            const formattedPhoneNumber = formatPhoneNumber(itemMapping[key] as string);
            payload[key] = formattedPhoneNumber;
          } catch (error) {
            logger.error(`commonFunctions.formatPhoneNumber - Invalid phone number: ${itemMapping[key]}`, { error: extractErrorInfo(error) });
          }
        } else if (key.toLowerCase().includes('color')) {
          payload[key] = {
            label: itemMapping[key],
          };
        } else if (key.toLowerCase().includes('hour')) {
          const raw = itemMapping[key];
          const dateValue = typeof raw === 'string' ? raw.trim() : raw != null ? String(raw).trim() : '';
          if (dateValue) {
            try {
              const trimmed = dateValue.trim();
              const instant = dayjs(trimmed).utc();
              if (instant.isValid()) {
                payload[key] = {
                  hour: instant.hour(),
                  minute: instant.minute(),
                };
              }
            } catch (error) {
              logger.error(`commonFunctions.convertMondayColumnsValue - Failed to parse hour column: ${dateValue}`, {
                error: extractErrorInfo(error),
              });
            }
          } else {
            payload[key] = {
              hour: 0,
              minute: 0,
            };
          }
        } else if (key.toLowerCase().includes('date')) {
          const raw = itemMapping[key];
          const dateValue = typeof raw === 'string' ? raw.trim() : raw != null ? String(raw).trim() : '';
          if (dateValue) {
            try {
              // Calendar date only — omit `time` so Monday does not shift midnight UTC into local time in the UI.
              const trimmed = dateValue.trim();
              if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                payload[key] = { date: trimmed };
              } else {
                const instant = dayjs(trimmed).utc();
                if (instant.isValid()) {
                  if (isUtcMidnight(instant)) {
                    payload[key] = { date: instant.format('YYYY-MM-DD') };
                  } else {
                    payload[key] = {
                      date: instant.format('YYYY-MM-DD'),
                      time: instant.format('HH:mm:ss'),
                    };
                  }
                }
              }
            } catch (error) {
              logger.error(`commonFunctions.convertMondayColumnsValue - Failed to parse date: ${dateValue}`, { error: extractErrorInfo(error) });
            }
          } else {
            payload[key] = {
              date: '',
              text: '',
            };
          }
        } else if (key.toLowerCase().includes('dropdown')) {
          // Clean the " ;" at the end of the value (Monday auto add this when perform mapping the dropdown)
          if (typeof itemMapping[key] === 'string') {
            itemMapping[key] = (itemMapping[key] as string).replace(/;$/, '').trim();
          }
          const parsedDropdownValue = safeParse(itemMapping[key]);
          payload[key] = {
            labels: Array.isArray(parsedDropdownValue) ? parsedDropdownValue : [parsedDropdownValue],
          };
        } else if (key.toLowerCase().includes('link')) {
          // The link can be without www, need to update the link to the correct format
          const linkValue = itemMapping[key];
          const rawLink = typeof linkValue === 'string' ? linkValue.trim() : '';
          if (!rawLink) {
            payload[key] = { url: '', text: '' };
            continue;
          }

          const normalizedLink = /^https?:\/\//i.test(rawLink) ? rawLink : `https://${rawLink}`;
          if (!URL.canParse(normalizedLink)) {
            logger.warn(`commonFunctions.convertMondayColumnsValue - Skipping invalid link value for ${key}`, {
              value: rawLink,
            });
            payload[key] = { url: '', text: '' };
            continue;
          }

          payload[key] = {
            url: normalizedLink,
            text: rawLink,
          };
        } else {
          payload[key] = itemMapping[key];
        }
      } catch (error) {
        logger.error(`commonFunctions.convertMondayColumnsValue - Failed to convert ${key}`, { error: extractErrorInfo(error) });
      }
    }
  }
  return payload;
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Filters an object to keep only properties with meaningful values, removing empty strings, undefined, null, NaN, empty arrays, and empty objects.
 * @param obj The object to filter
 * @returns A new object with only properties that have meaningful values
 */
const EXCLUDED_KEYS = ['Contacts'];

const ENUM_KEYS = ['Region', 'DefaultCurrency', 'WorkflowStatus', 'Category', 'Type', 'Role'];

export function filterHqPayload<T extends Record<string, unknown>>(obj: T): Partial<T> {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) {
    return obj;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    // If key is enum field and empty, don't send it
    if (
      ENUM_KEYS.includes(key) &&
      (value === undefined ||
        value === null ||
        value === '' ||
        (typeof value === 'number' && isNaN(value)) ||
        (Array.isArray(value) && value.length === 0) ||
        (typeof value === 'object' && value !== null && Object.keys(value).length === 0))
    ) {
      continue;
    }
    if (EXCLUDED_KEYS.includes(key)) {
      result[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 0) {
        result[key] = value[0];
      } else {
        // If array is empty, don't send it
        continue;
      }
    } else if (typeof value === 'object' && value !== null) {
      // This to handle dateWithTime for case column format is DateTime
      if ('dateWithTime' in value) {
        result[key] = (value as { dateWithTime: unknown }).dateWithTime;
      } else {
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeAddressLikeValue(value: Record<string, unknown>): string | null {
  const hasAddressShape = ['addr_line1', 'addr_line2', 'city', 'state', 'postal', 'country'].some((k) => k in value);
  if (!hasAddressShape) return null;
  return Object.values(value)
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Jotform date/time object → normalized string, or null if not recognized.
 * - Date + time → UTC ISO string (`toISOString()`).
 * - Date only (no hour/min) → `YYYY-MM-DD` (no midnight UTC ISO, so Monday date columns stay date-only).
 */
function normalizeDateTimeLikeValue(value: Record<string, unknown>, submissionTimezone?: string): string | null {
  const year = typeof value.year === 'string' ? value.year.trim() : '';
  const month = typeof value.month === 'string' ? value.month.trim() : '';
  const day = typeof value.day === 'string' ? value.day.trim() : '';
  const hasDate = !!(year && month && day);

  const ampm = typeof value.ampm === 'string' ? value.ampm.trim().toUpperCase() : '';
  let hour = typeof value.hour === 'string' ? value.hour.trim() : '';
  let min = typeof value.min === 'string' ? value.min.trim() : '';
  if ((!hour || !min) && typeof value.timeInput === 'string') {
    const match = value.timeInput.trim().match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      hour = match[1];
      min = match[2];
    }
  }

  let timeValue: string | undefined;
  if (hour && min) {
    let hourNum = Number(hour);
    const minNum = Number(min);
    if (!Number.isNaN(hourNum) && !Number.isNaN(minNum)) {
      if (ampm === 'PM' && hourNum < 12) hourNum += 12;
      if (ampm === 'AM' && hourNum === 12) hourNum = 0;
      timeValue = `${String(hourNum).padStart(2, '0')}:${String(minNum).padStart(2, '0')}:00`;
    }
  }

  if (!hasDate && !timeValue) return null;

  if (hasDate && timeValue) {
    const [h, m] = timeValue.split(':').map((part) => Number(part));
    const utcDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), h || 0, m || 0, 0));
    if (!Number.isNaN(utcDate.getTime())) {
      const parsedAsUtc = dayjs.utc(utcDate.toISOString());
      const instant = !isUtcMidnight(parsedAsUtc) ? jotformZWallClockToUtc(parsedAsUtc, submissionTimezone) : parsedAsUtc;
      return instant.toISOString();
    }
  }

  if (hasDate) {
    const y = Number(year);
    const mo = Number(month);
    const d = Number(day);
    if (!Number.isNaN(y) && !Number.isNaN(mo) && !Number.isNaN(d)) {
      const utcMs = Date.UTC(y, mo - 1, d);
      if (!Number.isNaN(utcMs)) {
        return dayjs.utc(utcMs).format('YYYY-MM-DD');
      }
    }
  }

  if (timeValue) {
    const [h, m] = timeValue.split(':').map((part) => Number(part));
    const utcDate = new Date(Date.UTC(1970, 0, 1, h || 0, m || 0, 0));
    if (!Number.isNaN(utcDate.getTime())) {
      return dayjs(utcDate).utc().format('hh:mm A');
    }
  }

  return null;
}

/**
 * Transform Jotform submission answers into a flat key/value object.
 * - Uses `qid` (fallback: answer map key) as output key so IDs match field definitions.
 * - Skips non-answer controls like headers/buttons.
 * - Normalizes value shapes to match sync expectations.
 */
export function transformAnswer(
  answers: Record<string, FormAnswer>,
  options?: {
    submissionTimezone?: string;
  },
): Record<string, unknown> {
  const submissionTimezone = options?.submissionTimezone;
  return Object.entries(answers).reduce<Record<string, unknown>>((acc, [answerKey, answerData]) => {
    if (!answerData || !('answer' in answerData)) return acc;

    const fieldKey = String(answerData.qid || answerKey).trim();
    if (!fieldKey) return acc;

    const answerValue = answerData.answer;

    switch (answerData.type) {
      case JotformControlType.HEAD:
      case JotformControlType.BUTTON:
        return acc;
      case JotformControlType.FULLNAME: {
        const obj = isObjectRecord(answerValue) ? answerValue : {};
        const first = typeof obj.first === 'string' ? obj.first.trim() : '';
        const last = typeof obj.last === 'string' ? obj.last.trim() : '';
        acc['name'] = [first, last].filter(Boolean).join(' ').trim();
        return acc;
      }
      case JotformControlType.NUMBER: {
        acc[fieldKey] = typeof answerValue === 'string' ? parseFloat(answerValue) : answerValue;
        return acc;
      }
      case JotformControlType.CHECKBOX: {
        if (Array.isArray(answerValue)) {
          const selectedOptions = answerValue;
          acc[fieldKey] = JSON.stringify(selectedOptions);
          return acc;
        }
        if (isObjectRecord(answerValue) && Object.values(answerValue).length > 0) {
          const selectedOptions = Object.values(answerValue);
          acc[fieldKey] = JSON.stringify(selectedOptions);
          return acc;
        }
        return acc;
      }
      case JotformControlType.PHONE: {
        acc[fieldKey] = typeof answerData.prettyFormat === 'string' ? answerData.prettyFormat : '';
        return acc;
      }
      case JotformControlType.ADDRESS: {
        if (isObjectRecord(answerValue)) {
          acc[fieldKey] = normalizeAddressLikeValue(answerValue) ?? answerValue;
          return acc;
        }
        acc[fieldKey] = answerValue;
        return acc;
      }
      case JotformControlType.DATETIME:
      case JotformControlType.DATE:
      case JotformControlType.TIME: {
        if (isObjectRecord(answerValue)) {
          acc[fieldKey] = normalizeDateTimeLikeValue(answerValue, submissionTimezone) ?? answerValue;
          return acc;
        }
        acc[fieldKey] = answerValue;
        return acc;
      }
      case JotformControlType.FILEUPLOAD: {
        // Multiple file upload
        if (Array.isArray(answerValue)) {
          const uploadUrls = answerValue
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter((item) => item.includes(JOTFORM_UPLOADS_URL_PREFIX) && URL.canParse(item));
          acc[fieldKey] = uploadUrls.length ? uploadUrls.join(',') : answerValue.join(',');
          return acc;
        }
        // Single file upload
        if (typeof answerValue === 'string' && answerValue.includes(JOTFORM_UPLOADS_URL_PREFIX) && URL.canParse(answerValue)) {
          acc[fieldKey] = answerValue;
          return acc;
        }
        acc[fieldKey] = answerValue;
        return acc;
      }
      case JotformControlType.SIGNATURE: {
        acc[fieldKey] = answerValue;
        return acc;
      }
      case JotformControlType.EMAIL:
      case JotformControlType.TEXTBOX:
      case JotformControlType.TEXTAREA:
      case JotformControlType.RADIO:
      case JotformControlType.DROPDOWN:
      default:
        acc[fieldKey] = answerValue;
        return acc;
    }
  }, {});
}
