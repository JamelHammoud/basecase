import { useEffect, useState } from 'react';
import type { MyPrinter } from '../data/printers';
import { printBridge, type PrintToolsStatus, type SavedPrinter } from '../print/printBridge';

export function usePrinters() {
  const [printers, setPrinters] = useState<SavedPrinter[]>([]);
  const [printTools, setPrintTools] = useState<PrintToolsStatus | null>(null);

  const refreshPrintTools = async () => {
    try {
      setPrintTools(await printBridge.status());
    } catch {
      setPrintTools(null);
    }
  };

  useEffect(() => {
    printBridge
      .printers()
      .then(setPrinters)
      .catch(() => {});
    printBridge
      .status()
      .then(setPrintTools)
      .catch(() => {});
  }, []);

  const savePrinters = async (list: MyPrinter[]) => {
    const saved = await printBridge.savePrinters(list);

    setPrinters(saved);

    return saved;
  };

  const setPrinterSecret = async (id: string, secret: string) => {
    const result = await printBridge.setSecret(id, secret);

    setPrinters((list) => list.map((p) => (p.id === id ? { ...p, hasSecret: result.hasSecret } : p)));

    return result;
  };

  return { printers, savePrinters, setPrinterSecret, printTools, refreshPrintTools };
}

export type PrintersState = ReturnType<typeof usePrinters>;
