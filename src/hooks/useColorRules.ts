import { useEffect, useState } from 'react';
import { ColorRulesConfig, defaultColorRules } from '../shared/domain/cnh';

export function useColorRules() {
  const [colorRules, setColorRules] = useState<ColorRulesConfig>(() => {
    const local = localStorage.getItem('auto_erp_color_rules');
    return local ? JSON.parse(local) : defaultColorRules;
  });

  useEffect(() => {
    localStorage.setItem('auto_erp_color_rules', JSON.stringify(colorRules));
  }, [colorRules]);

  return { colorRules, setColorRules };
}
