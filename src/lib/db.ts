import { useEffect, useState, useCallback } from "react";
import {
  getSqliteDb,
  subscribeToDbChanges,
  notifyDbChange,
  parsePath,
  TABLE_MAP,
  executeSql,
  querySql,
  exportSqliteDatabase,
  importSqliteDatabase,
  resetSqliteDatabase,
} from "./sqlite";

export { executeSql, querySql, exportSqliteDatabase, importSqliteDatabase, resetSqliteDatabase };

export const db = {
  name: "pulse.sqlite",
  type: "sqlite",
};

/** Database path reference descriptor */
export interface DbRef {
  path: string;
  key: string;
}

export function ref(_ignoredDb?: unknown, path = "/"): DbRef {
  const clean = path.replace(/^\/+/, "").replace(/\/+$/, "");
  const parts = clean.split("/");
  const key = parts[parts.length - 1] || "";
  return { path: clean, key };
}

export function serverTimestamp(): number {
  return Date.now();
}

/** Hook to subscribe to a list node and return an array of `{ id, ...val }`. */
export function useDbList<T = unknown>(path: string | null) {
  const [data, setData] = useState<Array<T & { id: string }>>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!path) {
      setData([]);
      setLoading(false);
      return;
    }

    try {
      const parsed = parsePath(path);
      const dbInstance = await getSqliteDb();

      if (parsed.table) {
        const res = dbInstance.exec(`SELECT id, data FROM ${parsed.table} ORDER BY rowid ASC`);
        if (!res.length || !res[0].values) {
          setData([]);
        } else {
          const items = res[0].values.map(([id, dataStr]) => {
            let itemData: Record<string, unknown> = {};
            try {
              itemData = JSON.parse(dataStr as string);
            } catch {
              /* ignore */
            }
            return {
              id: id as string,
              ...itemData,
            } as T & { id: string };
          });
          setData(items);
        }
      } else {
        // kv_store prefix search
        const prefix = path + "/";
        const res = dbInstance.exec(`SELECT path, value FROM kv_store WHERE path LIKE ?`, [
          prefix + "%",
        ]);
        if (!res.length || !res[0].values) {
          setData([]);
        } else {
          const items = res[0].values.map(([p, v]) => {
            let itemData: Record<string, unknown> = {};
            try {
              itemData = JSON.parse(v as string);
            } catch {
              /* ignore */
            }
            const id = (p as string).replace(prefix, "");
            return { id, ...itemData } as T & { id: string };
          });
          setData(items);
        }
      }
    } catch (e) {
      console.error(`Failed to fetch db list at path: ${path}`, e);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    let mounted = true;
    fetchData();

    const unsub = subscribeToDbChanges((changedPath) => {
      if (!mounted) return;
      if (
        changedPath === "*" ||
        !path ||
        changedPath === path ||
        changedPath.startsWith(path + "/") ||
        path.startsWith(changedPath + "/")
      ) {
        fetchData();
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [path, fetchData]);

  return { data, loading, refetch: fetchData };
}

/** Hook to subscribe to a single value node */
export function useDbValue<T = unknown>(path: string | null) {
  const [value, setValue] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchValue = useCallback(async () => {
    if (!path) {
      setValue(null);
      setLoading(false);
      return;
    }

    try {
      const parsed = parsePath(path);
      const dbInstance = await getSqliteDb();

      if (parsed.type === "doc" && parsed.table && parsed.id) {
        const res = dbInstance.exec(`SELECT data FROM ${parsed.table} WHERE id = ?`, [parsed.id]);
        if (res.length && res[0].values?.length) {
          const raw = res[0].values[0][0] as string;
          setValue(JSON.parse(raw) as T);
        } else {
          setValue(null);
        }
      } else {
        // Check kv_store
        const res = dbInstance.exec(`SELECT value FROM kv_store WHERE path = ?`, [path]);
        if (res.length && res[0].values?.length) {
          const raw = res[0].values[0][0] as string;
          setValue(JSON.parse(raw) as T);
        } else {
          setValue(null);
        }
      }
    } catch (e) {
      console.error(`Failed to fetch db value at path: ${path}`, e);
      setValue(null);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    let mounted = true;
    fetchValue();

    const unsub = subscribeToDbChanges((changedPath) => {
      if (!mounted) return;
      if (
        changedPath === "*" ||
        !path ||
        changedPath === path ||
        changedPath.startsWith(path + "/") ||
        path.startsWith(changedPath + "/")
      ) {
        fetchValue();
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [path, fetchValue]);

  return { value, loading, refetch: fetchValue };
}

/** Push a new entry to a list path, returns the new id. */
export async function createItem<T extends object>(path: string, data: T): Promise<string> {
  const dbInstance = await getSqliteDb();
  const id = (data as Record<string, unknown>).id
    ? String((data as Record<string, unknown>).id)
    : typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "id_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);

  const fullItem = {
    ...data,
    id,
    createdAt: (data as Record<string, unknown>).createdAt || Date.now(),
  };
  const json = JSON.stringify(fullItem);

  const parsed = parsePath(path);
  const now = Date.now();

  if (parsed.table) {
    const table = parsed.table;
    // Insert into table
    switch (table) {
      case "products": {
        const p = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO products (id, name, sku, category_id, brand_id, buying_price, selling_price, current_stock, status, created_at, updated_at, data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(p.name || ""),
            String(p.sku || ""),
            String(p.categoryId || ""),
            String(p.brandId || ""),
            Number(p.buyingPrice || 0),
            Number(p.sellingPrice || 0),
            Number(p.currentStock || 0),
            String(p.status || "active"),
            Number(p.createdAt || now),
            Number(p.updatedAt || now),
            json,
          ],
        );
        break;
      }
      case "orders": {
        const o = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO orders (id, order_number, customer_name, customer_phone, status, order_date, delivered_date, created_at, created_by, data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(o.orderNumber || ""),
            String(o.customerName || ""),
            String(o.customerPhone || ""),
            String(o.status || "pending"),
            Number(o.orderDate || now),
            o.deliveredDate ? Number(o.deliveredDate) : null,
            Number(o.createdAt || now),
            String(o.createdBy || ""),
            json,
          ],
        );
        break;
      }
      case "categories": {
        const c = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO categories (id, name, description, created_at, data) VALUES (?, ?, ?, ?, ?)`,
          [id, String(c.name || ""), String(c.description || ""), Number(c.createdAt || now), json],
        );
        break;
      }
      case "brands": {
        const b = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO brands (id, name, description, created_at, data) VALUES (?, ?, ?, ?, ?)`,
          [id, String(b.name || ""), String(b.description || ""), Number(b.createdAt || now), json],
        );
        break;
      }
      case "suppliers": {
        const s = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO suppliers (id, company, name, phone, email, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(s.company || ""),
            String(s.name || ""),
            String(s.phone || ""),
            String(s.email || ""),
            Number(s.createdAt || now),
            json,
          ],
        );
        break;
      }
      case "expenses": {
        const e = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO expenses (id, category, amount, date, created_at, created_by, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(e.category || "miscellaneous"),
            Number(e.amount || 0),
            Number(e.date || now),
            Number(e.createdAt || now),
            String(e.createdBy || ""),
            json,
          ],
        );
        break;
      }
      case "investments": {
        const inv = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO investments (id, investor_id, amount, date, created_at, created_by, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(inv.investorId || ""),
            Number(inv.amount || 0),
            Number(inv.date || now),
            Number(inv.createdAt || now),
            String(inv.createdBy || ""),
            json,
          ],
        );
        break;
      }
      case "investors": {
        const inv = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO investors (id, name, email, created_at, created_by, data) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(inv.name || ""),
            String(inv.email || ""),
            Number(inv.createdAt || now),
            String(inv.createdBy || ""),
            json,
          ],
        );
        break;
      }
      case "loans": {
        const l = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO loans (id, lender, principal, status, created_at, created_by, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(l.lender || ""),
            Number(l.principal || 0),
            String(l.status || "active"),
            Number(l.createdAt || now),
            String(l.createdBy || ""),
            json,
          ],
        );
        break;
      }
      case "loan_repayments": {
        const lr = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO loan_repayments (id, loan_id, amount, date, created_at, created_by, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(lr.loanId || ""),
            Number(lr.amount || 0),
            Number(lr.date || now),
            Number(lr.createdAt || now),
            String(lr.createdBy || ""),
            json,
          ],
        );
        break;
      }
      case "audit_logs": {
        const a = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO audit_logs (id, timestamp, user_id, user_email, role, action, entity, entity_id, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            Number(a.timestamp || now),
            String(a.userId || ""),
            String(a.userEmail || ""),
            String(a.role || ""),
            String(a.action || ""),
            String(a.entity || ""),
            String(a.entityId || ""),
            json,
          ],
        );
        break;
      }
      case "stock_history": {
        const sh = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO stock_history (id, product_id, type, quantity, created_at, created_by, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(sh.productId || ""),
            String(sh.type || ""),
            Number(sh.quantity || 0),
            Number(sh.createdAt || now),
            String(sh.createdBy || ""),
            json,
          ],
        );
        break;
      }
      case "notifications": {
        const n = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO notifications (id, type, title, read, created_at, data) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(n.type || ""),
            String(n.title || ""),
            n.read ? 1 : 0,
            Number(n.createdAt || now),
            json,
          ],
        );
        break;
      }
      case "pre_orders": {
        const po = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO pre_orders (id, pre_order_number, customer_name, status, order_date, created_at, created_by, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(po.preOrderNumber || ""),
            String(po.customerName || ""),
            String(po.status || "pending"),
            Number(po.orderDate || now),
            Number(po.createdAt || now),
            String(po.createdBy || ""),
            json,
          ],
        );
        break;
      }
      case "deliveries": {
        const d = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO deliveries (id, delivery_number, order_id, status, created_at, created_by, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(d.deliveryNumber || ""),
            String(d.orderId || ""),
            String(d.status || "ready"),
            Number(d.createdAt || now),
            String(d.createdBy || ""),
            json,
          ],
        );
        break;
      }
      case "returns": {
        const ret = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO returns (id, return_number, order_id, status, created_at, created_by, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(ret.returnNumber || ""),
            String(ret.orderId || ""),
            String(ret.status || "pending"),
            Number(ret.createdAt || now),
            String(ret.createdBy || ""),
            json,
          ],
        );
        break;
      }
      case "purchases": {
        const pu = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO purchases (id, invoice_number, supplier_id, status, created_at, created_by, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(pu.invoiceNumber || ""),
            String(pu.supplierId || ""),
            String(pu.status || "pending"),
            Number(pu.createdAt || now),
            String(pu.createdBy || ""),
            json,
          ],
        );
        break;
      }
      case "sellers": {
        const se = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO sellers (id, name, created_at, data) VALUES (?, ?, ?, ?)`,
          [id, String(se.name || ""), Number(se.createdAt || now), json],
        );
        break;
      }
      case "wishlist": {
        const w = fullItem as Record<string, unknown>;
        dbInstance.run(
          `INSERT OR REPLACE INTO wishlist (id, product_id, created_at, data) VALUES (?, ?, ?, ?)`,
          [id, String(w.productId || ""), Number(w.createdAt || now), json],
        );
        break;
      }
      default: {
        dbInstance.run(`INSERT OR REPLACE INTO ${table} (id, data, created_at) VALUES (?, ?, ?)`, [
          id,
          json,
          now,
        ]);
        break;
      }
    }
  } else {
    // Write to kv_store
    const fullPath = `${path}/${id}`;
    dbInstance.run(`INSERT OR REPLACE INTO kv_store (path, value, updated_at) VALUES (?, ?, ?)`, [
      fullPath,
      json,
      now,
    ]);
  }

  notifyDbChange(path);
  return id;
}

/** Update an item by path or doc path */
export async function updateItem(path: string, updates: Record<string, unknown>): Promise<void> {
  const dbInstance = await getSqliteDb();
  const parsed = parsePath(path);
  const now = Date.now();

  if (parsed.type === "doc" && parsed.table && parsed.id) {
    const table = parsed.table;
    const id = parsed.id;

    // Fetch existing
    const res = dbInstance.exec(`SELECT data FROM ${table} WHERE id = ?`, [id]);
    let currentData: Record<string, unknown> = {};
    if (res.length && res[0].values?.length) {
      try {
        currentData = JSON.parse(res[0].values[0][0] as string);
      } catch {
        /* ignore */
      }
    }

    const merged = { ...currentData, ...updates, updatedAt: updates.updatedAt || now };
    const json = JSON.stringify(merged);

    // Update row & common column fields if table has them
    if (table === "products") {
      dbInstance.run(
        `UPDATE products SET 
          name = COALESCE(?, name),
          current_stock = COALESCE(?, current_stock),
          buying_price = COALESCE(?, buying_price),
          selling_price = COALESCE(?, selling_price),
          status = COALESCE(?, status),
          updated_at = ?,
          data = ?
        WHERE id = ?`,
        [
          updates.name !== undefined ? String(updates.name) : null,
          updates.currentStock !== undefined ? Number(updates.currentStock) : null,
          updates.buyingPrice !== undefined ? Number(updates.buyingPrice) : null,
          updates.sellingPrice !== undefined ? Number(updates.sellingPrice) : null,
          updates.status !== undefined ? String(updates.status) : null,
          now,
          json,
          id,
        ],
      );
    } else if (table === "orders") {
      dbInstance.run(
        `UPDATE orders SET 
          status = COALESCE(?, status),
          delivered_date = COALESCE(?, delivered_date),
          data = ?
        WHERE id = ?`,
        [
          updates.status !== undefined ? String(updates.status) : null,
          updates.deliveredDate !== undefined ? Number(updates.deliveredDate) : null,
          json,
          id,
        ],
      );
    } else if (table === "users") {
      dbInstance.run(
        `UPDATE users SET 
          display_name = COALESCE(?, display_name),
          role = COALESCE(?, role),
          disabled = COALESCE(?, disabled),
          data = ?
        WHERE id = ?`,
        [
          updates.displayName !== undefined ? String(updates.displayName) : null,
          updates.role !== undefined ? String(updates.role) : null,
          updates.disabled !== undefined ? (updates.disabled ? 1 : 0) : null,
          json,
          id,
        ],
      );
    } else {
      dbInstance.run(`UPDATE ${table} SET data = ? WHERE id = ?`, [json, id]);
    }
  } else {
    // Handle kv_store
    const res = dbInstance.exec(`SELECT value FROM kv_store WHERE path = ?`, [path]);
    let currentData: Record<string, unknown> = {};
    if (res.length && res[0].values?.length) {
      try {
        currentData = JSON.parse(res[0].values[0][0] as string);
      } catch {
        /* ignore */
      }
    }
    const merged = { ...currentData, ...updates };
    dbInstance.run(`INSERT OR REPLACE INTO kv_store (path, value, updated_at) VALUES (?, ?, ?)`, [
      path,
      JSON.stringify(merged),
      now,
    ]);
  }

  notifyDbChange(path);
}

/** Set item or whole path */
export async function setItem<T>(path: string, data: T): Promise<void> {
  const dbInstance = await getSqliteDb();
  const parsed = parsePath(path);
  const now = Date.now();
  const json = JSON.stringify(data);

  if (parsed.type === "doc" && parsed.table && parsed.id) {
    dbInstance.run(`UPDATE ${parsed.table} SET data = ? WHERE id = ?`, [json, parsed.id]);
  } else {
    dbInstance.run(`INSERT OR REPLACE INTO kv_store (path, value, updated_at) VALUES (?, ?, ?)`, [
      path,
      json,
      now,
    ]);
  }

  notifyDbChange(path);
}

/** Remove an item by path */
export async function removeItem(path: string): Promise<void> {
  const dbInstance = await getSqliteDb();
  const parsed = parsePath(path);

  if (parsed.type === "doc" && parsed.table && parsed.id) {
    dbInstance.run(`DELETE FROM ${parsed.table} WHERE id = ?`, [parsed.id]);
  } else if (parsed.type === "collection" && parsed.table) {
    dbInstance.run(`DELETE FROM ${parsed.table}`);
  } else {
    dbInstance.run(`DELETE FROM kv_store WHERE path = ? OR path LIKE ?`, [path, path + "/%"]);
  }

  notifyDbChange(path);
}

/** Append an audit log entry */
export async function logAudit(entry: {
  action: string;
  entity?: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
}) {
  let u: { uid: string; email: string; role?: string } | null = null;
  try {
    const raw =
      typeof localStorage !== "undefined" ? localStorage.getItem("pulse_auth_user") : null;
    if (raw) u = JSON.parse(raw);
  } catch {
    /* ignore */
  }

  const role = u?.role || "moderator";
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const now = Date.now();

  await createItem("audit_logs", {
    timestamp: now,
    userId: u?.uid || "",
    userEmail: u?.email || "",
    role,
    userAgent,
    ...entry,
  });
}

/** Multi-path atomic SQLite transaction update */
export async function update(
  refOrTarget: DbRef | unknown,
  updates: Record<string, unknown>,
): Promise<void> {
  const dbInstance = await getSqliteDb();
  const affectedTables = new Set<string>();

  dbInstance.run("BEGIN TRANSACTION;");
  try {
    // Group updates by table/id
    const groupedDocUpdates: Record<
      string,
      { table: string; id: string; fields: Record<string, unknown> }
    > = {};

    for (const [key, value] of Object.entries(updates)) {
      const cleanKey = key.replace(/^\/+/, "");
      const parts = cleanKey.split("/");

      if (parts.length >= 2) {
        const tableCandidate = TABLE_MAP[parts[0]];
        if (tableCandidate) {
          const docId = parts[1];
          const groupKey = `${tableCandidate}:${docId}`;
          if (!groupedDocUpdates[groupKey]) {
            groupedDocUpdates[groupKey] = {
              table: tableCandidate,
              id: docId,
              fields: {},
            };
          }
          if (parts.length === 2) {
            // Whole object replacement
            if (value && typeof value === "object") {
              Object.assign(groupedDocUpdates[groupKey].fields, value);
            }
          } else {
            // Specific sub-field like `orders/123/status`
            const field = parts.slice(2).join(".");
            groupedDocUpdates[groupKey].fields[field] = value;
          }
          affectedTables.add(tableCandidate);
          continue;
        }
      }

      // Otherwise kv_store update
      dbInstance.run(`INSERT OR REPLACE INTO kv_store (path, value, updated_at) VALUES (?, ?, ?)`, [
        cleanKey,
        JSON.stringify(value),
        Date.now(),
      ]);
      affectedTables.add(cleanKey);
    }

    // Apply grouped doc updates
    for (const { table, id, fields } of Object.values(groupedDocUpdates)) {
      const res = dbInstance.exec(`SELECT data FROM ${table} WHERE id = ?`, [id]);
      let currentData: Record<string, unknown> = {};
      if (res.length && res[0].values?.length) {
        try {
          currentData = JSON.parse(res[0].values[0][0] as string);
        } catch {
          /* ignore */
        }
      }

      const merged = { ...currentData, ...fields };
      const json = JSON.stringify(merged);

      if (table === "products") {
        dbInstance.run(
          `UPDATE products SET 
            current_stock = COALESCE(?, current_stock),
            updated_at = COALESCE(?, updated_at),
            data = ? 
          WHERE id = ?`,
          [
            fields.currentStock !== undefined ? Number(fields.currentStock) : null,
            fields.updatedAt !== undefined ? Number(fields.updatedAt) : Date.now(),
            json,
            id,
          ],
        );
      } else if (table === "orders") {
        dbInstance.run(
          `UPDATE orders SET 
            status = COALESCE(?, status),
            delivered_date = COALESCE(?, delivered_date),
            data = ? 
          WHERE id = ?`,
          [
            fields.status !== undefined ? String(fields.status) : null,
            fields.deliveredDate !== undefined ? Number(fields.deliveredDate) : null,
            json,
            id,
          ],
        );
      } else {
        dbInstance.run(`UPDATE ${table} SET data = ? WHERE id = ?`, [json, id]);
      }
    }

    dbInstance.run("COMMIT;");
  } catch (err) {
    dbInstance.run("ROLLBACK;");
    throw err;
  }

  // Notify affected paths
  for (const t of affectedTables) {
    notifyDbChange(t);
  }
}

/** Database path helper operations */
export async function set(r: DbRef, data: unknown): Promise<void> {
  await setItem(r.path, data);
}

export function push(r: DbRef): DbRef {
  const newKey =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "id_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);
  const newPath = r.path ? `${r.path}/${newKey}` : newKey;
  return { path: newPath, key: newKey };
}

export async function remove(r: DbRef): Promise<void> {
  await removeItem(r.path);
}

export async function get(r: DbRef): Promise<{
  exists: () => boolean;
  val: () => unknown;
}> {
  const dbInstance = await getSqliteDb();
  const parsed = parsePath(r.path);

  if (parsed.type === "collection" && parsed.table) {
    const res = dbInstance.exec(`SELECT id, data FROM ${parsed.table}`);
    if (!res.length || !res[0].values?.length) {
      return { exists: () => false, val: () => null };
    }
    const map: Record<string, unknown> = {};
    for (const [id, dataStr] of res[0].values) {
      try {
        map[id as string] = JSON.parse(dataStr as string);
      } catch {
        map[id as string] = {};
      }
    }
    return { exists: () => true, val: () => map };
  }

  if (parsed.type === "doc" && parsed.table && parsed.id) {
    const res = dbInstance.exec(`SELECT data FROM ${parsed.table} WHERE id = ?`, [parsed.id]);
    if (!res.length || !res[0].values?.length) {
      return { exists: () => false, val: () => null };
    }
    const val = JSON.parse(res[0].values[0][0] as string);
    return { exists: () => true, val: () => val };
  }

  // kv_store lookup
  const res = dbInstance.exec(`SELECT value FROM kv_store WHERE path = ?`, [r.path]);
  if (!res.length || !res[0].values?.length) {
    return { exists: () => false, val: () => null };
  }
  const val = JSON.parse(res[0].values[0][0] as string);
  return { exists: () => true, val: () => val };
}

export function onValue(
  r: DbRef,
  callback: (snapshot: { exists: () => boolean; val: () => unknown }) => void,
  errorCallback?: (err: unknown) => void,
): () => void {
  const load = async () => {
    try {
      const snap = await get(r);
      callback(snap);
    } catch (e) {
      errorCallback?.(e);
    }
  };
  load();

  return subscribeToDbChanges((changedPath) => {
    if (
      changedPath === "*" ||
      changedPath === r.path ||
      changedPath.startsWith(r.path + "/") ||
      r.path.startsWith(changedPath + "/")
    ) {
      load();
    }
  });
}
