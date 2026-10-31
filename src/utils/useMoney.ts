import { useSyncExternalStore } from 'react';
import { currentMoney, subscribeMoney } from './currencyStore';

export const useMoney = () => useSyncExternalStore(subscribeMoney, currentMoney);
