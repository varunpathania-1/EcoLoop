require('dotenv').config();

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const pickupRoutes = require('./routes/pickups');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');
const { router: paymentDetailsRoutes } = require('./routes/paymentDetails');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: true,
  credentials: false
}));

app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.originalUrl}`);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const protectedPages = new Set(['/dashboard.html', '/history.html', '/book-pickup.html', '/collector.html', '/collector-pickups.html', '/payment-details.html', '/admin.html', '/admin-collectors.html', '/admin-admins.html']);
// Public entry pages get the same treatment so Back/Forward restores always
// re-run their auth guards instead of showing stale HTML. Static assets
// (CSS/JS/images) keep normal caching.
const noStorePages = new Set(['/', '/index.html', '/login.html', '/register.html', '/admin-login.html']);
app.use((req, res, next) => {
  if (req.method === 'GET' && (protectedPages.has(req.path) || noStorePages.has(req.path))) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/pickups', pickupRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment-details', paymentDetailsRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

async function start() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI || !process.env.JWT_SECRET) {
    throw new Error('Missing MONGODB_URI or JWT_SECRET in environment');
  }

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  return app.listen(PORT, '0.0.0.0', () => {
  console.log(`EcoLoop running at http://0.0.0.0:${PORT}`);
});
}

if (require.main === module) {
  start().catch((err) => {
    console.error('MongoDB connection failed', err.message);
    process.exit(1);
  });
}

module.exports = { app, start };
