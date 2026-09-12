export function timeToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function calculateShiftDurations(
  start_time: string,
  end_time: string,
  break_start_time?: string | null,
  break_end_time?: string | null
) {
  const start = timeToMinutes(start_time);
  const end = timeToMinutes(end_time);

  let gross = end - start;
  if (gross <= 0) gross += 24 * 60; // overnight shift

  let breakDuration = 0;
  if (break_start_time && break_end_time) {
    const breakStart = timeToMinutes(break_start_time);
    const breakEnd = timeToMinutes(break_end_time);
    
    let breakStartOffset = breakStart - start;
    if (breakStartOffset < 0) breakStartOffset += 24 * 60;
    
    let breakEndOffset = breakEnd - start;
    if (breakEndOffset <= 0) breakEndOffset += 24 * 60;
    
    breakDuration = breakEndOffset - breakStartOffset;
    if (breakDuration < 0) breakDuration = 0; // fallback just in case
  }

  const net = gross - breakDuration;

  return {
    grossMinutes: gross,
    breakMinutes: breakDuration,
    netMinutes: net,
    formattedNet: `${Math.floor(net / 60)} س${net % 60 > 0 ? ` و ${net % 60} د` : ''}`
  };
}
