export interface InventoryItem {
  id: string;
  name: string;
  category: "prescription" | "otc" | "supplies" | "wellness";
  price: number;
  stock: number;
  minStock: number;
  barcode: string;
  expiryDate?: string;
  manufacturer?: string;
}

export interface Sale {
  id: string;
  date: Date;
  items: { item: InventoryItem; quantity: number }[];
  total: number;
  paymentMethod: "cash" | "paypal";
  seniorDiscount?: boolean;
}

export interface CartItem {
  item: InventoryItem;
  quantity: number;
}