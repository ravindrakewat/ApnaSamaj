/**
 * Lightweight, zero-dependency relative date/time formatter for Apna Samaj Mobile.
 * Designed for low-memory Android environments without requiring moment or date-fns.
 */

const HINDI_MONTHS = [
  'जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
  'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'
];

const ENGLISH_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export function formatRelativeTime(
  dateInput: string | Date | number,
  lang: 'hi' | 'en' = 'hi'
): string {
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) {
      return lang === 'hi' ? 'अभी-अभी' : 'Just now';
    }

    if (diffMinutes < 60) {
      return lang === 'hi'
        ? `${diffMinutes} मिनट पहले`
        : `${diffMinutes}m ago`;
    }

    if (diffHours < 24) {
      return lang === 'hi'
        ? `${diffHours} घंटे पहले`
        : `${diffHours}h ago`;
    }

    if (diffDays === 1) {
      return lang === 'hi' ? 'कल' : 'Yesterday';
    }

    if (diffDays < 7) {
      return lang === 'hi'
        ? `${diffDays} दिन पहले`
        : `${diffDays}d ago`;
    }

    // Format as Day Month Year
    const day = date.getDate();
    const month = date.getMonth();
    const year = date.getFullYear();

    if (lang === 'hi') {
      const monthName = HINDI_MONTHS[month] || '';
      return `${day} ${monthName} ${year !== now.getFullYear() ? year : ''}`.trim();
    } else {
      const monthName = ENGLISH_MONTHS[month] || '';
      return `${day} ${monthName} ${year !== now.getFullYear() ? year : ''}`.trim();
    }
  } catch {
    return '';
  }
}

