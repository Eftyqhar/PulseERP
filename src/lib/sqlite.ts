import initSqlJs, { type Database } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

const DB_NAME = "pulse_erp_db";
const STORE_NAME = "sqlite_store";
const DB_KEY = "pulse.sqlite";

let dbInstance: Database | null = null;
let initPromise: Promise<Database> | null = null;
const changeListeners = new Set<(path: string) => void>();

/** IndexedDB Helpers for persistent SQLite binary storage */
function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB is not available in this environment"));
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const idb = request.result;
      if (!idb.objectStoreNames.contains(STORE_NAME)) {
        idb.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadFromIndexedDB(): Promise<Uint8Array | null> {
  try {
    const idb = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(DB_KEY);
      req.onsuccess = () => resolve(req.result ? new Uint8Array(req.result) : null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Failed to load SQLite from IndexedDB, falling back to memory/local", err);
    return null;
  }
}

async function saveToIndexedDB(data: Uint8Array): Promise<void> {
  try {
    const idb = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(data.buffer, DB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("Failed to persist SQLite database to IndexedDB", err);
  }
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
export function persistDatabaseNow() {
  if (!dbInstance) return;
  try {
    const binary = dbInstance.export();
    saveToIndexedDB(binary);
  } catch (err) {
    console.error("Error exporting SQLite database", err);
  }
}

export function debouncePersist() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    persistDatabaseNow();
  }, 100);
}

/** Cryptographic helpers for User Passwords */
export async function hashPassword(password: string, salt: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    // Fallback for non-subtle crypto environments
    let hash = 0;
    const str = password + ":" + salt;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }
  const enc = new TextEncoder();
  const data = enc.encode(password + ":" + salt);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateSalt(): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/** Table Mapping */
export const TABLE_MAP: Record<string, string> = {
  users: "users",
  categories: "categories",
  brands: "brands",
  suppliers: "suppliers",
  products: "products",
  orders: "orders",
  preOrders: "pre_orders",
  pre_orders: "pre_orders",
  deliveries: "deliveries",
  returns: "returns",
  purchases: "purchases",
  expenses: "expenses",
  investments: "investments",
  investors: "investors",
  loans: "loans",
  loanRepayments: "loan_repayments",
  loan_repayments: "loan_repayments",
  stock_history: "stock_history",
  audit_logs: "audit_logs",
  notifications: "notifications",
  sellers: "sellers",
  wishlist: "wishlist",
};

export function parsePath(path: string): {
  type: "collection" | "doc" | "kv";
  table?: string;
  id?: string;
  field?: string;
} {
  const clean = path.replace(/^\/+/, "").replace(/\/+$/, "");
  const parts = clean.split("/");

  if (parts.length === 1) {
    const table = TABLE_MAP[parts[0]];
    if (table) return { type: "collection", table };
    return { type: "kv" };
  }

  if (parts.length === 2) {
    const table = TABLE_MAP[parts[0]];
    if (table) return { type: "doc", table, id: parts[1] };
    return { type: "kv" };
  }

  if (parts.length === 3) {
    const table = TABLE_MAP[parts[0]];
    if (table) return { type: "doc", table, id: parts[1], field: parts[2] };
  }

  return { type: "kv" };
}

/** Initialize SQLite and Schema */
export async function getSqliteDb(): Promise<Database> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let savedData: Uint8Array | null = null;
    if (typeof window !== "undefined") {
      savedData = await loadFromIndexedDB();
    }

    const SQL = await initSqlJs({
      locateFile: () => {
        // Prefer local public wasm or imported url
        return sqlWasmUrl || "/sql-wasm.wasm";
      },
    });

    const db = savedData ? new SQL.Database(savedData) : new SQL.Database();
    dbInstance = db;

    // Create Tables
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password_hash TEXT,
        salt TEXT,
        display_name TEXT,
        role TEXT,
        disabled INTEGER DEFAULT 0,
        created_at INTEGER,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        created_at INTEGER,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS brands (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        created_at INTEGER,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        company TEXT,
        name TEXT,
        phone TEXT,
        email TEXT,
        created_at INTEGER,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT,
        sku TEXT,
        category_id TEXT,
        brand_id TEXT,
        buying_price REAL,
        selling_price REAL,
        current_stock REAL,
        status TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_number TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        status TEXT,
        order_date INTEGER,
        delivered_date INTEGER,
        created_at INTEGER,
        created_by TEXT,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS pre_orders (
        id TEXT PRIMARY KEY,
        pre_order_number TEXT,
        customer_name TEXT,
        status TEXT,
        order_date INTEGER,
        created_at INTEGER,
        created_by TEXT,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        delivery_number TEXT,
        order_id TEXT,
        status TEXT,
        created_at INTEGER,
        created_by TEXT,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS returns (
        id TEXT PRIMARY KEY,
        return_number TEXT,
        order_id TEXT,
        status TEXT,
        created_at INTEGER,
        created_by TEXT,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        invoice_number TEXT,
        supplier_id TEXT,
        status TEXT,
        created_at INTEGER,
        created_by TEXT,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        category TEXT,
        amount REAL,
        date INTEGER,
        created_at INTEGER,
        created_by TEXT,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS investments (
        id TEXT PRIMARY KEY,
        investor_id TEXT,
        amount REAL,
        date INTEGER,
        created_at INTEGER,
        created_by TEXT,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS investors (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT,
        created_at INTEGER,
        created_by TEXT,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS loans (
        id TEXT PRIMARY KEY,
        lender TEXT,
        principal REAL,
        status TEXT,
        created_at INTEGER,
        created_by TEXT,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS loan_repayments (
        id TEXT PRIMARY KEY,
        loan_id TEXT,
        amount REAL,
        date INTEGER,
        created_at INTEGER,
        created_by TEXT,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS stock_history (
        id TEXT PRIMARY KEY,
        product_id TEXT,
        type TEXT,
        quantity REAL,
        created_at INTEGER,
        created_by TEXT,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        user_id TEXT,
        user_email TEXT,
        role TEXT,
        action TEXT,
        entity TEXT,
        entity_id TEXT,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        type TEXT,
        title TEXT,
        read INTEGER,
        created_at INTEGER,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS sellers (
        id TEXT PRIMARY KEY,
        name TEXT,
        created_at INTEGER,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS wishlist (
        id TEXT PRIMARY KEY,
        product_id TEXT,
        created_at INTEGER,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS kv_store (
        path TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER
      );
    `);

    // Check if initial seeding is needed
    await seedInitialData(db);

    debouncePersist();
    return db;
  })();

  return initPromise;
}

/** Seed demo data if database is brand new */
async function seedInitialData(db: Database) {
  const now = Date.now();
  const dayMs = 86400000;

  // 1. Ensure Super Admin Account
  const userCheck = db.exec("SELECT COUNT(*) AS count FROM users");
  const userCount = (userCheck[0]?.values[0]?.[0] as number) || 0;

  let adminUid = "admin_super_01";
  let adminEmail = "admin@pulseerp.com";

  if (userCount === 0) {
    const salt = generateSalt();
    const passHash = await hashPassword("admin123", salt);

    const adminProfile = {
      uid: adminUid,
      email: adminEmail,
      displayName: "Super Admin",
      role: "super_admin",
      createdAt: now,
      disabled: false,
    };

    db.run(
      `INSERT INTO users (id, email, password_hash, salt, display_name, role, disabled, created_at, data)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        adminUid,
        adminEmail,
        passHash,
        salt,
        "Super Admin",
        "super_admin",
        now,
        JSON.stringify(adminProfile),
      ],
    );

    // Default company settings
    const companySettings = {
      companyName: "PulseERP",
      logoUrl: "",
      currency: "BDT",
      lowStockThreshold: 5,
      emailAlerts: true,
    };
    db.run(`INSERT OR REPLACE INTO kv_store (path, value, updated_at) VALUES (?, ?, ?)`, [
      "settings/company",
      JSON.stringify(companySettings),
      now,
    ]);
  } else {
    const res = db.exec("SELECT id, email FROM users LIMIT 1");
    if (res.length && res[0].values?.length) {
      adminUid = res[0].values[0][0] as string;
      adminEmail = res[0].values[0][1] as string;
    }
  }

  // 2. Categories
  const catCheck = db.exec("SELECT COUNT(*) FROM categories");
  if (((catCheck[0]?.values[0]?.[0] as number) || 0) < 5) {
    const categories = [
      {
        id: "cat_1",
        name: "Electronics & Audio",
        description: "Headphones, speakers, microphones & audio gear",
        createdAt: now - dayMs * 10,
      },
      {
        id: "cat_2",
        name: "Everyday Carry & Leather",
        description: "Cardholders, wallets, key organizers & EDC",
        createdAt: now - dayMs * 9,
      },
      {
        id: "cat_3",
        name: "Workspace & Desk Setup",
        description: "Mechanical keyboards, lamps, monitor risers & mats",
        createdAt: now - dayMs * 8,
      },
      {
        id: "cat_4",
        name: "Bags & Travel Gear",
        description: "Waterproof backpacks, travel pouches & sling bags",
        createdAt: now - dayMs * 7,
      },
      {
        id: "cat_5",
        name: "Wearables & Fitness",
        description: "Smart health trackers, fitness bands & watch straps",
        createdAt: now - dayMs * 6,
      },
      {
        id: "cat_6",
        name: "Smart Power & Charging",
        description: "GaN chargers, magnetic power banks & braided cables",
        createdAt: now - dayMs * 5,
      },
    ];
    for (const c of categories) {
      db.run(
        `INSERT OR REPLACE INTO categories (id, name, description, created_at, data) VALUES (?, ?, ?, ?, ?)`,
        [c.id, c.name, c.description, c.createdAt, JSON.stringify(c)],
      );
    }
  }

  // 3. Brands
  const brandCheck = db.exec("SELECT COUNT(*) FROM brands");
  if (((brandCheck[0]?.values[0]?.[0] as number) || 0) < 5) {
    const brands = [
      {
        id: "br_1",
        name: "Pulse Prime",
        description: "In-house flagship line of lifestyle electronics",
        createdAt: now - dayMs * 10,
      },
      {
        id: "br_2",
        name: "Aura Tech",
        description: "Premium ergonomic consumer tech and fast charging",
        createdAt: now - dayMs * 9,
      },
      {
        id: "br_3",
        name: "Nordic Goods",
        description: "Minimalist Scandinavian desk setups and accessories",
        createdAt: now - dayMs * 8,
      },
      {
        id: "br_4",
        name: "CyberSonic",
        description: "High-fidelity studio audio equipment and microphones",
        createdAt: now - dayMs * 7,
      },
      {
        id: "br_5",
        name: "UrbanCarry",
        description: "Durable tactical everyday travel bags and packs",
        createdAt: now - dayMs * 6,
      },
    ];
    for (const b of brands) {
      db.run(
        `INSERT OR REPLACE INTO brands (id, name, description, created_at, data) VALUES (?, ?, ?, ?, ?)`,
        [b.id, b.name, b.description, b.createdAt, JSON.stringify(b)],
      );
    }
  }

  // 4. Suppliers
  const supCheck = db.exec("SELECT COUNT(*) FROM suppliers");
  if (((supCheck[0]?.values[0]?.[0] as number) || 0) < 4) {
    const suppliers = [
      {
        id: "sup_1",
        company: "Pacific Electronics Ltd",
        name: "Rahim Ahmed",
        phone: "+8801711223344",
        email: "rahim@pacificelec.com",
        address: "Motijheel C/A, Dhaka",
        totalPurchases: 145000,
        paidAmount: 130000,
        dueAmount: 15000,
        createdAt: now - dayMs * 25,
      },
      {
        id: "sup_2",
        company: "Apex Global Supplies",
        name: "Shakil Khan",
        phone: "+8801819876543",
        email: "shakil@apexsupply.com",
        address: "GEC Circle, Chittagong",
        totalPurchases: 92000,
        paidAmount: 92000,
        dueAmount: 0,
        createdAt: now - dayMs * 20,
      },
      {
        id: "sup_3",
        company: "Horizon Trade Co",
        name: "Tanvir Hossain",
        phone: "+8801912345678",
        email: "tanvir@horizontrade.bd",
        address: "Sector 7, Uttara, Dhaka",
        totalPurchases: 78000,
        paidAmount: 60000,
        dueAmount: 18000,
        createdAt: now - dayMs * 18,
      },
      {
        id: "sup_4",
        company: "Silicon Bay Distribution",
        name: "Farhana Yeasmin",
        phone: "+8801611002233",
        email: "farhana@siliconbay.com",
        address: "Road 11, Banani, Dhaka",
        totalPurchases: 110000,
        paidAmount: 95000,
        dueAmount: 15000,
        createdAt: now - dayMs * 15,
      },
    ];
    for (const s of suppliers) {
      db.run(
        `INSERT OR REPLACE INTO suppliers (id, company, name, phone, email, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.company, s.name, s.phone, s.email, s.createdAt, JSON.stringify(s)],
      );
    }
  }

  // 5. Products (12 comprehensive products)
  const prodCheck = db.exec("SELECT COUNT(*) FROM products");
  if (((prodCheck[0]?.values[0]?.[0] as number) || 0) < 10) {
    const products = [
      {
        id: "prod_1",
        name: "Wireless ANC Headphones",
        sku: "PLS-HP-01",
        barcode: "890123456001",
        categoryId: "cat_1",
        brandId: "br_4",
        supplierId: "sup_1",
        buyingPrice: 3200,
        sellingPrice: 4950,
        courierCost: 80,
        packagingCost: 40,
        marketingCost: 150,
        adsCost: 120,
        influencerCost: 0,
        promotionCost: 0,
        marketplaceFee: 50,
        transactionFee: 30,
        otherCost: 20,
        shipmentCost: 60,
        customsDuty: 0,
        importTax: 0,
        clearanceFee: 0,
        importOtherCost: 0,
        currentStock: 28,
        minimumStock: 5,
        reservedStock: 2,
        damagedStock: 0,
        status: "active",
        createdAt: now - dayMs * 14,
        updatedAt: now,
      },
      {
        id: "prod_2",
        name: "Minimalist Leather Cardholder",
        sku: "PLS-CH-02",
        barcode: "890123456002",
        categoryId: "cat_2",
        brandId: "br_1",
        supplierId: "sup_2",
        buyingPrice: 450,
        sellingPrice: 950,
        courierCost: 70,
        packagingCost: 30,
        marketingCost: 60,
        adsCost: 40,
        influencerCost: 0,
        promotionCost: 0,
        marketplaceFee: 20,
        transactionFee: 10,
        otherCost: 10,
        shipmentCost: 20,
        customsDuty: 0,
        importTax: 0,
        clearanceFee: 0,
        importOtherCost: 0,
        currentStock: 65,
        minimumStock: 10,
        reservedStock: 4,
        damagedStock: 1,
        status: "active",
        createdAt: now - dayMs * 12,
        updatedAt: now,
      },
      {
        id: "prod_3",
        name: "Smart Desk Organizer Lamp",
        sku: "PLS-LAMP-03",
        barcode: "890123456003",
        categoryId: "cat_3",
        brandId: "br_3",
        supplierId: "sup_1",
        buyingPrice: 1600,
        sellingPrice: 2750,
        courierCost: 100,
        packagingCost: 50,
        marketingCost: 100,
        adsCost: 80,
        influencerCost: 0,
        promotionCost: 0,
        marketplaceFee: 30,
        transactionFee: 20,
        otherCost: 20,
        shipmentCost: 40,
        customsDuty: 0,
        importTax: 0,
        clearanceFee: 0,
        importOtherCost: 0,
        currentStock: 4, // Trigger low stock alert
        minimumStock: 6,
        reservedStock: 1,
        damagedStock: 0,
        status: "active",
        createdAt: now - dayMs * 10,
        updatedAt: now,
      },
      {
        id: "prod_4",
        name: "Ergonomic Mechanical Keyboard",
        sku: "PLS-KB-04",
        barcode: "890123456004",
        categoryId: "cat_3",
        brandId: "br_2",
        supplierId: "sup_3",
        buyingPrice: 4200,
        sellingPrice: 6490,
        courierCost: 110,
        packagingCost: 60,
        marketingCost: 180,
        adsCost: 140,
        influencerCost: 0,
        promotionCost: 0,
        marketplaceFee: 65,
        transactionFee: 40,
        otherCost: 30,
        shipmentCost: 70,
        customsDuty: 0,
        importTax: 0,
        clearanceFee: 0,
        importOtherCost: 0,
        currentStock: 18,
        minimumStock: 5,
        reservedStock: 3,
        damagedStock: 0,
        status: "active",
        createdAt: now - dayMs * 9,
        updatedAt: now,
      },
      {
        id: "prod_5",
        name: "Ultra-Slim 65W GaN Charger",
        sku: "PLS-GAN-05",
        barcode: "890123456005",
        categoryId: "cat_6",
        brandId: "br_2",
        supplierId: "sup_4",
        buyingPrice: 1100,
        sellingPrice: 1950,
        courierCost: 70,
        packagingCost: 30,
        marketingCost: 80,
        adsCost: 60,
        influencerCost: 0,
        promotionCost: 0,
        marketplaceFee: 25,
        transactionFee: 15,
        otherCost: 10,
        shipmentCost: 30,
        customsDuty: 0,
        importTax: 0,
        clearanceFee: 0,
        importOtherCost: 0,
        currentStock: 52,
        minimumStock: 8,
        reservedStock: 2,
        damagedStock: 0,
        status: "active",
        createdAt: now - dayMs * 8,
        updatedAt: now,
      },
      {
        id: "prod_6",
        name: "Waterproof Everyday Backpack",
        sku: "PLS-BP-06",
        barcode: "890123456006",
        categoryId: "cat_4",
        brandId: "br_5",
        supplierId: "sup_2",
        buyingPrice: 2100,
        sellingPrice: 3850,
        courierCost: 120,
        packagingCost: 50,
        marketingCost: 120,
        adsCost: 100,
        influencerCost: 0,
        promotionCost: 0,
        marketplaceFee: 40,
        transactionFee: 25,
        otherCost: 20,
        shipmentCost: 50,
        customsDuty: 0,
        importTax: 0,
        clearanceFee: 0,
        importOtherCost: 0,
        currentStock: 22,
        minimumStock: 5,
        reservedStock: 1,
        damagedStock: 0,
        status: "active",
        createdAt: now - dayMs * 7,
        updatedAt: now,
      },
      {
        id: "prod_7",
        name: "Precision Aluminum Laptop Stand",
        sku: "PLS-LS-07",
        barcode: "890123456007",
        categoryId: "cat_3",
        brandId: "br_3",
        supplierId: "sup_3",
        buyingPrice: 950,
        sellingPrice: 1750,
        courierCost: 80,
        packagingCost: 40,
        marketingCost: 70,
        adsCost: 50,
        influencerCost: 0,
        promotionCost: 0,
        marketplaceFee: 20,
        transactionFee: 15,
        otherCost: 15,
        shipmentCost: 30,
        customsDuty: 0,
        importTax: 0,
        clearanceFee: 0,
        importOtherCost: 0,
        currentStock: 35,
        minimumStock: 6,
        reservedStock: 0,
        damagedStock: 0,
        status: "active",
        createdAt: now - dayMs * 6,
        updatedAt: now,
      },
      {
        id: "prod_8",
        name: "Magnetic Wireless Power Bank 10K",
        sku: "PLS-PB-08",
        barcode: "890123456008",
        categoryId: "cat_6",
        brandId: "br_2",
        supplierId: "sup_4",
        buyingPrice: 1450,
        sellingPrice: 2450,
        courierCost: 80,
        packagingCost: 35,
        marketingCost: 90,
        adsCost: 70,
        influencerCost: 0,
        promotionCost: 0,
        marketplaceFee: 30,
        transactionFee: 20,
        otherCost: 15,
        shipmentCost: 35,
        customsDuty: 0,
        importTax: 0,
        clearanceFee: 0,
        importOtherCost: 0,
        currentStock: 30,
        minimumStock: 5,
        reservedStock: 2,
        damagedStock: 0,
        status: "active",
        createdAt: now - dayMs * 5,
        updatedAt: now,
      },
      {
        id: "prod_9",
        name: "Smart Health Tracker Band",
        sku: "PLS-TB-09",
        barcode: "890123456009",
        categoryId: "cat_5",
        brandId: "br_1",
        supplierId: "sup_1",
        buyingPrice: 1800,
        sellingPrice: 2990,
        courierCost: 75,
        packagingCost: 35,
        marketingCost: 110,
        adsCost: 85,
        influencerCost: 0,
        promotionCost: 0,
        marketplaceFee: 35,
        transactionFee: 20,
        otherCost: 15,
        shipmentCost: 40,
        customsDuty: 0,
        importTax: 0,
        clearanceFee: 0,
        importOtherCost: 0,
        currentStock: 15,
        minimumStock: 5,
        reservedStock: 1,
        damagedStock: 0,
        status: "active",
        createdAt: now - dayMs * 4,
        updatedAt: now,
      },
      {
        id: "prod_10",
        name: "Studio Desktop USB-C Microphone",
        sku: "PLS-MIC-10",
        barcode: "890123456010",
        categoryId: "cat_1",
        brandId: "br_4",
        supplierId: "sup_3",
        buyingPrice: 2600,
        sellingPrice: 4200,
        courierCost: 90,
        packagingCost: 45,
        marketingCost: 130,
        adsCost: 100,
        influencerCost: 0,
        promotionCost: 0,
        marketplaceFee: 45,
        transactionFee: 25,
        otherCost: 20,
        shipmentCost: 50,
        customsDuty: 0,
        importTax: 0,
        clearanceFee: 0,
        importOtherCost: 0,
        currentStock: 12,
        minimumStock: 4,
        reservedStock: 0,
        damagedStock: 0,
        status: "active",
        createdAt: now - dayMs * 3,
        updatedAt: now,
      },
      {
        id: "prod_11",
        name: "High-Speed Braided Cable Kit (3-in-1)",
        sku: "PLS-CB-11",
        barcode: "890123456011",
        categoryId: "cat_1",
        brandId: "br_1",
        supplierId: "sup_4",
        buyingPrice: 280,
        sellingPrice: 650,
        courierCost: 60,
        packagingCost: 20,
        marketingCost: 40,
        adsCost: 30,
        influencerCost: 0,
        promotionCost: 0,
        marketplaceFee: 15,
        transactionFee: 10,
        otherCost: 10,
        shipmentCost: 15,
        customsDuty: 0,
        importTax: 0,
        clearanceFee: 0,
        importOtherCost: 0,
        currentStock: 80,
        minimumStock: 15,
        reservedStock: 5,
        damagedStock: 2,
        status: "active",
        createdAt: now - dayMs * 2,
        updatedAt: now,
      },
      {
        id: "prod_12",
        name: "Premium Vegan Leather Desk Mat",
        sku: "PLS-DM-12",
        barcode: "890123456012",
        categoryId: "cat_3",
        brandId: "br_3",
        supplierId: "sup_2",
        buyingPrice: 700,
        sellingPrice: 1350,
        courierCost: 80,
        packagingCost: 35,
        marketingCost: 65,
        adsCost: 45,
        influencerCost: 0,
        promotionCost: 0,
        marketplaceFee: 20,
        transactionFee: 15,
        otherCost: 15,
        shipmentCost: 25,
        customsDuty: 0,
        importTax: 0,
        clearanceFee: 0,
        importOtherCost: 0,
        currentStock: 40,
        minimumStock: 8,
        reservedStock: 2,
        damagedStock: 0,
        status: "active",
        createdAt: now - dayMs * 1,
        updatedAt: now,
      },
    ];

    for (const p of products) {
      db.run(
        `INSERT OR REPLACE INTO products (id, name, sku, category_id, brand_id, buying_price, selling_price, current_stock, status, created_at, updated_at, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          p.name,
          p.sku,
          p.categoryId,
          p.brandId,
          p.buyingPrice,
          p.sellingPrice,
          p.currentStock,
          p.status,
          p.createdAt,
          p.updatedAt,
          JSON.stringify(p),
        ],
      );
    }
  }

  // 6. Orders
  const orderCheck = db.exec("SELECT COUNT(*) FROM orders");
  if (((orderCheck[0]?.values[0]?.[0] as number) || 0) === 0) {
    const orders = [
      {
        id: "ord_1001",
        orderNumber: "PLS-1001",
        customerName: "Tahmid Rahman",
        customerPhone: "+8801712345678",
        customerAddress: "House 42, Road 9/A, Dhanmondi, Dhaka",
        items: [
          {
            productId: "prod_1",
            productName: "Wireless ANC Headphones",
            quantity: 1,
            sellingPrice: 4950,
          },
          {
            productId: "prod_2",
            productName: "Minimalist Leather Cardholder",
            quantity: 1,
            sellingPrice: 950,
          },
        ],
        discount: 200,
        deliveryCharge: 120,
        courierCost: 80,
        paymentMethod: "bkash",
        status: "delivered",
        soldBy: "Online Storefront",
        orderDate: now - dayMs * 4,
        deliveredDate: now - dayMs * 2,
        notes: "Call before delivery",
        createdAt: now - dayMs * 4,
        createdBy: adminUid,
      },
      {
        id: "ord_1002",
        orderNumber: "PLS-1002",
        customerName: "Sadia Afrin",
        customerPhone: "+8801812345678",
        customerAddress: "Flat 4B, South Plaza, GEC Circle, Chittagong",
        items: [
          {
            productId: "prod_4",
            productName: "Ergonomic Mechanical Keyboard",
            quantity: 1,
            sellingPrice: 6490,
          },
        ],
        discount: 0,
        deliveryCharge: 150,
        courierCost: 100,
        paymentMethod: "cod",
        status: "shipped",
        soldBy: "Facebook Shop",
        orderDate: now - dayMs * 2,
        deliveredDate: null,
        notes: "Deliver after 4 PM",
        createdAt: now - dayMs * 2,
        createdBy: adminUid,
      },
      {
        id: "ord_1003",
        orderNumber: "PLS-1003",
        customerName: "Mahmud Hasan",
        customerPhone: "+8801912345678",
        customerAddress: "Green View Tower, Zindabazar, Sylhet",
        items: [
          {
            productId: "prod_6",
            productName: "Waterproof Everyday Backpack",
            quantity: 1,
            sellingPrice: 3850,
          },
        ],
        discount: 150,
        deliveryCharge: 130,
        courierCost: 90,
        paymentMethod: "card",
        status: "delivered",
        soldBy: "Direct Inquiry",
        orderDate: now - dayMs * 5,
        deliveredDate: now - dayMs * 3,
        notes: "",
        createdAt: now - dayMs * 5,
        createdBy: adminUid,
      },
      {
        id: "ord_1004",
        orderNumber: "PLS-1004",
        customerName: "Nusrat Jahan",
        customerPhone: "+8801612345678",
        customerAddress: "Road 79, Gulshan 2, Dhaka",
        items: [
          {
            productId: "prod_5",
            productName: "Ultra-Slim 65W GaN Charger",
            quantity: 1,
            sellingPrice: 1950,
          },
          {
            productId: "prod_8",
            productName: "Magnetic Wireless Power Bank 10K",
            quantity: 1,
            sellingPrice: 2450,
          },
        ],
        discount: 300,
        deliveryCharge: 80,
        courierCost: 60,
        paymentMethod: "bkash",
        status: "processing",
        soldBy: "Online Storefront",
        orderDate: now - dayMs * 1,
        deliveredDate: null,
        notes: "Gift packaging requested",
        createdAt: now - dayMs * 1,
        createdBy: adminUid,
      },
      {
        id: "ord_1005",
        orderNumber: "PLS-1005",
        customerName: "Imtiaz Ahmed",
        customerPhone: "+8801512345678",
        customerAddress: "Station Road, Kandirpar, Comilla",
        items: [
          {
            productId: "prod_3",
            productName: "Smart Desk Organizer Lamp",
            quantity: 1,
            sellingPrice: 2750,
          },
        ],
        discount: 0,
        deliveryCharge: 120,
        courierCost: 80,
        paymentMethod: "nagad",
        status: "pending",
        soldBy: "Website",
        orderDate: now - 3600000 * 5,
        deliveredDate: null,
        notes: "Awaiting customer confirmation call",
        createdAt: now - 3600000 * 5,
        createdBy: adminUid,
      },
      {
        id: "ord_1006",
        orderNumber: "PLS-1006",
        customerName: "Farhan Kabir",
        customerPhone: "+8801798765432",
        customerAddress: "Sector 4, Uttara, Dhaka",
        items: [
          {
            productId: "prod_10",
            productName: "Studio Desktop USB-C Microphone",
            quantity: 1,
            sellingPrice: 4200,
          },
        ],
        discount: 200,
        deliveryCharge: 80,
        courierCost: 60,
        paymentMethod: "cod",
        status: "returned",
        soldBy: "Online Storefront",
        orderDate: now - dayMs * 6,
        deliveredDate: null,
        notes: "Customer canceled at doorstep due to change of mind",
        createdAt: now - dayMs * 6,
        createdBy: adminUid,
      },
    ];

    for (const o of orders) {
      db.run(
        `INSERT INTO orders (id, order_number, customer_name, customer_phone, status, order_date, delivered_date, created_at, created_by, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          o.id,
          o.orderNumber,
          o.customerName,
          o.customerPhone,
          o.status,
          o.orderDate,
          o.deliveredDate,
          o.createdAt,
          o.createdBy,
          JSON.stringify(o),
        ],
      );
    }
  }

  // 7. Pre-Orders
  const preCheck = db.exec("SELECT COUNT(*) FROM pre_orders");
  if (((preCheck[0]?.values[0]?.[0] as number) || 0) === 0) {
    const preOrders = [
      {
        id: "pre_101",
        preOrderNumber: "PRE-101",
        customerName: "Arif Chowdhury",
        customerPhone: "+8801755112233",
        customerAddress: "Road 11, Banani, Dhaka",
        items: [
          {
            productId: "prod_1",
            productName: "Wireless ANC Headphones (Midnight Black)",
            quantity: 1,
            sellingPrice: 4950,
          },
        ],
        advancePayment: 1500,
        totalAmount: 4950,
        paymentMethod: "bkash",
        expectedDate: now + dayMs * 7,
        status: "confirmed",
        orderDate: now - dayMs * 2,
        fulfilledDate: null,
        notes: "Special batch import",
        createdAt: now - dayMs * 2,
        createdBy: adminUid,
      },
      {
        id: "pre_102",
        preOrderNumber: "PRE-102",
        customerName: "Nazmul Huda",
        customerPhone: "+8801855223344",
        customerAddress: "Avenue 3, Mirpur DOHS, Dhaka",
        items: [
          {
            productId: "prod_4",
            productName: "Ergonomic Mechanical Keyboard (Gateron Brown)",
            quantity: 1,
            sellingPrice: 6490,
          },
        ],
        advancePayment: 2000,
        totalAmount: 6490,
        paymentMethod: "card",
        expectedDate: now + dayMs * 10,
        status: "pending",
        orderDate: now - dayMs * 1,
        fulfilledDate: null,
        notes: "Customer notified about shipment lead time",
        createdAt: now - dayMs * 1,
        createdBy: adminUid,
      },
    ];

    for (const po of preOrders) {
      db.run(
        `INSERT INTO pre_orders (id, pre_order_number, customer_name, status, order_date, created_at, created_by, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          po.id,
          po.preOrderNumber,
          po.customerName,
          po.status,
          po.orderDate,
          po.createdAt,
          po.createdBy,
          JSON.stringify(po),
        ],
      );
    }
  }

  // 8. Deliveries
  const delCheck = db.exec("SELECT COUNT(*) FROM deliveries");
  if (((delCheck[0]?.values[0]?.[0] as number) || 0) === 0) {
    const deliveries = [
      {
        id: "del_01",
        deliveryNumber: "DEL-9001",
        orderId: "ord_1001",
        orderNumber: "PLS-1001",
        customerName: "Tahmid Rahman",
        customerPhone: "+8801712345678",
        address: "House 42, Road 9/A, Dhanmondi, Dhaka",
        carrier: "Steadfast Courier",
        trackingNumber: "ST-88291039",
        charge: 120,
        cost: 80,
        status: "delivered",
        notes: "Delivered smoothly",
        shippedDate: now - dayMs * 3,
        deliveredDate: now - dayMs * 2,
        createdAt: now - dayMs * 3,
        createdBy: adminUid,
      },
      {
        id: "del_02",
        deliveryNumber: "DEL-9002",
        orderId: "ord_1002",
        orderNumber: "PLS-1002",
        customerName: "Sadia Afrin",
        customerPhone: "+8801812345678",
        address: "Flat 4B, South Plaza, GEC Circle, Chittagong",
        carrier: "Pathao Express",
        trackingNumber: "PTH-772911",
        charge: 150,
        cost: 100,
        status: "in_transit",
        notes: "Inter-district transit",
        shippedDate: now - dayMs * 1,
        deliveredDate: null,
        createdAt: now - dayMs * 1,
        createdBy: adminUid,
      },
      {
        id: "del_03",
        deliveryNumber: "DEL-9003",
        orderId: "ord_1003",
        orderNumber: "PLS-1003",
        customerName: "Mahmud Hasan",
        customerPhone: "+8801912345678",
        address: "Green View Tower, Zindabazar, Sylhet",
        carrier: "RedX Logistics",
        trackingNumber: "RDX-551029",
        charge: 130,
        cost: 90,
        status: "delivered",
        notes: "Signature confirmed",
        shippedDate: now - dayMs * 4,
        deliveredDate: now - dayMs * 3,
        createdAt: now - dayMs * 4,
        createdBy: adminUid,
      },
      {
        id: "del_04",
        deliveryNumber: "DEL-9004",
        orderId: "ord_1004",
        orderNumber: "PLS-1004",
        customerName: "Nusrat Jahan",
        customerPhone: "+8801612345678",
        address: "Road 79, Gulshan 2, Dhaka",
        carrier: "Pathao Express",
        trackingNumber: "PTH-992014",
        charge: 80,
        cost: 60,
        status: "pending",
        notes: "Scheduled for tomorrow morning pickup",
        shippedDate: null,
        deliveredDate: null,
        createdAt: now,
        createdBy: adminUid,
      },
    ];

    for (const d of deliveries) {
      db.run(
        `INSERT INTO deliveries (id, delivery_number, order_id, status, created_at, created_by, data)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [d.id, d.deliveryNumber, d.orderId, d.status, d.createdAt, d.createdBy, JSON.stringify(d)],
      );
    }
  }

  // 9. Purchases (Supplier Procurement)
  const purCheck = db.exec("SELECT COUNT(*) FROM purchases");
  if (((purCheck[0]?.values[0]?.[0] as number) || 0) === 0) {
    const purchases = [
      {
        id: "pur_501",
        supplierId: "sup_1",
        invoiceNumber: "PO-2026-001",
        purchaseDate: now - dayMs * 14,
        items: [{ productId: "prod_1", quantity: 30, buyingPrice: 3200 }],
        shippingCost: 1800,
        otherCost: 500,
        totalCost: 98300,
        status: "received",
        notes: "Initial inventory restock for ANC headphones",
        createdAt: now - dayMs * 14,
        createdBy: adminUid,
      },
      {
        id: "pur_502",
        supplierId: "sup_2",
        invoiceNumber: "PO-2026-002",
        purchaseDate: now - dayMs * 10,
        items: [
          { productId: "prod_2", quantity: 50, buyingPrice: 450 },
          { productId: "prod_6", quantity: 20, buyingPrice: 2100 },
        ],
        shippingCost: 2200,
        otherCost: 600,
        totalCost: 67300,
        status: "received",
        notes: "Bulk leather goods & backpacks from Apex",
        createdAt: now - dayMs * 10,
        createdBy: adminUid,
      },
      {
        id: "pur_503",
        supplierId: "sup_3",
        invoiceNumber: "PO-2026-003",
        purchaseDate: now - dayMs * 3,
        items: [{ productId: "prod_4", quantity: 15, buyingPrice: 4200 }],
        shippingCost: 1500,
        otherCost: 400,
        totalCost: 64900,
        status: "pending",
        notes: "Mechanical keyboard restock consignment",
        createdAt: now - dayMs * 3,
        createdBy: adminUid,
      },
    ];

    for (const pu of purchases) {
      db.run(
        `INSERT INTO purchases (id, invoice_number, supplier_id, status, created_at, created_by, data)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          pu.id,
          pu.invoiceNumber,
          pu.supplierId,
          pu.status,
          pu.createdAt,
          pu.createdBy,
          JSON.stringify(pu),
        ],
      );
    }
  }

  // 10. Operational Expenses
  const expCheck = db.exec("SELECT COUNT(*) FROM expenses");
  if (((expCheck[0]?.values[0]?.[0] as number) || 0) === 0) {
    const expenses = [
      {
        id: "exp_1",
        category: "advertising",
        amount: 18500,
        description: "Meta Ads & Google Search Ads campaigns",
        date: now - dayMs * 6,
        createdAt: now - dayMs * 6,
        createdBy: adminUid,
      },
      {
        id: "exp_2",
        category: "courier",
        amount: 8200,
        description: "Monthly courier bill & dispatch charges",
        date: now - dayMs * 5,
        createdAt: now - dayMs * 5,
        createdBy: adminUid,
      },
      {
        id: "exp_3",
        category: "packaging",
        amount: 6500,
        description: "Branded shipping boxes, bubble mailers & thermal roll supplies",
        date: now - dayMs * 8,
        createdAt: now - dayMs * 8,
        createdBy: adminUid,
      },
      {
        id: "exp_4",
        category: "office_rent",
        amount: 45000,
        description: "Banani Office & Fulfillment Hub monthly rent",
        date: now - dayMs * 12,
        createdAt: now - dayMs * 12,
        createdBy: adminUid,
      },
      {
        id: "exp_5",
        category: "salary",
        amount: 65000,
        description: "Staff salaries for warehouse, customer support & store management",
        date: now - dayMs * 10,
        createdAt: now - dayMs * 10,
        createdBy: adminUid,
      },
      {
        id: "exp_6",
        category: "internet",
        amount: 2800,
        description: "High-speed optical fiber commercial internet",
        date: now - dayMs * 9,
        createdAt: now - dayMs * 9,
        createdBy: adminUid,
      },
      {
        id: "exp_7",
        category: "electricity",
        amount: 4600,
        description: "Office lighting, AC & charging station electricity bill",
        date: now - dayMs * 7,
        createdAt: now - dayMs * 7,
        createdBy: adminUid,
      },
    ];

    for (const e of expenses) {
      db.run(
        `INSERT INTO expenses (id, category, amount, date, created_at, created_by, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [e.id, e.category, e.amount, e.date, e.createdAt, e.createdBy, JSON.stringify(e)],
      );
    }
  }

  // 11. Investors & Capital Investments
  const invCheck = db.exec("SELECT COUNT(*) FROM investors");
  if (((invCheck[0]?.values[0]?.[0] as number) || 0) === 0) {
    const investors = [
      {
        id: "inv_1",
        name: "Asif Kamal",
        email: "asif@kamalholdings.com",
        phone: "+8801711998877",
        sharePercent: 15,
        joinedAt: now - dayMs * 60,
        createdAt: now - dayMs * 60,
        createdBy: adminUid,
      },
      {
        id: "inv_2",
        name: "Sabrina Haque",
        email: "sabrina.haque@angelcapital.bd",
        phone: "+8801811887766",
        sharePercent: 10,
        joinedAt: now - dayMs * 45,
        createdAt: now - dayMs * 45,
        createdBy: adminUid,
      },
      {
        id: "inv_3",
        name: "Kazi Ventures Ltd",
        email: "investment@kaziventures.com",
        phone: "+8801911776655",
        sharePercent: 20,
        joinedAt: now - dayMs * 30,
        createdAt: now - dayMs * 30,
        createdBy: adminUid,
      },
    ];

    for (const inv of investors) {
      db.run(
        `INSERT INTO investors (id, name, email, created_at, created_by, data) VALUES (?, ?, ?, ?, ?, ?)`,
        [inv.id, inv.name, inv.email, inv.createdAt, inv.createdBy, JSON.stringify(inv)],
      );
    }

    const investments = [
      {
        id: "fund_1",
        investorId: "inv_1",
        source: "Equity Seed Tranche 1",
        amount: 350000,
        date: now - dayMs * 60,
        createdAt: now - dayMs * 60,
        createdBy: adminUid,
      },
      {
        id: "fund_2",
        investorId: "inv_2",
        source: "Angel Growth Round",
        amount: 250000,
        date: now - dayMs * 45,
        createdAt: now - dayMs * 45,
        createdBy: adminUid,
      },
      {
        id: "fund_3",
        investorId: "inv_3",
        source: "Institutional Expansion Funding",
        amount: 500000,
        date: now - dayMs * 30,
        createdAt: now - dayMs * 30,
        createdBy: adminUid,
      },
    ];

    for (const f of investments) {
      db.run(
        `INSERT INTO investments (id, investor_id, amount, date, created_at, created_by, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [f.id, f.investorId, f.amount, f.date, f.createdAt, f.createdBy, JSON.stringify(f)],
      );
    }
  }

  // 12. Loans & Repayments
  const loanCheck = db.exec("SELECT COUNT(*) FROM loans");
  if (((loanCheck[0]?.values[0]?.[0] as number) || 0) === 0) {
    const loans = [
      {
        id: "loan_1",
        lender: "Prime SME Credit Facility",
        principal: 300000,
        interestRate: 8.5,
        startDate: now - dayMs * 60,
        dueDate: now + dayMs * 120,
        status: "active",
        notes: "Working capital facility for seasonal inventory buildup",
        createdAt: now - dayMs * 60,
        createdBy: adminUid,
      },
    ];

    for (const l of loans) {
      db.run(
        `INSERT INTO loans (id, lender, principal, status, created_at, created_by, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [l.id, l.lender, l.principal, l.status, l.createdAt, l.createdBy, JSON.stringify(l)],
      );
    }

    const loanRepayments = [
      {
        id: "lr_1",
        loanId: "loan_1",
        amount: 52500,
        date: now - dayMs * 30,
        method: "Bank Transfer",
        notes: "Installment 1 of 6",
        createdAt: now - dayMs * 30,
        createdBy: adminUid,
      },
      {
        id: "lr_2",
        loanId: "loan_1",
        amount: 52500,
        date: now - 3600000 * 48,
        method: "Bank Transfer",
        notes: "Installment 2 of 6",
        createdAt: now - 3600000 * 48,
        createdBy: adminUid,
      },
    ];

    for (const lr of loanRepayments) {
      db.run(
        `INSERT INTO loan_repayments (id, loan_id, amount, date, created_at, created_by, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [lr.id, lr.loanId, lr.amount, lr.date, lr.createdAt, lr.createdBy, JSON.stringify(lr)],
      );
    }
  }

  // 13. Stock History Audit
  const stockHistCheck = db.exec("SELECT COUNT(*) FROM stock_history");
  if (((stockHistCheck[0]?.values[0]?.[0] as number) || 0) === 0) {
    const historyEntries = [
      {
        id: "sh_1",
        productId: "prod_1",
        type: "purchase",
        quantity: 30,
        reason: "PO-2026-001 Goods Received",
        refId: "pur_501",
        createdAt: now - dayMs * 14,
        createdBy: adminUid,
      },
      {
        id: "sh_2",
        productId: "prod_1",
        type: "sale",
        quantity: -1,
        reason: "Order #PLS-1001 Delivered",
        refId: "ord_1001",
        createdAt: now - dayMs * 2,
        createdBy: adminUid,
      },
      {
        id: "sh_3",
        productId: "prod_2",
        type: "purchase",
        quantity: 50,
        reason: "PO-2026-002 Goods Received",
        refId: "pur_502",
        createdAt: now - dayMs * 10,
        createdBy: adminUid,
      },
      {
        id: "sh_4",
        productId: "prod_2",
        type: "damage",
        quantity: -1,
        reason: "Scratched leather during warehouse inspection",
        refId: "",
        createdAt: now - dayMs * 3,
        createdBy: adminUid,
      },
      {
        id: "sh_5",
        productId: "prod_6",
        type: "purchase",
        quantity: 20,
        reason: "PO-2026-002 Goods Received",
        refId: "pur_502",
        createdAt: now - dayMs * 10,
        createdBy: adminUid,
      },
      {
        id: "sh_6",
        productId: "prod_6",
        type: "sale",
        quantity: -1,
        reason: "Order #PLS-1003 Delivered",
        refId: "ord_1003",
        createdAt: now - dayMs * 3,
        createdBy: adminUid,
      },
    ];

    for (const sh of historyEntries) {
      db.run(
        `INSERT INTO stock_history (id, product_id, type, quantity, created_at, created_by, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [sh.id, sh.productId, sh.type, sh.quantity, sh.createdAt, sh.createdBy, JSON.stringify(sh)],
      );
    }
  }

  // 14. Notifications
  const notifCheck = db.exec("SELECT COUNT(*) FROM notifications");
  if (((notifCheck[0]?.values[0]?.[0] as number) || 0) === 0) {
    const notifications = [
      {
        id: "notif_1",
        type: "low_stock",
        title: "Low stock alert: Smart Desk Organizer Lamp",
        message: "Current stock is 4 units, below minimum threshold of 6 units.",
        read: false,
        link: "/inventory/products",
        createdAt: now - dayMs * 1,
      },
      {
        id: "notif_2",
        type: "supplier_due",
        title: "Supplier payment pending: Pacific Electronics",
        message: "Invoice PO-2026-001 has 15,000 BDT outstanding balance.",
        read: false,
        link: "/purchases/suppliers",
        createdAt: now - 3600000 * 8,
      },
      {
        id: "notif_3",
        type: "daily_summary",
        title: "Daily Operations Digest",
        message: "Today: 6 active orders tracked, 2 deliveries completed successfully.",
        read: true,
        link: "/dashboard",
        createdAt: now - 3600000 * 2,
      },
    ];

    for (const n of notifications) {
      db.run(
        `INSERT INTO notifications (id, type, title, read, created_at, data) VALUES (?, ?, ?, ?, ?, ?)`,
        [n.id, n.type, n.title, n.read ? 1 : 0, n.createdAt, JSON.stringify(n)],
      );
    }
  }

  // 15. Initial Audit Log
  const logCheck = db.exec("SELECT COUNT(*) FROM audit_logs");
  if (((logCheck[0]?.values[0]?.[0] as number) || 0) === 0) {
    const initialLog = {
      id: "audit_init",
      timestamp: now,
      userId: adminUid,
      userEmail: adminEmail,
      role: "super_admin",
      action: "database.sqlite_seeded",
      entity: "system",
      entityId: "init",
      newValue: {
        message: "PulseERP SQLite Database seeded with full demo catalog and business data",
      },
    };
    db.run(
      `INSERT INTO audit_logs (id, timestamp, user_id, user_email, role, action, entity, entity_id, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        initialLog.id,
        initialLog.timestamp,
        initialLog.userId,
        initialLog.userEmail,
        initialLog.role,
        initialLog.action,
        initialLog.entity,
        initialLog.entityId,
        JSON.stringify(initialLog),
      ],
    );
  }
}

/** Subscription system */
export function subscribeToDbChanges(listener: (path: string) => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

export function notifyDbChange(path: string) {
  debouncePersist();
  for (const listener of changeListeners) {
    try {
      listener(path);
    } catch (e) {
      console.error("Change listener error:", e);
    }
  }
}

/** SQL Query helpers */
export async function executeSql(sql: string, params: unknown[] = []): Promise<void> {
  const db = await getSqliteDb();
  db.run(sql, params as (number | string | Uint8Array | null)[]);
  debouncePersist();
}

export async function querySql<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getSqliteDb();
  const res = db.exec(sql, params as (number | string | Uint8Array | null)[]);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as T;
  });
}

/** Export SQLite DB file as Blob / Uint8Array */
export async function exportSqliteDatabase(): Promise<Uint8Array> {
  const db = await getSqliteDb();
  return db.export();
}

/** Import and replace SQLite DB from Uint8Array */
export async function importSqliteDatabase(binaryData: Uint8Array): Promise<void> {
  const SQL = await initSqlJs({
    locateFile: () => sqlWasmUrl || "/sql-wasm.wasm",
  });
  const newDb = new SQL.Database(binaryData);
  dbInstance = newDb;
  await saveToIndexedDB(binaryData);
  // Notify all listeners
  for (const listener of changeListeners) {
    try {
      listener("*");
    } catch {
      /* ignore */
    }
  }
}

/** Reset DB to fresh initial state */
export async function resetSqliteDatabase(): Promise<void> {
  const SQL = await initSqlJs({
    locateFile: () => sqlWasmUrl || "/sql-wasm.wasm",
  });
  const newDb = new SQL.Database();
  dbInstance = newDb;
  initPromise = Promise.resolve(newDb);
  // recreate tables & seed
  newDb.run(`
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS brands;
    DROP TABLE IF EXISTS suppliers;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS pre_orders;
    DROP TABLE IF EXISTS deliveries;
    DROP TABLE IF EXISTS returns;
    DROP TABLE IF EXISTS purchases;
    DROP TABLE IF EXISTS expenses;
    DROP TABLE IF EXISTS investments;
    DROP TABLE IF EXISTS investors;
    DROP TABLE IF EXISTS loans;
    DROP TABLE IF EXISTS loan_repayments;
    DROP TABLE IF EXISTS stock_history;
    DROP TABLE IF EXISTS audit_logs;
    DROP TABLE IF EXISTS notifications;
    DROP TABLE IF EXISTS sellers;
    DROP TABLE IF EXISTS wishlist;
    DROP TABLE IF EXISTS kv_store;
  `);
  // Re-run getSqliteDb logic
  dbInstance = null;
  initPromise = null;
  await getSqliteDb();
  persistDatabaseNow();
  for (const listener of changeListeners) {
    try {
      listener("*");
    } catch {
      /* ignore */
    }
  }
}
