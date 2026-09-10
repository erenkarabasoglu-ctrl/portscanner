const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');
const HTML_FILE = path.join(__dirname, 'index.html');

function initDB() {
  // SHA-256 hash of '123456'
  const defaultAdminHash = crypto.createHash('sha256').update('123456').digest('hex');

  if (!fs.existsSync(DB_FILE)) {
    const defaultData = {
      users: [
        { id: 'usr_admin', email: 'admin@portscanner.com', password: defaultAdminHash, name: 'Super Admin', role: 'admin' }
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
      if (!data.users) {
        data.users = [
          { id: 'usr_admin', email: 'admin@portscanner.com', password: defaultAdminHash, name: 'Super Admin', role: 'admin' }
        ];
      } else {
        // Eski 'hash_' prefix şifrelerini SHA-256'ya migrate et
        let migrated = false;
        data.users = data.users.map(u => {
          if (u.password && u.password.startsWith('hash_')) {
            const rawPass = u.password.replace('hash_', '');
            u.password = crypto.createHash('sha256').update(rawPass).digest('hex');
            migrated = true;
          }
          return u;
        });
        // Admin kullanıcısı yoksa ekle
        if (!data.users.find(u => u.id === 'usr_admin')) {
          data.users.unshift({ id: 'usr_admin', email: 'admin@portscanner.com', password: defaultAdminHash, name: 'Super Admin', role: 'admin' });
          migrated = true;
        }
        if (migrated) fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
      }
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
  // Hassas verileri temizle: kullanıcı şifreleri, operasyon marjı (buy_price, net_profit)
  const sanitizedRequests = (data.requests || []).map(r => ({
    ...r,
    quotes: (r.quotes || []).map(q => {
      const { buy_price, net_profit, ...safeQuote } = q;
      return safeQuote;
    })
  }));

  const safeData = {
    requests: sanitizedRequests,
    trackings: data.trackings,
    exchange_listings: data.exchange_listings,
    carrier_rates: data.carrier_rates
    // users alanı kasıtlı olarak dahil edilmiyor
  };

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
      const hashedInput = crypto.createHash('sha256').update(payload.password || '').digest('hex');
      const user = db.users.find(u => u.email === payload.email && u.password === hashedInput);
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
      const hashedPassword = crypto.createHash('sha256').update(payload.password || '').digest('hex');
      const newUser = {
        id: 'usr_' + Date.now(),
        email: payload.email,
        password: hashedPassword,
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

  // EXCHANGE MARKETPLACE ENDPOINTS (GET & POST LISTINGS)
  if (req.method === 'GET' && req.url === '/api/exchange') {
    const db = readDB();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(db.exchange_listings || []));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/exchange') {
    try {
      const user = getUserFromToken(req);
      if(!user) { res.writeHead(401); res.end('Unauthorized'); return; }

      const payload = await parseBody(req);
      const db = readDB();
      if (!db.exchange_listings) db.exchange_listings = [];

      const newListing = {
        id: `${payload.side === 'SELL' ? 'SPOT' : 'DEMAND'}-${Math.floor(1000 + Math.random() * 9000)}`,
        origin: payload.origin,
        destination: payload.destination,
        type: payload.type,
        carrier: payload.carrier,
        price: Number(payload.price),
        listPrice: Math.round(Number(payload.price) * 1.15),
        seller: user.name || 'Kurumsal Firmam A.Ş.',
        status: 'OPEN',
        etd: '22 Eylül 2026',
        cutoff: '19 Eylül 2026',
        freeTime: '14 Gün Kombine',
        guaranteed: true,
        side: payload.side || 'SELL',
        slotsAvailable: Number(payload.slotsAvailable || 5),
        createdAt: new Date().toISOString()
      };

      db.exchange_listings.unshift(newListing);
      writeDB(db);
      broadcastSSE(db);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(newListing));
    } catch(err) { res.writeHead(400); res.end(); }
    return;
  }

  // ENGINE 1: DOCUMENTS OCR PARSE & PERSISTENCE ENDPOINT
  if (req.method === 'POST' && req.url === '/api/documents/parse') {
    try {
      const user = getUserFromToken(req);
      if(!user) { res.writeHead(401); res.end('Unauthorized'); return; }

      const payload = await parseBody(req);
      const db = readDB();
      const reqIndex = db.requests.findIndex(r => r.id === payload.req_id);
      if (reqIndex > -1) {
        if (!db.requests[reqIndex].parsed_documents) db.requests[reqIndex].parsed_documents = [];
        db.requests[reqIndex].parsed_documents.unshift({
          ...payload.doc,
          parsedAt: new Date().toISOString()
        });
        writeDB(db);
        broadcastSSE(db);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
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
      const cargoType = payload.cargo_type || 'Konteyner';

      // 1. UN/LOCODE & LİMAN HARİTASI (UN/LOCODE Dictionary)
      const portDict = {
        'izmit': { code: 'TRIZM', country: 'Türkiye', region: 'Marmara' },
        'ambarli': { code: 'TRAMB', country: 'Türkiye', region: 'Marmara' },
        'kumport': { code: 'TRAMB', country: 'Türkiye', region: 'Marmara' },
        'marport': { code: 'TRAMB', country: 'Türkiye', region: 'Marmara' },
        'yilport': { code: 'TRYIL', country: 'Türkiye', region: 'Marmara' },
        'gemlik': { code: 'TRGEM', country: 'Türkiye', region: 'Marmara' },
        'pendik': { code: 'TRPEN', country: 'Türkiye', region: 'Marmara' },
        'mersin': { code: 'TRMER', country: 'Türkiye', region: 'Akdeniz' },
        'iskenderun': { code: 'TRISK', country: 'Türkiye', region: 'Akdeniz' },
        'aliaga': { code: 'TRALI', country: 'Türkiye', region: 'Ege' },
        'pire': { code: 'GRPIR', country: 'Yunanistan', region: 'Akdeniz' },
        'piraeus': { code: 'GRPIR', country: 'Yunanistan', region: 'Akdeniz' },
        'trieste': { code: 'ITTRS', country: 'İtalya', region: 'Adriyatik' },
        'setes': { code: 'FRSET', country: 'Fransa', region: 'Batı Akdeniz' },
        'sete': { code: 'FRSET', country: 'Fransa', region: 'Batı Akdeniz' },
        'rotterdam': { code: 'NLRTM', country: 'Hollanda', region: 'Kuzey Avrupa' },
        'antwerp': { code: 'BEANR', country: 'Belçika', region: 'Kuzey Avrupa' },
        'shanghai': { code: 'CNSHA', country: 'Çin', region: 'Uzak Doğu' },
        'ningbo': { code: 'CNNGB', country: 'Çin', region: 'Uzak Doğu' },
        'alexandria': { code: 'EGALY', country: 'Mısır', region: 'Kuzey Afrika' },
        'new york': { code: 'USNYC', country: 'ABD', region: 'Kuzey Amerika' }
      };

      const normOrigin = origin.toLowerCase().trim();
      const normDest = destination.toLowerCase().trim();

      const origInfo = portDict[normOrigin] || { code: normOrigin.substring(0, 5).toUpperCase(), country: 'Global Port', region: 'Genel' };
      const destInfo = portDict[normDest] || { code: normDest.substring(0, 5).toUpperCase(), country: 'Global Port', region: 'Genel' };

      // 2. Navlun Kütüphanesindeki Birebir Armatör Alış Fiyatlarını Taraması
      const matchedRates = (db.carrier_rates || []).filter(r => 
        r.origin.toLowerCase().trim() === normOrigin &&
        r.destination.toLowerCase().trim() === normDest
      );

      let autoQuotes = [];

      if (matchedRates.length > 0) {
        autoQuotes = matchedRates.map(r => {
          const buyPrice = Number(r.buy_price);
          const markup = Number(r.default_markup || 15);
          const netProfit = Math.round(buyPrice * (markup / 100));
          const sellPrice = buyPrice + netProfit;
          
          return {
            id: 'Q-VERIFIED-' + Math.floor(10000 + Math.random() * 90000),
            carrier: r.carrier,
            verified: true,
            reliability: 99,
            capacity: 'GUARANTEED',
            type: r.type || 'Direkt',
            transit_days: Number(r.transit_days || 4),
            price: sellPrice,
            buy_price: buyPrice,
            net_profit: netProfit,
            ocean_freight: Math.round(sellPrice * 0.82),
            thc_cost: Math.round(sellPrice * 0.12),
            isps_cost: sellPrice - Math.round(sellPrice * 0.82) - Math.round(sellPrice * 0.12),
            free_time_days: 14,
            cargo_specs: cargoType === 'Kuru Yük' ? 'Coaster / Bulk | FIOST Şartları ($/Ton)' : (cargoType === 'Ro-Ro' ? 'Sürücülü Dorse / Tır | Akdeniz Ro-Ro' : '40\' High Cube (HC) Standard Dry'),
            co2_emissions: '0.58 Ton CO2 (%20 Yeşil)',
            vessel_name: `${r.carrier} ENTERPRISE`,
            service_line: `${origInfo.code} - ${destInfo.code} Direct Line`,
            pol_code: `${origInfo.code} - ${origin.toUpperCase()}`,
            pod_code: `${destInfo.code} - ${destination.toUpperCase()}`,
            is_recommended: true
          };
        });
      } else {
        // 3. YÜK TİPİNE ÖZEL GERÇEK B2B AUTOMATION ENGINE (COASTER, RO-RO, KONTEYNER, LİKİT)
        if (cargoType === 'Kuru Yük' || cargoType.includes('Kuru')) {
          // KURU YÜK & COASTER (3,000 - 12,000 DWT Coaster & Bulk Gemileri)
          const coasterCarriers = [
            { carrier: 'KAPTAŞ MARITIME', coaster_type: '3,500 DWT Coaster', rate_per_ton: 38, transit: 4, fiost: 'FIOST (Free In/Out Stowed)', service: 'Black Sea / Med Coaster Service' },
            { carrier: 'ŞAHİN DENİZCİLİK', coaster_type: '5,000 DWT Bulk Carrier', rate_per_ton: 42, transit: 5, fiost: 'FIOST (Loading 1500t/pd)', service: 'Mediterranean Bulk Line' },
            { carrier: 'CENK GROUP', coaster_type: '7,500 DWT General Cargo', rate_per_ton: 36, transit: 4, fiost: 'FILO (Free In Liner Out)', service: 'Marmara-Levant Express' },
            { carrier: 'VALLETTA SHIPPING', coaster_type: '12,000 DWT Handysize', rate_per_ton: 31, transit: 6, fiost: 'FIOST (Customs Discharging Included)', service: 'Euro-Med Bulk Service' }
          ];

          const cargoTonnage = Number(payload.amount) || 1500; // Varsayılan 1500 Ton dökme yük
          const draftLimit = Number(payload.draft_limit) || 0; // Metre su çekimi sınırı
          const stowageFactor = Number(payload.stowage_factor) || 0; // M3/Ton
          const fiostTerms = payload.fiost_terms || 'FIOST'; // FIOST, FILO, Gross Terms

          autoQuotes = coasterCarriers.map((item, idx) => {
            let ratePerTon = item.rate_per_ton;
            // Stowage factor adjustment if cargo is bulky (> 1.4 m3/t)
            if (stowageFactor > 1.4) {
              ratePerTon += Math.round((stowageFactor - 1.4) * 8);
            }
            // FIOST term adjustment
            if (fiostTerms === 'FILO') ratePerTon += 4;
            if (fiostTerms === 'Gross Terms') ratePerTon += 9;

            const oceanFreightTotal = cargoTonnage * ratePerTon;
            const portDues = Math.round(oceanFreightTotal * 0.08); // Liman harçları
            const profit = Math.round(oceanFreightTotal * 0.12);
            const totalSell = oceanFreightTotal + portDues + profit;

            // Draft restriction warning check
            const vesselDraftReq = 5.5 + (idx * 0.8);
            const draftWarning = (draftLimit > 0 && draftLimit < vesselDraftReq) ? ` ⚠ Draft Uyarısı: Liman Max ${draftLimit}m (Gemi ${vesselDraftReq.toFixed(1)}m)` : '';

            return {
              id: 'Q-BULK-' + Math.floor(10000 + Math.random() * 90000),
              carrier: item.carrier,
              verified: true,
              reliability: 95 + (idx % 4),
              capacity: (draftLimit > 0 && draftLimit < vesselDraftReq) ? 'RESTRICTED' : 'GUARANTEED',
              type: 'Coaster / Dökme Kargo',
              transit_days: item.transit,
              price: totalSell,
              unit_price_per_ton: ratePerTon,
              tonnage_amount: cargoTonnage,
              buy_price: oceanFreightTotal,
              net_profit: profit,
              ocean_freight: oceanFreightTotal,
              thc_cost: portDues,
              isps_cost: Math.round(portDues * 0.15),
              free_time_days: 5, // Dökme yükte 5 gün starya süresi
              cargo_specs: `${item.coaster_type} | ${fiostTerms} Şartları | $${ratePerTon}/Ton${draftWarning}`,
              co2_emissions: `${(0.32 + (idx * 0.04)).toFixed(2)} Ton CO2`,
              vessel_name: `${item.carrier} M/V EXPRESS`,
              service_line: item.service,
              pol_code: `${origInfo.code} - ${origin.toUpperCase()}`,
              pod_code: `${destInfo.code} - ${destination.toUpperCase()}`,
              is_recommended: idx === 0 && (!draftLimit || draftLimit >= vesselDraftReq)
            };
          });

        } else if (cargoType === 'Ro-Ro' || cargoType.includes('Ro')) {
          // RO-RO & TEKERLEKLİ ARAÇ / TIR / DORSE (DFDS, U.N. RO-RO, GRIMALDI)
          const roroCarriers = [
            { carrier: 'DFDS SEAWAYS', roro_type: 'Sürücülü Tır / Dorse (16.5m)', base: 1650, transit: 3, service: 'Pendik - Trieste Ekspres Ro-Ro' },
            { carrier: 'GRIMALDI LINES', roro_type: 'Sürücüsüz Dorse / Yük', base: 1480, transit: 4, service: 'Akdeniz Ro-Ro & Car Carrier' },
            { carrier: 'U.N. RO-RO (DFDS)', roro_type: 'Proje & Ağır Vasita Ro-Ro', base: 1820, transit: 3, service: 'Yalova - Sete Direct Line' }
          ];

          autoQuotes = roroCarriers.map((item, idx) => {
            const buyPrice = item.base;
            const bafSurcharge = 120; // Fuel Surcharge
            const driverCabinCost = 150;
            const profit = Math.round(buyPrice * 0.15);
            const totalSell = buyPrice + bafSurcharge + driverCabinCost + profit;

            return {
              id: 'Q-RORO-' + Math.floor(10000 + Math.random() * 90000),
              carrier: item.carrier,
              verified: true,
              reliability: 98,
              capacity: 'GUARANTEED',
              type: 'Ro-Ro Direkt Sefer',
              transit_days: item.transit,
              price: totalSell,
              buy_price: buyPrice,
              net_profit: profit,
              ocean_freight: buyPrice,
              thc_cost: bafSurcharge,
              isps_cost: driverCabinCost,
              free_time_days: 7,
              cargo_specs: `${item.roro_type} | Şoför Kabin & BAF Dahil`,
              co2_emissions: '0.41 Ton CO2 (%22 Yeşil)',
              vessel_name: `${item.carrier} SEAWAYS`,
              service_line: item.service,
              pol_code: `${origInfo.code} - ${origin.toUpperCase()}`,
              pod_code: `${destInfo.code} - ${destination.toUpperCase()}`,
              is_recommended: idx === 0
            };
          });

        } else if (cargoType.includes('Likit') || cargoType.includes('Liquid')) {
          // LİKİT & KİMYASAL TANKER (IMO Hazmat / Liquid Bulk)
          const liquidCarriers = [
            { carrier: 'STOLT-NIELSEN', tanker_type: 'Paslanmaz Çelik IMO Tanker', rate_per_ton: 55, transit: 5, service: 'Global Chemical Logistics' },
            { carrier: 'ODFJELL TANKERS', tanker_type: 'Bölmeli Kimyasal Tanker', rate_per_ton: 52, transit: 6, service: 'Euro-Med Liquid Line' }
          ];

          const liquidTonnage = Number(payload.amount) || 1000;
          const imoClass = payload.imo_class || 'Genel Likit'; // IMO Class 1-9
          const imoMultiplier = (imoClass && imoClass.includes('Class 3')) ? 1.25 : ((imoClass && imoClass.includes('Class 6')) ? 1.35 : 1.10);

          autoQuotes = liquidCarriers.map((item, idx) => {
            const oceanTotal = Math.round(liquidTonnage * item.rate_per_ton * imoMultiplier);
            const tankCleaningCost = 1500; // Tank yıkama / Gazdan arındırma
            const profit = Math.round(oceanTotal * 0.14);
            const totalSell = oceanTotal + tankCleaningCost + profit;

            return {
              id: 'Q-TANK-' + Math.floor(10000 + Math.random() * 90000),
              carrier: item.carrier,
              verified: true,
              reliability: 97,
              capacity: 'GUARANTEED',
              type: 'Likit & Kimyasal Tanker',
              transit_days: item.transit,
              price: totalSell,
              unit_price_per_ton: (item.rate_per_ton * imoMultiplier).toFixed(1),
              tonnage_amount: liquidTonnage,
              buy_price: oceanTotal,
              net_profit: profit,
              ocean_freight: oceanTotal,
              thc_cost: tankCleaningCost,
              isps_cost: 350,
              free_time_days: 3,
              cargo_specs: `${item.tanker_type} | Tank Yıkama Dahil | ${imoClass}`,
              co2_emissions: '0.48 Ton CO2',
              vessel_name: `${item.carrier} DESTINY`,
              service_line: item.service,
              pol_code: `${origInfo.code} - ${origin.toUpperCase()}`,
              pod_code: `${destInfo.code} - ${destination.toUpperCase()}`,
              is_recommended: idx === 0
            };
          });

        } else {
          // KONTEYNER (FCL / LCL - 20'DV / 40'HC)
          const containerCarriers = [
            { carrier: 'MSC', type: 'Direkt', transit: 3, markup: 15, service: 'Dragon Express Line' },
            { carrier: 'MAERSK LINE', type: 'Direkt', transit: 3, markup: 16, service: 'AE15 Asia-Euro Express' },
            { carrier: 'ARKAS LINE', type: 'Bölgesel Direkt', transit: 4, markup: 14, service: 'Levant Feeder Express' },
            { carrier: 'TURKON LINE', type: 'Ekspres Direkt', transit: 5, markup: 15, service: 'USA Direct Express' },
            { carrier: 'CMA CGM', type: 'Aktarmalı', transit: 7, markup: 11, service: 'MEX Line' },
            { carrier: 'MEDKON LINES', type: 'Kabotaj / Feeder', transit: 2, markup: 16, service: 'Karadeniz & Ege Feeder' }
          ];

          const baseBuy = Math.floor(1550 + Math.random() * 450); // $1550 - $2000 USD
          autoQuotes = containerCarriers.map((item, idx) => {
            const buyPrice = baseBuy + (idx * 110);
            const netProfit = Math.round(buyPrice * (item.markup / 100));
            const sellPrice = buyPrice + netProfit;

            return {
              id: 'Q-FCL-' + Math.floor(10000 + Math.random() * 90000),
              carrier: item.carrier,
              verified: true,
              reliability: 96 + (idx % 4),
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
              cargo_specs: '40\' High Cube (HC) Standard Dry Container',
              co2_emissions: `${(0.48 + (idx * 0.04)).toFixed(2)} Ton CO2 (%18 Yeşil)`,
              vessel_name: `${item.carrier} GLOBETROTTER`,
              service_line: item.service,
              pol_code: `${origInfo.code} - ${origin.toUpperCase()}`,
              pod_code: `${destInfo.code} - ${destination.toUpperCase()}`,
              is_recommended: idx === 0
            };
          });
        }
      }

      const newReq = {
        id: 'REQ-' + Math.floor(1000 + Math.random() * 9000),
        user_id: user.id,
        created_at: new Date().toISOString(),
        origin,
        destination,
        cargo_type: cargoType,
        laycan_date: payload.laycan_date || new Date().toISOString().split('T')[0],
        amount: payload.amount || '1',
        po_number: payload.po_number || ('PO-2026-' + Math.floor(1000 + Math.random() * 9000)),
        supplier_name: payload.supplier_name || 'Global B2B Supplier Inc.',
        sku_list: payload.sku_list || [
          { sku: 'SKU-TEX-991', name: 'Tekstil & Kumaş Ruloları', qty: '500 Palet', value: '$45,000' }
        ],
        internal_notes: [
          { date: new Date().toLocaleDateString('tr-TR'), author: user.name || 'Satın Alma Sorumlusu', text: 'Sipariş oluşturuldu. Tedarikçi yükleme onayını bekliyor.' }
        ],
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

  // UPDATE REQUEST PO & NOTES (B2B PO Hub Endpoint)
  if (req.method === 'PUT' && req.url === '/api/requests/notes') {
    try {
      const user = getUserFromToken(req);
      if(!user) { res.writeHead(401); res.end(); return; }

      const payload = await parseBody(req);
      const db = readDB();
      const index = db.requests.findIndex(r => r.id === payload.req_id);
      if (index > -1) {
        if (!db.requests[index].internal_notes) db.requests[index].internal_notes = [];
        db.requests[index].internal_notes.unshift({
          date: new Date().toLocaleDateString('tr-TR') + ' ' + new Date().toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'}),
          author: user.name || 'Ekip Üyesi',
          text: payload.text
        });
        if (payload.po_number) db.requests[index].po_number = payload.po_number;
        writeDB(db);
        broadcastSSE(db);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(db.requests[index]));
        return;
      }
      res.writeHead(404); res.end();
    } catch(err) { res.writeHead(400); res.end(); }
    return;
  }

  // REZERVASYON ONAYLAMA ENDPOINT'İ (Müşteri → Operasyon Masası)
  if (req.method === 'POST' && reqUrl === '/api/requests/confirm') {
    try {
      const user = getUserFromToken(req);
      if (!user) { res.writeHead(401); res.end('Unauthorized'); return; }

      const payload = await parseBody(req);
      const db = readDB();
      const index = db.requests.findIndex(r => r.id === payload.req_id && (user.role === 'admin' || r.user_id === user.id));
      if (index === -1) { res.writeHead(404); res.end(JSON.stringify({ error: 'Talep bulunamadı' })); return; }

      db.requests[index].status = 'confirmed';
      db.requests[index].confirmed_quote_id = payload.confirmed_quote_id || null;
      db.requests[index].confirmed_total = payload.grand_total || null;
      db.requests[index].confirmed_extras = payload.extras || [];
      db.requests[index].confirmed_at = new Date().toISOString();
      db.requests[index].internal_notes = db.requests[index].internal_notes || [];
      db.requests[index].internal_notes.unshift({
        date: new Date().toLocaleDateString('tr-TR') + ' ' + new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        author: user.name || 'Müşteri',
        text: `Rezervasyon onaylandı. Toplam tutar: $${(payload.grand_total || 0).toLocaleString('en-US')}. Operasyon onayı bekleniyor.`
      });

      writeDB(db);
      broadcastSSE(db);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, request: db.requests[index] }));
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

  // HTML sunumu (Tüm web sayfaları için)
  if (!reqUrl.startsWith('/api')) {
    fs.readFile(HTML_FILE, (err, data) => {
      if (err) { res.writeHead(500); res.end('Error loading index.html'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint bulunamadı (404)' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Portscanner Enterprise Server running at http://0.0.0.0:${PORT}`);
});
