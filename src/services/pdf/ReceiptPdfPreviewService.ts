/** Android PDF preview bridge used by the Receipt Preview screen. */

import {NativeModules} from 'react-native';

type PdfPreviewModule = {
  renderPdf: (path: string) => Promise<string[]>;
  openPdf: (path: string) => Promise<void>;
};

function getPreviewModule(): PdfPreviewModule {
  const module = NativeModules.ReceiptPdfPreview as PdfPreviewModule | undefined;
  if (!module) {
    throw new Error('PDF preview is unavailable. Rebuild the Android app and try again.');
  }
  return module;
}

export function renderPdfPages(path: string): Promise<string[]> {
  return getPreviewModule().renderPdf(path);
}

export function openPdfExternally(path: string): Promise<void> {
  return getPreviewModule().openPdf(path);
}
