/**
 * Profile.ts — Business Profile and Receipt Templates
 *
 * Defines the configuration for the customer's business and
 * how receipts should be rendered for A4 and Thermal pipelines.
 */

export interface BusinessProfile {
  identity: {
    businessName: string;
    shortName?: string;
    businessType?: string;
  };
  contact: {
    country: string;
    city: string;
    addressLine1: string;
    addressLine2?: string;
    poBox?: string;
    phone: string;
    mobile?: string;
    email?: string;
    website?: string;
  };
  tax: {
    taxRegistrationLabel: string;
    taxRegistrationNumber?: string;
    tradeLicenseNumber?: string;
    commercialRegistrationNumber?: string;
    additionalRegistrationLabel?: string;
    additionalRegistrationNumber?: string;
  };
  branding: {
    logoUri?: string;
    logoVisible: boolean;
  };
  receiptDefaults: {
    receiptTitle: string;
    currencyCode: string;
    currencySymbol: string;
    currencyPosition: 'before' | 'after';
    defaultTaxLabel: string;
    defaultTaxRate: number;
  };
  footer: {
    footerMessage?: string;
    additionalFooterText?: string;
  };
}

export interface A4Template {
  // Visibility
  showLogo: boolean;
  showBusinessName: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showTaxRegistration: boolean;
  
  showInvoiceNumber: boolean;
  showDate: boolean;
  showTime: boolean;
  showCustomerName: boolean;
  showCustomerPhone: boolean;
  showCustomerAddress: boolean;
  showSalesman: boolean;
  showPaymentMethod: boolean;
  
  showItemCode: boolean;
  showItemDescription: boolean;
  showQuantity: boolean;
  showUnitPrice: boolean;
  showDiscount: boolean;
  showVat: boolean;
  showItemTotal: boolean;
  
  showSubtotal: boolean;
  showTaxableAmount: boolean;
  showTotalDiscount: boolean;
  showVatTotal: boolean;
  showRoundOff: boolean;
  showGrandTotal: boolean;
  showAmountPaid: boolean;
  showBalanceDue: boolean;
  
  showFooter: boolean;

  // Layout settings
  headerAlignment: 'left' | 'center' | 'right';
  logoSize: 'small' | 'medium' | 'large';
  showSeparators: boolean;
}

export interface ThermalTemplate {
  // Visibility
  showLogo: boolean;
  showBusinessName: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showTaxRegistration: boolean;
  
  showInvoiceNumber: boolean;
  showDateTime: boolean;
  showCustomerName: boolean;
  showSalesman: boolean;
  
  showItemCode: boolean;
  showItemDescription: boolean;
  showQuantity: boolean;
  showUnitPrice: boolean;
  showItemTotal: boolean;
  
  showDiscount: boolean;
  showVat: boolean;
  showSubtotal: boolean;
  showGrandTotal: boolean;
  showAmountPaid: boolean;
  showBalanceDue: boolean;
  
  showFooter: boolean;

  // Layout settings
  fontMode: 'compact' | 'normal' | 'large';
  headerAlignment: 'left' | 'center' | 'right';
  logoSize: 'small' | 'medium' | 'large';
  showSeparators: boolean;
}

// ---------------------------------------------------------------------------
// Default Configurations (Fallback)
// ---------------------------------------------------------------------------

export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  identity: {
    businessName: 'WINSOFT PRINT STATION',
  },
  contact: {
    country: 'UAE',
    city: 'Dubai',
    addressLine1: 'Business Bay',
    phone: '',
  },
  tax: {
    taxRegistrationLabel: 'TRN',
  },
  branding: {
    logoVisible: false,
  },
  receiptDefaults: {
    receiptTitle: 'TAX INVOICE',
    currencyCode: 'AED',
    currencySymbol: 'AED',
    currencyPosition: 'before',
    defaultTaxLabel: 'VAT',
    defaultTaxRate: 5,
  },
  footer: {
    footerMessage: 'Thank you for your business!',
  },
};

export const DEFAULT_A4_TEMPLATE: A4Template = {
  showLogo: false,
  showBusinessName: true,
  showAddress: true,
  showPhone: true,
  showEmail: true,
  showTaxRegistration: true,
  showInvoiceNumber: true,
  showDate: true,
  showTime: true,
  showCustomerName: true,
  showCustomerPhone: true,
  showCustomerAddress: true,
  showSalesman: true,
  showPaymentMethod: true,
  showItemCode: true,
  showItemDescription: true,
  showQuantity: true,
  showUnitPrice: true,
  showDiscount: true,
  showVat: true,
  showItemTotal: true,
  showSubtotal: true,
  showTaxableAmount: true,
  showTotalDiscount: true,
  showVatTotal: true,
  showRoundOff: true,
  showGrandTotal: true,
  showAmountPaid: true,
  showBalanceDue: true,
  showFooter: true,
  headerAlignment: 'left',
  logoSize: 'medium',
  showSeparators: true,
};

export const DEFAULT_THERMAL_TEMPLATE: ThermalTemplate = {
  showLogo: false,
  showBusinessName: true,
  showAddress: true,
  showPhone: true,
  showTaxRegistration: true,
  showInvoiceNumber: true,
  showDateTime: true,
  showCustomerName: true,
  showSalesman: true,
  showItemCode: true,
  showItemDescription: true,
  showQuantity: true,
  showUnitPrice: true,
  showItemTotal: true,
  showDiscount: true,
  showVat: true,
  showSubtotal: true,
  showGrandTotal: true,
  showAmountPaid: true,
  showBalanceDue: true,
  showFooter: true,
  fontMode: 'normal',
  headerAlignment: 'center',
  logoSize: 'medium',
  showSeparators: true,
};
