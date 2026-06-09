/**
 * server.js – Express + SQLite3 Backend Server
 * Beskpoke Tailor Shop
 */

const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

// Determine writable data directory
function getDataPath() {
  const appName = "BespokeTailorData";
  const appData =
    process.env.APPDATA ||
    (process.platform === "darwin"
      ? process.env.HOME + "/Library/Preferences"
      : process.env.HOME + "/.local/share");
  const userDataPath = path.join(appData, appName);

  // If we're in a regular user folder (Documents, Desktop, etc), use local directory
  // If we're in a system folder (Program Files, root C:\), use AppData
  const isSystemPath =
    __dirname.toLowerCase().includes("program files") ||
    __dirname.toLowerCase().includes("c:\\windows") ||
    (__dirname.length <= 15 && __dirname.toLowerCase().includes("c:\\"));

  if (isSystemPath) {
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    return userDataPath;
  }

  // Fallback check: can we actually write here?
  try {
    const testFile = path.join(__dirname, ".write_test");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    return __dirname;
  } catch (e) {
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    return userDataPath;
  }
}

const DATA_DIR = getDataPath();
console.log("Data directory set to:", DATA_DIR);

// Ensure uploads folder exists
const uploadDir = path.join(DATA_DIR, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage configuration for Subcategory images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "subcat-" + uniqueSuffix + ext);
  },
});
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(express.json());

// Serve static assets from the root of the project and static uploads
app.use(express.static(__dirname));
app.use("/uploads", express.static(uploadDir));

// Helper to handle SQLite constraint errors and send user-friendly error messages
function handleSqlError(res, err, context) {
  console.error(`Database error during ${context}:`, err.message);
  if (
    err.message.includes("FOREIGN KEY") ||
    err.message.includes("SQLITE_CONSTRAINT")
  ) {
    let message =
      "Cannot perform this action because it violates a database constraint.";
    if (context === "delete customer") {
      message =
        "Cannot delete this customer because they have existing orders in the system.";
    } else if (context === "delete item") {
      message =
        "Cannot delete this item because it has been used in existing orders.";
    } else if (context === "delete subcategory") {
      message =
        "Cannot delete this subcategory because it contains items referenced in orders.";
    } else if (context === "delete category") {
      message =
        "Cannot delete this category because it contains subcategories or items referenced in orders.";
    } else if (context === "delete user") {
      message =
        "Cannot delete this user because they have recorded sales/orders.";
    }
    return res.status(409).json({ message });
  }
  res.status(500).json({ message: err.message });
}

// Database setup
const dbPath = path.join(DATA_DIR, "beskpoke.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening SQLite database:", err.message);
  } else {
    console.log("Connected to SQLite database at:", dbPath);
    // Copy existing db if it exists in __dirname but not in DATA_DIR
    const localDb = path.join(__dirname, "beskpoke.db");
    if (
      DATA_DIR !== __dirname &&
      fs.existsSync(localDb) &&
      !fs.existsSync(dbPath)
    ) {
      try {
        fs.copyFileSync(localDb, dbPath);
        console.log("Migrated local database to:", dbPath);
      } catch (migrateErr) {
        console.error("Migration failed:", migrateErr.message);
      }
    }
    initDb().catch(console.error);
  }
});

// Helper functions for Promise-based db operations
const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

// Database Schema Initialization and Seeding
async function initDb() {
  await dbRun("PRAGMA foreign_keys = ON;");

  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      UserID INTEGER PRIMARY KEY AUTOINCREMENT,
      Username TEXT UNIQUE NOT NULL,
      PasswordHash TEXT NOT NULL,
      Email TEXT,
      Phone TEXT,
      Role TEXT NOT NULL,
      Name TEXT NOT NULL
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS categories (
      CategoryID INTEGER PRIMARY KEY AUTOINCREMENT,
      Name TEXT NOT NULL
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS subcategories (
      SubcatID INTEGER PRIMARY KEY AUTOINCREMENT,
      CategoryID INTEGER NOT NULL,
      Name TEXT NOT NULL,
      Image TEXT,
      FOREIGN KEY (CategoryID) REFERENCES categories(CategoryID) ON DELETE CASCADE
    )
  `);

  // Migrate existing databases to support subcategory images
  try {
    await dbRun("ALTER TABLE subcategories ADD COLUMN Image TEXT;");
    console.log("Database migrated: Added Image column to subcategories.");
  } catch (e) {
    // Ignore error if column already exists
  }

  await dbRun(`
    CREATE TABLE IF NOT EXISTS items (
      ItemID INTEGER PRIMARY KEY AUTOINCREMENT,
      CategoryID INTEGER NOT NULL,
      SubcatID INTEGER NOT NULL,
      Name TEXT NOT NULL,
      UnitPrice REAL NOT NULL,
      Notes TEXT,
      FOREIGN KEY (CategoryID) REFERENCES categories(CategoryID) ON DELETE CASCADE,
      FOREIGN KEY (SubcatID) REFERENCES subcategories(SubcatID) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS customers (
      CustomerID INTEGER PRIMARY KEY AUTOINCREMENT,
      Name TEXT NOT NULL,
      Phone TEXT,
      Email TEXT,
      Address TEXT
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS orders (
      OrderID INTEGER PRIMARY KEY AUTOINCREMENT,
      CustomerID INTEGER NOT NULL,
      UserID INTEGER NOT NULL,
      OrderDate TEXT NOT NULL,
      TotalAmount REAL NOT NULL,
      FOREIGN KEY (CustomerID) REFERENCES customers(CustomerID) ON DELETE RESTRICT,
      FOREIGN KEY (UserID) REFERENCES users(UserID) ON DELETE RESTRICT
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS orderlines (
      LineID INTEGER PRIMARY KEY AUTOINCREMENT,
      OrderID INTEGER NOT NULL,
      ItemID INTEGER,
      CategoryID INTEGER,
      SubcatID INTEGER,
      Description TEXT,
      Quantity REAL NOT NULL,
      UnitPrice REAL NOT NULL,
      LineTotal REAL NOT NULL,
      FOREIGN KEY (OrderID) REFERENCES orders(OrderID) ON DELETE CASCADE
    )
  `);

  // Migrate existing databases: add new columns if not present
  const migrations = [
    "ALTER TABLE orderlines ADD COLUMN CategoryID INTEGER",
    "ALTER TABLE orderlines ADD COLUMN SubcatID INTEGER",
    "ALTER TABLE orderlines ADD COLUMN Description TEXT",
  ];
  for (const sql of migrations) {
    try {
      await dbRun(sql);
    } catch (e) {
      /* column already exists */
    }
  }

  // Migrate existing databases: make ItemID nullable if it currently has NOT NULL constraint
  try {
    const tableInfo = await dbAll("PRAGMA table_info(orderlines);");
    const itemIdCol = tableInfo.find((c) => c.name === "ItemID");
    if (itemIdCol && itemIdCol.notnull === 1) {
      console.log("Migrating orderlines table: making ItemID nullable...");
      // 1. Temporarily turn off foreign keys for table restructuring
      await dbRun("PRAGMA foreign_keys = OFF;");

      // 2. Create the target nullable schema table
      await dbRun(`
        CREATE TABLE orderlines_new (
          LineID INTEGER PRIMARY KEY AUTOINCREMENT,
          OrderID INTEGER NOT NULL,
          ItemID INTEGER,
          CategoryID INTEGER,
          SubcatID INTEGER,
          Description TEXT,
          Quantity REAL NOT NULL,
          UnitPrice REAL NOT NULL,
          LineTotal REAL NOT NULL,
          FOREIGN KEY (OrderID) REFERENCES orders(OrderID) ON DELETE CASCADE
        )
      `);

      // 3. Copy existing records
      await dbRun(`
        INSERT INTO orderlines_new (LineID, OrderID, ItemID, CategoryID, SubcatID, Description, Quantity, UnitPrice, LineTotal)
        SELECT LineID, OrderID, ItemID, CategoryID, SubcatID, Description, Quantity, UnitPrice, LineTotal FROM orderlines;
      `);

      // 4. Drop old table
      await dbRun("DROP TABLE orderlines;");

      // 5. Rename new table
      await dbRun("ALTER TABLE orderlines_new RENAME TO orderlines;");

      // 6. Turn back on foreign key checks
      await dbRun("PRAGMA foreign_keys = ON;");
      console.log(
        "Database migrated successfully: ItemID column is now nullable.",
      );
    }
  } catch (err) {
    console.error(
      "Failed executing orderlines ItemID nullable migration:",
      err.message,
    );
    try {
      await dbRun("PRAGMA foreign_keys = ON;");
    } catch (e) {}
  }

  await dbRun(`
    CREATE TABLE IF NOT EXISTS auditlog (
      LogID INTEGER PRIMARY KEY AUTOINCREMENT,
      UserID INTEGER,
      Action TEXT NOT NULL,
      Timestamp TEXT NOT NULL,
      Details TEXT
    )
  `);

  // Seeding default data if no users exist
  const userCount = await dbGet("SELECT COUNT(*) as count FROM users");
  if (userCount.count === 0) {
    console.log("Seeding initial SQLite database...");

    // Users
    await dbRun(
      "INSERT INTO users (Username, PasswordHash, Email, Phone, Role, Name) VALUES (?, ?, ?, ?, ?, ?)",
      ["admin", "admin123", "admin@beskpoke.com", "", "Admin", "Administrator"],
    );
    await dbRun(
      "INSERT INTO users (Username, PasswordHash, Email, Phone, Role, Name) VALUES (?, ?, ?, ?, ?, ?)",
      ["clerk", "clerk123", "clerk@beskpoke.com", "", "Clerk", "Sarah Clerk"],
    );

    // Categories
    const jacketCat = await dbRun("INSERT INTO categories (Name) VALUES (?)", [
      "Jacket",
    ]);
    const pantCat = await dbRun("INSERT INTO categories (Name) VALUES (?)", [
      "Pant",
    ]);
    const shirtCat = await dbRun("INSERT INTO categories (Name) VALUES (?)", [
      "Shirt",
    ]);

    const jacketCatId = jacketCat.id;
    const pantCatId = pantCat.id;
    const shirtCatId = shirtCat.id;

    // Subcategories
    const leatherSub = await dbRun(
      "INSERT INTO subcategories (CategoryID, Name, Image) VALUES (?, ?, ?)",
      [jacketCatId, "Leather", ""],
    );
    const denimSub = await dbRun(
      "INSERT INTO subcategories (CategoryID, Name, Image) VALUES (?, ?, ?)",
      [jacketCatId, "Denim", ""],
    );
    const formalPantSub = await dbRun(
      "INSERT INTO subcategories (CategoryID, Name, Image) VALUES (?, ?, ?)",
      [pantCatId, "Formal", ""],
    );
    const casualPantSub = await dbRun(
      "INSERT INTO subcategories (CategoryID, Name, Image) VALUES (?, ?, ?)",
      [pantCatId, "Casual", ""],
    );
    const casualShirtSub = await dbRun(
      "INSERT INTO subcategories (CategoryID, Name, Image) VALUES (?, ?, ?)",
      [shirtCatId, "Casual", ""],
    );
    const formalShirtSub = await dbRun(
      "INSERT INTO subcategories (CategoryID, Name, Image) VALUES (?, ?, ?)",
      [shirtCatId, "Formal", ""],
    );

    const leatherSubId = leatherSub.id;
    const denimSubId = denimSub.id;
    const formalPantSubId = formalPantSub.id;
    const casualPantSubId = casualPantSub.id;
    const casualShirtSubId = casualShirtSub.id;
    const formalShirtSubId = formalShirtSub.id;

    // Items
    await dbRun(
      "INSERT INTO items (CategoryID, SubcatID, Name, UnitPrice, Notes) VALUES (?, ?, ?, ?, ?)",
      [
        jacketCatId,
        leatherSubId,
        "Black Leather Jacket",
        120.0,
        "Premium full-grain leather",
      ],
    );
    await dbRun(
      "INSERT INTO items (CategoryID, SubcatID, Name, UnitPrice, Notes) VALUES (?, ?, ?, ?, ?)",
      [
        jacketCatId,
        leatherSubId,
        "Brown Leather Jacket",
        115.0,
        "Vintage style",
      ],
    );
    await dbRun(
      "INSERT INTO items (CategoryID, SubcatID, Name, UnitPrice, Notes) VALUES (?, ?, ?, ?, ?)",
      [jacketCatId, denimSubId, "Blue Denim Jacket", 80.0, "Classic fit"],
    );
    await dbRun(
      "INSERT INTO items (CategoryID, SubcatID, Name, UnitPrice, Notes) VALUES (?, ?, ?, ?, ?)",
      [pantCatId, formalPantSubId, "Black Dress Pants", 90.0, "Slim cut"],
    );
    await dbRun(
      "INSERT INTO items (CategoryID, SubcatID, Name, UnitPrice, Notes) VALUES (?, ?, ?, ?, ?)",
      [pantCatId, formalPantSubId, "Navy Dress Pants", 85.0, "Regular fit"],
    );
    await dbRun(
      "INSERT INTO items (CategoryID, SubcatID, Name, UnitPrice, Notes) VALUES (?, ?, ?, ?, ?)",
      [pantCatId, casualPantSubId, "Khaki Chinos", 65.0, ""],
    );
    await dbRun(
      "INSERT INTO items (CategoryID, SubcatID, Name, UnitPrice, Notes) VALUES (?, ?, ?, ?, ?)",
      [shirtCatId, formalShirtSubId, "White Dress Shirt", 55.0, "French cuff"],
    );
    await dbRun(
      "INSERT INTO items (CategoryID, SubcatID, Name, UnitPrice, Notes) VALUES (?, ?, ?, ?, ?)",
      [
        shirtCatId,
        casualShirtSubId,
        "Oxford Shirt",
        45.0,
        "Button-down collar",
      ],
    );

    // Customers
    await dbRun(
      "INSERT INTO customers (Name, Phone, Email, Address) VALUES (?, ?, ?, ?)",
      ["Alice Smith", "555-0101", "alice@example.com", "123 Main St"],
    );
    await dbRun(
      "INSERT INTO customers (Name, Phone, Email, Address) VALUES (?, ?, ?, ?)",
      ["Bob Johnson", "555-0102", "bob@example.com", "456 Oak Ave"],
    );
    await dbRun(
      "INSERT INTO customers (Name, Phone, Email, Address) VALUES (?, ?, ?, ?)",
      ["Carol White", "555-0103", "carol@example.com", "789 Pine Rd"],
    );
    await dbRun(
      "INSERT INTO customers (Name, Phone, Email, Address) VALUES (?, ?, ?, ?)",
      ["David Brown", "555-0104", "david@example.com", "321 Elm St"],
    );
    await dbRun(
      "INSERT INTO customers (Name, Phone, Email, Address) VALUES (?, ?, ?, ?)",
      ["Emma Davis", "555-0105", "emma@example.com", "654 Maple Dr"],
    );

    console.log("Database seeded successfully.");
  }
}

// ── REST API ROUTES ──────────────────────────────────────────────

// Status check endpoint
app.get("/api/status", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Customers CRUD
app.get("/api/customers", async (req, res) => {
  try {
    const list = await dbAll("SELECT * FROM customers");
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/customers/:id", async (req, res) => {
  try {
    const row = await dbGet("SELECT * FROM customers WHERE CustomerID = ?", [
      req.params.id,
    ]);
    if (!row) return res.status(404).json({ message: "Customer not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/customers", async (req, res) => {
  const { Name, Phone, Email, Address } = req.body;
  if (!Name) return res.status(400).json({ message: "Name is required" });
  try {
    const result = await dbRun(
      "INSERT INTO customers (Name, Phone, Email, Address) VALUES (?, ?, ?, ?)",
      [Name, Phone, Email, Address],
    );
    res.status(201).json(result.id);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put("/api/customers/:id", async (req, res) => {
  const { Name, Phone, Email, Address } = req.body;
  if (!Name) return res.status(400).json({ message: "Name is required" });
  try {
    const result = await dbRun(
      "UPDATE customers SET Name = ?, Phone = ?, Email = ?, Address = ? WHERE CustomerID = ?",
      [Name, Phone, Email, Address, req.params.id],
    );
    if (result.changes === 0)
      return res.status(404).json({ message: "Customer not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete("/api/customers/:id", async (req, res) => {
  try {
    const result = await dbRun("DELETE FROM customers WHERE CustomerID = ?", [
      req.params.id,
    ]);
    if (result.changes === 0)
      return res.status(404).json({ message: "Customer not found" });
    res.json({ success: true });
  } catch (err) {
    handleSqlError(res, err, "delete customer");
  }
});

// Categories CRUD
app.get("/api/categories", async (req, res) => {
  try {
    const list = await dbAll("SELECT * FROM categories");
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/categories/:id", async (req, res) => {
  try {
    const row = await dbGet("SELECT * FROM categories WHERE CategoryID = ?", [
      req.params.id,
    ]);
    if (!row) return res.status(404).json({ message: "Category not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/categories", async (req, res) => {
  const { Name } = req.body;
  if (!Name) return res.status(400).json({ message: "Name is required" });
  try {
    const result = await dbRun("INSERT INTO categories (Name) VALUES (?)", [
      Name,
    ]);
    res.status(201).json(result.id);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put("/api/categories/:id", async (req, res) => {
  const { Name } = req.body;
  if (!Name) return res.status(400).json({ message: "Name is required" });
  try {
    const result = await dbRun(
      "UPDATE categories SET Name = ? WHERE CategoryID = ?",
      [Name, req.params.id],
    );
    if (result.changes === 0)
      return res.status(404).json({ message: "Category not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete("/api/categories/:id", async (req, res) => {
  try {
    const result = await dbRun("DELETE FROM categories WHERE CategoryID = ?", [
      req.params.id,
    ]);
    if (result.changes === 0)
      return res.status(404).json({ message: "Category not found" });
    res.json({ success: true });
  } catch (err) {
    handleSqlError(res, err, "delete category");
  }
});

// Subcategories CRUD
app.get("/api/subcategories", async (req, res) => {
  try {
    const list = await dbAll("SELECT * FROM subcategories");
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/subcategories/:id", async (req, res) => {
  try {
    const row = await dbGet("SELECT * FROM subcategories WHERE SubcatID = ?", [
      req.params.id,
    ]);
    if (!row) return res.status(404).json({ message: "Subcategory not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Endpoint to upload a subcategory image
app.post("/api/subcategories/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded." });
  }
  const filePath = `/uploads/${req.file.filename}`;
  res.json({ filePath });
});

app.post("/api/subcategories", async (req, res) => {
  const { CategoryID, Name, Image } = req.body;
  if (!CategoryID || !Name)
    return res
      .status(400)
      .json({ message: "CategoryID and Name are required" });
  try {
    const result = await dbRun(
      "INSERT INTO subcategories (CategoryID, Name, Image) VALUES (?, ?, ?)",
      [CategoryID, Name, Image || ""],
    );
    res.status(201).json(result.id);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put("/api/subcategories/:id", async (req, res) => {
  const { CategoryID, Name, Image } = req.body;
  if (!CategoryID || !Name)
    return res
      .status(400)
      .json({ message: "CategoryID and Name are required" });
  try {
    const result = await dbRun(
      "UPDATE subcategories SET CategoryID = ?, Name = ?, Image = ? WHERE SubcatID = ?",
      [CategoryID, Name, Image !== undefined ? Image : "", req.params.id],
    );
    if (result.changes === 0)
      return res.status(404).json({ message: "Subcategory not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete("/api/subcategories/:id", async (req, res) => {
  try {
    const result = await dbRun("DELETE FROM subcategories WHERE SubcatID = ?", [
      req.params.id,
    ]);
    if (result.changes === 0)
      return res.status(404).json({ message: "Subcategory not found" });
    res.json({ success: true });
  } catch (err) {
    handleSqlError(res, err, "delete subcategory");
  }
});

// Items CRUD
app.get("/api/items", async (req, res) => {
  try {
    const list = await dbAll("SELECT * FROM items");
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/items/:id", async (req, res) => {
  try {
    const row = await dbGet("SELECT * FROM items WHERE ItemID = ?", [
      req.params.id,
    ]);
    if (!row) return res.status(404).json({ message: "Item not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/items", async (req, res) => {
  const { CategoryID, SubcatID, Name, UnitPrice, Notes } = req.body;
  if (!CategoryID || !SubcatID || !Name || UnitPrice === undefined) {
    return res.status(400).json({
      message: "CategoryID, SubcatID, Name, and UnitPrice are required",
    });
  }
  try {
    const result = await dbRun(
      "INSERT INTO items (CategoryID, SubcatID, Name, UnitPrice, Notes) VALUES (?, ?, ?, ?, ?)",
      [CategoryID, SubcatID, Name, UnitPrice, Notes],
    );
    res.status(201).json(result.id);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put("/api/items/:id", async (req, res) => {
  const { CategoryID, SubcatID, Name, UnitPrice, Notes } = req.body;
  if (!CategoryID || !SubcatID || !Name || UnitPrice === undefined) {
    return res.status(400).json({
      message: "CategoryID, SubcatID, Name, and UnitPrice are required",
    });
  }
  try {
    const result = await dbRun(
      "UPDATE items SET CategoryID = ?, SubcatID = ?, Name = ?, UnitPrice = ?, Notes = ? WHERE ItemID = ?",
      [CategoryID, SubcatID, Name, UnitPrice, Notes, req.params.id],
    );
    if (result.changes === 0)
      return res.status(404).json({ message: "Item not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete("/api/items/:id", async (req, res) => {
  try {
    const result = await dbRun("DELETE FROM items WHERE ItemID = ?", [
      req.params.id,
    ]);
    if (result.changes === 0)
      return res.status(404).json({ message: "Item not found" });
    res.json({ success: true });
  } catch (err) {
    handleSqlError(res, err, "delete item");
  }
});

// Orders CRUD
app.get("/api/orders", async (req, res) => {
  try {
    const list = await dbAll("SELECT * FROM orders");
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/orders/:id", async (req, res) => {
  try {
    const row = await dbGet("SELECT * FROM orders WHERE OrderID = ?", [
      req.params.id,
    ]);
    if (!row) return res.status(404).json({ message: "Order not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/orders", async (req, res) => {
  const { CustomerID, UserID, OrderDate, TotalAmount } = req.body;
  if (!CustomerID || !UserID || !OrderDate || TotalAmount === undefined) {
    return res.status(400).json({
      message: "CustomerID, UserID, OrderDate, and TotalAmount are required",
    });
  }
  try {
    const result = await dbRun(
      "INSERT INTO orders (CustomerID, UserID, OrderDate, TotalAmount) VALUES (?, ?, ?, ?)",
      [CustomerID, UserID, OrderDate, TotalAmount],
    );
    res.status(201).json(result.id);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put("/api/orders/:id", async (req, res) => {
  const { CustomerID, UserID, OrderDate, TotalAmount } = req.body;
  if (!CustomerID || !UserID || !OrderDate || TotalAmount === undefined) {
    return res.status(400).json({
      message: "CustomerID, UserID, OrderDate, and TotalAmount are required",
    });
  }
  try {
    const result = await dbRun(
      "UPDATE orders SET CustomerID = ?, UserID = ?, OrderDate = ?, TotalAmount = ? WHERE OrderID = ?",
      [CustomerID, UserID, OrderDate, TotalAmount, req.params.id],
    );
    if (result.changes === 0)
      return res.status(404).json({ message: "Order not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete("/api/orders/:id", async (req, res) => {
  try {
    const result = await dbRun("DELETE FROM orders WHERE OrderID = ?", [
      req.params.id,
    ]);
    if (result.changes === 0)
      return res.status(404).json({ message: "Order not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// OrderLines CRUD
app.get("/api/orderlines", async (req, res) => {
  try {
    const list = await dbAll("SELECT * FROM orderlines");
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/orderlines/:id", async (req, res) => {
  try {
    const row = await dbGet("SELECT * FROM orderlines WHERE LineID = ?", [
      req.params.id,
    ]);
    if (!row) return res.status(404).json({ message: "OrderLine not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/orderlines", async (req, res) => {
  const {
    OrderID,
    ItemID,
    CategoryID,
    SubcatID,
    Description,
    Quantity,
    UnitPrice,
    LineTotal,
  } = req.body;
  if (
    !OrderID ||
    Quantity === undefined ||
    UnitPrice === undefined ||
    LineTotal === undefined
  ) {
    return res.status(400).json({
      message: "OrderID, Quantity, UnitPrice, and LineTotal are required",
    });
  }
  try {
    const result = await dbRun(
      "INSERT INTO orderlines (OrderID, ItemID, CategoryID, SubcatID, Description, Quantity, UnitPrice, LineTotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        OrderID,
        ItemID || null,
        CategoryID || null,
        SubcatID || null,
        Description || null,
        Quantity,
        UnitPrice,
        LineTotal,
      ],
    );
    res.status(201).json(result.id);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put("/api/orderlines/:id", async (req, res) => {
  const {
    OrderID,
    ItemID,
    CategoryID,
    SubcatID,
    Description,
    Quantity,
    UnitPrice,
    LineTotal,
  } = req.body;
  if (
    !OrderID ||
    Quantity === undefined ||
    UnitPrice === undefined ||
    LineTotal === undefined
  ) {
    return res.status(400).json({
      message: "OrderID, Quantity, UnitPrice, and LineTotal are required",
    });
  }
  try {
    const result = await dbRun(
      "UPDATE orderlines SET OrderID = ?, ItemID = ?, CategoryID = ?, SubcatID = ?, Description = ?, Quantity = ?, UnitPrice = ?, LineTotal = ? WHERE LineID = ?",
      [
        OrderID,
        ItemID || null,
        CategoryID || null,
        SubcatID || null,
        Description || null,
        Quantity,
        UnitPrice,
        LineTotal,
        req.params.id,
      ],
    );
    if (result.changes === 0)
      return res.status(404).json({ message: "OrderLine not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete("/api/orderlines/:id", async (req, res) => {
  try {
    const result = await dbRun("DELETE FROM orderlines WHERE LineID = ?", [
      req.params.id,
    ]);
    if (result.changes === 0)
      return res.status(404).json({ message: "OrderLine not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Additional OrderLines delete helper by OrderID
app.delete("/api/orderlines/order/:orderId", async (req, res) => {
  try {
    await dbRun("DELETE FROM orderlines WHERE OrderID = ?", [
      req.params.orderId,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Users CRUD
app.get("/api/users", async (req, res) => {
  try {
    const list = await dbAll("SELECT * FROM users");
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/users/:id", async (req, res) => {
  try {
    const row = await dbGet("SELECT * FROM users WHERE UserID = ?", [
      req.params.id,
    ]);
    if (!row) return res.status(404).json({ message: "User not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/users", async (req, res) => {
  const { Username, PasswordHash, Email, Phone, Role, Name } = req.body;
  if (!Username || !PasswordHash || !Role || !Name) {
    return res
      .status(400)
      .json({ message: "Username, PasswordHash, Role, and Name are required" });
  }
  try {
    const result = await dbRun(
      "INSERT INTO users (Username, PasswordHash, Email, Phone, Role, Name) VALUES (?, ?, ?, ?, ?, ?)",
      [Username, PasswordHash, Email, Phone, Role, Name],
    );
    res.status(201).json(result.id);
  } catch (err) {
    if (err.message.includes("UNIQUE")) {
      res.status(409).json({ message: "Username is already taken" });
    } else {
      res.status(500).json({ message: err.message });
    }
  }
});

app.put("/api/users/:id", async (req, res) => {
  const { Username, PasswordHash, Email, Phone, Role, Name } = req.body;
  if (!Username || !PasswordHash || !Role || !Name) {
    return res
      .status(400)
      .json({ message: "Username, PasswordHash, Role, and Name are required" });
  }
  try {
    const result = await dbRun(
      "UPDATE users SET Username = ?, PasswordHash = ?, Email = ?, Phone = ?, Role = ?, Name = ? WHERE UserID = ?",
      [Username, PasswordHash, Email, Phone, Role, Name, req.params.id],
    );
    if (result.changes === 0)
      return res.status(404).json({ message: "User not found" });
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes("UNIQUE")) {
      res.status(409).json({ message: "Username is already taken" });
    } else {
      res.status(500).json({ message: err.message });
    }
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    const result = await dbRun("DELETE FROM users WHERE UserID = ?", [
      req.params.id,
    ]);
    if (result.changes === 0)
      return res.status(404).json({ message: "User not found" });
    res.json({ success: true });
  } catch (err) {
    handleSqlError(res, err, "delete user");
  }
});

// AuditLog endpoints
app.get("/api/auditlog", async (req, res) => {
  try {
    const list = await dbAll("SELECT * FROM auditlog");
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/auditlog", async (req, res) => {
  const { UserID, Action, Timestamp, Details } = req.body;
  if (!Action || !Timestamp) {
    return res
      .status(400)
      .json({ message: "Action and Timestamp are required" });
  }
  try {
    const result = await dbRun(
      "INSERT INTO auditlog (UserID, Action, Timestamp, Details) VALUES (?, ?, ?, ?)",
      [UserID, Action, Timestamp, Details],
    );
    res.status(201).json(result.id);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Catch-all route to serve index.html for UI SPA routing, if any
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Function to open browser
function openBrowser(url) {
  // Detect if running as a packaged executable
  const isPkg = typeof process.pkg !== "undefined";
  const isProduction = process.env.NODE_ENV === "production";
  const manualNoOpen = process.argv.includes("--no-open");

  if (!manualNoOpen) {
    console.log("Automatically opening browser...");
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", url]);
    } else if (process.platform === "darwin") {
      spawn("open", [url]);
    } else {
      spawn("xdg-open", [url]);
    }
  }
}

// Start the server
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Server is running at ${url}`);

  // Auto-open browser when running as packaged executable
  openBrowser(url);
});
