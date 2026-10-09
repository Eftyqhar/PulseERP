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
  const userCheck = db.exec("SELECT COUNT(*) AS count FROM users");
  const count = (userCheck[0]?.values[0]?.[0] as number) || 0;

  if (count === 0) {
    const now = Date.now();
    const adminUid = "admin_super_01";
    const adminEmail = "admin@pulseerp.com";
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

    // Sample Categories
    const sampleCategories = [
      {
        id: "cat_1",
        name: "Electronics",
        description: "Smartphones, accessories & gadgets",
        createdAt: now - 86400000 * 5,
      },
      {
        id: "cat_2",
        name: "Fashion & Apparel",
        description: "Clothing, bags and apparel",
        createdAt: now - 86400000 * 4,
      },
      {
        id: "cat_3",
        name: "Home & Living",
        description: "Kitchenware and accessories",
        createdAt: now - 86400000 * 3,
      },
    ];
    for (const c of sampleCategories) {
      db.run(
        `INSERT INTO categories (id, name, description, created_at, data) VALUES (?, ?, ?, ?, ?)`,
        [c.id, c.name, c.description, c.createdAt, JSON.stringify(c)],
      );
    }

    // Sample Brands
    const sampleBrands = [
      {
        id: "br_1",
        name: "Pulse Prime",
        description: "In-house flagship line",
        createdAt: now - 86400000 * 5,
      },
      {
        id: "br_2",
        name: "Aura Tech",
        description: "Premium consumer tech",
        createdAt: now - 86400000 * 4,
      },
      {
        id: "br_3",
        name: "Nordic Goods",
        description: "Minimalist everyday items",
        createdAt: now - 86400000 * 3,
      },
    ];
    for (const b of sampleBrands) {
      db.run(
        `INSERT INTO brands (id, name, description, created_at, data) VALUES (?, ?, ?, ?, ?)`,
        [b.id, b.name, b.description, b.createdAt, JSON.stringify(b)],
      );
    }

    // Sample Suppliers
    const sampleSuppliers = [
      {
        id: "sup_1",
        company: "Pacific Electronics Ltd",
        name: "Rahim Ahmed",
        phone: "+8801711223344",
        email: "rahim@pacificelec.com",
        address: "Motijheel, Dhaka",
        totalPurchases: 125000,
        paidAmount: 110000,
        dueAmount: 15000,
        createdAt: now - 86400000 * 10,
      },
      {
        id: "sup_2",
        company: "Apex Global Supplies",
        name: "Shakil Khan",
        phone: "+8801819876543",
        email: "shakil@apexsupply.com",
        address: "Chittagong GEC",
        totalPurchases: 85000,
        paidAmount: 85000,
        dueAmount: 0,
        createdAt: now - 86400000 * 8,
      },
    ];
    for (const s of sampleSuppliers) {
      db.run(
        `INSERT INTO suppliers (id, company, name, phone, email, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.company, s.name, s.phone, s.email, s.createdAt, JSON.stringify(s)],
      );
    }

    // Sample Products
    const sampleProducts = [
      {
        id: "prod_1",
        name: "Wireless ANC Headphones",
        sku: "LUM-HP-01",
        barcode: "890123456001",
        categoryId: "cat_1",
        brandId: "br_2",
        supplierId: "sup_1",
        buyingPrice: 3200,
        sellingPrice: 4800,
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
        currentStock: 24,
        minimumStock: 5,
        reservedStock: 2,
        damagedStock: 0,
        status: "active",
        createdAt: now - 86400000 * 4,
        updatedAt: now,
      },
      {
        id: "prod_2",
        name: "Minimalist Leather Cardholder",
        sku: "LUM-CH-02",
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
        currentStock: 48,
        minimumStock: 10,
        reservedStock: 3,
        damagedStock: 1,
        status: "active",
        createdAt: now - 86400000 * 3,
        updatedAt: now,
      },
      {
        id: "prod_3",
        name: "Smart Desk Organizer Lamp",
        sku: "LUM-LAMP-03",
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
        currentStock: 3, // Low stock indicator
        minimumStock: 6,
        reservedStock: 1,
        damagedStock: 0,
        status: "active",
        createdAt: now - 86400000 * 2,
        updatedAt: now,
      },
    ];
    for (const p of sampleProducts) {
      db.run(
        `INSERT INTO products (id, name, sku, category_id, brand_id, buying_price, selling_price, current_stock, status, created_at, updated_at, data)
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

    // Sample Notification
    const sampleNotification = {
      id: "notif_1",
      type: "low_stock",
      title: "Low stock alert: Smart Desk Organizer Lamp",
      message: "Current stock is 3, below minimum threshold of 6 units.",
      read: false,
      createdAt: now,
    };
    db.run(
      `INSERT INTO notifications (id, type, title, read, created_at, data) VALUES (?, ?, ?, 0, ?, ?)`,
      [
        sampleNotification.id,
        sampleNotification.type,
        sampleNotification.title,
        sampleNotification.createdAt,
        JSON.stringify(sampleNotification),
      ],
    );

    // Initial Audit Log
    const sampleLog = {
      id: "audit_init",
      timestamp: now,
      userId: adminUid,
      userEmail: adminEmail,
      role: "super_admin",
      action: "database.sqlite_initialized",
      entity: "system",
      entityId: "init",
      newValue: { message: "SQLite Database initialized successfully" },
    };
    db.run(
      `INSERT INTO audit_logs (id, timestamp, user_id, user_email, role, action, entity, entity_id, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sampleLog.id,
        sampleLog.timestamp,
        sampleLog.userId,
        sampleLog.userEmail,
        sampleLog.role,
        sampleLog.action,
        sampleLog.entity,
        sampleLog.entityId,
        JSON.stringify(sampleLog),
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
