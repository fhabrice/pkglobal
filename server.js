const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const { db, initializeDatabase } = require('./database');

// Ensure directories exist
const uploadDir = path.join(__dirname, 'uploads');
const backupDir = path.join(__dirname, 'backups');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

// Initialize DB schema & seed data
initializeDatabase();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'pk_global_partners_secret_key_2026';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(__dirname)); // Serves root html (index.html, about.html, filiales.html, etc.)
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.use('/uploads', express.static(uploadDir));

// Multer storage for documents & uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueSuffix + '-' + safeName);
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB max
});

// Helper: Email logger & notification
function logEmailAndNotify({ recipient, subject, body, notifType, notifTitle, notifMessage, targetRole }) {
  try {
    db.prepare(`
      INSERT INTO email_logs (recipient, subject, body, status, sent_at)
      VALUES (?, ?, ?, 'sent', CURRENT_TIMESTAMP)
    `).run(recipient, subject, body);

    if (notifType && notifTitle) {
      db.prepare(`
        INSERT INTO notifications (type, title, message, target_role, read, created_at)
        VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
      `).run(notifType, notifTitle, notifMessage || subject, targetRole || 'admin');
    }
  } catch (err) {
    console.error('Error logging email/notification:', err);
  }
}

// Helper: Audit logger
function logAudit(userId, action, details, req) {
  try {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1') : 'system';
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, details, ip, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(userId || null, action, details, ip);
  } catch (err) {
    console.error('Error logging audit:', err);
  }
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Accès non autorisé : Token manquant' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Session expirée ou token invalide' });
    }

    const user = db.prepare('SELECT id, name, email, role, filiale_id, active FROM users WHERE id = ?').get(decoded.id);
    if (!user || !user.active) {
      return res.status(403).json({ error: 'Compte utilisateur inactif ou introuvable' });
    }

    // Attach filiale name if user is filiale_manager
    if (user.filiale_id) {
      const filiale = db.prepare('SELECT name, code FROM filiales WHERE id = ?').get(user.filiale_id);
      user.filiale_name = filiale ? filiale.name : null;
      user.filiale_code = filiale ? filiale.code : null;
    }

    req.user = user;
    next();
  });
}

// Role Authorization Middleware
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Accès refusé : Ce module nécessite l'un des rôles suivants : ${allowedRoles.join(', ')}`
      });
    }
    next();
  };
}

// -------------------------------------------------------------
// PUBLIC VISITOR TRACKING & CONTACT/CANDIDATURE/INVESTOR FORMS
// -------------------------------------------------------------

// Track Page View
app.post('/api/track-visit', (req, res) => {
  try {
    const { page, referrer } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const ua = req.headers['user-agent'] || 'unknown';
    
    // Hash IP for privacy
    const ipHash = Buffer.from(ip).toString('base64').substring(0, 12);

    db.prepare(`
      INSERT INTO visitor_stats (page, ip_hash, user_agent, referrer, visited_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(page || 'accueil', ipHash, ua.substring(0, 200), referrer || 'direct');

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public: Contact Form submission (Inquiry)
app.post('/api/inquiries', (req, res) => {
  try {
    const { nom, name, email, telephone, phone, organisation, organization, service, service_requested, objet, subject, message } = req.body;
    
    const clientName = (name || nom || '').trim();
    const clientEmail = (email || '').trim();
    const clientPhone = (phone || telephone || '').trim();
    const clientOrg = (organization || organisation || '').trim();
    const clientService = (service_requested || service || 'Général / Information').trim();
    const clientSubject = (subject || objet || 'Demande de contact').trim();
    const clientMessage = (message || '').trim();

    if (!clientName || !clientEmail || !clientMessage) {
      return res.status(400).json({ error: 'Le nom, l\'adresse email et le message sont obligatoires.' });
    }

    const refNumber = `DEM-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;

    const result = db.prepare(`
      INSERT INTO inquiries (
        reference, name, email, phone, organization,
        service_requested, subject, message, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'nouveau', CURRENT_TIMESTAMP)
    `).run(
      refNumber, clientName, clientEmail, clientPhone, clientOrg,
      clientService, clientSubject, clientMessage
    );

    // Notify administrators and send auto-acknowledgment
    logEmailAndNotify({
      recipient: clientEmail,
      subject: `Accusé de réception - PK Global Partners [Réf: ${refNumber}]`,
      body: `Bonjour ${clientName},\n\nNous avons bien reçu votre demande concernant "${clientSubject}" (Pôle : ${clientService}).\nNotre équipe commerciale ou le responsable de service concerné vous apportera une réponse sous 24 à 48 heures.\n\nCordialement,\nL'équipe PK GLOBAL PARTNERS\nKinshasa & Goma, RDC`,
      notifType: 'inquiry',
      notifTitle: `Nouvelle demande commerciale (${refNumber})`,
      notifMessage: `${clientName} (${clientOrg || 'Particulier'}) : "${clientSubject}"`
    });

    res.status(201).json({
      success: true,
      message: 'Votre message a été transmis avec succès. Notre équipe vous recontactera sous peu.',
      reference: refNumber,
      id: result.lastInsertRowid
    });
  } catch (err) {
    console.error('Error submitting inquiry:', err);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement de votre message.' });
  }
});

// Public: Investor Registration / Expression of Interest
app.post('/api/investors/interest', (req, res) => {
  try {
    const { name, organization, email, phone, country, investor_type, ticket_min, ticket_max, sectors_of_interest, project_interest, message } = req.body;

    if (!name || !email || !organization) {
      return res.status(400).json({ error: 'Le nom, l\'organisation et l\'email sont requis.' });
    }

    // Check if investor already exists
    let existing = db.prepare('SELECT id FROM investors WHERE email = ?').get(email);
    let investorId;

    if (existing) {
      investorId = existing.id;
      db.prepare(`
        UPDATE investors SET
          name = COALESCE(?, name),
          organization = COALESCE(?, organization),
          phone = COALESCE(?, phone),
          country = COALESCE(?, country),
          investor_type = COALESCE(?, investor_type),
          sectors_of_interest = COALESCE(?, sectors_of_interest)
        WHERE id = ?
      `).run(name, organization, phone, country || 'RDC', investor_type || 'Fonds d\'investissement', sectors_of_interest || 'Général', investorId);
    } else {
      const result = db.prepare(`
        INSERT INTO investors (
          name, organization, email, phone, country,
          investor_type, ticket_min, ticket_max, sectors_of_interest, status, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente', ?, CURRENT_TIMESTAMP)
      `).run(
        name, organization, email, phone || '', country || 'RDC',
        investor_type || 'Fonds d\'investissement',
        parseFloat(ticket_min) || 50000,
        parseFloat(ticket_max) || 500000,
        sectors_of_interest || 'Agroalimentaire, Distribution',
        message || 'Inscription via le site web'
      );
      investorId = result.lastInsertRowid;
    }

    // Record interest if project indicated
    if (project_interest) {
      db.prepare(`
        INSERT INTO investor_interests (investor_id, project_title, amount_intended, stage, notes, created_at)
        VALUES (?, ?, ?, 'Premier contact', ?, CURRENT_TIMESTAMP)
      `).run(investorId, project_interest, parseFloat(ticket_min) || 50000, message || 'Intérêt exprimé via le site');
    }

    logEmailAndNotify({
      recipient: email,
      subject: 'Bienvenue au réseau Investisseurs PK GLOBAL PARTNERS',
      body: `Cher(e) ${name},\n\nNous vous remercions de votre intérêt pour les opportunités d'investissement de PK GLOBAL PARTNERS en République Démocratique du Congo.\nUn membre de notre Direction des Investissements prendra contact avec vous pour vous présenter nos projets en cours de financement et notre pipeline d'accélération.\n\nCordialement,\nRelations Investisseurs - PK GLOBAL PARTNERS`,
      notifType: 'investor',
      notifTitle: 'Nouvel investisseur enregistré',
      notifMessage: `${name} (${organization}) a rejoint le réseau investisseurs.`
    });

    res.status(201).json({
      success: true,
      message: 'Votre profil investisseur a été enregistré avec succès. Notre équipe relations investisseurs vous contactera sous peu.'
    });
  } catch (err) {
    console.error('Error registering investor:', err);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement de votre profil investisseur.' });
  }
});

// Public: Submit Candidature / Project
app.post('/api/candidatures', upload.single('document'), (req, res) => {
  try {
    const {
      call_id, candidate_name, candidate_email, candidate_phone,
      project_title, sector, location, funding_requested, currency,
      summary, details
    } = req.body;

    if (!candidate_name || !candidate_email || !project_title || !summary) {
      return res.status(400).json({ error: 'Veuillez renseigner les champs obligatoires (nom, email, titre du projet, résumé).' });
    }

    let docUrl = null;
    let docName = null;
    if (req.file) {
      docUrl = `/uploads/${req.file.filename}`;
      docName = req.file.originalname;
    }

    const result = db.prepare(`
      INSERT INTO candidatures (
        call_id, candidate_name, candidate_email, candidate_phone,
        project_title, sector, location, funding_requested, currency,
        summary, details, document_name, document_url, status,
        submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recu', CURRENT_TIMESTAMP)
    `).run(
      call_id ? parseInt(call_id) : null,
      candidate_name,
      candidate_email,
      candidate_phone || '',
      project_title,
      sector || 'Agroalimentaire',
      location || 'RDC',
      parseFloat(funding_requested) || 0,
      currency || 'USD',
      summary,
      details || '',
      docName,
      docUrl
    );

    const candId = result.lastInsertRowid;

    logEmailAndNotify({
      recipient: candidate_email,
      subject: 'Confirmation de dépôt de candidature - PK GLOBAL PARTNERS',
      body: `Bonjour ${candidate_name},\n\nNous accusons réception de votre dossier de candidature pour le projet "${project_title}".\nVotre dossier a été enregistré sous la référence #CAND-${candId} et est en cours d'attribution à notre comité d'évaluation.\n\nVous serez informé des étapes suivantes de l'appel à projets par email.\n\nCordialement,\nLe Comité de Sélection - PK GLOBAL PARTNERS`,
      notifType: 'candidature',
      notifTitle: 'Nouvelle candidature reçue',
      notifMessage: `${candidate_name} : "${project_title}" (${sector || 'Projet'})`
    });

    res.status(201).json({
      success: true,
      message: 'Votre candidature a été soumise avec succès ! Un email de confirmation vous a été envoyé.',
      id: candId
    });
  } catch (err) {
    console.error('Error submitting candidature:', err);
    res.status(500).json({ error: 'Erreur lors de la soumission de la candidature.' });
  }
});

// -------------------------------------------------------------
// AUTHENTICATION ROUTES
// -------------------------------------------------------------

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'Ce compte utilisateur a été désactivé' });
    }

    const match = bcrypt.compareSync(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // Update last login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    // Get filiale info if any
    let filialeInfo = null;
    if (user.filiale_id) {
      filialeInfo = db.prepare('SELECT id, code, name FROM filiales WHERE id = ?').get(user.filiale_id);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, filiale_id: user.filiale_id },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    logAudit(user.id, 'LOGIN', `Connexion réussie (${user.role})`, req);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        filiale_id: user.filiale_id,
        filiale_name: filialeInfo ? filialeInfo.name : null,
        filiale_code: filialeInfo ? filialeInfo.code : null
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur interne lors de la connexion' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/change-password', authenticateToken, (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit comporter au moins 6 caractères.' });
    }

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(old_password, user.password_hash)) {
      return res.status(400).json({ error: 'L\'ancien mot de passe est incorrect.' });
    }

    const newHash = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

    logAudit(req.user.id, 'PASSWORD_CHANGE', 'Changement de mot de passe réussi', req);
    res.json({ success: true, message: 'Mot de passe mis à jour avec succès.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// DASHBOARD STATS & RECENT ACTIVITY
// -------------------------------------------------------------

app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
  try {
    const isFilialeManager = req.user.role === 'filiale_manager';
    const filialeId = req.user.filiale_id;

    let stats = {};

    if (isFilialeManager && filialeId) {
      const filiale = db.prepare('SELECT * FROM filiales WHERE id = ?').get(filialeId);
      const productCount = db.prepare('SELECT COUNT(*) as count FROM filiale_products WHERE filiale_id = ?').get(filialeId).count;
      const projectCount = db.prepare('SELECT COUNT(*) as count FROM filiale_projects WHERE filiale_id = ?').get(filialeId).count;
      
      // Filiale specific inquiries (matched by filiale code or name in message/service)
      const keyword = filiale.code;
      const filialeInquiries = db.prepare(`
        SELECT COUNT(*) as count FROM inquiries
        WHERE LOWER(service_requested) LIKE ? OR LOWER(subject) LIKE ? OR LOWER(message) LIKE ?
      `).get(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`).count;

      const products = db.prepare('SELECT * FROM filiale_products WHERE filiale_id = ? ORDER BY id DESC').all(filialeId);
      const projects = db.prepare('SELECT * FROM filiale_projects WHERE filiale_id = ? ORDER BY id DESC').all(filialeId);

      stats = {
        role: 'filiale_manager',
        filiale: filiale,
        product_count: productCount,
        project_count: projectCount,
        inquiries_count: filialeInquiries,
        products,
        projects
      };
    } else {
      // Global stats for superadmin and admin
      const totalVisitors = db.prepare('SELECT COUNT(*) as count FROM visitor_stats').get().count;
      const todayVisitors = db.prepare("SELECT COUNT(*) as count FROM visitor_stats WHERE date(visited_at) = date('now')").get().count;
      
      const candidaturesTotal = db.prepare('SELECT COUNT(*) as count FROM candidatures').get().count;
      const candidaturesEvaluating = db.prepare("SELECT COUNT(*) as count FROM candidatures WHERE status = 'en_evaluation'").get().count;
      const candidaturesApproved = db.prepare("SELECT COUNT(*) as count FROM candidatures WHERE status = 'retenu'").get().count;
      const candidaturesReceived = db.prepare("SELECT COUNT(*) as count FROM candidatures WHERE status = 'recu'").get().count;
      
      const investorsTotal = db.prepare('SELECT COUNT(*) as count FROM investors').get().count;
      const investorsActive = db.prepare("SELECT COUNT(*) as count FROM investors WHERE status = 'valide'").get().count;
      const investorsPending = db.prepare("SELECT COUNT(*) as count FROM investors WHERE status = 'en_attente'").get().count;

      const inquiriesTotal = db.prepare('SELECT COUNT(*) as count FROM inquiries').get().count;
      const inquiriesNew = db.prepare("SELECT COUNT(*) as count FROM inquiries WHERE status = 'nouveau'").get().count;
      const inquiriesInProgress = db.prepare("SELECT COUNT(*) as count FROM inquiries WHERE status = 'en_cours'").get().count;

      const filialesTotal = db.prepare('SELECT COUNT(*) as count FROM filiales').get().count;

      // Recent 30 days traffic
      const traffic30d = db.prepare(`
        SELECT date(visited_at) as visit_date, COUNT(*) as count
        FROM visitor_stats
        WHERE visited_at >= datetime('now', '-30 days')
        GROUP BY date(visited_at)
        ORDER BY visit_date ASC
      `).all();

      // Candidatures by status
      const candByStatus = db.prepare(`
        SELECT status, COUNT(*) as count FROM candidatures GROUP BY status
      `).all();

      // Investors by type
      const investorsByType = db.prepare(`
        SELECT investor_type, COUNT(*) as count FROM investors GROUP BY investor_type
      `).all();

      // Recent notifications / activity feed
      const notifications = db.prepare(`
        SELECT * FROM notifications ORDER BY id DESC LIMIT 10
      `).all();

      const recentInquiries = db.prepare(`
        SELECT id, reference, name, organization, service_requested, status, created_at
        FROM inquiries ORDER BY id DESC LIMIT 5
      `).all();

      const recentCandidatures = db.prepare(`
        SELECT id, candidate_name, project_title, sector, funding_requested, status, submitted_at
        FROM candidatures ORDER BY id DESC LIMIT 5
      `).all();

      stats = {
        role: req.user.role,
        visitor_count: totalVisitors,
        visitor_today: todayVisitors,
        candidatures_total: candidaturesTotal,
        candidatures_evaluating: candidaturesEvaluating,
        candidatures_approved: candidaturesApproved,
        candidatures_received: candidaturesReceived,
        investors_total: investorsTotal,
        investors_active: investorsActive,
        investors_pending: investorsPending,
        inquiries_total: inquiriesTotal,
        inquiries_new: inquiriesNew,
        inquiries_in_progress: inquiriesInProgress,
        filiales_total: filialesTotal,
        chart_traffic: traffic30d,
        chart_candidatures: candByStatus,
        chart_investors: investorsByType,
        notifications,
        recent_inquiries: recentInquiries,
        recent_candidatures: recentCandidatures
      };
    }

    res.json(stats);
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// SITE CONTENT MANAGEMENT (CMS)
// -------------------------------------------------------------

app.get('/api/content', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value, updated_at FROM site_content').all();
    const content = {};
    rows.forEach(r => {
      try {
        content[r.key] = JSON.parse(r.value);
      } catch {
        content[r.key] = r.value;
      }
    });
    res.json(content);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/content/:key', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { key } = req.params;
    const value = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;

    db.prepare(`
      INSERT INTO site_content (key, value, updated_at, updated_by)
      VALUES (?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = excluded.updated_by
    `).run(key, value, req.user.id);

    logAudit(req.user.id, 'UPDATE_CONTENT', `Mise à jour du contenu: ${key}`, req);
    res.json({ success: true, message: `Contenu "${key}" mis à jour avec succès.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Services / Pôles
app.get('/api/services', (req, res) => {
  try {
    const services = db.prepare('SELECT * FROM services_poles ORDER BY display_order ASC, id ASC').all();
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/services', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { title, category, description, icon, display_order } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: 'Titre et description requis' });
    }
    const result = db.prepare(`
      INSERT INTO services_poles (title, category, description, icon, active, display_order)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(title, category || 'Pôle Général', description, icon || 'fa-briefcase', parseInt(display_order) || 0);

    logAudit(req.user.id, 'CREATE_SERVICE', `Création du pôle : ${title}`, req);
    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/services/:id', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { id } = req.params;
    const { title, category, description, icon, active, display_order } = req.body;

    db.prepare(`
      UPDATE services_poles SET
        title = COALESCE(?, title),
        category = COALESCE(?, category),
        description = COALESCE(?, description),
        icon = COALESCE(?, icon),
        active = COALESCE(?, active),
        display_order = COALESCE(?, display_order)
      WHERE id = ?
    `).run(title, category, description, icon, active !== undefined ? (active ? 1 : 0) : null, display_order, id);

    logAudit(req.user.id, 'UPDATE_SERVICE', `Modification du pôle #${id}`, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/services/:id', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM services_poles WHERE id = ?').run(req.params.id);
    logAudit(req.user.id, 'DELETE_SERVICE', `Suppression du pôle #${req.params.id}`, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// News & Articles
app.get('/api/news', (req, res) => {
  try {
    const { status, category } = req.query;
    let query = 'SELECT n.*, u.name as author_name FROM news n LEFT JOIN users u ON n.author_id = u.id WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND n.status = ?';
      params.push(status);
    }
    if (category) {
      query += ' AND n.category = ?';
      params.push(category);
    }
    query += ' ORDER BY n.published_at DESC';

    const news = db.prepare(query).all(...params);
    res.json(news);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/news', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { title, category, summary, content, image_url, status } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Titre et contenu requis' });
    }
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const result = db.prepare(`
      INSERT INTO news (title, slug, category, summary, content, image_url, status, published_at, author_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `).run(title, slug, category || 'Actualité', summary || '', content, image_url || '', status || 'published', req.user.id);

    logAudit(req.user.id, 'CREATE_NEWS', `Publication article : ${title}`, req);
    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/news/:id', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { id } = req.params;
    const { title, category, summary, content, image_url, status } = req.body;

    db.prepare(`
      UPDATE news SET
        title = COALESCE(?, title),
        category = COALESCE(?, category),
        summary = COALESCE(?, summary),
        content = COALESCE(?, content),
        image_url = COALESCE(?, image_url),
        status = COALESCE(?, status)
      WHERE id = ?
    `).run(title, category, summary, content, image_url, status, id);

    logAudit(req.user.id, 'UPDATE_NEWS', `Modification actualité #${id}`, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/news/:id', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
    logAudit(req.user.id, 'DELETE_NEWS', `Suppression actualité #${req.params.id}`, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// CALL FOR PROJECTS & CANDIDATURES
// -------------------------------------------------------------

// Calls for Projects
app.get('/api/calls', (req, res) => {
  try {
    const calls = db.prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM candidatures WHERE call_id = c.id) as candidatures_count
      FROM call_for_projects c
      ORDER BY c.deadline DESC
    `).all();
    res.json(calls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/calls', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { title, description, target_sector, budget_indicatif, eligibility, deadline, status } = req.body;
    if (!title || !deadline) {
      return res.status(400).json({ error: 'Titre et date limite requis' });
    }
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const result = db.prepare(`
      INSERT INTO call_for_projects (title, slug, description, target_sector, budget_indicatif, eligibility, deadline, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, slug, description || '', target_sector || 'Tous secteurs', budget_indicatif || '', eligibility || '', deadline, status || 'open');

    logAudit(req.user.id, 'CREATE_CALL', `Création appel à projets : ${title}`, req);
    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/calls/:id', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, target_sector, budget_indicatif, eligibility, deadline, status } = req.body;

    db.prepare(`
      UPDATE call_for_projects SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        target_sector = COALESCE(?, target_sector),
        budget_indicatif = COALESCE(?, budget_indicatif),
        eligibility = COALESCE(?, eligibility),
        deadline = COALESCE(?, deadline),
        status = COALESCE(?, status)
      WHERE id = ?
    `).run(title, description, target_sector, budget_indicatif, eligibility, deadline, status, id);

    logAudit(req.user.id, 'UPDATE_CALL', `Modification appel à projets #${id}`, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Candidatures Management
app.get('/api/candidatures', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { status, call_id, search } = req.query;
    let query = `
      SELECT c.*, cp.title as call_title, u.name as evaluator_name
      FROM candidatures c
      LEFT JOIN call_for_projects cp ON c.call_id = cp.id
      LEFT JOIN users u ON c.evaluator_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      query += ' AND c.status = ?';
      params.push(status);
    }
    if (call_id) {
      query += ' AND c.call_id = ?';
      params.push(call_id);
    }
    if (search) {
      query += ' AND (c.candidate_name LIKE ? OR c.project_title LIKE ? OR c.sector LIKE ? OR c.location LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    query += ' ORDER BY c.submitted_at DESC';

    const candidatures = db.prepare(query).all(...params);
    res.json(candidatures);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/candidatures/:id', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const cand = db.prepare(`
      SELECT c.*, cp.title as call_title, u.name as evaluator_name
      FROM candidatures c
      LEFT JOIN call_for_projects cp ON c.call_id = cp.id
      LEFT JOIN users u ON c.evaluator_id = u.id
      WHERE c.id = ?
    `).get(req.params.id);

    if (!cand) return res.status(404).json({ error: 'Candidature introuvable' });
    res.json(cand);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/candidatures/:id/status', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { status } = req.body;
    if (!['recu', 'en_evaluation', 'retenu', 'rejete'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }

    db.prepare(`
      UPDATE candidatures SET status = ? WHERE id = ?
    `).run(status, req.params.id);

    logAudit(req.user.id, 'UPDATE_CANDIDATURE_STATUS', `Candidature #${req.params.id} passée à "${status}"`, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/candidatures/:id/evaluate', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { evaluation_score, evaluation_notes, status } = req.body;
    const score = parseFloat(evaluation_score) || 0;

    db.prepare(`
      UPDATE candidatures SET
        evaluation_score = ?,
        evaluation_notes = ?,
        status = COALESCE(?, status),
        evaluator_id = ?,
        evaluated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(score, evaluation_notes || '', status || null, req.user.id, req.params.id);

    logAudit(req.user.id, 'EVALUATE_CANDIDATURE', `Évaluation candidature #${req.params.id} (Score: ${score}/5)`, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/candidatures/:id/notify', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { subject, message, new_status } = req.body;
    const cand = db.prepare('SELECT * FROM candidatures WHERE id = ?').get(req.params.id);

    if (!cand) return res.status(404).json({ error: 'Candidature introuvable' });

    if (new_status && ['recu', 'en_evaluation', 'retenu', 'rejete'].includes(new_status)) {
      db.prepare('UPDATE candidatures SET status = ? WHERE id = ?').run(new_status, cand.id);
    }

    logEmailAndNotify({
      recipient: cand.candidate_email,
      subject: subject || `Information relative à votre candidature : ${cand.project_title}`,
      body: `Bonjour ${cand.candidate_name},\n\n${message}\n\nCordialement,\nLe Comité de Sélection PK GLOBAL PARTNERS`,
      notifType: 'candidature',
      notifTitle: `Notification envoyée à ${cand.candidate_name}`,
      notifMessage: subject
    });

    logAudit(req.user.id, 'NOTIFY_CANDIDATE', `Email envoyé au candidat #${cand.id} (${cand.candidate_email})`, req);
    res.json({ success: true, message: 'Notification envoyée avec succès.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Excel Export: Candidatures
app.get('/api/candidatures/export/excel', authenticateToken, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const candidatures = db.prepare(`
      SELECT c.*, cp.title as call_title, u.name as evaluator_name
      FROM candidatures c
      LEFT JOIN call_for_projects cp ON c.call_id = cp.id
      LEFT JOIN users u ON c.evaluator_id = u.id
      ORDER BY c.submitted_at DESC
    `).all();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'PK GLOBAL PARTNERS';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Candidatures & Projets');

    // Title Block
    sheet.mergeCells('A1:J1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'PK GLOBAL PARTNERS - LISTE DES CANDIDATURES ET PROJETS';
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF064E3B' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 40;

    sheet.mergeCells('A2:J2');
    const dateCell = sheet.getCell('A2');
    dateCell.value = `Exporté le ${new Date().toLocaleDateString('fr-FR')} - Total : ${candidatures.length} candidatures`;
    dateCell.font = { name: 'Arial', size: 10, italic: true };
    dateCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Columns
    sheet.getRow(4).values = [
      'Réf ID', 'Candidat', 'Email', 'Téléphone', 'Titre du Projet',
      'Secteur', 'Montant Demandé', 'Statut', 'Note / 5', 'Date Soumission'
    ];
    sheet.getRow(4).height = 25;
    sheet.getRow(4).font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };

    candidatures.forEach(c => {
      const statusLabels = {
        recu: 'Reçu',
        en_evaluation: 'En évaluation',
        retenu: 'Retenu',
        rejete: 'Rejeté'
      };

      sheet.addRow([
        `#CAND-${c.id}`,
        c.candidate_name,
        c.candidate_email,
        c.candidate_phone,
        c.project_title,
        c.sector,
        `${Number(c.funding_requested).toLocaleString('fr-FR')} ${c.currency}`,
        statusLabels[c.status] || c.status,
        c.evaluation_score ? `${c.evaluation_score} / 5` : 'Non noté',
        c.submitted_at
      ]);
    });

    sheet.columns = [
      { width: 14 }, { width: 22 }, { width: 25 }, { width: 18 }, { width: 35 },
      { width: 20 }, { width: 20 }, { width: 16 }, { width: 14 }, { width: 20 }
    ];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Candidatures_PKGlobal.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generating Excel export:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// INVESTORS MANAGEMENT
// -------------------------------------------------------------

app.get('/api/investors', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { status, type, search } = req.query;
    let query = `
      SELECT inv.*,
        (SELECT COUNT(*) FROM investor_interests WHERE investor_id = inv.id) as interests_count,
        (SELECT SUM(amount_intended) FROM investor_interests WHERE investor_id = inv.id) as total_intended
      FROM investors inv
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      query += ' AND inv.status = ?';
      params.push(status);
    }
    if (type && type !== 'all') {
      query += ' AND inv.investor_type = ?';
      params.push(type);
    }
    if (search) {
      query += ' AND (inv.name LIKE ? OR inv.organization LIKE ? OR inv.country LIKE ? OR inv.sectors_of_interest LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    query += ' ORDER BY inv.created_at DESC';

    const investors = db.prepare(query).all(...params);
    res.json(investors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/investors/:id', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const investor = db.prepare('SELECT * FROM investors WHERE id = ?').get(req.params.id);
    if (!investor) return res.status(404).json({ error: 'Investisseur introuvable' });

    const interests = db.prepare(`
      SELECT ii.*, c.candidate_name, c.sector as candidate_sector
      FROM investor_interests ii
      LEFT JOIN candidatures c ON ii.candidature_id = c.id
      WHERE ii.investor_id = ?
      ORDER BY ii.created_at DESC
    `).all(investor.id);

    res.json({ ...investor, interests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/investors', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { name, organization, email, phone, country, investor_type, ticket_min, ticket_max, sectors_of_interest, status, notes } = req.body;
    if (!name || !organization || !email) {
      return res.status(400).json({ error: 'Nom, organisation et email requis' });
    }

    const result = db.prepare(`
      INSERT INTO investors (
        name, organization, email, phone, country,
        investor_type, ticket_min, ticket_max, sectors_of_interest, status, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      name, organization, email, phone || '', country || 'RDC',
      investor_type || 'Fonds d\'investissement',
      parseFloat(ticket_min) || 0,
      parseFloat(ticket_max) || 0,
      sectors_of_interest || '',
      status || 'valide',
      notes || ''
    );

    logAudit(req.user.id, 'CREATE_INVESTOR', `Ajout investisseur : ${name} (${organization})`, req);
    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/investors/:id', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { id } = req.params;
    const { name, organization, email, phone, country, investor_type, ticket_min, ticket_max, sectors_of_interest, status, notes } = req.body;

    db.prepare(`
      UPDATE investors SET
        name = COALESCE(?, name),
        organization = COALESCE(?, organization),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        country = COALESCE(?, country),
        investor_type = COALESCE(?, investor_type),
        ticket_min = COALESCE(?, ticket_min),
        ticket_max = COALESCE(?, ticket_max),
        sectors_of_interest = COALESCE(?, sectors_of_interest),
        status = COALESCE(?, status),
        notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(name, organization, email, phone, country, investor_type, ticket_min, ticket_max, sectors_of_interest, status, notes, id);

    logAudit(req.user.id, 'UPDATE_INVESTOR', `Mise à jour investisseur #${id}`, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/investors/:id/status', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { status } = req.body;
    if (!['en_attente', 'valide', 'desactive'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }

    db.prepare('UPDATE investors SET status = ? WHERE id = ?').run(status, req.params.id);
    logAudit(req.user.id, 'UPDATE_INVESTOR_STATUS', `Statut investisseur #${req.params.id} passé à ${status}`, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Link Investor to a project / Expression of Interest
app.post('/api/investors/:id/interests', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { candidature_id, project_title, amount_intended, stage, notes } = req.body;

    const result = db.prepare(`
      INSERT INTO investor_interests (investor_id, candidature_id, project_title, amount_intended, stage, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      req.params.id,
      candidature_id ? parseInt(candidature_id) : null,
      project_title || 'Projet non spécifié',
      parseFloat(amount_intended) || 0,
      stage || 'Premier contact',
      notes || ''
    );

    logAudit(req.user.id, 'ADD_INVESTOR_INTEREST', `Ajout opportunité financement investisseur #${req.params.id}`, req);
    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/investor-interests/:id', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { stage, amount_intended, notes } = req.body;
    db.prepare(`
      UPDATE investor_interests SET
        stage = COALESCE(?, stage),
        amount_intended = COALESCE(?, amount_intended),
        notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(stage, amount_intended, notes, req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Excel Export: Investors
app.get('/api/investors/export/excel', authenticateToken, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const investors = db.prepare(`
      SELECT inv.*,
        (SELECT COUNT(*) FROM investor_interests WHERE investor_id = inv.id) as deals_count,
        (SELECT SUM(amount_intended) FROM investor_interests WHERE investor_id = inv.id) as pipeline_amount
      FROM investors inv
      ORDER BY inv.created_at DESC
    `).all();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'PK GLOBAL PARTNERS';
    const sheet = workbook.addWorksheet('Investisseurs');

    sheet.mergeCells('A1:I1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'PK GLOBAL PARTNERS - RÉPERTOIRE DES INVESTISSEURS';
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF064E3B' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 40;

    sheet.getRow(3).values = [
      'ID', 'Nom du contact', 'Organisation', 'Type', 'Pays',
      'Ticket Min (USD)', 'Ticket Max (USD)', 'Secteurs d\'intérêt', 'Statut'
    ];
    sheet.getRow(3).height = 25;
    sheet.getRow(3).font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };

    investors.forEach(inv => {
      const statusLabels = { valide: 'Validé / Actif', en_attente: 'En attente', desactive: 'Désactivé' };
      sheet.addRow([
        inv.id,
        inv.name,
        inv.organization,
        inv.investor_type,
        inv.country,
        Number(inv.ticket_min).toLocaleString('fr-FR'),
        Number(inv.ticket_max).toLocaleString('fr-FR'),
        inv.sectors_of_interest,
        statusLabels[inv.status] || inv.status
      ]);
    });

    sheet.columns = [
      { width: 8 }, { width: 22 }, { width: 30 }, { width: 22 }, { width: 16 },
      { width: 18 }, { width: 18 }, { width: 35 }, { width: 18 }
    ];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Investisseurs_PKGlobal.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// COMMERCIAL INQUIRIES & CRM
// -------------------------------------------------------------

app.get('/api/inquiries', authenticateToken, (req, res) => {
  try {
    const isFilialeManager = req.user.role === 'filiale_manager';
    const { status, service, search } = req.query;

    let query = `
      SELECT inq.*, u.name as assigned_name
      FROM inquiries inq
      LEFT JOIN users u ON inq.assigned_to = u.id
      WHERE 1=1
    `;
    const params = [];

    // Filter for filiale manager
    if (isFilialeManager && req.user.filiale_code) {
      query += ` AND (LOWER(inq.service_requested) LIKE ? OR LOWER(inq.subject) LIKE ? OR LOWER(inq.message) LIKE ?)`;
      const code = `%${req.user.filiale_code}%`;
      params.push(code, code, code);
    }

    if (status && status !== 'all') {
      query += ' AND inq.status = ?';
      params.push(status);
    }
    if (service && service !== 'all') {
      query += ' AND inq.service_requested LIKE ?';
      params.push(`%${service}%`);
    }
    if (search) {
      query += ' AND (inq.name LIKE ? OR inq.organization LIKE ? OR inq.subject LIKE ? OR inq.reference LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    query += ' ORDER BY inq.created_at DESC';

    const inquiries = db.prepare(query).all(...params);
    res.json(inquiries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/inquiries/:id', authenticateToken, (req, res) => {
  try {
    const inq = db.prepare(`
      SELECT inq.*, u.name as assigned_name
      FROM inquiries inq
      LEFT JOIN users u ON inq.assigned_to = u.id
      WHERE inq.id = ?
    `).get(req.params.id);

    if (!inq) return res.status(404).json({ error: 'Demande introuvable' });
    res.json(inq);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/inquiries/:id/assign', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { assigned_to } = req.body;
    db.prepare("UPDATE inquiries SET assigned_to = ?, status = CASE WHEN status = 'nouveau' THEN 'en_cours' ELSE status END WHERE id = ?")
      .run(assigned_to ? parseInt(assigned_to) : null, req.params.id);

    logAudit(req.user.id, 'ASSIGN_INQUIRY', `Attribution demande #${req.params.id} à collaborateur #${assigned_to}`, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/inquiries/:id/status', authenticateToken, (req, res) => {
  try {
    const { status } = req.body;
    if (!['nouveau', 'en_cours', 'en_attente', 'resolu'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }

    db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, req.params.id);
    logAudit(req.user.id, 'UPDATE_INQUIRY_STATUS', `Demande #${req.params.id} passée à ${status}`, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inquiries/:id/respond', authenticateToken, (req, res) => {
  try {
    const { response_text, mark_resolved } = req.body;
    const inq = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(req.params.id);

    if (!inq) return res.status(404).json({ error: 'Demande introuvable' });
    if (!response_text) return res.status(400).json({ error: 'Le texte de réponse est requis' });

    const newStatus = mark_resolved ? 'resolu' : 'en_attente';

    db.prepare(`
      UPDATE inquiries SET
        response_text = ?,
        responded_at = CURRENT_TIMESTAMP,
        status = ?,
        assigned_to = COALESCE(assigned_to, ?)
      WHERE id = ?
    `).run(response_text, newStatus, req.user.id, inq.id);

    logEmailAndNotify({
      recipient: inq.email,
      subject: `Re: ${inq.subject} [Réf: ${inq.reference}]`,
      body: `Bonjour ${inq.name},\n\n${response_text}\n\nCordialement,\n${req.user.name}\nPK GLOBAL PARTNERS\nKinshasa & Goma, RDC`,
      notifType: 'inquiry',
      notifTitle: `Réponse envoyée pour ${inq.reference}`,
      notifMessage: `Destinataire : ${inq.email}`
    });

    logAudit(req.user.id, 'RESPOND_INQUIRY', `Réponse transmise au client (${inq.email})`, req);
    res.json({ success: true, message: 'Réponse transmise avec succès au prospect.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Excel Export: Commercial Inquiries
app.get('/api/inquiries/export/excel', authenticateToken, async (req, res) => {
  try {
    const inquiries = db.prepare(`
      SELECT inq.*, u.name as assigned_name
      FROM inquiries inq
      LEFT JOIN users u ON inq.assigned_to = u.id
      ORDER BY inq.created_at DESC
    `).all();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'PK GLOBAL PARTNERS';
    const sheet = workbook.addWorksheet('Demandes Commerciales');

    sheet.mergeCells('A1:I1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'PK GLOBAL PARTNERS - SUIVI DES DEMANDES COMMERCIALES & CONTACTS';
    titleCell.font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF064E3B' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 40;

    sheet.getRow(3).values = [
      'Référence', 'Prospect / Client', 'Organisation', 'Email', 'Téléphone',
      'Service Demandé', 'Objet', 'Statut', 'Assigné à'
    ];
    sheet.getRow(3).height = 25;
    sheet.getRow(3).font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };

    inquiries.forEach(inq => {
      const statusLabels = {
        nouveau: 'Nouveau',
        en_cours: 'En cours',
        en_attente: 'En attente client',
        resolu: 'Résolu / Clôturé'
      };

      sheet.addRow([
        inq.reference,
        inq.name,
        inq.organization || 'Particulier',
        inq.email,
        inq.phone || '-',
        inq.service_requested,
        inq.subject,
        statusLabels[inq.status] || inq.status,
        inq.assigned_name || 'Non attribué'
      ]);
    });

    sheet.columns = [
      { width: 16 }, { width: 22 }, { width: 25 }, { width: 25 }, { width: 18 },
      { width: 28 }, { width: 35 }, { width: 18 }, { width: 20 }
    ];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Demandes_Commerciales_PKGlobal.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// SUBSIDIARIES MANAGEMENT (FILIALES)
// -------------------------------------------------------------

app.get('/api/filiales', (req, res) => {
  try {
    const filiales = db.prepare(`
      SELECT f.*, u.name as manager_name, u.email as manager_email,
        (SELECT COUNT(*) FROM filiale_products WHERE filiale_id = f.id) as products_count,
        (SELECT COUNT(*) FROM filiale_projects WHERE filiale_id = f.id) as projects_count
      FROM filiales f
      LEFT JOIN users u ON f.manager_id = u.id
      ORDER BY f.id ASC
    `).all();

    res.json(filiales);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/filiales/:id', (req, res) => {
  try {
    const filiale = db.prepare(`
      SELECT f.*, u.name as manager_name, u.email as manager_email
      FROM filiales f
      LEFT JOIN users u ON f.manager_id = u.id
      WHERE f.id = ?
    `).get(req.params.id);

    if (!filiale) return res.status(404).json({ error: 'Filiale introuvable' });

    const products = db.prepare('SELECT * FROM filiale_products WHERE filiale_id = ? ORDER BY id ASC').all(filiale.id);
    const projects = db.prepare('SELECT * FROM filiale_projects WHERE filiale_id = ? ORDER BY id ASC').all(filiale.id);

    res.json({ ...filiale, products, projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/filiales', authenticateToken, requireRole('superadmin'), (req, res) => {
  try {
    const { name, code, slogan, description, sector, logo_url, cover_image_url, phone, email, locations, manager_id } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'Nom et code requis' });

    const result = db.prepare(`
      INSERT INTO filiales (code, name, slogan, description, sector, logo_url, cover_image_url, phone, email, locations, manager_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      code.toLowerCase().replace(/[^a-z0-9]/g, ''),
      name, slogan || '', description || '', sector || '',
      logo_url || '/logo.svg', cover_image_url || '', phone || '', email || '',
      locations || '', manager_id ? parseInt(manager_id) : null
    );

    logAudit(req.user.id, 'CREATE_FILIALE', `Création filiale : ${name}`, req);
    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/filiales/:id', authenticateToken, (req, res) => {
  try {
    const filialeId = parseInt(req.params.id);
    
    // Check permission: Superadmin and Admin can edit all, Filiale Manager can ONLY edit their own
    if (req.user.role === 'filiale_manager' && req.user.filiale_id !== filialeId) {
      return res.status(403).json({ error: 'Vous ne pouvez modifier que les informations de votre filiale.' });
    }

    const { name, slogan, description, sector, logo_url, cover_image_url, phone, email, locations, manager_id } = req.body;

    db.prepare(`
      UPDATE filiales SET
        name = COALESCE(?, name),
        slogan = COALESCE(?, slogan),
        description = COALESCE(?, description),
        sector = COALESCE(?, sector),
        logo_url = COALESCE(?, logo_url),
        cover_image_url = COALESCE(?, cover_image_url),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        locations = COALESCE(?, locations),
        manager_id = COALESCE(?, manager_id)
      WHERE id = ?
    `).run(name, slogan, description, sector, logo_url, cover_image_url, phone, email, locations, req.user.role === 'superadmin' ? manager_id : null, filialeId);

    logAudit(req.user.id, 'UPDATE_FILIALE', `Modification filiale #${filialeId}`, req);
    res.json({ success: true, message: 'Informations de la filiale mises à jour avec succès.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Products of Filiale
app.post('/api/filiales/:id/products', authenticateToken, (req, res) => {
  try {
    const filialeId = parseInt(req.params.id);
    if (req.user.role === 'filiale_manager' && req.user.filiale_id !== filialeId) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { name, category, description, price_indicative, image_url } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom du produit requis' });

    const result = db.prepare(`
      INSERT INTO filiale_products (filiale_id, name, category, description, price_indicative, image_url, is_featured)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(filialeId, name, category || 'Général', description || '', price_indicative || '', image_url || '');

    logAudit(req.user.id, 'ADD_PRODUCT', `Ajout produit "${name}" pour filiale #${filialeId}`, req);
    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/filiale-products/:id', authenticateToken, (req, res) => {
  try {
    const prod = db.prepare('SELECT * FROM filiale_products WHERE id = ?').get(req.params.id);
    if (!prod) return res.status(404).json({ error: 'Produit introuvable' });

    if (req.user.role === 'filiale_manager' && req.user.filiale_id !== prod.filiale_id) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { name, category, description, price_indicative, image_url, is_featured } = req.body;
    db.prepare(`
      UPDATE filiale_products SET
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        description = COALESCE(?, description),
        price_indicative = COALESCE(?, price_indicative),
        image_url = COALESCE(?, image_url),
        is_featured = COALESCE(?, is_featured)
      WHERE id = ?
    `).run(name, category, description, price_indicative, image_url, is_featured, prod.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/filiale-products/:id', authenticateToken, (req, res) => {
  try {
    const prod = db.prepare('SELECT * FROM filiale_products WHERE id = ?').get(req.params.id);
    if (!prod) return res.status(404).json({ error: 'Produit introuvable' });

    if (req.user.role === 'filiale_manager' && req.user.filiale_id !== prod.filiale_id) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    db.prepare('DELETE FROM filiale_products WHERE id = ?').run(prod.id);
    logAudit(req.user.id, 'DELETE_PRODUCT', `Suppression produit #${prod.id}`, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Projects & Realizations of Filiale
app.post('/api/filiales/:id/projects', authenticateToken, (req, res) => {
  try {
    const filialeId = parseInt(req.params.id);
    if (req.user.role === 'filiale_manager' && req.user.filiale_id !== filialeId) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { title, date_realization, location, description, status } = req.body;
    if (!title) return res.status(400).json({ error: 'Titre de la réalisation requis' });

    const result = db.prepare(`
      INSERT INTO filiale_projects (filiale_id, title, date_realization, location, description, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(filialeId, title, date_realization || '2026', location || 'RDC', description || '', status || 'Terminé');

    logAudit(req.user.id, 'ADD_FILIALE_PROJECT', `Ajout réalisation "${title}" filiale #${filialeId}`, req);
    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/filiale-projects/:id', authenticateToken, (req, res) => {
  try {
    const proj = db.prepare('SELECT * FROM filiale_projects WHERE id = ?').get(req.params.id);
    if (!proj) return res.status(404).json({ error: 'Réalisation introuvable' });

    if (req.user.role === 'filiale_manager' && req.user.filiale_id !== proj.filiale_id) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { title, date_realization, location, description, status } = req.body;
    db.prepare(`
      UPDATE filiale_projects SET
        title = COALESCE(?, title),
        date_realization = COALESCE(?, date_realization),
        location = COALESCE(?, location),
        description = COALESCE(?, description),
        status = COALESCE(?, status)
      WHERE id = ?
    `).run(title, date_realization, location, description, status, proj.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/filiale-projects/:id', authenticateToken, (req, res) => {
  try {
    const proj = db.prepare('SELECT * FROM filiale_projects WHERE id = ?').get(req.params.id);
    if (!proj) return res.status(404).json({ error: 'Réalisation introuvable' });

    if (req.user.role === 'filiale_manager' && req.user.filiale_id !== proj.filiale_id) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    db.prepare('DELETE FROM filiale_projects WHERE id = ?').run(proj.id);
    logAudit(req.user.id, 'DELETE_FILIALE_PROJECT', `Suppression réalisation #${proj.id}`, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// USER MANAGEMENT & RBAC
// -------------------------------------------------------------

app.get('/api/users', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.filiale_id, u.active, u.created_at, u.last_login,
        f.name as filiale_name
      FROM users u
      LEFT JOIN filiales f ON u.filiale_id = f.id
      ORDER BY u.id ASC
    `).all();

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', authenticateToken, requireRole('superadmin'), (req, res) => {
  try {
    const { name, email, password, role, filiale_id } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Nom, email, mot de passe et rôle requis' });
    }

    if (!['superadmin', 'admin', 'filiale_manager'].includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé.' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, filiale_id, active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `).run(name, email.trim().toLowerCase(), hash, role, filiale_id ? parseInt(filiale_id) : null);

    logAudit(req.user.id, 'CREATE_USER', `Création utilisateur : ${email} (${role})`, req);
    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', authenticateToken, requireRole('superadmin'), (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { name, email, password, role, filiale_id, active } = req.body;

    let passUpdate = '';
    const params = [name, email, role, filiale_id ? parseInt(filiale_id) : null, active !== undefined ? (active ? 1 : 0) : 1];

    if (password && password.trim().length >= 6) {
      passUpdate = ', password_hash = ?';
      params.push(bcrypt.hashSync(password, 10));
    }
    params.push(userId);

    db.prepare(`
      UPDATE users SET
        name = COALESCE(?, name),
        email = COALESCE(?, email),
        role = COALESCE(?, role),
        filiale_id = ?,
        active = COALESCE(?, active)
        ${passUpdate}
      WHERE id = ?
    `).run(...params);

    logAudit(req.user.id, 'UPDATE_USER', `Mise à jour utilisateur #${userId}`, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', authenticateToken, requireRole('superadmin'), (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    logAudit(req.user.id, 'DELETE_USER', `Suppression utilisateur #${targetId}`, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Audit Logs
app.get('/api/audit-logs', authenticateToken, requireRole('superadmin'), (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT al.*, u.name as user_name, u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC LIMIT 100
    `).all();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Notifications
app.get('/api/notifications', authenticateToken, (req, res) => {
  try {
    const notifs = db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 50').all();
    res.json(notifs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/:id/read', authenticateToken, (req, res) => {
  try {
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/read-all', authenticateToken, (req, res) => {
  try {
    db.prepare('UPDATE notifications SET read = 1').run();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Email Logs
app.get('/api/emails', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const emails = db.prepare('SELECT * FROM email_logs ORDER BY id DESC LIMIT 50').all();
    res.json(emails);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// PDF REPORT GENERATION (Livrable 8)
// -------------------------------------------------------------

// Global Platform Activity Report PDF
app.get('/api/reports/pdf/global', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Rapport_Activite_PKGlobal.pdf"');
    doc.pipe(res);

    // Header Banner
    doc.rect(0, 0, 595.28, 90).fill('#064e3b');

    doc.fillColor('#fbbf24').fontSize(22).font('Helvetica-Bold')
       .text('PK GLOBAL PARTNERS', 40, 25);
    doc.fillColor('#ffffff').fontSize(11).font('Helvetica')
       .text('RAPPORT D\'ACTIVITÉ DE LA PLATEFORME & BILAN OPÉRATIONNEL', 40, 52);

    doc.fillColor('#e2e8f0').fontSize(9)
       .text(`Généré le : ${new Date().toLocaleDateString('fr-FR')} | Émetteur : ${req.user.name}`, 320, 52, { align: 'right', width: 235 });

    doc.moveDown(3);

    // Section 1: KPIs
    const candCount = db.prepare('SELECT COUNT(*) as c FROM candidatures').get().c;
    const candApproved = db.prepare("SELECT COUNT(*) as c FROM candidatures WHERE status = 'retenu'").get().c;
    const invCount = db.prepare('SELECT COUNT(*) as c FROM investors').get().c;
    const inqCount = db.prepare('SELECT COUNT(*) as c FROM inquiries').get().c;
    const visitsCount = db.prepare('SELECT COUNT(*) as c FROM visitor_stats').get().c;

    doc.fillColor('#064e3b').fontSize(14).font('Helvetica-Bold')
       .text('1. INDICATEURS CLÉS DE PERFORMANCE (KPIs)', 40, 115);
    doc.rect(40, 133, 515, 2).fill('#fbbf24');

    doc.fontSize(10).font('Helvetica').fillColor('#1e293b');
    
    // Draw 4 KPI cards
    const kpiY = 145;
    const cardW = 120;
    const cardH = 55;
    const cards = [
      { label: 'Visiteurs cumulés', val: String(visitsCount) },
      { label: 'Candidatures reçues', val: `${candCount} (${candApproved} retenus)` },
      { label: 'Investisseurs actifs', val: String(invCount) },
      { label: 'Demandes traitées', val: String(inqCount) }
    ];

    cards.forEach((c, idx) => {
      const x = 40 + idx * (cardW + 11.5);
      doc.rect(x, kpiY, cardW, cardH).fillAndStroke('#f0fdf4', '#059669');
      doc.fillColor('#064e3b').fontSize(16).font('Helvetica-Bold')
         .text(c.val, x + 5, kpiY + 12, { width: cardW - 10, align: 'center' });
      doc.fillColor('#475569').fontSize(8).font('Helvetica')
         .text(c.label, x + 5, kpiY + 35, { width: cardW - 10, align: 'center' });
    });

    // Section 2: Filiales Performance
    doc.fillColor('#064e3b').fontSize(14).font('Helvetica-Bold')
       .text('2. ÉCOSYSTÈME DES FILIALES DU GROUPE', 40, 220);
    doc.rect(40, 238, 515, 2).fill('#fbbf24');

    const filiales = db.prepare(`
      SELECT f.*, u.name as mgr,
        (SELECT COUNT(*) FROM filiale_products WHERE filiale_id = f.id) as p_count,
        (SELECT COUNT(*) FROM filiale_projects WHERE filiale_id = f.id) as prj_count
      FROM filiales f LEFT JOIN users u ON f.manager_id = u.id
    `).all();

    let curY = 250;
    filiales.forEach(f => {
      doc.rect(40, curY, 515, 45).fillAndStroke('#f8fafc', '#cbd5e1');
      doc.fillColor('#064e3b').fontSize(11).font('Helvetica-Bold')
         .text(`${f.name} - ${f.slogan}`, 50, curY + 8);
      doc.fillColor('#334155').fontSize(9).font('Helvetica')
         .text(`Secteur : ${f.sector} | Responsable : ${f.mgr || 'Non assigné'} | Implantations : ${f.locations}`, 50, curY + 22);
      doc.fillColor('#059669').fontSize(9).font('Helvetica-Bold')
         .text(`Catalogue : ${f.p_count} produits phares | Réalisations : ${f.prj_count} projets`, 50, curY + 34);
      curY += 52;
    });

    // Section 3: Projets Lauréats & Pipeline
    doc.fillColor('#064e3b').fontSize(14).font('Helvetica-Bold')
       .text('3. APPEL À PROJETS & PIPELINE DES CANDIDATURES', 40, curY + 15);
    doc.rect(40, curY + 33, 515, 2).fill('#fbbf24');

    const candidatures = db.prepare(`
      SELECT * FROM candidatures ORDER BY submitted_at DESC LIMIT 5
    `).all();

    curY += 45;
    doc.rect(40, curY, 515, 18).fill('#059669');
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
       .text('Candidat', 45, curY + 5)
       .text('Projet', 150, curY + 5)
       .text('Secteur', 320, curY + 5)
       .text('Financement', 410, curY + 5)
       .text('Statut', 490, curY + 5);

    curY += 18;
    candidatures.forEach((c, idx) => {
      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(40, curY, 515, 20).fill(rowBg);
      doc.fillColor('#0f172a').fontSize(8).font('Helvetica')
         .text(c.candidate_name, 45, curY + 6, { width: 100, ellipsis: true })
         .text(c.project_title, 150, curY + 6, { width: 165, ellipsis: true })
         .text(c.sector, 320, curY + 6, { width: 85, ellipsis: true })
         .text(`${Number(c.funding_requested).toLocaleString('fr-FR')} ${c.currency}`, 410, curY + 6)
         .text(c.status.toUpperCase(), 490, curY + 6);
      curY += 20;
    });

    // Footer
    doc.rect(0, 800, 595.28, 42).fill('#064e3b');
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica')
       .text('PK GLOBAL PARTNERS SARL • République Démocratique du Congo • www.pkglobalpartners.com • info@pkglobalpartners.com', 40, 815, { align: 'center', width: 515 });

    doc.end();
  } catch (err) {
    console.error('Error generating PDF report:', err);
    res.status(500).json({ error: err.message });
  }
});

// Single Candidature Evaluation Sheet PDF
app.get('/api/reports/pdf/candidature/:id', authenticateToken, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const cand = db.prepare(`
      SELECT c.*, cp.title as call_title, u.name as eval_name
      FROM candidatures c
      LEFT JOIN call_for_projects cp ON c.call_id = cp.id
      LEFT JOIN users u ON c.evaluator_id = u.id
      WHERE c.id = ?
    `).get(req.params.id);

    if (!cand) return res.status(404).json({ error: 'Candidature introuvable' });

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Fiche_Evaluation_CAND_${cand.id}.pdf"`);
    doc.pipe(res);

    // Header
    doc.rect(0, 0, 595.28, 80).fill('#064e3b');
    doc.fillColor('#fbbf24').fontSize(18).font('Helvetica-Bold')
       .text('PK GLOBAL PARTNERS', 40, 20);
    doc.fillColor('#ffffff').fontSize(11).font('Helvetica')
       .text(`FICHE D'ÉVALUATION DE PROJET - DOSSIER #CAND-${cand.id}`, 40, 45);

    // Project Details Box
    doc.fillColor('#064e3b').fontSize(13).font('Helvetica-Bold').text('1. DÉTAILS DU PROJET ET CANDIDAT', 40, 100);
    doc.rect(40, 118, 515, 1).fill('#059669');

    let y = 130;
    const addField = (lbl, val) => {
      doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold').text(lbl, 45, y);
      doc.fillColor('#0f172a').fontSize(9).font('Helvetica').text(String(val || '-'), 180, y, { width: 370 });
      y += 18;
    };

    addField('Titre du projet :', cand.project_title);
    addField('Porteur de projet :', cand.candidate_name);
    addField('Email / Contact :', `${cand.candidate_email} | ${cand.candidate_phone}`);
    addField('Localisation :', cand.location);
    addField('Secteur d\'activité :', cand.sector);
    addField('Financement sollicité :', `${Number(cand.funding_requested).toLocaleString('fr-FR')} ${cand.currency}`);
    addField('Appel à projets lié :', cand.call_title || 'Candidature spontanée');
    addField('Statut actuel :', cand.status.toUpperCase());

    y += 10;
    doc.fillColor('#064e3b').fontSize(13).font('Helvetica-Bold').text('2. RÉSUMÉ OPÉRATIONNEL', 40, y);
    doc.rect(40, y + 18, 515, 1).fill('#059669');
    y += 28;

    doc.rect(40, y, 515, 80).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.fillColor('#1e293b').fontSize(9).font('Helvetica').text(cand.summary, 50, y + 10, { width: 495, lineGap: 3 });

    y += 95;
    doc.fillColor('#064e3b').fontSize(13).font('Helvetica-Bold').text('3. ÉVALUATION ET DÉLIBÉRATION DU COMITÉ', 40, y);
    doc.rect(40, y + 18, 515, 1).fill('#059669');
    y += 28;

    doc.rect(40, y, 515, 100).fillAndStroke('#ecfdf5', '#10b981');
    doc.fillColor('#064e3b').fontSize(16).font('Helvetica-Bold')
       .text(`NOTE ATTRIBUÉE : ${cand.evaluation_score ? cand.evaluation_score + ' / 5' : 'En attente de notation'}`, 55, y + 15);
    doc.fillColor('#334155').fontSize(9).font('Helvetica')
       .text(`Évaluateur référent : ${cand.eval_name || 'Comité consultatif'}`, 55, y + 38);
    doc.fillColor('#1e293b').fontSize(9).font('Helvetica-Oblique')
       .text(`Commentaires d'évaluation : "${cand.evaluation_notes || 'Aucun commentaire renseigné.'}"`, 55, y + 55, { width: 485 });

    // Footer
    doc.rect(0, 800, 595.28, 42).fill('#064e3b');
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica')
       .text('Document interne et confidentiel - PK GLOBAL PARTNERS SARL', 40, 815, { align: 'center', width: 515 });

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// BACKUP & RESTORE (Livrable 9)
// -------------------------------------------------------------

app.post('/api/backups/create', authenticateToken, requireRole('superadmin'), (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup_pkglobal_${timestamp}.sqlite`;
    const destPath = path.join(backupDir, backupName);

    // SQLite backup API
    db.backup(destPath)
      .then(() => {
        logAudit(req.user.id, 'CREATE_BACKUP', `Création sauvegarde : ${backupName}`, req);
        res.json({ success: true, message: 'Sauvegarde créée avec succès.', filename: backupName });
      })
      .catch(err => {
        res.status(500).json({ error: 'Erreur lors de la sauvegarde : ' + err.message });
      });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backups', authenticateToken, requireRole('superadmin'), (req, res) => {
  try {
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.sqlite'))
      .map(filename => {
        const stats = fs.statSync(path.join(backupDir, filename));
        return {
          filename,
          size_bytes: stats.size,
          size_formatted: `${(stats.size / 1024).toFixed(1)} KB`,
          created_at: stats.mtime
        };
      })
      .sort((a, b) => b.created_at - a.created_at);

    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backups/download/:filename', authenticateToken, requireRole('superadmin'), (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(backupDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier de sauvegarde introuvable.' });
    }

    res.download(filePath, filename);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backups/export-json', authenticateToken, requireRole('superadmin'), (req, res) => {
  try {
    const dump = {
      exported_at: new Date().toISOString(),
      exported_by: req.user.email,
      users: db.prepare('SELECT id, name, email, role, filiale_id, active, created_at FROM users').all(),
      site_content: db.prepare('SELECT * FROM site_content').all(),
      services: db.prepare('SELECT * FROM services_poles').all(),
      news: db.prepare('SELECT * FROM news').all(),
      calls: db.prepare('SELECT * FROM call_for_projects').all(),
      candidatures: db.prepare('SELECT * FROM candidatures').all(),
      investors: db.prepare('SELECT * FROM investors').all(),
      inquiries: db.prepare('SELECT * FROM inquiries').all(),
      filiales: db.prepare('SELECT * FROM filiales').all(),
      filiale_products: db.prepare('SELECT * FROM filiale_products').all(),
      filiale_projects: db.prepare('SELECT * FROM filiale_projects').all()
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="pkglobal_backup_data.json"');
    res.send(JSON.stringify(dump, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// SUPABASE BACKEND INTEGRATION & TOOLS
// -------------------------------------------------------------

const { getSupabaseConfig, testSupabaseConnection } = require('./supabase');

app.get('/api/supabase/status', (req, res) => {
  const config = getSupabaseConfig();
  res.json({
    configured: config.isConfigured,
    url: config.url || null,
    backend: config.isConfigured ? 'supabase' : 'sqlite_ready_for_supabase',
    schema_ready: true
  });
});

app.post('/api/supabase/test', async (req, res) => {
  try {
    const { url, key } = req.body;
    if (!url || !key) {
      return res.status(400).json({ error: 'URL Supabase et clé API requises.' });
    }
    const result = await testSupabaseConnection(url, key);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/supabase/schema', (req, res) => {
  const schemaPath = path.join(__dirname, 'supabase', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    res.download(schemaPath, 'schema_supabase_pkglobal.sql');
  } else {
    res.status(404).json({ error: 'Schéma introuvable' });
  }
});

app.get('/api/supabase/seed', (req, res) => {
  const seedPath = path.join(__dirname, 'supabase', 'seed-data.sql');
  if (fs.existsSync(seedPath)) {
    res.download(seedPath, 'seed_data_supabase_pkglobal.sql');
  } else {
    res.status(404).json({ error: 'Données introuvables' });
  }
});

// Fallback: send index.html for unknown web paths
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route non trouvée' });
  }
  if (req.path.startsWith('/admin')) {
    return res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
  }
  next();
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Une erreur interne est survenue.' });
});

// Start Server bound to 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` PK GLOBAL PARTNERS Administration & Public Platform`);
  console.log(` Running on: http://0.0.0.0:${PORT}`);
  console.log(` Admin Portal: http://0.0.0.0:${PORT}/admin`);
  console.log(`=======================================================`);
});

module.exports = app;
