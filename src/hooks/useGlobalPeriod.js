import { useState, useEffect } from 'react';

export function useGlobalPeriod(defaultVal = 'this_month') {
  const [period, setPeriod] = useState(() => {
    return localStorage.getItem('autonest_global_period') || defaultVal;
  });

  useEffect(() => {
    localStorage.setItem('autonest_global_period', period);
  }, [period]);

  return [period, setPeriod];
}
