const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'data', 'pkglobal.sqlite');
const db = new Database(dbPath);

// Enable WAL mode for performance & concurrency
db.pragma('journal_mode = WAL');

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('superadmin', 'admin', 'filiale_manager')),
      filiale_id INTEGER NULL,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );

    CREATE TABLE IF NOT EXISTS site_content (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER NULL
    );

    CREATE TABLE IF NOT EXISTS services_poles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      category TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      image_url TEXT,
      status TEXT DEFAULT 'published' CHECK(status IN ('published', 'draft')),
      published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      author_id INTEGER NULL
    );

    CREATE TABLE IF NOT EXISTS call_for_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT NOT NULL,
      target_sector TEXT NOT NULL,
      budget_indicatif TEXT NOT NULL,
      eligibility TEXT NOT NULL,
      deadline DATETIME NOT NULL,
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'closed', 'draft')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS candidatures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id INTEGER NULL,
      candidate_name TEXT NOT NULL,
      candidate_email TEXT NOT NULL,
      candidate_phone TEXT NOT NULL,
      project_title TEXT NOT NULL,
      sector TEXT NOT NULL,
      location TEXT NOT NULL,
      funding_requested REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      summary TEXT NOT NULL,
      details TEXT,
      document_url TEXT,
      document_name TEXT,
      status TEXT DEFAULT 'recu' CHECK(status IN ('recu', 'en_evaluation', 'retenu', 'rejete')),
      evaluation_score REAL DEFAULT 0,
      evaluation_notes TEXT,
      evaluator_id INTEGER NULL,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      evaluated_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS investors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      organization TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      country TEXT NOT NULL,
      investor_type TEXT NOT NULL,
      ticket_min REAL DEFAULT 0,
      ticket_max REAL DEFAULT 0,
      sectors_of_interest TEXT NOT NULL,
      status TEXT DEFAULT 'en_attente' CHECK(status IN ('en_attente', 'valide', 'desactive')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS investor_interests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      investor_id INTEGER NOT NULL,
      candidature_id INTEGER NULL,
      project_title TEXT NOT NULL,
      amount_intended REAL DEFAULT 0,
      stage TEXT DEFAULT 'Premier contact',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (investor_id) REFERENCES investors(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      organization TEXT,
      service_requested TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'nouveau' CHECK(status IN ('nouveau', 'en_cours', 'en_attente', 'resolu')),
      assigned_to INTEGER NULL,
      response_text TEXT,
      responded_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS filiales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      slogan TEXT NOT NULL,
      description TEXT NOT NULL,
      sector TEXT NOT NULL,
      logo_url TEXT,
      cover_image_url TEXT,
      phone TEXT,
      email TEXT,
      locations TEXT,
      manager_id INTEGER NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS filiale_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filiale_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      price_indicative TEXT,
      image_url TEXT,
      is_featured INTEGER DEFAULT 1,
      FOREIGN KEY (filiale_id) REFERENCES filiales(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS filiale_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filiale_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      date_realization TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT DEFAULT 'Terminé',
      FOREIGN KEY (filiale_id) REFERENCES filiales(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS visitor_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page TEXT NOT NULL,
      ip_hash TEXT,
      user_agent TEXT,
      referrer TEXT,
      visited_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      target_role TEXT NULL,
      read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NULL,
      action TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT DEFAULT 'sent',
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  secureSeededDemoAccounts();
  seedData();
}

// Revoke seeded demo credentials when a database is started without explicit
// local demo mode. Upgrade the seeded superadmin in place using server secrets.
function secureSeededDemoAccounts() {
  const useDemoAccounts = process.env.ALLOW_DEMO_USERS === 'true' && process.env.NODE_ENV !== 'production';
  if (useDemoAccounts) return;

  const email = (process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD || '';
  if (!email || email.endsWith('@example.com') || password.length < 12 || /replace-with/i.test(password)) {
    throw new Error('Set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD (minimum 12 characters), or explicitly enable ALLOW_DEMO_USERS=true for local development only.');
  }

  const demoAccounts = [
    ['superadmin@pkglobalpartners.com', 'AdminPKGlobal2026!'],
    ['admin@pkglobalpartners.com', 'AdminPKGlobal2026!'],
    ['frivia.manager@pkglobalpartners.com', 'ManagerPKGlobal2026!'],
    ['elikya.manager@pkglobalpartners.com', 'ManagerPKGlobal2026!'],
    ['youpi.manager@pkglobalpartners.com', 'ManagerPKGlobal2026!']
  ];
  const findUser = db.prepare('SELECT id, password_hash FROM users WHERE email = ?');
  const updateSuperadmin = db.prepare(`
    UPDATE users SET name = ?, email = ?, password_hash = ?, role = 'superadmin', active = 1
    WHERE id = ?
  `);
  const disableDemo = db.prepare('UPDATE users SET active = 0 WHERE id = ?');

  for (const [demoEmail, demoPassword] of demoAccounts) {
    const user = findUser.get(demoEmail);
    if (!user || !bcrypt.compareSync(demoPassword, user.password_hash)) continue;
    if (demoEmail === 'superadmin@pkglobalpartners.com') {
      const collision = findUser.get(email);
      if (collision && collision.id !== user.id) {
        throw new Error(`INITIAL_ADMIN_EMAIL ${email} is already assigned to a different account.`);
      }
      updateSuperadmin.run(
        process.env.INITIAL_ADMIN_NAME || 'Super Administrateur',
        email,
        bcrypt.hashSync(password, 12),
        user.id
      );
    } else {
      disableDemo.run(user.id);
    }
  }
}

function seedData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0) {
    return; // Already seeded
  }

  console.log('Seeding initial PK GLOBAL PARTNERS data...');

  // 1. Seed Filiales first so manager users can link to them
  const insertFiliale = db.prepare(`
    INSERT INTO filiales (code, name, slogan, description, sector, logo_url, cover_image_url, phone, email, locations)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const friviaId = insertFiliale.run(
    'frivia',
    'FRIVIA',
    'Tout simplement délicieux',
    'FRIVIA est une chaîne moderne de restauration rapide spécialisée dans les menus Frites & Viande, combinant rapidité, goût, hygiène et accessibilité avec des standards internationaux adaptés aux réalités locales.',
    'Restauration rapide & Fast-food',
    '/logo.svg',
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80',
    '+243 814 119 635',
    'frivia@pkglobalpartners.com',
    'Kinshasa & Goma, RDC'
  ).lastInsertRowid;

  const elikyaId = insertFiliale.run(
    'elikya',
    'ELIKYA COFFEE',
    'L\'espoir infusé dans chaque arôme',
    'ELIKYA COFFEE est la marque premium de café de PK GLOBAL PARTNERS, née du terroir exceptionnel du Kivu. Spécialisée dans la production, la transformation et la commercialisation de café Arabica et Robusta avec un impact social durable.',
    'Agroalimentaire & Café de Terroir',
    '/logo.svg',
    'https://images.unsplash.com/photo-1559056199-641a0ac8b3f4?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80',
    '+243 814 119 635',
    'elikya@pkglobalpartners.com',
    'Kivu, Goma & Kinshasa, RDC'
  ).lastInsertRowid;

  const youpiId = insertFiliale.run(
    'youpi',
    'YOUPI PÂTISSERIE',
    'Savourez la vie en douceur',
    'YOUPI PÂTISSERIE est une marque moderne de boulangerie-pâtisserie développée par PK GLOBAL PARTNERS, alliant qualité artisanale, constance professionnelle et accessibilité premium pour le consommateur urbain.',
    'Boulangerie & Pâtisserie Moderne',
    '/logo.svg',
    'https://images.unsplash.com/photo-1578985545062-69928b1d9587?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80',
    '+243 814 119 635',
    'youpi@pkglobalpartners.com',
    'Goma & Kinshasa, RDC'
  ).lastInsertRowid;

  // 2. Create administrator accounts. Production credentials are supplied out-of-band;
  // demo accounts are created only when ALLOW_DEMO_USERS=true outside production.
  const useDemoAccounts = process.env.ALLOW_DEMO_USERS === 'true' && process.env.NODE_ENV !== 'production';
  const initialAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD || '';
  if (!useDemoAccounts && (!initialAdminEmail || initialAdminEmail.endsWith('@example.com') || initialAdminPassword.length < 12 || /replace-with/i.test(initialAdminPassword))) {
    throw new Error('Set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD (minimum 12 characters), or explicitly enable ALLOW_DEMO_USERS=true for local development only.');
  }

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, filiale_id, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  const superAdminId = insertUser.run(
    useDemoAccounts ? 'Ferdinand Kabwe (Super Admin)' : (process.env.INITIAL_ADMIN_NAME || 'Super Administrateur'),
    useDemoAccounts ? 'superadmin@pkglobalpartners.com' : initialAdminEmail,
    bcrypt.hashSync(useDemoAccounts ? 'AdminPKGlobal2026!' : initialAdminPassword, 12),
    'superadmin',
    null
  ).lastInsertRowid;

  let adminId = superAdminId;
  let friviaMgrId = superAdminId;
  let elikyaMgrId = superAdminId;
  let youpiMgrId = superAdminId;

  if (useDemoAccounts) {
    const adminHash = bcrypt.hashSync('AdminPKGlobal2026!', 10);
    const managerHash = bcrypt.hashSync('ManagerPKGlobal2026!', 10);
    adminId = insertUser.run('Clarisse Mwamba (Administrateur)', 'admin@pkglobalpartners.com', adminHash, 'admin', null).lastInsertRowid;
    friviaMgrId = insertUser.run('Patrick Ilunga (Responsable FRIVIA)', 'frivia.manager@pkglobalpartners.com', managerHash, 'filiale_manager', friviaId).lastInsertRowid;
    elikyaMgrId = insertUser.run('Aimée Kasongo (Responsable ELIKYA COFFEE)', 'elikya.manager@pkglobalpartners.com', managerHash, 'filiale_manager', elikyaId).lastInsertRowid;
    youpiMgrId = insertUser.run('Jean-Luc Bakari (Responsable YOUPI)', 'youpi.manager@pkglobalpartners.com', managerHash, 'filiale_manager', youpiId).lastInsertRowid;

    // Seed demonstration managers only when local demo mode is explicitly enabled.
    db.prepare('UPDATE filiales SET manager_id = ? WHERE id = ?').run(friviaMgrId, friviaId);
    db.prepare('UPDATE filiales SET manager_id = ? WHERE id = ?').run(elikyaMgrId, elikyaId);
    db.prepare('UPDATE filiales SET manager_id = ? WHERE id = ?').run(youpiMgrId, youpiId);
  }

  // 3. Seed Site Content (CMS)
  const insertContent = db.prepare(`
    INSERT INTO site_content (key, value, updated_by)
    VALUES (?, ?, ?)
  `);

  insertContent.run('hero', JSON.stringify({
    title: "Transformer l'Afrique par l'Investissement d'Impact",
    subtitle: "PK GLOBAL PARTNERS est une holding stratégique dédiée à l'éclosion de champions nationaux et au développement de projets multisectoriels en République Démocratique du Congo.",
    cta_primary: "Investir avec nous",
    cta_secondary: "Découvrir nos filiales",
    badge: "Holding d'Investissement Panafricain • RDC"
  }), superAdminId);

  insertContent.run('presentation', JSON.stringify({
    headline: "Une holding structurée pour la performance durable",
    mission: "Identifier, structurer et accélérer les entreprises à fort potentiel de transformation économique et sociale en RDC et en Afrique centrale.",
    vision: "Bâtir un écosystème entrepreneurial d'excellence, créateur d'emplois durables et moteur d'autosuffisance sur les secteurs stratégiques.",
    values: [
      { title: "Excellence & Rigueur", desc: "Gouvernance transparente et standards de performance internationaux." },
      { title: "Impact & Durabilité", desc: "Investissements responsables alignés sur les principes ESG et la création de valeur locale." },
      { title: "Innovation Locale", desc: "Solutions pragmatiques adaptées aux réalités des marchés d'Afrique subsaharienne." },
      { title: "Partenariat Stratégique", desc: "Co-investissement et alliances avec institutions et fonds mondiaux." }
    ]
  }), superAdminId);

  insertContent.run('chiffres_cles', JSON.stringify({
    filiales_actives: 3,
    collaborateurs: "150+",
    capital_congo: "100%",
    secteurs_impact: 4,
    villes_implantation: "Kinshasa & Goma"
  }), superAdminId);

  insertContent.run('contact_info', JSON.stringify({
    phone: "+243 814 119 635",
    email_general: "info@pkglobalpartners.com",
    email_investors: "investors@pkglobalpartners.com",
    email_careers: "careers@pkglobalpartners.com",
    email_partnerships: "partnerships@pkglobalpartners.com",
    address_goma: "Avenue du Port, Centre d'Affaires, Goma, Nord-Kivu, RDC",
    address_kinshasa: "Boulevard du 30 Juin, Immeuble Horizon, Gombe, Kinshasa, RDC",
    social_linkedin: "https://linkedin.com",
    social_twitter: "https://twitter.com",
    social_facebook: "https://facebook.com",
    whatsapp: "+243814119635"
  }), superAdminId);

  // 4. Seed Services / Pôles
  const insertService = db.prepare(`
    INSERT INTO services_poles (title, category, description, icon, active, display_order)
    VALUES (?, ?, ?, ?, 1, ?)
  `);

  insertService.run(
    'Agroalimentaire & Transformation',
    'Pôle Industriel',
    'Valorisation locale de la production agricole congolaise, café d\'excellence du Kivu, restauration rapide structurée et boulangerie moderne.',
    'fa-utensils',
    1
  );
  insertService.run(
    'Investissement & Financement',
    'Pôle Financier',
    'Structuration de véhicules de co-investissement, capital développement pour PME émergentes et accompagnement de deals stratégiques.',
    'fa-chart-line',
    2
  );
  insertService.run(
    'Distribution & Logistique',
    'Pôle Opérationnel',
    'Maîtrise de la chaîne du froid, circuits de distribution urbains et raccordement des bassins de production aux grands centres de consommation.',
    'fa-truck-fast',
    3
  );
  insertService.run(
    'Conseil Stratégique & Incubation',
    'Pôle Accélération',
    'Due diligence, gouvernance d\'entreprise, passage à l\'échelle et mentorat pour les entrepreneurs lauréats des appels à projets.',
    'fa-lightbulb',
    4
  );

  // 5. Seed News & Articles
  const insertNews = db.prepare(`
    INSERT INTO news (title, slug, category, summary, content, image_url, status, published_at, author_id)
    VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?)
  `);

  insertNews.run(
    'PK Global Partners lance son programme d\'accélération 2026',
    'lancement-programme-acceleration-2026',
    'Actualité',
    'Un fonds d\'amorçage de 500 000 USD dédié aux PME agroalimentaires et logistiques en RDC.',
    'Dans le cadre de son plan stratégique triennal, PK GLOBAL PARTNERS officialise le lancement de son programme d\'accélération pour soutenir l\'émergence d\'entreprises congolaises à fort impact.',
    'https://images.unsplash.com/photo-1552664730-d307ca884978?ixlib=rb-1.2.1&auto=format&fit=crop&w=1200&q=80',
    '2026-10-15 10:00:00',
    superAdminId
  );

  insertNews.run(
    'ELIKYA COFFEE : Première expédition de café de spécialité vers l\'international',
    'elikya-coffee-exportation-kivu',
    'Événement',
    'Le café Arabica du Sud et Nord Kivu franchit une étape majeure dans son déploiement international.',
    'Récolté sur les terroirs volcaniques du Kivu en partenariat avec plus de 300 producteurs locaux, le premier lot de café grand cru ELIKYA a été officiellement conditionné et expédié.',
    'https://images.unsplash.com/photo-1559056199-641a0ac8b3f4?ixlib=rb-1.2.1&auto=format&fit=crop&w=1200&q=80',
    '2026-10-02 14:30:00',
    superAdminId
  );

  insertNews.run(
    'FRIVIA annonce l\'ouverture de deux nouveaux points de vente à Kinshasa',
    'frivia-expansion-kinshasa-2026',
    'Annonce',
    'L\'enseigne de restauration rapide poursuit son expansion dans les communes de Gombe et Lemba.',
    'Après le succès retentissant de ses premiers restaurants à Goma et Kinshasa, FRIVIA accélère son maillage urbain avec deux nouveaux comptoirs modernes conçus aux normes HACCP.',
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?ixlib=rb-1.2.1&auto=format&fit=crop&w=1200&q=80',
    '2026-09-20 09:15:00',
    adminId
  );

  // 6. Seed Calls for Projects
  const insertCall = db.prepare(`
    INSERT INTO call_for_projects (title, slug, description, target_sector, budget_indicatif, eligibility, deadline, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const call1Id = insertCall.run(
    'Appel à Projets 2026 : AgriTech & Transformation Agroalimentaire RDC',
    'appel-projets-agritech-2026',
    'Sélection et financement de 5 projets innovants dans la transformation locale des matières premières agricoles, la chaîne du froid et la distribution.',
    'Agroalimentaire & Chaîne de valeur',
    'Jusqu\'à 150 000 USD par lauréat',
    'Entreprises enregistrées en RDC, existence minimum de 1 an, impact social mesurable auprès des producteurs locaux.',
    '2026-12-15 23:59:59',
    'open'
  ).lastInsertRowid;

  const call2Id = insertCall.run(
    'Fonds Jeunes Entrepreneurs : Logistique du Dernier Kilomètre',
    'fonds-jeunes-logistique-dernier-km',
    'Soutien à la création de micro-hubs logistiques et flottes écologiques pour approvisionner les métropoles de Kinshasa et Goma.',
    'Transport & Logistique Verte',
    '50 000 USD par projet',
    'Équipes de jeunes entrepreneurs (18-35 ans), prototype ou service fonctionnel déjà testé.',
    '2026-11-30 23:59:59',
    'open'
  ).lastInsertRowid;

  const call3Id = insertCall.run(
    'Édition Clôturée 2025 : Énergies Renouvelables et Pompage Solaire',
    'energies-renouvelables-pompage-2025',
    'Programme d\'accès à l\'énergie pour les exploitations agricoles rurales.',
    'Énergie Renouvelable',
    '100 000 USD',
    'Startups et PME d\'électrification rurale',
    '2025-12-31 23:59:59',
    'closed'
  ).lastInsertRowid;

  // 7. Seed Candidatures (with realistic details, statuses, evaluation scores)
  const insertCandidature = db.prepare(`
    INSERT INTO candidatures (
      call_id, candidate_name, candidate_email, candidate_phone,
      project_title, sector, location, funding_requested, currency,
      summary, details, document_name, document_url, status,
      evaluation_score, evaluation_notes, evaluator_id, submitted_at, evaluated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertCandidature.run(
    call1Id,
    'Michel Mutombo',
    'm.mutombo@agrikivu.cd',
    '+243 821 554 901',
    'AgriKivu : Unité mobile de séchage et transformation de fruits séchés',
    'Agroalimentaire',
    'Goma & Masisi (Nord-Kivu)',
    85000,
    'USD',
    'Mise en place de 3 séchoirs solaires semi-industriels pour valoriser les excédents d\'ananas et mangues.',
    'Le projet vise à réduire de 40% les pertes post-récolte pour plus de 200 coopérateurs.',
    'business_plan_agrikivu.pdf',
    '/uploads/sample_agrikivu.pdf',
    'retenu',
    4.8,
    'Excellent dossier, rentabilité prouvée, fort impact direct sur les revenus des paysans.',
    adminId,
    '2026-10-05 11:20:00',
    '2026-10-18 16:45:00'
  );

  insertCandidature.run(
    call1Id,
    'Séphora Kalala',
    'sephora.kalala@kivubrew.cd',
    '+243 897 441 233',
    'Kivu Tea Artisans : Valorisation du thé bio des hauts plateaux',
    'Agroalimentaire',
    'Bukavu (Sud-Kivu)',
    60000,
    'USD',
    'Conditionnement et exportation d\'infusions et thés noirs et verts certifiés équitables.',
    'Partenariat établi avec 80 femmes cueilleuses. Distribution ciblée en épiceries fines.',
    'pitch_deck_kivutea.pdf',
    '/uploads/sample_kivutea.pdf',
    'en_evaluation',
    4.2,
    'Marché porteur, packaging attractif. Analyse financière en cours de validation.',
    adminId,
    '2026-10-12 14:10:00',
    '2026-10-22 10:30:00'
  );

  insertCandidature.run(
    call2Id,
    'David Mukendi',
    'david@kinshasafastdelivery.cd',
    '+243 998 123 456',
    'Kinshasa Cargo Moto : Flotte électrique de livraison urbaine',
    'Logistique & Mobilité',
    'Kinshasa',
    45000,
    'USD',
    'Réseau de 25 tricycles électriques avec stations d\'échange de batteries.',
    'Modèle d\'abonnement pour les commerçants des marchés centraux.',
    'business_model_kincargo.pdf',
    '/uploads/sample_kincargo.pdf',
    'en_evaluation',
    3.9,
    'Concept innovant pour Kinshasa, point de vigilance sur le coût des batteries de rechange.',
    adminId,
    '2026-10-18 09:40:00',
    '2026-10-24 15:15:00'
  );

  insertCandidature.run(
    call1Id,
    'Alain Bisimwa',
    'alain.bisimwa@farinedemanioc.com',
    '+243 813 778 990',
    'Farinov : Farine panifiable de manioc haute qualité (HQCF)',
    'Agroalimentaire',
    'Goma',
    120000,
    'USD',
    'Substitution progressive du blé d\'importation par la farine locale de manioc dans les boulangeries industrielles.',
    'Potentiel de synergie direct avec les unités YOUPI PÂTISSERIE du groupe PK Global.',
    'etude_faisabilite_farinov.pdf',
    '/uploads/sample_farinov.pdf',
    'recu',
    0,
    null,
    null,
    '2026-10-24 18:05:00',
    null
  );

  insertCandidature.run(
    call2Id,
    'Grace Ngalula',
    'grace.ngalula@coldhub.cd',
    '+243 854 221 009',
    'ColdChain Goma : Chambres froides solaires partagées au marché Birere',
    'Logistique & Chaîne de froid',
    'Goma',
    50000,
    'USD',
    'Stockage réfrigéré pay-as-you-store pour maraîchers et marchands de poissons.',
    'Capacité de 10 tonnes, alimentation 100% solaire.',
    'presentation_coldchain.pdf',
    '/uploads/sample_coldchain.pdf',
    'retenu',
    4.9,
    'Projet prioritaire d\'impact sanitaire et économique. Proposition d\'accompagnement immédiat.',
    superAdminId,
    '2026-10-08 08:30:00',
    '2026-10-19 14:00:00'
  );

  insertCandidature.run(
    call1Id,
    'Christian Tshibangu',
    'c.tshibangu@agrodistrib.cd',
    '+243 819 004 551',
    'Importation de volailles surgelées reconditionnées',
    'Commerce & Distribution',
    'Matadi & Kinshasa',
    180000,
    'USD',
    'Projet d\'importation de produits carnés depuis l\'Europe.',
    'Non aligné sur les critères d\'autosuffisance et de production locale.',
    'dossier_agrodistrib.pdf',
    '/uploads/sample_agrodistrib.pdf',
    'rejete',
    1.5,
    'Dossier non éligible : l\'appel à projets finance la transformation et valorisation locale, pas l\'importation.',
    adminId,
    '2026-09-28 16:00:00',
    '2026-10-04 11:15:00'
  );

  // 8. Seed Investors
  const insertInvestor = db.prepare(`
    INSERT INTO investors (
      name, organization, email, phone, country,
      investor_type, ticket_min, ticket_max, sectors_of_interest, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const inv1Id = insertInvestor.run(
    'Marc Vanderbeek',
    'Central Africa Impact Fund (CAIF)',
    'm.vanderbeek@caifund.eu',
    '+32 2 554 88 12',
    'Belgique',
    'Fonds d\'investissement',
    100000,
    1500000,
    'Agroalimentaire, Énergie renouvelable, Logistique',
    'valide',
    'Fonds institutionnel cherchant des champions régionaux en RDC. Déjà investi au Rwanda et Kenya.'
  ).lastInsertRowid;

  const inv2Id = insertInvestor.run(
    'Kofi Mensah',
    'Savannah Ventures Partners',
    'kofi@savannahvp.com',
    '+254 711 902 334',
    'Kenya',
    'Fonds d\'investissement',
    50000,
    500000,
    'AgriTech, Chaîne du froid, Retail urbain',
    'valide',
    'Intéressé par le modèle de franchise FRIVIA et l\'expansion ELIKYA Coffee.'
  ).lastInsertRowid;

  const inv3Id = insertInvestor.run(
    'Dr. Hélène Kanyinda',
    'Kanyinda Family Office',
    'helene@kanyinda-holdings.cd',
    '+243 818 900 112',
    'RDC',
    'Family Office',
    200000,
    2000000,
    'Agro-industrie, Immobilier logistique, Restauration',
    'valide',
    'Investisseur privé congolais de premier plan, fort ancrage à Kinshasa.'
  ).lastInsertRowid;

  const inv4Id = insertInvestor.run(
    'Thierry Dupont',
    'Diaspora Impact Angels Paris',
    'thierry.dupont@diaspora-angels.fr',
    '+33 6 12 34 56 78',
    'France',
    'Business Angel',
    25000,
    150000,
    'Agroalimentaire, Startups, Coffee Tech',
    'valide',
    'Réseau d\'entrepreneurs de la diaspora congolaise d\'Europe.'
  ).lastInsertRowid;

  const inv5Id = insertInvestor.run(
    'Aisha Patel',
    'Equator Capital Partners',
    'aisha.patel@equatorcap.co.za',
    '+27 11 884 5500',
    'Afrique du Sud',
    'Banque / Institution',
    500000,
    5000000,
    'Infrastructures légères, Logistique, Agroalimentaire',
    'en_attente',
    'Inscription récente sur le portail, profil en cours de vérification de conformité KYC.'
  ).lastInsertRowid;

  const inv6Id = insertInvestor.run(
    'Robert Mukuna',
    'Investissements Privés du Grand Katanga',
    'r.mukuna@katangacapital.cd',
    '+243 970 882 119',
    'RDC',
    'Business Angel',
    50000,
    300000,
    'Restauration rapide, Franchises',
    'valide',
    'Souhaite acquérir la master-franchise FRIVIA pour Lubumbashi et Kolwezi.'
  ).lastInsertRowid;

  // 9. Seed Investor Interests & Deal Pipeline
  const insertInterest = db.prepare(`
    INSERT INTO investor_interests (investor_id, candidature_id, project_title, amount_intended, stage, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertInterest.run(
    inv1Id,
    null,
    'Expansion usine de torréfaction ELIKYA COFFEE',
    350000,
    'Due Diligence',
    'Revue des états financiers et des contrats coopératives producteurs. Réunion prévue le 10 novembre.'
  );

  insertInterest.run(
    inv2Id,
    null,
    'Déploiement 10 nouveaux restaurants FRIVIA (Kinshasa & Lubumbashi)',
    250000,
    'Term Sheet',
    'Négociation des conditions d\'entrée au capital de la filiale FRIVIA SAS.'
  );

  insertInterest.run(
    inv3Id,
    1, // Linked to Michel Mutombo's AgriKivu
    'AgriKivu : Unité de séchage de fruits',
    85000,
    'Négociation',
    'Ticket de co-financement en dette convertible avec PK Global Partners.'
  );

  insertInterest.run(
    inv4Id,
    2, // Kivu Tea Artisans
    'Kivu Tea Artisans : Distribution Europe',
    40000,
    'Premier contact',
    'Présentation effectuée lors du webinaire investisseurs PK Global.'
  );

  // 10. Seed Commercial Inquiries (CRM / Contact requests)
  const insertInquiry = db.prepare(`
    INSERT INTO inquiries (
      reference, name, email, phone, organization,
      service_requested, subject, message, status,
      assigned_to, response_text, responded_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertInquiry.run(
    'DEM-2026-001',
    'Benoît Tshisekedi',
    'b.tshisekedi@hoteledelweiss.cd',
    '+243 815 442 110',
    'Hôtel Edelweiss Goma',
    'Agroalimentaire & ELIKYA COFFEE',
    'Approvisionnement régulier en café moulu ELIKYA et viennoiseries YOUPI',
    'Bonjour, nous souhaitons équiper les 65 chambres de notre complexe hôtelier en café de spécialité ELIKYA et signer un contrat pour le petit-déjeuner quotidien avec YOUPI Pâtisserie.',
    'en_cours',
    adminId,
    'Bonjour Monsieur Tshisekedi, nous avons bien pris en compte votre demande. Notre responsable B2B vous transmet la grille tarifaire grossiste sous 24h.',
    '2026-10-25 14:00:00',
    '2026-10-25 09:30:00'
  );

  insertInquiry.run(
    'DEM-2026-002',
    'Clarisse Ndeko',
    'c.ndeko@supermarchekin.cd',
    '+243 990 114 887',
    'Chaîne Supermarchés CityMart Kinshasa',
    'Distribution & Logistique',
    'Référencement des produits ELIKYA COFFEE et biscuits YOUPI',
    'Nous exploitons 8 supermarchés dans la capitale et souhaitons référencer en rayon la gamme complète de vos produits alimentaires congolais.',
    'nouveau',
    null,
    null,
    null,
    '2026-10-26 08:15:00'
  );

  insertInquiry.run(
    'DEM-2026-003',
    'Jonathan Kasongo',
    'j.kasongo@gmail.com',
    '+243 820 994 331',
    'Particulier / Candidat',
    'Carrières & Recrutement',
    'Candidature spontanée : Chef de cuisine / Responsable d\'unité de restauration',
    'Fort de 6 années d\'expérience en hôtellerie-restauration à Bruxelles et Kinshasa, je souhaite postuler pour la gestion d\'une unité FRIVIA.',
    'resolu',
    adminId,
    'Dossier transmis au service RH. Un entretien en visio a été planifié le 28 octobre.',
    '2026-10-24 16:30:00',
    '2026-10-23 11:00:00'
  );

  insertInquiry.run(
    'DEM-2026-004',
    'Marie-Ange Bolamba',
    'marie.bolamba@ong-afriquefuture.org',
    '+243 898 332 119',
    'ONG Afrique Future',
    'Partenariat & Impact',
    'Demande de partenariat filière café équitable Sud-Kivu',
    'Dans le cadre de notre projet d\'autonomisation des femmes rurales, nous souhaitons connecter deux coopératives avec ELIKYA COFFEE pour l\'achat garanti de leurs cerises de café.',
    'en_attente',
    elikyaMgrId,
    'Visite sur le terrain programmée la semaine prochaine avec l\'agronome référent.',
    '2026-10-22 10:15:00',
    '2026-10-21 15:45:00'
  );

  insertInquiry.run(
    'DEM-2026-005',
    'Christian Mbaya',
    'cm.invest@orange.cd',
    '+243 811 002 994',
    'Mbaya Ventures',
    'Investissement & Financement',
    'Demande d\'informations sur les modalités de co-investissement PK Global',
    'Nous disposons d\'une enveloppe de 100k USD et souhaitons participer au prochain tour de table syndiqué.',
    'resolu',
    superAdminId,
    'Brochure investisseurs et accord de confidentialité NDA transmis.',
    '2026-10-20 18:00:00',
    '2026-10-20 09:20:00'
  );

  // 11. Seed Filiale Products
  const insertProduct = db.prepare(`
    INSERT INTO filiale_products (filiale_id, name, category, description, price_indicative, image_url, is_featured)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  // FRIVIA Products
  insertProduct.run(
    friviaId,
    'FRIVIA BOX',
    'Formules Menu',
    'Menu complet Frites fraîches locales croustillantes + Viande grillée marinée façon Kivu + Sauce signature + Boisson.',
    '8.00 USD',
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80'
  );
  insertProduct.run(
    friviaId,
    'FRIVIA GRILL',
    'Grillades Premium',
    'Brochettes de bœuf sélectionné, poulet fumé aux épices locales et travers de porc braisés au feu de bois.',
    '12.00 USD',
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80'
  );
  insertProduct.run(
    friviaId,
    'FRIVIA BURGER',
    'Burgers Artisanaux',
    'Pain brioché artisanal YOUPI, steak haché 100% bœuf congolais, fromage de Goma fondu, oignons caramélisés.',
    '7.50 USD',
    'https://images.unsplash.com/photo-1550547660-d9450f859349?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80'
  );
  insertProduct.run(
    friviaId,
    'FRIVIA FAMILY PACK',
    'Packs Partage',
    'Assortiment familial pour 4 à 6 personnes avec viandes assorties, grandes frites, sauces et accompagnements.',
    '28.00 USD',
    'https://images.unsplash.com/photo-1561758033-d89a9ad46330?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80'
  );

  // ELIKYA COFFEE Products
  insertProduct.run(
    elikyaId,
    'Café Moulu Kivu Arabica Grand Cru (250g / 500g)',
    'Café Moulu',
    'Arabica Bourbon cultivé entre 1500m et 2000m d\'altitude au bord du lac Kivu. Notes de chocolat noir, agrumes et jasmin.',
    '6.50 USD',
    'https://images.unsplash.com/photo-1559056199-641a0ac8b3f4?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80'
  );
  insertProduct.run(
    elikyaId,
    'Café Instantané Soluble Gold (100g / 200g)',
    'Café Soluble',
    'Café instantané lyophilisé haute solubilité, préservant la richesse aromatique pour la consommation rapide quotidienne.',
    '4.50 USD',
    'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80'
  );
  insertProduct.run(
    elikyaId,
    'Café en Grains Robusta Sélection Terroir (1kg)',
    'Café en Grains',
    'Robusta corsé et onctueux, torréfaction artisanale idéale pour machines espresso professionnelles et bars d\'hôtels.',
    '15.00 USD',
    'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80'
  );

  // YOUPI Products
  insertProduct.run(
    youpiId,
    'YOUPI Baguette Dorée Tradition',
    'Boulangerie',
    'Baguette à croûte dorée croustillante et mie alvéolée fondante, pétrie et cuite plusieurs fois par jour.',
    '0.60 USD',
    'https://images.unsplash.com/photo-1509440159596-0249088772ff?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80'
  );
  insertProduct.run(
    youpiId,
    'YOUPI Cookies Signature (Trio Chocolat, Cacahuète, Coco)',
    'Biscuiterie',
    'Cookies moelleux généreusement garnis de pépites de chocolat et cacahuètes grillées locales.',
    '1.20 USD',
    'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80'
  );
  insertProduct.run(
    youpiId,
    'Croissants & Pains au Chocolat Pur Beurre',
    'Viennoiserie',
    'Feuilletage artisanal croustillant au beurre de qualité, référence des petits déjeuners raffinés.',
    '1.00 USD',
    'https://images.unsplash.com/photo-1555507036-ab1f4038808a?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80'
  );

  // 12. Seed Filiale Projects & Realizations
  const insertFilialeProject = db.prepare(`
    INSERT INTO filiale_projects (filiale_id, title, date_realization, location, description, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertFilialeProject.run(
    friviaId,
    'Inauguration Restaurant Flagship Boulevard Kanyamuhanga',
    'Septembre 2026',
    'Goma',
    'Ouverture d\'un restaurant spacieux de 80 places assises avec service drive et borne de commande rapide.',
    'Terminé'
  );
  insertFilialeProject.run(
    friviaId,
    'Déploiement Système HACCP et Hygiène Certifiée',
    'Août 2026',
    'Kinshasa & Goma',
    'Certification des protocoles de conservation et de sécurité sanitaire pour toutes les équipes de cuisine.',
    'Terminé'
  );
  insertFilialeProject.run(
    elikyaId,
    'Partenariat avec la Coopérative Caféière SOPACDI',
    'Juillet 2026',
    'Minova / Sud-Kivu',
    'Signature d\'un contrat d\'achat direct avec prime équitable pour 350 familles de producteurs de café.',
    'Terminé'
  );
  insertFilialeProject.run(
    elikyaId,
    'Installation de la nouvelle ligne de conditionnement sous vide',
    'En cours',
    'Goma',
    'Modernisation de l\'unité de mise en sachet pour préserver la fraîcheur aromatique jusqu\'à 18 mois.',
    'En cours'
  );
  insertFilialeProject.run(
    youpiId,
    'Lancement du service livraison d\'entreprises "YOUPI Corporate"',
    'Octobre 2026',
    'Goma',
    'Abonnements de petits déjeuners et pauses-café livrés chaque matin aux institutions et banques partenaires.',
    'Terminé'
  );

  // 13. Seed Visitor Statistics (for the last 30 days to render beautiful analytics)
  const insertVisit = db.prepare(`
    INSERT INTO visitor_stats (page, ip_hash, user_agent, referrer, visited_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const pages = ['accueil', 'about', 'filiales', 'investors', 'careers', 'contact'];
  const referrers = ['google.cd', 'linkedin.com', 'direct', 'facebook.com', 'twitter.com'];

  // Generate ~450 visits spread across the last 30 days
  const now = new Date();
  for (let d = 29; d >= 0; d--) {
    const dayDate = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    // 12 to 25 visits per day
    const visitsCount = 12 + Math.floor(Math.sin(d) * 5) + (d % 3) * 4;
    for (let v = 0; v < visitsCount; v++) {
      const page = pages[Math.floor(Math.random() * pages.length)];
      const ref = referrers[Math.floor(Math.random() * referrers.length)];
      const hour = 8 + Math.floor(Math.random() * 12);
      const min = Math.floor(Math.random() * 60);
      const timestamp = new Date(dayDate);
      timestamp.setHours(hour, min, 0, 0);
      const iso = timestamp.toISOString().replace('T', ' ').substring(0, 19);

      insertVisit.run(page, `anon-${Math.floor(Math.random() * 80)}`, 'Mozilla/5.0', ref, iso);
    }
  }

  // 14. Seed Notifications
  const insertNotification = db.prepare(`
    INSERT INTO notifications (type, title, message, target_role, read, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `);

  insertNotification.run(
    'candidature',
    'Nouvelle candidature reçue',
    'Alain Bisimwa a soumis le projet "Farinov : Farine panifiable de manioc".',
    'admin',
    '2026-10-24 18:05:00'
  );
  insertNotification.run(
    'investor',
    'Nouvel investisseur inscrit',
    'Aisha Patel (Equator Capital Partners) a créé un profil investisseur (Ticket: 500k$ - 5M$).',
    'admin',
    '2026-10-23 15:20:00'
  );
  insertNotification.run(
    'inquiry',
    'Demande commerciale reçue',
    'CityMart Kinshasa demande le référencement des produits ELIKYA & YOUPI.',
    'admin',
    '2026-10-26 08:15:00'
  );
  insertNotification.run(
    'evaluation',
    'Évaluation finalisée',
    'Le projet "ColdChain Goma" a été retenu avec une note de 4.9 / 5.',
    'superadmin',
    '2026-10-19 14:00:00'
  );

  // 15. Seed Audit Logs
  const insertAudit = db.prepare(`
    INSERT INTO audit_logs (user_id, action, details, ip, created_at)
    VALUES (?, ?, ?, '127.0.0.1', ?)
  `);

  insertAudit.run(superAdminId, 'INITIALIZE_PLATFORM', 'Initialisation du système et configuration de base PK Global', '2026-10-01 08:00:00');
  insertAudit.run(adminId, 'EVALUATION_PROJECT', 'Validation de la candidature AgriKivu (Note: 4.8/5)', '2026-10-18 16:45:00');
  insertAudit.run(friviaMgrId, 'UPDATE_FILIALE', 'Mise à jour des produits phares FRIVIA', '2026-10-22 11:20:00');

  console.log('PK GLOBAL PARTNERS database initialized and seeded successfully!');
}

module.exports = {
  db,
  initializeDatabase
};
