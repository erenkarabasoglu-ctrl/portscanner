const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');
const HTML_FILE = path.join(__dirname, 'index.html');

function initDB() {
  if (!fs.existsSync(DB_FILE)) {
    const defaultData = {
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
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
  } else {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      if (!data.users) data.users = [
         { id: 'usr_admin', email: 'admin@portscanner.com', password: 'hash_123456', name: 'Super Admin', role: 'admin' }
      ];
      if (!data.carrier_rates || data.carrier_rates.length < 5) {
        data.carrier_rates = [
          { id: 'rate_1', origin: 'İzmit', destination: 'Pire', carrier: 'MSC', buy_price: 1800, default_markup: 15, transit_days: 3, type: 'Direkt' },
          { id: 'rate_2', origin: 'Ambarlı', destination: 'Shanghai', carrier: 'MAERSK', buy_price: 2100, default_markup: 12, transit_days: 22, type: 'Aktarmalı' },
          { id: 'rate_3', origin: 'Mersin', destination: 'Rotterdam', carrier: 'CMA CGM', buy_price: 2400, default_markup: 10, transit_days: 9, type: 'Direkt' },
          { id: 'rate_4', origin: 'Pendik', destination: 'Trieste', carrier: 'DFDS Seaways', buy_price: 1650, default_markup: 15, transit_days: 3, type: 'Ro-Ro Direkt' },
          { id: 'rate_5', origin: 'Ambarlı', destination: 'Alexandria', carrier: 'ARKAS Line', buy_price: 1250, default_markup: 14, transit_days: 4, type: 'Bölgesel Direkt' },
          { id: 'rate_6', origin: 'Gemlik', destination: 'New York', carrier: 'TURKON Line', buy_price: 2950, default_markup: 12, transit_days: 14, type: 'Ekspres Direkt' },
          { id: 'rate_7', origin: 'Mersin', destination: 'Piraeus', carrier: 'MEDKON Lines', buy_price: 980, default_markup: 16, transit_days: 2, type: 'Kabotaj / Feeder' },
          { id: 'rate_8', origin: 'Yılport', destination: 'Antwerp', carrier: 'GRIMALDI Lines', buy_price: 1900, default_markup: 13, transit_days: 8, type: 'Ro-Ro & Konteyner' }
        ];
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
      }
    } catch(e) {}
  }
}
initDB();

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); } catch (e) { return { users: [], requests: [], trackings: [] }; }
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

const sseClients = new Set();
function broadcastSSE(data) {
  // Parolaları çıkartarak yolla (Güvenlik)
  const safeData = { ...data, users: undefined };
  const payload = `data: ${JSON.stringify(safeData)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

// Basit Token => User Map
const activeTokens = new Map();

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch(e) { reject(e); }
    });
  });
}

function getUserFromToken(req) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if(!token) return null;
  return activeTokens.get(token);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  const reqUrl = req.url.split('?')[0];

  if (reqUrl === '/bg.webp') {
    fs.readFile(path.join(__dirname, 'bg.webp'), (err, data) => {
      if(err) { res.writeHead(404); res.end(); }
      else { res.writeHead(200, { 'Content-Type': 'image/webp' }); res.end(data); }
    });
    return;
  }

  if (reqUrl === '/logo.jpg' || reqUrl === '/portscanner-og.jpg') {
    fs.readFile(path.join(__dirname, 'logo.jpg'), (err, data) => {
      if(err) { res.writeHead(404); res.end(); }
      else { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); res.end(data); }
    });
    return;
  }

  if (reqUrl === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const db = readDB();
    res.write(`data: ${JSON.stringify({...db, users: undefined})}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // AUTH ENDPOINTS
  if (req.method === 'POST' && reqUrl === '/api/auth/login') {
    try {
      const payload = await parseBody(req);
      const db = readDB();
      const user = db.users.find(u => u.email === payload.email && u.password === 'hash_' + payload.password);
      if(!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geçersiz e-posta veya şifre' }));
        return;
      }
      const token = crypto.randomBytes(16).toString('hex');
      activeTokens.set(token, user);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, last_search_state: user.last_search_state } }));
    } catch(err) { res.writeHead(400); res.end(); }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/auth/register') {
    try {
      const payload = await parseBody(req);
      const db = readDB();
      if(db.users.find(u => u.email === payload.email)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bu e-posta zaten kayıtlı.' }));
        return;
      }
      const newUser = {
        id: 'usr_' + Date.now(),
        email: payload.email,
        password: 'hash_' + payload.password, // basit hash simülasyonu
        name: payload.name || payload.email.split('@')[0],
        role: 'customer'
      };
      db.users.push(newUser);
      writeDB(db);

      const token = crypto.randomBytes(16).toString('hex');
      activeTokens.set(token, newUser);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token, user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role, last_search_state: newUser.last_search_state } }));
    } catch(err) { res.writeHead(400); res.end(); }
    return;
  }

  if (req.method === 'GET' && req.url === '/api/auth/me') {
    const user = getUserFromToken(req);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if(user) res.end(JSON.stringify({ user: { id: user.id, email: user.email, name: user.name, role: user.role, last_search_state: user.last_search_state } }));
    else res.end(JSON.stringify({ user: null }));
    return;
  }

  // UPDATE SESSION STATE
  if (req.method === 'POST' && req.url === '/api/user/session-state') {
    try {
      const user = getUserFromToken(req);
      if(!user) { res.writeHead(401); res.end('Unauthorized'); return; }

      const payload = await parseBody(req);
      const db = readDB();
      const uIndex = db.users.findIndex(u => u.id === user.id);
      if(uIndex > -1) {
        db.users[uIndex].last_search_state = {
          ...(db.users[uIndex].last_search_state || {}),
          ...payload
        };
        user.last_search_state = db.users[uIndex].last_search_state;
        writeDB(db);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, last_search_state: user.last_search_state }));
    } catch(err) { res.writeHead(400); res.end(); }
    return;
  }

  // GET ALL DATA (Protected by User)
  if (req.method === 'GET' && req.url === '/api/requests') {
    const user = getUserFromToken(req);
    const db = readDB();
    const safeDb = { requests: [], trackings: db.trackings, carrier_rates: db.carrier_rates || [] };

    if(user) {
      if(user.role === 'admin') {
        safeDb.requests = db.requests; // Admin her şeyi görür
      } else {
        safeDb.requests = db.requests.filter(r => r.user_id === user.id); // Müşteri sadece kendininkini
      }
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(safeDb));
    return;
  }

  // ADMIN: CARRIER RATES MANAGEMENT
  if (req.method === 'POST' && req.url === '/api/rates') {
    try {
      const user = getUserFromToken(req);
      if(!user || user.role !== 'admin') { res.writeHead(403); res.end('Forbidden'); return; }

      const payload = await parseBody(req);
      const db = readDB();
      if (!db.carrier_rates) db.carrier_rates = [];

      const newRate = {
        id: 'rate_' + Date.now(),
        origin: payload.origin,
        destination: payload.destination,
        carrier: payload.carrier,
        buy_price: Number(payload.buy_price),
        default_markup: Number(payload.default_markup || 10),
        transit_days: Number(payload.transit_days || 5),
        type: payload.type || 'Direkt'
      };

      db.carrier_rates.unshift(newRate);
      writeDB(db);
      broadcastSSE(db);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(newRate));
    } catch(err) { res.writeHead(400); res.end(); }
    return;
  }

  // CREATE REQUEST & INSTANT AUTOMATIC FREIGHT QUOTING ENGINE (OTOMATİK ANLIK FİYAT VERME MOTORU)
  if (req.method === 'POST' && req.url === '/api/requests') {
    try {
      const user = getUserFromToken(req);
      if(!user) { res.writeHead(401); res.end('Unauthorized'); return; }

      const payload = await parseBody(req);
      const db = readDB();

      const origin = payload.origin || 'İzmit';
      const destination = payload.destination || 'Pire';

      // 1. Navlun Kütüphanesindeki Armatör Alış Fiyatlarını Taraması
      const matchedRates = (db.carrier_rates || []).filter(r => 
        r.origin.toLowerCase().trim() === origin.toLowerCase().trim() &&
        r.destination.toLowerCase().trim() === destination.toLowerCase().trim()
      );

      let autoQuotes = [];

      if (matchedRates.length > 0) {
        // Kütüphanede birebir armatör tarife eşleşmesi varsa otomatik fiyat üret
        autoQuotes = matchedRates.map(r => {
          const buyPrice = Number(r.buy_price);
          const markup = Number(r.default_markup || 15);
          const netProfit = Math.round(buyPrice * (markup / 100));
          const sellPrice = buyPrice + netProfit;
          
          return {
            id: 'Q-AUTO-' + Math.floor(10000 + Math.random() * 90000),
            carrier: r.carrier,
            verified: true,
            reliability: 98,
            capacity: 'GUARANTEED',
            type: r.type || 'Direkt',
            transit_days: Number(r.transit_days || 5),
            price: sellPrice,
            buy_price: buyPrice,
            net_profit: netProfit,
            ocean_freight: Math.round(sellPrice * 0.82),
            thc_cost: Math.round(sellPrice * 0.12),
            isps_cost: sellPrice - Math.round(sellPrice * 0.82) - Math.round(sellPrice * 0.12),
            free_time_days: 14,
            co2_emissions: '0.62 Ton CO2 (%18 Yeşil)',
            vessel_name: `${r.carrier} EXPRESS`,
            service_line: 'Direct Spot Line',
            pol_code: origin.substring(0, 3).toUpperCase() + ' PORT',
            pod_code: destination.substring(0, 3).toUpperCase() + ' PORT',
            is_recommended: true
          };
        });
      } else {
        // Birebir eşleşme yoksa Algoritmik Spot Piyasa Navlun Matrisi Üret (Global & Lokal Armatör Havuzu)
        // DÖVİZ KURU MANTIĞI: Tüm alış navlunları USD paritesi ($1.00 USD = 1.00 USD) üzerinden hesaplanır.
        const baseBuy = Math.floor(1450 + Math.random() * 650); // $1450 - $2100 USD
        const carriersList = [
          { carrier: 'MSC', type: 'Direkt', transit: 4, markup: 15, service: 'Dragon Express' },
          { carrier: 'MAERSK LINE', type: 'Direkt', transit: 3, markup: 18, service: 'AE15 Service' },
          { carrier: 'DFDS Seaways', type: 'Ro-Ro Direkt', transit: 3, markup: 14, service: 'Akdeniz Ro-Ro Ekspres' },
          { carrier: 'ARKAS Line', type: 'Bölgesel Direkt', transit: 4, markup: 12, service: 'Levant Express' },
          { carrier: 'TURKON Line', type: 'Ekspres Direkt', transit: 5, markup: 15, service: 'Amerikan Ekspres' },
          { carrier: 'CMA CGM', type: 'Aktarmalı', transit: 7, markup: 10, service: 'MEX Line' },
          { carrier: 'MEDKON Lines', type: 'Kabotaj / Feeder', transit: 2, markup: 16, service: 'Karadeniz Feeder' }
        ];

        autoQuotes = carriersList.map((item, idx) => {
          const buyPrice = baseBuy + (idx * 120);
          const netProfit = Math.round(buyPrice * (item.markup / 100));
          const sellPrice = buyPrice + netProfit;

          return {
            id: 'Q-SPOT-' + Math.floor(10000 + Math.random() * 90000),
            carrier: item.carrier,
            verified: true,
            reliability: 94 + (idx % 5),
            capacity: idx % 2 === 0 ? 'GUARANTEED' : 'AVAILABLE',
            type: item.type,
            transit_days: item.transit,
            price: sellPrice,
            buy_price: buyPrice,
            net_profit: netProfit,
            ocean_freight: Math.round(sellPrice * 0.82),
            thc_cost: Math.round(sellPrice * 0.12),
            isps_cost: sellPrice - Math.round(sellPrice * 0.82) - Math.round(sellPrice * 0.12),
            free_time_days: 14,
            co2_emissions: `${(0.45 + (idx * 0.05)).toFixed(2)} Ton CO2`,
            vessel_name: `${item.carrier} GLOBETROTTER`,
            service_line: item.service,
            pol_code: origin.substring(0, 3).toUpperCase() + ' PORT',
            pod_code: destination.substring(0, 3).toUpperCase() + ' PORT',
            is_recommended: idx === 0
          };
        });
      }

      const newReq = {
        id: 'REQ-' + Math.floor(1000 + Math.random() * 9000),
        user_id: user.id,
        created_at: new Date().toISOString(),
        origin,
        destination,
        cargo_type: payload.cargo_type || 'Konteyner',
        laycan_date: payload.laycan_date || new Date().toISOString().split('T')[0],
        amount: payload.amount || '1',
        quotes: autoQuotes
      };

      db.requests.unshift(newReq);
      writeDB(db);
      broadcastSSE(db);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(newReq));
    } catch(err) { res.writeHead(400); res.end(); }
    return;
  }

  // ADMIN ENDPOINTS (ADD QUOTE, CREATE TRACKING, UPDATE TRACKING)
  if (req.method === 'POST' && req.url === '/api/quote') {
    try {
      const user = getUserFromToken(req);
      if(!user || user.role !== 'admin') { res.writeHead(403); res.end('Forbidden'); return; }
      
      const payload = await parseBody(req);
      const db = readDB();
      const index = db.requests.findIndex(r => r.id === payload.req_id);
      if (index > -1) {
        const reqObj = db.requests[index];
        const sellPrice = Number(payload.price);
        const buyPrice = Number(payload.buy_price || Math.round(sellPrice * 0.85));
        const netProfit = sellPrice - buyPrice;

        const oceanFreight = Number(payload.ocean_freight || Math.round(sellPrice * 0.82));
        const thcCost = Number(payload.thc_cost || Math.round(sellPrice * 0.12));
        const ispsCost = sellPrice - oceanFreight - thcCost;

        const newQuote = {
          id: 'Q-' + Math.floor(Math.random() * 99999),
          carrier: payload.carrier || 'MSC',
          verified: true,
          reliability: Number(payload.reliability) || 98,
          capacity: 'AVAILABLE',
          type: payload.type || 'Direkt',
          transit_days: Number(payload.transit_days) || 5,
          price: sellPrice,
          buy_price: buyPrice,
          net_profit: netProfit,
          ocean_freight: oceanFreight,
          thc_cost: thcCost,
          isps_cost: ispsCost,
          free_time_days: Number(payload.free_time_days || 14),
          co2_emissions: payload.co2_emissions || '0.62 Ton CO2 (%18 Yeşil)',
          vessel_name: payload.vessel_name || ((payload.carrier || 'MSC') + ' EXPRESS'),
          service_line: payload.service_line || 'Dragon Express',
          pol_code: payload.pol_code || (reqObj.origin.substring(0, 3).toUpperCase() + ' PORT'),
          pod_code: payload.pod_code || (reqObj.destination.substring(0, 3).toUpperCase() + ' PORT'),
          is_recommended: payload.is_recommended || false
        };

        reqObj.quotes.unshift(newQuote);

        // OTOMATİK KONŞİMENTO (BL) TAKİP KARTI OLUŞTURUCU (Auto BL Generator)
        const blNumber = (payload.carrier ? payload.carrier.substring(0, 3).toUpperCase() : 'BL') + '-' + Math.floor(100000 + Math.random() * 900000);
        if (!db.trackings) db.trackings = [];
        
        const autoTracking = {
          tracking_no: blNumber,
          carrier: payload.carrier || 'MSC',
          vessel_name: (payload.carrier || 'MSC') + ' EXPRESS ' + Math.floor(100 + Math.random() * 900),
          current_speed: '18.5 Knots',
          temperature: 'N/A',
          current_stage: 'loading',
          events: [
            {
              date: new Date().toLocaleString(),
              location: reqObj.origin + ' Terminali',
              message: 'Teklif onaylandı. Otomatik Konşimento (BL) ve sevkiyat kaydı oluşturuldu.',
              stage: 'loading'
            }
          ]
        };
        db.trackings.unshift(autoTracking);

        writeDB(db);
        broadcastSSE(db);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch(err) { res.writeHead(400); res.end(); }
    return;
  }

  // ADMIN: CREATE TRACKING
  if (req.method === 'POST' && req.url === '/api/tracking') {
    try {
      const user = getUserFromToken(req);
      if(!user || user.role !== 'admin') { res.writeHead(403); res.end('Forbidden'); return; }

      const payload = await parseBody(req);
      const db = readDB();
      if(db.trackings.find(t => t.tracking_no === payload.tracking_no)) {
        res.writeHead(400); res.end(JSON.stringify({error: "Takip numarası zaten var"})); return;
      }

      const newTracking = {
        tracking_no: payload.tracking_no.toUpperCase(),
        carrier: payload.carrier || 'CMA CGM',
        vessel_name: payload.vessel_name || 'MSC GULSUN',
        current_speed: payload.current_speed || '0 Knots',
        temperature: payload.temperature || 'N/A',
        current_stage: payload.current_stage || 'loading',
        events: []
      };
      db.trackings.unshift(newTracking);
      writeDB(db);
      broadcastSSE(db);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(newTracking));
    } catch(err) { res.writeHead(400); res.end(); }
    return;
  }

  // ADMIN: UPDATE TRACKING & ADD EVENT
  if (req.method === 'PUT' && req.url === '/api/tracking/event') {
    try {
      const user = getUserFromToken(req);
      if(!user || user.role !== 'admin') { res.writeHead(403); res.end('Forbidden'); return; }

      const payload = await parseBody(req);
      const db = readDB();
      const index = db.trackings.findIndex(t => t.tracking_no === payload.tracking_no);
      if (index > -1) {
        if(payload.vessel_name) db.trackings[index].vessel_name = payload.vessel_name;
        if(payload.current_speed) db.trackings[index].current_speed = payload.current_speed;
        if(payload.temperature) db.trackings[index].temperature = payload.temperature;
        if(payload.current_stage) db.trackings[index].current_stage = payload.current_stage;
        
        if(payload.event_message) {
           db.trackings[index].events.unshift({
             date: new Date().toLocaleString(),
             location: payload.event_location || 'Belirtilmedi',
             message: payload.event_message,
             stage: payload.current_stage || db.trackings[index].current_stage
           });
        }
        writeDB(db);
        broadcastSSE(db);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch(err) { res.writeHead(400); res.end(); }
    return;
  }

  // HTML sunumu
  if (req.url === '/' || req.url.startsWith('/?')) {
    fs.readFile(HTML_FILE, (err, data) => {
      if (err) { res.writeHead(500); res.end('Error'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  res.writeHead(404); res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Portscanner Enterprise Server running at http://0.0.0.0:${PORT}`);
});
