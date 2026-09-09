const fs = require('fs');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const url = req.url || '';

  const defaultDB = {
    users: [
      { id: 'usr_admin', email: 'admin@portscanner.com', password: 'hash_123456', name: 'Super Admin', role: 'admin' }
    ],
    requests: [],
    trackings: [],
    carrier_rates: [
      { id: 'rate_1', origin: 'İzmit', destination: 'Pire', carrier: 'MSC', buy_price: 1800, default_markup: 15, transit_days: 3, type: 'Direkt' },
      { id: 'rate_2', origin: 'Ambarlı', destination: 'Shanghai', carrier: 'MAERSK', buy_price: 2100, default_markup: 12, transit_days: 22, type: 'Aktarmalı' },
      { id: 'rate_3', origin: 'Mersin', destination: 'Rotterdam', carrier: 'CMA CGM', buy_price: 2400, default_markup: 10, transit_days: 9, type: 'Direkt' },
      { id: 'rate_4', origin: 'Pendik', destination: 'Trieste', carrier: 'DFDS Seaways', buy_price: 1650, default_markup: 15, transit_days: 3, type: 'Ro-Ro Direkt' },
      { id: 'rate_5', origin: 'Ambarlı', destination: 'Alexandria', carrier: 'ARKAS Line', buy_price: 1250, default_markup: 14, transit_days: 4, type: 'Bölgesel Direkt' },
      { id: 'rate_6', origin: 'Gemlik', destination: 'New York', carrier: 'TURKON Line', buy_price: 2950, default_markup: 12, transit_days: 14, type: 'Ekspres Direkt' },
      { id: 'rate_7', origin: 'Mersin', destination: 'Piraeus', carrier: 'MEDKON Lines', buy_price: 980, default_markup: 16, transit_days: 2, type: 'Kabotaj / Feeder' },
      { id: 'rate_8', origin: 'Yılport', destination: 'Antwerp', carrier: 'GRIMALDI Lines', buy_price: 1900, default_markup: 13, transit_days: 8, type: 'Ro-Ro & Konteyner' }
    ]
  };

  if (url.includes('/auth/login') && req.method === 'POST') {
    const { email, password } = req.body || {};
    if (email === 'admin@portscanner.com' && password === '123456') {
      return res.status(200).json({
        token: 'token_admin_secret_123',
        user: { id: 'usr_admin', email: 'admin@portscanner.com', name: 'Super Admin', role: 'admin' }
      });
    }
    if (email && password) {
      return res.status(200).json({
        token: `token_${Date.now()}`,
        user: { id: `usr_${Date.now()}`, email, name: email.split('@')[0], role: 'customer' }
      });
    }
    return res.status(400).json({ error: 'Geçersiz e-posta veya şifre' });
  }

  if (url.includes('/auth/me')) {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (token) {
      return res.status(200).json({
        user: token.includes('admin')
          ? { id: 'usr_admin', email: 'admin@portscanner.com', name: 'Super Admin', role: 'admin' }
          : { id: 'usr_customer', email: 'musteri@portscanner.com', name: 'Kurumsal Müşteri', role: 'customer' }
      });
    }
    return res.status(401).json({ error: 'Oturum bulunamadı' });
  }

  if (url.includes('/requests')) {
    return res.status(200).json(defaultDB);
  }

  return res.status(200).json({ status: 'Vercel API Active', db: defaultDB });
};
