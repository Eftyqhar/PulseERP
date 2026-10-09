export type Role = "super_admin" | "moderator";

export interface AdminUser {
  uid: string;
  email: string;
  displayName?: string;
  role: Role;
  createdAt: number;
  disabled?: boolean;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

export interface Brand {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

export interface Supplier {
  id: string;
  company: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  totalPurchases?: number;
  lastPurchase?: number | null;
  dueAmount?: number;
  paidAmount?: number;
  createdAt: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  categoryId?: string;
  brandId?: string;
  supplierId?: string;
  buyingPrice: number;
  sellingPrice: number;
  courierCost: number;
  packagingCost: number;
  marketingCost: number;
  adsCost: number;
  influencerCost: number;
  promotionCost: number;
  marketplaceFee: number;
  transactionFee: number;
  otherCost: number;
  shipmentCost: number;
  customsDuty: number;
  importTax: number;
  clearanceFee: number;
  importOtherCost: number;
  currentStock: number;
  minimumStock: number;
  reservedStock: number;
  damagedStock: number;
  images?: string[];
  description?: string;
  status: "active" | "inactive";
  createdAt: number;
  updatedAt: number;
}

export interface Purchase {
  id: string;
  supplierId: string;
  invoiceNumber: string;
  purchaseDate: number;
  items: Array<{
    productId: string;
    quantity: number;
    buyingPrice: number;
  }>;
  shippingCost: number;
  otherCost: number;
  totalCost: number;
  status: "pending" | "received" | "cancelled";
  notes?: string;
  createdAt: number;
  createdBy: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    sellingPrice: number;
  }>;
  discount: number;
  deliveryCharge: number;
  courierCost: number;
  paymentMethod: "cod" | "bkash" | "nagad" | "card" | "bank" | "other";
  status: "pending" | "processing" | "shipped" | "delivered" | "returned" | "cancelled";
  soldBy?: string;
  orderDate: number;
  deliveredDate?: number | null;
  notes?: string;
  createdAt: number;
  createdBy: string;
}

export interface PreOrder {
  id: string;
  preOrderNumber: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    sellingPrice: number;
  }>;
  advancePayment: number;
  totalAmount: number;
  paymentMethod: "cod" | "bkash" | "nagad" | "card" | "bank" | "other";
  expectedDate?: number | null;
  status: "pending" | "confirmed" | "fulfilled" | "cancelled";
  orderDate: number;
  fulfilledDate?: number | null;
  notes?: string;
  createdAt: number;
  createdBy: string;
}

export interface Expense {
  id: string;
  category:
    | "advertising"
    | "courier"
    | "packaging"
    | "office_rent"
    | "salary"
    | "internet"
    | "electricity"
    | "miscellaneous";
  amount: number;
  description?: string;
  date: number;
  createdAt: number;
  createdBy: string;
}

export interface Investment {
  id: string;
  source: string;
  amount: number;
  date: number;
  notes?: string;
  investorId?: string;
  createdAt: number;
  createdBy: string;
}

export interface Investor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  sharePercent?: number;
  notes?: string;
  joinedAt: number;
  createdAt: number;
  createdBy: string;
}

export interface AuditLog {
  id: string;
  timestamp: number;
  userId: string;
  userEmail: string;
  role: Role;
  action: string;
  entity?: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  userAgent?: string;
}

export interface NotificationItem {
  id: string;
  type:
    | "low_stock"
    | "out_of_stock"
    | "new_purchase"
    | "price_changed"
    | "supplier_due"
    | "daily_summary";
  title: string;
  message: string;
  read: boolean;
  link?: string;
  createdAt: number;
}

export interface StockHistory {
  id: string;
  productId: string;
  type: "purchase" | "sale" | "adjustment" | "return" | "damage";
  quantity: number; // signed
  reason?: string;
  refId?: string;
  createdAt: number;
  createdBy: string;
}

export interface Loan {
  id: string;
  lender: string;
  principal: number;
  interestRate: number;
  startDate: number;
  dueDate?: number | null;
  status: "active" | "settled";
  notes?: string;
  createdAt: number;
  createdBy: string;
}

export interface LoanRepayment {
  id: string;
  loanId: string;
  amount: number;
  date: number;
  method?: string;
  notes?: string;
  createdAt: number;
  createdBy: string;
}
