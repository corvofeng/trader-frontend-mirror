import { format, subDays } from 'date-fns';

export function formatDate(date: Date | string, formatStr: string = 'MMM d, yyyy'): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, formatStr);
}

export function getDateRange(days: number) {
  const endDate = new Date();
  const startDate = subDays(endDate, days);
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  };
}

export function isValidDate(date: unknown): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}
