function getColorByPercentage(percentage: number, isDark: boolean): string {
  const colors = {
    positive: {
      veryStrong: isDark ? '#047857' : '#059669',  // >3%
      strong: isDark ? '#059669' : '#10b981',      // 2-3%
      medium: isDark ? '#10b981' : '#34d399',      // 1-2%
      weak: isDark ? '#34d399' : '#6ee7b7',        // 0.5-1%
      veryWeak: isDark ? '#6ee7b7' : '#a7f3d0',    // 0-0.5%
    },
    negative: {
      veryStrong: isDark ? '#b91c1c' : '#dc2626',  // <-3%
      strong: isDark ? '#dc2626' : '#ef4444',      // -2-3%
      medium: isDark ? '#ef4444' : '#f87171',      // -1-2%
      weak: isDark ? '#f87171' : '#fca5a5',        // -0.5-1%
      veryWeak: isDark ? '#fca5a5' : '#fee2e2',    // 0-0.5%
    },
    neutral: isDark ? '#374151' : '#f3f4f6'
  };

  const thresholds = {
    veryStrong: 3.0,
    strong: 2.0,
    medium: 1.0,
    weak: 0.5,
    neutral: 0.2
  };

  const getOpacity = (value: number): number => {
    const absValue = Math.abs(value);
    if (absValue >= thresholds.veryStrong) return 0.95;
    if (absValue >= thresholds.strong) return 0.85;
    if (absValue >= thresholds.medium) return 0.75;
    if (absValue >= thresholds.weak) return 0.65;
    return 0.55;
  };

  let baseColor: string;
  const absPercentage = Math.abs(percentage);

  if (absPercentage < thresholds.neutral) {
    return colors.neutral;
  } else if (percentage > 0) {
    if (absPercentage >= thresholds.veryStrong) baseColor = colors.positive.veryStrong;
    else if (absPercentage >= thresholds.strong) baseColor = colors.positive.strong;
    else if (absPercentage >= thresholds.medium) baseColor = colors.positive.medium;
    else if (absPercentage >= thresholds.weak) baseColor = colors.positive.weak;
    else baseColor = colors.positive.veryWeak;
  } else {
    if (absPercentage >= thresholds.veryStrong) baseColor = colors.negative.veryStrong;
    else if (absPercentage >= thresholds.strong) baseColor = colors.negative.strong;
    else if (absPercentage >= thresholds.medium) baseColor = colors.negative.medium;
    else if (absPercentage >= thresholds.weak) baseColor = colors.negative.weak;
    else baseColor = colors.negative.veryWeak;
  }

  const opacity = getOpacity(percentage);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(baseColor);
  if (!result) return baseColor;
  
  const rgb = {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  };

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}